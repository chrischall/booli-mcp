/**
 * Browser-bridge Booli transport: each GraphQL POST runs as a same-origin
 * fetch inside the user's own www.booli.se tab via the fetchproxy bridge
 * (`@fetchproxy/server` + the Transporter extension).
 *
 * Why this exists: Booli fronts www.booli.se — including `/graphql` — with
 * a Cloudflare managed challenge that rejects every non-browser client
 * (Node fetch / curl 403), and Cloudflare fingerprints the HTTP client
 * itself, so no header set or replayed cookie durably clears it. The
 * identical query returns 200 from a fetch inside a real tab. The queries
 * are anonymous: the tab needs no Booli login, just a cleared Cloudflare
 * session (any normal page view). See docs/BOOLI-API.md.
 *
 * This is the fleet's fetchproxy archetype (hemnet / redfin / zillow): a
 * thin adapter over @chrischall/mcp-utils' `createFetchproxyTransport`,
 * exposing the same one-method {@link BooliTransport} as the direct
 * transport so the client and every tool stay unchanged.
 */
import {
  bridgeErrorInfo,
  createFetchproxyTransport,
  type BridgeHealthcheckTransport,
  type FetchproxyFetchInit,
  type FetchproxyServer,
  type FetchproxyServerOpts,
} from '@chrischall/mcp-utils/fetchproxy';
import { readPortEnv } from '@chrischall/mcp-utils';
import type {
  GraphQLResponse,
  BooliTransport,
  TransportStatus,
} from './transport.js';
import { CloudflareChallengeError } from './transport-direct.js';

/**
 * A non-2xx status answered through the browser bridge — an upstream HTTP
 * failure, not a bridge fault. Attached as `cause` to the thrown message so
 * the healthcheck classifies it as `http` by type rather than by wording.
 */
export class BridgeHttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`Booli GraphQL HTTP ${status} via browser bridge`);
    this.name = 'BridgeHttpStatusError';
  }
}

/**
 * The whole fetchproxy fleet shares ONE concentrator port — the
 * Transporter extension dials it, and servers host/peer-elect on it.
 * Never default to a "unique" port; override only for test isolation.
 */
const DEFAULT_WS_PORT = 37_149;

/**
 * The minimal slice of the fetchproxy transport this adapter drives —
 * narrow so tests can fake it without modelling the whole verb surface.
 * It structurally includes `runProbe` + `status()` (the
 * {@link BridgeHealthcheckTransport} slice) so the bridge can be handed
 * straight to the shared bridge healthcheck; the real
 * `createFetchproxyTransport` return value satisfies it.
 */
export interface BooliBridge extends BridgeHealthcheckTransport {
  /** Load identity and prepare the bridge (lazy — binds nothing). */
  start(): Promise<void>;
  /** One same-origin fetch inside the paired tab. */
  fetch(
    init: FetchproxyFetchInit,
  ): Promise<{ status: number; body: string; url?: string }>;
}

export interface FetchproxyTransportOptions {
  /** Client version, forwarded to the bridge's status/banner. */
  version?: string;
  /** Concentrator port. Default `BOOLI_WS_PORT` env, then 37149. */
  port?: number;
  /** Per-request bridge deadline in ms. Default 20000. */
  timeoutMs?: number;
  /** Injected bridge (tests). Defaults to the real fetchproxy transport. */
  bridge?: BooliBridge;
  /** Test seam forwarded to `createFetchproxyTransport`. */
  createServer?: (opts: FetchproxyServerOpts) => FetchproxyServer;
}

export class BooliFetchproxyTransport implements BooliTransport {
  private readonly bridge: BooliBridge;
  private startPromise: Promise<void> | undefined;

  constructor(opts: FetchproxyTransportOptions = {}) {
    this.bridge =
      opts.bridge ??
      createFetchproxyTransport({
        port: opts.port ?? readPortEnv('BOOLI_WS_PORT', DEFAULT_WS_PORT),
        serverName: 'booli-mcp',
        version: opts.version ?? '0.0.0',
        // 'booli.se' matches www.booli.se (exact host or any subdomain).
        domains: ['booli.se'],
        defaultSubdomain: 'www',
        capabilities: ['fetch'],
        // Canonical fleet startup banner on start() — stderr only.
        logListening: true,
        debugEnvVar: 'BOOLI_DEBUG_LOG',
        fetchTimeoutMs: opts.timeoutMs ?? 20_000,
        ...(opts.createServer ? { createServer: opts.createServer } : {}),
      });
  }

  /**
   * The bridge, started. `start()` runs single-flight (concurrent callers
   * share one start) and clears on rejection so a transient failure is
   * retried on the next request instead of sticking forever.
   */
  private async ready(): Promise<BooliBridge> {
    if (!this.startPromise) {
      this.startPromise = this.bridge.start().catch((err: unknown) => {
        this.startPromise = undefined;
        throw err;
      });
    }
    await this.startPromise;
    return this.bridge;
  }

  /** The bridge leg. The bridge's live state comes via {@link bridgeTransport}. */
  status(): TransportStatus {
    return { transport: 'fetchproxy', mode: 'fetchproxy' };
  }

  /**
   * The underlying bridge, for the shared healthcheck's bridge projection
   * (role, port, extension link state). `bridgeHealth()` works before
   * `start()` too, so this is safe at any point in the lifecycle.
   */
  bridgeTransport(): BridgeHealthcheckTransport {
    return this.bridge;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    let result: { status: number; body: string };
    try {
      const bridge = await this.ready();
      result = await bridge.fetch({
        method: 'POST',
        path: '/graphql',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      // Bridge-layer failures (extension down, pairing pending, timeout)
      // get the typed error's remediation hint instead of a bare message.
      // The typed error rides along as `cause` so the healthcheck can
      // still classify it (session_not_ready / bridge_down) after wrapping.
      const info = bridgeErrorInfo(err);
      throw new Error(
        `Booli bridge: ${info.message}${info.hint ? ` ${info.hint}` : ''}`,
        { cause: err },
      );
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Booli GraphQL HTTP ${result.status} via browser bridge — ` +
          `body starts: ${result.body.slice(0, 200)}. Open or refresh a ` +
          'www.booli.se tab (no login needed) and retry.',
        { cause: new BridgeHttpStatusError(result.status) },
      );
    }
    try {
      return JSON.parse(result.body) as GraphQLResponse<T>;
    } catch {
      // A 2xx that isn't JSON is almost always the Cloudflare interstitial
      // or an HTML error page — surface that instead of a bare SyntaxError.
      // Typed as a challenge via `cause` so the healthcheck classifies it
      // as `cloudflare_challenge` (the shared tool classifies by instanceof).
      throw new Error(
        'Booli GraphQL returned non-JSON via the browser bridge — likely ' +
          'a Cloudflare challenge page. Open or refresh a www.booli.se tab ' +
          `and retry. Body starts: ${result.body.slice(0, 120)}`,
        {
          cause: new CloudflareChallengeError(
            'Booli GraphQL answered a non-JSON page via the browser bridge (Cloudflare challenge interstitial)',
          ),
        },
      );
    }
  }
}
