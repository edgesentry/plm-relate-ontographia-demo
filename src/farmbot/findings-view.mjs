// Pure view helpers for the FarmBot notification panel and finding view.
//
// No DOM. The only import is the fixed rule templates, so `node --test` and the
// React screen share these functions. The summary line and the cause and
// countermeasure bodies are templates per rule filled from the finding's
// subject and evidence `facts` / `sourceFile`. Every value is rendered as text;
// nothing here produces or accepts HTML.

import {
  changedNameCauses,
  changedNameCountermeasures,
  changedPartUnreachedCauses,
  changedPartUnreachedCountermeasures,
  packedWithoutProcessCauses,
  packedWithoutProcessCountermeasures,
  quantityCauses,
  quantityCountermeasures,
  r5CauseCandidate,
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
} from './agent/templates.mjs';

/** Prefix of a finding deep link. */
export const FINDING_HASH_PREFIX = '#finding=';

/**
 * Upper bound for a finding id in a hash. The id scheme caps the slug at 48
 * characters, plus the rule id, the separators and the eight-hex suffix.
 */
export const FINDING_ID_MAX_LENGTH = 64;

const FINDING_ID = /^[A-Za-z0-9-]+$/;
const HASH_PAYLOAD = /^[A-Za-z0-9%-]+$/;
const FINDINGS_DIGEST = /^(farmbot-findings-v1) sha256:([0-9a-f]{64})$/;

/** Severity order for the panel: the most urgent first. */
const SEVERITY_RANK = Object.freeze({ action: 0, review: 1, info: 2 });

/**
 * Read the finding id from a location hash.
 *
 * Accepts exactly `#finding=` plus a URL-safe id matching `^[A-Za-z0-9-]+$`.
 * Percent escapes are decoded once; a malformed escape, an empty payload, an
 * overlong payload, a wrong key or any other character yields `null`. An id
 * that is well formed but unknown is still returned; the caller decides
 * whether it names a finding.
 *
 * @param {string} hash
 * @returns {string | null}
 */
export function parseFindingHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(FINDING_HASH_PREFIX)) return null;
  const raw = hash.slice(FINDING_HASH_PREFIX.length);
  if (raw.length === 0 || raw.length > FINDING_ID_MAX_LENGTH) return null;
  if (!HASH_PAYLOAD.test(raw)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.length === 0 || decoded.length > FINDING_ID_MAX_LENGTH) return null;
  if (!FINDING_ID.test(decoded)) return null;
  return decoded;
}

/**
 * Parse the committed findings sidecar line.
 *
 * @param {string} line
 * @returns {{ format: string, hex: string } | null}
 */
export function parseFindingsDigestLine(line) {
  if (typeof line !== 'string') return null;
  const match = FINDINGS_DIGEST.exec(line.trim());
  if (!match) return null;
  return { format: match[1], hex: match[2] };
}

/**
 * Order findings by severity, then by score, then by id.
 *
 * The result depends only on the set of findings, never on input order.
 *
 * @param {Array<{ id: string, severity: string, severityScore: number }>} findings
 * @returns {Array<{ id: string, severity: string, severityScore: number }>}
 */
export function orderFindings(findings) {
  if (!Array.isArray(findings)) throw new Error('orderFindings needs an array');
  return [...findings].sort((left, right) => {
    const rank = (SEVERITY_RANK[left.severity] ?? 3) - (SEVERITY_RANK[right.severity] ?? 3);
    if (rank !== 0) return rank;
    if (left.severityScore !== right.severityScore) {
      return right.severityScore - left.severityScore;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

/** Severity level hidden by the default findings filter. */
const DEFAULT_HIDDEN_SEVERITY = 'info';

/**
 * The findings shown for the current filter.
 *
 * The input is expected in `orderFindings` order; the order is preserved. The
 * default hides `info` findings; with `includeInfo` the whole list is returned.
 * Only `info` is filtered, so `action` and `review` rows always remain. Counts
 * are not affected: count the full document, not this result.
 *
 * @param {Array<{ severity: string }>} findings
 * @param {boolean} includeInfo
 * @returns {Array<{ severity: string }>}
 */
export function visibleFindings(findings, includeInfo) {
  if (!Array.isArray(findings)) throw new Error('visibleFindings needs an array');
  if (includeInfo === true) return [...findings];
  return findings.filter((finding) => finding.severity !== DEFAULT_HIDDEN_SEVERITY);
}

/**
 * Count findings per severity level.
 *
 * @param {Array<{ severity: string }>} findings
 * @returns {{ action: number, review: number, info: number, total: number }}
 */
export function countBySeverity(findings) {
  if (!Array.isArray(findings)) throw new Error('countBySeverity needs an array');
  const counts = { action: 0, review: 0, info: 0, total: findings.length };
  for (const finding of findings) {
    if (Object.prototype.hasOwnProperty.call(SEVERITY_RANK, finding.severity)) {
      counts[/** @type {'action' | 'review' | 'info'} */ (finding.severity)] += 1;
    }
  }
  return counts;
}

/** @param {unknown} value */
function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * @param {Record<string, any>} finding
 * @param {string} role
 * @returns {Record<string, any> | null}
 */
function firstEvidence(finding, role) {
  const rows = Array.isArray(finding.evidence) ? finding.evidence : [];
  return rows.find((row) => row && row.role === role) ?? null;
}

/**
 * @param {Record<string, any> | null} row
 * @param {string} key
 * @returns {unknown}
 */
function fact(row, key) {
  return row && row.facts && typeof row.facts === 'object' ? row.facts[key] : undefined;
}

/**
 * The values a summary line interpolates, all read from the finding itself.
 *
 * @param {Record<string, any>} finding
 * @returns {Record<string, unknown>}
 */
function summaryValues(finding) {
  const rule = text(finding.rule);
  const part = firstEvidence(finding, 'part');
  const page = firstEvidence(finding, 'pre-assembly-page');
  const difference = firstEvidence(finding, 'quantity-difference');
  const fallback = text(finding.subject?.label ?? finding.id);

  if (rule === 'R1') {
    return {
      file: text(difference?.sourceFile),
      partName: text(fact(part, 'name')) || fallback,
      variant: text(fact(difference, 'version')),
      delta: text(fact(difference, 'quantityDifference')),
    };
  }
  if (rule === 'R2') {
    const references = (Array.isArray(finding.evidence) ? finding.evidence : []).filter(
      (row) => row && row.role === 'reference',
    );
    return {
      displayName: text(fact(references[0], 'displayName')) || text(finding.subject?.key),
      lines: String(references.length),
    };
  }
  if (rule === 'R3') {
    return { partName: text(fact(part, 'name')) || fallback };
  }
  if (rule === 'R4') {
    const files = [
      ...new Set(
        (Array.isArray(finding.evidence) ? finding.evidence : [])
          .filter((row) => row && row.role === 'packing-structure')
          .map((row) => text(row.sourceFile))
          .filter((file) => file !== ''),
      ),
    ].sort();
    return {
      partName: text(fact(part, 'name')) || fallback,
      files,
    };
  }
  if (rule === 'R5') {
    return {
      path: text(page?.sourceFile) || text(finding.subject?.key) || fallback,
    };
  }
  if (rule === 'R6') {
    const rows = Array.isArray(finding.evidence) ? finding.evidence : [];
    const files = [
      ...new Set(
        rows
          .filter((row) => row && (row.role === 'packing-structure' || row.role === 'service'))
          .map((row) => text(row.sourceFile))
          .filter((file) => file !== ''),
      ),
    ].sort();
    const sections = [
      ...new Set(
        rows
          .filter((row) => row && row.role === 'design-change')
          .map((row) => text(fact(row, 'section')))
          .filter((section) => section !== ''),
      ),
    ].sort();
    return { name: fallback, files, sections, inferred: finding.inferred === true };
  }
  if (rule === 'R7') {
    return { partName: text(fact(part, 'name')) || fallback };
  }
  if (rule === 'R8') {
    const servicePages = [
      ...new Set(
        (Array.isArray(finding.evidence) ? finding.evidence : [])
          .filter((row) => row && row.role === 'service')
          .map((row) => text(row.sourceFile))
          .filter((file) => file !== ''),
      ),
    ].sort();
    return { partName: text(fact(part, 'name')) || fallback, servicePages };
  }
  if (rule === 'R9') {
    const references = (Array.isArray(finding.evidence) ? finding.evidence : []).filter(
      (row) => row && row.role === 'reference',
    );
    const services = (Array.isArray(finding.evidence) ? finding.evidence : []).filter(
      (row) => row && row.role === 'service',
    );
    const pages = [
      ...new Set(services.map((row) => text(row.sourceFile)).filter((file) => file !== '')),
    ].sort();
    if (pages.length === 0 && text(references[0]?.sourceFile) !== '') {
      pages.push(text(references[0]?.sourceFile));
    }
    return {
      displayName: text(fact(references[0], 'displayName')) || text(finding.subject?.key),
      pages,
    };
  }
  return { subject: fallback };
}

/**
 * One summary line per rule, from the template filled with evidence values.
 *
 * @param {Record<string, any>} finding
 * @param {'ja' | 'en'} lang
 * @returns {string}
 */
export function summaryLine(finding, lang) {
  if (!finding || typeof finding !== 'object') throw new Error('summaryLine needs a finding');
  if (lang !== 'ja' && lang !== 'en') throw new Error(`summaryLine needs lang ja or en, got ${lang}`);
  const values = summaryValues(finding);
  const rule = text(finding.rule);

  if (lang === 'ja') {
    if (rule === 'R1') {
      return (
        `${values.file} の梱包リストと ${values.partName} の部品ページでは ` +
        `${values.variant} の数量が ${values.delta} だけ異なります。`
      );
    }
    if (rule === 'R2') {
      return `${values.displayName} は参照行 ${values.lines} 件に現れ、どの部品にも解決しません。`;
    }
    if (rule === 'R3') {
      return (
        `${values.partName} は組立チャプタ、プリ組立、バッグ、梱包リストの` +
        'いずれからも参照されていません。'
      );
    }
    if (rule === 'R4') {
      return (
        `${values.partName} は ${values.files.join('、')} で梱包されていますが、` +
        '組立チャプタからもプリ組立からも参照されていません。'
      );
    }
    if (rule === 'R5') {
      return `プリ組立ページ ${values.path} には機械可読な部品表がありません。`;
    }
    if (rule === 'R6') {
      return (
        `"${values.name}" は変更ログで変更または削除されましたが、` +
        `${values.files.join('、')} に依然として記載されています。`
      );
    }
    if (rule === 'R7') {
      return (
        `${values.partName} は変更ログで変更されましたが、組立チャプタ、プリ組立、` +
        '梱包リスト、サービスページのいずれにも現れません。'
      );
    }
    if (rule === 'R8') {
      return (
        `${values.partName} は ${values.servicePages.join('、')} で名前が挙がっていますが、` +
        '組立チャプタからもプリ組立からも参照されていません。'
      );
    }
    if (rule === 'R9') {
      return `"${values.displayName}" は ${values.pages.join('、')} に現れ、どの部品にも解決しません。`;
    }
    return `${values.subject} に関する検出です。`;
  }

  if (rule === 'R1') {
    return (
      `The packing list on ${values.file} and the part page for ${values.partName} ` +
      `disagree by ${values.delta} for ${values.variant}.`
    );
  }
  if (rule === 'R2') {
    return `"${values.displayName}" appears on ${values.lines} reference line(s) and resolves to no part.`;
  }
  if (rule === 'R3') {
    return `${values.partName} is referenced by no assembly chapter, pre-assembly, bag or packing list.`;
  }
  if (rule === 'R4') {
    return `${values.partName} is packed on ${values.files.join(', ')} but no assembly chapter or pre-assembly references it.`;
  }
  if (rule === 'R5') {
    return `The pre-assembly page ${values.path} has no machine-readable parts table.`;
  }
  if (rule === 'R6') {
    const verb = values.inferred ? 'Change Log removal statement names' : 'Change Log links';
    const still = values.files.length === 1 ? 'still lists it' : 'still list it';
    return `The ${verb} "${values.name}", but ${values.files.join(', ')} ${still}.`;
  }
  if (rule === 'R7') {
    return `${values.partName} changed in the Change Log but reaches no assembly chapter, pre-assembly, packing list or service page.`;
  }
  if (rule === 'R8') {
    return `${values.partName} is named on ${values.servicePages.join(', ')} but no assembly chapter or pre-assembly references it.`;
  }
  if (rule === 'R9') {
    return `"${values.displayName}" appears on ${values.pages.join(', ')} and resolves to no part.`;
  }
  return `Finding about ${values.subject}.`;
}

/**
 * Pair every evidence row with the queries of its rule, dropping repeated
 * rows. A row's identity is (role, node id, source file, line): within one
 * finding, two rows with the same identity are the same citation.
 *
 * @param {Record<string, any>} finding
 * @returns {Array<Record<string, any>>}
 */
export function evidenceRows(finding) {
  if (!finding || typeof finding !== 'object') throw new Error('evidenceRows needs a finding');
  const queries = Array.isArray(finding.queries) ? finding.queries : [];
  const seen = new Set();
  const rows = [];
  for (const row of Array.isArray(finding.evidence) ? finding.evidence : []) {
    if (!row || typeof row !== 'object') continue;
    const identity = JSON.stringify([row.role, row.nodeId, row.sourceFile, row.line]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    rows.push({ ...row, queries });
  }
  return rows;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number}
 */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {Record<string, any>} finding
 * @param {string} role
 * @returns {Array<Record<string, any>>}
 */
function evidenceByRole(finding, role) {
  return (Array.isArray(finding.evidence) ? finding.evidence : []).filter(
    (row) => row && row.role === role,
  );
}

/**
 * Unique non-empty source files of the given rows, in code-unit order.
 *
 * @param {Array<Record<string, any>>} rows
 * @returns {string[]}
 */
function sourceFiles(rows) {
  return [
    ...new Set(rows.map((row) => text(row.sourceFile)).filter((file) => file !== '')),
  ].sort(compareText);
}

/**
 * @param {Record<string, any>} finding
 * @param {string} rule
 * @returns {Record<string, any> | null}
 */
function storedCauseForRule(finding, rule) {
  const causes = Array.isArray(finding.causes) ? finding.causes : [];
  return causes.find((entry) => entry && entry.rule === rule) ?? null;
}

/**
 * The unreadable pre-assembly pages recorded in this finding's own evidence, or
 * `null` when the finding carries no such rows. These are the only truthful
 * source for the shared R5 candidate: the stored document keeps no list field.
 *
 * @param {Record<string, any>} finding
 * @returns {string[] | null}
 */
function structuredR5Paths(finding) {
  const pages = [
    ...new Set(
      evidenceByRole(finding, 'pre-assembly-page')
        .filter((row) => text(fact(row, 'machineReadableReason')) !== '')
        .map((row) => text(row.sourceFile))
        .filter((file) => file !== ''),
    ),
  ].sort(compareText);
  return pages.length === 0 ? null : pages;
}

/**
 * The unresolved display names recorded on this finding's reference rows, or
 * `null` when it carries none.
 *
 * @param {Record<string, any>} finding
 * @returns {string[] | null}
 */
function structuredUnresolvedNames(finding) {
  const rows = evidenceByRole(finding, 'reference').filter(
    (row) => text(fact(row, 'resolvedPart')) === '',
  );
  if (rows.length === 0) return null;
  return [
    ...new Set(rows.map((row) => text(fact(row, 'displayName'))).filter((name) => name !== '')),
  ].sort(compareText);
}

/**
 * The other pages where an unresolved reference name also appears, recorded on
 * this finding's reference rows, or `null` when it carries no such rows.
 *
 * @param {Record<string, any>} finding
 * @returns {string[] | null}
 */
function structuredAlsoUnresolvedPages(finding) {
  const ownPages = new Set(sourceFiles(evidenceByRole(finding, 'service')));
  const pages = [
    ...new Set(
      evidenceByRole(finding, 'reference')
        .filter((row) => text(fact(row, 'resolvedPart')) === '')
        .map((row) => text(row.sourceFile))
        .filter((file) => file !== '' && !ownPages.has(file)),
    ),
  ].sort(compareText);
  return pages.length === 0 ? null : pages;
}

/**
 * The R5 cause candidate for a finding. When the finding has no structured
 * page rows, return the candidate the collector stored, unchanged and still in
 * English, rather than guessing the list back out of its prose.
 *
 * @param {Record<string, any>} finding
 * @param {'ja' | 'en'} lang
 * @returns {Record<string, any> | null}
 */
function sharedR5Cause(finding, lang) {
  const paths = structuredR5Paths(finding);
  if (paths !== null) return r5CauseCandidate(paths, lang);
  return storedCauseForRule(finding, 'R5');
}

/**
 * @param {Record<string, any>} finding
 * @returns {string}
 */
function sharedPagePath(finding) {
  return text(firstEvidence(finding, 'pre-assembly-page')?.sourceFile);
}

/**
 * @param {Record<string, any>} finding
 * @returns {string}
 */
function findingPartName(finding) {
  return (
    text(fact(firstEvidence(finding, 'part'), 'name')) ||
    text(finding.subject?.label) ||
    text(finding.id)
  );
}

/**
 * @param {string} lang
 * @param {string} caller
 */
function assertLanguage(lang, caller) {
  if (lang !== 'ja' && lang !== 'en') {
    throw new Error(`${caller} needs lang ja or en, got ${lang}`);
  }
}

/**
 * @param {Record<string, any>} finding
 * @returns {string[]}
 */
function downstreamFiles(finding) {
  return sourceFiles(
    (Array.isArray(finding.evidence) ? finding.evidence : []).filter(
      (row) => row && (row.role === 'packing-structure' || row.role === 'service'),
    ),
  );
}

/**
 * @param {Record<string, any>} finding
 * @returns {string[]}
 */
function servicePages(finding) {
  const pages = sourceFiles(evidenceByRole(finding, 'service'));
  if (pages.length === 0) {
    const fallback = text(evidenceByRole(finding, 'reference')[0]?.sourceFile);
    if (fallback !== '') pages.push(fallback);
  }
  return pages;
}

/**
 * The cause candidates for one rule in the selected language, filled from the
 * finding's own evidence and subject. English keeps the collector's meaning;
 * Japanese carries the same claims in Japanese.
 *
 * @param {Record<string, any>} finding
 * @param {'ja' | 'en'} lang
 * @returns {Array<{ kind: 'fact' | 'inference', rule: string | null, text: string }>}
 */
export function findingCauses(finding, lang) {
  if (!finding || typeof finding !== 'object') throw new Error('findingCauses needs a finding');
  assertLanguage(lang, 'findingCauses');
  const rule = text(finding.rule);

  if (rule === 'R1') {
    const difference = firstEvidence(finding, 'quantity-difference');
    return quantityCauses(
      {
        file: text(difference?.sourceFile),
        partName: findingPartName(finding),
        variantCode: text(fact(difference, 'version')),
        packingQuantity: Number(fact(difference, 'packingQuantity')),
        partQuantity: Number(fact(difference, 'partQuantity')),
        quantityDifference: Number(fact(difference, 'quantityDifference')),
      },
      lang,
    );
  }
  if (rule === 'R2') {
    const references = evidenceByRole(finding, 'reference');
    const structures = new Set(evidenceByRole(finding, 'structure').map((row) => row.nodeId));
    return unresolvedReferenceCauses(
      {
        displayName:
          text(fact(references[0], 'displayName')) || text(finding.subject?.key),
        lineCount: references.length,
        structureCount: structures.size,
      },
      lang,
    );
  }
  if (rule === 'R3') {
    return unreferencedPartCauses(
      {
        partName: findingPartName(finding),
        categorySlug: text(fact(firstEvidence(finding, 'part'), 'categorySlug')),
        r5Paths: structuredR5Paths(finding) ?? [],
        r5Cause: sharedR5Cause(finding, lang) ?? undefined,
      },
      lang,
    );
  }
  if (rule === 'R4') {
    return packedWithoutProcessCauses(
      {
        partName: findingPartName(finding),
        files: sourceFiles(evidenceByRole(finding, 'packing-structure')),
        r5Paths: structuredR5Paths(finding) ?? [],
        r5Cause: sharedR5Cause(finding, lang) ?? undefined,
      },
      lang,
    );
  }
  if (rule === 'R5') {
    const page = firstEvidence(finding, 'pre-assembly-page');
    return unreadablePageCauses(
      {
        path: sharedPagePath(finding),
        reason: text(fact(page, 'machineReadableReason')) || 'no reason recorded',
        pdfCount: Number(fact(page, 'pdfCount') ?? 0),
      },
      lang,
    );
  }
  if (rule === 'R6') {
    return changedNameCauses(
      {
        name: text(finding.subject?.label) || findingPartName(finding),
        files: downstreamFiles(finding),
        sections: [
          ...new Set(
            evidenceByRole(finding, 'design-change')
              .map((row) => text(fact(row, 'section')))
              .filter((section) => section !== ''),
          ),
        ].sort(compareText),
        inferred: finding.inferred === true,
      },
      lang,
    );
  }
  if (rule === 'R7') {
    const unresolvedNames = structuredUnresolvedNames(finding);
    const unresolvedCause =
      unresolvedNames === null ? storedCauseForRule(finding, 'R2') : null;
    return changedPartUnreachedCauses(
      {
        partName: findingPartName(finding),
        unresolvedNames: unresolvedNames ?? [],
        unresolvedCause: unresolvedCause ?? undefined,
        r5Paths: structuredR5Paths(finding) ?? [],
        r5Cause: sharedR5Cause(finding, lang) ?? undefined,
      },
      lang,
    );
  }
  if (rule === 'R8') {
    const packed = evidenceByRole(finding, 'packing-structure');
    return serviceOnlyPartCauses(
      {
        partName: findingPartName(finding),
        servicePages: sourceFiles(evidenceByRole(finding, 'service')),
        packedFiles: sourceFiles(packed),
        unreferenced: packed.length === 0,
        r5Paths: structuredR5Paths(finding) ?? [],
        r5Cause: sharedR5Cause(finding, lang) ?? undefined,
      },
      lang,
    );
  }
  if (rule === 'R9') {
    const references = evidenceByRole(finding, 'reference');
    const candidates = [
      ...new Set(
        evidenceByRole(finding, 'part')
          .filter((row) => fact(row, 'candidate') === true)
          .map((row) => text(fact(row, 'name')))
          .filter((name) => name !== ''),
      ),
    ].sort(compareText);
    const r2Names = structuredAlsoUnresolvedPages(finding);
    const r2Cause = r2Names === null ? storedCauseForRule(finding, 'R2') : null;
    return unresolvedServiceCauses(
      {
        displayName:
          text(fact(references[0], 'displayName')) || text(finding.subject?.key),
        pages: servicePages(finding),
        candidates,
        r2Names: r2Names ?? [],
        r2Cause: r2Cause ?? undefined,
      },
      lang,
    );
  }
  throw new Error(`findingCauses has no body templates for rule ${rule}`);
}

/**
 * The countermeasures for one rule in the selected language.
 *
 * @param {Record<string, any>} finding
 * @param {'ja' | 'en'} lang
 * @returns {string[]}
 */
export function findingCountermeasures(finding, lang) {
  if (!finding || typeof finding !== 'object') {
    throw new Error('findingCountermeasures needs a finding');
  }
  assertLanguage(lang, 'findingCountermeasures');
  const rule = text(finding.rule);
  const partName = findingPartName(finding);

  if (rule === 'R1') {
    return quantityCountermeasures(
      {
        partName,
        variantCode: text(fact(firstEvidence(finding, 'quantity-difference'), 'version')),
      },
      lang,
    );
  }
  if (rule === 'R2') {
    const references = evidenceByRole(finding, 'reference');
    return unresolvedReferenceCountermeasures(
      {
        displayName:
          text(fact(references[0], 'displayName')) || text(finding.subject?.key),
      },
      lang,
    );
  }
  if (rule === 'R3') return unreferencedPartCountermeasures({ partName }, lang);
  if (rule === 'R4') return packedWithoutProcessCountermeasures({ partName }, lang);
  if (rule === 'R5') {
    return unreadablePageCountermeasures({ path: sharedPagePath(finding) }, lang);
  }
  if (rule === 'R6') {
    return changedNameCountermeasures(
      {
        name: text(finding.subject?.label) || partName,
        files: downstreamFiles(finding),
      },
      lang,
    );
  }
  if (rule === 'R7') return changedPartUnreachedCountermeasures({ partName }, lang);
  if (rule === 'R8') return serviceOnlyPartCountermeasures({ partName }, lang);
  if (rule === 'R9') {
    const references = evidenceByRole(finding, 'reference');
    return unresolvedServiceCountermeasures(
      {
        displayName:
          text(fact(references[0], 'displayName')) || text(finding.subject?.key),
        pages: servicePages(finding),
      },
      lang,
    );
  }
  throw new Error(`findingCountermeasures has no body templates for rule ${rule}`);
}
