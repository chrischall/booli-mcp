/**
 * Booli's per-request authentication.
 *
 * Every call to api.booli.se carries four query params: `callerId`,
 * `time` (unix ms), `unique` (a random nonce), and `hash` — where
 *
 *     hash = sha1( callerId + time + apiKey + unique )   // hex digest
 *
 * (confirmed against the canonical wrappers rinti/booli-api and
 * filipsalo/booliapi; a request missing any of the four gets
 * `403 FAILURE_MISSING_PARAM`). Kept as a pure function so the exact hash
 * is unit-testable with injected `time`/`unique`.
 */
import { createHash, randomBytes } from 'node:crypto';

/** The four signed query params Booli requires on every request. */
export interface BooliAuthParams {
  callerId: string;
  time: number;
  unique: string;
  hash: string;
}

export interface BuildAuthOptions {
  callerId: string;
  apiKey: string;
  /** Unix timestamp in milliseconds. Injectable for deterministic tests. */
  time: number;
  /** Random 16-char nonce. Injectable for deterministic tests. */
  unique: string;
}

/** A random 16-char hex nonce for the `unique` param. */
export function randomUnique(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Compute the signed auth params for one request. Never logs or returns
 * the secret `apiKey`; only the derived `hash` leaves this function.
 */
export function buildAuthParams(opts: BuildAuthOptions): BooliAuthParams {
  const hash = createHash('sha1')
    .update(opts.callerId + opts.time + opts.apiKey + opts.unique)
    .digest('hex');
  return { callerId: opts.callerId, time: opts.time, unique: opts.unique, hash };
}
