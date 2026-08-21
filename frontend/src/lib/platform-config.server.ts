import 'server-only';
import { DEPLOY_DEFAULTS, type PlatformConfig } from './platform-config';

/**
 * The published plan, fetched on the server for the public site.
 *
 * The marketing and legal pages used to read hardcoded constants. That meant an
 * operator changing the withdrawal fee left the terms of service stating the
 * old one — a legal document drifting from what the platform actually charges.
 *
 * Fetched rather than imported, and revalidated every minute, so the pages stay
 * static and fast but never more than a minute behind the console.
 *
 * If the API is unreachable at build or revalidate time the page still renders,
 * on the values this build shipped with. A plans page that 500s because the API
 * blinked is worse than one that is briefly a minute stale.
 */
const REVALIDATE_SECONDS = 60;

function apiOrigin(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  const port = process.env.API_PORT ?? '4000';
  return `http://localhost:${port}/api/v1`;
}

export async function getPlatformConfig(): Promise<PlatformConfig> {
  try {
    const res = await fetch(`${apiOrigin()}/config`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ['platform-config'] },
    });
    if (!res.ok) return DEPLOY_DEFAULTS;

    const body = (await res.json()) as { success: boolean; data: PlatformConfig };
    return body.data ?? DEPLOY_DEFAULTS;
  } catch {
    return DEPLOY_DEFAULTS;
  }
}

/** Formats a plan figure the way the site does — no cents on round numbers. */
export const planMoney = (n: number | string) => {
  const v = Number(n);
  return v.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

/**
 * The live config, reshaped into the shapes the pages already render.
 *
 * Adapters rather than rewriting eleven pages: the markup was right, only its
 * source was wrong. Keeping the shapes keeps the diff to the data.
 */
export async function getPlan() {
  const cfg = await getPlatformConfig();

  return {
    cfg,

    dailyReturnPercent: cfg.returns.dailyPercent,
    tradingDays: cfg.returns.tradingDaysLabel,
    capPassivePercent: cfg.returns.capPassivePercent,
    capActivePercent: cfg.returns.capActivePercent,

    packages: cfg.packages.map((p) => Number(p.amount)),

    withdraw: {
      feePercent: cfg.withdrawal.feePercent,
      taxPercent: cfg.withdrawal.taxPercent,
      min: cfg.withdrawal.minimum,
      max: cfg.withdrawal.maximum,
      slaHours: cfg.withdrawal.slaHours,
      network: cfg.withdrawal.network,
    },

    directBonus: cfg.directBonus.map((d) => ({ level: d.level, percent: Number(d.percent) })),

    /**
     * Thirty individual levels, collapsed back into the bands the plan is
     * published as. Contiguous levels sharing identical terms are one row —
     * which is how the compensation plan reads, and how a member thinks about
     * it. Derived rather than hardcoded, so retuning a level in the console
     * re-bands the published table automatically.
     */
    generationBands: bandGenerations(cfg.generationBonus),

    ranks: cfg.ranks.map((r) => ({
      name: r.name,
      self: Number(r.selfCapital),
      team: Number(r.teamBusiness),
      reward: Number(r.reward),
    })),

    roaming: {
      affiliate: cfg.roamingTiers
        .filter((t) => t.track === 'AFFILIATE')
        .map((t) => ({ destination: t.destination, self: Number(t.selfRequirement), team: Number(t.teamRequirement) })),
      selfCapitalist: cfg.roamingTiers
        .filter((t) => t.track !== 'AFFILIATE')
        .map((t) => ({ destination: t.destination, self: Number(t.selfRequirement), team: Number(t.teamRequirement) })),
    },
  };
}

interface GenerationLevel {
  level: number; percent: string; requiredDirects: number; requiredTeamVolume: string;
}

function bandGenerations(levels: GenerationLevel[]) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const bands: {
    levels: string; percent: number; directs: number; volume: number;
  }[] = [];

  for (const l of sorted) {
    const last = bands.at(-1);
    const same = last
      && last.percent === Number(l.percent)
      && last.directs === l.requiredDirects
      && last.volume === Number(l.requiredTeamVolume);

    if (same) {
      // Extend the range rather than adding a row.
      const [from] = last.levels.split(' – ');
      last.levels = `${from} – ${l.level}`;
    } else {
      bands.push({
        levels: String(l.level),
        percent: Number(l.percent),
        directs: l.requiredDirects,
        volume: Number(l.requiredTeamVolume),
      });
    }
  }
  return bands;
}