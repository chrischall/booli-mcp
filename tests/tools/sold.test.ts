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

describe('booli_search_sold', () => {
  it('maps sold-specific filters and returns compact rows by default', async () => {
    const { h, transport } = await mount(() => ({ totalCount: 2, sold: [SOLD] }));
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
    expect(body.sold[0]!.sold_price).toBe(1_680_000);
    expect(transport.calls[0]!.query).toMatchObject({
      areaId: '76',
      minSoldPrice: 1_000_000,
      maxSoldPrice: 4_000_000,
      minSoldSqmPrice: 10_000,
      maxSoldSqmPrice: 70_000,
      minSoldDate: '20240101',
      maxSoldDate: '20241231',
    });
    await h.close();
  });

  it('rejects a malformed sold date', async () => {
    const { h } = await mount(() => ({ sold: [] }));
    const res = await h.callTool('booli_search_sold', { min_sold_date: '2024-01-01' });
    expect(res.isError).toBe(true);
    await h.close();
  });

  it('returns full raw records when compact is false', async () => {
    const { h } = await mount(() => ({ sold: [SOLD] }));
    const res = await h.callTool('booli_search_sold', { q: 'x', compact: false });
    const body = parseToolResult<{ sold: { soldDate: string }[] }>(res);
    expect(body.sold[0]!.soldDate).toBe('2012-11-06');
    await h.close();
  });
});

describe('booli_get_sold', () => {
  it('returns the compact sold record when found', async () => {
    const { h, transport } = await mount(() => ({ sold: [SOLD] }));
    const res = await h.callTool('booli_get_sold', { booli_id: '181051', compact: true });
    const body = parseToolResult<{ found: boolean; sold: { sold_price: number } }>(res);
    expect(body.found).toBe(true);
    expect(body.sold.sold_price).toBe(1_680_000);
    expect(transport.calls[0]!.path).toBe('sold/181051');
    await h.close();
  });

  it('returns the raw node by default', async () => {
    const { h } = await mount(() => ({ sold: [SOLD] }));
    const res = await h.callTool('booli_get_sold', { booli_id: '181051' });
    const body = parseToolResult<{ sold: { booliId: number } }>(res);
    expect(body.sold.booliId).toBe(181051);
    await h.close();
  });

  it('reports not-found with a hint to try the for-sale tool', async () => {
    const { h } = await mount(() => ({ sold: [] }));
    const res = await h.callTool('booli_get_sold', { booli_id: '0' });
    const body = parseToolResult<{ found: boolean; hint: string }>(res);
    expect(body.found).toBe(false);
    expect(body.hint).toMatch(/booli_get_listing/);
    await h.close();
  });
});
