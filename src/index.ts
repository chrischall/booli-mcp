#!/usr/bin/env node
// booli-mcp entrypoint — standalone stdio MCP server for booli.se.
//
// Boot sequence:
//   1. Build the signed direct-`fetch` transport + BooliClient. The
//      transport reads BOOLI_CALLER_ID / BOOLI_API_KEY but does NOT throw
//      when they're absent (deferred-config-error): the server still
//      boots and answers the host's install-time tools/list probe; the
//      missing-credentials error surfaces on the first tool call.
//   2. runMcp() builds the McpServer, applies the tool registrars with
//      the client as deps, prints the banner to stderr, wires graceful
//      shutdown, and connects the stdio transport.
import { runMcp } from '@chrischall/mcp-utils';
import { BooliClient } from './client.js';
import { DirectTransport } from './transport-direct.js';
import { registerBooliTools } from './tools/index.js';
import { VERSION } from './version.js';

const client = new BooliClient({
  transport: new DirectTransport({ version: VERSION }),
});

await runMcp({
  name: 'booli-mcp',
  version: VERSION,
  banner:
    `[booli-mcp] v${VERSION} — reads booli.se via its signed REST API ` +
    '(api.booli.se, per-request HMAC auth). This project was developed and is ' +
    "maintained by AI (Claude). Use at your own discretion and within booli.se's terms.",
  tools: [(server) => registerBooliTools(server, client)],
});
