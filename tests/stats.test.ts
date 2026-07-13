import { describe, it, expect } from 'vitest';
import { computeMarketStats } from '../src/stats.js';
import { formatSold } from '../src/format.js';
import type { PropertySummary } from '../src/format.js';

/** A sold summary from partial raw fields. */
function sold(fields: {
  soldPrice?: number;
  soldSqmPrice?: number;
  diff?: number;
}): PropertySummary {
  return formatSold({
    __typename: 'SoldProperty',
    soldPrice: fields.soldPrice != null ? { raw: fields.soldPrice } : null,
    soldSqmPrice: fields.soldSqmPrice != null ? { raw: fields.soldSqmPrice } : null,
    soldPricePercentageDiff: fields.diff != null ? { raw: fields.diff } : null,
  });
}

describe('computeMarketStats', () => {
  it('aggregates median/average/min/max and average over-asking %', () => {
    const rows = [
      sold({ soldPrice: 1_000_000, soldSqmPrice: 20_000, diff: 11 }),
      sold({ soldPrice: 2_000_000, soldSqmPrice: 20_000, diff: 0 }),
      sold({ soldPrice: 3_000_000, soldSqmPrice: 30_000, diff: -9 }),
    ];
    const stats = computeMarketStats(rows);
    expect(stats.sample_size).toBe(3);
    expect(stats.median_sold_price).toBe(2_000_000);
    expect(stats.average_sold_price).toBe(2_000_000);
    expect(stats.min_sold_price).toBe(1_000_000);
    expect(stats.max_sold_price).toBe(3_000_000);
    expect(stats.median_price_per_sqm).toBe(20_000);
    expect(stats.average_price_per_sqm).toBe(Math.round((20000 + 20000 + 30000) / 3));
    expect(stats.average_price_change_percent).toBeCloseTo(0.7, 1);
  });

  it('takes the mean of the two middle values for an even sample', () => {
    const rows = [sold({ soldPrice: 1_000_000 }), sold({ soldPrice: 2_000_000 })];
    expect(computeMarketStats(rows).median_sold_price).toBe(1_500_000);
  });

  it('returns null metrics for an empty sample', () => {
    expect(computeMarketStats([])).toEqual({
      sample_size: 0,
      median_sold_price: null,
      average_sold_price: null,
      median_price_per_sqm: null,
      average_price_per_sqm: null,
      average_price_change_percent: null,
      min_sold_price: null,
      max_sold_price: null,
    });
  });

  it('skips rows missing the relevant field', () => {
    const rows = [sold({ soldPrice: 1_000_000 }), sold({ diff: 5 })];
    const stats = computeMarketStats(rows);
    expect(stats.sample_size).toBe(2);
    expect(stats.median_sold_price).toBe(1_000_000);
    expect(stats.median_price_per_sqm).toBeNull();
    expect(stats.average_price_change_percent).toBe(5);
  });
});
