/**
 * Shared search-input plumbing for the listings + sold tools.
 *
 * Booli's `searchForSale`/`searchSold` take a single `areaId` plus a
 * `filters: [{key, value}]` array (see docs/BOOLI-API.md). This module
 * centralises the zod raw-shape, the free-text → areaId resolution, and
 * the arg → filter mapping so the listings and sold tools stay
 * consistent; each layers its own price/date filters on top.
 */
import { z } from 'zod';
import { McpToolError } from '@chrischall/mcp-utils';
import type { BooliClient } from '../client.js';
import type { SearchFilter, SearchRequestInput } from '../graphql.js';

/** Booli property types accepted by the `objectType` filter. */
export const OBJECT_TYPES = [
  'Lägenhet',
  'Villa',
  'Kedjehus-Parhus-Radhus',
  'Fritidshus',
  'Gård',
  'Tomt/Mark',
] as const;

/** Sort keys accepted by both searches (direction via `ascending`). */
export const SORT_KEYS = [
  'published',
  'listPrice',
  'listSqmPrice',
  'rooms',
  'livingArea',
  'rent',
  'plotArea',
] as const;

/** The geo + shared-filter raw-shape reused by both search tools. */
export const commonSearchShape = {
  area_id: z
    .string()
    .optional()
    .describe(
      'Booli area id from booli_search_areas. Provide this OR `location`.',
    ),
  location: z
    .string()
    .optional()
    .describe(
      'Free-text place name (e.g. "Nacka", "Södermalm") resolved to its top Booli area. Ignored when `area_id` is set.',
    ),
  object_type: z
    .string()
    .optional()
    .describe(
      `Property type(s), comma-separated, from: ${OBJECT_TYPES.join(', ')}.`,
    ),
  min_rooms: z.number().positive().optional(),
  max_rooms: z.number().positive().optional(),
  min_living_area: z.number().positive().optional().describe('m²'),
  max_living_area: z.number().positive().optional().describe('m²'),
  min_plot_area: z.number().positive().optional().describe('m²'),
  max_plot_area: z.number().positive().optional().describe('m²'),
  min_construction_year: z.number().int().optional(),
  max_construction_year: z.number().int().optional(),
  is_new_construction: z
    .boolean()
    .optional()
    .describe('true = only new production; false = exclude new production.'),
  sort: z.enum(SORT_KEYS).optional().describe('Sort key (default: newest published).'),
  ascending: z.boolean().optional().describe('Sort ascending (default false).'),
  page: z.number().int().min(1).optional().describe('1-based page (default 1).'),
  compact: z
    .boolean()
    .optional()
    .describe('Return slim summary records (default true). Set false for full raw fields.'),
};

/** Parsed args for the shared search shape. */
export interface CommonSearchArgs {
  area_id?: string;
  location?: string;
  object_type?: string;
  min_rooms?: number;
  max_rooms?: number;
  min_living_area?: number;
  max_living_area?: number;
  min_plot_area?: number;
  max_plot_area?: number;
  min_construction_year?: number;
  max_construction_year?: number;
  is_new_construction?: boolean;
  sort?: string;
  ascending?: boolean;
  page?: number;
  compact?: boolean;
}

/** Push `{key, value}` when the value is defined. */
function addFilter(filters: SearchFilter[], key: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    filters.push({ key, value: String(value) });
  }
}

/** The filters common to both searches (everything except price/date). */
export function buildCommonFilters(args: CommonSearchArgs): SearchFilter[] {
  const filters: SearchFilter[] = [];
  addFilter(filters, 'objectType', args.object_type);
  addFilter(filters, 'minRooms', args.min_rooms);
  addFilter(filters, 'maxRooms', args.max_rooms);
  addFilter(filters, 'minLivingArea', args.min_living_area);
  addFilter(filters, 'maxLivingArea', args.max_living_area);
  addFilter(filters, 'minPlotArea', args.min_plot_area);
  addFilter(filters, 'maxPlotArea', args.max_plot_area);
  addFilter(filters, 'minConstructionYear', args.min_construction_year);
  addFilter(filters, 'maxConstructionYear', args.max_construction_year);
  if (args.is_new_construction !== undefined) {
    addFilter(filters, 'isNewConstruction', args.is_new_construction ? 1 : 0);
  }
  return filters;
}

/**
 * Resolve the caller's area into a single `areaId`: an explicit `area_id`
 * wins, else the top hit for a free-text `location`. Throws a clean
 * argument error when neither is given or a name resolves to nothing.
 */
export async function resolveAreaId(
  client: BooliClient,
  args: CommonSearchArgs,
): Promise<string> {
  if (args.area_id) return args.area_id;
  if (args.location) {
    const hits = await client.areaSuggestions(args.location);
    const top = hits[0];
    if (top?.id != null) return String(top.id);
    throw new McpToolError(
      `No Booli area matched "${args.location}". Try booli_search_areas to find an area id.`,
    );
  }
  throw new McpToolError(
    'Provide an area: either `area_id` (from booli_search_areas) or a free-text `location`.',
  );
}

/** Assemble the full {@link SearchRequestInput} from resolved area + filters. */
export function buildSearchInput(
  areaId: string,
  filters: SearchFilter[],
  args: CommonSearchArgs,
): SearchRequestInput {
  return {
    areaId,
    page: args.page ?? 1,
    ascending: args.ascending ?? false,
    excludeAncestors: true,
    facets: [],
    filters,
    sort: args.sort ?? '',
  };
}
