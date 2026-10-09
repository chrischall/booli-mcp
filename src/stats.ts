/**
 * Pure aggregation over a set of sold properties → market statistics.
 *
 * Kept separate from the tool so it's unit-testable without a client. The
 * arithmetic is realty-core's shared `computeMarketStats` (fleet-audit#988 —
 * hemnet carries the same stats over different field names); this file only
 * names Booli's fields and keeps the output keys (`median_sold_price`, …)
 * exactly as before. Operates on the normalised {@link PropertySummary}
 * shape (kronor + m²), skipping rows where the relevant field is null (or
 * not a finite number) so a sparse dataset still yields honest medians.
 * `sample_size` counts every row; the `*_count` fields count the rows that
 * actually fed each metric (a row with a null `sold_price` still counts
 * toward `sample_size` but not toward `median_sold_price`), so check the
 * matching count before trusting a thin median.
 */
import { computeMarketStats as computeSharedMarketStats, numericColumn } from '@chrischall/realty-core';
import type { PropertySummary } from './format.js';

export interface MarketStats {
  sample_size: number;
  /** Rows with a usable `sold_price` (feeds the sold-price metrics). */
  sold_price_count: number;
  /** Rows with a usable `price_per_sqm`. */
  price_per_sqm_count: number;
  /** Rows with a usable `sold_vs_asking_percent`. */
  price_change_count: number;
  median_sold_price: number | null;
  average_sold_price: number | null;
  median_price_per_sqm: number | null;
  average_price_per_sqm: number | null;
  average_price_change_percent: number | null;
  min_sold_price: number | null;
  max_sold_price: number | null;
}

export function computeMarketStats(rows: PropertySummary[]): MarketStats {
  const s = computeSharedMarketStats(rows, {
    price: 'sold_price',
    pricePerSqm: 'price_per_sqm',
    // Booli reports each sale's over/under-asking % directly.
    priceChangePercent: 'sold_vs_asking_percent',
    priceName: 'sold_price',
  });
  // Rebuilt in the documented key order rather than spread, so the public
  // shape is pinned here and not by realty-core's construction order.
  return {
    sample_size: s.sample_size,
    sold_price_count: numericColumn(rows, 'sold_price').length,
    price_per_sqm_count: numericColumn(rows, 'price_per_sqm').length,
    price_change_count: numericColumn(rows, 'sold_vs_asking_percent').length,
    median_sold_price: s.median_sold_price,
    average_sold_price: s.average_sold_price,
    median_price_per_sqm: s.median_price_per_sqm,
    average_price_per_sqm: s.average_price_per_sqm,
    average_price_change_percent: s.average_price_change_percent,
    min_sold_price: s.min_sold_price,
    max_sold_price: s.max_sold_price,
  };
}
