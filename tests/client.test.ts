import { describe, it, expect } from 'vitest';
import { BooliClient } from '../src/client.js';
import { fakeTransport, routedClient } from './helpers.js';
import { AREA, LISTING, SOLD } from './fixtures.js';

describe('BooliClient', () => {
  it('searchListings reads the `listings` envelope key + totalCount', async () => {
    const t = fakeTransport(() => ({
      totalCount: 42,
      count: 1,
      listings: [LISTING],
    }));
    const client = new BooliClient({ transport: t });
    const res = await client.searchListings({ q: 'nacka' });
    expect(res.total_count).toBe(42);
    expect(res.properties).toHaveLength(1);
    expect(t.calls[0]).toEqual({ path: 'listings', query: { q: 'nacka' } });
  });

  it('searchSold reads the `sold` envelope key', async () => {
    const client = routedClient({ sold: { totalCount: 3, sold: [SOLD] } });
    const res = await client.searchSold({ areaId: 76 });
    expect(res.total_count).toBe(3);
    expect(res.properties[0]!.booliId).toBe(181051);
  });

  it('falls back to array length when totalCount is absent', async () => {
    const client = routedClient({ listings: { listings: [LISTING, LISTING] } });
    const res = await client.searchListings({});
    expect(res.total_count).toBe(2);
  });

  it('searchSold falls back to array length, then 0, when totalCount is absent', async () => {
    const withRows = routedClient({ sold: { sold: [SOLD, SOLD] } });
    expect((await withRows.searchSold({})).total_count).toBe(2);
    const empty = routedClient({ sold: {} });
    expect(await empty.searchSold({})).toEqual({ total_count: 0, properties: [] });
  });

  it('returns empty results for a null envelope array', async () => {
    const client = routedClient({ listings: { listings: null } });
    const res = await client.searchListings({});
    expect(res).toEqual({ total_count: 0, properties: [] });
  });

  it('getListing pulls the first node from listings/:id', async () => {
    const t = fakeTransport(() => ({ listings: [LISTING] }));
    const client = new BooliClient({ transport: t });
    const node = await client.getListing('1579812');
    expect(node!.booliId).toBe(1579812);
    expect(t.calls[0]!.path).toBe('listings/1579812');
  });

  it('getListing returns null when the id resolves to nothing', async () => {
    const client = routedClient({ listings: { listings: [] } });
    expect(await client.getListing('0')).toBeNull();
  });

  it('getSold pulls the first node from sold/:id', async () => {
    const client = routedClient({ sold: { sold: [SOLD] } });
    const node = await client.getSold('181051');
    expect(node!.soldPrice).toBe(1_680_000);
  });

  it('getSold returns null when absent', async () => {
    const client = routedClient({ sold: {} });
    expect(await client.getSold('0')).toBeNull();
  });

  it('searchAreas reads the `areas` envelope key', async () => {
    const client = routedClient({ areas: { areas: [AREA] } });
    const areas = await client.searchAreas({ q: 'nacka' });
    expect(areas[0]!.booliId).toBe(76);
  });

  it('searchAreas tolerates a missing areas array', async () => {
    const client = routedClient({ areas: {} });
    expect(await client.searchAreas({})).toEqual([]);
  });

  it('healthcheck round-trips /areas and reports hit count', async () => {
    const t = fakeTransport(() => ({ areas: [AREA] }));
    const client = new BooliClient({ transport: t });
    expect(await client.healthcheck()).toEqual({ ok: true, hits: 1 });
    expect(t.calls[0]).toEqual({ path: 'areas', query: { q: 'Stockholm', limit: 1 } });
  });
});
