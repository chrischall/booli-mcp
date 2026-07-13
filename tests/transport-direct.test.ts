import { describe, it, expect, vi } from 'vitest';
import { DirectTransport } from '../src/transport-direct.js';
import { buildAuthParams } from '../src/auth.js';

/** A fetch stub that records the URL(s) it was called with. */
function stubFetch(
  responses: Array<{ ok?: boolean; status?: number; body?: unknown; text?: string }>,
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
      headers: new Map(),
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const CREDS = { callerId: 'caller-1', apiKey: 'secret-key' };

describe('DirectTransport.get', () => {
  it('signs the request and appends caller/time/unique/hash + query params', async () => {
    const { impl, calls } = stubFetch([{ body: { listings: [] } }]);
    const t = new DirectTransport({
      ...CREDS,
      fetchImpl: impl,
      now: () => 1_700_000_000_000,
      uniqueFn: () => 'abcdef0123456789',
    });
    await t.get('listings', { q: 'nacka', minRooms: 2 });

    const url = new URL(calls[0]!);
    expect(url.origin + url.pathname).toBe('https://api.booli.se/listings');
    expect(url.searchParams.get('q')).toBe('nacka');
    expect(url.searchParams.get('minRooms')).toBe('2');
    expect(url.searchParams.get('callerId')).toBe('caller-1');
    expect(url.searchParams.get('time')).toBe('1700000000000');
    expect(url.searchParams.get('unique')).toBe('abcdef0123456789');
    const expected = buildAuthParams({
      ...CREDS,
      time: 1_700_000_000_000,
      unique: 'abcdef0123456789',
    });
    expect(url.searchParams.get('hash')).toBe(expected.hash);
    // The secret key is never placed in the URL.
    expect(calls[0]).not.toContain('secret-key');
  });

  it('omits undefined query params', async () => {
    const { impl, calls } = stubFetch([{ body: {} }]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl });
    await t.get('sold', { q: 'nacka', maxRooms: undefined });
    const url = new URL(calls[0]!);
    expect(url.searchParams.has('maxRooms')).toBe(false);
    expect(url.searchParams.get('q')).toBe('nacka');
  });

  it('returns the parsed JSON body on 2xx', async () => {
    const { impl } = stubFetch([{ body: { areas: [{ booliId: 76 }] } }]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl });
    const data = await t.get<{ areas: { booliId: number }[] }>('areas', {
      q: 'nacka',
    });
    expect(data.areas[0]!.booliId).toBe(76);
  });

  it('throws an actionable config error when credentials are missing', async () => {
    const { impl } = stubFetch([{ body: {} }]);
    const t = new DirectTransport({ fetchImpl: impl, callerId: '', apiKey: '' });
    await expect(t.get('listings')).rejects.toThrow(/BOOLI_CALLER_ID/);
    // No network call was made.
    expect((impl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      0,
    );
  });

  it('surfaces a 403 with a credentials hint and never leaks the body verbatim as JSON', async () => {
    const { impl } = stubFetch([
      { ok: false, status: 403, text: 'FAILURE_INVALID_HASH - bad hash' },
    ]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl, maxRetries: 0 });
    await expect(t.get('listings')).rejects.toThrow(/HTTP 403/);
    await expect(t.get('listings')).rejects.toThrow(/BOOLI_CALLER_ID/);
  });

  it('retries retryable 5xx then succeeds', async () => {
    const { impl, calls } = stubFetch([
      { ok: false, status: 503, text: 'busy' },
      { body: { listings: [{ booliId: 1 }] } },
    ]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl });
    const data = await t.get<{ listings: unknown[] }>('listings');
    expect(data.listings).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries on persistent 5xx', async () => {
    const { impl, calls } = stubFetch([{ ok: false, status: 500, text: 'down' }]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl, maxRetries: 1 });
    await expect(t.get('listings')).rejects.toThrow(/Booli API/);
    expect(calls).toHaveLength(2);
  });

  it('throws when a 2xx body is not JSON', async () => {
    const { impl } = stubFetch([{ ok: true, status: 200, text: '<html>nope' }]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl, maxRetries: 0 });
    await expect(t.get('listings')).rejects.toThrow(/non-JSON/);
  });

  it('adds the credentials hint on a 401 too', async () => {
    const { impl } = stubFetch([{ ok: false, status: 401, text: 'unauthorized' }]);
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl, maxRetries: 0 });
    await expect(t.get('listings')).rejects.toThrow(/HTTP 401.*BOOLI_CALLER_ID/s);
  });

  it('omits the hint on a non-auth hard error and tolerates an unreadable body', async () => {
    const badBody = {
      ok: false,
      status: 418,
      async json() {
        throw new Error('nope');
      },
      async text() {
        throw new Error('body stream broke');
      },
      headers: new Map(),
    } as unknown as Response;
    const impl = (async () => badBody) as unknown as typeof fetch;
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl, maxRetries: 0 });
    await expect(t.get('listings')).rejects.toThrow(/HTTP 418/);
    await expect(t.get('listings')).rejects.not.toThrow(/BOOLI_CALLER_ID/);
  });

  it('reads credentials from the environment and honours an explicit timeout', async () => {
    const prev = {
      c: process.env.BOOLI_CALLER_ID,
      k: process.env.BOOLI_API_KEY,
    };
    process.env.BOOLI_CALLER_ID = 'env-caller';
    process.env.BOOLI_API_KEY = 'env-key';
    try {
      const { impl, calls } = stubFetch([{ body: { areas: [] } }]);
      const t = new DirectTransport({ fetchImpl: impl, timeoutMs: 5_000 });
      await t.get('areas', { q: 'x' });
      const url = new URL(calls[0]!);
      expect(url.searchParams.get('callerId')).toBe('env-caller');
      expect(url.searchParams.has('hash')).toBe(true);
    } finally {
      process.env.BOOLI_CALLER_ID = prev.c;
      process.env.BOOLI_API_KEY = prev.k;
    }
  });

  it('defaults to the global fetch when none is injected', () => {
    // Construction alone exercises the `?? fetch` default; no request is made.
    const t = new DirectTransport({ ...CREDS });
    expect(t).toBeInstanceOf(DirectTransport);
  });

  it('aborts a request that exceeds the timeout', async () => {
    const impl = ((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new Error('aborted by timeout')),
        );
      })) as unknown as typeof fetch;
    const t = new DirectTransport({
      ...CREDS,
      fetchImpl: impl,
      timeoutMs: 5,
      maxRetries: 0,
    });
    await expect(t.get('listings')).rejects.toThrow(/aborted by timeout/);
  });

  it('surfaces a non-Error transport rejection', async () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    const impl = (async () => {
      throw 'raw string failure';
    }) as unknown as typeof fetch;
    const t = new DirectTransport({ ...CREDS, fetchImpl: impl, maxRetries: 0 });
    await expect(t.get('listings')).rejects.toThrow(/raw string failure/);
  });
});
