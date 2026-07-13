/**
 * `booli_search_listings` + `booli_get_listing` — the for-sale surface.
 *
 * Search maps the shared geo/filter args (plus for-sale price filters)
 * onto Booli's `/listings` query; detail fetches one listing by Booli id.
 * Both project to the slim {@link PropertySummary} by default (`compact`),
 * with the full raw record one flag away.
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

/** For-sale price filters layered on top of the shared search shape. */
const listingPriceShape = {
  min_list_price: z.number().nonnegative().optional().describe('SEK'),
  max_list_price: z.number().nonnegative().optional().describe('SEK'),
  min_list_sqm_price: z.number().nonnegative().optional().describe('SEK/m²'),
  max_list_sqm_price: z.number().nonnegative().optional().describe('SEK/m²'),
};

interface ListingSearchArgs extends CommonSearchArgs {
  min_list_price?: number;
  max_list_price?: number;
  min_list_sqm_price?: number;
  max_list_sqm_price?: number;
}

export function registerListingTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_search_listings',
    {
      title: 'Search Booli for-sale listings',
      description:
        'Search active for-sale property listings on booli.se. Scope by q / area_id ' +
        '(from booli_search_areas) / center+dim / bbox, and filter by price, rooms, ' +
        'living area, plot, object type, construction year. Read-only.',
      annotations: {
        title: 'Search Booli for-sale listings',
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: { ...commonSearchShape, ...listingPriceShape },
    },
    async (args: ListingSearchArgs) => {
      const query = buildCommonQuery(args);
      if (args.min_list_price !== undefined) query.minListPrice = args.min_list_price;
      if (args.max_list_price !== undefined) query.maxListPrice = args.max_list_price;
      if (args.min_list_sqm_price !== undefined)
        query.minListSqmPrice = args.min_list_sqm_price;
      if (args.max_list_sqm_price !== undefined)
        query.maxListSqmPrice = args.max_list_sqm_price;

      const { total_count, properties } = await client.searchListings(query);
      const compact = args.compact ?? true;
      return textResult({
        total_count,
        count: properties.length,
        listings: compact ? properties.map(formatProperty) : properties,
      });
    },
  );

  server.registerTool(
    'booli_get_listing',
    {
      title: 'Get a Booli for-sale listing',
      description:
        'Full detail for one active for-sale listing by its Booli id (the numeric ' +
        'id in a booli.se/bostad URL or a search result). Read-only.',
      annotations: {
        title: 'Get a Booli for-sale listing',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        booli_id: z.string().describe('The listing\'s Booli id (e.g. "1579812").'),
        compact: z
          .boolean()
          .optional()
          .describe('Return a slim summary instead of the full raw record (default false).'),
      },
    },
    async (args: { booli_id: string; compact?: boolean }) => {
      const node = await client.getListing(args.booli_id);
      if (node == null) {
        return textResult({
          found: false,
          booli_id: args.booli_id,
          hint: 'No for-sale listing with that id. It may be sold — try booli_get_sold.',
        });
      }
      return textResult({
        found: true,
        listing: args.compact ? formatProperty(node) : node,
      });
    },
  );
}
