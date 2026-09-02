import { describe, it, expect, vi } from 'vitest';
import {
  FetchproxyBridgeDownError,
  FetchproxySessionNotReadyError,
} from '@chrischall/mcp-utils/fetchproxy';
import { fakeBridgeHealth } from './helpers.js';
import { CloudflareChallengeError } from '../src/transport-direct.js';
import {
  BooliFetchproxyTransport,
  type BooliBridge,
} from '../src/transport-fetchproxy.js';

/** A controllable fake of the minimal bridge surface the transport uses. */
function fakeBridge(overrides: Partial<BooliBridge> = {}): BooliBridge {
  return {
    start: vi.fn(async () => {}),
    fetch: vi.fn(async () => ({
      status: 200,
      body: JSON.stringify({ data: { ok: true } }),
      url: 'https://www.booli.se/graphql',
    })),
    status: vi.fn(() => fakeBridgeHealth()),
    runProbe: vi.fn(),
    ...overrides,
  };
}

describe('BooliFetchproxyTransport', () => {
  it('POSTs the operation to /graphql through the bridge and returns the envelope', async () => {
    const bridge = fakeBridge();
    const t = new BooliFetchproxyTransport({ bridge });
    const res = await t.graphql('query X { x }', { a: 1 });
    expect(res).toEqual({ data: { ok: true } });
    const init = vi.mocked(bridge.fetch).mock.calls[0]![0];
    expect(init.method).toBe('POST');
    expect(init.path).toBe('/graphql');
    expect(JSON.parse(init.body!)).toEqual({ query: 'query X { x }', variables: { a: 1 } });
  });

  it('starts the bridge only once across calls', async () => {
    const bridge = fakeBridge();
    const t = new BooliFetchproxyTransport({ bridge });
    await t.graphql('q', {});
    await t.graphql('q', {});
    expect(bridge.start).toHaveBeenCalledOnce();
  });

  it('retries start after a failure (single-flight clears on reject)', async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error('extension down'))
      .mockResolvedValue(undefined);
    const bridge = fakeBridge({ start });
    const t = new BooliFetchproxyTransport({ bridge });
    await expect(t.graphql('q', {})).rejects.toThrow(/Booli bridge/);
    await expect(t.graphql('q', {})).resolves.toEqual({ data: { ok: true } });
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('appends the remediation hint from a typed bridge error', async () => {
    const bridge = fakeBridge({
      start: vi.fn(async () => { throw new FetchproxyBridgeDownError('extension offline'); }),
    });
    const t = new BooliFetchproxyTransport({ bridge });
    // bridgeErrorInfo() attaches an actionable hint for the typed error.
    await expect(t.graphql('q', {})).rejects.toThrow(/Booli bridge:.+\S/);
  });

  it('keeps the typed bridge error as the cause of the wrapper', async () => {
    const inner = new FetchproxySessionNotReadyError({ mcpId: 'booli-mcp', pairCode: 'AB12' });
    const bridge = fakeBridge({ fetch: vi.fn(async () => { throw inner; }) });
    const t = new BooliFetchproxyTransport({ bridge });
    const err = await t.graphql('q', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Booli bridge:/);
    expect((err as Error).cause).toBe(inner);
  });

  it('throws on a non-2xx bridge response', async () => {
    const bridge = fakeBridge({
      fetch: vi.fn(async () => ({ status: 403, body: 'nope' })),
    });
    const t = new BooliFetchproxyTransport({ bridge });
    await expect(t.graphql('q', {})).rejects.toThrow(/HTTP 403 via browser bridge/);
  });

  it('throws a helpful error on a non-JSON 2xx (challenge page)', async () => {
    const bridge = fakeBridge({
      fetch: vi.fn(async () => ({ status: 200, body: '<html>Just a moment' })),
    });
    const t = new BooliFetchproxyTransport({ bridge });
    const err = await t.graphql('q', {}).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/non-JSON.*Cloudflare/s);
    // Typed for the healthcheck's classifier.
    expect((err as Error).cause).toBeInstanceOf(CloudflareChallengeError);
  });

  it('constructs a real bridge by default (no injected bridge)', () => {
    expect(new BooliFetchproxyTransport()).toBeInstanceOf(BooliFetchproxyTransport);
  });

  it('forwards the createServer test seam', () => {
    const createServer = vi.fn();
    expect(
      new BooliFetchproxyTransport({ createServer: createServer as never }),
    ).toBeInstanceOf(BooliFetchproxyTransport);
  });
});

describe('BooliFetchproxyTransport status', () => {
  it('reports the fetchproxy leg without touching the bridge', () => {
    const bridge = fakeBridge();
    const t = new BooliFetchproxyTransport({ bridge });
    expect(t.status()).toEqual({ transport: 'fetchproxy', mode: 'fetchproxy' });
    expect(bridge.status).not.toHaveBeenCalled();
  });

  it('exposes the underlying bridge so the shared healthcheck projects its state', () => {
    const bridge = fakeBridge({
      status: vi.fn(() => fakeBridgeHealth({ role: 'peer', port: 37_150 })),
    });
    const t = new BooliFetchproxyTransport({ bridge });
    expect(t.bridgeTransport()).toBe(bridge);
    expect(t.bridgeTransport().status()).toMatchObject({ role: 'peer', port: 37_150 });
  });
});
