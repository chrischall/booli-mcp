/**
 * `booli_market_stats` — median/average sold-price statistics for an
 * area. Runs the same sold search as `booli_search_sold` (accepting the
 * same filters) and aggregates the results locally via
 * {@link computeMarketStats}, rather than returning the individual rows.
 * Always reports `sample_size` — treat a thin sample's median with care.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatProperty } from '../format.js';
import { computeMarketStats } from '../stats.js';
import { textResult } from '../mcp.js';
import { buildSoldQuery, soldSearchShape, type SoldSearchArgs } from './sold.js';

export function registerStatsTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_market_stats',
    {
      title: 'Booli sold-price market statistics',
      description:
        'Aggregate sold-price statistics (median/average final price, price per m², ' +
        'average over/under-asking %) for an area on booli.se. Takes the same scope ' +
        'and filters as booli_search_sold. Check `sample_size` before trusting a ' +
        'thin median. Read-only.',
      annotations: {
        title: 'Booli sold-price market statistics',
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: soldSearchShape,
    },
    async (args: SoldSearchArgs) => {
      // Default to a larger sample than a browse — stats want volume.
      const query = buildSoldQuery({ ...args, limit: args.limit ?? 100 });
      const { total_count, properties } = await client.searchSold(query);
      const stats = computeMarketStats(properties.map(formatProperty));
      return textResult({ total_count, ...stats });
    },
  );
}
