/**
 * `booli_healthcheck` — one-call end-to-end probe of the Booli data path,
 * built on the fleet's shared bridge healthcheck
 * (`registerBridgeHealthcheckTool` from `@chrischall/mcp-utils/fetchproxy`).
 *
 * The probe is the client's tiny area-suggestion round-trip, run over
 * whatever transport the tools use (direct fetch with browser-bridge
 * fallback by default). Because booli-mcp is direct-first, the shared tool
 * runs in its path-aware mode: the probe itself may be what flips the
 * fallback, so the path (`transport`) and the bridge block (`bridge`, with
 * role / port / extension link `session_state`) are read AFTER it. A
 * Cloudflare challenge on the direct leg is classified as
 * `cloudflare_challenge` with the BOOLI_TRANSPORT remediation; bridge-layer
 * failures keep the shared hint ladder (pair code pending, extension not
 * attached, service worker asleep, …).
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { registerBridgeHealthcheckTool } from '@chrischall/mcp-utils/fetchproxy';
import type { BooliClient } from '../client.js';
import { CloudflareChallengeError } from '../transport-direct.js';
import { BridgeHttpStatusError } from '../transport-fetchproxy.js';

const WALLED_HINT =
  'Booli is serving a Cloudflare bot challenge. Set BOOLI_TRANSPORT=fetchproxy ' +
  '(or leave the default "auto"), keep a www.booli.se tab open (no login ' +
  'needed), and approve the ContextMint Bridge pairing prompt if one appears.';

const DIRECT_FAILURE_HINT =
  'The probe ran over the direct fetch (no browser bridge involved) and failed ' +
  'without a Cloudflare challenge — see error.message. Check network ' +
  'reachability; the endpoint or a queried field may have changed. If Booli ' +
  'starts answering with a bot wall, set BOOLI_TRANSPORT=fetchproxy or leave ' +
  'the default "auto" to switch on the next challenge.';

/**
 * Site-specific re-kinding of what the probe threw — only what the shared
 * ladder can't say on its own. Since mcp-utils 2.12 the shared healthcheck
 * unwraps a typed bridge failure that transport-fetchproxy re-throws as
 * `cause` (`session_not_ready` / `bridge_down` / `timeout` /
 * `capability_unavailable` keep their kinds and hints), so the arms this
 * file used to hand-roll for those are gone (fleet-audit#988).
 *
 *   - a `CloudflareChallengeError` — the direct leg's, or the bridge leg's
 *     non-JSON answer's `cause` → `cloudflare_challenge` with the
 *     BOOLI_TRANSPORT remediation (this server's documented kind);
 *   - the bridge leg's non-2xx, typed `BridgeHttpStatusError` as `cause` —
 *     an upstream HTTP status, not a bridge fault → `http`.
 */
function classifyThrown(
  err: unknown,
): { kind: string; hint?: string } | undefined {
  const cause = err instanceof Error ? err.cause : undefined;
  if (err instanceof CloudflareChallengeError || cause instanceof CloudflareChallengeError) {
    return { kind: 'cloudflare_challenge', hint: WALLED_HINT };
  }
  if (cause instanceof BridgeHttpStatusError) {
    return { kind: 'http' };
  }
  return undefined;
}

export function registerHealthcheckTools(server: McpServer, client: BooliClient): void {
  registerBridgeHealthcheckTool({
    server,
    prefix: 'booli',
    // The probe is the client's area-suggestion query, POSTed to /graphql.
    probePath: '/graphql',
    hostLabel: 'www.booli.se',
    // Read after the probe: the bridge only exists once the fallback flipped.
    transport: () => client.bridgeTransport(),
    path: () =>
      client.transportStatus() ?? { transport: 'unknown', mode: 'auto' },
    probeFn: async () => {
      const result = await client.healthcheck();
      // A 200 with no hits is a changed query or field, not a healthy
      // endpoint — the serialised body would be the same length either way.
      if (result.hits === 0) {
        throw new Error(
          'Booli answered, but the area-suggestion probe for "Stockholm" returned 0 hits — the query or a field may have changed.',
        );
      }
      return JSON.stringify(result);
    },
    classifyThrown,
    hints: { direct: DIRECT_FAILURE_HINT },
  });
}
