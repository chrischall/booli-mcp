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
        'booli_get_sold',
        'booli_healthcheck',
        'booli_market_stats',
        'booli_search_areas',
        'booli_search_listings',
        'booli_search_sold',
      ].sort(),
    );
    await h.close();
  });
});
