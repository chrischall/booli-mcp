# CLAUDE.md — booli-mcp

Guidance for Claude working in this repo.

## TL;DR

MCP server for **booli.se**, a Swedish property portal. Reads active
for-sale listings, sold prices (*slutpriser*), area lookups, and computes
market statistics. stdio transport. All tools are read-only — Booli's API
has no write endpoints, so nothing is `confirm`-gated.

**Data access is a signed direct `fetch` to the classic REST API at
`api.booli.se`** — NOT the bot-walled consumer site. The `www.booli.se`
zone is behind a Cloudflare managed challenge (`cf-mitigated: challenge`),
but the separate `api.booli.se` host answers server-side with no wall. It
requires a per-request HMAC signature (see `src/auth.ts`):

    hash = sha1( callerId + time + apiKey + unique )   // time = unix ms

confirmed against the canonical wrappers rinti/booli-api and
filipsalo/booliapi. Credentials come from `BOOLI_CALLER_ID` /
`BOOLI_API_KEY` — the human requests them at booli.se/p/api (accept the
API terms; the key is emailed). An agent never sets credential values.

**Deferred-config-error pattern.** `DirectTransport`'s constructor reads
the credentials but does NOT throw when they're absent, so the server
still boots and answers the host's install-time `tools/list` probe. The
missing-credentials error surfaces on the first tool call, via
`requireCreds()`. There is no browser bridge and no fetchproxy dependency.

## Architecture (transport / client / tools split)

- `src/transport.ts` — the `BooliTransport` interface (`get(path, query)`).
  Every tool is written against this so tests drive them through an
  in-memory fake (see `tests/helpers.ts`) with zero network.
- `src/transport-direct.ts` — the default signed `fetch` transport: reads
  creds, signs, GETs `api.booli.se`, retries transient 429/5xx, parses
  JSON. Injectable `fetchImpl` / `now` / `uniqueFn` for deterministic
  tests.
- `src/auth.ts` — the pure HMAC signer (`buildAuthParams`) + nonce.
- `src/client.ts` — `BooliClient`: one typed method per endpoint, knows
  each envelope key (`listings` / `sold` / `areas`).
- `src/format.ts` — defensive projections: raw property/area → slim
  snake_case summaries. Every wire field is optional; getters tolerate
  absence rather than assume presence. Searches return `compact` summaries
  by default with the full raw record one flag away.
- `src/stats.ts` — pure market-stat aggregation over sold summaries.
- `src/tools/*.ts` — `registerXxxTools(server, client)`; `tools/index.ts`
  is the barrel (`registerBooliTools`). `src/index.ts` only wires it.

## Endpoints

`GET /listings`, `/listings/:id`, `/sold`, `/sold/:id`, `/areas`. Full
parameter + response reference is pinned in [`docs/BOOLI-API.md`](docs/BOOLI-API.md).

## Conventions

- **TDD, always.** 100% coverage is enforced (`npm run test:coverage`,
  wired into CI). Mock the network — never hit `api.booli.se` in a test.
- **Version** lives once in `src/version.ts` (`x-release-please-version`
  marker); release-please bumps it + the manifests. Don't hand-bump.
- **Never commit secrets** — `.env` is gitignored; throwaway tests only.
- **Don't merge PRs / add `ready-to-merge`** — `pr-auto-review` +
  `auto-merge` ship them.

## Live verification (gated on credentials)

The build + unit tests need no credentials. Verifying against the real
API needs a valid `BOOLI_CALLER_ID` / `BOOLI_API_KEY` — the human must
supply them. Until then, `booli_healthcheck` is the quickest live probe.
