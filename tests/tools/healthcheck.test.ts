import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerHealthcheckTools } from '../../src/tools/healthcheck.js';
import type { BooliTransport } from '../../src/transport.js';
import { AREA } from '../fixtures.js';

async function mount(transport: BooliTransport) {
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerHealthcheckTools(s, client));
  return h;
}

describe('booli_healthcheck', () => {
  it('reports ok with a hit count on a healthy round-trip', async () => {
    const h = await mount({
      async graphql<T>() {
        return { data: { areaSuggestionSearch: { suggestions: [AREA] } } } as unknown as T;
      },
    });
    const res = await h.callTool('booli_healthcheck', {});
    const body = parseToolResult<{ ok: boolean; hits: number; elapsed_ms: number }>(res);
    expect(body.ok).toBe(true);
    expect(body.hits).toBe(1);
    expect(typeof body.elapsed_ms).toBe('number');
    await h.close();
  });

  it('gives a bridge hint when the failure looks like a Cloudflare wall', async () => {
    const h = await mount({
      async graphql<T>(): Promise<T> {
        throw new Error('Booli GraphQL returned non-JSON via the browser bridge');
      },
    });
    const res = await h.callTool('booli_healthcheck', {});
    const body = parseToolResult<{ ok: boolean; hint: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.hint).toMatch(/BOOLI_TRANSPORT=fetchproxy/);
    await h.close();
  });

  it('gives a generic hint on a non-wall failure', async () => {
    const h = await mount({
      async graphql<T>(): Promise<T> {
        throw new Error('network down');
      },
    });
    const res = await h.callTool('booli_healthcheck', {});
    const body = parseToolResult<{ ok: boolean; hint: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.hint).toMatch(/network reachability/);
    await h.close();
  });
});
