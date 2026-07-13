# Booli API (classic partner REST API) — pinned reference

Source: https://www.booli.se/p/api/referens (Wayback 2024-07-25), canonical wrappers
(rinti/booli-api, peterstark72/booli, filipsalo/booliapi). Verified server-reachable
(no Cloudflare wall on `api.booli.se`; the `www.booli.se` consumer site IS Cloudflare-walled).

## Base URL
`https://api.booli.se`

## Auth (HMAC query signing — NOT a bearer header)
Every request carries 4 query params:

    callerId = <your caller id>
    time     = <unix timestamp in MILLISECONDS>   // rinti uses +new Date()
    unique   = <random 16-char string>
    hash     = sha1( callerId + time + apiKey + unique )   // hex digest

Missing any → `403 {"...":"FAILURE_MISSING_PARAM - Request must contain callerId, unique, time and hash."}`

Credentials (`callerId` + `apiKey`) are obtained by the human from Booli's API page
(accept terms → key emailed). Agent never sets them. Env: `BOOLI_CALLER_ID`, `BOOLI_API_KEY`.

## Endpoints

### GET /listings  — properties for sale
Query params (all optional; combine freely):
- `q`               free-text area search string (e.g. `nacka`)
- `center`          coordinate `lat,lng` (e.g. `59.34674,18.0603`)
- `dim`             rectangle dimensions in metres, with `center` (e.g. `400,500`)
- `bbox`            `lat_lo,lng_lo,lat_hi,lng_hi` (SW then NE)
- `areaId`          area id(s), comma-separated for multiple (e.g. `76,16`)
- `minListPrice` / `maxListPrice`
- `minListSqmPrice` / `maxListSqmPrice`
- `minRooms` / `maxRooms`
- `maxRent`
- `minLivingArea` / `maxLivingArea`
- `minPlotArea` / `maxPlotArea`
- `objectType`      one or more (comma-separated) of:
                    `villa, lägenhet, gård, tomt-mark, fritidshus, parhus, radhus, kedjehus`
- `minConstructionYear` / `maxConstructionYear`
- `minPublished` / `maxPublished`   date `YYYYMMDD`
- `isNewConstruction`   `1` = only new production, `0` = exclude
- `includeUnset`    default true; whether filters include listings missing the attribute
- `limit`           number of results
- `offset`          offset

Response: `{ totalCount, count, listings: [Property...], limit, offSet, searchParams }`

### GET /listings/:id  — single for-sale listing
Response: `{ listings: [Property] }`

### GET /sold  — sold properties
Same geo/area/room/area/objectType/year/published/pagination params as /listings, plus:
- `minSoldPrice` / `maxSoldPrice`
- `minSoldSqmPrice` / `maxSoldSqmPrice`
- `minSoldDate` / `maxSoldDate`   date `YYYYMMDD`
(uses SoldPrice not ListPrice for the price filters)

Response: `{ totalCount, count, sold: [Property...], limit, offSet, searchParams }`

### GET /sold/:id  — single sold listing
Response: `{ sold: [Property] }`

### GET /areas  — area / place lookup (resolve a name → areaId)
Query params:
- `q`             search string (e.g. `nacka`)
- `lat` / `lng`   coordinate lookup (used together)
- `listings`      `1` = only areas with listings for sale
- `transactions`  `1` = only areas with sold listings
- `limit`         number of results

Response: `{ totalCount, count, areas: [Area...], searchParams, limit }`
Area: `{ booliId, name, types:[...], parentBooliId, parentName, parentTypes:[...], fullName }`
  types example values: `Kommun`, `Län`, `Street`, `undefined`

## Property (listing / sold) object shape (flat)
    location: {
      address:   { streetAddress, city? },
      position:  { latitude, longitude },
      namedAreas: [string],
      region:    { municipalityName, countyName },
      distance:  { ocean? }            // metres to water, sold only sometimes
    },
    listPrice, firstPrice?, soldPrice?, soldDate?, listPriceChangeDate?,
    rent?, floor?, livingArea, plotArea?, additionalArea?, rooms,
    published, constructionYear?, objectType, tenureForm?,
    booliId, url,
    source: { name, id?, type, url },
    isNewConstruction?, hasPatio?, hasBalcony?, hasSolarPanels?, hasFirePlace?, biddingOpen?

Prices are plain integers (SEK). rooms/livingArea/plotArea are floats.
Dates: `published` = `YYYY-MM-DD HH:MM:SS`; `soldDate` = `YYYY-MM-DD`.

## Notes for the MCP
- Read-only API — no write endpoints. No confirm-gated tools needed.
- `q`/`areaId`/`center`+`dim`/`bbox` are alternative ways to scope a search; `/areas`
  resolves a human place name → `areaId` for precise scoping.
- Response key is `listings` for /listings, `sold` for /sold — different envelope keys.
- Response uses `offSet` (capital S) in the envelope though the request param is `offset`.
