// Shared selection state of the finding view: the process-lane diagram and the
// evidence table select the same evidence row indexes.
//
// Pure functions only, so `node --test` covers the invariants the screen relies
// on without a browser: a selection is exactly the rows a node stands for, and
// only an explicit select or opening another finding can change it. Expanding
// or collapsing a row's Intent, Cypher and parameters block dispatches nothing
// here, which is why the selected node stays selected while the operator reads
// its queries.

/**
 * The selection a node click or a row click carries: unique evidence row
 * indexes, sorted, and nothing else.
 *
 * @param {unknown} indexes
 * @returns {number[]}
 */
export function normalizeSelection(indexes) {
  if (!Array.isArray(indexes)) {
    throw new Error('selection indexes must be an array');
  }
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`selection index ${String(index)} is not an evidence row index`);
    }
  }
  return [...new Set(indexes)].sort((left, right) => left - right);
}

/**
 * The next selection for one event.
 *
 * `select` carries the row indexes a diagram node or an evidence row stands
 * for. `finding-change` opens another finding, which starts with no
 * selection. Any other event throws, so no hidden path can drop or keep a
 * selection by accident.
 *
 * @param {readonly number[]} current
 * @param {{ type: 'select', indexes: number[] } | { type: 'finding-change' }} event
 * @returns {number[]}
 */
export function findingSelection(current, event) {
  if (!Array.isArray(current)) {
    throw new Error('the current selection must be an array');
  }
  if (!event || typeof event !== 'object') {
    throw new Error('a selection event must be an object');
  }
  switch (event.type) {
    case 'select':
      return normalizeSelection(event.indexes);
    case 'finding-change':
      return [];
    default:
      throw new Error(`unknown selection event ${String(event.type)}`);
  }
}
