/**
 * Ranks are numbered, not named.
 *
 * The ladder is stored with a code (`STARTER`) and a display name (`Starter`),
 * but the product refers to a rank by its position — Rank 1 through Rank 10 —
 * so the number is what every surface shows, admin and member alike.
 *
 * `level` is the authority rather than a row's position in the array: it is
 * unique on `rank_definitions` and is the column the ladder is ordered by, so
 * the label stays correct if a rank is renamed, retired, or one is inserted in
 * the middle. Nothing here writes to the database — the stored names are left
 * intact so historical `rank_achievements` rows keep meaning what they meant.
 */
export const rankLabel = (level: number | null | undefined): string =>
  typeof level === 'number' && Number.isFinite(level) ? `Rank ${level}` : '—';

/**
 * For the marketing pages, where the ladder is a static ordered list with no
 * level column of its own. Index 0 is Rank 1.
 */
export const rankLabelAt = (index: number): string => `Rank ${index + 1}`;
