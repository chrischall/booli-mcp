/**
 * Tool registrar barrel: each tool module exports
 * `registerXxxTools(server, client)`; `registerBooliTools` applies them
 * all. src/index.ts wires this to the running server, and tool tests can
 * mount individual registrars against a harness.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BooliClient } from '../client.js';
import { registerAreaTools } from './areas.js';
import { registerListingTools } from './listings.js';
import { registerSoldTools } from './sold.js';
import { registerStatsTools } from './stats.js';
import { registerHealthcheckTools } from './healthcheck.js';

export {
  registerAreaTools,
  registerListingTools,
  registerSoldTools,
  registerStatsTools,
  registerHealthcheckTools,
};

/** Register every booli_* tool on the server. */
export function registerBooliTools(server: McpServer, client: BooliClient): void {
  registerAreaTools(server, client);
  registerListingTools(server, client);
  registerSoldTools(server, client);
  registerStatsTools(server, client);
  registerHealthcheckTools(server, client);
}
