/**
 * `booli_healthcheck` — one-call end-to-end probe of the Booli data path.
 *
 * Runs a tiny area-suggestion round-trip and reports `ok`, the elapsed ms,
 * and a plain-English hint. Because booli.se is Cloudflare-walled, a
 * failure usually means the request could not ride a real browser session
 * — call it when a real tool errors and you want to know whether the
 * fetchproxy bridge is reachable and a www.booli.se tab is available.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { messageOf } from '@chrischall/mcp-utils';
import type { BooliClient } from '../client.js';
import { textResult } from '../mcp.js';

export function registerHealthcheckTools(server: McpServer, client: BooliClient): void {
  server.registerTool(
    'booli_healthcheck',
    {
      title: 'Verify the Booli data path',
      description:
        'Round-trips a tiny query to booli.se and reports whether the endpoint is ' +
        'reachable (directly or via the browser bridge), the elapsed time, and a ' +
        'hint. Read-only.',
      annotations: {
        title: 'Verify the Booli data path',
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
          hint: 'Booli is reachable and responding.',
        });
      } catch (err) {
        const error = messageOf(err);
        const walled = /Cloudflare|non-JSON|browser bridge|bridge:/i.test(error);
        return textResult({
          ok: false,
          elapsed_ms: Date.now() - start,
          error,
          hint: walled
            ? 'Booli is serving a Cloudflare bot challenge. Set BOOLI_TRANSPORT=fetchproxy (or leave the default "auto"), keep a www.booli.se tab open (no login needed), and approve the Transporter pairing prompt if one appears.'
            : 'Booli did not respond. Check network reachability; the endpoint or a queried field may have changed.',
        });
      }
    },
  );
}
