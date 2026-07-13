# booli-mcp

An MCP server for [Booli](https://www.booli.se), the Swedish property
portal — search active for-sale listings, sold prices (slutpriser),
resolve areas, and compute market statistics, all from Claude.

> Developed and maintained by AI (Claude Code). Use at your own discretion
> and within booli.se's terms of use.

## How it works

Booli fronts www.booli.se — including its GraphQL API — with a Cloudflare
bot wall that blocks server-side clients. booli-mcp therefore reads Booli's
consumer GraphQL API by routing each query through **your own signed-in
www.booli.se browser tab** via the [fetchproxy](https://github.com/) bridge
(the Transporter extension), reusing your Cloudflare-cleared session. No
Booli login is required — just a normal page view. All tools are read-only.

`BOOLI_TRANSPORT` selects the path: `auto` (default — direct fetch first,
browser-bridge fallback when walled), `fetchproxy` (always the bridge), or
`direct`. The fetchproxy fleet shares WS port `37149` (`BOOLI_WS_PORT`).

## Setup

1. Install the Transporter (fetchproxy) browser extension and keep a
   **www.booli.se** tab open.
2. On the first request, approve the one-time pairing prompt in Transporter.
3. Run `booli_healthcheck` to confirm the path is working.

## Install

```jsonc
// mcp config
{
  "mcpServers": {
    "booli": {
      "command": "npx",
      "args": ["-y", "booli-mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `booli_search_areas` | Resolve a place name to Booli area ids |
| `booli_search_listings` | Search active for-sale listings by area + filters |
| `booli_get_listing` | Full detail for one property (active or sold) by residence id |
| `booli_search_sold` | Search sold listings (slutpriser) with final prices |
| `booli_market_stats` | Median/average sold-price statistics for an area |
| `booli_healthcheck` | Verify the data path (direct or via the browser bridge) |

Searches scope by `area_id` (from `booli_search_areas`) or a free-text
`location`. Money is SEK, areas m². See
[`docs/BOOLI-API.md`](docs/BOOLI-API.md) for the underlying GraphQL API.

## Development

```
npm install
npm test          # vitest, no network
npm run build     # tsc + esbuild bundle
```

## License

MIT
