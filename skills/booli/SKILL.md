---
name: booli
description: >-
  Search and analyse Swedish real estate on booli.se — active for-sale
  listings, sold prices (slutpriser), area resolution, and market
  statistics. Use when the user asks about Swedish property, Booli,
  bostäder, lägenheter, villor, or slutpriser.
---

# Booli (booli.se)

Tools for the Swedish property portal Booli, reading its classic REST API
(api.booli.se) with a per-request signed request. Money is in **SEK**,
areas in **m²**, rooms as a number.

## Setup

The API needs credentials: set `BOOLI_CALLER_ID` and `BOOLI_API_KEY`
(request them at https://www.booli.se/p/api — accept the API terms and
the key is emailed to you). The server starts without them, but every
tool call errors until they're set. Run `booli_healthcheck` to confirm
the endpoint is reachable and the credentials are valid.

## Start with an area

Booli's searches scope most precisely by numeric **area id**, not a place
name. Resolve first:

1. `booli_search_areas` — `{ q: "Nacka" }` → areas with `booli_id`,
   `full_name`, `types` (Kommun / Län / Street / …). Pass a `booli_id`
   as `area_id` into the search tools.

You can also scope a search by free-text `q`, a `center`+`dim` rectangle,
or a `bbox` — but `area_id` is the most reliable.

## For-sale listings

- `booli_search_listings` — search active listings by `area_id` / `q` /
  `center`+`dim` / `bbox` plus optional `min_list_price`/`max_list_price`
  (SEK), `min_list_sqm_price`/`max_list_sqm_price`, `min_rooms`/`max_rooms`,
  `min_living_area`/`max_living_area` (m²), `min_plot_area`/`max_plot_area`,
  `max_rent`, `object_type` (comma-separated: villa, lägenhet, gård,
  tomt-mark, fritidshus, parhus, radhus, kedjehus),
  `min_construction_year`/`max_construction_year`, `is_new_construction`,
  `limit`/`offset`. Returns slim summaries by default (`compact: false`
  for full raw records).
- `booli_get_listing` — full detail for one listing by its Booli id.

## Sold prices (slutpriser) — the comparables

- `booli_search_sold` — sold properties with the achieved **sold price**
  and **sold date**. Same scope/filters as the for-sale search, plus
  `min_sold_price`/`max_sold_price`, `min_sold_sqm_price`/`max_sold_sqm_price`,
  and `min_sold_date`/`max_sold_date` (YYYYMMDD).
- `booli_get_sold` — full detail for one sold listing by Booli id.
- `booli_market_stats` — median/average sold price, price per m², and
  average over/under-asking % for an area (same filters as the sold
  search). Check `sample_size` before trusting a thin median.

## Diagnostics

- `booli_healthcheck` — one-call probe of the API + credentials.

All tools are read-only; Booli's API has no write endpoints.
