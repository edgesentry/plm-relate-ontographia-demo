// Digest guard for the committed FarmBot seed.
//
// The committed seed and its sidecar are the source of truth:
//   farmbot/dist/farmbot.seed.json
//   farmbot/dist/farmbot.seed.json.sha256
//
// The hex below is copied from that sidecar and is also asserted against it by
// scripts/verify.mjs and farmbot/test/screen.test.mjs. Both the browser and
// Node 22 expose Web Crypto, so one implementation serves both.

export const SEED_FORMAT = 'farmbot-graph-v1';

/** SHA-256 hex of the committed seed, `farmbot/dist/farmbot.seed.json`. */
export const SEED_SHA256_HEX =
  'd747ee0c794fc01ea0a3baa578d8c57b64301d04907383e1b85f4eb2fbe0d71f';

/** The full digest line stored in the committed `.sha256` sidecar. */
export const SEED_DIGEST = `${SEED_FORMAT} sha256:${SEED_SHA256_HEX}`;

const DIGEST_LINE = /^([A-Za-z0-9._-]+) sha256:([0-9a-f]{64})$/;

/**
 * Format a SHA-256 hex digest the way the sidecar stores it.
 *
 * @param {string} hex Lowercase SHA-256 hex.
 * @returns {string}
 */
export function formatSeedDigest(hex) {
  return `${SEED_FORMAT} sha256:${hex}`;
}

/**
 * Parse one `<format> sha256:<hex>` sidecar line.
 *
 * @param {string} line
 * @returns {{ format: string, hex: string } | null} `null` when the line is not
 *   a well-formed digest line.
 */
export function parseSeedDigestLine(line) {
  const match = DIGEST_LINE.exec(line.trim());
  if (!match) return null;
  return { format: match[1], hex: match[2] };
}

/**
 * SHA-256 of raw bytes, lowercase hex, through Web Crypto.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Compare raw seed bytes with the expected SHA-256 hex.
 *
 * @param {Uint8Array} bytes Raw bytes exactly as served.
 * @param {string} [expectedHex] Defaults to the committed digest.
 * @returns {Promise<{ ok: boolean, hex: string }>}
 */
export async function checkSeedDigest(bytes, expectedHex = SEED_SHA256_HEX) {
  const hex = await sha256Hex(bytes);
  return { ok: hex === expectedHex, hex };
}
