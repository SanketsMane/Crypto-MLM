import { isIP } from 'node:net';

/**
 * IP allowlisting for the admin console.
 *
 * Deliberately simple: exact addresses and CIDR ranges, nothing else. A
 * allowlist that supports hostnames or wildcards invites a DNS lookup on every
 * request and a rule nobody can reason about — and the failure mode of a rule
 * you cannot reason about is locking your own operators out.
 *
 * IPv4-mapped IPv6 (`::ffff:10.0.0.1`) is normalised, because that is what
 * Node reports for an IPv4 client on a dual-stack socket and an operator
 * entering `10.0.0.1` reasonably expects it to match.
 */

const normalise = (ip: string) => {
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  return mapped ? mapped[1]! : trimmed;
};

const toBytes = (ip: string): number[] | null => {
  if (isIP(ip) === 4) return ip.split('.').map(Number);
  if (isIP(ip) === 6) {
    // Expand :: then read 16 bytes.
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const fill = Array<string>(8 - h.length - t.length).fill('0');
    const parts = ip.includes('::') ? [...h, ...fill, ...t] : ip.split(':');
    if (parts.length !== 8) return null;
    const bytes: number[] = [];
    for (const p of parts) {
      const n = parseInt(p || '0', 16);
      if (Number.isNaN(n)) return null;
      bytes.push((n >> 8) & 0xff, n & 0xff);
    }
    return bytes;
  }
  return null;
};

/** Is `ip` inside `rule`, where rule is an address or CIDR? */
export function matches(ip: string, rule: string): boolean {
  const client = normalise(ip);
  const [network, bitsRaw] = normalise(rule).split('/');
  if (!network) return false;

  if (bitsRaw === undefined) return client === network;

  const bits = Number(bitsRaw);
  const a = toBytes(client);
  const b = toBytes(network);
  if (!a || !b || a.length !== b.length || Number.isNaN(bits)) return false;
  if (bits < 0 || bits > a.length * 8) return false;

  const whole = Math.floor(bits / 8);
  for (let i = 0; i < whole; i += 1) if (a[i] !== b[i]) return false;

  const remainder = bits % 8;
  if (remainder === 0) return true;
  const mask = 0xff << (8 - remainder) & 0xff;
  return (a[whole]! & mask) === (b[whole]! & mask);
}

/** Empty list means no restriction — an allowlist nobody set is not a lockout. */
export const allowed = (ip: string | undefined, rules: string[]): boolean => {
  if (!rules.length) return true;
  if (!ip) return false;
  return rules.some((r) => matches(ip, r));
};

/** Validates what an operator typed, before it can lock anyone out. */
export function assertValidRules(raw: string): string[] {
  const rules = raw.split(',').map((r) => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const [network, bits] = rule.split('/');
    if (!network || !isIP(network)) {
      throw new Error(`"${rule}" is not a valid IP address or CIDR range`);
    }
    if (bits !== undefined) {
      const n = Number(bits);
      const max = isIP(network) === 4 ? 32 : 128;
      if (!Number.isInteger(n) || n < 0 || n > max) {
        throw new Error(`"${rule}" has an invalid prefix length`);
      }
    }
  }
  return rules;
}
