// Pure layout helpers for the process-lane diagram in the finding view.
//
// No DOM and no imports beyond the shared view helpers: `node --test` and the
// React screen use the same functions. Nodes and edges come only from a
// finding's evidence rows, so the diagram never adds a node that the table does
// not cite. Everything here is text or numbers; nothing produces HTML.
//
// Lane model, edge patterns, the highlight rules and the node cap are
// documented in `farmbot/docs/checks.md` (section "Process lanes").

import { evidenceRows } from './findings-view.mjs';

/** Lane order. Lanes are always laid out left to right in this order. */
export const LANES = Object.freeze([
  { id: 'design-change', labelKey: 'laneDesignChange' },
  { id: 'ebom-part', labelKey: 'laneEbomPart' },
  { id: 'assembly', labelKey: 'laneAssembly' },
  { id: 'packing', labelKey: 'lanePacking' },
  { id: 'service', labelKey: 'laneService' },
]);

/**
 * Per-finding node cap. The largest committed finding has seven unique evidence
 * nodes, so the cap only applies to evidence sets that grow later; the
 * remainder is reported as overflow and stays in the evidence table.
 */
export const DEFAULT_NODE_CAP = 12;

/** Prefix of a lane-level placeholder anchor (a missing link target). */
export const PLACEHOLDER_PREFIX = 'lane:';

const LANE_INDEX = new Map(LANES.map((lane, index) => [lane.id, index]));

const PAD = 12;
const HEADER_HEIGHT = 24;
const ROW_PITCH = 58;
const NODE_HEIGHT = 48;
const LANE_INSET_LEFT = 14;
const LANE_INSET_RIGHT = 16;
const NATURAL_LANE_WIDTH = 148;
const MIN_NATURAL_LANES = 2;
const MISSING_LENGTH = 14;
const MISSING_SPREAD = 16;

const STRUCTURE_LANES = Object.freeze({
  chapter: 'assembly',
  preassembly: 'assembly',
  container: 'packing',
  bag: 'packing',
});

const USAGE_LANES = Object.freeze({
  assembly: 'assembly',
  preassembly: 'assembly',
  packing: 'packing',
});

/** Code-unit comparison, independent of locale and input order. */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function laneRank(laneId) {
  return LANE_INDEX.get(laneId) ?? LANES.length;
}

function prefixOf(nodeId) {
  if (typeof nodeId !== 'string') return '';
  const at = nodeId.indexOf(':');
  return at === -1 ? '' : nodeId.slice(0, at);
}

/** `usage:packing:<file>@...` yields `packing`. */
function usageKindOf(nodeId) {
  if (typeof nodeId !== 'string') return '';
  const parts = nodeId.split(':');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * The lane an evidence row belongs to.
 *
 * `part` is a BOM part page, so it sits in the EBOM lane. A `structure` row is
 * placed by its node id prefix (`chapter:`, `preassembly:`, `container:`,
 * `bag:`) and a `reference` row by its usage kind (`usage:assembly:`,
 * `usage:preassembly:`, `usage:packing:`). A quantity comparison is a packing
 * list row checked against the part page, so it sits in the packing lane.
 * Roles defined by later rules (`design-change`, `service`) map to their own
 * lanes. Anything else throws rather than guessing.
 *
 * @param {{ role: string, nodeId: string }} row
 * @returns {'design-change' | 'ebom-part' | 'assembly' | 'packing' | 'service'}
 */
export function laneForEvidence(row) {
  if (!row || typeof row !== 'object') throw new Error('laneForEvidence needs an evidence row');
  switch (row.role) {
    case 'part':
      return 'ebom-part';
    case 'quantity-difference':
    case 'packing-line':
    case 'packing-structure':
      return 'packing';
    case 'pre-assembly-page':
      return 'assembly';
    case 'design-change':
      return 'design-change';
    case 'service':
      return 'service';
    case 'reference': {
      const lane = USAGE_LANES[usageKindOf(row.nodeId)];
      if (lane) return lane;
      throw new Error(`no lane for reference node id ${JSON.stringify(row.nodeId)}`);
    }
    case 'structure': {
      const lane = STRUCTURE_LANES[prefixOf(row.nodeId)];
      if (lane) return lane;
      throw new Error(`no lane for structure node id ${JSON.stringify(row.nodeId)}`);
    }
    default:
      throw new Error(`no lane for evidence role ${JSON.stringify(row.role)}`);
  }
}

function uniqueNodeIds(rows, role) {
  const ids = [];
  for (const row of rows) {
    if (row.role === role && !ids.includes(row.nodeId)) ids.push(row.nodeId);
  }
  return ids.sort(compareText);
}

/** Stable order of one finding's evidence rows: lane, role, node id, source, line. */
function compareItems(left, right) {
  return (
    laneRank(left.lane) - laneRank(right.lane) ||
    compareText(left.row.role, right.row.role) ||
    compareText(left.row.nodeId, right.row.nodeId) ||
    compareText(String(left.row.sourceFile ?? ''), String(right.row.sourceFile ?? '')) ||
    (left.row.line ?? -1) - (right.row.line ?? -1) ||
    left.inputIndex - right.inputIndex
  );
}

/**
 * The finding's evidence rows in diagram order.
 *
 * The order depends only on the row values: lane order, then role, then node
 * id, then source file and line. The evidence table and the diagram share it,
 * so a row index names the same row in both and a permuted evidence array
 * yields the same result.
 *
 * @param {Record<string, any>} finding
 * @returns {Array<Record<string, any>>}
 */
export function orderEvidenceRows(finding) {
  if (!finding || typeof finding !== 'object') throw new Error('orderEvidenceRows needs a finding');
  return evidenceRows(finding)
    .map((row, inputIndex) => ({ row, inputIndex, lane: laneForEvidence(row) }))
    .sort(compareItems)
    .map((item) => item.row);
}

/**
 * Edges derived only from the evidence rows of one finding.
 *
 * The per-rule patterns are documented in `farmbot/docs/checks.md`:
 *
 * - R1: every packing line → the quantity comparison → the part.
 * - R2: every structure → its unresolved reference, plus a missing edge from
 *   the reference to the EBOM lane because it resolves to no part.
 * - R3: a missing edge from the part to the assembly and packing lanes.
 * - R4: the part → every packing line → the packing structure, plus a missing
 *   edge from the part to the assembly lane.
 * - R5: no edges; the page node stands alone.
 *
 * A `missing` edge ends at a lane-level placeholder (`lane:<lane id>`), never
 * at an invented node. Rules without a pattern yield no edges.
 *
 * @param {Record<string, any>} finding
 * @returns {Array<{ from: string, to: string, kind: 'link' | 'missing' }>}
 */
export function edgesForFinding(finding) {
  if (!finding || typeof finding !== 'object') throw new Error('edgesForFinding needs a finding');
  const rows = evidenceRows(finding);
  const edges = [];
  const add = (from, to, kind = 'link') => {
    if (typeof from !== 'string' || typeof to !== 'string') return;
    if (from === '' || to === '' || from === to) return;
    edges.push({ from, to, kind });
  };
  const rule = typeof finding.rule === 'string' ? finding.rule : '';
  const parts = uniqueNodeIds(rows, 'part');

  if (rule === 'R1') {
    const differences = uniqueNodeIds(rows, 'quantity-difference');
    const lines = uniqueNodeIds(rows, 'packing-line');
    for (const line of lines) {
      for (const difference of differences) add(line, difference);
    }
    for (const difference of differences) {
      for (const part of parts) add(difference, part);
    }
    if (differences.length === 0) {
      for (const line of lines) {
        for (const part of parts) add(line, part);
      }
    }
  } else if (rule === 'R2') {
    const references = uniqueNodeIds(rows, 'reference');
    const structures = uniqueNodeIds(rows, 'structure');
    for (const structure of structures) {
      for (const reference of references) add(structure, reference);
    }
    for (const reference of references) {
      add(reference, `${PLACEHOLDER_PREFIX}ebom-part`, 'missing');
    }
  } else if (rule === 'R3') {
    for (const part of parts) {
      add(part, `${PLACEHOLDER_PREFIX}assembly`, 'missing');
      add(part, `${PLACEHOLDER_PREFIX}packing`, 'missing');
    }
  } else if (rule === 'R4') {
    const lines = uniqueNodeIds(rows, 'packing-line');
    const structures = uniqueNodeIds(rows, 'packing-structure');
    for (const part of parts) {
      for (const line of lines) add(part, line);
    }
    for (const line of lines) {
      for (const structure of structures) add(line, structure);
    }
    for (const part of parts) add(part, `${PLACEHOLDER_PREFIX}assembly`, 'missing');
  }

  const seen = new Map();
  for (const edge of edges) {
    seen.set(JSON.stringify([edge.from, edge.to, edge.kind]), edge);
  }
  return [...seen.values()].sort(
    (left, right) =>
      compareText(left.from, right.from) ||
      compareText(left.to, right.to) ||
      compareText(left.kind, right.kind),
  );
}

/** `+4`, `−8` (U+2212) or `0`, from a signed difference. */
function quantityText(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

function quantityClass(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0) return 'qty-pos';
    if (value < 0) return 'qty-neg';
  }
  return 'qty-zero';
}

function labelOf(row) {
  const facts = row.facts && typeof row.facts === 'object' ? row.facts : {};
  if (row.role === 'quantity-difference') {
    const packing = facts.packingQuantity;
    const part = facts.partQuantity;
    if (typeof packing === 'number' && typeof part === 'number') return `${packing} → ${part}`;
    if (typeof facts.version === 'string' && facts.version !== '') return facts.version;
    return row.nodeId;
  }
  for (const value of [facts.displayName, facts.name, facts.title]) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return row.nodeId;
}

function metaOf(row) {
  const facts = row.facts && typeof row.facts === 'object' ? row.facts : {};
  if (row.role === 'quantity-difference') {
    if (typeof facts.version === 'string' && facts.version !== '') return facts.version;
  }
  if (typeof row.sourceFile === 'string' && row.sourceFile !== '') return row.sourceFile;
  return row.nodeId;
}

function isProblemRow(row, subjectNodeId) {
  if (row.role === 'quantity-difference') return true;
  if (row.role === 'reference' && row.facts && row.facts.matchMethod === 'unmatched') return true;
  return subjectNodeId !== null && row.nodeId === subjectNodeId;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

/**
 * Lay out one finding's evidence nodes and edges.
 *
 * Nodes are the unique evidence node ids, deduplicated by node id, ordered by
 * lane order, then role, then node id (plain code-unit comparison), and
 * truncated to `nodeCap`. The remainder is reported in `overflow`. Visible
 * lanes are those with at least one node; hidden lanes have no nodes.
 *
 * @param {Record<string, any>} finding
 * @param {{ width?: number, nodeCap?: number }} [options]
 * @returns {{
 *   width: number,
 *   height: number,
 *   nodeCap: number,
 *   lanes: Array<{ id: string, labelKey: string, x: number, width: number, count: number }>,
 *   nodes: Array<Record<string, any>>,
 *   edges: Array<Record<string, any>>,
 *   overflow: { count: number, nodeIds: string[] },
 * }}
 */
export function layoutFinding(finding, options = {}) {
  if (!finding || typeof finding !== 'object') throw new Error('layoutFinding needs a finding');
  const nodeCap = options.nodeCap === undefined ? DEFAULT_NODE_CAP : options.nodeCap;
  if (!Number.isInteger(nodeCap) || nodeCap < 1) {
    throw new Error(
      `layoutFinding needs a positive integer nodeCap, got ${String(options.nodeCap)}`,
    );
  }
  const subjectNodeId =
    finding.subject && typeof finding.subject.nodeId === 'string' ? finding.subject.nodeId : null;

  const rows = orderEvidenceRows(finding);
  const groups = new Map();
  rows.forEach((row, index) => {
    const lane = laneForEvidence(row);
    const group = groups.get(row.nodeId);
    const item = { row, index, lane };
    if (group) group.items.push(item);
    else groups.set(row.nodeId, { nodeId: row.nodeId, items: [item] });
  });

  const entries = [...groups.values()].map((group) => {
    const primary = group.items[0];
    const quantities = [];
    for (const item of group.items) {
      if (item.row.role !== 'quantity-difference') continue;
      const facts = item.row.facts && typeof item.row.facts === 'object' ? item.row.facts : {};
      const version =
        facts.version === undefined || facts.version === null ? '' : String(facts.version);
      quantities.push({
        version,
        text: quantityText(facts.quantityDifference),
        className: quantityClass(facts.quantityDifference),
      });
    }
    return {
      id: group.nodeId,
      lane: primary.lane,
      role: primary.row.role,
      evidenceIndexes: group.items.map((item) => item.index),
      label: labelOf(primary.row),
      meta: metaOf(primary.row),
      problem: group.items.some((item) => isProblemRow(item.row, subjectNodeId)),
      quantities,
    };
  });

  entries.sort(
    (left, right) =>
      laneRank(left.lane) - laneRank(right.lane) ||
      compareText(left.role, right.role) ||
      compareText(left.id, right.id),
  );

  const kept = entries.slice(0, nodeCap);
  const overflowEntries = entries.slice(nodeCap);

  const rowsByLane = new Map();
  for (const entry of kept) {
    if (!rowsByLane.has(entry.lane)) rowsByLane.set(entry.lane, []);
    rowsByLane.get(entry.lane).push(entry);
  }
  const visibleLanes = LANES.filter((lane) => rowsByLane.has(lane.id));

  const laneCount = visibleLanes.length;
  const naturalWidth =
    PAD * 2 + Math.max(laneCount, MIN_NATURAL_LANES) * NATURAL_LANE_WIDTH;
  const width = options.width === undefined ? naturalWidth : options.width;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    throw new Error(`layoutFinding needs a positive width, got ${String(options.width)}`);
  }

  if (laneCount === 0) {
    return {
      width,
      height: PAD * 2,
      nodeCap,
      lanes: [],
      nodes: [],
      edges: [],
      overflow: { count: overflowEntries.length, nodeIds: overflowEntries.map((entry) => entry.id) },
    };
  }

  const columnWidth = (width - PAD * 2) / laneCount;
  const nodeWidth = Math.max(40, columnWidth - LANE_INSET_LEFT - LANE_INSET_RIGHT);
  const rowCount = Math.max(...[...rowsByLane.values()].map((laneRows) => laneRows.length));
  const height = PAD * 2 + HEADER_HEIGHT + (Math.max(rowCount, 1) - 1) * ROW_PITCH + NODE_HEIGHT;

  const nodes = [];
  const lanes = visibleLanes.map((lane, laneIndexInDiagram) => {
    const laneRows = rowsByLane.get(lane.id) ?? [];
    const laneX = PAD + laneIndexInDiagram * columnWidth;
    laneRows.forEach((entry, rowIndex) => {
      nodes.push({
        ...entry,
        x: laneX + LANE_INSET_LEFT,
        y: PAD + HEADER_HEIGHT + rowIndex * ROW_PITCH,
        width: nodeWidth,
        height: NODE_HEIGHT,
      });
    });
    return {
      id: lane.id,
      labelKey: lane.labelKey,
      x: laneX,
      width: columnWidth,
      count: laneRows.length,
    };
  });
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const rawEdges = edgesForFinding(finding);
  const keptEdges = [];
  for (const edge of rawEdges) {
    const from = nodeById.get(edge.from);
    if (!from) continue;
    const toNode = nodeById.get(edge.to) ?? null;
    if (!toNode && !edge.to.startsWith(PLACEHOLDER_PREFIX)) continue;
    if (!toNode && !LANE_INDEX.has(edge.to.slice(PLACEHOLDER_PREFIX.length))) continue;
    keptEdges.push({ ...edge, from, toNode });
  }

  const missingCountByFrom = new Map();
  for (const edge of keptEdges) {
    if (edge.toNode) continue;
    missingCountByFrom.set(edge.from.id, (missingCountByFrom.get(edge.from.id) ?? 0) + 1);
  }
  const missingSeenByFrom = new Map();

  const edges = keptEdges.map((edge) => {
    const from = edge.from;
    let x1;
    let y1;
    let x2;
    let y2;
    let mx;
    if (edge.toNode) {
      const to = edge.toNode;
      if (from.x === to.x) {
        // Same lane: a bracket in the lane's right margin, clear of the boxes.
        const lane = laneById.get(from.lane);
        mx = (lane ? lane.x + lane.width : from.x + from.width) - 8;
        x1 = from.x + from.width;
        x2 = to.x + to.width;
        y1 = from.y + from.height / 2;
        y2 = to.y + to.height / 2;
      } else if (to.x > from.x) {
        x1 = from.x + from.width;
        y1 = from.y + from.height / 2;
        x2 = to.x;
        y2 = to.y + to.height / 2;
        mx = (x1 + x2) / 2;
      } else {
        x1 = from.x;
        y1 = from.y + from.height / 2;
        x2 = to.x + to.width;
        y2 = to.y + to.height / 2;
        mx = (x1 + x2) / 2;
      }
    } else {
      const targetLane = edge.to.slice(PLACEHOLDER_PREFIX.length);
      const rightward = laneRank(targetLane) > laneRank(from.lane);
      const total = missingCountByFrom.get(from.id) ?? 1;
      const seen = missingSeenByFrom.get(from.id) ?? 0;
      missingSeenByFrom.set(from.id, seen + 1);
      const offset = (seen - (total - 1) / 2) * MISSING_SPREAD;
      const lane = laneById.get(from.lane);
      const laneLow = (lane ? lane.x : 0) + 2;
      const laneHigh = (lane ? lane.x + lane.width : width) - 2;
      y1 = from.y + from.height / 2 + offset;
      y2 = y1;
      x1 = rightward ? from.x + from.width : from.x;
      x2 = clamp(x1 + (rightward ? MISSING_LENGTH : -MISSING_LENGTH), laneLow, laneHigh);
    }
    return {
      from: edge.from.id,
      to: edge.to,
      kind: edge.kind,
      onPath: Boolean(edge.toNode && from.problem && edge.toNode.problem),
      x1,
      y1,
      x2,
      y2,
      ...(mx === undefined ? {} : { mx }),
    };
  });

  return {
    width,
    height,
    nodeCap,
    lanes,
    nodes,
    edges,
    overflow: { count: overflowEntries.length, nodeIds: overflowEntries.map((entry) => entry.id) },
  };
}
