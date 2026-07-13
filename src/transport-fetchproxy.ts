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
  type FetchproxyFetchInit,
  type FetchproxyServer,
  type FetchproxyServerOpts,
} from '@chrischall/mcp-utils/fetchproxy';
import { readPortEnv } from '@chrischall/mcp-utils';
import type { GraphQLResponse, BooliTransport } from './transport.js';

/**
 * The whole fetchproxy fleet shares ONE concentrator port — the
 * Transporter extension dials it, and servers host/peer-elect on it.
 * Never default to a "unique" port; override only for test isolation.
 */
const DEFAULT_WS_PORT = 37_149;

/**
 * The minimal slice of the fetchproxy transport this adapter drives —
 * narrow so tests can fake it without modelling the whole verb surface.
 */
export interface BooliBridge {
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
      const info = bridgeErrorInfo(err);
      throw new Error(
        `Booli bridge: ${info.message}${info.hint ? ` ${info.hint}` : ''}`,
      );
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Booli GraphQL HTTP ${result.status} via browser bridge — ` +
          `body starts: ${result.body.slice(0, 200)}. Open or refresh a ` +
          'www.booli.se tab (no login needed) and retry.',
      );
    }
    try {
      return JSON.parse(result.body) as GraphQLResponse<T>;
    } catch {
      // A 2xx that isn't JSON is almost always the Cloudflare interstitial
      // or an HTML error page — surface that instead of a bare SyntaxError.
      throw new Error(
        'Booli GraphQL returned non-JSON via the browser bridge — likely ' +
          'a Cloudflare challenge page. Open or refresh a www.booli.se tab ' +
          `and retry. Body starts: ${result.body.slice(0, 120)}`,
      );
    }
  }
}
