/**
 * Direct Node `fetch` to `https://www.booli.se/graphql`.
 *
 * Booli fronts the whole www.booli.se zone — including `/graphql` — with a
 * Cloudflare managed challenge (`cf-mitigated: challenge`, `_cf_chl_opt`
 * interstitial) that rejects every non-browser client regardless of
 * headers or User-Agent (Node fetch and curl both 403; the identical query
 * returns 200 from a fetch inside a real tab). Cloudflare fingerprints the
 * HTTP client itself, so no header set or replayed cookie durably clears
 * it. This transport therefore expects to be walled in practice — it
 * surfaces a typed {@link CloudflareChallengeError} so the fallback
 * transport can switch to the fetchproxy browser bridge. It's still worth
 * trying first in case Booli drops or re-scopes the wall.
 *
 * The wire loop itself is mcp-utils' `createGraphqlClient` (fleet-audit#1223):
 * this file only supplies the endpoint, the User-Agent, the retry policy and
 * Booli's own error shapes (the challenge diagnostics, the "body starts: …"
 * hard-HTTP message, and the raw network error rather than a wrapped one).
 *
 * The queries are anonymous (no login, no token), so nothing needs
 * redaction; a descriptive User-Agent identifies the client honestly.
 */
import { EdgeBlockedError } from '@chrischall/mcp-utils';
import {
  GraphqlTransportError,
  createGraphqlClient,
  responseDiagnostics,
  type GraphqlClient,
} from '@chrischall/mcp-utils/graphql';
import type {
  GraphQLResponse,
  BooliTransport,
  TransportStatus,
} from './transport.js';

const GRAPHQL_ENDPOINT = 'https://www.booli.se/graphql';
const RETRYABLE_STATUS = [429, 500, 502, 503, 504];

/** Wait before the first retry; doubles per retry (500 ms, 1 s, …). */
const BASE_BACKOFF_MS = 500;

export interface DirectTransportOptions {
  /** Override the endpoint (tests / self-host). Defaults to booli.se. */
  endpoint?: string;
  /** Per-request timeout in ms. Default 20000. */
  timeoutMs?: number;
  /** Retry attempts on 429/5xx/network error. Default 2 (3 tries total). */
  maxRetries?: number;
  /** Client version, surfaced in the User-Agent. */
  version?: string;
  /** Injected fetch (tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Booli's CDN/WAF refused the request instead of answering GraphQL (in
 * practice Cloudflare's managed challenge). It IS the shared
 * `EdgeBlockedError` (fleet-audit#988), so `createDirectFirstTransport`
 * falls back to the browser bridge on it and the shared healthcheck reads
 * its vendor, while keeping this repo's diagnostic message. The class name
 * is kept for `booli_healthcheck`'s `cloudflare_challenge` kind.
 */
export class CloudflareChallengeError extends EdgeBlockedError {
  constructor(message: string, status = 403, vendor = 'Cloudflare') {
    super(status, vendor, { service: 'Booli', method: 'POST', path: '/graphql' });
    this.name = 'CloudflareChallengeError';
    this.message = message;
  }
}

/** ` (server: …; cf-ray: …)`, or `''` when none of those headers is present. */
function diagnosticsSuffix(headers: Headers): string {
  const diag = responseDiagnostics(headers);
  return diag ? ` (${diag})` : '';
}

export class DirectTransport implements BooliTransport {
  private readonly client: GraphqlClient;
  private readonly timeoutMs: number;

  constructor(opts: DirectTransportOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    const userAgent = `booli-mcp/${opts.version ?? '0.0.0'} (+https://github.com/chrischall/booli-mcp)`;
    this.client = createGraphqlClient({
      endpoint: opts.endpoint ?? GRAPHQL_ENDPOINT,
      serviceName: 'Booli',
      headers: { 'user-agent': userAgent },
      timeout: this.timeoutMs,
      retry: {
        count: opts.maxRetries ?? 2,
        delayMs: BASE_BACKOFF_MS,
        statuses: RETRYABLE_STATUS,
        transportErrors: true,
        backoff: 'exponential',
      },
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      // A CDN/WAF refusal at ANY status — Cloudflare serves rate-limit blocks
      // as 429 and the legacy JS challenge as 503, and an interstitial can
      // come back as a 2xx — is thrown at once, never retried.
      onEdgeBlocked: ({ status, vendor, headers }) =>
        new CloudflareChallengeError(
          `Booli GraphQL HTTP ${status} — ${vendor} bot challenge` +
            `${diagnosticsSuffix(headers)}. Booli challenges non-browser clients; ` +
            'requests must ride a real browser session (fetchproxy bridge).',
          status,
          vendor,
        ),
      onRateLimited: ({ status }) => new Error(`Booli GraphQL HTTP ${status}`),
      onErrorResponse: ({ status, headers, body }) => {
        if (status < 400) {
          return new Error(
            `Booli GraphQL HTTP ${status} returned non-JSON — body starts: ${body.slice(0, 200)}`,
          );
        }
        if (RETRYABLE_STATUS.includes(status)) return new Error(`Booli GraphQL HTTP ${status}`);
        const head = body.slice(0, 200);
        return new Error(
          `Booli GraphQL HTTP ${status}${diagnosticsSuffix(headers)}` +
            `${head ? ` — body starts: ${head}` : ''}`,
        );
      },
    });
  }

  status(): TransportStatus {
    return { transport: 'direct', mode: 'direct' };
  }

  /** The direct fetch never holds a bridge. */
  bridgeTransport(): undefined {
    return undefined;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    try {
      // Every Booli operation is a read, so every one may be retried.
      const { status: _status, headers: _headers, ...envelope } = await this.client.execute<T>({
        query,
        variables,
        idempotent: true,
      });
      return envelope as GraphQLResponse<T>;
    } catch (err) {
      throw this.unwrap(err);
    }
  }

  /**
   * The last network error as-is (as before the migration), and a timeout as
   * an "aborted" error, rather than the shared client's wrapper.
   */
  private unwrap(err: unknown): unknown {
    if (!(err instanceof GraphqlTransportError)) return err;
    if (err.timedOut) {
      return new Error(`Booli GraphQL request aborted: no response within ${this.timeoutMs}ms`, { cause: err });
    }
    return err.cause instanceof Error ? err.cause : new Error('Booli GraphQL request failed');
  }
}
