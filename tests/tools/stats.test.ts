import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { fakeTransport } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerStatsTools } from '../../src/tools/stats.js';
import { SOLD } from '../fixtures.js';

async function mount(handler: Parameters<typeof fakeTransport>[0]) {
  const transport = fakeTransport(handler);
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerStatsTools(s, client));
  return { h, transport };
}

describe('booli_market_stats', () => {
  it('aggregates sold rows and defaults the sample size to 100', async () => {
    const { h, transport } = await mount(() => ({ totalCount: 1, sold: [SOLD] }));
    const res = await h.callTool('booli_market_stats', { area_id: '76' });
    const body = parseToolResult<{
      total_count: number;
      sample_size: number;
      median_sold_price: number;
    }>(res);
    expect(body.total_count).toBe(1);
    expect(body.sample_size).toBe(1);
    expect(body.median_sold_price).toBe(1_680_000);
    expect(transport.calls[0]!.query.limit).toBe(100);
    await h.close();
  });

  it('honours an explicit limit', async () => {
    const { h, transport } = await mount(() => ({ sold: [] }));
    await h.callTool('booli_market_stats', { area_id: '76', limit: 50 });
    expect(transport.calls[0]!.query.limit).toBe(50);
    await h.close();
  });
});
