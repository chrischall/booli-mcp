# CLAUDE.md — booli-mcp

Guidance for Claude working in this repo.

## TL;DR

MCP server for **booli.se**, a Swedish property portal. Reads active
for-sale listings, sold prices (*slutpriser*), area lookups, single-property
detail, and computes market statistics. stdio transport. All tools are
read-only — nothing is `confirm`-gated.

**Data access is Booli's consumer GraphQL API via the fetchproxy browser
bridge.** Booli fronts the whole www.booli.se zone — including `/graphql` —
with a Cloudflare managed challenge (`cf-mitigated: challenge`) that 403s
every non-browser client (Node/curl), and Cloudflare fingerprints the HTTP
client itself, so no header/cookie replay durably clears it. The identical
query returns 200 from a `fetch` inside a real tab. So requests ride the
user's own signed-in (Cloudflare-cleared) www.booli.se tab via
`@fetchproxy/server` + the Transporter extension. No Booli login needed —
just a cleared Cloudflare session (any normal page view). Verified live
2026-07-13; full API in [docs/BOOLI-API.md](docs/BOOLI-API.md).

> **History:** an earlier iteration targeted the classic signed REST API at
> `api.booli.se` (HMAC `callerId`/`apiKey`). Booli no longer issues those
> credentials to new users, so that surface is unusable — we pivoted to the
> consumer GraphQL + browser bridge. See docs/BOOLI-API.md §2.

## Transport (mirrors hemnet-mcp's fetchproxy pattern)

- `src/transport.ts` — the `BooliTransport` interface (`graphql(query,
  variables)`, plus optional `status()` → `TransportStatus` and
  `bridgeTransport()` → the bridge's `runProbe`/`status` slice). Every
  tool is written against it so tests drive them through an in-memory
  fake (tests/helpers.ts) with zero network.
- `src/transport-direct.ts` — direct Node `fetch` to www.booli.se/graphql;
  throws a typed `CloudflareChallengeError` on the bot wall (detected by
  `cf-mitigated: challenge` / `_cf_chl_opt` / "Just a moment" only).
- `src/transport-fetchproxy.ts` — the browser bridge: each GraphQL POST
  runs as a same-origin fetch in the signed-in tab via
  `createFetchproxyTransport` (`@chrischall/mcp-utils/fetchproxy`).
- `src/transport-fallback.ts` — `createDefaultTransport`: direct-first with
  sticky fallback to the bridge on `CloudflareChallengeError`.
  `BOOLI_TRANSPORT` = `direct` | `fetchproxy` | `auto` (default). Shared
  fleet WS port **37149** (`BOOLI_WS_PORT`). Its `status()` reports the
  leg the next call rides (`mode: 'auto'`), and `bridgeTransport()` the
  bridge once the fallback has built it.
- `src/tools/healthcheck.ts` — `booli_healthcheck` is the fleet's shared
  `registerBridgeHealthcheckTool` (`@chrischall/mcp-utils/fetchproxy`) in
  its direct-first (`path`) mode: `probeFn` is `client.healthcheck()`,
  `path` reads `client.transportStatus()` and `transport` reads
  `client.bridgeTransport()` AFTER the probe (the probe may be what flips
  the fallback). Output: `ok`, `transport` (`{transport, mode}` — the leg
  and the `BOOLI_TRANSPORT` pin, nothing else), `bridge` (role, port,
  `session_state`, `pending_pair_code`, `extension_connected`, epoch-ms
  `last_extension_message_at` — the ONE bridge block, projected by the
  shared tool from `bridgeTransport().status()`; present only once a
  bridge exists), `probe`, `error` (`kind` — `cloudflare_challenge` for the
  direct leg's `CloudflareChallengeError`, else the fetchproxy vocabulary
  `session_not_ready` / `bridge_down` / `timeout` / …), `hint`. The
  fetchproxy transport wraps typed bridge errors with the original as
  `cause` so the classification survives the wrapper.
- `@fetchproxy/server` is bundled in (no esbuild `--external`), so the
  fetchproxy imports are eager static imports — safe because nothing is
  externalized. If you ever externalize it, make those imports lazy
  `await import()` behind the fetchproxy/auto path.

## Data layer

- `src/graphql.ts` — the validated query documents + input/response types.
  Numeric fields are `FormattedValue { raw }`.
- `src/client.ts` — `BooliClient`: `areaSuggestions`, `searchForSale`,
  `searchSold`, `getProperty` (by residence id — the `/bostad/<id>` number,
  NOT `booliId`), `healthcheck`. Filters search results to `Listing` /
  `SoldProperty` (results also include `Project` new-construction nodes).
- `src/format.ts` — defensive projections (every wire field optional).
- `src/tools/_shared.ts` — builds the `SearchRequest` input: resolves
  area (`area_id` or free-text `location` → top `areaSuggestionSearch` hit)
  and maps filters to the `filters: [{key, value}]` array.

## Conventions

- **TDD, always.** 100% coverage enforced (`npm run test:coverage`, in CI).
  Mock the transport — never hit booli.se in a test.
- **Verify GraphQL fields against the live endpoint** before adding them
  (introspection is disabled; probe `/graphql` in a signed-in tab and read
  the validation errors — that's how every field here was pinned).
- **Version** lives once in `src/version.ts` (`x-release-please-version`);
  release-please bumps it + the manifests. Don't hand-bump.
- **Don't merge PRs / add `ready-to-merge`** — `pr-auto-review` +
  `auto-merge` ship them.

## Live verification

Build + unit tests need no browser. A true end-to-end check needs the
Transporter extension paired and a www.booli.se tab open;
`booli_healthcheck` is the quickest probe.
