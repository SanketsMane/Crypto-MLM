import { describe, expect, it } from 'vitest';
import {
  assertPayoutKeyAcceptable,
  isEncryptedPayoutKey,
} from '../src/core/chain/provider.js';

/**
 * The hot wallet key is the single value that can move every payout the
 * platform makes. It used to be accepted raw anywhere, silently, because
 * encryption was opt-in by string prefix — so a key pasted straight into `.env`
 * worked exactly as well as an encrypted one, right up until the disk, a
 * backup or a container inspect leaked it.
 */

const ENCRYPTED = 'v1.abcdef0123456789';
const RAW = '0x' + 'a'.repeat(64);

describe('recognising an encrypted key', () => {
  it('accepts the v1 blob format', () => {
    expect(isEncryptedPayoutKey(ENCRYPTED)).toBe(true);
  });

  it('treats a bare private key as raw', () => {
    expect(isEncryptedPayoutKey(RAW)).toBe(false);
  });

  it('is not fooled by a key that merely mentions v1', () => {
    // The marker is a prefix, not a substring — otherwise a key containing
    // "v1." anywhere would be waved through as encrypted.
    expect(isEncryptedPayoutKey('0xdeadv1.beef')).toBe(false);
  });
});

describe('in production', () => {
  it('refuses a raw key outright', () => {
    expect(() => assertPayoutKeyAcceptable(RAW, true)).toThrow(/must be encrypted in production/);
  });

  it('says how to fix it, not just that it is wrong', () => {
    // An operator hitting this at boot needs the next action, not a scolding.
    expect(() => assertPayoutKeyAcceptable(RAW, true)).toThrow(/ENCRYPTION_KEY/);
  });

  it('allows an encrypted key', () => {
    expect(() => assertPayoutKeyAcceptable(ENCRYPTED, true)).not.toThrow();
  });
});

describe('outside production', () => {
  it('allows a raw key, for a local chain', () => {
    expect(() => assertPayoutKeyAcceptable(RAW, false)).not.toThrow();
  });

  it('allows an encrypted key too', () => {
    expect(() => assertPayoutKeyAcceptable(ENCRYPTED, false)).not.toThrow();
  });
});
