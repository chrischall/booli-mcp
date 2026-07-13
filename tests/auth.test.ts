import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildAuthParams, randomUnique } from '../src/auth.js';

describe('buildAuthParams', () => {
  it('signs sha1(callerId + time + apiKey + unique) as hex', () => {
    const params = buildAuthParams({
      callerId: 'caller-1',
      apiKey: 'secret-key',
      time: 1_700_000_000_000,
      unique: 'abcdef0123456789',
    });
    const expected = createHash('sha1')
      .update('caller-1' + 1_700_000_000_000 + 'secret-key' + 'abcdef0123456789')
      .digest('hex');
    expect(params).toEqual({
      callerId: 'caller-1',
      time: 1_700_000_000_000,
      unique: 'abcdef0123456789',
      hash: expected,
    });
  });

  it('never surfaces the apiKey in the returned params', () => {
    const params = buildAuthParams({
      callerId: 'c',
      apiKey: 'super-secret',
      time: 1,
      unique: 'u',
    });
    expect(JSON.stringify(params)).not.toContain('super-secret');
  });
});

describe('randomUnique', () => {
  it('returns a 16-char hex nonce that varies between calls', () => {
    const a = randomUnique();
    const b = randomUnique();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(b).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toEqual(b);
  });
});
