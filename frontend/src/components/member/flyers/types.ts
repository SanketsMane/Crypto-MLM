/**
 * Flyers Club — presentation model.
 *
 * Everything here is *derived* from the `/roaming-club` payload (the API path
 * is unchanged; only the programme's name is). No threshold,
 * no qualification rule and no locked/unlocked decision is made in the UI:
 * `achieved` comes from the server, and the percentages are the same ratio the
 * page has always drawn (actual ÷ requirement, capped at 100).
 */

/** One row exactly as `GET /roaming-club` returns it. */
export interface Tier {
  track: string;
  destination: string;
  /**
   * What the member actually receives.
   *
   * Not every offer is a trip any more — two of the three are cash funds — so
   * the headline alone no longer says what is being won, and a page that shows
   * only the destination would promise a holiday for a car fund.
   */
  rewardLabel: string | null;
  rewardValue: string | null;
  selfRequirement: string;
  teamRequirement: string;
  selfActual: string;
  teamActual: string;
  /** The campaign window. Both null means the offer always runs. */
  validFrom: string | null;
  validUntil: string | null;
  /** Decided by the server, which is also what gates the award itself. */
  open: boolean;
  expired: boolean;
  upcoming: boolean;
  achieved: boolean;
  achievedAt: string | null;
  status: string | null;
}

export interface TierView extends Tier {
  /** self capital progress, 0–100 */
  selfPct: number;
  /** team business progress, 0–100 — 100 when the track carries no team gate */
  teamPct: number;
  /** how far the *gating* requirement has come — you qualify only once both land */
  overallPct: number;
  /** AFFILIATE tiers are the only ones with a team business gate */
  needsTeam: boolean;
  /**
   * Whether a self-capital gate exists at all.
   *
   * The offers qualify on team business alone, so their self requirement is
   * zero — and `ratio` treats a zero requirement as already met. Drawing that
   * as a full "Self capital" bar would tell a member they had cleared a
   * condition that was never set.
   */
  needsSelf: boolean;
}

const n = (v: string | number | null | undefined) => Number(v ?? 0);

/**
 * "closes 10 October", or null where the offer has no window.
 *
 * A closing date is material — it is the difference between a target worth
 * chasing and one already gone — so it is rendered from the server's dates
 * rather than left implicit.
 */
export function windowLabel(t: Tier): string | null {
  if (t.expired && t.validUntil) {
    return `closed ${fmtDate(t.validUntil)}`;
  }
  if (t.upcoming && t.validFrom) return `opens ${fmtDate(t.validFrom)}`;
  if (t.validUntil) return `closes ${fmtDate(t.validUntil)}`;
  return null;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** actual ÷ requirement as a capped percentage; a zero requirement is already met */
export const ratio = (actual: string | number, required: string | number): number => {
  const need = n(required);
  return need > 0 ? Math.min(100, (n(actual) / need) * 100) : 100;
};

export function toView(t: Tier): TierView {
  const needsTeam = t.track === 'AFFILIATE' && n(t.teamRequirement) > 0;
  const needsSelf = n(t.selfRequirement) > 0;
  const selfPct = ratio(t.selfActual, t.selfRequirement);
  const teamPct = ratio(t.teamActual, t.teamRequirement);

  /* Only the gates that exist count toward progress. An offer qualifying on
     team business alone is as far along as its team bar — averaging in a
     self bar that was never required would report it as further along than
     it is, and on a zero requirement `ratio` returns 100. */
  const gates = [
    ...(needsSelf ? [selfPct] : []),
    ...(needsTeam ? [teamPct] : []),
  ];

  return {
    ...t,
    selfPct,
    teamPct,
    needsTeam,
    needsSelf,
    // every gate must land, so you are only as far along as the weakest one
    overallPct: gates.length > 0 ? Math.min(...gates) : 100,
  };
}

/**
 * The destination the member can realistically reach next: the unqualified tier
 * that sits closest to its own requirements. Ties break toward the cheaper tier.
 */
export function nextReward(tiers: TierView[]): TierView | null {
  const open = tiers.filter((t) => !t.achieved);
  if (open.length === 0) return null;
  return open.reduce((best, t) =>
    t.overallPct > best.overallPct
      ? t
      : t.overallPct === best.overallPct && n(t.selfRequirement) < n(best.selfRequirement)
        ? t
        : best,
  );
}

export type StopState = 'done' | 'current' | 'locked';

export interface JourneyStop {
  destination: string;
  state: StopState;
  /** cheapest self capital route to this destination across the tracks shown */
  fromSelf: number;
}

/**
 * The journey rail: one stop per destination, in the order the API sends the
 * tiers. A destination counts as reached once *any* track has awarded it.
 */
export function journey(tiers: TierView[]): JourneyStop[] {
  const order: string[] = [];
  const byDest = new Map<string, TierView[]>();
  for (const t of tiers) {
    if (!byDest.has(t.destination)) { byDest.set(t.destination, []); order.push(t.destination); }
    byDest.get(t.destination)!.push(t);
  }

  let currentTaken = false;
  return order.map((destination) => {
    const group = byDest.get(destination)!;
    const done = group.some((t) => t.achieved);
    const state: StopState = done ? 'done' : currentTaken ? 'locked' : 'current';
    if (state === 'current') currentTaken = true;
    return { destination, state, fromSelf: Math.min(...group.map((t) => n(t.selfRequirement))) };
  });
}

/**
 * The member's standing across the whole programme, in the three figures the
 * hero reports: how many destinations are already theirs, which one is next,
 * and how far along that one is.
 */
export interface Standing {
  qualified: number;
  total: number;
  next: TierView | null;
  /** progress toward `next`, 0–100 — 100 once nothing is left to reach */
  pct: number;
}

export function standing(tiers: TierView[], stops: JourneyStop[]): Standing {
  const next = nextReward(tiers);
  return {
    qualified: stops.filter((s) => s.state === 'done').length,
    total: stops.length,
    next,
    pct: next ? Math.floor(next.overallPct) : 100,
  };
}

/* ── track copy ───────────────────────────────────────────────────────────
   The rule wording is carried over verbatim from the previous page — it
   describes how qualification actually works and must not drift.          */
export const TRACK_META: Record<string, {
  short: string; title: string; description: string; blurb: string; tone: 'gold' | 'violet';
}> = {
  SELF_CAPITALIST: {
    short: 'Self capitalist',
    title: 'Self capital route',
    description: 'Your own committed capital, counted alone.',
    blurb: 'Qualify on your own capital alone — no team required.',
    tone: 'gold',
  },
  AFFILIATE: {
    short: 'Affiliate',
    title: 'Team business route',
    description: 'Your capital and your team business, counted together.',
    blurb: 'Qualify on your own capital and your team business together.',
    tone: 'violet',
  },
};

export const trackMeta = (track: string) =>
  TRACK_META[track] ?? {
    short: track, title: track, description: '', blurb: '', tone: 'gold' as const,
  };
