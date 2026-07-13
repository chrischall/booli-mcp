import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerHealthcheckTools } from '../../src/tools/healthcheck.js';
import type { BooliTransport } from '../../src/transport.js';
import { AREA } from '../fixtures.js';

describe('booli_healthcheck', () => {
  it('reports ok with a hit count on a healthy round-trip', async () => {
    const transport: BooliTransport = { async get<T>() { return { areas: [AREA] } as T; } };
    const client = new BooliClient({ transport });
    const h = await createTestHarness((s) => registerHealthcheckTools(s, client));
    const res = await h.callTool('booli_healthcheck', {});
    const body = parseToolResult<{ ok: boolean; hits: number; elapsed_ms: number }>(res);
    expect(body.ok).toBe(true);
    expect(body.hits).toBe(1);
    expect(typeof body.elapsed_ms).toBe('number');
    await h.close();
  });

  it('reports not-ok with the error message when the API fails', async () => {
    const transport: BooliTransport = {
      async get<T>(): Promise<T> {
        throw new Error('Booli credentials are not configured');
      },
    };
    const client = new BooliClient({ transport });
    const h = await createTestHarness((s) => registerHealthcheckTools(s, client));
    const res = await h.callTool('booli_healthcheck', {});
    const body = parseToolResult<{ ok: boolean; error: string; hint: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/);
    expect(body.hint).toMatch(/BOOLI_CALLER_ID/);
    await h.close();
  });
});
