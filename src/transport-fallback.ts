/**
 * Direct-first transport with automatic browser-bridge fallback.
 *
 * Booli fronts www.booli.se with a Cloudflare managed challenge that
 * rejects non-browser clients (see transport-direct.ts /
 * transport-fetchproxy.ts). The direct fetch is still tried first — it
 * needs no extension, no pairing, no open tab — and Booli may drop or
 * scope the wall. So: try direct; the moment it answers with a challenge
 * (`CloudflareChallengeError`), switch to the fetchproxy bridge and stay
 * there for the life of the process (the wall fingerprints the client, so
 * re-probing direct on every call would just burn a round trip).
 *
 * `BOOLI_TRANSPORT` pins a mode: `direct` (fail hard when walled),
 * `fetchproxy` (always ride the tab), `auto` (this fallback — default).
 */
import {
  createDirectFirstTransport,
  readTransportMode,
  type BridgeHealthcheckTransport,
  type DirectFirstTransport,
} from '@chrischall/mcp-utils/fetchproxy';
import type {
  GraphQLResponse,
  BooliTransport,
  TransportStatus,
} from './transport.js';
import { DirectTransport } from './transport-direct.js';
import { BooliFetchproxyTransport } from './transport-fetchproxy.js';

/**
 * The `auto` router, as a {@link BooliTransport}. The routing itself — try
 * direct, switch to the bridge on the first CDN/WAF refusal (any
 * `EdgeBlockedError`, which `CloudflareChallengeError` is), re-run that call
 * there, stay there, build the bridge once — is mcp-utils'
 * `createDirectFirstTransport` (fleet-audit#988); this class only adapts it
 * to the one-method transport interface.
 */
export class FallbackTransport implements BooliTransport {
  private readonly legs: DirectFirstTransport<BooliTransport, BooliTransport>;

  constructor(direct: BooliTransport, bridgeFactory: () => BooliTransport) {
    this.legs = createDirectFirstTransport<BooliTransport>({
      direct,
      bridge: bridgeFactory,
      mode: 'auto',
      serverName: 'booli-mcp',
      hostLabel: 'www.booli.se (no login needed)',
    });
  }

  graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    return this.legs.run((leg) => leg.graphql<T>(query, variables));
  }

  /**
   * The path the next request rides, `mode: 'auto'` (so a reader can tell
   * "on the bridge by fallback" from "pinned"), and `blocked_by` once a
   * CDN/WAF refusal forced the switch.
   */
  status(): TransportStatus {
    return this.legs.status();
  }

  /** The bridge's healthcheck slice once the fallback has built it. */
  bridgeTransport(): BridgeHealthcheckTransport | undefined {
    return this.legs.bridgeTransport();
  }
}

export interface DefaultTransportOptions {
  /** Client version, surfaced in the direct UA and bridge status. */
  version?: string;
  /** Injected direct transport (tests). */
  direct?: BooliTransport;
  /** Injected bridge factory (tests). */
  bridgeFactory?: () => BooliTransport;
}

/**
 * Build the transport `index.ts` should use: mode from `BOOLI_TRANSPORT`
 * (read by mcp-utils' `readTransportMode`: case-insensitive; an unknown
 * value warns to stderr and means `auto`), defaulting to the
 * direct-with-fallback combination above.
 */
export function createDefaultTransport(
  opts: DefaultTransportOptions = {},
): BooliTransport {
  const direct = opts.direct ?? new DirectTransport({ version: opts.version });
  const bridgeFactory =
    opts.bridgeFactory ??
    (() => new BooliFetchproxyTransport({ version: opts.version }));
  const mode = readTransportMode('BOOLI_TRANSPORT', {
    log: (message) => console.error(`[booli-mcp] ${message}`),
  });
  if (mode === 'direct') return direct;
  if (mode === 'fetchproxy') return bridgeFactory();
  return new FallbackTransport(direct, bridgeFactory);
}
