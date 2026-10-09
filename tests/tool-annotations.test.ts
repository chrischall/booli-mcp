import { describe, it, expect } from 'vitest';
import { createTestHarness, routedClient } from './helpers.js';
import { registerBooliTools } from '../src/tools/index.js';

/**
 * The fleet annotation invariants, read off the SERVED `tools/list` rather
 * than a hand-kept list, so a new tool cannot slip past them.
 *
 * `destructiveHint` DEFAULTS TO TRUE whenever `readOnlyHint` is not true, so
 * a write that forgets to declare it is published as destructive and nothing
 * fails — a considered `false` and a forgotten one look identical. Every
 * write must therefore choose. Booli is read-only today; this pins that the
 * day a write arrives it declares itself, and that no read claims otherwise.
 */
async function servedTools() {
  const h = await createTestHarness((s) => registerBooliTools(s, routedClient({})));
  try {
    return (await h.client.listTools()).tools;
  } finally {
    await h.close();
  }
}

describe('every tool declares what it does', () => {
  it('covers the full served surface (guards against a registrar being dropped)', async () => {
    expect(await servedTools()).toHaveLength(6);
  });

  it('sets an explicit boolean readOnlyHint and openWorldHint on all of them', async () => {
    const missing = (await servedTools())
      .filter((t) => typeof t.annotations?.readOnlyHint !== 'boolean' || typeof t.annotations?.openWorldHint !== 'boolean')
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('sets an explicit boolean destructiveHint on every write', async () => {
    const undeclared = (await servedTools())
      .filter((t) => t.annotations?.readOnlyHint !== true && typeof t.annotations?.destructiveHint !== 'boolean')
      .map((t) => t.name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', async () => {
    const contradictory = (await servedTools())
      .filter((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === true)
      .map((t) => t.name);
    expect(contradictory).toEqual([]);
  });
});
