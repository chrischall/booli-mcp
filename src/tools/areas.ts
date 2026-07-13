/**
 * `booli_search_areas` — resolve a place name or coordinate to Booli area
 * ids. Booli's searches scope most precisely by numeric `areaId`, so this
 * is the usual first step: name → area id → pass into the search tools.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatArea } from '../format.js';
import { textResult } from '../mcp.js';
import type { BooliQuery } from '../transport.js';

export function registerAreaTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_search_areas',
    {
      title: 'Resolve a Booli area',
      description:
        'Resolve a place name (or coordinate) to Booli areas — municipalities, ' +
        'districts, streets — each with its `booli_id` to pass as `area_id` into ' +
        'booli_search_listings / booli_search_sold. Read-only.',
      annotations: {
        title: 'Resolve a Booli area',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        q: z.string().optional().describe('Place-name search string (e.g. "Nacka").'),
        lat: z.number().optional().describe('Latitude; use together with `lng`.'),
        lng: z.number().optional().describe('Longitude; use together with `lat`.'),
        only_with_listings: z
          .boolean()
          .optional()
          .describe('Only return areas that currently have listings for sale.'),
        only_with_sold: z
          .boolean()
          .optional()
          .describe('Only return areas that have sold listings.'),
        limit: z.number().int().min(1).max(50).optional().describe('Default 10, max 50.'),
      },
    },
    async (args: {
      q?: string;
      lat?: number;
      lng?: number;
      only_with_listings?: boolean;
      only_with_sold?: boolean;
      limit?: number;
    }) => {
      const query: BooliQuery = { limit: args.limit ?? 10 };
      if (args.q !== undefined) query.q = args.q;
      if (args.lat !== undefined) query.lat = args.lat;
      if (args.lng !== undefined) query.lng = args.lng;
      if (args.only_with_listings) query.listings = 1;
      if (args.only_with_sold) query.transactions = 1;

      const areas = await client.searchAreas(query);
      return textResult({
        count: areas.length,
        areas: areas.map(formatArea),
      });
    },
  );
}
