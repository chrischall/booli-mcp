/**
 * `booli_healthcheck` — one-call end-to-end probe of the Booli API.
 *
 * Runs a tiny /areas round-trip and reports `ok`, the elapsed ms, and a
 * plain-English hint. Because it exercises the signed request path, a
 * failure here isolates cleanly to network reachability, missing
 * credentials, or a bad caller id / key — call it when a real tool errors
 * and you want to know whether the endpoint + credentials are healthy.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { messageOf } from '@chrischall/mcp-utils';
import type { BooliClient } from '../client.js';
import { textResult } from '../mcp.js';

export function registerHealthcheckTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_healthcheck',
    {
      title: 'Verify the Booli API',
      description:
        'Round-trips a tiny query to api.booli.se and reports whether the endpoint ' +
        'is reachable, the credentials work, the elapsed time, and a hint. Read-only.',
      annotations: {
        title: 'Verify the Booli API',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {},
    },
    async () => {
      const start = Date.now();
      try {
        const result = await client.healthcheck();
        return textResult({
          ok: true,
          elapsed_ms: Date.now() - start,
          hits: result.hits,
          hint: 'Booli API is reachable and the credentials are valid.',
        });
      } catch (err) {
        return textResult({
          ok: false,
          elapsed_ms: Date.now() - start,
          error: messageOf(err),
          hint: 'Booli API did not respond as expected. Check network reachability and that BOOLI_CALLER_ID / BOOLI_API_KEY are set and valid.',
        });
      }
    },
  );
}
