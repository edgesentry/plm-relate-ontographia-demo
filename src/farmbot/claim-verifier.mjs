// Deterministic verifier for fixed AI agent PLM/BOM claims.
//
// Plain ESM with no Node-only imports so Node tests and the /farmbot/ browser
// screen execute the exact same verification logic against the same Ontographia
// compiler, FarmBot ontology, existing Intent JSONs, and Relate graph seed.

import { canonicalize } from './agent/canonical.mjs';
import { compileCheck } from './agent/compile.mjs';
import { nodeProperties } from './agent/values.mjs';

const COMPILER_OPTIONS = Object.freeze({
  dialect: 'cypher25',
  ontologyPathHint: 'farmbot.native.yaml',
});

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {Iterable<string>} values
 * @returns {string[]}
 */
function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

/**
 * Clone a preset Intent and replace its first eq filter value.
 *
 * @param {Record<string, unknown>} template
 * @param {string} value
 * @returns {Record<string, unknown>}
 */
function withPartFilter(template, value) {
  const clone = structuredClone(template);
  const filters = Array.isArray(clone.filter) ? clone.filter : [];
  if (filters.length === 0) {
    throw new Error('Intent template has no filter to bind part name');
  }
  filters[0] = { ...filters[0], value };
  clone.filter = filters;
  return clone;
}

/**
 * Compile an Intent with Ontographia and execute it on the Relate session.
 *
 * @param {object} context
 * @param {string} intentPath
 * @param {Record<string, unknown>} intent
 * @returns {{ rows: Array<Record<string, unknown>>, provenance: { intent: string, cypher: string, params: Record<string, unknown>, rowCount: number } }}
 */
function runIntent(context, intentPath, intent) {
  const compiled = compileCheck(context.engine, context.ontology, intent);
  const rows = context.execute(compiled.query, compiled.params);
  if (!Array.isArray(rows)) {
    throw new Error(`Intent ${intentPath} did not return a row array`);
  }
  if (typeof intent.limit === 'number' && rows.length >= intent.limit) {
    throw new Error(
      `Intent ${intentPath} returned ${rows.length} rows and reached its limit ${intent.limit}`,
    );
  }
  return {
    rows,
    provenance: {
      intent: intentPath,
      cypher: compiled.query,
      params: compiled.params,
      rowCount: rows.length,
    },
  };
}

/**
 * Exclude Accessory bag BOM rows from R6 packing channel, matching
 * src/farmbot/agent/index.mjs.
 *
 * @param {Record<string, unknown>} structure
 * @param {Record<string, unknown>} usage
 * @returns {boolean}
 */
function isAccessoryBagReference(structure, usage) {
  return (
    String(structure.id ?? '').startsWith('bag:accessory:') ||
    String(usage.id ?? '').startsWith('usage:preassembly:')
  );
}

/**
 * Use Case 1: Verify that a claimed Part node and its AssemblyChapter usage
 * relationship exist in the Relate graph.
 *
 * @param {Record<string, unknown>} fixture
 * @param {object} context
 * @returns {Record<string, unknown>}
 */
function verifyPartInAssembly(fixture, context) {
  const claim = /** @type {{ partName: string, chapterPath: string }} */ (fixture.claim);
  const q2Intent = withPartFilter(context.intents.q2, claim.partName);
  const q3Intent = withPartFilter(context.intents.q3, claim.partName);
  const r3Intent = context.checkIntents['r3-parts-without-reference.json'];

  const q2Run = runIntent(context, 'farmbot/intents/q2-assembly-chapters-for-part.json', q2Intent);
  const q3Run = runIntent(context, 'farmbot/intents/q3-structures-for-part.json', q3Intent);
  const r3Run = runIntent(context, 'farmbot/checks/r3-parts-without-reference.json', r3Intent);

  const matchingChapters = sortedUnique(
    q2Run.rows
      .map((row) => row.chapter_path)
      .filter((path) => typeof path === 'string' && path.length > 0),
  );
  const matchingStructures = sortedUnique(
    q3Run.rows
      .map((row) => row.structure)
      .filter((path) => typeof path === 'string' && path.length > 0),
  );
  const inUnreferencedParts = r3Run.rows.some(
    (row) => nodeProperties(row.part).name === claim.partName,
  );
  const partExists = matchingStructures.length > 0 || inUnreferencedParts;
  const edgeExists = matchingChapters.includes(claim.chapterPath);

  const missingNodes = partExists ? [] : [`Part(${claim.partName})`];
  const missingEdges = edgeExists
    ? []
    : [
        `AssemblyChapter(${claim.chapterPath}) -[:HAS_USAGE]-> Usage -[:USES_ITEM]-> Part(${claim.partName})`,
      ];

  let verdict = 'confirmed';
  let reasonCode = 'confirmed';
  let summary = `Confirmed: Part "${claim.partName}" exists and is referenced by ${claim.chapterPath}.`;

  if (!partExists) {
    verdict = 'rejected';
    reasonCode = 'missing_part_node';
    summary = `Rejected: Part "${claim.partName}" does not exist in the FarmBot graph (0 matching Part nodes).`;
  } else if (!edgeExists) {
    verdict = 'rejected';
    reasonCode = 'missing_relationship';
    summary =
      `Rejected: Part "${claim.partName}" exists, but has no HAS_USAGE -> USES_ITEM link from ${claim.chapterPath}.`;
  }

  return canonicalize({
    claimId: fixture.id,
    useCase: fixture.useCase,
    verdict,
    reasonCode,
    summary,
    claimed: {
      partName: claim.partName,
      chapterPath: claim.chapterPath,
    },
    actual: {
      partExists,
      edgeExists,
      matchingChapters,
      structureCount: matchingStructures.length,
    },
    missing: {
      nodes: missingNodes,
      edges: missingEdges,
    },
    evidence: {
      ruleId: null,
      queries: [q2Run.provenance, q3Run.provenance, r3Run.provenance],
    },
  });
}

/**
 * Use Case 2: Verify an R1 packing-vs-part quantity claim against the Relate
 * graph using the existing R1 check Intents.
 *
 * @param {Record<string, unknown>} fixture
 * @param {object} context
 * @returns {Record<string, unknown>}
 */
function verifyR1QuantityCheck(fixture, context) {
  const claim = /** @type {{
    rule: string,
    partName: string,
    variant: string,
    packingQuantity: number,
    partQuantity: number,
    quantityDifference: number,
  }} */ (fixture.claim);

  const diffRun = runIntent(
    context,
    'farmbot/checks/r1-quantity-difference.json',
    context.checkIntents['r1-quantity-difference.json'],
  );
  const containerRun = runIntent(
    context,
    'farmbot/checks/r1-compared-in.json',
    context.checkIntents['r1-compared-in.json'],
  );
  const variantRun = runIntent(
    context,
    'farmbot/checks/r1-for-variant.json',
    context.checkIntents['r1-for-variant.json'],
  );

  const comparisons = new Map();
  for (const row of diffRun.rows) {
    const difference = nodeProperties(row.difference);
    const part = nodeProperties(row.part);
    comparisons.set(difference.id, { difference, part, container: null, variant: null });
  }
  for (const row of containerRun.rows) {
    const difference = nodeProperties(row.difference);
    const entry = comparisons.get(difference.id);
    if (entry) entry.container = nodeProperties(row.container);
  }
  for (const row of variantRun.rows) {
    const difference = nodeProperties(row.difference);
    const entry = comparisons.get(difference.id);
    if (entry) entry.variant = nodeProperties(row.variant);
  }

  const matched = [...comparisons.values()].find(
    (entry) => entry.part.name === claim.partName && entry.variant?.code === claim.variant,
  );

  if (!matched) {
    const claimedZeroDiff = claim.quantityDifference === 0;
    return canonicalize({
      claimId: fixture.id,
      useCase: fixture.useCase,
      verdict: claimedZeroDiff ? 'confirmed' : 'rejected',
      reasonCode: claimedZeroDiff ? 'confirmed' : 'quantity_mismatch',
      summary: claimedZeroDiff
        ? `Confirmed: Rule R1 records no quantity difference for "${claim.partName}" (${claim.variant}).`
        : `Rejected: Rule R1 records no quantity difference for "${claim.partName}" (${claim.variant}), contradicting claimed diff ${claim.quantityDifference}.`,
      claimed: {
        partName: claim.partName,
        variant: claim.variant,
        packingQuantity: claim.packingQuantity,
        partQuantity: claim.partQuantity,
        quantityDifference: claim.quantityDifference,
      },
      actual: {
        hasR1Finding: false,
        packingQuantity: null,
        partQuantity: null,
        quantityDifference: 0,
        container: null,
      },
      missing: { nodes: [], edges: [] },
      evidence: {
        ruleId: 'R1',
        queries: [diffRun.provenance, containerRun.provenance, variantRun.provenance],
      },
    });
  }

  const actualPacking = Number(matched.difference.packing_quantity);
  const actualPart = Number(matched.difference.part_quantity);
  const actualDiff = Number(matched.difference.packing_minus_part);
  const actualContainer = matched.container?.path ?? null;

  const exactMatch =
    claim.packingQuantity === actualPacking &&
    claim.partQuantity === actualPart &&
    claim.quantityDifference === actualDiff;

  return canonicalize({
    claimId: fixture.id,
    useCase: fixture.useCase,
    verdict: exactMatch ? 'confirmed' : 'rejected',
    reasonCode: exactMatch ? 'confirmed' : 'quantity_mismatch',
    summary: exactMatch
      ? `Confirmed: Rule R1 proves "${claim.partName}" (${claim.variant}) has packing ${actualPacking} vs part ${actualPart} (diff ${actualDiff}) in ${actualContainer}.`
      : `Rejected: Rule R1 proves "${claim.partName}" (${claim.variant}) has packing ${actualPacking} vs part ${actualPart} (diff ${actualDiff}) in ${actualContainer}, contradicting claimed ${claim.packingQuantity} vs ${claim.partQuantity} (diff ${claim.quantityDifference}).`,
    claimed: {
      partName: claim.partName,
      variant: claim.variant,
      packingQuantity: claim.packingQuantity,
      partQuantity: claim.partQuantity,
      quantityDifference: claim.quantityDifference,
    },
    actual: {
      hasR1Finding: true,
      packingQuantity: actualPacking,
      partQuantity: actualPart,
      quantityDifference: actualDiff,
      container: actualContainer,
    },
    missing: { nodes: [], edges: [] },
    evidence: {
      ruleId: 'R1',
      queries: [diffRun.provenance, containerRun.provenance, variantRun.provenance],
    },
  });
}

/**
 * Use Case 3: Verify an R6 Change Log downstream impact claim across assembly,
 * packing (kit/carton/pack bag), and service documentation.
 *
 * @param {Record<string, unknown>} fixture
 * @param {object} context
 * @returns {Record<string, unknown>}
 */
function verifyR6ChangeImpact(fixture, context) {
  const claim = /** @type {{
    rule: string,
    partName: string,
    downstreamImpact: boolean,
    affectedFiles: string[],
  }} */ (fixture.claim);

  const changedRun = runIntent(
    context,
    'farmbot/checks/changed-parts.json',
    context.checkIntents['changed-parts.json'],
  );
  const assemblyRun = runIntent(
    context,
    'farmbot/checks/refs-assembly.json',
    context.checkIntents['refs-assembly.json'],
  );
  const kitRun = runIntent(
    context,
    'farmbot/checks/refs-kit.json',
    context.checkIntents['refs-kit.json'],
  );
  const cartonRun = runIntent(
    context,
    'farmbot/checks/refs-carton.json',
    context.checkIntents['refs-carton.json'],
  );
  const bagRun = runIntent(
    context,
    'farmbot/checks/refs-bag.json',
    context.checkIntents['refs-bag.json'],
  );
  const serviceRun = runIntent(
    context,
    'farmbot/checks/refs-service.json',
    context.checkIntents['refs-service.json'],
  );

  const changeRows = changedRun.rows
    .map((row) => ({
      change: nodeProperties(row.change),
      part: nodeProperties(row.part),
    }))
    .filter((entry) => entry.part.name === claim.partName);

  const changeSources = sortedUnique(
    changeRows
      .map((entry) =>
        typeof entry.change.path === 'string'
          ? entry.change.line !== null && entry.change.line !== undefined
            ? `${entry.change.path}:${entry.change.line}`
            : entry.change.path
          : null,
      )
      .filter((value) => typeof value === 'string'),
  );

  const downstreamPaths = [];
  for (const [kind, run] of [
    ['assembly', assemblyRun],
    ['kit', kitRun],
    ['carton', cartonRun],
    ['bag', bagRun],
    ['service', serviceRun],
  ]) {
    for (const row of run.rows) {
      const part = nodeProperties(row.part);
      if (part.name !== claim.partName) continue;
      const structure = nodeProperties(row.structure);
      const usage = nodeProperties(row.usage);
      if (kind === 'bag' && isAccessoryBagReference(structure, usage)) continue;
      if (typeof structure.path === 'string' && structure.path.length > 0) {
        downstreamPaths.push(structure.path);
      }
    }
  }

  const actualFiles = sortedUnique(downstreamPaths);
  const claimedFiles = sortedUnique(claim.affectedFiles ?? []);
  const hasChangeLink = changeRows.length > 0;
  const actualDownstreamImpact = hasChangeLink && actualFiles.length > 0;

  let verdict = 'confirmed';
  let reasonCode = 'confirmed';
  let summary = actualDownstreamImpact
    ? `Confirmed: Rule R6 proves "${claim.partName}" is changed (${changeSources.join(', ')}) and still appears in ${actualFiles.join(', ')}.`
    : `Confirmed: Rule R6 finds no remaining downstream references for "${claim.partName}".`;

  if (actualDownstreamImpact !== claim.downstreamImpact) {
    verdict = 'rejected';
    reasonCode = 'missed_downstream_impact';
    summary = actualDownstreamImpact
      ? `Rejected: Rule R6 proves "${claim.partName}" (${changeSources.join(', ')}) still appears in ${actualFiles.join(', ')}, contradicting the claimed all-clear.`
      : `Rejected: Rule R6 finds no remaining downstream references for "${claim.partName}", contradicting the claimed impact.`;
  } else if (JSON.stringify(claimedFiles) !== JSON.stringify(actualFiles)) {
    verdict = 'rejected';
    reasonCode = 'impact_files_mismatch';
    summary = `Rejected: Rule R6 downstream files for "${claim.partName}" are ${actualFiles.join(', ')}, not ${claimedFiles.join(', ')}.`;
  }

  return canonicalize({
    claimId: fixture.id,
    useCase: fixture.useCase,
    verdict,
    reasonCode,
    summary,
    claimed: {
      partName: claim.partName,
      downstreamImpact: claim.downstreamImpact,
      affectedFiles: claimedFiles,
    },
    actual: {
      hasChangeLink,
      changeSources,
      downstreamImpact: actualDownstreamImpact,
      affectedFiles: actualFiles,
    },
    missing: { nodes: [], edges: [] },
    evidence: {
      ruleId: 'R6',
      queries: [
        changedRun.provenance,
        assemblyRun.provenance,
        kitRun.provenance,
        cartonRun.provenance,
        bagRun.provenance,
        serviceRun.provenance,
      ],
    },
  });
}

/**
 * Verify one fixed agent-claim fixture deterministically against the Relate
 * graph using the Ontographia compiler and existing FarmBot Intents.
 *
 * @param {Record<string, unknown>} fixture
 * @param {{
 *   engine: { buildCypher: Function },
 *   ontology: string,
 *   intents: Record<string, Record<string, unknown>>,
 *   checkIntents: Record<string, Record<string, unknown>>,
 *   execute: (query: string, params: Record<string, unknown>) => Array<Record<string, unknown>>,
 * }} context
 * @returns {Record<string, unknown>}
 */
export function verifyAgentClaim(fixture, context) {
  if (!fixture || typeof fixture !== 'object' || !fixture.claim || typeof fixture.claim !== 'object') {
    throw new Error('verifyAgentClaim requires a claim fixture with a claim object');
  }
  if (!context || typeof context.execute !== 'function' || !context.engine) {
    throw new Error('verifyAgentClaim requires engine, ontology, intents, checkIntents, and execute');
  }
  switch (fixture.claim.kind) {
    case 'part-in-assembly':
      return verifyPartInAssembly(fixture, context);
    case 'r1-quantity-check':
      return verifyR1QuantityCheck(fixture, context);
    case 'r6-change-impact':
      return verifyR6ChangeImpact(fixture, context);
    default:
      throw new Error(`Unsupported claim kind: ${String(fixture.claim.kind)}`);
  }
}

/**
 * Verify every claim fixture in deterministic order by id.
 *
 * @param {Array<Record<string, unknown>>} fixtures
 * @param {Parameters<typeof verifyAgentClaim>[1]} context
 * @returns {Array<Record<string, unknown>>}
 */
export function verifyAllAgentClaims(fixtures, context) {
  return [...fixtures]
    .sort((left, right) => compareText(String(left.id), String(right.id)))
    .map((fixture) => verifyAgentClaim(fixture, context));
}

export { COMPILER_OPTIONS };
