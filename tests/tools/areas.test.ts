import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { fakeTransport } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerAreaTools } from '../../src/tools/areas.js';
import { AREA } from '../fixtures.js';

async function mount(handler: Parameters<typeof fakeTransport>[0]) {
  const transport = fakeTransport(handler);
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerAreaTools(s, client));
  return { h, transport };
}

describe('booli_search_areas', () => {
  it('resolves a name and projects area suggestions', async () => {
    const { h, transport } = await mount(() => ({
      data: { areaSuggestionSearch: { suggestions: [AREA, { id: 24617, displayName: 'Nacka Forum' }] } },
    }));
    const res = await h.callTool('booli_search_areas', { query: 'nacka' });
    const body = parseToolResult<{ count: number; areas: { area_id: string; display_name: string }[] }>(res);
    expect(body.count).toBe(2);
    expect(body.areas[0]!).toEqual({ area_id: '76', display_name: 'Nacka kommun' });
    expect(transport.calls[0]!.variables).toEqual({ search: 'nacka' });
  });

  it('honours the limit', async () => {
    const { h } = await mount(() => ({
      data: { areaSuggestionSearch: { suggestions: [AREA, AREA, AREA] } },
    }));
    const res = await h.callTool('booli_search_areas', { query: 'x', limit: 1 });
    const body = parseToolResult<{ count: number }>(res);
    expect(body.count).toBe(1);
    await h.close();
  });
});
