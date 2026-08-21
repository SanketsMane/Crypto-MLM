import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 8);

/// Structured, unique, human-readable idempotency key:
///   ROI-20260820-clx123-7Q2M4A8K
export const makeReference = (prefix: string, ...parts: (string | number)[]): string =>
  [prefix, ...parts.map(String), nano()].join('-');

/// Deterministic key — same inputs always produce the same reference, so a
/// replayed job collides on the unique index instead of paying twice.
export const deterministicReference = (prefix: string, ...parts: (string | number)[]): string =>
  [prefix, ...parts.map(String)].join('-');

export const userCode = (): string => `FX${nano()}`;
