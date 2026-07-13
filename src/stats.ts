/**
 * Pure aggregation over a set of sold properties → market statistics.
 *
 * Kept separate from the tool so it's unit-testable without a client.
 * Operates on the normalised {@link PropertySummary} shape (kronor + m²),
 * skipping rows where the relevant field is null so a sparse dataset
 * still yields honest medians. Always check `sample_size` before trusting
 * a thin median.
 */
import type { PropertySummary } from './format.js';

export interface MarketStats {
  sample_size: number;
  median_sold_price: number | null;
  average_sold_price: number | null;
  median_price_per_sqm: number | null;
  average_price_per_sqm: number | null;
  average_price_change_percent: number | null;
  min_sold_price: number | null;
  max_sold_price: number | null;
}

/** Median of a numeric array (already length-checked by the caller). */
function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Non-null values of one numeric field across the rows. */
function column(rows: PropertySummary[], key: keyof PropertySummary): number[] {
  return rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number');
}

/**
 * Per-row sold-vs-asking change %, over rows that carry both a sold price
 * and a list price (asking). Positive = sold over asking.
 */
function priceChanges(rows: PropertySummary[]): number[] {
  const changes: number[] = [];
  for (const r of rows) {
    if (typeof r.sold_price === 'number' && typeof r.list_price === 'number' && r.list_price > 0) {
      changes.push(((r.sold_price - r.list_price) / r.list_price) * 100);
    }
  }
  return changes;
}

export function computeMarketStats(rows: PropertySummary[]): MarketStats {
  const sold = column(rows, 'sold_price');
  const perSqm = column(rows, 'price_per_sqm');
  const changes = priceChanges(rows);
  return {
    sample_size: rows.length,
    median_sold_price: sold.length ? Math.round(median(sold)) : null,
    average_sold_price: sold.length ? Math.round(mean(sold)) : null,
    median_price_per_sqm: perSqm.length ? Math.round(median(perSqm)) : null,
    average_price_per_sqm: perSqm.length ? Math.round(mean(perSqm)) : null,
    average_price_change_percent: changes.length
      ? Math.round(mean(changes) * 10) / 10
      : null,
    min_sold_price: sold.length ? Math.min(...sold) : null,
    max_sold_price: sold.length ? Math.max(...sold) : null,
  };
}
