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

/** The GraphQL response envelope: exactly one of `data` / `errors` is meaningful. */
export interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

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
}
