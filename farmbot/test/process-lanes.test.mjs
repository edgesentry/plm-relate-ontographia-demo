// Tests for the process-lane layout behind the finding view diagram.
//
// Every expectation is computed from the committed findings document or from a
// synthetic finding built here; no count, id or coordinate is written into this
// file. Coordinates are checked only for the properties the diagram promises:
// determinism, containment in the viewBox and no overlap within one lane.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { evidenceRows } from '../../src/farmbot/findings-view.mjs';
import {
  DEFAULT_NODE_CAP,
  LANES,
  PLACEHOLDER_PREFIX,
  edgesForFinding,
  laneForEvidence,
  layoutFinding,
  orderEvidenceRows,
} from '../../src/farmbot/process-lanes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FINDINGS_PATH = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');

const document = JSON.parse(readFileSync(FINDINGS_PATH, 'utf8'));
const findings = document.findings;
const LANE_IDS = LANES.map((lane) => lane.id);

/** A deterministic shuffle order: a small LCG drives the swaps. */
function shuffledOrder(length, seed) {
  const order = [...Array(length).keys()];
  let state = seed >>> 0;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function shuffled(values, seed) {
  return shuffledOrder(values.length, seed).map((index) => values[index]);
}

function uniqueNodeIds(finding) {
  return [...new Set(finding.evidence.map((row) => row.nodeId))];
}

function roleNodeIds(finding, role) {
  return [
    ...new Set(
      finding.evidence.filter((row) => row.role === role).map((row) => row.nodeId),
    ),
  ].sort();
}

/** The non-empty source files named by the rows of one node and role. */
function sourceFilesOf(finding, nodeId, role) {
  const files = new Set();
  for (const row of finding.evidence) {
    if (row.role !== role || row.nodeId !== nodeId) continue;
    if (typeof row.sourceFile === 'string' && row.sourceFile !== '') {
      files.add(row.sourceFile);
    }
  }
  return files;
}

function shareSourceFile(finding, leftId, leftRole, rightId, rightRole) {
  const right = sourceFilesOf(finding, rightId, rightRole);
  for (const file of sourceFilesOf(finding, leftId, leftRole)) {
    if (right.has(file)) return true;
  }
  return false;
}

/** The R2 structure/reference pairs the evidence supports, computed from its rows. */
function expectedR2LinkCount(finding) {
  let count = 0;
  for (const structure of roleNodeIds(finding, 'structure')) {
    for (const reference of roleNodeIds(finding, 'reference')) {
      if (shareSourceFile(finding, structure, 'structure', reference, 'reference')) {
        count += 1;
      }
    }
  }
  return count;
}

function laneRank(laneId) {
  return LANE_IDS.indexOf(laneId);
}

test('every evidence role in the committed file maps to a lane', () => {
  const roles = new Set();
  for (const finding of findings) {
    for (const row of finding.evidence) {
      roles.add(row.role);
      const lane = laneForEvidence(row);
      assert.ok(LANE_IDS.includes(lane), `${row.role} mapped to unknown lane ${lane}`);
    }
  }
  assert.ok(roles.size > 0, 'the committed file has no evidence roles');

  assert.throws(() => laneForEvidence({ role: 'not-a-role', nodeId: 'part:x' }), /no lane/);
  assert.throws(
    () => laneForEvidence({ role: 'structure', nodeId: 'unknown:x' }),
    /no lane/,
  );
  assert.throws(
    () => laneForEvidence({ role: 'reference', nodeId: 'usage:unknown:x' }),
    /no lane/,
  );
});

test('the diagram shows exactly the evidence nodes of every finding', () => {
  for (const finding of findings) {
    const layout = layoutFinding(finding);
    const evidenceIds = uniqueNodeIds(finding).sort();
    const drawnIds = layout.nodes.map((node) => node.id);
    assert.equal(new Set(drawnIds).size, drawnIds.length, `${finding.id} repeats a node`);
    assert.ok(layout.nodes.length <= DEFAULT_NODE_CAP, `${finding.id} exceeds the node cap`);

    const allIds = [...drawnIds, ...layout.overflow.nodeIds].sort();
    assert.deepEqual(allIds, evidenceIds, `${finding.id} node set differs from its evidence`);
    assert.equal(layout.overflow.count, layout.overflow.nodeIds.length);

    // Every node keeps the evidence rows it stands for.
    const rows = orderEvidenceRows(finding);
    assert.equal(rows.length, evidenceRows(finding).length, `${finding.id}: row count`);
    for (const node of layout.nodes) {
      assert.ok(node.evidenceIndexes.length > 0, `${node.id} has no evidence row`);
      for (const index of node.evidenceIndexes) {
        assert.equal(rows[index].nodeId, node.id, `${node.id} cites the wrong row`);
      }
    }

    // Every edge endpoint is a drawn node or a lane-level placeholder.
    for (const edge of layout.edges) {
      assert.ok(
        drawnIds.includes(edge.from),
        `${finding.id} edge from ${edge.from} is not a node`,
      );
      if (edge.kind === 'missing') {
        assert.ok(
          edge.to.startsWith(PLACEHOLDER_PREFIX),
          `${finding.id} missing edge ends at ${edge.to}, not a placeholder`,
        );
        assert.ok(
          LANE_IDS.includes(edge.to.slice(PLACEHOLDER_PREFIX.length)),
          `${finding.id} missing edge names unknown lane ${edge.to}`,
        );
      } else {
        assert.ok(
          drawnIds.includes(edge.to),
          `${finding.id} link edge ends at ${edge.to}, not a node`,
        );
      }
      assert.ok(!edge.onPath || edge.kind === 'link', `${finding.id} path edge is missing`);
    }

    // Visible lanes have a node; hidden lanes have none.
    const visible = layout.lanes.map((lane) => lane.id);
    for (const lane of layout.lanes) {
      const inLane = layout.nodes.filter((node) => node.lane === lane.id);
      assert.ok(inLane.length > 0, `${finding.id} shows empty lane ${lane.id}`);
      assert.equal(lane.count, inLane.length, `${finding.id} lane count drifted`);
    }
    for (const node of layout.nodes) {
      assert.ok(visible.includes(node.lane), `${finding.id} node in hidden lane ${node.lane}`);
    }
    assert.deepEqual(
      visible,
      LANES.map((lane) => lane.id).filter((id) => visible.includes(id)),
      `${finding.id} lanes are out of order`,
    );
  }
});

test('layout is deterministic for any evidence order', () => {
  for (const finding of findings) {
    const forward = layoutFinding(finding);
    const reversed = layoutFinding({ ...finding, evidence: [...finding.evidence].reverse() });
    const mixed = layoutFinding({ ...finding, evidence: shuffled(finding.evidence, 41) });
    assert.deepEqual(reversed, forward, `${finding.id} depends on reversed evidence order`);
    assert.deepEqual(mixed, forward, `${finding.id} depends on shuffled evidence order`);
  }
});

test('nodes and edges are unique and ordered by lane, role and node id', () => {
  for (const finding of findings) {
    const layout = layoutFinding(finding);
    const ids = layout.nodes.map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, `${finding.id} repeats a node id`);

    const edgeKeys = layout.edges.map((edge) => JSON.stringify([edge.from, edge.to, edge.kind]));
    assert.equal(new Set(edgeKeys).size, edgeKeys.length, `${finding.id} repeats an edge`);

    const expectedOrder = [...layout.nodes].sort(
      (left, right) =>
        laneRank(left.lane) - laneRank(right.lane) ||
        (left.role < right.role ? -1 : left.role > right.role ? 1 : 0) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
    assert.deepEqual(
      layout.nodes.map((node) => node.id),
      expectedOrder.map((node) => node.id),
      `${finding.id} nodes are not in the stable order`,
    );

    for (const lane of layout.lanes) {
      const laneNodes = layout.nodes.filter((node) => node.lane === lane.id);
      const ys = laneNodes.map((node) => node.y);
      assert.deepEqual([...ys].sort((left, right) => left - right), ys);
    }
  }
});

test('the edge pattern of each rule comes from its evidence roles', () => {
  for (const finding of findings) {
    const edges = edgesForFinding(finding);
    const roles = new Set(finding.evidence.map((row) => row.role));
    if (finding.rule === 'R5') {
      assert.equal(edges.length, 0, `${finding.id}: R5 has no edges`);
      continue;
    }
    assert.ok(edges.length > 0, `${finding.id}: ${finding.rule} has no edge`);

    const missing = edges.filter((edge) => edge.kind === 'missing');
    if (finding.rule === 'R2') {
      assert.equal(
        missing.length,
        finding.evidence.filter((row) => row.role === 'reference').length,
        `${finding.id}: one missing edge per unresolved reference`,
      );
      assert.ok(roles.has('structure'), `${finding.id}: R2 has no structure row`);
    }
    if (finding.rule === 'R3') {
      assert.equal(
        missing.length,
        finding.evidence.filter((row) => row.role === 'part').length * 2,
        `${finding.id}: one missing edge per part and process lane`,
      );
    }
    if (finding.rule === 'R4') {
      assert.equal(
        missing.length,
        finding.evidence.filter((row) => row.role === 'part').length,
        `${finding.id}: one missing edge per part`,
      );
    }
    if (finding.rule === 'R1') {
      assert.equal(missing.length, 0, `${finding.id}: R1 has no missing edge`);
    }
    if (finding.rule === 'R6') {
      assert.ok(roles.has('design-change'), `${finding.id}: R6 has no design-change row`);
      assert.ok(
        roles.has('packing-structure') || roles.has('service'),
        `${finding.id}: R6 has no downstream row`,
      );
    }
    if (finding.rule === 'R8') {
      assert.ok(roles.has('service'), `${finding.id}: R8 has no service row`);
    }
    if (finding.rule === 'R7') {
      assert.equal(
        missing.length,
        finding.evidence.filter((row) => row.role === 'part').length * 3,
        `${finding.id}: one missing edge per part and downstream lane`,
      );
    }
    if (finding.rule === 'R8') {
      assert.equal(
        missing.length,
        finding.evidence.filter((row) => row.role === 'part').length,
        `${finding.id}: one missing edge per part`,
      );
    }
    if (finding.rule === 'R9') {
      assert.equal(
        missing.length,
        finding.evidence.filter((row) => row.role === 'reference').length,
        `${finding.id}: one missing edge per unresolved service reference`,
      );
    }
    if (finding.rule === 'R6') {
      assert.equal(missing.length, 0, `${finding.id}: R6 has no missing edge`);
    }
    for (const edge of edges) {
      assert.ok(edge.from !== edge.to, `${finding.id} has a self edge`);
      assert.ok(edge.kind === 'link' || edge.kind === 'missing', `${finding.id} edge kind`);
    }
  }
});

test('R2 links join a structure and a reference from the same source file', () => {
  for (const finding of findings) {
    if (finding.rule !== 'R2') continue;
    const links = edgesForFinding(finding).filter((edge) => edge.kind === 'link');
    for (const link of links) {
      assert.ok(
        shareSourceFile(finding, link.from, 'structure', link.to, 'reference'),
        `${finding.id}: link ${link.from} → ${link.to} joins rows from different source files`,
      );
    }
    assert.equal(
      links.length,
      expectedR2LinkCount(finding),
      `${finding.id}: link edge count`,
    );
  }

  const magnets = findings.find((finding) => finding.id === 'R2-magnets');
  assert.ok(magnets, 'R2-magnets is missing from the committed file');
  const magnetsLinks = edgesForFinding(magnets).filter((edge) => edge.kind === 'link');
  const structures = roleNodeIds(magnets, 'structure').length;
  const references = roleNodeIds(magnets, 'reference').length;
  assert.equal(magnetsLinks.length, expectedR2LinkCount(magnets));
  assert.ok(
    magnetsLinks.length < structures * references,
    `R2-magnets: ${magnetsLinks.length} link(s) for ` +
      `${structures * references} structure/reference pairs`,
  );
});

test('R6 diagrams put the design change upstream of packing and service', () => {
  const r6 = findings.filter((finding) => finding.rule === 'R6');
  assert.ok(r6.length > 0, 'the committed file has no R6 finding');

  for (const finding of r6) {
    const layout = layoutFinding(finding);
    const changes = layout.nodes.filter((node) => node.lane === 'design-change');
    assert.equal(changes.length, 1, `${finding.id}: expected one design-change node`);
    const downstream = layout.edges.filter((edge) => edge.kind === 'link');
    const reached = new Set([changes[0].id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of downstream) {
        if (!reached.has(edge.from) || reached.has(edge.to)) continue;
        reached.add(edge.to);
        grew = true;
      }
    }
    for (const node of layout.nodes) {
      if (node.lane !== 'packing' && node.lane !== 'service') continue;
      assert.ok(
        reached.has(node.id),
        `${finding.id}: ${node.id} is not downstream of the design change`,
      );
    }
  }

  const inferred = r6.find(
    (finding) =>
      finding.inferred === true &&
      finding.evidence.some((row) => row.role === 'packing-structure') &&
      finding.evidence.some((row) => row.role === 'service'),
  );
  assert.ok(inferred, 'the committed file has no inferred R6 finding with both paths');
  assert.ok(
    inferred.evidence.some((row) => row.role === 'packing-structure'),
    `${inferred.id}: inferred finding has no packing path`,
  );
  assert.ok(
    inferred.evidence.some((row) => row.role === 'service'),
    `${inferred.id}: inferred finding has no service path`,
  );
});

test('an unmatched downstream row stays downstream of the design change', () => {
  const finding = {
    id: 'R6-collision',
    rule: 'R6',
    inferred: false,
    subject: { key: 'Tee Nuts', kind: 'part', label: 'Tee Nuts', nodeId: 'part:Tee Nuts' },
    evidence: [
      {
        role: 'design-change',
        nodeId: 'change:tee',
        sourceFile: 'change-log.md',
        line: 1,
        facts: { section: 'Changed', text: '- Removed the drop-in tee nuts.' },
      },
      {
        role: 'part',
        nodeId: 'part:Tee Nuts',
        sourceFile: 'parts/tee-nuts.md',
        line: null,
        facts: { name: 'Tee Nuts' },
      },
      {
        role: 'packing-line',
        nodeId: 'usage:packing:kit-b.md@0/0/0',
        sourceFile: 'kit-b.md',
        line: null,
        facts: {
          displayName: 'tee nuts',
          matchMethod: 'unmatched',
          resolvedPart: null,
        },
      },
      {
        role: 'packing-structure',
        nodeId: 'container:kit-b.md',
        sourceFile: 'kit-b.md',
        line: null,
        facts: { title: 'Kit B' },
      },
    ],
    queries: [],
  };

  const layout = layoutFinding(finding);
  const change = layout.nodes.find((node) => node.lane === 'design-change');
  assert.ok(change, 'the fixture has no design-change node');
  const reached = new Set([change.id]);
  const downstream = layout.edges.filter((edge) => edge.kind === 'link');
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of downstream) {
      if (!reached.has(edge.from) || reached.has(edge.to)) continue;
      reached.add(edge.to);
      grew = true;
    }
  }
  for (const node of layout.nodes) {
    if (node.lane !== 'packing') continue;
    assert.ok(reached.has(node.id), `${node.id} is not downstream of the design change`);
  }

  const edges = edgesForFinding(finding);
  assert.ok(
    edges.some(
      (edge) => edge.from === 'part:Tee Nuts' && edge.to === 'usage:packing:kit-b.md@0/0/0',
    ),
    'the single part must own the unmatched packing line',
  );

  const twoParts = {
    ...finding,
    id: 'R6-collision-two-parts',
    evidence: [
      ...finding.evidence,
      {
        role: 'part',
        nodeId: 'part:Other Part',
        sourceFile: 'parts/other-part.md',
        line: null,
        facts: { name: 'Other Part' },
      },
    ],
  };
  const twoPartEdges = edgesForFinding(twoParts);
  assert.ok(
    twoPartEdges.some(
      (edge) => edge.from === 'change:tee' && edge.to === 'usage:packing:kit-b.md@0/0/0',
    ),
    'without a resolved part, an unmatched line attaches to the change',
  );
});

test('packing lines join only a packing structure from the same source file', () => {
  const finding = {
    id: 'R6-two-packing-pages',
    rule: 'R6',
    inferred: true,
    subject: { key: 'tee nuts', kind: 'name', label: 'Tee Nuts', nodeId: null },
    evidence: [
      {
        role: 'design-change',
        nodeId: 'change:tee',
        sourceFile: 'change-log.md',
        line: 1,
        facts: { section: 'Changed', text: '- Removed the drop-in tee nuts.' },
      },
      ...[
        ['hardware-kit.md', 'usage:packing:hardware-kit.md@0/0/0'],
        ['main-carton.md', 'usage:packing:main-carton.md@0/0/0'],
      ].flatMap(([file, line]) => [
        {
          role: 'packing-line',
          nodeId: line,
          sourceFile: file,
          line: null,
          facts: { displayName: 'Tee Nuts', matchMethod: 'unmatched', resolvedPart: null },
        },
        {
          role: 'packing-structure',
          nodeId: `container:${file}`,
          sourceFile: file,
          line: null,
          facts: { title: file },
        },
      ]),
    ],
    queries: [],
  };

  const edges = edgesForFinding(finding).filter((edge) => edge.kind === 'link');
  const lineToStructure = edges.filter(
    (edge) => edge.from.startsWith('usage:packing:') && edge.to.startsWith('container:'),
  );
  const expected = finding.evidence
    .filter((row) => row.role === 'packing-line')
    .map((row) => [row.nodeId, `container:${row.sourceFile}`])
    .sort();
  assert.deepEqual(
    lineToStructure
      .map((edge) => [edge.from, edge.to])
      .sort((left, right) => (left[0] < right[0] ? -1 : 1)),
    expected,
    'a packing line must not link to a structure from another page',
  );
  assert.ok(
    lineToStructure.length <
      finding.evidence.filter((row) => row.role === 'packing-line').length *
        finding.evidence.filter((row) => row.role === 'packing-structure').length,
    'the fixture must have fewer edges than the Cartesian product',
  );
});

test('R9 candidate parts hang off the unresolved reference', () => {
  const finding = {
    id: 'R9-candidate',
    rule: 'R9',
    inferred: false,
    subject: { key: 'tee nuts', kind: 'unresolved-name', label: 'tee nuts', nodeId: null },
    evidence: [
      {
        role: 'service',
        nodeId: 'service:storage.md',
        sourceFile: 'storage.md',
        line: null,
        facts: { kind: 'maintenance', title: 'Storage' },
      },
      {
        role: 'reference',
        nodeId: 'usage:service:storage.md@0',
        sourceFile: 'storage.md',
        line: 4,
        facts: { displayName: 'tee nuts', matchMethod: 'unmatched', resolvedPart: null },
      },
      {
        role: 'part',
        nodeId: 'part:Tee Nuts',
        sourceFile: 'parts/tee-nuts.md',
        line: null,
        facts: { candidate: true, name: 'Tee Nuts' },
      },
    ],
    queries: [],
  };

  const edges = edgesForFinding(finding);
  assert.ok(
    edges.some(
      (edge) =>
        edge.from === 'usage:service:storage.md@0' &&
        edge.to === 'part:Tee Nuts' &&
        edge.kind === 'link',
    ),
    'the candidate part is not linked to the unresolved reference',
  );

  const layout = layoutFinding(finding);
  const part = layout.nodes.find((node) => node.id === 'part:Tee Nuts');
  assert.ok(part, 'the candidate part is not drawn');
  const incoming = layout.edges.filter((edge) => edge.to === part.id && edge.kind === 'link');
  assert.equal(incoming.length, 1, 'the candidate part is not connected to the reference');
});

test('quantity labels carry the sign and class of their facts', () => {
  const r1 = findings.filter((finding) => finding.rule === 'R1');
  assert.ok(r1.length > 0, 'the committed file has no R1 finding');
  for (const finding of r1) {
    const layout = layoutFinding(finding);
    for (const row of finding.evidence) {
      if (row.role !== 'quantity-difference') continue;
      const node = layout.nodes.find((candidate) => candidate.id === row.nodeId);
      assert.ok(node, `${finding.id}: quantity node ${row.nodeId} is not drawn`);
      const difference = row.facts.quantityDifference;
      assert.equal(typeof difference, 'number', `${finding.id}: difference is not a number`);
      const expectedText =
        difference > 0 ? `+${difference}` : difference < 0 ? `−${Math.abs(difference)}` : '0';
      const expectedClass =
        difference > 0 ? 'qty-pos' : difference < 0 ? 'qty-neg' : 'qty-zero';
      assert.equal(node.quantities.length, 1, `${finding.id}: quantity row count`);
      assert.equal(node.quantities[0].version, String(row.facts.version));
      assert.equal(node.quantities[0].text, expectedText, `${finding.id}: signed text`);
      assert.equal(node.quantities[0].className, expectedClass, `${finding.id}: sign class`);
      assert.equal(node.problem, true, `${finding.id}: a difference is a problem node`);
    }
  }
});

test('problem nodes and the impacted path follow the highlight rules', () => {
  for (const finding of findings) {
    const layout = layoutFinding(finding);
    const rows = orderEvidenceRows(finding);
    const subjectNodeId = finding.subject.nodeId;
    for (const node of layout.nodes) {
      const expected = node.evidenceIndexes.some((index) => {
        const row = rows[index];
        if (row.role === 'quantity-difference') return true;
        if (row.role === 'design-change') return true;
        if (row.role === 'reference') return row.facts.matchMethod === 'unmatched';
        if (row.role === 'packing-line') return row.facts.matchMethod === 'unmatched';
        return subjectNodeId !== null && row.nodeId === subjectNodeId;
      });
      assert.equal(node.problem, expected, `${finding.id}/${node.id}: problem flag`);
    }
    const problemIds = new Set(
      layout.nodes.filter((node) => node.problem).map((node) => node.id),
    );
    for (const edge of layout.edges) {
      const expected = edge.kind === 'link' && problemIds.has(edge.from) && problemIds.has(edge.to);
      assert.equal(edge.onPath, expected, `${finding.id}: path flag on ${edge.from} → ${edge.to}`);
    }
  }
});

test('coordinates stay in the viewBox and never overlap inside a lane', () => {
  for (const finding of findings) {
    for (const options of [{}, { width: 360 }, { width: 900 }]) {
      const layout = layoutFinding(finding, options);
      assert.ok(layout.width > 0 && layout.height > 0, `${finding.id}: empty viewBox`);
      for (const node of layout.nodes) {
        assert.ok(node.x >= 0, `${finding.id}: node x below 0`);
        assert.ok(node.y >= 0, `${finding.id}: node y below 0`);
        assert.ok(node.x + node.width <= layout.width + 0.001, `${finding.id}: node off width`);
        assert.ok(node.y + node.height <= layout.height + 0.001, `${finding.id}: node off height`);
      }
      for (const lane of layout.lanes) {
        assert.ok(lane.x >= 0, `${finding.id}: lane x below 0`);
        assert.ok(lane.x + lane.width <= layout.width + 0.001, `${finding.id}: lane off width`);
      }
      for (const edge of layout.edges) {
        for (const [x, y] of [
          [edge.x1, edge.y1],
          [edge.x2, edge.y2],
        ]) {
          assert.ok(x >= 0 && x <= layout.width, `${finding.id}: edge x outside the viewBox`);
          assert.ok(y >= 0 && y <= layout.height, `${finding.id}: edge y outside the viewBox`);
        }
      }
      for (const lane of layout.lanes) {
        const laneNodes = layout.nodes.filter((node) => node.lane === lane.id);
        for (let left = 0; left < laneNodes.length; left += 1) {
          for (let right = left + 1; right < laneNodes.length; right += 1) {
            const a = laneNodes[left];
            const b = laneNodes[right];
            const apart =
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y;
            assert.ok(apart, `${finding.id}: nodes ${a.id} and ${b.id} overlap`);
          }
        }
      }
    }
  }
});

test('overflow beyond the node cap is reported, not drawn', () => {
  const evidence = [];
  for (let index = 0; index < DEFAULT_NODE_CAP + 3; index += 1) {
    const name = `Synthetic Part ${String(index).padStart(2, '0')}`;
    evidence.push({
      role: 'part',
      nodeId: `part:${name}`,
      sourceFile: `bom/synthetic-${index}.md`,
      line: null,
      facts: { name },
    });
  }
  const synthetic = {
    id: 'synthetic-overflow',
    rule: 'R3',
    subject: { key: 'Synthetic Part 00', kind: 'part', label: 'Synthetic Part 00', nodeId: 'part:Synthetic Part 00' },
    evidence,
    queries: [],
  };

  const layout = layoutFinding(synthetic);
  assert.equal(layout.nodeCap, DEFAULT_NODE_CAP);
  assert.equal(layout.nodes.length, DEFAULT_NODE_CAP);
  assert.equal(layout.overflow.count, evidence.length - DEFAULT_NODE_CAP);
  assert.deepEqual(
    [...layout.nodes.map((node) => node.id), ...layout.overflow.nodeIds].sort(),
    evidence.map((row) => row.nodeId).sort(),
  );
  // Edges from a dropped node are dropped with it.
  const drawn = new Set(layout.nodes.map((node) => node.id));
  for (const edge of layout.edges) assert.ok(drawn.has(edge.from), `${edge.from} was dropped`);

  const capped = layoutFinding(synthetic, { nodeCap: 2 });
  assert.equal(capped.nodes.length, 2);
  assert.equal(capped.overflow.count, evidence.length - 2);

  assert.throws(() => layoutFinding(synthetic, { nodeCap: 0 }), /positive integer nodeCap/);
  assert.throws(() => layoutFinding(synthetic, { width: 0 }), /positive width/);
});

test('a finding without evidence renders an empty diagram', () => {
  const layout = layoutFinding({ id: 'empty', rule: 'R5', subject: { nodeId: null }, evidence: [] });
  assert.deepEqual(layout.nodes, []);
  assert.deepEqual(layout.lanes, []);
  assert.deepEqual(layout.edges, []);
  assert.equal(layout.overflow.count, 0);
  assert.equal(layout.height, 24);
});
