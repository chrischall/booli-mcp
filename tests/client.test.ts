import { describe, it, expect, vi } from 'vitest';
import type { BridgeHealthcheckTransport } from '@chrischall/mcp-utils/fetchproxy';
import { BooliClient } from '../src/client.js';
import { fakeBridgeHealth, fakeTransport, routedClient } from './helpers.js';
import { AREA, DETAIL, LISTING, PROJECT_NODE, SOLD } from './fixtures.js';

describe('BooliClient', () => {
  it('areaSuggestions returns the suggestions array', async () => {
    const client = routedClient({
      AreaSuggestions: { data: { areaSuggestionSearch: { suggestions: [AREA] } } },
    });
    const hits = await client.areaSuggestions('nacka');
    expect(hits[0]!.id).toBe(76);
  });

  it('areaSuggestions tolerates a null suggestions field', async () => {
    const client = routedClient({
      AreaSuggestions: { data: { areaSuggestionSearch: { suggestions: null } } },
    });
    expect(await client.areaSuggestions('x')).toEqual([]);
  });

  it('searchForSale keeps only Listing nodes and reads totalCount/pages', async () => {
    const t = fakeTransport(() => ({
      data: { searchForSale: { totalCount: 427, pages: 33, result: [PROJECT_NODE, LISTING] } },
    }));
    const client = new BooliClient({ transport: t });
    const res = await client.searchForSale({
      areaId: '76', page: 1, ascending: false, excludeAncestors: true, facets: [], filters: [], sort: '',
    });
    expect(res.total_count).toBe(427);
    expect(res.pages).toBe(33);
    expect(res.listings).toHaveLength(1);
    expect(res.listings[0]!.booliId).toBe('6151864');
    expect(t.calls[0]!.variables.input).toMatchObject({ areaId: '76' });
  });

  it('searchForSale degrades to zero/empty on a null result', async () => {
    const client = routedClient({ SearchForSale: { data: { searchForSale: null } } });
    const res = await client.searchForSale({
      areaId: '1', page: 1, ascending: false, excludeAncestors: true, facets: [], filters: [], sort: '',
    });
    expect(res).toEqual({ total_count: 0, pages: 0, listings: [] });
  });

  it('searchSold keeps only SoldProperty nodes', async () => {
    const client = routedClient({
      SearchSold: { data: { searchSold: { totalCount: 3, pages: 1, result: [SOLD] } } },
    });
    const res = await client.searchSold({
      areaId: '76', page: 1, ascending: false, excludeAncestors: true, facets: [], filters: [], sort: '',
    });
    expect(res.total_count).toBe(3);
    expect(res.sold[0]!.soldPrice!.raw).toBe(16_000_000);
  });

  it('searchSold degrades to zero/empty on a null result', async () => {
    const client = routedClient({ SearchSold: { data: { searchSold: null } } });
    const res = await client.searchSold({
      areaId: '1', page: 1, ascending: false, excludeAncestors: true, facets: [], filters: [], sort: '',
    });
    expect(res).toEqual({ total_count: 0, pages: 0, sold: [] });
  });

  it('getProperty returns the detail node', async () => {
    const t = fakeTransport(() => ({ data: { propertyByResidenceId: DETAIL } }));
    const client = new BooliClient({ transport: t });
    const node = await client.getProperty('4370936');
    expect(node!.residenceId).toBe('4370936');
    expect(t.calls[0]!.variables).toEqual({ residenceId: '4370936' });
  });

  it('getProperty returns null when the id resolves to nothing', async () => {
    const client = routedClient({ PropertyDetail: { data: { propertyByResidenceId: null } } });
    expect(await client.getProperty('0')).toBeNull();
  });

  it('throws a redacted McpToolError on a GraphQL errors array', async () => {
    const client = routedClient({ SearchForSale: { errors: [{ message: 'boom' }] } });
    await expect(
      client.searchForSale({ areaId: '1', page: 1, ascending: false, excludeAncestors: true, facets: [], filters: [], sort: '' }),
    ).rejects.toThrow(/Booli GraphQL error: boom/);
  });

  it('throws on a null data envelope', async () => {
    const client = routedClient({ AreaSuggestions: { data: null } });
    await expect(client.areaSuggestions('x')).rejects.toThrow(/empty response/);
  });

  it('healthcheck round-trips area suggestions and reports hit count', async () => {
    const t = fakeTransport(() => ({ data: { areaSuggestionSearch: { suggestions: [AREA] } } }));
    const client = new BooliClient({ transport: t });
    expect(await client.healthcheck()).toEqual({ ok: true, hits: 1 });
  });

  it('forwards transportStatus and bridgeTransport when the transport reports them', () => {
    const bridge: BridgeHealthcheckTransport = { runProbe: vi.fn(), status: () => fakeBridgeHealth() };
    const client = new BooliClient({
      transport: {
        ...fakeTransport(() => ({ data: {} })),
        status: () => ({ transport: 'fetchproxy', mode: 'auto' }),
        bridgeTransport: () => bridge,
      },
    });
    expect(client.transportStatus()).toEqual({ transport: 'fetchproxy', mode: 'auto' });
    expect(client.bridgeTransport()).toBe(bridge);
  });

  it('returns undefined for transportStatus and bridgeTransport on a bare transport', () => {
    const client = new BooliClient({ transport: fakeTransport(() => ({ data: {} })) });
    expect(client.transportStatus()).toBeUndefined();
    expect(client.bridgeTransport()).toBeUndefined();
  });
});
