// Canonicalization of the documented material strings on FarmBot part pages.
//
// This module is the single source of truth for the constructed SBOM view:
// `farmbot/scripts/extract.mjs` uses it to fill the `part` table columns,
// `farmbot/scripts/graph.mjs` uses it for `Material` node ids, and
// `src/farmbot/agent/index.mjs` uses it for the `material` evidence rows, so
// Node and the browser agree on every key and id. No DOM, no WASM, no React.
//
// The SBOM view is constructed by this repository from the `specs.material`
// strings that the pinned FarmBot Genesis v1.7 part pages record. It is not a
// software BOM, not a CAS-level substance list, and not a spare-parts list.
// A part page without `specs.material` contributes no material node.

/**
 * The normalization key of one documented material string.
 *
 * Exact function: `String#toLowerCase()` of the trimmed raw string, with every
 * run of internal whitespace (spaces, tabs, newlines) collapsed to a single
 * ASCII space. The value is the raw frontmatter string; the frontmatter reader
 * already trims surrounding whitespace. Two strings that differ only by case
 * or internal spacing (typographic twins) share one key.
 *
 * @param {string} raw A documented `specs.material` string.
 * @returns {string}
 */
export function materialKey(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`materialKey needs a string, got ${String(raw)}`);
  }
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The seed node id of one material key: the literal `material:` prefix plus
 * the key, verbatim. The id is derived only from the normalization key, so the
 * same documented string always reaches the same node, and no slug mangling
 * can make two keys collide.
 *
 * @param {string} key A normalization key from `materialKey`.
 * @returns {string}
 */
export function materialNodeId(key) {
  if (typeof key !== 'string' || key === '') {
    throw new Error(`materialNodeId needs a non-empty key, got ${String(key)}`);
  }
  return `material:${key}`;
}

/**
 * The display name of one key: among the raw strings that share the key, the
 * first in plain code-unit sort order (`<` / `>`, independent of locale and
 * input order). Every raw string stays available on its own part
 * (`material_raw`), so picking one display name loses nothing.
 *
 * @param {string[]} rawStrings Raw strings that share one key. Not empty.
 * @returns {string}
 */
export function materialDisplayName(rawStrings) {
  if (!Array.isArray(rawStrings) || rawStrings.length === 0) {
    throw new Error('materialDisplayName needs a non-empty array of raw strings');
  }
  let best = null;
  for (const value of rawStrings) {
    if (typeof value !== 'string') {
      throw new Error(`materialDisplayName needs strings, got ${String(value)}`);
    }
    if (best === null || value < best) best = value;
  }
  return /** @type {string} */ (best);
}

/**
 * Group documented material strings by normalization key, skipping absent
 * values (`null` / `undefined` / empty), so one key maps to every distinct raw
 * string recorded for it.
 *
 * @param {Iterable<string | null | undefined>} rawValues One entry per part,
 *   the raw `specs.material` string or nothing.
 * @returns {Map<string, string[]>} Key to raw strings in first-seen order.
 */
export function materialGroupsByRaw(rawValues) {
  const groups = new Map();
  for (const raw of rawValues) {
    if (typeof raw !== 'string' || raw === '') continue;
    const key = materialKey(raw);
    const raws = groups.get(key);
    if (raws) {
      if (!raws.includes(raw)) raws.push(raw);
    } else {
      groups.set(key, [raw]);
    }
  }
  return groups;
}
