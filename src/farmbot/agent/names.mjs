// Name matching for the Change Log rules.
//
// The extract resolves a `[[part name]]` link to a part, so a linked name is a
// fact. A removal statement in the Change Log is prose: it names items without
// a link, and the rule can only compare the words with the display names on
// assembly-chapter, packing and service pages. That comparison is an inference.
// This module keeps both cases deterministic and free of Node-only imports so
// the Node entry and the browser screen share one implementation.
//
// A removal statement is a Change Log list item whose first word is one of the
// removal verbs below. The note text keeps its Markdown bullet, so anchoring on
// the bullet keeps the narrative paragraphs (which also use words such as
// "removes") out of the inference.

import { normalizeName, singularizeName } from '../../../farmbot/scripts/lib/normalize.mjs';

export { normalizeName, singularizeName };

/** A list item that removes or replaces an item. */
const REMOVAL_STATEMENT = /^(?:[-*+]|\d+\.)\s+(?:removed|replaces?|switched|dropped)\b/i;

/** `[[part name]]` links in one Change Log text unit. */
const WIKILINK = /\[\[([^\]]+)\]\]/g;

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isRemovalStatement(text) {
  return typeof text === 'string' && REMOVAL_STATEMENT.test(text.trim());
}

/**
 * @param {unknown} text
 * @returns {string[]}
 */
export function wikilinkNames(text) {
  if (typeof text !== 'string') return [];
  const names = [];
  WIKILINK.lastIndex = 0;
  let match;
  while ((match = WIKILINK.exec(text)) !== null) names.push(match[1].trim());
  return names;
}

/**
 * Remove the `[[...]]` links from a text unit. The linked name is handled as a
 * fact; leaving it in the prose would report the same name twice.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function stripWikilinks(text) {
  return typeof text === 'string' ? text.replace(/\[\[[^\]]+\]\]/g, ' ') : '';
}

/**
 * Whether a normalized haystack contains the normalized name as whole words.
 *
 * @param {string} haystack Text already passed through `normalizeName`.
 * @param {string} name
 * @returns {boolean}
 */
export function phraseContains(haystack, name) {
  const key = normalizeName(name);
  if (key === '') return false;
  const padded = ` ${haystack} `;
  if (padded.includes(` ${key} `)) return true;
  const singular = singularizeName(name);
  return singular !== key && padded.includes(` ${singular} `);
}

/**
 * @typedef {{ id: string, text: string }} ChangeNote
 * @typedef {{ changeId: string, partId: string, partName: string }} ChangedPart
 * @typedef {{
 *   key: string,
 *   displayName: string,
 *   resolvedPart: string | null,
 * }} DownstreamName
 * @typedef {{
 *   key: string,
 *   displayName: string,
 *   inferred: boolean,
 *   partName: string | null,
 *   changeIds: string[],
 *   downstreamIndexes: number[],
 * }} ChangeNameMatch
 */

/**
 * Match Change Log names against assembly-chapter, packing and service display
 * names.
 *
 * Fact: a name linked to a part (`AFFECTS_PART`) is still named downstream when
 * a usage line on an assembly chapter, packing or service page resolves to
 * that part. The subject is the part, so the result does not depend on the
 * link's wording.
 *
 * Inference: a removal statement names an item in prose. Each downstream
 * display name whose normalized words appear in the statement is a candidate,
 * unless the same statement also links a name that contains those words: that
 * name is the replacement, and the linked fact already covers it.
 *
 * A name that is both linked and inferred stays one finding; the fact wins.
 *
 * @param {{ changes: ChangeNote[], changedParts: ChangedPart[], downstream: DownstreamName[] }} input
 * @returns {ChangeNameMatch[]}
 */
export function matchChangeNames({ changes, changedParts, downstream }) {
  /** @type {Map<string, ChangeNameMatch>} */
  const facts = new Map();
  for (const entry of changedParts) {
    if (typeof entry.partName !== 'string' || entry.partName === '') continue;
    let match = facts.get(entry.partName);
    if (!match) {
      match = {
        key: entry.partName,
        displayName: entry.partName,
        inferred: false,
        partName: entry.partName,
        changeIds: [],
        downstreamIndexes: [],
      };
      facts.set(entry.partName, match);
    }
    if (!match.changeIds.includes(entry.changeId)) match.changeIds.push(entry.changeId);
  }
  for (const [index, row] of downstream.entries()) {
    if (typeof row.resolvedPart !== 'string') continue;
    const match = facts.get(row.resolvedPart);
    if (match && !match.downstreamIndexes.includes(index)) match.downstreamIndexes.push(index);
  }

  /** @type {Map<string, ChangeNameMatch>} */
  const inferred = new Map();
  for (const change of changes) {
    if (!isRemovalStatement(change.text)) continue;
    const linked = wikilinkNames(change.text);
    const prose = normalizeName(stripWikilinks(change.text));
    for (const [index, row] of downstream.entries()) {
      if (!phraseContains(prose, row.displayName)) continue;
      if (linked.some((name) => phraseContains(normalizeName(name), row.displayName))) continue;
      const key = normalizeName(row.displayName);
      let match = inferred.get(key);
      if (!match) {
        match = {
          key,
          displayName: row.displayName,
          inferred: true,
          partName: null,
          changeIds: [],
          downstreamIndexes: [],
        };
        inferred.set(key, match);
      }
      if (row.displayName < match.displayName) match.displayName = row.displayName;
      if (!match.changeIds.includes(change.id)) match.changeIds.push(change.id);
      if (!match.downstreamIndexes.includes(index)) match.downstreamIndexes.push(index);
    }
  }

  for (const match of inferred.values()) {
    const factual = [...facts.values()].find(
      (candidate) => normalizeName(candidate.key) === match.key,
    );
    if (!factual) {
      facts.set(`\u0000${match.key}`, match);
      continue;
    }
    for (const changeId of match.changeIds) {
      if (!factual.changeIds.includes(changeId)) factual.changeIds.push(changeId);
    }
    for (const index of match.downstreamIndexes) {
      if (!factual.downstreamIndexes.includes(index)) factual.downstreamIndexes.push(index);
    }
  }

  return [...facts.values()]
    .map((match) => ({
      ...match,
      changeIds: [...match.changeIds].sort(),
      downstreamIndexes: [...match.downstreamIndexes].sort((left, right) => left - right),
    }))
    .sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    );
}
