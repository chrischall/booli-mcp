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
 * The queries are anonymous (no login, no token), so nothing needs
 * redaction; a descriptive User-Agent identifies the client honestly.
 */
import type { GraphQLResponse, BooliTransport } from './transport.js';

const GRAPHQL_ENDPOINT = 'https://www.booli.se/graphql';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

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

/** Sleep helper — extracted so it's obvious in a backoff loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A non-retryable HTTP failure (a non-2xx that isn't 429/5xx). */
class HardHttpError extends Error {}

/**
 * Booli answered with a Cloudflare bot challenge instead of GraphQL.
 * Callers use this type to fall back to the fetchproxy browser bridge.
 */
export class CloudflareChallengeError extends HardHttpError {}

/**
 * Definitive challenge markers only (per fleet guidance): the
 * `cf-mitigated: challenge` header, or the interstitial's `_cf_chl_opt`
 * script / "Just a moment" title in the body. Do NOT match
 * `challenges.cloudflare.com` — Cloudflare inlines that on cleared pages.
 */
function isCloudflareChallenge(res: Response, bodyHead: string): boolean {
  return (
    res.headers.get('cf-mitigated') === 'challenge' ||
    bodyHead.includes('_cf_chl_opt') ||
    bodyHead.includes('<title>Just a moment')
  );
}

/** Build the diagnostic error for a non-retryable HTTP failure. */
async function hardHttpError(res: Response): Promise<HardHttpError> {
  let bodyHead = '';
  try {
    bodyHead = (await res.text()).slice(0, 200);
  } catch {
    // Diagnostics are best-effort; the status alone still tells the story.
  }
  const diag = ['server', 'cf-ray', 'cf-mitigated']
    .map((name) => ({ name, value: res.headers.get(name) }))
    .filter((h) => h.value)
    .map((h) => `${h.name}: ${h.value}`)
    .join('; ');
  if (isCloudflareChallenge(res, bodyHead)) {
    return new CloudflareChallengeError(
      `Booli GraphQL HTTP ${res.status} — Cloudflare bot challenge` +
        `${diag ? ` (${diag})` : ''}. Booli challenges non-browser clients; ` +
        'requests must ride a real browser session (fetchproxy bridge).',
    );
  }
  return new HardHttpError(
    `Booli GraphQL HTTP ${res.status}${diag ? ` (${diag})` : ''}` +
      `${bodyHead ? ` — body starts: ${bodyHead}` : ''}`,
  );
}

export class DirectTransport implements BooliTransport {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DirectTransportOptions = {}) {
    this.endpoint = opts.endpoint ?? GRAPHQL_ENDPOINT;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.userAgent = `booli-mcp/${opts.version ?? '0.0.0'} (+https://github.com/chrischall/booli-mcp)`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    const body = JSON.stringify({ query, variables });
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await delay(2 ** attempt * 250);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': this.userAgent,
          },
          body,
          signal: controller.signal,
        });

        if (res.ok) {
          return (await res.json()) as GraphQLResponse<T>;
        }
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw await hardHttpError(res);
        }
        lastError = new Error(`Booli GraphQL HTTP ${res.status}`);
      } catch (err) {
        // A hard HTTP error is terminal — propagate at once. Network
        // errors and aborts (timeouts) fall through to the next attempt.
        if (err instanceof HardHttpError) throw err;
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Booli GraphQL request failed');
  }
}
