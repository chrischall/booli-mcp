/**
 * Transport-agnostic interface for talking to the Booli REST API.
 *
 * The whole client (src/client.ts) is written against this one method so
 * tests can drive every tool through an in-memory fake (see
 * tests/helpers.ts) with zero network, and so the credential/signing +
 * HTTP concerns stay isolated in one place (src/transport-direct.ts).
 *
 * The transport owns the wire round-trip: it signs the request (Booli's
 * per-request HMAC query auth), performs the GET, retries transient
 * failures, and parses the JSON body. It does NOT interpret the Booli
 * response envelope (`listings` vs `sold` vs `areas`, empty results) —
 * those are Booli-semantic concerns and live on the client.
 */

/** Query parameters for a Booli request (auth params are added by the transport). */
export type BooliQuery = Record<string, string | number | undefined>;

export interface BooliTransport {
  /**
   * GET one Booli endpoint (e.g. `listings`, `sold`, `areas`,
   * `listings/123`) with the given query params, returning the parsed
   * JSON body. Rejects on a missing-credentials config error, a
   * transport-level failure (network error, non-2xx after retries,
   * unparseable body), or a Booli `FAILURE_*` error response.
   */
  get<T>(path: string, query?: BooliQuery): Promise<T>;
}
