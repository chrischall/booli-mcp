import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { fakeTransport } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerStatsTools } from '../../src/tools/stats.js';
import { AREA, SOLD } from '../fixtures.js';

async function mount(handler: Parameters<typeof fakeTransport>[0]) {
  const transport = fakeTransport(handler);
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerStatsTools(s, client));
  return { h, transport };
}

describe('booli_market_stats', () => {
  it('aggregates sold rows into statistics for an explicit area', async () => {
    const { h, transport } = await mount(() => ({
      data: { searchSold: { totalCount: 1, pages: 1, result: [SOLD] } },
    }));
    const res = await h.callTool('booli_market_stats', { area_id: '76' });
    const body = parseToolResult<{
      total_count: number; area_id: string; sample_size: number; median_sold_price: number;
    }>(res);
    expect(body.total_count).toBe(1);
    expect(body.area_id).toBe('76');
    expect(body.sample_size).toBe(1);
    expect(body.median_sold_price).toBe(16_000_000);
    expect((transport.calls[0]!.variables.input as { areaId: string }).areaId).toBe('76');
  });

  it('resolves a free-text location before aggregating', async () => {
    const { h } = await mount((q) =>
      q.includes('AreaSuggestions')
        ? { data: { areaSuggestionSearch: { suggestions: [AREA] } } }
        : { data: { searchSold: { totalCount: 0, pages: 0, result: [] } } },
    );
    const res = await h.callTool('booli_market_stats', { location: 'Nacka' });
    const body = parseToolResult<{ area_id: string; sample_size: number }>(res);
    expect(body.area_id).toBe('76');
    expect(body.sample_size).toBe(0);
    await h.close();
  });

  it('samples the most recent sales by default (soldDate descending)', async () => {
    const { h, transport } = await mount(() => ({
      data: { searchSold: { totalCount: 1, pages: 1, result: [SOLD] } },
    }));
    await h.callTool('booli_market_stats', { area_id: '76' });
    const input = transport.calls[0]!.variables.input as { sort: string; ascending: boolean };
    expect(input).toMatchObject({ sort: 'soldDate', ascending: false });
    await h.close();
  });

  it('rejects an inverted band instead of reporting an empty sample', async () => {
    const { h, transport } = await mount(() => ({
      data: { searchSold: { totalCount: 0, pages: 0, result: [] } },
    }));
    const res = await h.callTool('booli_market_stats', {
      area_id: '76', min_sold_date: '20250101', max_sold_date: '20240101',
    });
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/min_sold_date.*max_sold_date/);
    expect(transport.calls).toHaveLength(0);
    await h.close();
  });

  it('says which page the sample is and how many pages exist', async () => {
    const { h, transport } = await mount(() => ({
      data: { searchSold: { totalCount: 4210, pages: 120, result: [SOLD] } },
    }));
    const res = await h.callTool('booli_market_stats', { area_id: '76', page: 3 });
    const body = parseToolResult<{
      total_count: number; page: number; pages: number; sample_size: number; sold_price_count: number;
    }>(res);
    expect(body).toMatchObject({ total_count: 4210, page: 3, pages: 120, sample_size: 1, sold_price_count: 1 });
    expect((transport.calls[0]!.variables.input as { page: number }).page).toBe(3);
    await h.close();
  });
});
