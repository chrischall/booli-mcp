/**
 * Shared search-input plumbing for the listings + sold tools.
 *
 * Booli scopes a search by ONE of several geo methods (a free-text `q`, an
 * `area_id`, a `center`+`dim` rectangle, or a `bbox`) plus optional
 * property filters. This module centralises the zod raw-shape and the
 * arg→Booli-query mapping so the listings and sold tools stay consistent;
 * each layers its own price/date filters on top.
 */
import { z } from 'zod';
import type { BooliQuery } from '../transport.js';

/** Booli property types accepted by `objectType` (comma-separated). */
export const OBJECT_TYPES = [
  'villa',
  'lägenhet',
  'gård',
  'tomt-mark',
  'fritidshus',
  'parhus',
  'radhus',
  'kedjehus',
] as const;

/** The geo + shared-filter raw-shape reused by both search tools. */
export const commonSearchShape = {
  q: z
    .string()
    .optional()
    .describe(
      'Free-text area search (e.g. "Nacka", "Södermalm"). One of q / area_id / center / bbox scopes the search.',
    ),
  area_id: z
    .string()
    .optional()
    .describe(
      'Booli area id(s) from booli_search_areas, comma-separated for several (e.g. "76,16").',
    ),
  center: z
    .string()
    .optional()
    .describe('Coordinate "lat,lng" (e.g. "59.34674,18.0603"); use with `dim`.'),
  dim: z
    .string()
    .optional()
    .describe('Rectangle size in metres "w,h" (e.g. "400,500"), used with `center`.'),
  bbox: z
    .string()
    .optional()
    .describe('Bounding box "lat_lo,lng_lo,lat_hi,lng_hi" (SW then NE corner).'),
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
  max_rent: z.number().nonnegative().optional().describe('SEK/month'),
  min_construction_year: z.number().int().optional(),
  max_construction_year: z.number().int().optional(),
  is_new_construction: z
    .boolean()
    .optional()
    .describe('true = only new production; false = exclude new production.'),
  limit: z.number().int().min(1).max(100).optional().describe('Default 30, max 100.'),
  offset: z.number().int().nonnegative().optional().describe('Pagination offset.'),
  compact: z
    .boolean()
    .optional()
    .describe('Return slim summary records (default true). Set false for full raw fields.'),
};

/** Parsed args for the shared search shape. */
export interface CommonSearchArgs {
  q?: string;
  area_id?: string;
  center?: string;
  dim?: string;
  bbox?: string;
  object_type?: string;
  min_rooms?: number;
  max_rooms?: number;
  min_living_area?: number;
  max_living_area?: number;
  min_plot_area?: number;
  max_plot_area?: number;
  max_rent?: number;
  min_construction_year?: number;
  max_construction_year?: number;
  is_new_construction?: boolean;
  limit?: number;
  offset?: number;
  compact?: boolean;
}

/** Default page size when the caller omits `limit`. */
export const DEFAULT_LIMIT = 30;

/**
 * Map the shared search args onto Booli query params (Booli's own
 * camelCase names). Only defined values are emitted, so the query stays
 * minimal.
 */
export function buildCommonQuery(args: CommonSearchArgs): BooliQuery {
  const q: BooliQuery = {};
  if (args.q !== undefined) q.q = args.q;
  if (args.area_id !== undefined) q.areaId = args.area_id;
  if (args.center !== undefined) q.center = args.center;
  if (args.dim !== undefined) q.dim = args.dim;
  if (args.bbox !== undefined) q.bbox = args.bbox;
  if (args.object_type !== undefined) q.objectType = args.object_type;
  if (args.min_rooms !== undefined) q.minRooms = args.min_rooms;
  if (args.max_rooms !== undefined) q.maxRooms = args.max_rooms;
  if (args.min_living_area !== undefined) q.minLivingArea = args.min_living_area;
  if (args.max_living_area !== undefined) q.maxLivingArea = args.max_living_area;
  if (args.min_plot_area !== undefined) q.minPlotArea = args.min_plot_area;
  if (args.max_plot_area !== undefined) q.maxPlotArea = args.max_plot_area;
  if (args.max_rent !== undefined) q.maxRent = args.max_rent;
  if (args.min_construction_year !== undefined)
    q.minConstructionYear = args.min_construction_year;
  if (args.max_construction_year !== undefined)
    q.maxConstructionYear = args.max_construction_year;
  if (args.is_new_construction !== undefined)
    q.isNewConstruction = args.is_new_construction ? 1 : 0;
  q.limit = args.limit ?? DEFAULT_LIMIT;
  if (args.offset !== undefined) q.offset = args.offset;
  return q;
}
