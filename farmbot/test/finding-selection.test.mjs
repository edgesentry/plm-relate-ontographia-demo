// Tests for the shared selection state of the finding view: the process-lane
// diagram and the evidence table select the same evidence row indexes.
//
// Every expectation is computed from the committed findings document: no node
// id, row count or finding id is written into this file.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { findingSelection, normalizeSelection } from '../../src/farmbot/finding-selection.mjs';
import { layoutFinding } from '../../src/farmbot/process-lanes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FINDINGS_PATH = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');

const document = JSON.parse(readFileSync(FINDINGS_PATH, 'utf8'));
const findings = document.findings;

/** The node ids a selection highlights, as the diagram draws them. */
function selectedNodeIds(finding, selection) {
  const selected = new Set(selection);
  return layoutFinding(finding)
    .nodes.filter((node) => node.evidenceIndexes.some((index) => selected.has(index)))
    .map((node) => node.id);
}

test('a selection is exactly the rows a node stands for', () => {
  for (const finding of findings) {
    for (const node of layoutFinding(finding).nodes) {
      const selection = findingSelection([], { type: 'select', indexes: node.evidenceIndexes });
      assert.deepEqual(
        selection,
        [...new Set(node.evidenceIndexes)].sort((left, right) => left - right),
        `${finding.id}: selecting ${node.id} changed its rows`,
      );
      assert.deepEqual(
        selectedNodeIds(finding, selection),
        [node.id],
        `${finding.id}: selecting ${node.id} highlighted another node`,
      );
    }
  }
});

test('a selected node is retained while its query details are read', () => {
  // Expanding or collapsing a row's Intent, Cypher and parameters block
  // dispatches nothing into the selection state: only an explicit select or
  // another finding can change it. So the operator reading the queries, then
  // re-affirming the row, must land on the same selected node id.
  for (const finding of findings) {
    const nodes = layoutFinding(finding).nodes;
    for (const node of nodes) {
      const selection = findingSelection([], { type: 'select', indexes: node.evidenceIndexes });
      const reselected = findingSelection(selection, {
        type: 'select',
        indexes: node.evidenceIndexes,
      });
      assert.deepEqual(
        reselected,
        selection,
        `${finding.id}: reselecting ${node.id} changed the selection`,
      );
      assert.deepEqual(
        selectedNodeIds(finding, reselected),
        [node.id],
        `${finding.id}: ${node.id} was not retained after a reselect`,
      );

      const other = nodes.find((candidate) => candidate.id !== node.id);
      if (!other) continue;
      const moved = findingSelection(selection, { type: 'select', indexes: other.evidenceIndexes });
      assert.deepEqual(
        selectedNodeIds(finding, moved),
        [other.id],
        `${finding.id}: the highlight did not move to ${other.id}`,
      );
      assert.ok(
        !selectedNodeIds(finding, moved).includes(node.id),
        `${finding.id}: ${node.id} stayed selected after moving away`,
      );
    }
  }
});

test('no event outside select and finding-change touches the selection', () => {
  for (const finding of findings) {
    const node = layoutFinding(finding).nodes[0];
    if (!node) continue;
    const selection = findingSelection([], { type: 'select', indexes: node.evidenceIndexes });
    assert.deepEqual(
      findingSelection(selection, { type: 'finding-change' }),
      [],
      `${finding.id}: opening another finding kept a selection`,
    );
  }
  // There is no details-toggle event: the query block cannot reset a selection
  // because it cannot reach this state at all.
  assert.throws(() => findingSelection([], { type: 'details-toggle' }), /unknown selection event/);
  assert.throws(() => findingSelection([], { type: 'reset' }), /unknown selection event/);
  assert.throws(() => findingSelection([], null), /a selection event must be an object/);
});

test('selection indexes are validated and normalized', () => {
  assert.deepEqual(normalizeSelection([3, 1, 2, 1]), [1, 2, 3]);
  assert.deepEqual(normalizeSelection([]), []);
  assert.throws(() => normalizeSelection('no'), /selection indexes must be an array/);
  assert.throws(() => normalizeSelection([0.5]), /not an evidence row index/);
  assert.throws(() => normalizeSelection([-1]), /not an evidence row index/);
  assert.throws(
    () => findingSelection('no', { type: 'select', indexes: [] }),
    /current selection must be an array/,
  );
  assert.throws(
    () => findingSelection([], { type: 'select', indexes: 'no' }),
    /selection indexes must be an array/,
  );
});
