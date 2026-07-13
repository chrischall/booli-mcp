/**
 * BooliClient — the typed query surface every tool talks to.
 *
 * It wraps a {@link BooliTransport} (signed direct `fetch` by default)
 * with the Booli-semantic layer the transport omits: it knows each
 * endpoint's envelope key (`listings` for /listings, `sold` for /sold,
 * `areas` for /areas) and returns the raw node arrays for the formatters
 * in src/format.ts to normalise.
 *
 * Tools depend on this class, never on the transport or the endpoint
 * paths directly — so a tool test only has to stub `get`.
 */
import type { RawArea, RawProperty } from './format.js';
import type { BooliQuery, BooliTransport } from './transport.js';

export interface BooliClientOptions {
  transport: BooliTransport;
}

/** Envelope returned by /listings. */
interface ListingsEnvelope {
  totalCount?: number;
  count?: number;
  listings?: RawProperty[] | null;
}

/** Envelope returned by /sold. */
interface SoldEnvelope {
  totalCount?: number;
  count?: number;
  sold?: RawProperty[] | null;
}

/** Envelope returned by /areas. */
interface AreasEnvelope {
  totalCount?: number;
  count?: number;
  areas?: RawArea[] | null;
}

export interface SearchResult {
  total_count: number;
  properties: RawProperty[];
}

export class BooliClient {
  private readonly transport: BooliTransport;

  constructor(opts: BooliClientOptions) {
    this.transport = opts.transport;
  }

  /** Search for-sale listings. Returns raw property nodes + total count. */
  async searchListings(query: BooliQuery): Promise<SearchResult> {
    const data = await this.transport.get<ListingsEnvelope>('listings', query);
    return {
      total_count: data.totalCount ?? data.listings?.length ?? 0,
      properties: data.listings ?? [],
    };
  }

  /** Search sold listings (slutpriser). Returns raw property nodes + total. */
  async searchSold(query: BooliQuery): Promise<SearchResult> {
    const data = await this.transport.get<SoldEnvelope>('sold', query);
    return {
      total_count: data.totalCount ?? data.sold?.length ?? 0,
      properties: data.sold ?? [],
    };
  }

  /** Full detail for one for-sale listing by Booli id, or null if absent. */
  async getListing(id: string): Promise<RawProperty | null> {
    const data = await this.transport.get<ListingsEnvelope>(`listings/${id}`);
    return data.listings?.[0] ?? null;
  }

  /** Full detail for one sold listing by Booli id, or null if absent. */
  async getSold(id: string): Promise<RawProperty | null> {
    const data = await this.transport.get<SoldEnvelope>(`sold/${id}`);
    return data.sold?.[0] ?? null;
  }

  /** Resolve a place name / coordinate to Booli areas. */
  async searchAreas(query: BooliQuery): Promise<RawArea[]> {
    const data = await this.transport.get<AreasEnvelope>('areas', query);
    return data.areas ?? [];
  }

  /**
   * Cheap liveness + credential probe: a tiny /areas round-trip. Returns
   * the hit count; throws (via the transport) if the endpoint is down or
   * the credentials are missing/invalid. Backs `booli_healthcheck`.
   */
  async healthcheck(): Promise<{ ok: true; hits: number }> {
    const areas = await this.searchAreas({ q: 'Stockholm', limit: 1 });
    return { ok: true, hits: areas.length };
  }
}
