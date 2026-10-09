import { describe, it, expect } from 'vitest';
import { createTestHarness, routedClient } from '../helpers.js';
import { registerBooliTools } from '../../src/tools/index.js';

describe('registerBooliTools', () => {
  it('registers all booli_* tools', async () => {
    const h = await createTestHarness((s) => registerBooliTools(s, routedClient({})));
    const names = (await h.listTools()).map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'booli_get_listing',
        'booli_healthcheck',
        'booli_market_stats',
        'booli_search_areas',
        'booli_search_listings',
        'booli_search_sold',
      ].sort(),
    );
    await h.close();
  });

  it('marks every read-only data tool idempotent and non-destructive', async () => {
    const h = await createTestHarness((s) => registerBooliTools(s, routedClient({})));
    const { tools } = await h.client.listTools();
    for (const name of [
      'booli_search_areas',
      'booli_search_listings',
      'booli_search_sold',
      'booli_market_stats',
      'booli_get_listing',
    ]) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.annotations, name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
    await h.close();
  });
});
