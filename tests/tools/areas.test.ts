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
  it('resolves a name and projects the area rows', async () => {
    const { h, transport } = await mount(() => ({ areas: [AREA] }));
    const res = await h.callTool('booli_search_areas', { q: 'nacka' });
    const body = parseToolResult<{ count: number; areas: { booli_id: number; full_name: string }[] }>(res);
    expect(body.count).toBe(1);
    expect(body.areas[0]!).toMatchObject({ booli_id: 76, full_name: 'Nacka, Stockholms Län' });
    expect(transport.calls[0]!.query).toEqual({ q: 'nacka', limit: 10 });
    await h.close();
  });

  it('passes coordinate + filter flags through', async () => {
    const { h, transport } = await mount(() => ({ areas: [] }));
    await h.callTool('booli_search_areas', {
      lat: 59.34,
      lng: 18.06,
      only_with_listings: true,
      only_with_sold: true,
      limit: 5,
    });
    expect(transport.calls[0]!.query).toEqual({
      lat: 59.34,
      lng: 18.06,
      listings: 1,
      transactions: 1,
      limit: 5,
    });
    await h.close();
  });

  it('omits the filter flags when false', async () => {
    const { h, transport } = await mount(() => ({ areas: [] }));
    await h.callTool('booli_search_areas', {
      q: 'x',
      only_with_listings: false,
      only_with_sold: false,
    });
    const q = transport.calls[0]!.query;
    expect(q.listings).toBeUndefined();
    expect(q.transactions).toBeUndefined();
    await h.close();
  });
});
