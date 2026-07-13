import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '../helpers.js';
import { fakeTransport } from '../helpers.js';
import { BooliClient } from '../../src/client.js';
import { registerListingTools } from '../../src/tools/listings.js';
import { LISTING } from '../fixtures.js';

async function mount(handler: Parameters<typeof fakeTransport>[0]) {
  const transport = fakeTransport(handler);
  const client = new BooliClient({ transport });
  const h = await createTestHarness((s) => registerListingTools(s, client));
  return { h, transport };
}

describe('booli_search_listings', () => {
  it('maps every filter onto Booli query params and returns compact rows by default', async () => {
    const { h, transport } = await mount(() => ({
      totalCount: 1,
      listings: [LISTING],
    }));
    const res = await h.callTool('booli_search_listings', {
      q: 'nacka',
      area_id: '76,16',
      center: '59.3,18.0',
      dim: '400,500',
      bbox: '59.1,17.9,59.5,18.3',
      object_type: 'lägenhet,villa',
      min_rooms: 2,
      max_rooms: 4,
      min_living_area: 40,
      max_living_area: 120,
      min_plot_area: 100,
      max_plot_area: 900,
      max_rent: 5000,
      min_construction_year: 1950,
      max_construction_year: 2020,
      is_new_construction: false,
      min_list_price: 1_000_000,
      max_list_price: 5_000_000,
      min_list_sqm_price: 10_000,
      max_list_sqm_price: 90_000,
      limit: 20,
      offset: 10,
    });
    const body = parseToolResult<{ total_count: number; listings: { booli_id: number }[] }>(res);
    expect(body.total_count).toBe(1);
    expect(body.listings[0]!.booli_id).toBe(1579812);

    const sent = transport.calls[0]!.query;
    expect(sent).toMatchObject({
      q: 'nacka',
      areaId: '76,16',
      center: '59.3,18.0',
      dim: '400,500',
      bbox: '59.1,17.9,59.5,18.3',
      objectType: 'lägenhet,villa',
      minRooms: 2,
      maxRooms: 4,
      minLivingArea: 40,
      maxLivingArea: 120,
      minPlotArea: 100,
      maxPlotArea: 900,
      maxRent: 5000,
      minConstructionYear: 1950,
      maxConstructionYear: 2020,
      isNewConstruction: 0,
      minListPrice: 1_000_000,
      maxListPrice: 5_000_000,
      minListSqmPrice: 10_000,
      maxListSqmPrice: 90_000,
      limit: 20,
      offset: 10,
    });
    await h.close();
  });

  it('defaults limit to 30 and maps is_new_construction true to 1', async () => {
    const { h, transport } = await mount(() => ({ listings: [] }));
    await h.callTool('booli_search_listings', { q: 'x', is_new_construction: true });
    expect(transport.calls[0]!.query.limit).toBe(30);
    expect(transport.calls[0]!.query.isNewConstruction).toBe(1);
    await h.close();
  });

  it('returns full raw records when compact is false', async () => {
    const { h } = await mount(() => ({ listings: [LISTING] }));
    const res = await h.callTool('booli_search_listings', { q: 'x', compact: false });
    const body = parseToolResult<{ listings: { source: { name: string } }[] }>(res);
    expect(body.listings[0]!.source.name).toBe('Svenska Hem');
    await h.close();
  });
});

describe('booli_get_listing', () => {
  it('returns the compact listing when found', async () => {
    const { h, transport } = await mount(() => ({ listings: [LISTING] }));
    const res = await h.callTool('booli_get_listing', { booli_id: '1579812', compact: true });
    const body = parseToolResult<{ found: boolean; listing: { booli_id: number } }>(res);
    expect(body.found).toBe(true);
    expect(body.listing.booli_id).toBe(1579812);
    expect(transport.calls[0]!.path).toBe('listings/1579812');
    await h.close();
  });

  it('returns the raw node by default (compact omitted)', async () => {
    const { h } = await mount(() => ({ listings: [LISTING] }));
    const res = await h.callTool('booli_get_listing', { booli_id: '1579812' });
    const body = parseToolResult<{ listing: { objectType: string } }>(res);
    expect(body.listing.objectType).toBe('Lägenhet');
    await h.close();
  });

  it('reports not-found with a hint to try sold', async () => {
    const { h } = await mount(() => ({ listings: [] }));
    const res = await h.callTool('booli_get_listing', { booli_id: '0' });
    const body = parseToolResult<{ found: boolean; hint: string }>(res);
    expect(body.found).toBe(false);
    expect(body.hint).toMatch(/booli_get_sold/);
    await h.close();
  });
});
