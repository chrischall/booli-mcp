import { describe, it, expect } from 'vitest';
import {
  extractResidenceId,
  formatArea,
  formatDetail,
  formatListing,
  formatSold,
} from '../src/format.js';
import { AREA, DETAIL, LISTING, SOLD } from './fixtures.js';

describe('formatListing', () => {
  it('projects a for-sale listing with FormattedValue.raw pulled out', () => {
    const s = formatListing(LISTING);
    expect(s).toMatchObject({
      booli_id: '6151864',
      residence_id: '4370936',
      object_type: 'Lägenhet',
      tenure_form: 'Bostadsrätt',
      street_address: 'Turbinvägen 5A',
      area: 'Järla Sjö',
      municipality: 'Nacka',
      county: 'Stockholms län',
      rooms: 2,
      living_area: 60,
      list_price: 3_250_000,
      sold_price: null,
      price_per_sqm: 54_167,
      rent: 4100,
      is_new_construction: false,
      url: 'https://www.booli.se/bostad/4370936',
    });
  });

  it('degrades gracefully on a sparse record', () => {
    const s = formatListing({ __typename: 'Listing', booliId: '5' });
    expect(s.booli_id).toBe('5');
    expect(s.street_address).toBeNull();
    expect(s.rooms).toBeNull();
    expect(s.price_per_sqm).toBeNull();
    expect(s.url).toBeNull();
    expect(s.area).toBeNull();
  });

  it('falls back to descriptiveAreaName when namedAreas is absent', () => {
    const s = formatListing({ descriptiveAreaName: 'Boo', url: 'https://x/y' });
    expect(s.area).toBe('Boo');
    expect(s.url).toBe('https://x/y');
  });

  it('prefixes a relative url lacking a leading slash', () => {
    expect(formatListing({ url: 'bostad/1' }).url).toBe('https://www.booli.se/bostad/1');
  });
});

describe('formatSold', () => {
  it('projects a sold listing with sold price, sqm price and over/under-asking %', () => {
    const s = formatSold(SOLD);
    expect(s).toMatchObject({
      booli_id: '6100827',
      residence_id: '2358472',
      sold_price: 16_000_000,
      sold_date: '2026-07-13',
      price_per_sqm: 46_921,
      sold_vs_asking_percent: -20,
      list_price: 20_000_000,
      rooms: 10,
    });
    expect(s.rent).toBeNull();
  });
});

describe('formatDetail', () => {
  it('projects the full detail node for a for-sale property', () => {
    const d = formatDetail(DETAIL);
    expect(d).toMatchObject({
      booli_id: '6151864',
      residence_id: '4370936',
      is_sold: false,
      construction_year: 2017,
      operating_cost: 1084,
      list_price: 3_250_000,
      list_price_per_sqm: 54_167,
      list_vs_estimate_percent: 5,
      estimate: 3_400_000,
      bidding_open: false,
      upcoming_sale: false,
      agency: 'Fantastic Frank',
    });
  });

  it('marks a SoldProperty detail as sold and reads sold fields', () => {
    const d = formatDetail({ __typename: 'SoldProperty', soldPrice: { raw: 9 }, biddingOpen: 1 });
    expect(d.is_sold).toBe(true);
    expect(d.sold_price).toBe(9);
    expect(d.bidding_open).toBe(true);
  });

  it('derives residence_id from the url when the field is absent', () => {
    expect(formatDetail({ url: '/bostad/999' }).residence_id).toBe('999');
    expect(formatDetail({}).residence_id).toBeNull();
    expect(formatDetail({}).bidding_open).toBeNull();
  });
});

describe('formatArea', () => {
  it('projects an area suggestion, stringifying the id', () => {
    expect(formatArea(AREA)).toEqual({ area_id: '76', display_name: 'Nacka kommun' });
  });
  it('nulls a missing id', () => {
    expect(formatArea({ displayName: 'x' }).area_id).toBeNull();
  });
  it('nulls a missing display name', () => {
    expect(formatArea({ id: 5 })).toEqual({ area_id: '5', display_name: null });
  });
});

describe('extractResidenceId', () => {
  it('pulls the id from a /bostad/ url and null otherwise', () => {
    expect(extractResidenceId('/bostad/4370936')).toBe('4370936');
    expect(extractResidenceId('/maklarbyra/x')).toBeNull();
    expect(extractResidenceId(null)).toBeNull();
  });
});
