import { describe, it, expect } from 'vitest';
import { formatArea, formatProperty } from '../src/format.js';
import { AREA, LISTING, SOLD } from './fixtures.js';

describe('formatProperty', () => {
  it('projects a for-sale listing with derived price-per-m² and absolute URL', () => {
    const s = formatProperty(LISTING);
    expect(s).toMatchObject({
      booli_id: 1579812,
      object_type: 'Lägenhet',
      tenure_form: 'Bostadsrätt',
      street_address: 'Alphyddevägen 15',
      area: 'Alphyddan',
      municipality: 'Nacka',
      county: 'Stockholms län',
      rooms: 3,
      living_area: 70,
      list_price: 2_395_000,
      sold_price: null,
      rent: 3220,
      construction_year: 1965,
      latitude: 59.3,
      longitude: 18.15,
      source: 'Svenska Hem',
    });
    // 2 395 000 / 70 ≈ 34 214
    expect(s.price_per_sqm).toBe(Math.round(2_395_000 / 70));
    expect(s.url).toBe(
      'https://www.booli.se/bostad/lagenhet/alphyddan/alphyddevagen+15/1579812',
    );
  });

  it('uses the sold price for price-per-m² on a sold listing', () => {
    const s = formatProperty(SOLD);
    expect(s.sold_price).toBe(1_680_000);
    expect(s.sold_date).toBe('2012-11-06');
    expect(s.price_per_sqm).toBe(Math.round(1_680_000 / 73));
  });

  it('degrades gracefully on a sparse record', () => {
    const s = formatProperty({ booliId: 5 });
    expect(s.booli_id).toBe(5);
    expect(s.street_address).toBeNull();
    expect(s.municipality).toBeNull();
    expect(s.price_per_sqm).toBeNull();
    expect(s.url).toBeNull();
    expect(s.area).toBeNull();
  });

  it('falls back to city for area and passes through an absolute url', () => {
    const s = formatProperty({
      location: { address: { city: 'Boo' } },
      url: 'https://example.com/x',
    });
    expect(s.area).toBe('Boo');
    expect(s.url).toBe('https://example.com/x');
  });

  it('prefixes a relative url lacking a leading slash', () => {
    const s = formatProperty({ url: 'bostad/1' });
    expect(s.url).toBe('https://www.booli.se/bostad/1');
  });

  it('returns null price-per-m² when living area is zero', () => {
    expect(formatProperty({ listPrice: 1_000_000, livingArea: 0 }).price_per_sqm).toBeNull();
  });
});

describe('formatArea', () => {
  it('projects an area hit', () => {
    expect(formatArea(AREA)).toEqual({
      booli_id: 76,
      name: 'Nacka',
      full_name: 'Nacka, Stockholms Län',
      types: ['Kommun'],
      parent_booli_id: 2,
      parent_name: 'Stockholms län',
    });
  });

  it('defaults types to an empty array', () => {
    expect(formatArea({ booliId: 1 }).types).toEqual([]);
  });

  it('nulls every field for an empty area object', () => {
    expect(formatArea({})).toEqual({
      booli_id: null,
      name: null,
      full_name: null,
      types: [],
      parent_booli_id: null,
      parent_name: null,
    });
  });
});
