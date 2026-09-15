import { prisma } from './db.js';
import { env } from '../config/env.js';
import { badRequest } from './errors.js';
import { PLAN_STRUCTURE_CODES, isPlanStructure, PLAN_STRUCTURES } from './plan-structure.js';
import type { GatewaySwitches } from './gateway/switches.js';
import { payoutDays } from './payout-calendar.js';

/**
 * Runtime configuration — the business rules an operator is allowed to tune
 * without a deploy.
 *
 * The `.env` values are the floor: they are what the platform boots with and
 * what it falls back to when a key has never been overridden. A row in the
 * `settings` table takes precedence, and THAT is what every call site reads.
 *
 * Before this module existed the Settings screen wrote audited rows that
 * nothing consumed — the rules were read straight from `env` at process start.
 * Every key below now declares where it is enforced, and `enforcedIn` is
 * surfaced in the console so an operator can see what a change will affect.
 *
 * Reads are cached briefly. A change invalidates the cache immediately, so a
 * save is visible on the next request rather than up to the TTL later.
 */

export type SettingType = 'percent' | 'money' | 'int' | 'bool' | 'weekdays' | 'text' | 'enum' | 'email' | 'color';

export interface SettingSpec {
  key: string;
  group: 'Payouts' | 'Withdrawals' | 'Investments' | 'Compliance' | 'Security' | 'Platform' | 'Gateways' | 'Branding';
  label: string;
  help: string;
  type: SettingType;
  /**
   * Whether members and visitors may read this.
   *
   * Declared beside the setting rather than kept as a list somewhere else: the
   * public endpoint is derived from this flag, so a new setting is private
   * until someone decides otherwise, instead of leaking because a second list
   * was never updated.
   */
  public?: boolean;
  /** Where a change takes effect. Shown in the console. */
  enforcedIn: string;
  min?: number;
  max?: number;
  /** Allowed values, for `enum`. */
  options?: string[];
  /**
   * Whether this setting can stop being editable.
   *
   * Only the plan structure is lockable today. The lock itself is evaluated
   * against live data (see `planLockState`) rather than stored, so it cannot
   * drift out of step with the genealogy it is protecting.
   */
  lockable?: boolean;
}

export const SPECS: SettingSpec[] = [
  {
    key: 'DAILY_ROI_PERCENT', group: 'Payouts', type: 'percent', min: 0, max: 100, public: true,
    label: 'Default daily return',
    help: 'Applied to new packages that do not set their own rate. Existing packages keep the rate stored on the package.',
    enforcedIn: 'Package creation',
  },
  {
    key: 'TRADING_DAYS', group: 'Payouts', type: 'weekdays', public: true,
    label: 'Trading days',
    help: 'ISO weekdays that accrue the daily trade bonus. 1 = Monday … 7 = Sunday. Weekends never accrue by default.',
    enforcedIn: 'Daily ROI job',
  },
  {
    key: 'CAP_PASSIVE_PERCENT', group: 'Payouts', type: 'percent', min: 100, max: 1000, public: true,
    label: 'Passive earnings ceiling',
    help: 'Baseline ceiling as a percent of capital. A package may set its own ceiling, which wins for that package.',
    enforcedIn: 'Package purchase',
  },
  {
    key: 'CAP_ACTIVE_PERCENT', group: 'Payouts', type: 'percent', min: 100, max: 1000, public: true,
    label: 'Active affiliate ceiling',
    help: 'Ceiling for ACTIVE affiliates. The difference against the passive ceiling is added on top of the package ceiling.',
    enforcedIn: 'Package purchase',
  },

  {
    key: 'PLAN_STRUCTURE', group: 'Payouts', type: 'enum', public: true, lockable: true,
    options: PLAN_STRUCTURE_CODES,
    label: 'Compensation plan structure',
    help:
      'The genealogy the whole plan runs on. Unilevel pays by level down a tree of '
      + 'unlimited width; binary pays on the weaker of two legs. Can only be set '
      + 'before the first member joins under a sponsor — after that the tree exists '
      + 'and changing it would rewrite what people have earned.',
    enforcedIn: 'Registration and every commission run',
  },

  {
    key: 'BINARY_PERCENT', group: 'Payouts', type: 'percent', min: 0, max: 100, public: true,
    label: 'Binary matching bonus',
    help:
      'Percentage of the matched (weaker-leg) volume paid as the binary bonus. '
      + 'Only used while the plan structure is binary.',
    enforcedIn: 'Package purchase',
  },

  {
    key: 'WITHDRAW_FEE_PERCENT', group: 'Withdrawals', type: 'percent', min: 0, max: 50, public: true,
    label: 'Withdrawal fee',
    help: 'Deducted from the requested amount. The member receives the net.',
    enforcedIn: 'Withdrawal request',
  },
  {
    key: 'WITHDRAW_MIN', group: 'Withdrawals', type: 'money', min: 0, public: true,
    label: 'Minimum withdrawal',
    help: 'Requests below this are rejected before any balance moves.',
    enforcedIn: 'Withdrawal request',
  },
  {
    key: 'WITHDRAW_MAX', group: 'Withdrawals', type: 'money', min: 1, public: true,
    label: 'Maximum withdrawal',
    help: 'Per-request ceiling.',
    enforcedIn: 'Withdrawal request',
  },
  {
    key: 'WITHDRAW_SLA_HOURS', group: 'Withdrawals', type: 'int', min: 1, max: 720, public: true,
    label: 'Processing SLA',
    help: 'Hours an operator has to process a request before it is flagged overdue.',
    enforcedIn: 'Withdrawal request · Payouts queue',
  },
  {
    key: 'WITHDRAWAL_PAYOUT_DAYS', group: 'Withdrawals', type: 'text', public: true,
    label: 'Payout dates',
    help: 'Days of the month approved withdrawals are settled on, comma separated — "15,30" pays on the 15th and 30th. Requests can still be placed at any time; this only sets when they are paid. A day the month does not have is clamped to its last day, so "30" pays on the 28th in February. Leave empty to settle continuously, with the processing SLA running from the request instead.',
    enforcedIn: 'Withdrawal request · Payouts queue',
  },

  {
    key: 'WITHDRAWALS_OPEN', group: 'Withdrawals', type: 'bool', public: true,
    label: 'Withdrawals open',
    help: 'Turn off to stop accepting new withdrawal requests. Requests already in the queue are unaffected.',
    enforcedIn: 'Withdrawal request',
  },

  {
    key: 'MIN_INVESTMENT', group: 'Investments', type: 'money', min: 1, public: true,
    label: 'Minimum investment',
    help: 'Smallest price a package may be published at. Checked when a package is created or edited.',
    enforcedIn: 'Package create / edit',
  },

  {
    key: 'TAX_WITHHOLDING_PERCENT', group: 'Compliance', type: 'percent', min: 0, max: 50, public: true,
    label: 'Withholding tax',
    help: 'Deducted from every payout after the platform fee, and reported to the member in their annual summary. Set to 0 when the operator does not withhold — which is the default, because guessing a jurisdiction is worse than not deducting.',
    enforcedIn: 'Withdrawal request',
  },

  {
    key: 'KYC_REQUIRED_FOR_WITHDRAWAL', group: 'Compliance', type: 'bool', public: true,
    label: 'Require verified identity to withdraw',
    help: 'When on, a member must have an approved KYC submission before any withdrawal is accepted. Requests already in the queue are unaffected.',
    enforcedIn: 'Withdrawal request',
  },
  {
    key: 'KYC_REQUIRED_ABOVE', group: 'Compliance', type: 'money', min: 0, public: true,
    label: 'Verification threshold',
    help: 'Withdrawals at or below this amount skip the verification check. Set to 0 to require verification for every withdrawal.',
    enforcedIn: 'Withdrawal request',
  },

  {
    key: 'ADMIN_IDLE_TIMEOUT_MINUTES', group: 'Security', type: 'int', min: 0, max: 480,
    label: 'Console idle timeout',
    help: 'Signs an operator out after this many minutes without activity. A console left open on an unattended machine is one of the easiest ways in. Set to 0 to disable.',
    enforcedIn: 'Admin console',
  },
  {
    key: 'ADMIN_IP_ALLOWLIST', group: 'Security', type: 'text',
    label: 'Console IP allowlist',
    help: 'Comma-separated IPv4/IPv6 addresses or CIDR ranges. When set, the admin console only accepts requests from these. Leave empty to allow any address. Get this wrong and you lock yourself out — your current address is shown below the field.',
    enforcedIn: 'Admin console',
  },

  {
    key: 'ADJUSTMENT_APPROVAL_ABOVE', group: 'Security', type: 'money', min: 0,
    label: 'Second approval for adjustments above',
    help: 'A manual balance adjustment larger than this is held until a DIFFERENT operator approves it, and no money moves until they do. An adjustment is the one place value is created rather than moved, so a single compromised operator account should not be able to do it alone. Set to 0 to require a second approval for every adjustment, however small.',
    enforcedIn: 'Manual balance adjustment',
  },

  {
    key: 'REWARD_VESTING_MONTHS', group: 'Payouts', type: 'int', min: 0, max: 60,
    label: 'Rank reward instalments',
    help: 'Pay a rank reward in this many equal monthly parts, credited on the 1st. A $300 reward over 10 months credits $30 a month. Set to 0 to pay the whole reward at the moment the rank is achieved. Changing this never alters a schedule already running — a member who was promised ten payments still gets ten.',
    enforcedIn: 'Rank rewards, monthly vesting run',
  },

  {
    key: 'STEP_UP_TTL_MINUTES', group: 'Security', type: 'int', min: 1, max: 60,
    label: 'Step-up validity',
    help: 'How long a re-authentication stays good for. The member proves who they are once, then has this many minutes to change a payout address or submit a withdrawal without proving it again. Short is safer; too short and a member re-authenticates mid-flow.',
    enforcedIn: 'Payout address change, withdrawal request',
  },
  {
    key: 'STEP_UP_TOTP_ABOVE', group: 'Security', type: 'money', min: 0,
    label: 'Require an authenticator code above',
    help: 'Withdrawals at or below this amount may be confirmed with a password or device biometrics. Above it, the member must enter a code from their authenticator app. Set to 0 to demand a code for every withdrawal.',
    enforcedIn: 'Withdrawal request',
  },
  {
    key: 'WITHDRAWAL_ADDRESS_HOLD_HOURS', group: 'Withdrawals', type: 'int', min: 0, max: 168,
    label: 'Hold after a payout address change',
    help: 'Withdrawals are refused for this many hours after the payout address changes. This is the control that breaks the theft chain — change the address, then withdraw — because an attacker with a stolen phone cannot wait it out unnoticed. Set to 0 to disable, which is not recommended.',
    enforcedIn: 'Withdrawal request',
  },

  {
    key: 'MAINTENANCE_MODE', group: 'Platform', type: 'bool', public: true,
    label: 'Maintenance mode',
    help: 'Closes the member app while you work. Operators keep full access, background jobs keep running, and nothing already in flight is lost — members see a notice instead of a broken screen.',
    enforcedIn: 'Every member request',
  },
  {
    key: 'MAINTENANCE_MESSAGE', group: 'Platform', type: 'text', public: true,
    label: 'Maintenance notice',
    help: 'What members are shown while maintenance mode is on.',
    enforcedIn: 'Every member request',
  },

  {
    key: 'REGISTRATION_OPEN', group: 'Platform', type: 'bool', public: true,
    label: 'Registration open',
    help: 'Turn off to stop new sign-ups. Existing members can still sign in.',
    enforcedIn: 'Customer registration',
  },

  /**
   * Gateway switches.
   *
   * These can only ever turn a rail OFF. Credentials still come from the
   * environment, and a gateway with no key — or with its `*_ENABLED` variable
   * off — stays unavailable however these are set. That asymmetry is the point:
   * an operator needs to be able to stop a gateway in seconds, from a phone,
   * without a deploy; nobody should be able to switch one live from a console
   * session without the keys having been deliberately installed first.
   *
   * They default to on, so adding them changes nothing about a running
   * deployment until somebody decides otherwise.
   */
  {
    key: 'GATEWAY_NOWPAYMENTS_DEPOSITS', group: 'Gateways', type: 'bool',
    label: 'NOWPayments deposits',
    help: 'Turn off to stop offering NOWPayments at checkout. Invoices already raised stay payable and still credit when they confirm — this only stops new ones. Has no effect unless NOWPayments is configured in the environment.',
    enforcedIn: 'Member deposit · Checkout',
  },
  {
    key: 'GATEWAY_OXAPAY_DEPOSITS', group: 'Gateways', type: 'bool',
    label: 'OxaPay deposits',
    help: 'Turn off to stop offering OxaPay at checkout. Invoices already raised stay payable and still credit when they confirm — this only stops new ones. Has no effect unless OxaPay is configured in the environment.',
    enforcedIn: 'Member deposit · Checkout',
  },
  {
    key: 'GATEWAY_OXAPAY_PAYOUTS', group: 'Gateways', type: 'bool',
    label: 'OxaPay payouts',
    help: 'Turn off to stop sending approved withdrawals through OxaPay. Approvals continue and fall back to being paid by hand, so nothing is stranded — but nothing leaves automatically either. NOWPayments has no payout support in this platform, so there is no equivalent switch for it.',
    enforcedIn: 'Withdrawal approval',
  },

  /**
   * ── Branding ──────────────────────────────────────────────────────────
   * This platform is white-label: nothing about the brand is a build-time
   * constant. Every key here ships as a placeholder and is expected to be set
   * before launch, which is why the console shows an unmissable banner until
   * `BRAND_NAME` has been changed.
   *
   * All public, because every one of them is rendered to visitors who are not
   * logged in — the page title, the footer, the support link.
   *
   * The artwork is NOT here. Images cannot live in a string column, so they
   * are held in `branding_assets` and served by `core/brand-storage.ts`.
   */
  {
    key: 'BRAND_NAME', group: 'Branding', type: 'text', public: true,
    label: 'Brand name',
    help: 'The wordmark, used in the page title, the header, emails and legal copy. Keep it short — it sits next to the logo in a fixed-width sidebar.',
    enforcedIn: 'Every page, and outgoing email',
  },
  {
    key: 'BRAND_TAGLINE', group: 'Branding', type: 'text', public: true,
    label: 'Tagline',
    help: 'One short line under the wordmark on the public site, and the subtitle in search results and social cards.',
    enforcedIn: 'Public site · Page metadata',
  },
  {
    key: 'BRAND_LEGAL_NAME', group: 'Branding', type: 'text', public: true,
    label: 'Registered company name',
    help: 'The full legal entity, as it should appear in the terms, the privacy policy and email footers. Usually longer than the brand name.',
    enforcedIn: 'Legal pages · Email footers',
  },
  {
    key: 'SUPPORT_EMAIL', group: 'Branding', type: 'email', public: true,
    label: 'Support email',
    help: 'Shown on the contact page and in the footer, and used as the reply-to on outgoing mail. Members will write to this address, so it has to be one somebody reads.',
    enforcedIn: 'Contact page · Footer · Outgoing email',
  },
  {
    key: 'SUPPORT_URL', group: 'Branding', type: 'text', public: true,
    label: 'Help centre link',
    help: 'Optional. A link to an external helpdesk or knowledge base. Leave empty to show only the email address.',
    enforcedIn: 'Contact page · Footer',
  },
  {
    key: 'BRAND_PRIMARY_COLOR', group: 'Branding', type: 'color', public: true,
    label: 'Accent colour',
    help: 'The single accent used for primary buttons, links, focus rings and the leading chart series. Pick something that holds contrast on both the dark and light themes — it is used on both.',
    enforcedIn: 'Theme · Every surface',
  },
];

export const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]));

/** Boot defaults, from `.env` (itself defaulted in config/env.ts). */
export const DEFAULTS: Record<string, string> = {
  PLAN_STRUCTURE: 'UNILEVEL',
  BINARY_PERCENT: '10',
  DAILY_ROI_PERCENT: String(env.DAILY_ROI_PERCENT),
  TRADING_DAYS: env.TRADING_DAYS,
  CAP_PASSIVE_PERCENT: String(env.CAP_PASSIVE_PERCENT),
  CAP_ACTIVE_PERCENT: String(env.CAP_ACTIVE_PERCENT),
  WITHDRAW_FEE_PERCENT: String(env.WITHDRAW_FEE_PERCENT),
  WITHDRAW_MIN: String(env.WITHDRAW_MIN),
  WITHDRAW_MAX: String(env.WITHDRAW_MAX),
  WITHDRAW_SLA_HOURS: '48',
  // The terms settle withdrawals fortnightly; requests stay open 24/7.
  WITHDRAWAL_PAYOUT_DAYS: '15,30',
  MIN_INVESTMENT: '50',
  TAX_WITHHOLDING_PERCENT: '0',
  KYC_REQUIRED_FOR_WITHDRAWAL: 'true',
  KYC_REQUIRED_ABOVE: '0',
  ADJUSTMENT_APPROVAL_ABOVE: '1000',
  REWARD_VESTING_MONTHS: '0',
  STEP_UP_TTL_MINUTES: '5',
  STEP_UP_TOTP_ABOVE: '1000',
  WITHDRAWAL_ADDRESS_HOLD_HOURS: '24',
  ADMIN_IDLE_TIMEOUT_MINUTES: '30',
  ADMIN_IP_ALLOWLIST: '',
  MAINTENANCE_MODE: 'false',
  MAINTENANCE_MESSAGE: 'We are carrying out scheduled maintenance and will be back shortly. Your balances and investments are unaffected.',
  REGISTRATION_OPEN: 'true',
  WITHDRAWALS_OPEN: 'true',
  // On by default: these exist to take a rail out of service, so adding them
  // must not change the behaviour of a deployment that never touches them.
  GATEWAY_NOWPAYMENTS_DEPOSITS: 'true',
  GATEWAY_OXAPAY_DEPOSITS: 'true',
  GATEWAY_OXAPAY_PAYOUTS: 'true',

  /* Placeholders on purpose — see the Branding specs above. `brandingUnset()`
     reports whether these are still in force so the console can say so.

     SUPPORT_EMAIL is the exception: it seeds to a syntactically valid address
     rather than "TBD" because it is rendered into `mailto:` hrefs. A malformed
     value there produces a link that silently does nothing, which is worse than
     one that is visibly a placeholder. */
  BRAND_NAME: 'TBD',
  BRAND_TAGLINE: 'TBD',
  BRAND_LEGAL_NAME: 'TBD',
  SUPPORT_EMAIL: 'support@example.com',
  SUPPORT_URL: '',
  BRAND_PRIMARY_COLOR: '#FF7A1A',
};

/** The placeholder values, so "still unset" is defined in exactly one place. */
export const BRANDING_PLACEHOLDERS: Record<string, string> = {
  BRAND_NAME: 'TBD',
  BRAND_TAGLINE: 'TBD',
  BRAND_LEGAL_NAME: 'TBD',
  SUPPORT_EMAIL: 'support@example.com',
};

export interface RuntimeConfig {
  planStructure: 'UNILEVEL' | 'BINARY';
  binaryPercent: number;
  dailyRoiPercent: number;
  tradingDays: number[];
  capPassivePercent: number;
  capActivePercent: number;
  withdrawFeePercent: number;
  withdrawMin: number;
  withdrawMax: number;
  withdrawSlaHours: number;
  /** Days of the month approved withdrawals settle on. Empty = continuous. */
  withdrawalPayoutDays: number[];
  minInvestment: number;
  taxWithholdingPercent: number;
  kycRequiredForWithdrawal: boolean;
  kycRequiredAbove: number;
  adjustmentApprovalAbove: number;
  rewardVestingMonths: number;
  stepUpTtlMinutes: number;
  stepUpTotpAbove: number;
  withdrawalAddressHoldHours: number;
  adminIdleTimeoutMinutes: number;
  adminIpAllowlist: string[];
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationOpen: boolean;
  withdrawalsOpen: boolean;
  /**
   * Operator switches for the payment rails.
   *
   * Grouped rather than loose so they can be passed as one value to the
   * gateway modules, which stay synchronous and environment-driven — see
   * `GatewaySwitches` in core/gateway/switches.ts.
   */
  gateways: GatewaySwitches;
  /**
   * The operator's identity. Text only — artwork lives in `branding_assets`
   * and is resolved by the branding service, which has to hit a second table.
   */
  branding: {
    name: string;
    tagline: string;
    legalName: string;
    supportEmail: string;
    supportUrl: string | null;
    primaryColor: string;
    /** Whether the wordmark is still the shipped placeholder. */
    unset: boolean;
    /** Setting keys still sitting on their shipped placeholder. */
    placeholders: string[];
  };
}

/**
 * Validate a value against its spec. Rejecting bad input here is what keeps a
 * typo out of the money math — a fee of "banana" must never reach a payout.
 */
export function parseSetting(key: string, raw: string): string {
  const spec = SPEC_BY_KEY.get(key);
  if (!spec) throw badRequest(`Unknown setting: ${key}`);
  const value = raw.trim();

  switch (spec.type) {
    case 'bool': {
      const v = value.toLowerCase();
      if (v !== 'true' && v !== 'false') throw badRequest(`${spec.label} must be true or false`);
      return v;
    }
    case 'weekdays': {
      const days = value.split(',').map((d) => Number(d.trim()));
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
        throw badRequest(`${spec.label} must be ISO weekday numbers 1–7, comma separated`);
      }
      return [...new Set(days)].sort().join(',');
    }
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw badRequest(`${spec.label} must be a whole number`);
      if (spec.min !== undefined && n < spec.min) throw badRequest(`${spec.label} cannot be below ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) throw badRequest(`${spec.label} cannot be above ${spec.max}`);
      return String(n);
    }
    case 'enum': {
      const allowed = spec.options ?? [];
      const picked = value.toUpperCase();
      if (!allowed.includes(picked)) {
        throw badRequest(`${spec.label} must be one of: ${allowed.join(', ')}`);
      }
      // A structure the payout engine cannot run must not be selectable, or the
      // console would promise commissions that never get paid.
      if (spec.key === 'PLAN_STRUCTURE' && !PLAN_STRUCTURES[picked as 'UNILEVEL' | 'BINARY'].implemented) {
        throw badRequest(
          `${PLAN_STRUCTURES[picked as 'UNILEVEL' | 'BINARY'].label} is not available yet — `
          + 'the payout engine does not implement it.',
        );
      }
      return picked;
    }
    case 'text': {
      if (value.length > 500) throw badRequest(`${spec.label} cannot be longer than 500 characters`);
      return value;
    }
    /**
     * Branding values are rendered into `mailto:` hrefs and CSS custom
     * properties, so an unvalidated one does not fail loudly — it produces a
     * dead link or a theme that silently falls back. Both are the kind of
     * fault an operator discovers from a member, which is too late.
     */
    case 'email': {
      // Deliberately permissive: the goal is to catch a typo or a pasted
      // sentence, not to adjudicate RFC 5322. Anything that gets past this is
      // a real address shape, and delivery proves the rest.
      if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) {
        throw badRequest(`${spec.label} must be a valid email address`);
      }
      if (value.length > 254) throw badRequest(`${spec.label} is too long to be a real address`);
      return value.toLowerCase();
    }
    case 'color': {
      const hex = value.startsWith('#') ? value : `#${value}`;
      if (!/^#([0-9a-fA-F]{6})$/.test(hex)) {
        throw badRequest(`${spec.label} must be a six-digit hex colour, such as #FF7A1A`);
      }
      return hex.toUpperCase();
    }
    case 'percent':
    case 'money': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw badRequest(`${spec.label} must be a number`);
      if (spec.min !== undefined && n < spec.min) throw badRequest(`${spec.label} cannot be below ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) throw badRequest(`${spec.label} cannot be above ${spec.max}`);
      return String(n);
    }
  }
}

interface Cached { at: number; value: RuntimeConfig }
let cache: Cached | null = null;
const TTL_MS = 15_000;

/** Drop the cache so the next read reflects a change immediately. */
export const invalidateConfig = () => { cache = null; };

function build(stored: Record<string, string>): RuntimeConfig {
  const v = (k: string) => stored[k] ?? DEFAULTS[k]!;
  const num = (k: string) => Number(v(k));
  const bool = (k: string) => v(k) === 'true';

  const cfg: RuntimeConfig = {
    // A corrupt or unknown value must never leave the engine guessing which
    // plan it is paying — fall back to the structure the engine can run.
    planStructure: isPlanStructure(v('PLAN_STRUCTURE')) ? v('PLAN_STRUCTURE') as 'UNILEVEL' | 'BINARY' : 'UNILEVEL',
    binaryPercent: num('BINARY_PERCENT'),
    dailyRoiPercent: num('DAILY_ROI_PERCENT'),
    tradingDays: v('TRADING_DAYS').split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 7),
    capPassivePercent: num('CAP_PASSIVE_PERCENT'),
    capActivePercent: num('CAP_ACTIVE_PERCENT'),
    withdrawFeePercent: num('WITHDRAW_FEE_PERCENT'),
    withdrawMin: num('WITHDRAW_MIN'),
    withdrawMax: num('WITHDRAW_MAX'),
    withdrawSlaHours: num('WITHDRAW_SLA_HOURS'),
    withdrawalPayoutDays: payoutDays(v('WITHDRAWAL_PAYOUT_DAYS')),
    minInvestment: num('MIN_INVESTMENT'),
    taxWithholdingPercent: num('TAX_WITHHOLDING_PERCENT'),
    kycRequiredForWithdrawal: bool('KYC_REQUIRED_FOR_WITHDRAWAL'),
    kycRequiredAbove: num('KYC_REQUIRED_ABOVE'),
    adjustmentApprovalAbove: num('ADJUSTMENT_APPROVAL_ABOVE'),
    rewardVestingMonths: num('REWARD_VESTING_MONTHS'),
    stepUpTtlMinutes: num('STEP_UP_TTL_MINUTES'),
    stepUpTotpAbove: num('STEP_UP_TOTP_ABOVE'),
    withdrawalAddressHoldHours: num('WITHDRAWAL_ADDRESS_HOLD_HOURS'),
    adminIdleTimeoutMinutes: num('ADMIN_IDLE_TIMEOUT_MINUTES'),
    adminIpAllowlist: v('ADMIN_IP_ALLOWLIST').split(',').map((x) => x.trim()).filter(Boolean),
    maintenanceMode: bool('MAINTENANCE_MODE'),
    maintenanceMessage: v('MAINTENANCE_MESSAGE'),
    registrationOpen: bool('REGISTRATION_OPEN'),
    withdrawalsOpen: bool('WITHDRAWALS_OPEN'),
    gateways: {
      nowpaymentsDeposits: bool('GATEWAY_NOWPAYMENTS_DEPOSITS'),
      oxapayDeposits: bool('GATEWAY_OXAPAY_DEPOSITS'),
      oxapayPayouts: bool('GATEWAY_OXAPAY_PAYOUTS'),
    },
    branding: {
      name: v('BRAND_NAME'),
      tagline: v('BRAND_TAGLINE'),
      legalName: v('BRAND_LEGAL_NAME'),
      supportEmail: v('SUPPORT_EMAIL'),
      supportUrl: v('SUPPORT_URL') || null,
      primaryColor: v('BRAND_PRIMARY_COLOR'),
      /* The wordmark is the one field nothing can sensibly fall back to, so it
         alone decides whether the brand counts as configured. Drives the
         console banner — shipping is a bad moment to notice it still says TBD. */
      unset: v('BRAND_NAME') === BRANDING_PLACEHOLDERS.BRAND_NAME,
      /* Every field still sitting on its shipped placeholder.
         A bare boolean told an operator that "something" was unconfigured and
         left them to hunt for it; this lets the console name the fields. A
         tagline left at its default is a deliberate choice an operator is
         allowed to make, so it is listed here but does not raise `unset`. */
      placeholders: Object.entries(BRANDING_PLACEHOLDERS)
        .filter(([k, placeholder]) => v(k) === placeholder)
        .map(([k]) => k),
    },
  };

  // A corrupt row must never silently disable payouts.
  if (!cfg.tradingDays.length) cfg.tradingDays = env.tradingDays;
  return cfg;
}

/** The live rules. Cheap to call — cached, and invalidated on every change. */
export async function config(): Promise<RuntimeConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let stored: Record<string, string> = {};
  try {
    const rows = await prisma.setting.findMany();
    stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    // Never let a settings read take the platform down — fall back to boot values.
  }

  const value = build(stored);
  cache = { at: Date.now(), value };
  return value;
}
