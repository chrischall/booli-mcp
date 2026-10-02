import { describe, it, expect, vi } from 'vitest';
import {
  FetchproxyBridgeDownError,
  FetchproxySessionNotReadyError,
  type BridgeHealth,
  type BridgeHealthcheckTransport,
} from '@chrischall/mcp-utils/fetchproxy';
import { FetchproxyCapabilityUnavailableError } from '@fetchproxy/server';
import { createTestHarness, parseToolResult, fakeBridgeHealth } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerHealthcheckTools } from '../../src/tools/healthcheck.js';
import { CloudflareChallengeError } from '../../src/transport-direct.js';
import { BooliFetchproxyTransport, BridgeHttpStatusError } from '../../src/transport-fetchproxy.js';
import type { BooliTransport, TransportStatus } from '../../src/transport.js';
import { AREA } from '../fixtures.js';

const HEALTHY = { data: { areaSuggestionSearch: { suggestions: [AREA] } } };

/** The shared bridge-healthcheck envelope, as the tool returns it. */
interface Body {
  ok: boolean;
  transport?: TransportStatus;
  bridge?: {
    role: 'host' | 'peer' | null;
    port: number;
    session_state?: string;
    pending_pair_code?: string | null;
    extension_connected?: boolean;
    last_extension_message_at: number | null;
  };
  probe: { url: string; elapsed_ms: number; status?: number; body_length?: number };
  error?: { kind: string; message: string; bridge_hint?: string };
  hint: string;
}

const DIRECT: TransportStatus = { transport: 'direct', mode: 'direct' };
const ON_BRIDGE: TransportStatus = { transport: 'fetchproxy', mode: 'auto' };

function fakeBridgeTransport(health: BridgeHealth = fakeBridgeHealth()): BridgeHealthcheckTransport {
  return { runProbe: vi.fn(), status: () => health };
}

async function call(transport: BooliTransport): Promise<Body> {
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerHealthcheckTools(s, client));
  try {
    return parseToolResult<Body>(await h.callTool('booli_healthcheck', {}));
  } finally {
    await h.close();
  }
}

describe('booli_healthcheck on the direct path', () => {
  it('reports ok with the direct transport and no bridge block', async () => {
    const body = await call({
      async graphql<T>() { return HEALTHY as unknown as T; },
      status: () => DIRECT,
      bridgeTransport: () => undefined,
    });
    expect(body.ok).toBe(true);
    expect(body.transport).toEqual({ transport: 'direct', mode: 'direct' });
    expect(body.bridge).toBeUndefined();
    expect(body.probe.url).toBe('https://www.booli.se/graphql');
    expect(body.probe.status).toBe(200);
    expect(typeof body.probe.elapsed_ms).toBe('number');
    expect(body.hint).toMatch(/Direct fetch/);
  });

  it('classifies a Cloudflare challenge and gives the browser-bridge hint', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new CloudflareChallengeError('Booli GraphQL HTTP 403 — Cloudflare bot challenge');
      },
      status: () => DIRECT,
      bridgeTransport: () => undefined,
    });
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('cloudflare_challenge');
    expect(body.error?.message).toMatch(/Cloudflare bot challenge/);
    expect(body.hint).toMatch(/BOOLI_TRANSPORT=fetchproxy/);
    expect(body.hint).toMatch(/www\.booli\.se tab open \(no login needed\)/);
    expect(body.hint).toMatch(/ContextMint Bridge pairing prompt/);
  });

  it('gives a Booli-specific hint on a non-challenge direct failure', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> { throw new Error('network down'); },
      status: () => DIRECT,
      bridgeTransport: () => undefined,
    });
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('unknown');
    expect(body.error?.message).toBe('network down');
    expect(body.hint).toMatch(/network reachability/);
    expect(body.hint).toMatch(/BOOLI_TRANSPORT=fetchproxy/);
  });

  it('tolerates a non-Error throw (nothing to unwrap) and reports it as unknown', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> { throw 'raw failure'; },
      status: () => DIRECT,
      bridgeTransport: () => undefined,
    });
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('unknown');
    expect(body.error?.message).toBe('raw failure');
  });

  it('falls back to an unknown path when the transport reports no status', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> { throw new Error('boom'); },
    });
    expect(body.ok).toBe(false);
    expect(body.transport).toEqual({ transport: 'unknown', mode: 'auto' });
    expect(body.bridge).toBeUndefined();
  });
});

describe('booli_healthcheck on the browser bridge', () => {
  it('reports the bridge block with the extension link state', async () => {
    const body = await call({
      async graphql<T>() { return HEALTHY as unknown as T; },
      status: () => ON_BRIDGE,
      bridgeTransport: () => fakeBridgeTransport(),
    });
    expect(body.ok).toBe(true);
    expect(body.transport).toEqual(ON_BRIDGE);
    expect(body.bridge).toMatchObject({
      role: 'host',
      port: 37_149,
      session_state: 'linked',
      pending_pair_code: null,
      extension_connected: true,
      last_extension_message_at: 1_756_850_326_000,
    });
    expect(body.hint).toMatch(/Bridge round-tripped/);
  });

  it('classifies a session-not-ready throw and names the pending pair code', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new FetchproxySessionNotReadyError({ mcpId: 'booli-mcp', pairCode: 'QX7P' });
      },
      status: () => ON_BRIDGE,
      bridgeTransport: () =>
        fakeBridgeTransport(
          fakeBridgeHealth({
            lastExtensionMessageAt: null,
            session: { state: 'pair_pending', pairCode: 'QX7P', extensionConnected: true },
          }),
        ),
    });
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('session_not_ready');
    expect(body.bridge?.session_state).toBe('pair_pending');
    expect(body.bridge?.pending_pair_code).toBe('QX7P');
    expect(body.hint).toMatch(/QX7P/);
  });

  it('sees through the transport wrapper to a session-not-ready cause', async () => {
    // transport-fetchproxy rethrows bridge failures as "Booli bridge: …" with
    // the typed error as `cause`; the classification must survive that.
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new Error('Booli bridge: session not ready', {
          cause: new FetchproxySessionNotReadyError({ mcpId: 'booli-mcp', pairCode: null }),
        });
      },
      status: () => ON_BRIDGE,
      bridgeTransport: () =>
        fakeBridgeTransport(
          fakeBridgeHealth({
            session: { state: 'extension_disconnected', pairCode: null, extensionConnected: false },
          }),
        ),
    });
    expect(body.error?.kind).toBe('session_not_ready');
    expect(body.error?.message).toBe('Booli bridge: session not ready');
    expect(body.hint).toMatch(/ContextMint Bridge isn't attached to this bridge \(port 37149\)/);
  });

  it('classifies the bridge leg\'s non-JSON challenge page as cloudflare_challenge (#53)', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new Error('Booli GraphQL returned non-JSON via the browser bridge — likely a Cloudflare challenge page.', {
          cause: new CloudflareChallengeError('challenge interstitial'),
        });
      },
      status: () => ON_BRIDGE,
      bridgeTransport: () => fakeBridgeTransport(),
    });
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('cloudflare_challenge');
    expect(body.hint).toMatch(/BOOLI_TRANSPORT=fetchproxy/);
  });

  it('files the bridge leg\'s non-2xx as http, not unknown (#53)', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new Error('Booli GraphQL HTTP 502 via browser bridge — body starts: bad gateway.', {
          cause: new BridgeHttpStatusError(502),
        });
      },
      status: () => ON_BRIDGE,
      bridgeTransport: () => fakeBridgeTransport(),
    });
    expect(body.error?.kind).toBe('http');
  });

  it('fails a 200 with zero suggestions instead of calling it healthy', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        return { data: { areaSuggestionSearch: { suggestions: [] } } } as T;
      },
      status: () => DIRECT,
    });
    expect(body.ok).toBe(false);
    expect(body.error?.message).toMatch(/returned 0 hits/);
  });

  it('sees through the transport wrapper to a bridge-down cause', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new Error('Booli bridge: extension offline', {
          cause: new FetchproxyBridgeDownError({ originalError: 'extension offline', op: 'fetch', role: 'host', port: 37_149 }),
        });
      },
      status: () => ON_BRIDGE,
      bridgeTransport: () => fakeBridgeTransport(),
    });
    expect(body.error?.kind).toBe('bridge_down');
    expect(body.hint).toMatch(/service worker/);
  });

  it('classifies a capability-unavailable cause as the browser, not the MCP', async () => {
    const body = await call({
      async graphql<T>(): Promise<T> {
        throw new Error('Booli bridge: capability unavailable', {
          cause: new FetchproxyCapabilityUnavailableError(
            'capability "fetch" is not available in this browser (safari)',
            { capability: 'fetch', platform: 'safari' },
          ),
        });
      },
      status: () => ON_BRIDGE,
      bridgeTransport: () => fakeBridgeTransport(),
    });
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('capability_unavailable');
    // The shared ladder's capability copy (mcp-utils 2.12 unwraps the cause).
    expect(body.hint).toMatch(/browser \(safari\) can't serve the "fetch" capability/i);
    expect(body.hint).toMatch(/MCP isn't at fault/);
    expect(body.hint).not.toMatch(/BOOLI_TRANSPORT/);
  });
});

/** A real CloudFront refusal page, as the browser bridge relays it. */
const CLOUDFRONT_403 =
  '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">\n' +
  '<HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1">\n' +
  '<TITLE>ERROR: The request could not be satisfied</TITLE>\n</HEAD><BODY>\n' +
  '<H1>403 ERROR</H1>\n<H2>The request could not be satisfied.</H2>\n<HR noshade size="1px">\n' +
  'Request blocked.\nWe can\'t connect to the server for this app or website at this time.\n' +
  '<BR clear="all">\n<HR noshade size="1px">\n<PRE>\nGenerated by cloudfront (CloudFront)\n' +
  'Request ID: 3uY0bVq0pQ==\n</PRE>\n<ADDRESS>\n</ADDRESS>\n</BODY></HTML>';

describe('booli_healthcheck — a CDN/WAF block on the bridge leg (mcp-host#1015)', () => {
  function bridgeAnswering(status: number, body: string): BooliFetchproxyTransport {
    return new BooliFetchproxyTransport({
      bridge: {
        start: vi.fn(async () => {}),
        fetch: vi.fn(async () => ({ status, body })),
        status: vi.fn(() => fakeBridgeHealth()),
        runProbe: vi.fn(),
      },
    });
  }

  it('reports a refusal page relayed through the bridge as edge_blocked, not http', async () => {
    const body = await call(bridgeAnswering(403, CLOUDFRONT_403));
    expect(body.ok).toBe(false);
    expect(body.error?.kind).toBe('edge_blocked');
    expect((body.error as { detail?: { vendor?: string } }).detail?.vendor).toBe('CloudFront');
    expect(body.hint).toMatch(/CDN\/WAF/);
  });

  it('still files a genuine non-2xx from Booli on the bridge leg as http', async () => {
    const body = await call(bridgeAnswering(403, '{"errors":[{"message":"Forbidden"}]}'));
    expect(body.error?.kind).toBe('http');
  });
});
