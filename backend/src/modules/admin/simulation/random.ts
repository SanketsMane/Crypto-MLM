/**
 * Deterministic randomness.
 *
 * A simulation that cannot be repeated cannot be compared. Two runs with the
 * same parameters must produce the same result, or "what if we halve the
 * generation bonus?" has no answer — the difference could be the change or
 * could be the dice.
 *
 * mulberry32: small, fast, and good enough for modelling a member base. Not a
 * CSPRNG, and deliberately not used for anything that needs one.
 */
export class Rng {
  private state: number;

  constructor(seed: string) {
    // FNV-1a, so any seed string maps to a well-distributed 32-bit start.
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    this.state = h >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /**
   * Picks from a list where earlier entries are far likelier.
   *
   * Real member bases are not uniform across price tiers — most people buy near
   * the bottom and a few buy at the top. A uniform pick would model a
   * population that does not exist and flatter the projection badly, because
   * the expensive tiers carry the largest liabilities.
   */
  weightedPick<T>(items: readonly T[], skew = 2.5): T {
    const r = Math.pow(this.next(), skew);
    return items[Math.min(items.length - 1, Math.floor(r * items.length))]!;
  }

  /**
   * Normally distributed, clamped to a range.
   *
   * Box–Muller. Used where a real quantity clusters around a middle rather than
   * being flat — how many people someone recruits, for instance.
   */
  normal(mean: number, stdDev: number, min: number, max: number): number {
    const u = Math.max(this.next(), Number.EPSILON);
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(max, Math.max(min, mean + z * stdDev));
  }
}
