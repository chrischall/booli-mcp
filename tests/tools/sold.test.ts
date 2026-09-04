import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { fakeTransport } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerSoldTools } from '../../src/tools/sold.js';
import { SOLD } from '../fixtures.js';

async function mount(handler: Parameters<typeof fakeTransport>[0]) {
  const transport = fakeTransport(handler);
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerSoldTools(s, client));
  return { h, transport };
}

const route = () => ({ data: { searchSold: { totalCount: 2, pages: 1, result: [SOLD] } } });

describe('booli_search_sold', () => {
  it('maps sold-specific price + date filters and returns compact rows', async () => {
    const { h, transport } = await mount(route);
    const res = await h.callTool('booli_search_sold', {
      area_id: '76',
      min_sold_price: 1_000_000,
      max_sold_price: 4_000_000,
      min_sold_sqm_price: 10_000,
      max_sold_sqm_price: 70_000,
      min_sold_date: '20240101',
      max_sold_date: '20241231',
    });
    const body = parseToolResult<{ total_count: number; sold: { sold_price: number }[] }>(res);
    expect(body.total_count).toBe(2);
    expect(body.sold[0]!.sold_price).toBe(16_000_000);

    const input = transport.calls[0]!.variables.input as {
      filters: { key: string; value: string }[];
    };
    expect(input.filters).toEqual(
      expect.arrayContaining([
        { key: 'minSoldPrice', value: '1000000' },
        { key: 'maxSoldPrice', value: '4000000' },
        { key: 'minSoldSqmPrice', value: '10000' },
        { key: 'maxSoldSqmPrice', value: '70000' },
        { key: 'minSoldDate', value: '20240101' },
        { key: 'maxSoldDate', value: '20241231' },
      ]),
    );
  });

  it('rejects a malformed sold date', async () => {
    const { h } = await mount(route);
    const res = await h.callTool('booli_search_sold', { area_id: '1', min_sold_date: '2024-01-01' });
    expect(res.isError).toBe(true);
    await h.close();
  });

  it('returns full raw records on view:"full"', async () => {
    const { h } = await mount(route);
    const res = await h.callTool('booli_search_sold', { area_id: '1', view: 'full' });
    const body = parseToolResult<{ sold: { soldDate: string }[] }>(res);
    expect(body.sold[0]!.soldDate).toBe('2026-07-13');
    await h.close();
  });

  it('maps is_new_construction false to the "0" filter', async () => {
    const { h, transport } = await mount(route);
    await h.callTool('booli_search_sold', { area_id: '1', is_new_construction: false });
    const input = transport.calls[0]!.variables.input as { filters: { key: string; value: string }[] };
    expect(input.filters).toContainEqual({ key: 'isNewConstruction', value: '0' });
    await h.close();
  });
});
