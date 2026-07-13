#!/usr/bin/env node
// booli-mcp entrypoint — standalone stdio MCP server for booli.se.
//
// Boot sequence:
//   1. Build the default GraphQL transport + BooliClient. The default is a
//      direct anonymous `fetch` to www.booli.se/graphql that automatically
//      falls back to the fetchproxy browser bridge when Booli's Cloudflare
//      wall rejects it (see transport-fallback.ts). `BOOLI_TRANSPORT` pins
//      the mode; construction binds nothing — the bridge is only built
//      if/when the direct path is actually walled.
//   2. runMcp() builds the McpServer, applies the tool registrars with the
//      client as deps, prints the banner to stderr, wires graceful
//      shutdown, and connects the stdio transport.
import { runMcp } from '@chrischall/mcp-utils';
import { BooliClient } from './client.js';
import { createDefaultTransport } from './transport-fallback.js';
import { registerBooliTools } from './tools/index.js';
import { VERSION } from './version.js';

const client = new BooliClient({
  transport: createDefaultTransport({ version: VERSION }),
});

await runMcp({
  name: 'booli-mcp',
  version: VERSION,
  banner:
    `[booli-mcp] v${VERSION} — reads booli.se via its consumer GraphQL API ` +
    '(direct fetch, with browser-bridge fallback when Cloudflare-walled). ' +
    'This project was developed and is maintained by AI (Claude). ' +
    "Use at your own discretion and within booli.se's terms.",
  tools: [(server) => registerBooliTools(server, client)],
});
