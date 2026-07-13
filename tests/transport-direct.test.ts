import { describe, it, expect, vi } from 'vitest';
import { CloudflareChallengeError, DirectTransport } from '../src/transport-direct.js';

/** A fetch stub returning queued responses (last one repeats). */
function stubFetch(
  responses: Array<{
    ok?: boolean;
    status?: number;
    body?: unknown;
    text?: string;
    headers?: Record<string, string>;
  }>,
) {
  const calls: string[] = [];
  let i = 0;
  const impl = vi.fn(async (url: string) => {
    calls.push(url);
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      async json() {
        if (r.text !== undefined) throw new Error('not json');
        return r.body;
      },
      async text() {
        return r.text ?? JSON.stringify(r.body);
      },
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('DirectTransport.graphql', () => {
  it('POSTs the operation to the GraphQL endpoint and returns the envelope', async () => {
    const { impl, calls } = stubFetch([{ body: { data: { ok: true } } }]);
    const t = new DirectTransport({ fetchImpl: impl });
    const res = await t.graphql('query X { x }', { a: 1 });
    expect(res).toEqual({ data: { ok: true } });
    expect(calls[0]).toBe('https://www.booli.se/graphql');
  });

  it('throws CloudflareChallengeError on the cf-mitigated header', async () => {
    const { impl } = stubFetch([
      { ok: false, status: 403, text: 'blocked', headers: { 'cf-mitigated': 'challenge' } },
    ]);
    const t = new DirectTransport({ fetchImpl: impl, maxRetries: 0 });
    await expect(t.graphql('q', {})).rejects.toBeInstanceOf(CloudflareChallengeError);
  });

  it('detects the interstitial body markers as a challenge', async () => {
    const { impl } = stubFetch([
      { ok: false, status: 403, text: '<html><title>Just a moment...</title>' },
    ]);
    const t = new DirectTransport({ fetchImpl: impl, maxRetries: 0 });
    await expect(t.graphql('q', {})).rejects.toBeInstanceOf(CloudflareChallengeError);
  });

  it('surfaces a non-challenge hard error with body + diagnostics', async () => {
    const { impl } = stubFetch([
      { ok: false, status: 400, text: 'bad query', headers: { server: 'nginx' } },
    ]);
    const t = new DirectTransport({ fetchImpl: impl, maxRetries: 0 });
    await expect(t.graphql('q', {})).rejects.toThrow(/HTTP 400.*bad query/s);
    await expect(t.graphql('q', {})).rejects.not.toBeInstanceOf(CloudflareChallengeError);
  });

  it('tolerates an unreadable error body on a hard failure', async () => {
    const badBody = {
      ok: false,
      status: 404,
      async json() { throw new Error('x'); },
      async text() { throw new Error('stream broke'); },
      headers: { get: () => null },
    } as unknown as Response;
    const impl = (async () => badBody) as unknown as typeof fetch;
    const t = new DirectTransport({ fetchImpl: impl, maxRetries: 0 });
    // 404 is non-retryable → hardHttpError; the text() throw is swallowed and
    // the message carries just the status (empty body, no diagnostics).
    await expect(t.graphql('q', {})).rejects.toThrow(/HTTP 404/);
  });

  it('retries a retryable 5xx then succeeds', async () => {
    const { impl, calls } = stubFetch([
      { ok: false, status: 503, text: 'busy' },
      { body: { data: { ok: 1 } } },
    ]);
    const t = new DirectTransport({ fetchImpl: impl });
    expect(await t.graphql('q', {})).toEqual({ data: { ok: 1 } });
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries on persistent 5xx', async () => {
    const { impl, calls } = stubFetch([{ ok: false, status: 500, text: 'down' }]);
    const t = new DirectTransport({ fetchImpl: impl, maxRetries: 1 });
    await expect(t.graphql('q', {})).rejects.toThrow(/HTTP 500/);
    expect(calls).toHaveLength(2);
  });

  it('surfaces a non-Error network rejection after retries', async () => {
    const impl = (async () => {
      throw 'raw failure';
    }) as unknown as typeof fetch;
    const t = new DirectTransport({ fetchImpl: impl, maxRetries: 0 });
    await expect(t.graphql('q', {})).rejects.toThrow(/request failed/);
  });

  it('aborts a request that exceeds the timeout', async () => {
    const impl = ((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const t = new DirectTransport({ fetchImpl: impl, timeoutMs: 5, maxRetries: 0 });
    await expect(t.graphql('q', {})).rejects.toThrow(/aborted/);
  });

  it('defaults to the global fetch when none is injected', () => {
    expect(new DirectTransport()).toBeInstanceOf(DirectTransport);
  });
});
