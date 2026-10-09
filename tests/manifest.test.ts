import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestHarness, routedClient } from './helpers.js';
import { registerBooliTools } from '../src/tools/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));

/**
 * The env keys the server honours. `BOOLI_TRANSPORT` and `BOOLI_WS_PORT` are
 * this server's own (README); `FETCHPROXY_WS_HOST` and
 * `FETCHPROXY_IDENTITY_DIR` are read by the bundled `@fetchproxy/server`
 * because this server never passes `host` / `identityDir` (it always passes
 * `port`, so `FETCHPROXY_WS_PORT` is NOT honoured and is not declared).
 */
const ENV = ['BOOLI_TRANSPORT', 'BOOLI_WS_PORT', 'FETCHPROXY_IDENTITY_DIR', 'FETCHPROXY_WS_HOST'];

describe('install surfaces match the server', () => {
  it('manifest.json tools[] lists exactly the served tools', async () => {
    const h = await createTestHarness((s) => registerBooliTools(s, routedClient({})));
    const served = (await h.listTools()).map((t) => t.name).sort();
    await h.close();
    const listed = (readJson('manifest.json').tools as { name: string }[]).map((t) => t.name).sort();
    expect(listed).toEqual(served);
  });

  it('manifest.json passes every honoured env key, each from an optional user_config entry', () => {
    const m = readJson('manifest.json');
    const env = m.server.mcp_config.env as Record<string, string>;
    expect(Object.keys(env).sort()).toEqual(ENV);
    for (const [key, value] of Object.entries(env)) {
      const ref = /^\$\{user_config\.([^}]+)\}$/.exec(value)?.[1];
      expect(ref, key).toBeDefined();
      expect(m.user_config[ref!]?.required, key).toBe(false);
    }
  });

  it('server.json declares every honoured env key as optional', () => {
    const vars = readJson('server.json').packages[0].environmentVariables as { name: string; isRequired: boolean }[];
    expect(vars.map((v) => v.name).sort()).toEqual(ENV);
    expect(vars.every((v) => v.isRequired === false)).toBe(true);
  });
});
