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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  FetchproxyBridgeDownError,
  FetchproxySessionNotReadyError,
  registerBridgeHealthcheckTool,
} from '@chrischall/mcp-utils/fetchproxy';
import type { BooliClient } from '../client.js';
import { CloudflareChallengeError } from '../transport-direct.js';

const WALLED_HINT =
  'Booli is serving a Cloudflare bot challenge. Set BOOLI_TRANSPORT=fetchproxy ' +
  '(or leave the default "auto"), keep a www.booli.se tab open (no login ' +
  'needed), and approve the Transporter pairing prompt if one appears.';

const DIRECT_FAILURE_HINT =
  'The probe ran over the direct fetch (no browser bridge involved) and failed ' +
  'without a Cloudflare challenge — see error.message. Check network ' +
  'reachability; the endpoint or a queried field may have changed. If Booli ' +
  'starts answering with a bot wall, set BOOLI_TRANSPORT=fetchproxy or leave ' +
  'the default "auto" to switch on the next challenge.';

/**
 * Site-specific re-kinding of what the probe threw. The direct leg's
 * `CloudflareChallengeError` is the one error the shared ladder can't name;
 * on the bridge leg transport-fetchproxy wraps the typed fetchproxy errors
 * in a plain `Error` (message + remediation hint) with the original as
 * `cause`, so look through it to keep the shared classification.
 */
function classifyThrown(
  err: unknown,
): { kind: string; hint?: string } | undefined {
  if (err instanceof CloudflareChallengeError) {
    return { kind: 'cloudflare_challenge', hint: WALLED_HINT };
  }
  const cause = err instanceof Error ? err.cause : undefined;
  if (cause instanceof FetchproxySessionNotReadyError) {
    return { kind: 'session_not_ready' };
  }
  if (cause instanceof FetchproxyBridgeDownError) {
    return { kind: 'bridge_down' };
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
    probeFn: async () => JSON.stringify(await client.healthcheck()),
    classifyThrown,
    hints: { direct: DIRECT_FAILURE_HINT },
  });
}
