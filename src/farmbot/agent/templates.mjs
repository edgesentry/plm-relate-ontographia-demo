// Fixed per-rule text for causes and countermeasures.
//
// A cause is labelled `fact` when it restates a value from the evidence or the
// seed, and `inference` when it is a candidate explanation. The tool shows that
// two documents disagree; it never decides which document is right. Cause
// entries that point at another rule carry that rule id in `rule`.
//
// Countermeasures are fixed sentences per rule. They are not derived from
// third-party text: every value interpolated here is a seeded name, path or
// integer.

/**
 * @typedef {{ kind: 'fact' | 'inference', rule: string | null, text: string }} Cause
 */

/**
 * @param {'fact' | 'inference'} kind
 * @param {string} text
 * @param {string | null} [rule]
 * @returns {Cause}
 */
function cause(kind, text, rule = null) {
  return { kind, rule, text };
}

/**
 * Describe the non-machine-readable pre-assembly pages as a cause candidate.
 *
 * @param {readonly string[]} paths Sorted page paths.
 * @returns {Cause}
 */
export function r5CauseCandidate(paths) {
  if (paths.length === 0) {
    return cause(
      'inference',
      'R5: no pre-assembly page lacks a machine-readable parts table on the current seed.',
      'R5',
    );
  }
  return cause(
    'inference',
    `R5: ${paths.length} pre-assembly page(s) have no machine-readable parts table ` +
      `(${paths.join(', ')}), so their component lists cannot appear as references.`,
    'R5',
  );
}

/**
 * @param {{ file: string, partName: string, variantCode: string, packingQuantity: number, partQuantity: number, quantityDifference: number }} facts
 * @returns {Cause[]}
 */
export function quantityCauses(facts) {
  const direction = facts.quantityDifference > 0 ? 'higher' : 'lower';
  return [
    cause(
      'fact',
      `The packing list on ${facts.file} gives ${facts.packingQuantity} for ` +
        `${facts.partName} (${facts.variantCode}); the part page gives ${facts.partQuantity}.`,
    ),
    cause(
      'fact',
      `The packing quantity is ${direction} by ${Math.abs(facts.quantityDifference)}.`,
    ),
    cause(
      'inference',
      'The two documents disagree; either may be stale, and this tool does not decide which count is intended.',
    ),
  ];
}

/**
 * @param {{ partName: string, variantCode: string }} facts
 * @returns {string[]}
 */
export function quantityCountermeasures(facts) {
  return [
    `Confirm the intended count for ${facts.partName} (${facts.variantCode}) with manufacturing.`,
    'Correct whichever of the packing list and the part page is out of date, then rebuild the extract.',
  ];
}

/**
 * @param {{ displayName: string, lineCount: number, structureCount: number }} facts
 * @returns {Cause[]}
 */
export function unresolvedReferenceCauses(facts) {
  return [
    cause(
      'fact',
      `The name "${facts.displayName}" appears on ${facts.lineCount} reference line(s) ` +
        `across ${facts.structureCount} page(s), and none of them resolves to a part.`,
    ),
    cause(
      'inference',
      'The name may be misspelled, may use a synonym for a part listed under another name, or may refer to an item that has no part page.',
    ),
  ];
}

/**
 * @param {{ displayName: string }} facts
 * @returns {string[]}
 */
export function unresolvedReferenceCountermeasures(facts) {
  return [
    `Add a part page for "${facts.displayName}" or correct the spelling at the listed lines.`,
    'If the name is a synonym, record the mapping so the same reference resolves on the next extract.',
  ];
}

/**
 * @param {{ partName: string, categorySlug: string, r5Paths: readonly string[] }} facts
 * @returns {Cause[]}
 */
export function unreferencedPartCauses(facts) {
  return [
    cause(
      'fact',
      `No assembly chapter, pre-assembly, bag or packing usage references ${facts.partName} in the extract.`,
    ),
    cause('fact', `The part is filed under the BOM category ${facts.categorySlug}.`),
    cause(
      'inference',
      'The part may be unused, superseded, or documented only on a page whose component list is not machine-readable.',
    ),
    r5CauseCandidate(facts.r5Paths),
  ];
}

/**
 * @param {{ partName: string }} facts
 * @returns {string[]}
 */
export function unreferencedPartCountermeasures(facts) {
  return [
    `Confirm whether ${facts.partName} is still in the BOM and remove or re-file it if it is not.`,
    'If the part belongs to a pre-assembly, add a machine-readable parts table to that page.',
  ];
}

/**
 * @param {{ partName: string, files: readonly string[], r5Paths: readonly string[] }} facts
 * @returns {Cause[]}
 */
export function packedWithoutProcessCauses(facts) {
  return [
    cause(
      'fact',
      `${facts.partName} is packed on ${facts.files.join(', ')} but no assembly chapter, ` +
        'pre-assembly or bag usage references it.',
    ),
    cause(
      'inference',
      'The part may be a deliberate shipping spare, or an assembly step that uses it may be missing from the extract.',
    ),
    r5CauseCandidate(facts.r5Paths),
  ];
}

/**
 * @param {{ partName: string }} facts
 * @returns {string[]}
 */
export function packedWithoutProcessCountermeasures(facts) {
  return [
    `Confirm whether ${facts.partName} is a deliberate spare in the packing list.`,
    'Otherwise add the missing assembly chapter or pre-assembly reference so the packed part has a process step.',
  ];
}

/**
 * @param {{ path: string, reason: string, pdfCount: number }} facts
 * @returns {Cause[]}
 */
export function unreadablePageCauses(facts) {
  return [
    cause(
      'fact',
      `The pre-assembly page ${facts.path} has no machine-readable parts table ` +
        `(${facts.reason}; ${facts.pdfCount} PDF file(s)).`,
    ),
    cause(
      'inference',
      'Components of this page cannot be linked to part pages, so checks that rely on pre-assembly references cannot see them.',
    ),
  ];
}

/**
 * @param {{ path: string }} facts
 * @returns {string[]}
 */
export function unreadablePageCountermeasures(facts) {
  return [
    `Add a Markdown parts table to ${facts.path}, or record the component list from the PDF extract.`,
  ];
}

/**
 * @param {{ name: string, inferred: boolean, sections: readonly string[], files: readonly string[] }} facts
 * @returns {Cause[]}
 */
export function changedNameCauses(facts) {
  const where = facts.files.join(', ');
  const sections = facts.sections.join(', ');
  const stillList = facts.files.length === 1 ? 'still lists it' : 'still list it';
  return [
    cause(
      'fact',
      facts.inferred
        ? `The Change Log removal statement in ${sections} names "${facts.name}", and ${where} ${stillList}.`
        : `The Change Log links ${facts.name} to its part page in ${sections}, and ${where} still reference that part.`,
    ),
    cause(
      'inference',
      'The downstream page may be stale, or the Change Log may describe an earlier revision; this tool does not decide which document is current.',
    ),
  ];
}

/**
 * @param {{ name: string, files: readonly string[] }} facts
 * @returns {string[]}
 */
export function changedNameCountermeasures(facts) {
  return [
    `Confirm whether ${facts.name} should still appear on ${facts.files.join(', ')}.`,
    'Correct the Change Log or the downstream page, then rebuild the extract.',
  ];
}

/**
 * @param {{ partName: string, unresolvedNames: readonly string[], r5Paths: readonly string[] }} facts
 * @returns {Cause[]}
 */
export function changedPartUnreachedCauses(facts) {
  const causes = [
    cause(
      'fact',
      `The Change Log changes ${facts.partName}, but no assembly chapter, pre-assembly, packing list or service page references it in the extract.`,
    ),
    cause(
      'inference',
      'The part may be new and not yet documented, unused, or named only by a reference that did not resolve to a part page.',
    ),
  ];
  if (facts.unresolvedNames.length > 0) {
    causes.push(
      cause(
        'inference',
        `The unresolved name(s) ${facts.unresolvedNames.join(', ')} may be this part under another spelling.`,
        'R2',
      ),
    );
  }
  causes.push(r5CauseCandidate(facts.r5Paths));
  return causes;
}

/**
 * @param {{ partName: string }} facts
 * @returns {string[]}
 */
export function changedPartUnreachedCountermeasures(facts) {
  return [
    `Add the missing reference for ${facts.partName}, or confirm that the part is not used in this build.`,
    'If the reference exists on a pre-assembly page, add a machine-readable parts table so the extract can see it.',
  ];
}

/**
 * @param {{ partName: string, servicePages: readonly string[], packedFiles: readonly string[], unreferenced: boolean, r5Paths: readonly string[] }} facts
 * @returns {Cause[]}
 */
export function serviceOnlyPartCauses(facts) {
  const causes = [
    cause(
      'fact',
      `${facts.partName} is named on ${facts.servicePages.join(', ')}, but no assembly chapter or pre-assembly references it.`,
    ),
  ];
  if (facts.packedFiles.length > 0) {
    causes.push(
      cause(
        'fact',
        `${facts.partName} is packed on ${facts.packedFiles.join(', ')}.`,
        'R4',
      ),
    );
  }
  if (facts.unreferenced) {
    causes.push(
      cause('fact', `${facts.partName} is referenced by nothing else in the extract.`, 'R3'),
    );
  }
  causes.push(
    cause(
      'inference',
      'The part may be a service-only spare, or an assembly step that installs it may be missing from the extract.',
    ),
  );
  causes.push(r5CauseCandidate(facts.r5Paths));
  return causes;
}

/**
 * @param {{ partName: string }} facts
 * @returns {string[]}
 */
export function serviceOnlyPartCountermeasures(facts) {
  return [
    `Confirm whether ${facts.partName} is installed during assembly and belongs on an assembly chapter or pre-assembly.`,
    'If it is a service-only spare, record that in the packing or service page so the difference is intentional.',
  ];
}

/**
 * @param {{ displayName: string, pages: readonly string[], candidates: readonly string[], r2Names: readonly string[] }} facts
 * @returns {Cause[]}
 */
export function unresolvedServiceCauses(facts) {
  const where = facts.pages.join(', ');
  const causes = [
    cause(
      'fact',
      `The unresolved name "${facts.displayName}" appears on ${where}, and it resolves to no part page.`,
    ),
  ];
  if (facts.candidates.length > 0) {
    causes.push(
      cause(
        'fact',
        `The extract recorded these candidate parts: ${facts.candidates.join(', ')}.`,
      ),
    );
  } else {
    causes.push(
      cause('inference', 'The extract recorded no candidate part for this name.'),
    );
  }
  if (facts.r2Names.length > 0) {
    causes.push(
      cause(
        'inference',
        `The same name is also unresolved on ${facts.r2Names.join(', ')}.`,
        'R2',
      ),
    );
  }
  causes.push(
    cause(
      'inference',
      'The name may be misspelled, may use a synonym for a part listed under another name, or may refer to an item that has no part page.',
    ),
  );
  return causes;
}

/**
 * @param {{ displayName: string, pages: readonly string[] }} facts
 * @returns {string[]}
 */
export function unresolvedServiceCountermeasures(facts) {
  return [
    `Add a part page for "${facts.displayName}" or correct it on ${facts.pages.join(', ')}.`,
    'If the name is a synonym, record the mapping so the service reference resolves on the next extract.',
  ];
}
