import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FallbackTransport,
  createDefaultTransport,
} from '../src/transport-fallback.js';
import { CloudflareChallengeError } from '../src/transport-direct.js';
import type { BooliTransport, GraphQLResponse, TransportStatus } from '../src/transport.js';
import type { BridgeHealthcheckTransport } from '@chrischall/mcp-utils/fetchproxy';
import { fakeBridgeHealth } from './helpers.js';

function transportReturning(data: unknown): BooliTransport {
  return { graphql: vi.fn(async () => ({ data }) as GraphQLResponse<unknown>) };
}
function transportThrowing(err: unknown): BooliTransport {
  return { graphql: vi.fn(async () => { throw err; }) };
}

afterEach(() => vi.unstubAllEnvs());

describe('FallbackTransport', () => {
  it('uses direct while it works, never building the bridge', async () => {
    const direct = transportReturning({ via: 'direct' });
    const factory = vi.fn(() => transportReturning({ via: 'bridge' }));
    const t = new FallbackTransport(direct, factory);
    expect(await t.graphql('q', {})).toEqual({ data: { via: 'direct' } });
    expect(factory).not.toHaveBeenCalled();
  });

  it('switches to the bridge on a Cloudflare challenge and stays there', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const direct = transportThrowing(new CloudflareChallengeError('walled'));
    const bridge = transportReturning({ via: 'bridge' });
    const factory = vi.fn(() => bridge);
    const t = new FallbackTransport(direct, factory);

    expect(await t.graphql('q', {})).toEqual({ data: { via: 'bridge' } });
    expect(await t.graphql('q', {})).toEqual({ data: { via: 'bridge' } });
    expect(direct.graphql).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
    expect(bridge.graphql).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Cloudflare'));
    stderr.mockRestore();
  });

  it('propagates a non-challenge error without building the bridge', async () => {
    const direct = transportThrowing(new Error('boom'));
    const factory = vi.fn(() => transportReturning({}));
    const t = new FallbackTransport(direct, factory);
    await expect(t.graphql('q', {})).rejects.toThrow(/boom/);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe('FallbackTransport status', () => {
  const directStatus: TransportStatus = { transport: 'direct', mode: 'direct' };
  const bridgeStatus: TransportStatus = { transport: 'fetchproxy', mode: 'fetchproxy' };
  const bridgeHealthcheck: BridgeHealthcheckTransport = {
    runProbe: vi.fn(),
    status: () => fakeBridgeHealth(),
  };

  it('reports the direct leg (mode auto) and no bridge before any challenge', () => {
    const direct = { ...transportReturning({}), status: () => directStatus };
    const t = new FallbackTransport(direct, () => transportReturning({}));
    expect(t.status()).toEqual({ transport: 'direct', mode: 'auto' });
    expect(t.bridgeTransport()).toBeUndefined();
  });

  it('reports the bridge leg (mode auto) and forwards the bridge after the switch', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const direct = transportThrowing(new CloudflareChallengeError('walled'));
    const bridge = {
      ...transportReturning({}),
      status: () => bridgeStatus,
      bridgeTransport: () => bridgeHealthcheck,
    };
    const t = new FallbackTransport(direct, () => bridge);
    await t.graphql('q', {});
    expect(t.status()).toEqual({ ...bridgeStatus, mode: 'auto' });
    expect(t.bridgeTransport()).toBe(bridgeHealthcheck);
    stderr.mockRestore();
  });

  it('reports an unknown path when the active leg has no status', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = new FallbackTransport(transportReturning({}), () => transportReturning({}));
    expect(t.status()).toEqual({ transport: 'unknown', mode: 'auto' });
    const walled = new FallbackTransport(
      transportThrowing(new CloudflareChallengeError('walled')),
      () => transportReturning({}),
    );
    await walled.graphql('q', {});
    expect(walled.status()).toEqual({ transport: 'unknown', mode: 'auto' });
    expect(walled.bridgeTransport()).toBeUndefined();
    stderr.mockRestore();
  });
});

describe('createDefaultTransport', () => {
  it('returns the direct transport for BOOLI_TRANSPORT=direct', async () => {
    vi.stubEnv('BOOLI_TRANSPORT', 'direct');
    const direct = transportReturning({ mode: 'direct' });
    const t = createDefaultTransport({ direct, bridgeFactory: () => transportReturning({}) });
    expect(await t.graphql('q', {})).toEqual({ data: { mode: 'direct' } });
  });

  it('returns the bridge for BOOLI_TRANSPORT=fetchproxy', async () => {
    vi.stubEnv('BOOLI_TRANSPORT', 'fetchproxy');
    const t = createDefaultTransport({
      direct: transportReturning({}),
      bridgeFactory: () => transportReturning({ mode: 'bridge' }),
    });
    expect(await t.graphql('q', {})).toEqual({ data: { mode: 'bridge' } });
  });

  it('warns and uses auto (fallback) on an unknown mode', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('BOOLI_TRANSPORT', 'nonsense');
    const t = createDefaultTransport({
      direct: transportReturning({ mode: 'direct' }),
      bridgeFactory: () => transportReturning({}),
    });
    expect(await t.graphql('q', {})).toEqual({ data: { mode: 'direct' } });
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown BOOLI_TRANSPORT'));
    stderr.mockRestore();
  });

  it('defaults to auto (FallbackTransport) when unset', async () => {
    vi.stubEnv('BOOLI_TRANSPORT', '');
    const t = createDefaultTransport({
      direct: transportReturning({ mode: 'direct' }),
      bridgeFactory: () => transportReturning({}),
    });
    expect(await t.graphql('q', {})).toEqual({ data: { mode: 'direct' } });
  });

  it('constructs a real direct transport when none injected', () => {
    vi.stubEnv('BOOLI_TRANSPORT', 'direct');
    expect(createDefaultTransport({ version: '1.2.3' })).toBeDefined();
  });

  it('builds a real fetchproxy bridge via the default factory', () => {
    vi.stubEnv('BOOLI_TRANSPORT', 'fetchproxy');
    // Default bridgeFactory runs → new BooliFetchproxyTransport() (lazy; binds nothing).
    expect(createDefaultTransport({ version: '1.2.3' })).toBeDefined();
  });
});
