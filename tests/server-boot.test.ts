import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// End-to-end boot guard. Spawns the REAL built artifacts and confirms they
// answer tools/list — exactly what an MCP host does at install time. Catches an
// eager-import crash in the bundle (no node_modules) and a wrong `bin` path.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist', 'bundle.js');
const BIN = join(ROOT, 'dist', 'index.js');
const PKG = join(ROOT, 'package.json');

beforeAll(() => {
  if (!existsSync(BUNDLE) || !existsSync(BIN)) {
    execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
  }
}, 120_000);

/** Spawn an MCP stdio server, run initialize + tools/list, return tool names. */
function listToolsViaStdio(entry: string, cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [entry], {
      cwd,
      // No creds: the server must still boot and serve tools/list (deferred-config).
      env: { ...process.env, BOOLI_CALLER_ID: '', BOOLI_API_KEY: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timed out; stderr:\n${err}`));
    }, 15_000);

    child.stdout.on('data', (d) => {
      out += d.toString();
      for (const line of out.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        let msg: { id?: number; result?: { tools?: { name: string }[] } };
        try {
          msg = JSON.parse(t);
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          clearTimeout(timer);
          child.kill('SIGKILL');
          resolve((msg.result.tools ?? []).map((x) => x.name));
          return;
        }
      }
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      if (out.indexOf('"id":1') === -1) {
        clearTimeout(timer);
        reject(new Error(`server exited (code ${code}) before tools/list; stderr:\n${err}`));
      }
    });

    child.stdin.write(
      '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"boot-test","version":"1"}}}\n',
    );
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
  });
}

// Lower bound, not an exact count: the boot test must not break when tools are
// added on other branches (the PR is CI-tested merged with main).
const MIN_TOOLS = 5;

describe('server boot (built artifacts)', () => {
  it('bundled .mcpb (dist/bundle.js) boots WITHOUT node_modules and lists tools', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'booli-mcpb-'));
    try {
      // The .mcpb ships bundle.js + package.json ({"type":"module"}) and NO
      // node_modules — mirror exactly that to catch an eager-import crash.
      copyFileSync(BUNDLE, join(dir, 'bundle.js'));
      copyFileSync(PKG, join(dir, 'package.json'));
      const tools = await listToolsViaStdio(join(dir, 'bundle.js'), dir);
      expect(tools.length).toBeGreaterThanOrEqual(MIN_TOOLS);
      expect(tools).toContain('booli_search_listings');
      expect(tools).toContain('booli_search_sold');
      expect(tools).toContain('booli_search_areas');
      expect(tools).toContain('booli_healthcheck');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('npm bin (dist/index.js) boots with node_modules and lists tools', async () => {
    const tools = await listToolsViaStdio(BIN, ROOT);
    expect(tools.length).toBeGreaterThanOrEqual(MIN_TOOLS);
    expect(tools).toContain('booli_search_listings');
    expect(tools).toContain('booli_market_stats');
  }, 30_000);
});
