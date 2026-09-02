/**
 * Transport-agnostic interface for talking to Booli's consumer GraphQL
 * endpoint (`www.booli.se/graphql`).
 *
 * The whole client (src/client.ts) is written against this one method so
 * tests can drive every tool through an in-memory fake (see
 * tests/helpers.ts) with zero network, and so the direct-fetch and
 * fetchproxy-bridge transports are interchangeable without touching a
 * single tool.
 *
 * The transport owns ONLY the wire round-trip + JSON parse. It does NOT
 * interpret GraphQL `errors`, map them to typed exceptions, or reach into
 * `data` — those are Booli-semantic concerns and live on the client.
 */

import type { BridgeHealthcheckTransport } from '@chrischall/mcp-utils/fetchproxy';

/** The GraphQL response envelope: exactly one of `data` / `errors` is meaningful. */
export interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

/**
 * Which path a transport is serving on. Surfaced by `booli_healthcheck`
 * so a failure isolates to the right leg: `transport` is the path the
 * next request rides, `mode` is the configured `BOOLI_TRANSPORT`. The
 * bridge's own state (role, port, extension link) is deliberately NOT
 * here — the shared healthcheck projects it from {@link BooliTransport.bridgeTransport}
 * so the result carries exactly one `bridge` block.
 *
 * A type alias (not an interface) so it is assignable to mcp-utils'
 * index-signatured `HealthcheckPath` without a cast.
 */
export type TransportStatus = {
  transport: 'direct' | 'fetchproxy' | 'unknown';
  mode: 'direct' | 'fetchproxy' | 'auto';
};

export interface BooliTransport {
  /**
   * Execute one GraphQL operation and return the raw `{ data, errors }`
   * envelope. Rejects only on transport-level failure (network error,
   * non-2xx after retries, unparseable body, Cloudflare challenge) — a
   * GraphQL `errors` array is a successful round-trip and comes back in
   * the envelope for the client to classify.
   */
  graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>>;
  /**
   * Optional: report which path this transport serves on (see
   * {@link TransportStatus}). A test fake or an embedding consumer may
   * omit it; the healthcheck then reports the path as `unknown`.
   */
  status?(): TransportStatus;
  /**
   * Optional: the underlying fetchproxy bridge (its `runProbe` + `status`
   * slice), once one exists — the shared bridge healthcheck projects the
   * bridge block (role, port, extension link state) from it. `undefined`
   * on the direct leg or before the fallback has built the bridge.
   */
  bridgeTransport?(): BridgeHealthcheckTransport | undefined;
}
