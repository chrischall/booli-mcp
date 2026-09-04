/**
 * `booli_search_areas` — resolve a place name to Booli area ids. Booli's
 * searches scope by a numeric `area_id`, so this is the usual first step:
 * name → area id → pass into the search tools.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { formatArea } from '../format.js';
import { minifiedResult } from '../mcp.js';

export function registerAreaTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_search_areas',
    {
      title: 'Resolve a Booli area',
      description:
        'Resolve a place name to Booli areas — municipalities, districts, streets — ' +
        'each with its `area_id` to pass as `area_id` into booli_search_listings / ' +
        'booli_search_sold. Read-only.',
      annotations: {
        title: 'Resolve a Booli area',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        query: z.string().describe('Place-name search string (e.g. "Nacka", "Södermalm").'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10).'),
      },
    },
    async (args: { query: string; limit?: number }) => {
      const suggestions = await client.areaSuggestions(args.query);
      const limited = suggestions.slice(0, args.limit ?? 10);
      return minifiedResult({
        count: limited.length,
        areas: limited.map(formatArea),
      });
    },
  );
}
