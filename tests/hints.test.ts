import { describe, it, expect } from 'vitest';
import { createTestHarness, routedClient } from './helpers.js';
import { registerBooliTools } from '../src/tools/index.js';

/**
 * The `_meta.mint` context-group hints (the mcp-host contract), read off the
 * SERVED tool list so a new tool cannot slip past them.
 *
 * Booli answers no what's-new / what's-due / what's-on question on its own:
 * it has no account, so there is nothing of the person's to list at start
 * (no saved homes, no watched areas), and every read needs a place first.
 * So it ships lookup hints only — no canonical read, no subject.
 */
type Mint = {
  domain?: string;
  intent?: string;
  canonical?: boolean;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
};
type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, unknown> };
  _meta?: { mint?: Mint };
};

const READ_INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup'];
const WRITE_INTENTS = ['turn-on-off', 'send', 'change', 'other'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];
const BRIEF_LINE = /^.+ — (\d{4}-\d{2}-\d{2}(T[^ ]*)?|no date) — .+$/;

async function served(): Promise<Listed[]> {
  const h = await createTestHarness((s) => registerBooliTools(s, routedClient({})));
  try {
    return (await h.client.listTools()).tools as Listed[];
  } finally {
    await h.close();
  }
}

const hinted = async () => (await served()).filter((t) => t.name !== 'booli_healthcheck');

describe('_meta.mint hints', () => {
  it('covers every served tool except the healthcheck', async () => {
    expect((await hinted()).map((t) => t.name).sort()).toEqual([
      'booli_get_listing',
      'booli_market_stats',
      'booli_search_areas',
      'booli_search_listings',
      'booli_search_sold',
    ]);
  });

  it('gives every tool the home domain and an intent that fits a read or a write', async () => {
    for (const t of await hinted()) {
      const m = t._meta?.mint;
      expect(m, t.name).toBeDefined();
      expect(Object.keys(m!).every((k) => KEYS.includes(k)), t.name).toBe(true);
      expect(m!.domain, t.name).toBe('home');
      const allowed = t.annotations?.readOnlyHint === true ? READ_INTENTS : WRITE_INTENTS;
      expect(allowed, t.name).toContain(m!.intent);
    }
  });

  it('marks every read a lookup: nothing here answers what is new, due or on for the person', async () => {
    for (const t of await hinted()) expect(t._meta?.mint?.intent, t.name).toBe('lookup');
  });

  it('declares canonical only on a read-only whats-new/due/on tool, at most one per intent', async () => {
    const canon = (await hinted()).filter((t) => t._meta?.mint?.canonical !== undefined);
    for (const t of canon) {
      expect(t._meta!.mint!.canonical, t.name).toBe(true);
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(CANONICAL_INTENTS, t.name).toContain(t._meta!.mint!.intent);
    }
    for (const intent of CANONICAL_INTENTS) {
      expect(canon.filter((t) => t._meta!.mint!.intent === intent).length, intent).toBeLessThanOrEqual(1);
    }
    expect(canon).toEqual([]);
  });

  it('keeps aliases to the words a person says: ≤ 8, lowercase, ≤ 40 chars, not tool names', async () => {
    for (const t of await hinted()) {
      const aliases = t._meta?.mint?.aliases ?? [];
      expect(aliases.length, t.name).toBeLessThanOrEqual(8);
      for (const a of aliases) {
        expect(a, t.name).toBe(a.toLowerCase());
        expect(a.length, t.name).toBeLessThanOrEqual(40);
        expect(a, t.name).not.toMatch(/booli_|_/);
      }
    }
  });

  it('names only existing arguments in subject and when (Booli lists no subjects, so none)', async () => {
    for (const t of await hinted()) {
      const m = t._meta!.mint!;
      const props = t.inputSchema.properties ?? {};
      if (m.subject !== undefined) expect(props, t.name).toHaveProperty(m.subject);
      if (m.when !== undefined) {
        expect(props, t.name).toHaveProperty(m.when.start);
        expect(props, t.name).toHaveProperty(m.when.end);
      }
      expect(m.subject, t.name).toBeUndefined();
    }
  });

  it('every canonical read accepts view: "brief" and answers one short line per item', async () => {
    const canon = (await hinted()).filter((t) => t._meta?.mint?.canonical === true);
    for (const t of canon) {
      const h = await createTestHarness((s) => registerBooliTools(s, routedClient({})));
      try {
        const res = await h.callTool(t.name, { view: 'brief' });
        const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? '').join('\n');
        for (const line of text.split('\n').filter(Boolean)) {
          expect(line.length, t.name).toBeLessThanOrEqual(120);
          expect(line, t.name).toMatch(BRIEF_LINE);
        }
      } finally {
        await h.close();
      }
    }
  });
});
