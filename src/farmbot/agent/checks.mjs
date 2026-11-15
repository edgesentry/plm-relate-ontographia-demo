// Check rule table for the FarmBot check engine.
//
// Each rule names the check Intents under farmbot/checks/ that feed it. A rule
// may use several Intents because the Intent schema describes one linear
// traversal chain per file; the rule module joins the rows on seed node ids.
//
// The Intent files are read by the caller and passed to `collectFindings`, so
// this module stays free of filesystem access and runs unchanged in Node and
// in the browser.

/**
 * @typedef {'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9'} RuleId
 * @typedef {{
 *   id: RuleId,
 *   direction: string,
 *   title: string,
 *   intents: readonly string[],
 * }} CheckRule
 */

/** @type {readonly CheckRule[]} */
export const CHECKS = Object.freeze([
  Object.freeze({
    id: 'R1',
    direction: 'packing-to-design',
    title: 'Packing quantity differs from the part page quantity',
    intents: Object.freeze([
      'r1-quantity-difference.json',
      'r1-compared-in.json',
      'r1-for-variant.json',
    ]),
  }),
  Object.freeze({
    id: 'R2',
    direction: 'process-to-design',
    title: 'A reference in process documentation does not resolve to a part',
    intents: Object.freeze([
      'r2-assembly-unmatched.json',
      'r2-manufacturing-unmatched.json',
    ]),
  }),
  Object.freeze({
    id: 'R3',
    direction: 'design-to-process',
    title: 'A part is referenced by no process',
    intents: Object.freeze([
      'r3-parts.json',
      'refs-assembly.json',
      'refs-preassembly.json',
      'refs-bag.json',
      'refs-kit.json',
      'refs-carton.json',
    ]),
  }),
  Object.freeze({
    id: 'R4',
    direction: 'packing-to-process',
    title: 'A part is packed but not referenced by an assembly chapter or pre-assembly',
    intents: Object.freeze([
      'refs-assembly.json',
      'refs-preassembly.json',
      'refs-bag.json',
      'refs-kit.json',
      'refs-carton.json',
    ]),
  }),
  Object.freeze({
    id: 'R5',
    direction: 'all-to-document',
    title: 'A pre-assembly page has no machine-readable parts table',
    intents: Object.freeze(['r5-unreadable-preassemblies.json']),
  }),
  Object.freeze({
    id: 'R6',
    direction: 'design-to-packing-service',
    title: 'A name changed or removed in the Change Log still appears in packing or service pages',
    intents: Object.freeze([
      'r6-changes.json',
      'changed-parts.json',
      'refs-kit.json',
      'refs-carton.json',
      'refs-bag.json',
      'refs-service.json',
      'r2-manufacturing-unmatched.json',
      'r9-service-unmatched.json',
    ]),
  }),
  Object.freeze({
    id: 'R7',
    direction: 'design-to-downstream',
    title: 'A changed part reaches no assembly chapter, pre-assembly, packing list or service page',
    intents: Object.freeze([
      'changed-parts.json',
      'refs-assembly.json',
      'refs-preassembly.json',
      'refs-bag.json',
      'refs-kit.json',
      'refs-carton.json',
      'refs-service.json',
      'r5-unreadable-preassemblies.json',
      'unmatched-candidates.json',
    ]),
  }),
  Object.freeze({
    id: 'R8',
    direction: 'service-to-design',
    title: 'A part named by a service page is absent from assembly chapters and pre-assemblies',
    intents: Object.freeze([
      'refs-service.json',
      'refs-assembly.json',
      'refs-preassembly.json',
      'refs-bag.json',
      'refs-kit.json',
      'refs-carton.json',
      'r5-unreadable-preassemblies.json',
    ]),
  }),
  Object.freeze({
    id: 'R9',
    direction: 'service-to-design',
    title: 'A service-page reference does not resolve to a part',
    intents: Object.freeze(['r9-service-unmatched.json', 'unmatched-candidates.json']),
  }),
]);

/** Every Intent file the rules need, sorted by file name. */
export const INTENT_FILES = Object.freeze(
  [...new Set(CHECKS.flatMap((rule) => rule.intents))].sort(),
);

/** Reference Intents grouped by the structure class they start from. */
export const REFERENCE_INTENTS = Object.freeze({
  assembly: 'refs-assembly.json',
  preassembly: 'refs-preassembly.json',
  bag: 'refs-bag.json',
  kit: 'refs-kit.json',
  carton: 'refs-carton.json',
});

/** Structures that count as process documentation for R4. */
export const PROCESS_INTENTS = Object.freeze([
  'refs-assembly.json',
  'refs-preassembly.json',
  'refs-bag.json',
]);

/** Structures that count as packing for R4. */
export const PACKING_INTENTS = Object.freeze(['refs-kit.json', 'refs-carton.json']);
