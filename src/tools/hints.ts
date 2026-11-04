/**
 * `_meta.mint` hints (the mcp-host context-groups contract): which canonical
 * group a tool belongs to, what kind of ask it answers, and the everyday
 * words its name and description lack. Inert data to any other client.
 *
 * Every Booli read is a `lookup`. Booli has no account, so there is nothing
 * of the person's to list at start (no saved homes, no watched areas) and no
 * subject to publish; and every search needs a place before it can answer.
 * So nothing here answers "what's new / due / on at home?" on its own, and
 * no tool is canonical.
 */
const DOMAIN = 'home';

function lookup(aliases: string[]) {
  return { mint: { domain: DOMAIN, intent: 'lookup', aliases } };
}

/** `booli_search_areas`. */
export const AREA_META = lookup(['neighbourhood', 'area', 'district', 'kommun', 'municipality']);
/** `booli_search_listings`. */
export const LISTINGS_META = lookup([
  'homes for sale',
  'apartments for sale',
  'houses for sale',
  'house hunting',
  'bostad',
  'lägenhet',
  'villa',
]);
/** `booli_get_listing`. */
export const LISTING_META = lookup(['property details', 'listing details', 'this apartment', 'this house']);
/** `booli_search_sold`. */
export const SOLD_META = lookup(['sold prices', 'slutpriser', 'what it sold for', 'comparables', 'recent sales']);
/** `booli_market_stats`. */
export const STATS_META = lookup([
  'house prices',
  'median price',
  'price per square metre',
  'kvadratmeterpris',
  'housing market',
]);
