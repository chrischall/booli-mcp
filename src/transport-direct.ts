/**
 * Default Booli transport: a signed Node `fetch` GET to
 * `https://api.booli.se`.
 *
 * Booli's classic REST API is reachable server-side (no Cloudflare wall,
 * unlike the www.booli.se consumer site), so there is no browser bridge
 * and no session to bootstrap. Each request is signed with the caller's
 * `BOOLI_CALLER_ID` + `BOOLI_API_KEY` (see src/auth.ts).
 *
 * Deferred-config-error pattern: the constructor reads the credentials
 * but does NOT throw when they're absent — the server still boots (and
 * answers the host's install-time `tools/list` probe). The missing-creds
 * error surfaces on the first tool call, via `requireCreds()`.
 *
 * The transport stays thin: sign, GET, retry transient failures with
 * backoff, parse JSON. Everything Booli-semantic (envelope keys, empty
 * results) lives on the client.
 */
import {
  McpToolError,
  readEnvVar,
  redactSecrets,
  truncateErrorMessage,
} from '@chrischall/mcp-utils';
import { buildAuthParams, randomUnique } from './auth.js';
import type { BooliQuery, BooliTransport } from './transport.js';

const BASE_URL = 'https://api.booli.se';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface DirectTransportOptions {
  /** Override the base URL (tests / self-host). Defaults to api.booli.se. */
  baseUrl?: string;
  /** Booli caller id. Defaults to `BOOLI_CALLER_ID` from the environment. */
  callerId?: string;
  /** Booli API key. Defaults to `BOOLI_API_KEY` from the environment. */
  apiKey?: string;
  /** Per-request timeout in ms. Default 20000. */
  timeoutMs?: number;
  /** Retry attempts on 429/5xx/network error. Default 2 (3 tries total). */
  maxRetries?: number;
  /** Client version, surfaced in the User-Agent. */
  version?: string;
  /** Injected fetch (tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Clock for the `time` auth param (ms). Injectable for tests. */
  now?: () => number;
  /** Nonce generator for the `unique` auth param. Injectable for tests. */
  uniqueFn?: () => string;
}

/** Sleep helper — extracted so it's obvious in a backoff loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A non-retryable HTTP failure (a non-2xx that isn't 429/5xx). */
class HardHttpError extends Error {}

export class DirectTransport implements BooliTransport {
  private readonly baseUrl: string;
  private readonly callerId: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly uniqueFn: () => string;

  constructor(opts: DirectTransportOptions = {}) {
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    // Deferred config: read creds, but don't throw when they're missing.
    this.callerId = opts.callerId ?? readEnvVar('BOOLI_CALLER_ID');
    this.apiKey = opts.apiKey ?? readEnvVar('BOOLI_API_KEY');
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.userAgent = `booli-mcp/${opts.version ?? '0.0.0'} (+https://github.com/chrischall/booli-mcp)`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.uniqueFn = opts.uniqueFn ?? randomUnique;
  }

  /** Resolve credentials or throw an actionable config error. */
  private requireCreds(): { callerId: string; apiKey: string } {
    if (!this.callerId || !this.apiKey) {
      throw new McpToolError(
        'Booli credentials are not configured. Set BOOLI_CALLER_ID and ' +
          'BOOLI_API_KEY (request them at https://www.booli.se/p/api — accept ' +
          "the API terms and the key is emailed to you), then restart the server.",
      );
    }
    return { callerId: this.callerId, apiKey: this.apiKey };
  }

  /** Build the signed request URL for a path + query. */
  private buildUrl(path: string, query: BooliQuery): string {
    const { callerId, apiKey } = this.requireCreds();
    const auth = buildAuthParams({
      callerId,
      apiKey,
      time: this.now(),
      unique: this.uniqueFn(),
    });
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...auth })) {
      if (value !== undefined) search.set(key, String(value));
    }
    return `${this.baseUrl}/${path}?${search.toString()}`;
  }

  async get<T>(path: string, query: BooliQuery = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await delay(2 ** attempt * 250);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'user-agent': this.userAgent,
          },
          signal: controller.signal,
        });

        if (res.ok) {
          try {
            return (await res.json()) as T;
          } catch {
            throw new HardHttpError(
              'Booli API returned a non-JSON success response.',
            );
          }
        }
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw await this.hardHttpError(res);
        }
        lastError = new Error(`Booli API HTTP ${res.status}`);
      } catch (err) {
        // A hard HTTP error is terminal — propagate at once. Network
        // errors and aborts (timeouts) fall through to the next attempt.
        if (err instanceof HardHttpError) throw err;
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new McpToolError(
      truncateErrorMessage(
        redactSecrets(
          `Booli API request failed: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`,
        ),
      ),
    );
  }

  /** Build a diagnostic error for a non-retryable HTTP failure. */
  private async hardHttpError(res: Response): Promise<HardHttpError> {
    let bodyHead = '';
    try {
      bodyHead = (await res.text()).slice(0, 200);
    } catch {
      // Diagnostics are best-effort; the status alone still tells the story.
    }
    const hint =
      res.status === 401 || res.status === 403
        ? ' — check BOOLI_CALLER_ID / BOOLI_API_KEY are correct.'
        : '';
    return new HardHttpError(
      truncateErrorMessage(
        redactSecrets(
          `Booli API HTTP ${res.status}${
            bodyHead ? ` — ${bodyHead}` : ''
          }${hint}`,
        ),
      ),
    );
  }
}
