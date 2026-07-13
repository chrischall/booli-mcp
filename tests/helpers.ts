// Test harness for booli-mcp.
//
// Re-exports the fleet's in-memory MCP harness (createTestHarness /
// parseToolResult / versionSyncTest) and adds a FakeTransport: a
// BooliTransport whose `get` is driven by a handler keyed off the request
// path. Every test drives tools + client through this fake — zero network.
export {
  createTestHarness,
  parseToolResult,
  versionSyncTest,
} from '@chrischall/mcp-utils/test';

import { BooliClient } from '../src/client.js';
import type { BooliQuery, BooliTransport } from '../src/transport.js';

/** Handler mapping a request (path, query) → the JSON body to return. */
export type GetHandler = (path: string, query: BooliQuery) => unknown;

/** Records every call the code under test made, for assertions. */
export interface FakeTransport extends BooliTransport {
  calls: { path: string; query: BooliQuery }[];
}

/** Build a fake transport from a single handler. */
export function fakeTransport(handler: GetHandler): FakeTransport {
  const calls: FakeTransport['calls'] = [];
  return {
    calls,
    async get<T>(path: string, query: BooliQuery = {}) {
      calls.push({ path, query });
      return handler(path, query) as T;
    },
  };
}

/**
 * Route responses by the leading path segment (`listings`, `sold`,
 * `areas`). Pass a map from segment → body (or a function of the query).
 * Unmapped paths throw.
 */
export function routedTransport(routes: {
  [segment: string]: unknown | ((query: BooliQuery, path: string) => unknown);
}): FakeTransport {
  return fakeTransport((path, query) => {
    const segment = path.split('/')[0] ?? '';
    const route = routes[segment];
    if (route === undefined) {
      throw new Error(`no route for ${path}`);
    }
    return typeof route === 'function'
      ? (route as (q: BooliQuery, p: string) => unknown)(query, path)
      : route;
  });
}

/** A BooliClient backed by the given handler. */
export function fakeClient(handler: GetHandler): BooliClient {
  return new BooliClient({ transport: fakeTransport(handler) });
}

/** A BooliClient backed by routed responses. */
export function routedClient(
  routes: Parameters<typeof routedTransport>[0],
): BooliClient {
  return new BooliClient({ transport: routedTransport(routes) });
}
