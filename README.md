# booli-mcp

An MCP server for [Booli](https://www.booli.se), the Swedish property
portal — search active for-sale listings, sold prices (slutpriser),
resolve areas, and compute market statistics, all from Claude.

> Developed and maintained by AI (Claude Code). Use at your own discretion
> and within booli.se's terms of use.

## How it works

booli-mcp reads Booli's classic REST API at `api.booli.se`. Each request
is signed per-call with your Booli **caller id** + **API key** (an HMAC of
`callerId + time + apiKey + unique`). Requests go straight to Booli over
plain HTTPS — no browser bridge, no scraping of the bot-walled consumer
site. All tools are read-only.

## Setup

1. Request API access at <https://www.booli.se/p/api> — accept the API
   terms; the caller id + key are emailed to you.
2. Provide them as environment variables:

   ```
   BOOLI_CALLER_ID=your-caller-id
   BOOLI_API_KEY=your-api-key
   ```

   (See `.env.example`.) The server boots without them, but every tool
   call errors until they're set. Run `booli_healthcheck` to verify.

## Install

```jsonc
// mcp config
{
  "mcpServers": {
    "booli": {
      "command": "npx",
      "args": ["-y", "booli-mcp"],
      "env": {
        "BOOLI_CALLER_ID": "your-caller-id",
        "BOOLI_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `booli_search_areas` | Resolve a place name / coordinate to Booli area ids |
| `booli_search_listings` | Search active for-sale listings by area + filters |
| `booli_get_listing` | Full detail for one for-sale listing by Booli id |
| `booli_search_sold` | Search sold listings (slutpriser) with final prices |
| `booli_get_sold` | Full detail for one sold listing by Booli id |
| `booli_market_stats` | Median/average sold-price statistics for an area |
| `booli_healthcheck` | Verify the API is reachable and credentials work |

Searches scope by `area_id` (from `booli_search_areas`), free-text `q`, a
`center`+`dim` rectangle, or a `bbox`. Money is SEK, areas m². See
[`docs/BOOLI-API.md`](docs/BOOLI-API.md) for the underlying API reference.

## Development

```
npm install
npm test          # vitest, no network
npm run build     # tsc + esbuild bundle
```

## License

MIT
