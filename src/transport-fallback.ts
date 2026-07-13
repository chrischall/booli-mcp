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
import { readEnvVar } from '@chrischall/mcp-utils';
import type { GraphQLResponse, BooliTransport } from './transport.js';
import { CloudflareChallengeError, DirectTransport } from './transport-direct.js';
import { BooliFetchproxyTransport } from './transport-fetchproxy.js';

export class FallbackTransport implements BooliTransport {
  private walled = false;
  private bridge: BooliTransport | undefined;

  constructor(
    private readonly direct: BooliTransport,
    private readonly bridgeFactory: () => BooliTransport,
  ) {}

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    if (!this.walled) {
      try {
        return await this.direct.graphql<T>(query, variables);
      } catch (err) {
        if (!(err instanceof CloudflareChallengeError)) throw err;
        this.walled = true;
        console.error(
          '[booli-mcp] Direct fetch got a Cloudflare challenge — switching to ' +
            'the fetchproxy browser bridge for the rest of this session. Keep a ' +
            'www.booli.se tab open (no login needed) and approve the pairing ' +
            'prompt in the Transporter extension if one appears.',
        );
      }
    }
    this.bridge ??= this.bridgeFactory();
    return this.bridge.graphql<T>(query, variables);
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
 * Build the transport `index.ts` should use: mode from `BOOLI_TRANSPORT`,
 * defaulting to the direct-with-fallback combination above. Unknown values
 * warn to stderr and mean `auto`.
 */
export function createDefaultTransport(
  opts: DefaultTransportOptions = {},
): BooliTransport {
  const direct = opts.direct ?? new DirectTransport({ version: opts.version });
  const bridgeFactory =
    opts.bridgeFactory ??
    (() => new BooliFetchproxyTransport({ version: opts.version }));
  const mode = readEnvVar('BOOLI_TRANSPORT') ?? 'auto';
  if (mode === 'direct') return direct;
  if (mode === 'fetchproxy') return bridgeFactory();
  if (mode !== 'auto') {
    console.error(
      `[booli-mcp] Unknown BOOLI_TRANSPORT value "${mode}" — using "auto" ` +
        '(direct fetch with browser-bridge fallback).',
    );
  }
  return new FallbackTransport(direct, bridgeFactory);
}
