/**
 * BooliClient — the typed query surface every tool talks to.
 *
 * It wraps a {@link BooliTransport} (direct fetch with browser-bridge
 * fallback by default) with the Booli-semantic layer the transport omits:
 * a GraphQL `errors` array → a thrown {@link McpToolError}, and one typed
 * method per operation returning the raw node(s) for the formatters in
 * src/format.ts to normalise.
 *
 * Tools depend on this class, never on the transport or the operation
 * strings directly — so a tool test only has to stub `graphql`.
 */
import {
  McpToolError,
  redactSecrets,
  truncateErrorMessage,
} from '@chrischall/mcp-utils';
import type { BooliTransport } from './transport.js';
import {
  AREA_SUGGESTIONS,
  PROPERTY_DETAIL,
  SEARCH_FOR_SALE,
  SEARCH_SOLD,
  type AreaSuggestion,
  type RawListing,
  type RawPropertyDetail,
  type RawSoldProperty,
  type SearchRequestInput,
} from './graphql.js';

export interface BooliClientOptions {
  transport: BooliTransport;
}

export interface ListingSearchResult {
  total_count: number;
  pages: number;
  listings: RawListing[];
}

export interface SoldSearchResult {
  total_count: number;
  pages: number;
  sold: RawSoldProperty[];
}

/** Keep only `Listing`/`SoldProperty` nodes (search results also include Projects). */
function ofType<T extends { __typename?: string }>(
  nodes: (T | null)[] | null | undefined,
  typename: string,
): T[] {
  return (nodes ?? []).filter(
    (n): n is T => n != null && n.__typename === typename,
  );
}

export class BooliClient {
  private readonly transport: BooliTransport;

  constructor(opts: BooliClientOptions) {
    this.transport = opts.transport;
  }

  /**
   * Run a GraphQL operation and return `data`, throwing an
   * {@link McpToolError} on a GraphQL-level `errors` array or a null
   * `data` envelope. Error text is redacted + truncated before surfacing.
   */
  private async run<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const envelope = await this.transport.graphql<T>(query, variables);
    if (envelope.errors && envelope.errors.length > 0) {
      const joined = envelope.errors.map((e) => e.message).join('; ');
      throw new McpToolError(
        `Booli GraphQL error: ${truncateErrorMessage(redactSecrets(joined))}`,
      );
    }
    if (envelope.data == null) {
      throw new McpToolError('Booli GraphQL returned an empty response.');
    }
    return envelope.data;
  }

  /** Resolve a place name to ranked Booli area suggestions (name → areaId). */
  async areaSuggestions(search: string): Promise<AreaSuggestion[]> {
    const data = await this.run<{
      areaSuggestionSearch: { suggestions: AreaSuggestion[] | null } | null;
    }>(AREA_SUGGESTIONS, { search });
    return data.areaSuggestionSearch?.suggestions ?? [];
  }

  /** For-sale listings for the given search input (Projects filtered out). */
  async searchForSale(input: SearchRequestInput): Promise<ListingSearchResult> {
    const data = await this.run<{
      searchForSale: {
        totalCount?: number | null;
        pages?: number | null;
        result?: (RawListing | null)[] | null;
      } | null;
    }>(SEARCH_FOR_SALE, { input });
    const r = data.searchForSale;
    return {
      total_count: r?.totalCount ?? 0,
      pages: r?.pages ?? 0,
      listings: ofType(r?.result, 'Listing'),
    };
  }

  /** Sold listings ("slutpriser") for the given search input. */
  async searchSold(input: SearchRequestInput): Promise<SoldSearchResult> {
    const data = await this.run<{
      searchSold: {
        totalCount?: number | null;
        pages?: number | null;
        result?: (RawSoldProperty | null)[] | null;
      } | null;
    }>(SEARCH_SOLD, { input });
    const r = data.searchSold;
    return {
      total_count: r?.totalCount ?? 0,
      pages: r?.pages ?? 0,
      sold: ofType(r?.result, 'SoldProperty'),
    };
  }

  /**
   * Full detail for one property by its residence id (the number in a
   * `/bostad/<id>` URL). Returns `null` when the id resolves to nothing.
   */
  async getProperty(residenceId: string): Promise<RawPropertyDetail | null> {
    const data = await this.run<{
      propertyByResidenceId: RawPropertyDetail | null;
    }>(PROPERTY_DETAIL, { residenceId });
    return data.propertyByResidenceId ?? null;
  }

  /**
   * Cheap liveness probe: a tiny area-suggestion round-trip. Returns the
   * hit count; throws (via {@link run} / the transport) if the endpoint is
   * down or the browser bridge isn't reachable. Backs `booli_healthcheck`.
   */
  async healthcheck(): Promise<{ ok: true; hits: number }> {
    const hits = await this.areaSuggestions('Stockholm');
    return { ok: true, hits: hits.length };
  }
}
