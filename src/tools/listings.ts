/**
 * `booli_search_listings` + `booli_get_listing` — the for-sale surface.
 *
 * Search resolves the area, maps the shared + for-sale price filters onto
 * Booli's `searchForSale` input, and projects to the slim
 * {@link PropertySummary} by default (`compact`). Detail fetches one
 * property by its residence id (the `/bostad/<id>` number).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatDetail, formatListing } from '../format.js';
import { textResult } from '../mcp.js';
import {
  buildCommonFilters,
  buildSearchInput,
  commonSearchShape,
  resolveAreaId,
  type CommonSearchArgs,
} from './_shared.js';
import type { SearchFilter } from '../graphql.js';

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
        'Search active for-sale property listings on booli.se. Scope by `area_id` ' +
        '(from booli_search_areas) or a free-text `location`, and filter by price, ' +
        'rooms, living area, plot, object type, construction year. Paginated by ' +
        '`page`; check `total_count`/`pages`. Read-only.',
      annotations: {
        title: 'Search Booli for-sale listings',
        readOnlyHint: true,
        openWorldHint: true,
      },
      inputSchema: { ...commonSearchShape, ...listingPriceShape },
    },
    async (args: ListingSearchArgs) => {
      const areaId = await resolveAreaId(client, args);
      const filters: SearchFilter[] = buildCommonFilters(args);
      if (args.min_list_price !== undefined)
        filters.push({ key: 'minListPrice', value: String(args.min_list_price) });
      if (args.max_list_price !== undefined)
        filters.push({ key: 'maxListPrice', value: String(args.max_list_price) });
      if (args.min_list_sqm_price !== undefined)
        filters.push({ key: 'minListSqmPrice', value: String(args.min_list_sqm_price) });
      if (args.max_list_sqm_price !== undefined)
        filters.push({ key: 'maxListSqmPrice', value: String(args.max_list_sqm_price) });

      const input = buildSearchInput(areaId, filters, args);
      const { total_count, pages, listings } = await client.searchForSale(input);
      const compact = args.compact ?? true;
      return textResult({
        total_count,
        pages,
        page: input.page,
        count: listings.length,
        area_id: areaId,
        listings: compact ? listings.map(formatListing) : listings,
      });
    },
  );

  server.registerTool(
    'booli_get_listing',
    {
      title: 'Get a Booli property',
      description:
        'Full detail for one property by its Booli residence id — the number in a ' +
        'booli.se/bostad/<id> URL, or the `residence_id` from a search result. ' +
        'Works for both active and sold properties. Read-only.',
      annotations: {
        title: 'Get a Booli property',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        residence_id: z
          .string()
          .describe('The property\'s residence id (e.g. "4370936" from /bostad/4370936).'),
        compact: z
          .boolean()
          .optional()
          .describe('Return a slim summary instead of the full raw record (default false).'),
      },
    },
    async (args: { residence_id: string; compact?: boolean }) => {
      const node = await client.getProperty(args.residence_id);
      if (node == null) {
        return textResult({
          found: false,
          residence_id: args.residence_id,
          hint: 'No property with that residence id. Use the id from a /bostad/<id> URL or a search result\'s residence_id.',
        });
      }
      return textResult({
        found: true,
        property: args.compact ? formatDetail(node) : node,
      });
    },
  );
}
