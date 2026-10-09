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
import { McpToolError, viewParam } from '@chrischall/mcp-utils';
import type { BooliClient } from '../client.js';
import type { SearchFilter, SearchRequestInput } from '../graphql.js';

/**
 * The rungs this server honours (`@chrischall/mcp-utils`' `view` vocabulary;
 * `chrischall/workflows` `docs/fleet-conventions.md`, "Response shape").
 *
 * Booli was already compact-by-default on SEARCH (`args.compact ?? true`) and
 * this only renames that. What it does change is `booli_get_listing`, which
 * defaulted the other way — the one tool where a caller was most likely to be
 * handed a whole raw GraphQL node without asking.
 *
 * No `raw`: `full` already returns the untouched node.
 */
export const BOOLI_VIEWS = ['compact', 'full'] as const;

/** Booli property types accepted by the `objectType` filter. */
export const OBJECT_TYPES = [
  'Lägenhet',
  'Villa',
  'Kedjehus-Parhus-Radhus',
  'Fritidshus',
  'Gård',
  'Tomt/Mark',
] as const;

/** Split a comma-separated `object_type` into trimmed tokens. */
function splitObjectTypes(value: string): string[] {
  return value.split(',').map((t) => t.trim());
}

function isObjectType(token: string): boolean {
  return (OBJECT_TYPES as readonly string[]).includes(token);
}

/** Sort keys accepted by the for-sale search (direction via `ascending`). */
export const SORT_KEYS = [
  'published',
  'listPrice',
  'listSqmPrice',
  'rooms',
  'livingArea',
  'rent',
  'plotArea',
] as const;

/**
 * Sort keys accepted by the sold search: the listing keys plus the
 * sold-only `soldDate` / `soldPrice` (docs/BOOLI-API.md, "Sort keys").
 */
export const SOLD_SORT_KEYS = [...SORT_KEYS, 'soldDate', 'soldPrice'] as const;

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
    .refine((v) => splitObjectTypes(v).every(isObjectType), {
      message: `object_type must be one or more of (comma-separated, exact spelling): ${OBJECT_TYPES.join(', ')}.`,
    })
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
  view: viewParam(BOOLI_VIEWS, { note: 'compact returns the slim PropertySummary/detail projection; "full" returns Booli\'s whole GraphQL node.' }),
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
  view?: string;
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
  if (args.object_type !== undefined) {
    addFilter(filters, 'objectType', splitObjectTypes(args.object_type).join(','));
  }
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

/** A `[min, max]` pair of argument names that must not be inverted. */
export type Band = readonly [min: string, max: string];

/** The bands in {@link commonSearchShape}. */
export const COMMON_BANDS: readonly Band[] = [
  ['min_rooms', 'max_rooms'],
  ['min_living_area', 'max_living_area'],
  ['min_plot_area', 'max_plot_area'],
  ['min_construction_year', 'max_construction_year'],
];

/**
 * Throw an argument error when any band has `min > max`. Booli answers an
 * inverted band with an empty result, which reads as "no matches" (and as
 * a zero-sample market stat) rather than a bad request — so catch it before
 * resolveAreaId spends a request. Values are numbers or fixed-width
 * `YYYYMMDD` strings, both of which order correctly with `>`.
 */
export function assertOrderedBands(args: object, bands: readonly Band[]): void {
  const values = args as Record<string, number | string | undefined>;
  for (const [minKey, maxKey] of bands) {
    const min = values[minKey];
    const max = values[maxKey];
    if (min !== undefined && max !== undefined && min > max) {
      throw new McpToolError(
        `Inverted range: ${minKey} (${min}) is greater than ${maxKey} (${max}). Swap them or drop one.`,
      );
    }
  }
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
  defaultSort = '',
): SearchRequestInput {
  return {
    areaId,
    page: args.page ?? 1,
    ascending: args.ascending ?? false,
    excludeAncestors: true,
    facets: [],
    filters,
    sort: args.sort ?? defaultSort,
  };
}
