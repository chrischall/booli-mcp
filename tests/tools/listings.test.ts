import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { fakeTransport } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerListingTools } from '../../src/tools/listings.js';
import { AREA, DETAIL, LISTING } from '../fixtures.js';

async function mount(handler: Parameters<typeof fakeTransport>[0]) {
  const transport = fakeTransport(handler);
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerListingTools(s, client));
  return { h, transport };
}

/** Route by operation name for these tools. */
function route(query: string) {
  if (query.includes('SearchForSale'))
    return { data: { searchForSale: { totalCount: 1, pages: 1, result: [LISTING] } } };
  if (query.includes('AreaSuggestions'))
    return { data: { areaSuggestionSearch: { suggestions: [AREA] } } };
  if (query.includes('PropertyDetail'))
    return { data: { propertyByResidenceId: DETAIL } };
  return { errors: [{ message: 'unexpected' }] };
}

describe('booli_search_listings', () => {
  it('maps filters into the SearchRequest input and returns compact rows', async () => {
    const { h, transport } = await mount(route);
    const res = await h.callTool('booli_search_listings', {
      area_id: '76',
      object_type: 'Lägenhet',
      min_rooms: 2,
      max_rooms: 4,
      min_living_area: 40,
      min_list_price: 1_000_000,
      max_list_price: 5_000_000,
      min_list_sqm_price: 10_000,
      max_list_sqm_price: 90_000,
      is_new_construction: true,
      sort: 'listPrice',
      ascending: true,
      page: 2,
    });
    const body = parseToolResult<{ total_count: number; listings: { booli_id: string }[] }>(res);
    expect(body.total_count).toBe(1);
    expect(body.listings[0]!.booli_id).toBe('6151864');

    const input = transport.calls[0]!.variables.input as {
      areaId: string; page: number; ascending: boolean; sort: string;
      filters: { key: string; value: string }[];
    };
    expect(input).toMatchObject({ areaId: '76', page: 2, ascending: true, sort: 'listPrice' });
    expect(input.filters).toEqual(
      expect.arrayContaining([
        { key: 'objectType', value: 'Lägenhet' },
        { key: 'minRooms', value: '2' },
        { key: 'maxRooms', value: '4' },
        { key: 'minLivingArea', value: '40' },
        { key: 'isNewConstruction', value: '1' },
        { key: 'minListPrice', value: '1000000' },
        { key: 'maxListPrice', value: '5000000' },
        { key: 'minListSqmPrice', value: '10000' },
        { key: 'maxListSqmPrice', value: '90000' },
      ]),
    );
  });

  it('resolves a free-text location to its top area id', async () => {
    const { h, transport } = await mount(route);
    await h.callTool('booli_search_listings', { location: 'Nacka' });
    expect((transport.calls[1]!.variables.input as { areaId: string }).areaId).toBe('76');
  });

  it('errors when neither area_id nor location is given', async () => {
    const { h } = await mount(route);
    const res = await h.callTool('booli_search_listings', {});
    expect(res.isError).toBe(true);
    await h.close();
  });

  it('errors when a free-text location resolves to nothing', async () => {
    const { h } = await mount((q) =>
      q.includes('AreaSuggestions')
        ? { data: { areaSuggestionSearch: { suggestions: [] } } }
        : { errors: [{ message: 'x' }] },
    );
    const res = await h.callTool('booli_search_listings', { location: 'Nowhere' });
    expect(res.isError).toBe(true);
    await h.close();
  });

  it('returns full raw records when compact is false', async () => {
    const { h } = await mount(route);
    const res = await h.callTool('booli_search_listings', { area_id: '76', compact: false });
    const body = parseToolResult<{ listings: { listSqmPrice: { raw: number } }[] }>(res);
    expect(body.listings[0]!.listSqmPrice.raw).toBe(54_167);
  });
});

describe('booli_get_listing', () => {
  it('returns the compact detail when found', async () => {
    const { h, transport } = await mount(route);
    const res = await h.callTool('booli_get_listing', { residence_id: '4370936', compact: true });
    const body = parseToolResult<{ found: boolean; property: { residence_id: string } }>(res);
    expect(body.found).toBe(true);
    expect(body.property.residence_id).toBe('4370936');
    expect(transport.calls[0]!.variables).toEqual({ residenceId: '4370936' });
  });

  it('returns the raw node by default', async () => {
    const { h } = await mount(route);
    const res = await h.callTool('booli_get_listing', { residence_id: '4370936' });
    const body = parseToolResult<{ property: { __typename: string } }>(res);
    expect(body.property.__typename).toBe('Listing');
  });

  it('reports not-found with a hint', async () => {
    const { h } = await mount(() => ({ data: { propertyByResidenceId: null } }));
    const res = await h.callTool('booli_get_listing', { residence_id: '0' });
    const body = parseToolResult<{ found: boolean; hint: string }>(res);
    expect(body.found).toBe(false);
    expect(body.hint).toMatch(/residence id/);
    await h.close();
  });
});
