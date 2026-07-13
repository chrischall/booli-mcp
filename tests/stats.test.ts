import { describe, it, expect } from 'vitest';
import { computeMarketStats } from '../src/stats.js';
import { formatProperty } from '../src/format.js';
import type { PropertySummary } from '../src/format.js';

describe('computeMarketStats', () => {
  it('aggregates median/average/min/max and over-asking % over sold rows', () => {
    const rows: PropertySummary[] = [
      formatProperty({ soldPrice: 1_000_000, listPrice: 900_000, livingArea: 50 }),
      formatProperty({ soldPrice: 2_000_000, listPrice: 2_000_000, livingArea: 100 }),
      formatProperty({ soldPrice: 3_000_000, listPrice: 3_300_000, livingArea: 100 }),
    ];
    const stats = computeMarketStats(rows);
    expect(stats.sample_size).toBe(3);
    expect(stats.median_sold_price).toBe(2_000_000);
    expect(stats.average_sold_price).toBe(2_000_000);
    expect(stats.min_sold_price).toBe(1_000_000);
    expect(stats.max_sold_price).toBe(3_000_000);
    // price/m²: 20000, 20000, 30000 → median 20000, avg ≈ 23333
    expect(stats.median_price_per_sqm).toBe(20_000);
    expect(stats.average_price_per_sqm).toBe(Math.round((20000 + 20000 + 30000) / 3));
    // changes: +11.11%, 0%, -9.09% → mean ≈ 0.7 → rounded 0.7
    expect(stats.average_price_change_percent).toBeCloseTo(0.7, 1);
  });

  it('takes the mean of the two middle values for an even sample', () => {
    const rows = [
      formatProperty({ soldPrice: 1_000_000 }),
      formatProperty({ soldPrice: 2_000_000 }),
    ];
    expect(computeMarketStats(rows).median_sold_price).toBe(1_500_000);
  });

  it('returns null metrics for an empty sample', () => {
    const stats = computeMarketStats([]);
    expect(stats).toEqual({
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
    const rows = [
      formatProperty({ soldPrice: 1_000_000 }), // no livingArea → no per-sqm, no change
      formatProperty({ listPrice: 500_000 }), // no soldPrice
    ];
    const stats = computeMarketStats(rows);
    expect(stats.sample_size).toBe(2);
    expect(stats.median_sold_price).toBe(1_000_000);
    expect(stats.median_price_per_sqm).toBeNull();
    expect(stats.average_price_change_percent).toBeNull();
  });
});
