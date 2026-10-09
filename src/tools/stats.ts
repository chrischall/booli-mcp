/**
 * `booli_market_stats` — median/average sold-price statistics for an
 * area. Runs the same sold search as `booli_search_sold` (accepting the
 * same filters) across a page of results and aggregates them locally via
 * {@link computeMarketStats}, rather than returning the individual rows.
 * Reports `page`/`pages` beside `total_count` and a per-metric row count
 * beside `sample_size` — treat a thin sample's median with care.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { BooliClient } from '../client.js';
import { formatSold } from '../format.js';
import { computeMarketStats } from '../stats.js';
import { minifiedResult } from '@chrischall/mcp-utils';
import {
  assertOrderedBands,
  buildCommonFilters,
  buildSearchInput,
  resolveAreaId,
} from './_shared.js';
import { SOLD_BANDS, SOLD_DEFAULT_SORT, soldFilters, soldSearchSchema, type SoldSearchArgs } from './sold.js';

export function registerStatsTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_market_stats',
    {
      title: 'Booli sold-price market statistics',
      description:
        'Aggregate sold-price statistics (median/average final price, price per m², ' +
        'average over/under-asking %) for an area on booli.se. Takes the same scope ' +
        'and filters as booli_search_sold, computed over ONE page of sold results ' +
        '(most recent first by default) — `page`/`pages` say which, and ' +
        '`total_count` is the whole matching set, not the sample. `sample_size` ' +
        'is the rows on the page; `sold_price_count` / `price_per_sqm_count` / ' +
        '`price_change_count` are the rows that fed each metric. Check them ' +
        'before trusting a thin median. Read-only.',
      annotations: {
        title: 'Booli sold-price market statistics',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: soldSearchSchema,
    },
    async (args: SoldSearchArgs) => {
      assertOrderedBands(args, SOLD_BANDS);
      const areaId = await resolveAreaId(client, args);
      const filters = [...buildCommonFilters(args), ...soldFilters(args)];
      const input = buildSearchInput(areaId, filters, args, SOLD_DEFAULT_SORT);
      const { total_count, pages, sold } = await client.searchSold(input);
      const stats = computeMarketStats(sold.map(formatSold));
      // `total_count` is the whole matching set; the stats cover only this
      // one `page` of it — echo both so the sample is never mistaken for
      // the area.
      return minifiedResult({ total_count, pages, page: input.page, area_id: areaId, ...stats });
    },
  );
}
