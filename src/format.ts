/**
 * Normalisers: raw Booli property/area objects → slim, snake_case summary
 * records for tool output.
 *
 * The raw Booli REST shapes (see docs/BOOLI-API.md) are moderately fat and
 * nest location/source/flags. These projections keep the fields an agent
 * actually browses or ranks on, derive a couple of convenience fields
 * locally (price-per-m², a canonical booli.se URL), and stay defensive:
 * every field is optional on the wire, so each getter tolerates its
 * absence rather than assuming presence.
 */

const BOOLI_ORIGIN = 'https://www.booli.se';

/** Raw location sub-object (all fields optional on the wire). */
export interface RawLocation {
  address?: { streetAddress?: string; city?: string };
  position?: { latitude?: number; longitude?: number };
  namedAreas?: string[];
  region?: { municipalityName?: string; countyName?: string };
  distance?: { ocean?: number };
}

/** Raw property object shared by /listings and /sold (fields optional). */
export interface RawProperty {
  booliId?: number;
  location?: RawLocation;
  listPrice?: number;
  firstPrice?: number;
  soldPrice?: number;
  soldDate?: string;
  rent?: number;
  floor?: number;
  livingArea?: number;
  plotArea?: number;
  additionalArea?: number;
  rooms?: number;
  published?: string;
  constructionYear?: number;
  objectType?: string;
  tenureForm?: string;
  url?: string;
  source?: { name?: string; id?: number; type?: string; url?: string };
  isNewConstruction?: number;
}

/** Raw area object from /areas. */
export interface RawArea {
  booliId?: number;
  name?: string;
  types?: string[];
  parentBooliId?: number;
  parentName?: string;
  parentTypes?: string[];
  fullName?: string;
}

/** Slim projection of a for-sale or sold property. */
export interface PropertySummary {
  booli_id: number | null;
  object_type: string | null;
  tenure_form: string | null;
  street_address: string | null;
  area: string | null;
  municipality: string | null;
  county: string | null;
  rooms: number | null;
  living_area: number | null;
  plot_area: number | null;
  list_price: number | null;
  sold_price: number | null;
  sold_date: string | null;
  price_per_sqm: number | null;
  rent: number | null;
  construction_year: number | null;
  published: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  url: string | null;
}

/** Slim projection of an area hit. */
export interface AreaSummary {
  booli_id: number | null;
  name: string | null;
  full_name: string | null;
  types: string[];
  parent_booli_id: number | null;
  parent_name: string | null;
}

/** Build the canonical booli.se URL from a relative `url` field, if any. */
function absoluteUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BOOLI_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Price per m²: prefer the achieved sold price, else the list price,
 * divided by living area. Null when either input is missing or zero.
 */
function pricePerSqm(price: number | undefined, livingArea: number | undefined): number | null {
  if (!price || !livingArea) return null;
  return Math.round(price / livingArea);
}

/** Project a raw property into the slim {@link PropertySummary}. */
export function formatProperty(raw: RawProperty): PropertySummary {
  const loc = raw.location ?? {};
  const price = raw.soldPrice ?? raw.listPrice;
  return {
    booli_id: raw.booliId ?? null,
    object_type: raw.objectType ?? null,
    tenure_form: raw.tenureForm ?? null,
    street_address: loc.address?.streetAddress ?? null,
    area: loc.namedAreas?.[0] ?? loc.address?.city ?? null,
    municipality: loc.region?.municipalityName ?? null,
    county: loc.region?.countyName ?? null,
    rooms: raw.rooms ?? null,
    living_area: raw.livingArea ?? null,
    plot_area: raw.plotArea ?? null,
    list_price: raw.listPrice ?? null,
    sold_price: raw.soldPrice ?? null,
    sold_date: raw.soldDate ?? null,
    price_per_sqm: pricePerSqm(price, raw.livingArea),
    rent: raw.rent ?? null,
    construction_year: raw.constructionYear ?? null,
    published: raw.published ?? null,
    latitude: loc.position?.latitude ?? null,
    longitude: loc.position?.longitude ?? null,
    source: raw.source?.name ?? null,
    url: absoluteUrl(raw.url),
  };
}

/** Project a raw area into the slim {@link AreaSummary}. */
export function formatArea(raw: RawArea): AreaSummary {
  return {
    booli_id: raw.booliId ?? null,
    name: raw.name ?? null,
    full_name: raw.fullName ?? null,
    types: raw.types ?? [],
    parent_booli_id: raw.parentBooliId ?? null,
    parent_name: raw.parentName ?? null,
  };
}
