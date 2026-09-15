import type { Request } from 'express';
import { prisma } from '../../../core/db.js';
import { badRequest } from '../../../core/errors.js';
import { DEFAULTS, SPECS, SPEC_BY_KEY, invalidateConfig, parseSetting } from '../../../core/runtime-config.js';
import { planLockState, type PlanLockState } from '../../../core/plan-structure.js';
import * as audit from '../audit/audit.service.js';
import { allowed, assertValidRules } from '../../../core/ip-allowlist.js';
import { invalidatePublicConfig } from '../../config/config.service.js';
import { invalidateBranding } from '../../branding/branding.service.js';
import { notifyAdmins } from '../../../core/notify.js';

/**
 * DB-backed runtime configuration. Values here override the boot defaults at
 * read time, so business rules can be tuned without a redeploy.
 *
 * The rules themselves live in `core/runtime-config.ts` — this module is just
 * the console's read/write face onto them. Saving invalidates the config cache
 * so the change is live on the very next request.
 */

export { DEFAULTS };

export interface SettingRow {
  key: string;
  value: string;
  isDefault: boolean;
  default: string | null;
  group: string;
  label: string;
  help: string;
  type: string;
  enforcedIn: string;
  min?: number;
  max?: number;
  options?: string[];
  /** Present only on lockable settings. Null once the door has closed. */
  lock?: PlanLockState;
}

export async function all(): Promise<SettingRow[]> {
  const [rows, lock] = await Promise.all([prisma.setting.findMany(), planLockState()]);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  // Driven by the spec list, not by whatever happens to be in the table, so a
  // key can never appear in the console without a declared meaning.
  return SPECS.map((spec) => ({
    key: spec.key,
    value: stored[spec.key] ?? DEFAULTS[spec.key] ?? '',
    isDefault: !(spec.key in stored),
    default: DEFAULTS[spec.key] ?? null,
    group: spec.group,
    label: spec.label,
    help: spec.help,
    type: spec.type,
    enforcedIn: spec.enforcedIn,
    ...(spec.min !== undefined ? { min: spec.min } : {}),
    ...(spec.max !== undefined ? { max: spec.max } : {}),
    ...(spec.options ? { options: spec.options } : {}),
    ...(spec.lockable ? { lock } : {}),
  }));
}

export async function get(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key];
}

export async function set(adminId: string, key: string, rawValue: string, req?: Request) {
  const spec = SPEC_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown setting: ${key}`);

  /* The lock lives here, not in the console. A disabled control is a courtesy;
     this is the thing that actually holds when someone posts to the endpoint
     directly. Re-saving the value already in force is allowed — that is a
     no-op, and refusing it would only be confusing. */
  if (spec.lockable) {
    const lock = await planLockState();
    const current = (await prisma.setting.findUnique({ where: { key } }))?.value ?? DEFAULTS[key];
    if (lock.locked && rawValue.trim().toUpperCase() !== current) {
      throw badRequest(`${spec.label} is locked. ${lock.reason}`);
    }
  }

  // Validated against the spec — a typo cannot reach the money math.
  const value = parseSetting(key, rawValue);

  /**
   * The allowlist gets an extra check the spec cannot express: the operator
   * saving it has to still be able to reach the console afterwards.
   *
   * Without this, one typo in a CIDR range locks every operator out of the only
   * screen that could undo it, and the fix is a manual database edit.
   */
  if (key === 'ADMIN_IP_ALLOWLIST') {
    let rules: string[];
    try {
      rules = assertValidRules(value);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : 'Invalid allowlist');
    }
    if (rules.length && !allowed(req?.ip, rules)) {
      throw badRequest(
        `That list does not include your own address (${req?.ip ?? 'unknown'}), so saving it would lock you out. Add your address first.`,
      );
    }
  }

  const before = await prisma.setting.findUnique({ where: { key } });
  const row = await prisma.setting.upsert({
    where: { key }, create: { key, value }, update: { value },
  });

  invalidateConfig();
  // The member app and public site read a cached copy of this — drop it, or an
  // operator changes a fee and members keep seeing the old one for a minute.
  invalidatePublicConfig();
  // Branding text lives in this same table, behind its own cache.
  invalidateBranding();

  await audit.record({
    adminId, action: 'SETTING_CHANGE', entityType: 'setting', entityId: key,
    summary: `${spec.label} (${key}): ${before?.value ?? DEFAULTS[key] ?? '(unset)'} → ${value} — takes effect in ${spec.enforcedIn}`,
    before: { value: before?.value ?? null }, after: { value }, req,
  });

  // Other operators need to know the compensation plan moved under them — a
  // withdrawal limit or ROI rate changing without notice is how two people end
  // up giving members contradictory answers.
  notifyAdmins({
    type: 'system.settings_changed',
    dedupeKey: `setting:${key}:${row.updatedAt.getTime()}`,
    title: `${spec.label} changed`,
    body: `${before?.value ?? DEFAULTS[key] ?? '(unset)'} → ${value}. Takes effect in ${spec.enforcedIn}.`,
    meta: { key, from: before?.value ?? null, to: value },
    exceptAdminId: adminId,
  });
  return row;
}

/** Restore a key to its boot default by removing the override. */
export async function reset(adminId: string, key: string, req?: Request) {
  const spec = SPEC_BY_KEY.get(key);
  if (!spec) throw new Error(`Unknown setting: ${key}`);

  // Reset is just another way to change the value, so it meets the same lock.
  if (spec.lockable) {
    const lock = await planLockState();
    if (lock.locked) throw badRequest(`${spec.label} is locked. ${lock.reason}`);
  }

  const before = await prisma.setting.findUnique({ where: { key } });
  if (before) await prisma.setting.delete({ where: { key } });

  invalidateConfig();
  // The member app and public site read a cached copy of this — drop it, or an
  // operator changes a fee and members keep seeing the old one for a minute.
  invalidatePublicConfig();
  // Branding text lives in this same table, behind its own cache.
  invalidateBranding();

  await audit.record({
    adminId, action: 'SETTING_CHANGE', entityType: 'setting', entityId: key,
    summary: `${spec.label} (${key}) reset to default ${DEFAULTS[key]}`,
    before: { value: before?.value ?? null }, after: { value: DEFAULTS[key] ?? null }, req,
  });
  return { key, value: DEFAULTS[key] ?? null };
}
