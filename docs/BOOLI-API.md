# Booli data access — reference

Two surfaces exist. booli-mcp uses **(1) the consumer GraphQL API via the browser
bridge**. The classic signed REST API (2) is documented at the bottom as historical
context — its credentials are no longer obtainable, so it is not usable.

---

## (1) Consumer GraphQL API — `www.booli.se/graphql`  (the one we use)

`POST https://www.booli.se/graphql`, `content-type: application/json`,
body `{ "query": "...", "variables": {...} }`. Standard GraphQL `{ data, errors }`
envelope.

**Access:** the whole `www.booli.se` zone is behind a Cloudflare managed challenge
(`cf-mitigated: challenge`) that 403s every non-browser client (Node/curl), and
Cloudflare fingerprints the client itself, so no header/cookie replay durably clears
it. The identical query returns 200 from a `fetch` **inside a real browser tab**. So
requests ride the user's own signed-in (Cloudflare-cleared) `www.booli.se` tab via
the fetchproxy bridge (`@fetchproxy/server` + Transporter extension). No Booli login
needed — just a cleared Cloudflare session (any normal page view). Introspection is
disabled (500). Verified live 2026-07-13.

### Queries

**Area lookup (name → areaId):**
```graphql
{ areaSuggestionSearch(search: "nacka") { suggestions { id displayName } } }
# → { suggestions: [ { id: 76, displayName: "Nacka kommun" }, … ] }
```
`id` is the `areaId` used by the search queries.

**For-sale search:**
```graphql
query($input: SearchInput) {
  searchForSale(input: $input) {
    totalCount
    pages
    result {
      __typename
      ... on Listing {
        booliId objectType tenureForm streetAddress descriptiveAreaName
        latitude longitude published daysActive isNewConstruction url
        rooms { raw } livingArea { raw } rent { raw } floor { raw }
        listPrice { raw formatted } listSqmPrice { raw }
        location { region { municipalityName countyName } namedAreas }
      }
      # results can also be `... on Project` (new-construction developments)
    }
  }
}
```

**Sold search (slutpriser):** `searchSold(input: $input)`, same envelope; result is
`... on SoldProperty`:
```graphql
booliId objectType tenureForm streetAddress descriptiveAreaName latitude longitude
soldDate daysActive url
soldPrice { raw formatted } soldSqmPrice { raw } listPrice { raw }
soldPricePercentageDiff { raw }   # over/under asking %, e.g. -20
rooms { raw } livingArea { raw } rent { raw } floor { raw }
location { region { municipalityName countyName } namedAreas }
```

**Detail (by residence id):**
```graphql
{ propertyByResidenceId(residenceId: "4370936") {
    __typename booliId residenceId objectType tenureForm streetAddress
    descriptiveAreaName latitude longitude constructionYear buildingFloors url
    rooms { raw } livingArea { raw } additionalArea { raw } plotArea { raw }
    rent { raw } operatingCost { raw } floor { raw }
    location { region { municipalityName countyName } namedAreas }
    ... on Listing {
      published isNewConstruction biddingOpen upcomingSale listingUrl
      listPrice { raw formatted } listSqmPrice { raw } listPricePercentageDiff { raw }
      agency { name url } estimate { price { raw } }
    }
    ... on SoldProperty {
      soldPrice { raw formatted } soldSqmPrice { raw } soldDate
      soldPricePercentageDiff { raw } listPrice { raw }
    }
} }
```
`propertyByResidenceId` returns the `Property` interface; Listing/SoldProperty-only
fields need inline fragments. `residenceId` is the number in the `/bostad/<id>` URL
(a result's `url` field) — **not** `booliId` (booliId is a separate internal id).

### SearchInput
```
{ areaId: String,           # a single area id (from areaSuggestionSearch)
  page: Int,                 # 1-based
  ascending: Boolean,        # sort direction
  excludeAncestors: Boolean, # true (the default the site sends)
  facets: [String],          # e.g. ["upcomingSale"]; [] is fine
  filters: [{ key, value }], # see below — key/value both strings
  sort: String }             # "" = default; else a sort key (below)
```

### Filters (`filters: [{key, value}]`)
Range filters use `min*`/`max*` keys; the vocabulary matches the classic REST params:
- `objectType` (multi): values `Lägenhet`, `Villa`, `Kedjehus-Parhus-Radhus`,
  `Fritidshus`, `Gård`, `Tomt/Mark`
- `minRooms` / `maxRooms`
- `minLivingArea` / `maxLivingArea`  (m²)
- `minPlotArea` / `maxPlotArea`  (m²)
- `minListPrice` / `maxListPrice`  (SEK)  — sold search: `minSoldPrice`/`maxSoldPrice`
- `minListSqmPrice` / `maxListSqmPrice`  — sold: `minSoldSqmPrice`/`maxSoldSqmPrice`
- `minConstructionYear` / `maxConstructionYear`
- `minSoldDate` / `maxSoldDate`  (YYYYMMDD; sold search)
- `isNewConstruction` (`1`/`0`)
- `amenities` (`hasBalconyOrPatio`, `hasFireplace`, `buildingHasElevator`)
- `floor`, `daysActive`, `extendAreas` (radius km)

### Sort keys
`published` (default when `sort:""`), `listPrice`, `rooms`, `livingArea`, `rent`,
`listSqmPrice`, `plotArea`, `postAddress`, plus `soldDate`/`soldPrice` on sold.
Direction via `ascending`.

### FormattedValue
Numeric fields are `FormattedValue { raw: Int, formatted: String, unit, value }` —
select `{ raw }` for the number, `{ formatted }` for the display string.

### Notes
- `result` can contain `Project` (new-construction) alongside `Listing`; filter by
  `__typename` and surface Listings, noting any Projects.
- The Apollo/SSR store also embeds these under `__NEXT_DATA__.props.pageProps
  .__APOLLO_STATE__` (normalized cache) — the GraphQL POST is cleaner than resolving
  the normalized `__ref` graph, so we query directly.

---

## (2) Classic signed REST API — `api.booli.se`  (historical; NOT usable)

`GET https://api.booli.se/{listings,sold,areas}` signed per request with
`callerId`, `time` (unix ms), `unique`, `hash = sha1(callerId+time+apiKey+unique)`.
Server-reachable (no Cloudflare) but requires a `callerId` + `apiKey` that Booli no
longer issues to new users — so a consumer cannot authenticate. Kept here only to
explain why booli-mcp uses the GraphQL/browser-bridge route instead. (Flat response
fields: `listPrice`, `soldPrice`, `livingArea`, `rooms`, `location{...}`, etc.)
