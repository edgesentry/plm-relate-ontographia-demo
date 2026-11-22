// FarmBot check engine: compile -> execute -> rule evaluation -> findings.
//
// The engine is plain ESM and has no Node-only import. The caller supplies the
// compiler, the executor, the ontology text, the check Intent JSON and a map of
// node ids to source files. `farmbot/scripts/agent-farmbot.mjs` supplies these
// from the committed seed and a Relate session; the browser screen will supply
// the same values later.
//
// Absence is expressed by the check Intents themselves: Ontographia 0.1.10
// compiles a `not_exists` entry to a correlated `NOT EXISTS` sub-pattern, so the
// rule module reads the membership rows directly instead of subtracting one
// traversal from another. Deduplication and arithmetic still happen here, and
// no sums or DISTINCT are available. No Cypher is written by this module: every
// statement is the compiler's output for a check Intent under farmbot/checks/.

import {
  CHECKS,
  INTENT_FILES,
  PACKING_INTENTS,
  REFERENCE_INTENTS,
} from './checks.mjs';
import { compileCheck } from './compile.mjs';
import { assignFindingIds, findingSubjectKey } from './ids.mjs';
import { materialKey, materialNodeId } from '../materials.mjs';
import { matchChangeNames, normalizeName } from './names.mjs';
import { evaluateSeverity } from './severity.mjs';
import {
  changedNameCauses,
  changedNameCountermeasures,
  changedPartUnreachedCauses,
  changedPartUnreachedCountermeasures,
  packedWithoutProcessCauses,
  packedWithoutProcessCountermeasures,
  quantityCauses,
  quantityCountermeasures,
  serviceOnlyPartCauses,
  serviceOnlyPartCountermeasures,
  unreadablePageCauses,
  unreadablePageCountermeasures,
  unreferencedPartCauses,
  unreferencedPartCountermeasures,
  unresolvedReferenceCauses,
  unresolvedReferenceCountermeasures,
  unresolvedServiceCauses,
  unresolvedServiceCountermeasures,
} from './templates.mjs';
import { nodeProperties } from './values.mjs';

/**
 * @typedef {{
 *   buildCypher: (
 *     ontology: string,
 *     intent: object,
 *     options?: { dialect?: string, ontologyPathHint?: string },
 *   ) => { query: string, params: Record<string, unknown> }
 * }} CypherCompiler
 * @typedef {(query: string, params: Record<string, unknown>) => Array<Record<string, unknown>>} CheckExecutor
 * @typedef {{
 *   engine: CypherCompiler,
 *   ontology: string,
 *   checks: Record<string, object>,
 *   execute: CheckExecutor,
 *   sources?: Record<string, string> | Map<string, string>,
 *   seed: { digest: string, bytes: number },
 * }} CollectOptions
 */

const SEVERITY_LEVELS = Object.freeze(['action', 'info', 'review']);

/**
 * A bag reference is an Accessory bag BOM row, not a packing item. Bags named
 * `bag:accessory:` own the pre-assembly section the extract records as
 * `Accessory bag BOM`; R6 reads the `packing_item` rows only.
 *
 * @param {{ kind: string, structure: Record<string, unknown>, usage: Record<string, unknown> }} reference
 * @returns {boolean}
 */
function isAccessoryBagReference(reference) {
  return (
    reference.kind === 'bag' &&
    (String(reference.structure.id ?? '').startsWith('bag:accessory:') ||
      String(reference.usage.id ?? '').startsWith('usage:preassembly:'))
  );
}

/**
 * A ManufacturingContainer row belongs to the R6 packing channel only when it
 * is a kit, the carton or a pack bag. PreAssembly pages are manufacturing
 * containers too, but their usages are not `packing_item` rows.
 *
 * @param {Record<string, unknown>} structure
 * @param {Record<string, unknown>} usage
 * @returns {boolean}
 */
function isPackingManufacturingRow(structure, usage) {
  const structureId = String(structure.id ?? '');
  const usageId = String(usage.id ?? '');
  if (usageId.startsWith('usage:preassembly:')) return false;
  return structureId.startsWith('container:') || structureId.startsWith('bag:pack:');
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function valueOrNull(value) {
  return value === undefined ? null : value;
}

/**
 * @param {string} text
 * @returns {string}
 */
function compareText(text, other) {
  return text < other ? -1 : text > other ? 1 : 0;
}

/**
 * Sort evidence rows by role and then by seed node id.
 *
 * @param {Array<{ role: string, nodeId: string }>} evidence
 * @returns {Array<{ role: string, nodeId: string }>}
 */
function sortEvidence(evidence) {
  return evidence.sort(
    (left, right) =>
      compareText(left.role, right.role) || compareText(left.nodeId, right.nodeId),
  );
}

/**
 * Identity of one evidence row: role, seed node id, source file and line.
 * Within one finding those four fields describe the same citation of the same
 * node, so repeated rows are collapsed before sorting.
 *
 * @param {{ role: string, nodeId: string, sourceFile: string | null, line: number | null }} row
 * @returns {string}
 */
function evidenceIdentity(row) {
  return JSON.stringify([row.role, row.nodeId, row.sourceFile, row.line]);
}

/**
 * Drop repeated evidence rows, keeping the first occurrence.
 *
 * @param {Array<{ role: string, nodeId: string, sourceFile: string | null, line: number | null }>} evidence
 * @returns {Array<{ role: string, nodeId: string, sourceFile: string | null, line: number | null }>}
 */
function uniqueEvidence(evidence) {
  const seen = new Set();
  return evidence.filter((row) => {
    const identity = evidenceIdentity(row);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Deduplicate and sort the evidence rows of one finding.
 *
 * @param {Array<{ role: string, nodeId: string, sourceFile: string | null, line: number | null }>} evidence
 * @returns {Array<{ role: string, nodeId: string, sourceFile: string | null, line: number | null }>}
 */
function finalizeEvidence(evidence) {
  return sortEvidence(uniqueEvidence(evidence));
}

/**
 * The materials documented on the parts the check Intents return, keyed by
 * part seed node id. The part node carries the raw string (`material_raw`)
 * and the display name of its normalization key (`material_name`) that the
 * extract wrote, so Node and the browser read the same values from the same
 * seed without a new caller input.
 *
 * @param {Map<string, Array<Record<string, unknown>>>} rowsByName Intent rows.
 * @returns {Map<string, { nodeId: string, raw: string, name: string }>}
 */
function materialsByPartId(rowsByName) {
  /** @type {Map<string, { nodeId: string, raw: string, name: string }>} */
  const materials = new Map();
  for (const intentRows of rowsByName.values()) {
    for (const row of intentRows) {
      for (const value of Object.values(row)) {
        if (value === null || typeof value !== 'object') continue;
        const properties = value.properties;
        if (properties === null || typeof properties !== 'object') continue;
        const id = properties.id;
        if (typeof id !== 'string' || !id.startsWith('part:')) continue;
        const raw = properties.material_raw;
        if (typeof raw !== 'string' || raw === '') continue;
        const name = properties.material_name;
        if (typeof name !== 'string' || name === '') {
          throw new Error(`part node ${id} carries material_raw without material_name`);
        }
        materials.set(id, { nodeId: materialNodeId(materialKey(raw)), raw, name });
      }
    }
  }
  return materials;
}

/**
 * Attach the constructed SBOM evidence: for every part row the finding
 * already cites, one `material` row naming the material node that part
 * documents. The row adds no finding and cites no uncited part; its source
 * file is the citing part row's own page path (or `null` when that row has
 * none) and it claims no line number, because the material string lives in
 * the part page's frontmatter rather than on a numbered source line.
 *
 * @param {Array<{ role: string, nodeId: string, sourceFile: string | null, line: number | null }>} evidence
 * @param {Map<string, { nodeId: string, raw: string, name: string }>} materialOfPart
 * @returns {Array<Record<string, unknown>>}
 */
function attachMaterialEvidence(evidence, materialOfPart) {
  if (materialOfPart.size === 0) return evidence;
  const withMaterials = [...evidence];
  for (const row of evidence) {
    if (row.role !== 'part') continue;
    const material = materialOfPart.get(row.nodeId);
    if (!material) continue;
    withMaterials.push({
      nodeId: material.nodeId,
      role: 'material',
      sourceFile: row.sourceFile === undefined ? null : row.sourceFile,
      line: null,
      facts: {
        displayName: material.name,
        material: material.raw,
        partNodeId: row.nodeId,
      },
    });
  }
  return withMaterials;
}

/**
 * The machine-readable facts of the PreAssembly pages the executed check
 * Intents already loaded, keyed by page path. The values are the
 * `machine_readable` and `machine_readable_reason` properties the extract
 * wrote on the page, read verbatim from the Intent rows; nothing is derived
 * here and no new Intent runs, so a page no Intent row carries has no entry
 * and its evidence rows get no such facts rather than a guess. R5 evidence
 * already stores the same meaning as `machineReadableReason` and `pdfCount`.
 *
 * @param {Map<string, Array<Record<string, unknown>>>} rowsByName Intent rows.
 * @returns {Map<string, { machineReadable: boolean, machineReadableReason: unknown }>}
 */
function preAssemblyFactsByPath(rowsByName) {
  /** @type {Map<string, { machineReadable: boolean, machineReadableReason: unknown }>} */
  const pages = new Map();
  for (const intentRows of rowsByName.values()) {
    for (const row of intentRows) {
      for (const value of Object.values(row)) {
        if (value === null || typeof value !== 'object') continue;
        const properties = value.properties;
        if (properties === null || typeof properties !== 'object') continue;
        if (typeof properties.machine_readable !== 'boolean') continue;
        const path = properties.path;
        if (typeof path !== 'string' || path === '') continue;
        if (pages.has(path)) continue;
        pages.set(path, {
          machineReadable: properties.machine_readable,
          machineReadableReason: valueOrNull(properties.machine_readable_reason),
        });
      }
    }
  }
  return pages;
}

/**
 * The PreAssembly machine-readable facts of one R2 evidence row, or an empty
 * object. Only a `preassembly:` structure row or a `usage:preassembly:`
 * reference row carries them, and only when an executed Intent row loaded the
 * page they sit on, so a chapter, kit, bag or carton row is left unchanged.
 * The Accessory bag BOM section of a pre-assembly page cites the bag node as
 * its structure, so the reference row is matched through the shared page
 * path rather than through the structure node id.
 *
 * @param {string} nodeId The evidence row's seed node id.
 * @param {{ structure: Record<string, unknown>, usage: Record<string, unknown> }} entry
 * @param {Map<string, { machineReadable: boolean, machineReadableReason: unknown }>} factsByPath
 * @returns {Record<string, unknown>}
 */
function preAssemblyEvidenceFacts(nodeId, entry, factsByPath) {
  const isPreAssemblyRow =
    nodeId.startsWith('preassembly:') || nodeId.startsWith('usage:preassembly:');
  if (!isPreAssemblyRow) return {};
  const path = entry.structure.path;
  const page = typeof path === 'string' ? factsByPath.get(path) : undefined;
  if (!page) return {};
  return {
    machineReadable: page.machineReadable,
    machineReadableReason: page.machineReadableReason,
  };
}

/**
 * @param {Record<string, unknown>} part
 * @returns {number}
 */
function declaredVariantCount(part) {
  const standard = part.quantity_standard === null || part.quantity_standard === undefined ? 0 : 1;
  const xl = part.quantity_xl === null || part.quantity_xl === undefined ? 0 : 1;
  return standard + xl;
}

/**
 * Add one value to a map of sets.
 *
 * @param {Map<string, Set<string>>} map
 * @param {string} key
 * @param {string} value
 */
function addToSetMap(map, key, value) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Unique strings in code-unit order.
 *
 * @param {Iterable<string>} values
 * @returns {string[]}
 */
function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

/**
 * Read the check Intent files, compile each once, and execute it once.
 *
 * @param {CollectOptions} options
 * @returns {{ plans: Map<string, { file: string, intent: object, query: string, params: Record<string, unknown> }>, rows: Map<string, Array<Record<string, unknown>>> }}
 */
function runIntents(options) {
  const plans = new Map();
  for (const name of INTENT_FILES) {
    const intent = options.checks[name];
    if (!intent || typeof intent !== 'object') {
      throw new Error(`missing check Intent ${name}`);
    }
    const compiled = compileCheck(options.engine, options.ontology, intent);
    plans.set(name, {
      file: `farmbot/checks/${name}`,
      intent,
      query: compiled.query,
      params: compiled.params,
    });
  }

  const rows = new Map();
  for (const [name, plan] of plans) {
    const result = options.execute(plan.query, plan.params);
    if (!Array.isArray(result)) {
      throw new Error(`check Intent ${name} did not return a row array`);
    }
    if (typeof plan.intent.limit === 'number' && result.length >= plan.intent.limit) {
      throw new Error(
        `check Intent ${name} returned ${result.length} rows and reached its limit ${plan.intent.limit}`,
      );
    }
    rows.set(name, result);
  }
  return { plans, rows };
}

/**
 * Compile and execute every check Intent, evaluate R1-R9, and return the
 * findings document as plain data. The caller serializes it canonically.
 *
 * @param {CollectOptions} options
 * @returns {{
 *   format: string,
 *   seed: { digest: string, bytes: number },
 *   rules: Array<Record<string, unknown>>,
 *   findings: Array<Record<string, unknown>>,
 * }}
 */
export function collectFindings(options) {
  if (!options || typeof options !== 'object') throw new Error('collectFindings needs options');
  const { seed } = options;
  if (!seed || typeof seed.digest !== 'string' || !Number.isInteger(seed.bytes)) {
    throw new Error('collectFindings needs the seed digest and byte length');
  }
  if (typeof options.execute !== 'function') throw new Error('collectFindings needs execute');

  const { plans, rows } = runIntents(options);

  // The SBOM evidence is attached on the shared path below, so every rule gets
  // it the same way in Node and in the browser.
  const materialOfPart = materialsByPartId(rows);

  // The PreAssembly machine-readable facts are read the same way: the values
  // come from the Intent rows the run already executed, so Node and the
  // browser attach identical facts before dedupe and sort.
  const preAssemblyFacts = preAssemblyFactsByPath(rows);

  /**
   * Every finding's evidence passes through here: the material rows are
   * attached to the ordinary rows first, then the whole set is deduplicated
   * and sorted, so the material rows land in the same order everywhere.
   *
   * @param {Array<Record<string, unknown>>} evidence
   */
  const finalize = (evidence) =>
    finalizeEvidence(attachMaterialEvidence(evidence, materialOfPart));

  /**
   * @param {string} nodeId
   * @returns {string | null}
   */
  const sourceOf = (nodeId) => {
    const sources = options.sources;
    if (!sources) return null;
    if (sources instanceof Map) return sources.get(nodeId) ?? null;
    return Object.prototype.hasOwnProperty.call(sources, nodeId) ? sources[nodeId] : null;
  };

  /** @param {string} ruleId */
  const ruleOf = (ruleId) => {
    const rule = CHECKS.find((candidate) => candidate.id === ruleId);
    if (!rule) throw new Error(`unknown rule ${ruleId}`);
    return rule;
  };

  const queryFor = (rule) =>
    rule.intents
      .map((name) => plans.get(name))
      .sort((left, right) => compareText(left.file, right.file))
      .map((plan) => ({
        cypher: plan.query,
        intent: plan.file,
        params: plan.params,
      }));

  // All resolved references, one entry per usage line.
  const references = [];
  for (const [kind, name] of Object.entries(REFERENCE_INTENTS)) {
    for (const row of rows.get(name)) {
      references.push({
        kind,
        structure: nodeProperties(row.structure),
        usage: nodeProperties(row.usage),
        part: nodeProperties(row.part),
      });
    }
  }

  // Reference rows are still indexed to build evidence and causes. Membership
  // for R3, R4, R7 and R8 comes from the `not_exists` Intents, not from these
  // maps, so no reference set is subtracted here.
  /** @type {Map<string, Array<typeof references[number]>>} */
  const referencesByPart = new Map();
  /** @type {Map<string, Set<string>>} */
  const allStructuresByPart = new Map();
  /** @type {Map<string, Set<string>>} */
  const packingStructuresByPart = new Map();
  for (const reference of references) {
    const partName = reference.part.name;
    if (typeof partName !== 'string') throw new Error('reference row has no part name');
    let list = referencesByPart.get(partName);
    if (!list) {
      list = [];
      referencesByPart.set(partName, list);
    }
    list.push(reference);
    addToSetMap(allStructuresByPart, partName, reference.structure.id);
    if (PACKING_INTENTS.includes(REFERENCE_INTENTS[reference.kind])) {
      addToSetMap(packingStructuresByPart, partName, reference.structure.id);
    }
  }

  // Service references are kept apart from `references`: R3 and R4 count the
  // process and packing documents only, while R6-R9 read the service pages.
  const serviceReferences = rows.get('refs-service.json').map((row) => ({
    structure: nodeProperties(row.structure),
    usage: nodeProperties(row.usage),
    part: nodeProperties(row.part),
  }));

  /** @type {Array<Record<string, unknown>>} */
  const findings = [];

  // R5 first: its page list is a cause candidate in every R3 and R4 finding.
  const r5Rows = rows.get('r5-unreadable-preassemblies.json');
  const r5Pages = r5Rows
    .map((row) => nodeProperties(row.page))
    .sort((left, right) => compareText(left.path ?? '', right.path ?? ''));
  const r5Paths = r5Pages.map((page) => page.path ?? '');

  for (const page of r5Pages) {
    const subjectKey = page.path ?? page.id;
    findings.push({
      causes: unreadablePageCauses({
        path: page.path ?? '',
        reason: page.machine_readable_reason ?? 'no reason recorded',
        pdfCount: page.pdf_count ?? 0,
      }),
      countermeasures: unreadablePageCountermeasures({ path: page.path ?? '' }),
      evidence: finalize([
        {
          nodeId: page.id,
          role: 'pre-assembly-page',
          sourceFile: page.path ?? sourceOf(page.id),
          line: null,
          facts: {
            machineReadableReason: valueOrNull(page.machine_readable_reason),
            pdfCount: valueOrNull(page.pdf_count),
            title: valueOrNull(page.title),
          },
        },
      ]),
      queries: queryFor(ruleOf('R5')),
      rule: 'R5',
      severityFactors: {
        overlap: 0,
        processesReached: 1,
        productVariantsReached: 0,
        quantityDifference: 0,
      },
      subject: {
        key: subjectKey,
        kind: 'pre-assembly-page',
        label: page.title ?? subjectKey,
        nodeId: page.id,
      },
      summary: `The pre-assembly page ${page.path ?? subjectKey} has no machine-readable parts table.`,
    });
  }

  // R1: one finding per QuantityDifference row.
  const comparisons = new Map();
  for (const row of rows.get('r1-quantity-difference.json')) {
    const difference = nodeProperties(row.difference);
    const part = nodeProperties(row.part);
    comparisons.set(difference.id, { difference, part });
  }
  for (const row of rows.get('r1-compared-in.json')) {
    const difference = nodeProperties(row.difference);
    const entry = comparisons.get(difference.id);
    if (entry) entry.container = nodeProperties(row.container);
  }
  for (const row of rows.get('r1-for-variant.json')) {
    const difference = nodeProperties(row.difference);
    const entry = comparisons.get(difference.id);
    if (entry) entry.variant = nodeProperties(row.variant);
  }
  /** @type {Map<string, Set<string>>} */
  const variantCodesByPart = new Map();
  for (const entry of comparisons.values()) {
    const code = entry.variant?.code;
    if (typeof code === 'string') addToSetMap(variantCodesByPart, entry.part.name, code);
  }
  for (const entry of [...comparisons.values()].sort((left, right) =>
    compareText(left.difference.id, right.difference.id),
  )) {
    const { difference, part, container, variant } = entry;
    const variantCode = typeof variant?.code === 'string' ? variant.code : 'unspecified';
    const quantityDifference = Number(difference.packing_minus_part);
    const file = container?.path ?? '';
    const packingLines = (referencesByPart.get(part.name) ?? []).filter(
      (reference) =>
        (reference.kind === 'kit' || reference.kind === 'carton') &&
        reference.structure.id === container?.id,
    );
    const evidence = [
      {
        nodeId: difference.id,
        role: 'quantity-difference',
        sourceFile: file === '' ? null : file,
        line: null,
        facts: {
          packingQuantity: valueOrNull(difference.packing_quantity),
          partQuantity: valueOrNull(difference.part_quantity),
          quantityDifference: valueOrNull(difference.packing_minus_part),
          version: variantCode,
        },
      },
      {
        nodeId: part.id,
        role: 'part',
        sourceFile: sourceOf(part.id),
        line: null,
        facts: { name: part.name },
      },
    ];
    for (const line of packingLines) {
      evidence.push({
        nodeId: line.usage.id,
        role: 'packing-line',
        sourceFile: line.structure.path ?? null,
        line: valueOrNull(line.usage.line_number),
        facts: {
          displayName: valueOrNull(line.usage.display_name),
          quantity: valueOrNull(line.usage.quantity),
        },
      });
    }
    findings.push({
      causes: quantityCauses({
        file,
        partName: part.name,
        variantCode,
        packingQuantity: Number(difference.packing_quantity),
        partQuantity: Number(difference.part_quantity),
        quantityDifference,
      }),
      countermeasures: quantityCountermeasures({ partName: part.name, variantCode }),
      evidence: finalize(evidence),
      queries: queryFor(ruleOf('R1')),
      rule: 'R1',
      severityFactors: {
        overlap: 0,
        processesReached: allStructuresByPart.get(part.name)?.size ?? 0,
        productVariantsReached: variantCodesByPart.get(part.name)?.size ?? 0,
        quantityDifference: Math.abs(quantityDifference),
      },
      subject: {
        key: `${part.name} ${variantCode}`,
        kind: 'quantity-difference',
        label: `${part.name} (${variantCode})`,
        nodeId: part.id,
      },
      summary:
        `The packing list on ${file} and the part page for ${part.name} ` +
        `disagree by ${quantityDifference} for ${variantCode}.`,
    });
  }

  // R2: one finding per unresolved display name.
  /** @type {Map<string, Array<{ structure: Record<string, unknown>, usage: Record<string, unknown>, kind: string }>>} */
  const unresolvedByName = new Map();
  for (const [name, kind] of [
    ['r2-assembly-unmatched.json', 'assembly'],
    ['r2-manufacturing-unmatched.json', 'manufacturing'],
  ]) {
    for (const row of rows.get(name)) {
      const structure = nodeProperties(row.structure);
      const usage = nodeProperties(row.usage);
      const displayName = typeof usage.display_name === 'string' ? usage.display_name : usage.id;
      let list = unresolvedByName.get(displayName);
      if (!list) {
        list = [];
        unresolvedByName.set(displayName, list);
      }
      list.push({ structure, usage, kind });
    }
  }
  for (const [displayName, list] of [...unresolvedByName.entries()].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const structures = new Set(list.map((entry) => entry.structure.id));
    const evidence = [];
    for (const entry of list) {
      evidence.push({
        nodeId: entry.structure.id,
        role: 'structure',
        sourceFile: entry.structure.path ?? null,
        line: null,
        facts: {
          ...preAssemblyEvidenceFacts(String(entry.structure.id ?? ''), entry, preAssemblyFacts),
          structureKind: entry.kind,
          title: valueOrNull(entry.structure.title),
        },
      });
      evidence.push({
        nodeId: entry.usage.id,
        role: 'reference',
        sourceFile: entry.structure.path ?? null,
        line: valueOrNull(entry.usage.line_number),
        facts: {
          displayName,
          ...preAssemblyEvidenceFacts(String(entry.usage.id ?? ''), entry, preAssemblyFacts),
          matchMethod: valueOrNull(entry.usage.match_method),
        },
      });
    }
    findings.push({
      causes: unresolvedReferenceCauses({
        displayName,
        lineCount: list.length,
        structureCount: structures.size,
      }),
      countermeasures: unresolvedReferenceCountermeasures({ displayName }),
      evidence: finalize(evidence),
      queries: queryFor(ruleOf('R2')),
      rule: 'R2',
      severityFactors: {
        overlap: 0,
        processesReached: structures.size,
        productVariantsReached: 0,
        quantityDifference: 0,
      },
      subject: { key: displayName, kind: 'unresolved-name', label: displayName, nodeId: null },
      summary: `"${displayName}" appears on ${list.length} reference line(s) and resolves to no part.`,
    });
  }

  // R3: parts with no reference at all. The membership Intent already excludes
  // every part that an assembly chapter, pre-assembly, bag, kit or the carton
  // references, so the rows are the finding set.
  const parts = rows
    .get('r3-parts-without-reference.json')
    .map((row) => nodeProperties(row.part))
    .sort((left, right) => compareText(left.id, right.id));
  for (const part of parts) {
    findings.push({
      causes: unreferencedPartCauses({
        categorySlug: part.category_slug ?? '',
        partName: part.name,
        r5Paths,
      }),
      countermeasures: unreferencedPartCountermeasures({ partName: part.name }),
      evidence: finalize([
        {
          nodeId: part.id,
          role: 'part',
          sourceFile: sourceOf(part.id),
          line: null,
          facts: {
            categorySlug: valueOrNull(part.category_slug),
            name: part.name,
            slug: valueOrNull(part.slug),
          },
        },
      ]),
      queries: queryFor(ruleOf('R3')),
      rule: 'R3',
      severityFactors: {
        overlap: 0,
        processesReached: 0,
        productVariantsReached: declaredVariantCount(part),
        quantityDifference: 0,
      },
      subject: { key: part.name, kind: 'part', label: part.name, nodeId: part.id },
      summary: `${part.name} is referenced by no assembly chapter, pre-assembly, bag or packing list.`,
    });
  }

  // R4: parts packed but absent from process documentation. Kit and carton
  // have no common packing-only superclass, so two `not_exists` Intents state
  // the union: packed in a kit or the carton, and absent from assembly,
  // pre-assembly and bag. Their rows are the finding set; the packing reference
  // rows still supply the evidence below.
  /** @type {Map<string, Record<string, unknown>>} */
  const packedPartsByName = new Map();
  for (const name of ['r4-kit-parts-without-process.json', 'r4-carton-parts-without-process.json']) {
    for (const row of rows.get(name)) {
      const part = nodeProperties(row.part);
      if (typeof part.name !== 'string') continue;
      packedPartsByName.set(part.name, part);
    }
  }
  const packedParts = [...packedPartsByName.values()].sort((left, right) =>
    compareText(/** @type {string} */ (left.id), /** @type {string} */ (right.id)),
  );
  for (const part of packedParts) {
    const packingLines = (referencesByPart.get(part.name) ?? []).filter(
      (reference) => reference.kind === 'kit' || reference.kind === 'carton',
    );
    const files = [...new Set(packingLines.map((line) => line.structure.path ?? ''))].sort(
      compareText,
    );
    const evidence = [
      {
        nodeId: part.id,
        role: 'part',
        sourceFile: sourceOf(part.id),
        line: null,
        facts: {
          categorySlug: valueOrNull(part.category_slug),
          name: part.name,
          slug: valueOrNull(part.slug),
        },
      },
    ];
    for (const line of packingLines) {
      evidence.push({
        nodeId: line.structure.id,
        role: 'packing-structure',
        sourceFile: line.structure.path ?? null,
        line: null,
        facts: { title: valueOrNull(line.structure.title) },
      });
      evidence.push({
        nodeId: line.usage.id,
        role: 'packing-line',
        sourceFile: line.structure.path ?? null,
        line: valueOrNull(line.usage.line_number),
        facts: {
          displayName: valueOrNull(line.usage.display_name),
          quantity: valueOrNull(line.usage.quantity),
        },
      });
    }
    findings.push({
      causes: packedWithoutProcessCauses({ files, partName: part.name, r5Paths }),
      countermeasures: packedWithoutProcessCountermeasures({ partName: part.name }),
      evidence: finalize(evidence),
      queries: queryFor(ruleOf('R4')),
      rule: 'R4',
      severityFactors: {
        overlap: 0,
        processesReached: packingStructuresByPart.get(part.name)?.size ?? 0,
        productVariantsReached: declaredVariantCount(part),
        quantityDifference: 0,
      },
      subject: { key: part.name, kind: 'part', label: part.name, nodeId: part.id },
      summary: `${part.name} is packed on ${files.join(', ')} but no assembly chapter or pre-assembly references it.`,
    });
  }

  // ---------------------------------------------------------------------
  // R6-R9: Change Log and service-page rules.

  const changes = rows
    .get('r6-changes.json')
    .map((row) => nodeProperties(row.change))
    .sort((left, right) => compareText(String(left.id), String(right.id)));
  const changeById = new Map(changes.map((change) => [change.id, change]));
  const changedPartRows = rows
    .get('changed-parts.json')
    .map((row) => ({ change: nodeProperties(row.change), part: nodeProperties(row.part) }))
    .sort((left, right) => compareText(String(left.part.id), String(right.part.id)));

  // Every display name a packing or service page writes, resolved or not. The
  // role is the page kind; the structure and usage nodes carry the citation.
  /** @type {Array<{ displayName: string, resolvedPart: string | null, channel: 'packing' | 'service', structure: Record<string, unknown>, usage: Record<string, unknown> }>} */
  const downstreamRecords = [];
  for (const reference of references) {
    if (!['bag', 'kit', 'carton'].includes(reference.kind)) continue;
    if (isAccessoryBagReference(reference)) continue;
    if (typeof reference.usage.display_name !== 'string') continue;
    downstreamRecords.push({
      displayName: reference.usage.display_name,
      resolvedPart:
        typeof reference.part.name === 'string' ? reference.part.name : null,
      channel: 'packing',
      structure: reference.structure,
      usage: reference.usage,
    });
  }
  for (const row of rows.get('r2-manufacturing-unmatched.json')) {
    const structure = nodeProperties(row.structure);
    const usage = nodeProperties(row.usage);
    if (!isPackingManufacturingRow(structure, usage)) continue;
    if (typeof usage.display_name !== 'string') continue;
    downstreamRecords.push({
      displayName: usage.display_name,
      resolvedPart: null,
      channel: 'packing',
      structure,
      usage,
    });
  }
  for (const reference of serviceReferences) {
    if (typeof reference.usage.display_name !== 'string') continue;
    downstreamRecords.push({
      displayName: reference.usage.display_name,
      resolvedPart: typeof reference.part.name === 'string' ? reference.part.name : null,
      channel: 'service',
      structure: reference.structure,
      usage: reference.usage,
    });
  }
  for (const row of rows.get('r9-service-unmatched.json')) {
    const structure = nodeProperties(row.structure);
    const usage = nodeProperties(row.usage);
    if (typeof usage.display_name !== 'string') continue;
    downstreamRecords.push({
      displayName: usage.display_name,
      resolvedPart: null,
      channel: 'service',
      structure,
      usage,
    });
  }

  /**
   * @param {typeof downstreamRecords[number]} record
   * @returns {Array<Record<string, unknown>>}
   */
  const downstreamEvidence = (record) => {    if (record.channel === 'packing') {
      return [
        {
          nodeId: record.structure.id,
          role: 'packing-structure',
          sourceFile: record.structure.path ?? null,
          line: null,
          facts: { title: valueOrNull(record.structure.title) },
        },
        {
          nodeId: record.usage.id,
          role: 'packing-line',
          sourceFile: record.structure.path ?? null,
          line: valueOrNull(record.usage.line_number),
          facts: {
            displayName: valueOrNull(record.usage.display_name),
            matchMethod: valueOrNull(record.usage.match_method),
            quantity: valueOrNull(record.usage.quantity),
            resolvedPart: valueOrNull(record.resolvedPart),
          },
        },
      ];
    }
    return [
      {
        nodeId: record.structure.id,
        role: 'service',
        sourceFile: record.structure.path ?? null,
        line: null,
        facts: {
          kind: valueOrNull(record.structure.kind),
          title: valueOrNull(record.structure.title),
        },
      },
      {
        nodeId: record.usage.id,
        role: 'reference',
        sourceFile: record.structure.path ?? null,
        line: valueOrNull(record.usage.line_number),
        facts: {
          displayName: valueOrNull(record.usage.display_name),
          matchMethod: valueOrNull(record.usage.match_method),
          resolvedPart: valueOrNull(record.resolvedPart),
          sourceKind: 'service',
        },
      },
    ];
  };

  /**
   * The DesignChange nodes that link one part.
   *
   * @param {Array<{ change: Record<string, unknown>, part: Record<string, unknown> }>} rows
   * @param {Map<string, Record<string, unknown>>} byId
   * @param {string} partName
   * @returns {Array<Record<string, unknown>>}
   */
  const changeNodesForPart = (entries, byId, partName) => {
    const ids = [];
    for (const entry of entries) {
      if (entry.part.name !== partName) continue;
      const id = /** @type {string} */ (entry.change.id);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids
      .map((id) => byId.get(id))
      .filter((change) => change !== undefined)
      .sort((left, right) => compareText(String(left.id), String(right.id)));
  };

  /**
   * @param {Record<string, unknown>} change
   * @returns {Record<string, unknown>}
   */
  const changeEvidence = (change) => ({
    nodeId: change.id,
    role: 'design-change',
    sourceFile: change.path ?? null,
    line: valueOrNull(change.line),
    facts: {
      section: valueOrNull(change.section),
      text: valueOrNull(change.text),
    },
  });

  // R6: a Change Log name still appears on a packing or service page. A linked
  // name is a fact; a removal statement matched by normalized name is inferred.
  const changeMatches = matchChangeNames({
    changes: changes.map((change) => ({
      id: /** @type {string} */ (change.id),
      text: /** @type {string} */ (change.text ?? ''),
    })),
    changedParts: changedPartRows.map((entry) => ({
      changeId: /** @type {string} */ (entry.change.id),
      partId: /** @type {string} */ (entry.part.id),
      partName: /** @type {string} */ (entry.part.name),
    })),
    downstream: downstreamRecords,
  });
  for (const match of changeMatches) {
    if (match.downstreamIndexes.length === 0) continue;
    const records = match.downstreamIndexes.map((index) => downstreamRecords[index]);
    const changeNodes = match.changeIds
      .map((id) => changeById.get(id))
      .filter((change) => change !== undefined)
      .sort((left, right) => compareText(String(left.id), String(right.id)));
    const part = match.partName
      ? changedPartRows.find((entry) => entry.part.name === match.partName)?.part
      : undefined;
    const files = sortedUnique(
      records
        .map((record) => record.structure.path)
        .filter((path) => typeof path === 'string' && path !== ''),
    );
    const sections = sortedUnique(
      changeNodes.map((change) => String(change.section ?? '')).filter((text) => text !== ''),
    );
    /** @type {Array<Record<string, unknown>>} */
    const evidence = [];
    for (const change of changeNodes) {
      evidence.push({
        nodeId: change.id,
        role: 'design-change',
        sourceFile: change.path ?? null,
        line: valueOrNull(change.line),
        facts: {
          section: valueOrNull(change.section),
          text: valueOrNull(change.text),
        },
      });
    }
    if (part) {
      evidence.push({
        nodeId: part.id,
        role: 'part',
        sourceFile: sourceOf(/** @type {string} */ (part.id)),
        line: null,
        facts: {
          categorySlug: valueOrNull(part.category_slug),
          name: part.name,
          slug: valueOrNull(part.slug),
        },
      });
    }
    for (const record of records) evidence.push(...downstreamEvidence(record));

    const name = match.inferred ? match.displayName : match.partName ?? match.displayName;
    const still = files.length === 1 ? 'still lists it' : 'still list it';
    findings.push({
      causes: changedNameCauses({ files, inferred: match.inferred, name, sections }),
      countermeasures: changedNameCountermeasures({ files, name }),
      evidence: finalize(evidence),
      inferred: match.inferred,
      queries: queryFor(ruleOf('R6')),
      rule: 'R6',
      severityFactors: {
        overlap: 0,
        processesReached: new Set(records.map((record) => record.structure.id)).size,
        productVariantsReached: match.inferred || !part ? 0 : declaredVariantCount(part),
        quantityDifference: 0,
      },
      subject: match.inferred
        ? { key: match.key, kind: 'name', label: match.displayName, nodeId: null }
        : {
            key: /** @type {string} */ (match.partName),
            kind: 'part',
            label: /** @type {string} */ (match.partName),
            nodeId: part ? part.id : null,
          },
      summary: match.inferred
        ? `The Change Log removal statement names "${match.displayName}", but ${files.join(', ')} ${still}.`
        : `The Change Log links "${match.partName}", but ${files.join(', ')} ${still}.`,
    });
  }

  // R7: a changed part that reaches no assembly chapter, pre-assembly, packing
  // list or service page. The membership Intent states that absence with
  // `not_exists`; the changed-part rows still supply the design-change and part
  // evidence. R5 pages and unresolved names are cause candidates.
  /** @type {Map<string, Set<string>>} */
  const unresolvedByPart = new Map();
  for (const row of rows.get('unmatched-candidates.json')) {
    const unmatched = nodeProperties(row.unmatched);
    const part = nodeProperties(row.part);
    if (typeof unmatched.display_name !== 'string' || typeof part.name !== 'string') continue;
    addToSetMap(unresolvedByPart, part.name, unmatched.display_name);
  }
  /** @type {Set<string>} */
  const unreachedPartNames = new Set();
  for (const row of rows.get('r7-changed-parts-unreached.json')) {
    const part = nodeProperties(row.part);
    if (typeof part.name === 'string') unreachedPartNames.add(part.name);
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const changedPartsByName = new Map();
  for (const entry of changedPartRows) {
    const name = /** @type {string} */ (entry.part.name);
    if (!changedPartsByName.has(name)) changedPartsByName.set(name, entry.part);
  }
  for (const part of [...changedPartsByName.values()].sort((left, right) =>
    compareText(String(left.id), String(right.id)),
  )) {
    const partName = /** @type {string} */ (part.name);
    if (!unreachedPartNames.has(partName)) continue;
    const partChanges = changeNodesForPart(changedPartRows, changeById, partName);
    const evidence = [...partChanges.map((change) => changeEvidence(change))];
    evidence.push({
      nodeId: part.id,
      role: 'part',
      sourceFile: sourceOf(/** @type {string} */ (part.id)),
      line: null,
      facts: {
        categorySlug: valueOrNull(part.category_slug),
        name: part.name,
        slug: valueOrNull(part.slug),
      },
    });
    const unresolvedNames = sortedUnique(unresolvedByPart.get(partName) ?? []);
    findings.push({
      causes: changedPartUnreachedCauses({ partName, r5Paths, unresolvedNames }),
      countermeasures: changedPartUnreachedCountermeasures({ partName }),
      evidence: finalize(evidence),
      inferred: false,
      queries: queryFor(ruleOf('R7')),
      rule: 'R7',
      severityFactors: {
        overlap: 0,
        processesReached: 0,
        productVariantsReached: declaredVariantCount(part),
        quantityDifference: 0,
      },
      subject: { key: partName, kind: 'part', label: partName, nodeId: part.id },
      summary: `${partName} changed in the Change Log but reaches no assembly chapter, pre-assembly, packing list or service page.`,
    });
  }

  // R8: a part named by a service page that no assembly chapter, pre-assembly or
  // bag references. The membership Intent states that absence with `not_exists`;
  // the service rows still supply the service page evidence. A packed part and a
  // part referenced by nothing are the two shapes the rule reports.
  /** @type {Set<string>} */
  const serviceOnlyPartNames = new Set();
  for (const row of rows.get('r8-service-parts-without-process.json')) {
    const part = nodeProperties(row.part);
    if (typeof part.name === 'string') serviceOnlyPartNames.add(part.name);
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const servicePartByName = new Map();
  for (const reference of serviceReferences) {
    const name = /** @type {string} */ (reference.part.name);
    if (!serviceOnlyPartNames.has(name)) continue;
    if (!servicePartByName.has(name)) servicePartByName.set(name, reference.part);
  }
  for (const part of [...servicePartByName.values()].sort((left, right) =>
    compareText(String(left.id), String(right.id)),
  )) {
    const partName = /** @type {string} */ (part.name);
    const serviceRows = serviceReferences
      .filter((reference) => reference.part.name === partName)
      .sort((left, right) => compareText(String(left.structure.id), String(right.structure.id)));
    const packedRows = (referencesByPart.get(partName) ?? [])
      .filter((reference) => PACKING_INTENTS.includes(REFERENCE_INTENTS[reference.kind]))
      .sort((left, right) => compareText(String(left.structure.id), String(right.structure.id)));
    const evidence = [
      {
        nodeId: part.id,
        role: 'part',
        sourceFile: sourceOf(/** @type {string} */ (part.id)),
        line: null,
        facts: {
          categorySlug: valueOrNull(part.category_slug),
          name: part.name,
          slug: valueOrNull(part.slug),
        },
      },
    ];
    for (const reference of serviceRows) {
      evidence.push(
        ...downstreamEvidence({
          channel: 'service',
          displayName: String(reference.usage.display_name ?? ''),
          resolvedPart: partName,
          structure: reference.structure,
          usage: reference.usage,
        }),
      );
    }
    for (const reference of packedRows) {
      evidence.push(
        ...downstreamEvidence({
          channel: 'packing',
          displayName: String(reference.usage.display_name ?? ''),
          resolvedPart: partName,
          structure: reference.structure,
          usage: reference.usage,
        }),
      );
    }
    const servicePages = sortedUnique(
      serviceRows
        .map((reference) => reference.structure.path)
        .filter((path) => typeof path === 'string' && path !== ''),
    );
    const packedFiles = sortedUnique(
      packedRows
        .map((reference) => reference.structure.path)
        .filter((path) => typeof path === 'string' && path !== ''),
    );
    findings.push({
      causes: serviceOnlyPartCauses({
        packedFiles,
        partName,
        r5Paths,
        servicePages,
        unreferenced: !packingStructuresByPart.has(partName),
      }),
      countermeasures: serviceOnlyPartCountermeasures({ partName }),
      evidence: finalize(evidence),
      inferred: false,
      queries: queryFor(ruleOf('R8')),
      rule: 'R8',
      severityFactors: {
        overlap: 0,
        processesReached: new Set([
          ...serviceRows.map((reference) => reference.structure.id),
          ...packedRows.map((reference) => reference.structure.id),
        ]).size,
        productVariantsReached: declaredVariantCount(part),
        quantityDifference: 0,
      },
      subject: { key: partName, kind: 'part', label: partName, nodeId: part.id },
      summary: `${partName} is named on ${servicePages.join(', ')} but no assembly chapter or pre-assembly references it.`,
    });
  }

  // R9: an unresolved service-page reference, with the candidate parts the
  // extract recorded and the packing or assembly pages that use the same name.
  /** @type {Map<string, Set<string>>} */
  const candidatesByNormalized = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const candidatePartsByName = new Map();
  for (const row of rows.get('unmatched-candidates.json')) {
    const unmatched = nodeProperties(row.unmatched);
    const part = nodeProperties(row.part);
    if (typeof unmatched.display_name !== 'string' || typeof part.name !== 'string') continue;
    addToSetMap(candidatesByNormalized, normalizeName(unmatched.display_name), part.name);
    if (!candidatePartsByName.has(part.name)) candidatePartsByName.set(part.name, part);
  }
  /** @type {Map<string, Set<string>>} */
  const unresolvedFilesByNormalized = new Map();
  for (const [displayName, list] of unresolvedByName) {
    for (const entry of list) {
      const path = entry.structure.path;
      if (typeof path !== 'string' || path === '') continue;
      addToSetMap(unresolvedFilesByNormalized, normalizeName(displayName), path);
    }
  }
  /** @type {Map<string, Array<{ structure: Record<string, unknown>, usage: Record<string, unknown> }>>} */
  const unresolvedServiceByName = new Map();
  for (const row of rows.get('r9-service-unmatched.json')) {
    const structure = nodeProperties(row.structure);
    const usage = nodeProperties(row.usage);
    const displayName =
      typeof usage.display_name === 'string' ? usage.display_name : String(usage.id);
    let list = unresolvedServiceByName.get(displayName);
    if (!list) {
      list = [];
      unresolvedServiceByName.set(displayName, list);
    }
    list.push({ structure, usage });
  }
  for (const [displayName, list] of [...unresolvedServiceByName.entries()].sort(
    ([left], [right]) => compareText(left, right),
  )) {
    const candidates = sortedUnique(candidatesByNormalized.get(normalizeName(displayName)) ?? []);
    const r2Names = sortedUnique(
      unresolvedFilesByNormalized.get(normalizeName(displayName)) ?? [],
    );
    const evidence = [];
    for (const entry of list) evidence.push(...downstreamEvidence({
      channel: 'service',
      displayName,
      resolvedPart: null,
      structure: entry.structure,
      usage: entry.usage,
    }));
    for (const candidate of candidates) {
      const part = candidatePartsByName.get(candidate);
      if (!part) continue;
      evidence.push({
        nodeId: part.id,
        role: 'part',
        sourceFile: sourceOf(/** @type {string} */ (part.id)),
        line: null,
        facts: {
          candidate: true,
          categorySlug: valueOrNull(part.category_slug),
          name: candidate,
          slug: valueOrNull(part.slug),
        },
      });
    }
    const pages = sortedUnique(
      list
        .map((entry) => entry.structure.path)
        .filter((path) => typeof path === 'string' && path !== ''),
    );
    const pageText = pages.join(', ');
    findings.push({
      causes: unresolvedServiceCauses({ candidates, displayName, pages, r2Names }),
      countermeasures: unresolvedServiceCountermeasures({ displayName, pages }),
      evidence: finalize(evidence),
      inferred: false,
      queries: queryFor(ruleOf('R9')),
      rule: 'R9',
      severityFactors: {
        overlap: 0,
        processesReached: new Set(list.map((entry) => entry.structure.id)).size,
        productVariantsReached: 0,
        quantityDifference: 0,
      },
      subject: { key: displayName, kind: 'unresolved-name', label: displayName, nodeId: null },
      summary: `"${displayName}" appears on ${pageText} and resolves to no part.`,
    });
  }

  // Every finding states whether its name match is a fact or an inference.
  // Only R6 can be inferred; the other rules copy values or subtract sets.
  for (const finding of findings) {
    if (typeof finding.inferred !== 'boolean') finding.inferred = false;
  }

  // Overlap: the number of other findings with the same subject node id. A
  // part compared for both product variants has two findings on the same part,
  // so both carry overlap 1; R2 subjects are display names and have no node.
  /** @type {Map<string, number[]>} */
  const owners = new Map();
  for (const [index, finding] of findings.entries()) {
    const subjectNodeId = /** @type {{ nodeId: string | null }} */ (finding.subject).nodeId;
    if (typeof subjectNodeId !== 'string') continue;
    let list = owners.get(subjectNodeId);
    if (!list) {
      list = [];
      owners.set(subjectNodeId, list);
    }
    list.push(index);
  }
  for (const [index, finding] of findings.entries()) {
    const subjectNodeId = /** @type {{ nodeId: string | null }} */ (finding.subject).nodeId;
    const peers = typeof subjectNodeId === 'string' ? (owners.get(subjectNodeId) ?? []) : [];
    /** @type {{ overlap: number }} */ (finding.severityFactors).overlap = Math.max(
      peers.length - 1,
      0,
    );
  }

  // Severity and ids.
  const ids = assignFindingIds(
    findings.map((finding) => ({
      rule: /** @type {string} */ (finding.rule),
      key: /** @type {{ key: string }} */ (finding.subject).key,
    })),
  );
  for (const finding of findings) {
    const factors = /** @type {import('./severity.mjs').SeverityFactors} */ (
      finding.severityFactors
    );
    const severity = evaluateSeverity(/** @type {string} */ (finding.rule), factors);
    const id = ids.get(
      findingSubjectKey(
        /** @type {string} */ (finding.rule),
        /** @type {{ key: string }} */ (finding.subject).key,
      ),
    );
    if (typeof id !== 'string') throw new Error(`no finding id for ${finding.rule}`);
    finding.id = id;
    finding.severity = severity.level;
    finding.severityScore = severity.score;
  }
  findings.sort((left, right) => compareText(String(left.id), String(right.id)));

  const rules = CHECKS.map((rule) => {
    const selected = findings.filter((finding) => finding.rule === rule.id);
    /** @type {Record<string, number>} */
    const severityCounts = {};
    for (const level of SEVERITY_LEVELS) severityCounts[level] = 0;
    for (const finding of selected) severityCounts[String(finding.severity)] += 1;
    return {
      direction: rule.direction,
      findingCount: selected.length,
      id: rule.id,
      intents: [...rule.intents],
      severityCounts,
      title: rule.title,
    };
  });

  return {
    format: 'farmbot-findings-v1',
    seed: { bytes: seed.bytes, digest: seed.digest },
    rules,
    findings,
  };
}
