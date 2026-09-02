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
  selfRequirement: string;
  teamRequirement: string;
  selfActual: string;
  teamActual: string;
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
}

const n = (v: string | number | null | undefined) => Number(v ?? 0);

/** actual ÷ requirement as a capped percentage; a zero requirement is already met */
export const ratio = (actual: string | number, required: string | number): number => {
  const need = n(required);
  return need > 0 ? Math.min(100, (n(actual) / need) * 100) : 100;
};

export function toView(t: Tier): TierView {
  const needsTeam = t.track === 'AFFILIATE' && n(t.teamRequirement) > 0;
  const selfPct = ratio(t.selfActual, t.selfRequirement);
  const teamPct = ratio(t.teamActual, t.teamRequirement);
  return {
    ...t,
    selfPct,
    teamPct,
    needsTeam,
    // both gates must land, so you are only as far along as the weaker one
    overallPct: needsTeam ? Math.min(selfPct, teamPct) : selfPct,
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
