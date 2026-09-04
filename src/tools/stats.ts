/**
 * `booli_market_stats` — median/average sold-price statistics for an
 * area. Runs the same sold search as `booli_search_sold` (accepting the
 * same filters) across a page of results and aggregates them locally via
 * {@link computeMarketStats}, rather than returning the individual rows.
 * Always reports `sample_size` — treat a thin sample's median with care.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatSold } from '../format.js';
import { computeMarketStats } from '../stats.js';
import { minifiedResult } from '../mcp.js';
import {
  buildCommonFilters,
  buildSearchInput,
  resolveAreaId,
} from './_shared.js';
import { soldFilters, soldSearchShape, type SoldSearchArgs } from './sold.js';

export function registerStatsTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_market_stats',
    {
      title: 'Booli sold-price market statistics',
      description:
        'Aggregate sold-price statistics (median/average final price, price per m², ' +
        'average over/under-asking %) for an area on booli.se. Takes the same scope ' +
        'and filters as booli_search_sold, over one page of sold results. Check ' +
        '`sample_size` before trusting a thin median. Read-only.',
      annotations: {
        title: 'Booli sold-price market statistics',
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: soldSearchShape,
    },
    async (args: SoldSearchArgs) => {
      const areaId = await resolveAreaId(client, args);
      const filters = [...buildCommonFilters(args), ...soldFilters(args)];
      const input = buildSearchInput(areaId, filters, args);
      const { total_count, sold } = await client.searchSold(input);
      const stats = computeMarketStats(sold.map(formatSold));
      return minifiedResult({ total_count, area_id: areaId, ...stats });
    },
  );
}
