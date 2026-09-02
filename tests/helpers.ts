// Test harness for booli-mcp.
//
// Re-exports the fleet's in-memory MCP harness (createTestHarness /
// parseToolResult / versionSyncTest) and adds a FakeTransport: a
// BooliTransport whose `graphql` is driven by a handler keyed off the
// operation name in the query. Every test drives tools + client through
// this fake — zero network.
export {
  createTestHarness,
  parseToolResult,
  versionSyncTest,
} from '@chrischall/mcp-utils/test';

import type { BridgeHealth } from '@chrischall/mcp-utils/fetchproxy';
import { BooliClient } from '../src/client.js';
import type { GraphQLResponse, BooliTransport } from '../src/transport.js';

/** Handler mapping a GraphQL (query, variables) → a response envelope. */
export type GraphqlHandler = (
  query: string,
  variables: Record<string, unknown>,
) => GraphQLResponse<unknown>;

/** Records every call the code under test made, for assertions. */
export interface FakeTransport extends BooliTransport {
  calls: { query: string; variables: Record<string, unknown> }[];
}

/** Build a fake transport from a single handler. */
export function fakeTransport(handler: GraphqlHandler): FakeTransport {
  const calls: FakeTransport['calls'] = [];
  return {
    calls,
    async graphql<T>(query: string, variables: Record<string, unknown>) {
      calls.push({ query, variables });
      return handler(query, variables) as GraphQLResponse<T>;
    },
  };
}

/**
 * Route responses by operation name (the `query XxxName(` after the
 * leading `query` keyword). Pass a map from operation name → envelope (or
 * a function of the variables). Unmapped operations return an error.
 */
export function routedTransport(routes: {
  [operation: string]:
    | GraphQLResponse<unknown>
    | ((variables: Record<string, unknown>) => GraphQLResponse<unknown>);
}): FakeTransport {
  return fakeTransport((query, variables) => {
    const match = query.match(/query\s+(\w+)/);
    const name = match?.[1] ?? '';
    const route = routes[name];
    if (route === undefined) {
      return { errors: [{ message: `no route for ${name}` }] };
    }
    return typeof route === 'function' ? route(variables) : route;
  });
}

/** A BooliClient backed by the given handler. */
export function fakeClient(handler: GraphqlHandler): BooliClient {
  return new BooliClient({ transport: fakeTransport(handler) });
}

/** A BooliClient backed by routed responses. */
export function routedClient(
  routes: Parameters<typeof routedTransport>[0],
): BooliClient {
  return new BooliClient({ transport: routedTransport(routes) });
}

/**
 * A full `bridgeHealth()` snapshot (the `status()` shape of a fetchproxy
 * bridge) for fakes. Defaults to a linked host on the fleet port; override
 * the bits a test cares about.
 */
export function fakeBridgeHealth(
  overrides: Partial<BridgeHealth> = {},
): BridgeHealth {
  return {
    role: 'host',
    port: 37_149,
    host: '127.0.0.1',
    serverVersion: '2.5.0',
    fetchTimeoutMs: 20_000,
    bridgeReviveDelayMs: 2_000,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    consecutiveFailures: 0,
    lastExtensionMessageAt: 1_756_850_326_000,
    session: { state: 'linked', pairCode: null, extensionConnected: true },
    keepAlive: {
      enabled: true,
      intervalMs: 20_000,
      maxIdleMs: 300_000,
      lastPingAt: null,
      totalPings: 0,
      idleSinceMs: null,
    },
    swEviction: {
      lazyReviveAttempts: 0,
      lazyReviveSuccesses: 0,
      lastEvictionDetectedAt: null,
    },
    ...overrides,
  };
}
