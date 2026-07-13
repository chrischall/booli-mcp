---
name: booli
description: >-
  Search and analyse Swedish real estate on booli.se — active for-sale
  listings, sold prices (slutpriser), area resolution, and market
  statistics. Use when the user asks about Swedish property, Booli,
  bostäder, lägenheter, villor, or slutpriser.
---

# Booli (booli.se)

Tools for the Swedish property portal Booli, reading its consumer GraphQL
API. Money is in **SEK**, areas in **m²**, rooms as a number.

## Setup — the browser bridge

booli.se is behind a Cloudflare bot wall that blocks server-side requests,
so booli-mcp routes each query through **your own signed-in www.booli.se
browser tab** via the fetchproxy bridge (the Transporter extension). No
Booli login is needed — just a normal, Cloudflare-cleared page view.

- Keep a **www.booli.se** tab open in the browser running the Transporter
  extension. On the first request, approve the one-time pairing prompt.
- `BOOLI_TRANSPORT` picks the path: `auto` (default — tries a direct fetch
  first, falls back to the bridge when walled), `fetchproxy` (always the
  bridge), `direct` (fail if walled). The fleet shares WS port **37149**
  (`BOOLI_WS_PORT`).
- Run `booli_healthcheck` to confirm the path is working.

## Start with an area

Booli's searches scope by a numeric **area id**, not a place name. Resolve
first, or pass a free-text `location` and the search tools resolve the top
hit for you.

1. `booli_search_areas` — `{ query: "Nacka" }` → areas with `area_id` and
   `display_name`. Pass an `area_id` into the search tools.

## For-sale listings

- `booli_search_listings` — search active listings by `area_id` or
  free-text `location`, plus optional `min_list_price`/`max_list_price`
  (SEK), `min_list_sqm_price`/`max_list_sqm_price`, `min_rooms`/`max_rooms`,
  `min_living_area`/`max_living_area` (m²), `min_plot_area`/`max_plot_area`,
  `object_type` (comma-separated: Lägenhet, Villa, Kedjehus-Parhus-Radhus,
  Fritidshus, Gård, Tomt/Mark), `min_construction_year`/`max_construction_year`,
  `is_new_construction`, `sort` + `ascending`. Paginated by `page` — check
  `total_count`/`pages`. Returns slim summaries by default (`compact: false`
  for full raw records).
- `booli_get_listing` — full detail for one property by its **residence id**
  (the number in a booli.se/bostad/<id> URL, or a result's `residence_id`).
  Works for both active and sold properties.

## Sold prices (slutpriser) — the comparables

- `booli_search_sold` — sold properties with the achieved **sold price**,
  **sold date**, and **over/under-asking %**. Same scope/filters as the
  for-sale search, plus `min_sold_price`/`max_sold_price`,
  `min_sold_sqm_price`/`max_sold_sqm_price`, and `min_sold_date`/`max_sold_date`
  (YYYYMMDD).
- `booli_market_stats` — median/average sold price, price per m², and
  average over/under-asking % for an area (same filters as the sold
  search, over one page). Check `sample_size` before trusting a thin median.

## Diagnostics

- `booli_healthcheck` — one-call probe of the data path (direct or bridge).

All tools are read-only.
