/**
 * `booli_search_sold` + `booli_get_sold` — the sold-prices (slutpriser)
 * surface, Booli's signature comparables dataset.
 *
 * Search maps the shared geo/filter args plus sold-price + sold-date
 * filters onto Booli's `/sold` query; detail fetches one sold record by
 * Booli id. Both project to the slim {@link PropertySummary} by default.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatProperty } from '../format.js';
import { textResult } from '../mcp.js';
import {
  buildCommonQuery,
  commonSearchShape,
  type CommonSearchArgs,
} from './_shared.js';

/** Sold-specific price + date filters. */
const soldFilterShape = {
  min_sold_price: z.number().nonnegative().optional().describe('SEK'),
  max_sold_price: z.number().nonnegative().optional().describe('SEK'),
  min_sold_sqm_price: z.number().nonnegative().optional().describe('SEK/m²'),
  max_sold_sqm_price: z.number().nonnegative().optional().describe('SEK/m²'),
  min_sold_date: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe('Earliest sold date, YYYYMMDD (e.g. "20240101").'),
  max_sold_date: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe('Latest sold date, YYYYMMDD.'),
};

export interface SoldSearchArgs extends CommonSearchArgs {
  min_sold_price?: number;
  max_sold_price?: number;
  min_sold_sqm_price?: number;
  max_sold_sqm_price?: number;
  min_sold_date?: string;
  max_sold_date?: string;
}

/** Layer the sold filters onto a base query built from the shared args. */
export function buildSoldQuery(args: SoldSearchArgs) {
  const query = buildCommonQuery(args);
  if (args.min_sold_price !== undefined) query.minSoldPrice = args.min_sold_price;
  if (args.max_sold_price !== undefined) query.maxSoldPrice = args.max_sold_price;
  if (args.min_sold_sqm_price !== undefined)
    query.minSoldSqmPrice = args.min_sold_sqm_price;
  if (args.max_sold_sqm_price !== undefined)
    query.maxSoldSqmPrice = args.max_sold_sqm_price;
  if (args.min_sold_date !== undefined) query.minSoldDate = args.min_sold_date;
  if (args.max_sold_date !== undefined) query.maxSoldDate = args.max_sold_date;
  return query;
}

export const soldSearchShape = { ...commonSearchShape, ...soldFilterShape };

export function registerSoldTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_search_sold',
    {
      title: 'Search Booli sold listings (slutpriser)',
      description:
        'Search sold properties (slutpriser) on booli.se with the achieved final ' +
        'price — the comparables for valuation. Scope by q / area_id / center+dim / ' +
        'bbox and filter by sold price, sold date, rooms, area, object type. Read-only.',
      annotations: {
        title: 'Search Booli sold listings',
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: soldSearchShape,
    },
    async (args: SoldSearchArgs) => {
      const { total_count, properties } = await client.searchSold(buildSoldQuery(args));
      const compact = args.compact ?? true;
      return textResult({
        total_count,
        count: properties.length,
        sold: compact ? properties.map(formatProperty) : properties,
      });
    },
  );

  server.registerTool(
    'booli_get_sold',
    {
      title: 'Get a Booli sold listing',
      description:
        'Full detail for one sold listing by its Booli id, including final price ' +
        'and sold date. Read-only.',
      annotations: {
        title: 'Get a Booli sold listing',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        booli_id: z.string().describe('The sold listing\'s Booli id (e.g. "181051").'),
        compact: z
          .boolean()
          .optional()
          .describe('Return a slim summary instead of the full raw record (default false).'),
      },
    },
    async (args: { booli_id: string; compact?: boolean }) => {
      const node = await client.getSold(args.booli_id);
      if (node == null) {
        return textResult({
          found: false,
          booli_id: args.booli_id,
          hint: 'No sold listing with that id. It may still be for sale — try booli_get_listing.',
        });
      }
      return textResult({
        found: true,
        sold: args.compact ? formatProperty(node) : node,
      });
    },
  );
}
