/**
 * Normalisers: raw Booli GraphQL nodes → slim, snake_case summary records
 * for tool output.
 *
 * Booli wraps numeric fields as `FormattedValue { raw }` and splits the
 * for-sale / sold / detail shapes across GraphQL types (see graphql.ts).
 * These projections pull the numbers out, derive a couple of convenience
 * fields locally (a canonical booli.se URL, the residence id from that
 * URL), and stay defensive: every wire field is optional, so each getter
 * tolerates its absence rather than assuming presence.
 */
import type {
  AreaSuggestion,
  FormattedValue,
  RawListing,
  RawLocation,
  RawPropertyDetail,
  RawSoldProperty,
} from './graphql.js';

const BOOLI_ORIGIN = 'https://www.booli.se';

/** Slim projection of a for-sale or sold property (search results). */
export interface PropertySummary {
  booli_id: string | null;
  residence_id: string | null;
  object_type: string | null;
  tenure_form: string | null;
  street_address: string | null;
  area: string | null;
  municipality: string | null;
  county: string | null;
  rooms: number | null;
  living_area: number | null;
  list_price: number | null;
  sold_price: number | null;
  sold_date: string | null;
  price_per_sqm: number | null;
  sold_vs_asking_percent: number | null;
  rent: number | null;
  published: string | null;
  is_new_construction: boolean | null;
  latitude: number | null;
  longitude: number | null;
  url: string | null;
}

/** Slim projection of an area suggestion. */
export interface AreaSummary {
  area_id: string | null;
  display_name: string | null;
}

/** The `raw` number out of a `FormattedValue`, or null. */
function num(fv: FormattedValue | null | undefined): number | null {
  return fv?.raw ?? null;
}

/** Build the canonical booli.se URL from a relative `url` field, if any. */
function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BOOLI_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Extract the residence id (the `/bostad/<id>` number) from a url. */
export function extractResidenceId(url: string | null | undefined): string | null {
  const m = url?.match(/\/bostad\/(\d+)/);
  return m ? m[1]! : null;
}

/** Best-effort area label: first named area, else the descriptive name. */
function areaLabel(
  loc: RawLocation | null | undefined,
  descriptive: string | null | undefined,
): string | null {
  return loc?.namedAreas?.[0] ?? descriptive ?? null;
}

/** Project a raw for-sale `Listing` into the slim {@link PropertySummary}. */
export function formatListing(raw: RawListing): PropertySummary {
  return {
    booli_id: raw.booliId ?? null,
    residence_id: extractResidenceId(raw.url),
    object_type: raw.objectType ?? null,
    tenure_form: raw.tenureForm ?? null,
    street_address: raw.streetAddress ?? null,
    area: areaLabel(raw.location, raw.descriptiveAreaName),
    municipality: raw.location?.region?.municipalityName ?? null,
    county: raw.location?.region?.countyName ?? null,
    rooms: num(raw.rooms),
    living_area: num(raw.livingArea),
    list_price: num(raw.listPrice),
    sold_price: null,
    sold_date: null,
    price_per_sqm: num(raw.listSqmPrice),
    sold_vs_asking_percent: null,
    rent: num(raw.rent),
    published: raw.published ?? null,
    is_new_construction: raw.isNewConstruction ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    url: absoluteUrl(raw.url),
  };
}

/** Project a raw `SoldProperty` into the slim {@link PropertySummary}. */
export function formatSold(raw: RawSoldProperty): PropertySummary {
  return {
    booli_id: raw.booliId ?? null,
    residence_id: extractResidenceId(raw.url),
    object_type: raw.objectType ?? null,
    tenure_form: raw.tenureForm ?? null,
    street_address: raw.streetAddress ?? null,
    area: areaLabel(raw.location, raw.descriptiveAreaName),
    municipality: raw.location?.region?.municipalityName ?? null,
    county: raw.location?.region?.countyName ?? null,
    rooms: num(raw.rooms),
    living_area: num(raw.livingArea),
    list_price: num(raw.listPrice),
    sold_price: num(raw.soldPrice),
    sold_date: raw.soldDate ?? null,
    price_per_sqm: num(raw.soldSqmPrice),
    sold_vs_asking_percent: num(raw.soldPricePercentageDiff),
    rent: num(raw.rent),
    published: null,
    is_new_construction: null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    url: absoluteUrl(raw.url),
  };
}

/** Full detail projection for `propertyByResidenceId`. */
export interface PropertyDetail {
  booli_id: string | null;
  residence_id: string | null;
  is_sold: boolean;
  object_type: string | null;
  tenure_form: string | null;
  street_address: string | null;
  area: string | null;
  municipality: string | null;
  county: string | null;
  rooms: number | null;
  living_area: number | null;
  additional_area: number | null;
  plot_area: number | null;
  floor: number | null;
  building_floors: number | null;
  construction_year: number | null;
  rent: number | null;
  operating_cost: number | null;
  list_price: number | null;
  list_price_per_sqm: number | null;
  list_vs_estimate_percent: number | null;
  estimate: number | null;
  sold_price: number | null;
  sold_price_per_sqm: number | null;
  sold_date: string | null;
  sold_vs_asking_percent: number | null;
  published: string | null;
  is_new_construction: boolean | null;
  bidding_open: boolean | null;
  upcoming_sale: boolean | null;
  agency: string | null;
  agency_url: string | null;
  listing_url: string | null;
  latitude: number | null;
  longitude: number | null;
  url: string | null;
}

/** Project the detail node (Listing ∪ SoldProperty) into {@link PropertyDetail}. */
export function formatDetail(raw: RawPropertyDetail): PropertyDetail {
  return {
    booli_id: raw.booliId ?? null,
    residence_id: raw.residenceId ?? extractResidenceId(raw.url),
    is_sold: raw.__typename === 'SoldProperty',
    object_type: raw.objectType ?? null,
    tenure_form: raw.tenureForm ?? null,
    street_address: raw.streetAddress ?? null,
    area: areaLabel(raw.location, raw.descriptiveAreaName),
    municipality: raw.location?.region?.municipalityName ?? null,
    county: raw.location?.region?.countyName ?? null,
    rooms: num(raw.rooms),
    living_area: num(raw.livingArea),
    additional_area: num(raw.additionalArea),
    plot_area: num(raw.plotArea),
    floor: num(raw.floor),
    building_floors: raw.buildingFloors ?? null,
    construction_year: raw.constructionYear ?? null,
    rent: num(raw.rent),
    operating_cost: num(raw.operatingCost),
    list_price: num(raw.listPrice),
    list_price_per_sqm: num(raw.listSqmPrice),
    list_vs_estimate_percent: num(raw.listPricePercentageDiff),
    estimate: num(raw.estimate?.price),
    sold_price: num(raw.soldPrice),
    sold_price_per_sqm: num(raw.soldSqmPrice),
    sold_date: raw.soldDate ?? null,
    sold_vs_asking_percent: num(raw.soldPricePercentageDiff),
    published: raw.published ?? null,
    is_new_construction: raw.isNewConstruction ?? null,
    bidding_open: raw.biddingOpen == null ? null : raw.biddingOpen === 1,
    upcoming_sale: raw.upcomingSale ?? null,
    agency: raw.agency?.name ?? null,
    agency_url: raw.agency?.url ?? null,
    listing_url: raw.listingUrl ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    url: absoluteUrl(raw.url),
  };
}

/** Project an area suggestion into the slim {@link AreaSummary}. */
export function formatArea(raw: AreaSuggestion): AreaSummary {
  return {
    area_id: raw.id == null ? null : String(raw.id),
    display_name: raw.displayName ?? null,
  };
}
