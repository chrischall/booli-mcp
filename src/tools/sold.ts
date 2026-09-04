/**
 * `booli_search_sold` — the sold-prices (slutpriser) surface, Booli's
 * signature comparables dataset.
 *
 * Resolves the area, maps the shared + sold-specific price/date filters
 * onto Booli's `searchSold` input, and projects to the slim
 * {@link PropertySummary} by default. (Single-property detail — active or
 * sold — is `booli_get_listing`, since Booli resolves both by residence
 * id.)
 */
import { minifiedResult, resolveView, viewParam } from '@chrischall/mcp-utils';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatSold } from '../format.js';
import { BOOLI_VIEWS, buildCommonFilters, buildSearchInput, commonSearchShape, resolveAreaId, type CommonSearchArgs } from './_shared.js';
import type { SearchFilter } from '../graphql.js';

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

/** The sold-specific filters (price + date) as `{key, value}` pairs. */
export function soldFilters(args: SoldSearchArgs): SearchFilter[] {
  const filters: SearchFilter[] = [];
  if (args.min_sold_price !== undefined)
    filters.push({ key: 'minSoldPrice', value: String(args.min_sold_price) });
  if (args.max_sold_price !== undefined)
    filters.push({ key: 'maxSoldPrice', value: String(args.max_sold_price) });
  if (args.min_sold_sqm_price !== undefined)
    filters.push({ key: 'minSoldSqmPrice', value: String(args.min_sold_sqm_price) });
  if (args.max_sold_sqm_price !== undefined)
    filters.push({ key: 'maxSoldSqmPrice', value: String(args.max_sold_sqm_price) });
  if (args.min_sold_date !== undefined)
    filters.push({ key: 'minSoldDate', value: args.min_sold_date });
  if (args.max_sold_date !== undefined)
    filters.push({ key: 'maxSoldDate', value: args.max_sold_date });
  return filters;
}

export const soldSearchShape = { ...commonSearchShape, ...soldFilterShape };

export function registerSoldTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_search_sold',
    {
      title: 'Search Booli sold listings (slutpriser)',
      description:
        'Search sold properties (slutpriser) on booli.se with the achieved final ' +
        'price and over/under-asking % — the comparables for valuation. Scope by ' +
        '`area_id` or free-text `location`, filter by sold price, sold date, rooms, ' +
        'area, object type. Paginated by `page`. Read-only.',
      annotations: {
        title: 'Search Booli sold listings',
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: soldSearchShape,
    },
    async (args: SoldSearchArgs) => {
      const areaId = await resolveAreaId(client, args);
      const filters = [...buildCommonFilters(args), ...soldFilters(args)];
      const input = buildSearchInput(areaId, filters, args);
      const { total_count, pages, sold } = await client.searchSold(input);
      const compact = resolveView(args.view, BOOLI_VIEWS) === 'compact';
      return minifiedResult({
        total_count,
        pages,
        page: input.page,
        count: sold.length,
        area_id: areaId,
        sold: compact ? sold.map(formatSold) : sold,
      });
    },
  );
}
