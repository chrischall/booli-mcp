/**
 * GraphQL query documents, input types, and the raw response shapes for
 * Booli's consumer API (`www.booli.se/graphql`). See docs/BOOLI-API.md —
 * every query + field name here was validated live against the endpoint.
 *
 * Kept separate from the client so the operation strings + types have one
 * home and the client stays a thin typed wrapper over the transport.
 */

/** Booli wraps numeric fields as `FormattedValue`; `raw` is the number. */
export interface FormattedValue {
  raw?: number | null;
  formatted?: string | null;
  unit?: string | null;
  value?: string | null;
}

export interface RawLocation {
  region?: { municipalityName?: string | null; countyName?: string | null } | null;
  namedAreas?: string[] | null;
}

/** A `Listing` node as returned by `searchForSale.result`. */
export interface RawListing {
  __typename?: string;
  booliId?: string | null;
  objectType?: string | null;
  tenureForm?: string | null;
  streetAddress?: string | null;
  descriptiveAreaName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  published?: string | null;
  daysActive?: number | null;
  isNewConstruction?: boolean | null;
  url?: string | null;
  rooms?: FormattedValue | null;
  livingArea?: FormattedValue | null;
  rent?: FormattedValue | null;
  floor?: FormattedValue | null;
  listPrice?: FormattedValue | null;
  listSqmPrice?: FormattedValue | null;
  location?: RawLocation | null;
}

/** A `SoldProperty` node as returned by `searchSold.result`. */
export interface RawSoldProperty {
  __typename?: string;
  booliId?: string | null;
  objectType?: string | null;
  tenureForm?: string | null;
  streetAddress?: string | null;
  descriptiveAreaName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  soldDate?: string | null;
  daysActive?: number | null;
  url?: string | null;
  soldPrice?: FormattedValue | null;
  soldSqmPrice?: FormattedValue | null;
  listPrice?: FormattedValue | null;
  soldPricePercentageDiff?: FormattedValue | null;
  rooms?: FormattedValue | null;
  livingArea?: FormattedValue | null;
  rent?: FormattedValue | null;
  floor?: FormattedValue | null;
  location?: RawLocation | null;
}

/** The full detail node from `propertyByResidenceId` (Listing ∪ Sold). */
export interface RawPropertyDetail extends RawListing, RawSoldProperty {
  residenceId?: string | null;
  constructionYear?: number | null;
  buildingFloors?: number | null;
  additionalArea?: FormattedValue | null;
  plotArea?: FormattedValue | null;
  operatingCost?: FormattedValue | null;
  biddingOpen?: number | null;
  upcomingSale?: boolean | null;
  listingUrl?: string | null;
  listPricePercentageDiff?: FormattedValue | null;
  agency?: { name?: string | null; url?: string | null } | null;
  estimate?: { price?: FormattedValue | null } | null;
}

export interface AreaSuggestion {
  id?: number | string | null;
  displayName?: string | null;
}

/** A single search filter (`filters: [{key, value}]`). */
export interface SearchFilter {
  key: string;
  value: string;
}

/** The `SearchRequest` input for searchForSale / searchSold. */
export interface SearchRequestInput {
  areaId?: string;
  page: number;
  ascending: boolean;
  excludeAncestors: boolean;
  facets: string[];
  filters: SearchFilter[];
  sort: string;
}

// --- shared field selections -------------------------------------------

const LOCATION_FIELDS = `location { region { municipalityName countyName } namedAreas }`;

const LISTING_FIELDS = `
  booliId objectType tenureForm streetAddress descriptiveAreaName
  latitude longitude published daysActive isNewConstruction url
  rooms { raw } livingArea { raw } rent { raw } floor { raw }
  listPrice { raw formatted } listSqmPrice { raw }
  ${LOCATION_FIELDS}`;

const SOLD_FIELDS = `
  booliId objectType tenureForm streetAddress descriptiveAreaName
  latitude longitude soldDate daysActive url
  soldPrice { raw formatted } soldSqmPrice { raw } listPrice { raw }
  soldPricePercentageDiff { raw }
  rooms { raw } livingArea { raw } rent { raw } floor { raw }
  ${LOCATION_FIELDS}`;

// --- operation documents -----------------------------------------------

export const AREA_SUGGESTIONS = `query AreaSuggestions($search: String!) {
  areaSuggestionSearch(search: $search) { suggestions { id displayName } }
}`;

export const SEARCH_FOR_SALE = `query SearchForSale($input: SearchRequest) {
  searchForSale(input: $input) {
    totalCount
    pages
    result { __typename ... on Listing { ${LISTING_FIELDS} } }
  }
}`;

export const SEARCH_SOLD = `query SearchSold($input: SearchRequest) {
  searchSold(input: $input) {
    totalCount
    pages
    result { __typename ... on SoldProperty { ${SOLD_FIELDS} } }
  }
}`;

export const PROPERTY_DETAIL = `query PropertyDetail($residenceId: ID!) {
  propertyByResidenceId(residenceId: $residenceId) {
    __typename booliId residenceId objectType tenureForm streetAddress
    descriptiveAreaName latitude longitude constructionYear buildingFloors url
    rooms { raw } livingArea { raw } additionalArea { raw } plotArea { raw }
    rent { raw } operatingCost { raw } floor { raw }
    ${LOCATION_FIELDS}
    ... on Listing {
      published isNewConstruction biddingOpen upcomingSale listingUrl
      listPrice { raw formatted } listSqmPrice { raw } listPricePercentageDiff { raw }
      agency { name url } estimate { price { raw } }
    }
    ... on SoldProperty {
      soldPrice { raw formatted } soldSqmPrice { raw } soldDate
      soldPricePercentageDiff { raw } listPrice { raw }
    }
  }
}`;
