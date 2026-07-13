import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { versionSyncTest } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

// Release-please drift guard: the VERSION literal in src/version.ts
// (marked with the release-please marker) must match package.json#version.
describe('version sync', () => {
  it('keeps the version literal in sync with package.json', () => {
    const mismatches = versionSyncTest({
      srcDir: join(here, '..', 'src'),
      pkgPath: join(here, '..', 'package.json'),
    });
    expect(mismatches).toEqual([]);
  });
});
