// Tests for the pure view helpers behind the notification panel and the
// finding view. Every expectation is computed from the committed findings
// document; no count, id or summary is written into this file.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { canonicalJson } from '../../src/farmbot/agent/canonical.mjs';
import {
  countBySeverity,
  evidenceRows,
  findingCauses,
  findingCountermeasures,
  orderFindings,
  parseFindingHash,
  parseFindingsDigestLine,
  summaryLine,
  visibleFindings,
} from '../../src/farmbot/findings-view.mjs';
import {
  changedNameCauses,
  changedPartUnreachedCauses,
  r5CauseCandidate,
  serviceOnlyPartCauses,
  unresolvedServiceCauses,
  unresolvedServiceCountermeasures,
} from '../../src/farmbot/agent/templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FINDINGS_PATH = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');
const FINDINGS_DIGEST_PATH = `${FINDINGS_PATH}.sha256`;

// Pinned from base f34e08609c3fb677d0582b01a89a3183f86d7df5. A change to the
// canonical findings bytes must fail this test even if the sidecar is rewritten
// to match, so the expected digest is never recomputed from the current file.
const PINNED_FINDINGS_DIGEST =
  'farmbot-findings-v1 sha256:1385a806eea90ce52c2c57ea1bcf7bfe9f0c1174a3b230ad84d51ce95bf15ab8';

const findingsText = readFileSync(FINDINGS_PATH, 'utf8');
const document = JSON.parse(findingsText);
const findings = document.findings;
const severityRank = { action: 0, review: 1, info: 2 };

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

function evidenceOf(finding, role) {
  return finding.evidence.find((row) => row.role === role);
}

/** The values a summary line must contain, read from the finding itself. */
function summaryInputs(finding) {
  const part = evidenceOf(finding, 'part');
  const page = evidenceOf(finding, 'pre-assembly-page');
  const difference = evidenceOf(finding, 'quantity-difference');
  switch (finding.rule) {
    case 'R1':
      return [
        difference.sourceFile,
        part.facts.name,
        String(difference.facts.version),
        String(difference.facts.quantityDifference),
      ];
    case 'R2': {
      const references = finding.evidence.filter((row) => row.role === 'reference');
      return [references[0].facts.displayName, String(references.length)];
    }
    case 'R3':
      return [part.facts.name];
    case 'R4': {
      const files = finding.evidence
        .filter((row) => row.role === 'packing-structure')
        .map((row) => row.sourceFile);
      return [part.facts.name, ...new Set(files)];
    }
    case 'R5':
      return [page.sourceFile];
    case 'R6': {
      const files = finding.evidence
        .filter((row) => row.role === 'packing-structure' || row.role === 'service')
        .map((row) => row.sourceFile);
      return [finding.subject.label, ...new Set(files)];
    }
    case 'R7':
      return [part.facts.name];
    case 'R8': {
      const pages = finding.evidence
        .filter((row) => row.role === 'service')
        .map((row) => row.sourceFile);
      return [part.facts.name, ...new Set(pages)];
    }
    case 'R9': {
      const reference = finding.evidence.find((row) => row.role === 'reference');
      const pages = [
        ...new Set(
          finding.evidence
            .filter((row) => row.role === 'service')
            .map((row) => row.sourceFile),
        ),
      ].sort();
      return [reference.facts.displayName, ...pages];
    }
    default:
      throw new Error(`no summary inputs for rule ${finding.rule}`);
  }
}

test('a finding hash yields its id and keeps an unknown id', () => {
  for (const finding of findings) {
    assert.equal(parseFindingHash(`#finding=${finding.id}`), finding.id);
    assert.equal(
      parseFindingHash(`#finding=${encodeURIComponent(finding.id)}`),
      finding.id,
    );
  }
  assert.equal(parseFindingHash('#finding=does-not-exist'), 'does-not-exist');
});

test('any other hash yields null', () => {
  const rejected = [
    '',
    '#',
    '#foo',
    '#finding',
    '#finding=',
    '#Finding=R1-40mm-nut-bar-standard',
    '#finding=%E0%A4%A',
    '#finding=%',
    '#finding=%zz',
    '#finding=R1-a b',
    '#finding=R1-a?b',
    '#finding=R1-a#b',
    '#finding=<script>alert(1)</script>',
    '#finding=%3Cscript%3E',
    '#finding=R1-日本語',
    `#finding=${'x'.repeat(65)}`,
    `#finding=${'R1-'.padEnd(65, 'a')}`,
  ];
  for (const hash of rejected) {
    assert.equal(parseFindingHash(hash), null, `${JSON.stringify(hash)} must be rejected`);
  }
});

test('the summary line is filled from evidence values in both languages', () => {
  const rules = [...new Set(findings.map((finding) => finding.rule))].sort();
  assert.deepEqual(rules, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']);

  for (const finding of findings) {
    const inputs = summaryInputs(finding);
    for (const lang of ['ja', 'en']) {
      const line = summaryLine(finding, lang);
      assert.ok(line.length > 0, `${finding.id} has an empty ${lang} summary`);
      for (const value of inputs) {
        assert.ok(
          line.includes(value),
          `${finding.id} ${lang} summary does not contain ${JSON.stringify(value)}: ${line}`,
        );
      }
    }
    assert.notEqual(
      summaryLine(finding, 'ja'),
      summaryLine(finding, 'en'),
      `${finding.id} must localize its summary`,
    );
    // The English template reproduces the rule module's stored summary.
    assert.equal(summaryLine(finding, 'en'), finding.summary, `${finding.id} summary drifted`);
  }
});

test('an unresolved service name on several pages joins every page', () => {
  const finding = {
    id: 'R9-multi-page',
    rule: 'R9',
    inferred: false,
    subject: { key: 'tee nuts', kind: 'unresolved-name', label: 'tee nuts', nodeId: null },
    evidence: [
      {
        role: 'service',
        nodeId: 'service:a.md',
        sourceFile: 'a.md',
        line: null,
        facts: { kind: 'maintenance', title: 'A' },
      },
      {
        role: 'service',
        nodeId: 'service:b.md',
        sourceFile: 'b.md',
        line: null,
        facts: { kind: 'maintenance', title: 'B' },
      },
      {
        role: 'reference',
        nodeId: 'usage:service:a.md@0',
        sourceFile: 'a.md',
        line: 1,
        facts: { displayName: 'tee nuts', matchMethod: 'unmatched', resolvedPart: null },
      },
      {
        role: 'reference',
        nodeId: 'usage:service:b.md@0',
        sourceFile: 'b.md',
        line: 2,
        facts: { displayName: 'tee nuts', matchMethod: 'unmatched', resolvedPart: null },
      },
    ],
    queries: [],
  };

  const causes = unresolvedServiceCauses({
    candidates: [],
    displayName: 'tee nuts',
    pages: ['a.md', 'b.md'],
    r2Names: [],
  });
  const countermeasures = unresolvedServiceCountermeasures({
    displayName: 'tee nuts',
    pages: ['a.md', 'b.md'],
  });
  for (const lang of ['ja', 'en']) {
    const line = summaryLine(finding, lang);
    assert.ok(line.includes('a.md'), `${lang} summary drops a.md: ${line}`);
    assert.ok(line.includes('b.md'), `${lang} summary drops b.md: ${line}`);
  }
  assert.ok(causes[0].text.includes('a.md') && causes[0].text.includes('b.md'));
  assert.ok(countermeasures[0].includes('a.md') && countermeasures[0].includes('b.md'));
});

test('the R6 summary agrees with the number of downstream pages', () => {
  const base = {
    id: 'R6-grammar',
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
      {
        role: 'packing-structure',
        nodeId: 'container:kit.md',
        sourceFile: 'kit.md',
        line: null,
        facts: { title: 'Kit' },
      },
    ],
    queries: [],
  };
  assert.match(summaryLine(base, 'en'), /kit\.md still lists it\.$/);
  assert.doesNotMatch(summaryLine(base, 'en'), /still list it\./);

  const plural = {
    ...base,
    evidence: [
      ...base.evidence,
      {
        role: 'packing-structure',
        nodeId: 'container:carton.md',
        sourceFile: 'carton.md',
        line: null,
        facts: { title: 'Carton' },
      },
    ],
  };
  assert.match(summaryLine(plural, 'en'), /carton\.md, kit\.md still list it\.$/);
});

test('an unsupported language is rejected', () => {
  assert.throws(() => summaryLine(findings[0], 'fr'), /lang ja or en/);
});

test('ordering depends only on the set of findings', () => {
  const forward = orderFindings(findings).map((finding) => finding.id);
  const reversed = orderFindings([...findings].reverse()).map((finding) => finding.id);
  const mixed = orderFindings(shuffled(findings, 43)).map((finding) => finding.id);

  assert.deepEqual(reversed, forward);
  assert.deepEqual(mixed, forward);
  assert.equal(forward.length, findings.length);
  assert.deepEqual([...forward].sort(), findings.map((finding) => finding.id).sort());

  const ordered = orderFindings(findings);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const rank = severityRank[previous.severity] - severityRank[current.severity];
    assert.ok(
      rank < 0 || (rank === 0 && previous.severityScore >= current.severityScore),
      `${previous.id} must not come after ${current.id}`,
    );
    if (rank === 0 && previous.severityScore === current.severityScore) {
      assert.ok(previous.id < current.id, 'ties must be ordered by id');
    }
  }
});

test('per-severity counts equal the committed findings', () => {
  const recomputed = { action: 0, review: 0, info: 0 };
  for (const finding of findings) recomputed[finding.severity] += 1;
  const counts = countBySeverity(findings);

  assert.deepEqual(counts, { ...recomputed, total: findings.length });
  assert.deepEqual(countBySeverity([...findings].reverse()), counts);
  assert.deepEqual(countBySeverity(shuffled(findings, 7)), counts);
});

test('evidence rows are unique and keep their rule queries', () => {
  for (const finding of findings) {
    const identities = finding.evidence.map((row) =>
      JSON.stringify([row.role, row.nodeId, row.sourceFile, row.line]),
    );
    assert.equal(
      new Set(identities).size,
      identities.length,
      `${finding.id} repeats an evidence row`,
    );

    const rows = evidenceRows(finding);
    assert.equal(rows.length, finding.evidence.length);
    for (const row of rows) {
      assert.deepEqual(row.queries, finding.queries);
    }
    const seen = new Set();
    for (const row of rows) {
      const identity = JSON.stringify([row.role, row.nodeId, row.sourceFile, row.line]);
      assert.equal(seen.has(identity), false, `${finding.id} yields a duplicate row`);
      seen.add(identity);
    }
  }

  const duplicated = {
    queries: [],
    evidence: [
      { role: 'part', nodeId: 'part:a', sourceFile: 'a.md', line: null, facts: {} },
      { role: 'part', nodeId: 'part:a', sourceFile: 'a.md', line: null, facts: {} },
    ],
  };
  assert.equal(evidenceRows(duplicated).length, 1);
});

test('the committed findings sidecar is a digest line', () => {
  const parsed = parseFindingsDigestLine(readFileSync(FINDINGS_DIGEST_PATH, 'utf8'));
  assert.ok(parsed, 'the sidecar must parse');
  assert.equal(parsed.format, 'farmbot-findings-v1');
  assert.match(parsed.hex, /^[0-9a-f]{64}$/);
  assert.equal(parseFindingsDigestLine('farmbot-findings-v1 sha256:nope'), null);
  assert.equal(parseFindingsDigestLine('farmbot-graph-v1 sha256:' + '0'.repeat(64)), null);
});

/** The values a rendered body must contain, read from the finding itself. */
function bodyInputs(finding) {
  const part = evidenceOf(finding, 'part');
  const partName = part?.facts?.name ?? finding.subject.label;
  switch (finding.rule) {
    case 'R1': {
      const difference = evidenceOf(finding, 'quantity-difference');
      return [
        difference.sourceFile,
        partName,
        String(difference.facts.version),
        String(difference.facts.packingQuantity),
        String(difference.facts.partQuantity),
        String(Math.abs(difference.facts.quantityDifference)),
      ];
    }
    case 'R2': {
      const references = finding.evidence.filter((row) => row.role === 'reference');
      return [references[0].facts.displayName, String(references.length)];
    }
    case 'R3':
      return [partName, part.facts.categorySlug];
    case 'R4': {
      const files = finding.evidence
        .filter((row) => row.role === 'packing-structure')
        .map((row) => row.sourceFile);
      return [partName, ...new Set(files)];
    }
    case 'R5': {
      const page = evidenceOf(finding, 'pre-assembly-page');
      return [
        page.sourceFile,
        page.facts.machineReadableReason,
        String(page.facts.pdfCount),
      ];
    }
    case 'R6': {
      const sections = finding.evidence
        .filter((row) => row.role === 'design-change')
        .map((row) => row.facts.section);
      const files = finding.evidence
        .filter((row) => row.role === 'packing-structure' || row.role === 'service')
        .map((row) => row.sourceFile);
      return [finding.subject.label, ...new Set(sections), ...new Set(files)];
    }
    case 'R7':
      return [partName];
    case 'R8': {
      const servicePages = finding.evidence
        .filter((row) => row.role === 'service')
        .map((row) => row.sourceFile);
      const packedFiles = finding.evidence
        .filter((row) => row.role === 'packing-structure')
        .map((row) => row.sourceFile);
      return [partName, ...new Set(servicePages), ...new Set(packedFiles)];
    }
    case 'R9': {
      const reference = finding.evidence.find((row) => row.role === 'reference');
      const pages = finding.evidence
        .filter((row) => row.role === 'service')
        .map((row) => row.sourceFile);
      return [reference.facts.displayName, ...new Set(pages)];
    }
    default:
      throw new Error(`no body inputs for rule ${finding.rule}`);
  }
}

test('the rendered English bodies equal the committed bodies for every finding', () => {
  for (const finding of findings) {
    assert.deepEqual(
      findingCauses(finding, 'en'),
      finding.causes,
      `${finding.id} English causes drifted`,
    );
    assert.deepEqual(
      findingCountermeasures(finding, 'en'),
      finding.countermeasures,
      `${finding.id} English countermeasures drifted`,
    );
  }
});

test('every finding renders Japanese body text, allowing an English shared-candidate fallback', () => {
  const rules = new Set();
  for (const finding of findings) {
    rules.add(finding.rule);
    const causesJa = findingCauses(finding, 'ja');
    const countermeasuresJa = findingCountermeasures(finding, 'ja');

    assert.equal(
      causesJa.length,
      finding.causes.length,
      `${finding.id} Japanese causes dropped an entry`,
    );
    assert.equal(
      countermeasuresJa.length,
      finding.countermeasures.length,
      `${finding.id} Japanese countermeasures dropped an entry`,
    );
    assert.deepEqual(
      causesJa.map((cause) => [cause.kind, cause.rule]),
      finding.causes.map((cause) => [cause.kind, cause.rule]),
      `${finding.id} Japanese causes changed a fact or inference label`,
    );
    for (let index = 0; index < causesJa.length; index += 1) {
      const stored = finding.causes[index];
      // Only a shared candidate with no structured values may fall back to the
      // stored English text; every other entry must be localised.
      if (causesJa[index].text === stored.text) {
        assert.ok(
          stored.rule === 'R2' || stored.rule === 'R5',
          `${finding.id} cause ${index} fell back to English but is not a shared candidate`,
        );
      }
    }
    for (let index = 0; index < countermeasuresJa.length; index += 1) {
      assert.notEqual(
        countermeasuresJa[index],
        finding.countermeasures[index],
        `${finding.id} countermeasure ${index} is still English`,
      );
    }

    const body = [...causesJa.map((cause) => cause.text), ...countermeasuresJa].join('\n');
    for (const value of bodyInputs(finding)) {
      if (value === null || value === undefined || value === '') continue;
      assert.ok(
        body.includes(String(value)),
        `${finding.id} Japanese body does not contain ${JSON.stringify(value)}: ${body}`,
      );
    }
  }
  assert.deepEqual(
    [...rules].sort(),
    ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
  );
});

test('every rule renders its own Japanese cause and countermeasure wording', () => {
  const expected = {
    R1: { cause: /数量/, countermeasure: /製造部門/ },
    R2: { cause: /参照行/, countermeasure: /部品ページ/ },
    R3: { cause: /組立チャプタ/, countermeasure: /BOM/ },
    R4: { cause: /梱包/, countermeasure: /スペア/ },
    R5: { cause: /機械可読/, countermeasure: /Markdown/ },
    R6: { cause: /変更ログ/, countermeasure: /下流/ },
    R7: { cause: /変更ログ/, countermeasure: /欠けている参照/ },
    R8: { cause: /サービス/, countermeasure: /組立中/ },
    R9: { cause: /未解決/, countermeasure: /サービス参照/ },
  };
  for (const [rule, patterns] of Object.entries(expected)) {
    const finding = findings.find((entry) => entry.rule === rule);
    assert.ok(finding, `no committed finding for ${rule}`);
    const causes = findingCauses(finding, 'ja');
    const countermeasures = findingCountermeasures(finding, 'ja');
    assert.ok(
      causes.some((cause) => patterns.cause.test(cause.text)),
      `${rule} Japanese causes do not match ${patterns.cause}`,
    );
    assert.ok(
      countermeasures.some((line) => patterns.countermeasure.test(line)),
      `${rule} Japanese countermeasures do not match ${patterns.countermeasure}`,
    );
    assert.ok(
      causes.some((cause) => !/^R5: /.test(cause.text)),
      `${rule} Japanese causes are all the shared R5 candidate`,
    );
  }
});

test('shared candidates keep the stored English text when the finding has no structured values', () => {
  let checkedR5 = 0;
  let checkedR2 = 0;
  for (const finding of findings) {
    const causesJa = findingCauses(finding, 'ja');
    for (let index = 0; index < finding.causes.length; index += 1) {
      const stored = finding.causes[index];
      if (stored.rule === 'R5') {
        assert.equal(
          causesJa[index].text,
          stored.text,
          `${finding.id} R5 candidate was not kept verbatim`,
        );
        checkedR5 += 1;
      }
      if (stored.rule === 'R2') {
        assert.equal(
          causesJa[index].text,
          stored.text,
          `${finding.id} R2 candidate was not kept verbatim`,
        );
        checkedR2 += 1;
      }
    }
  }
  assert.ok(checkedR5 > 0, 'expected at least one stored R5 candidate');
  assert.ok(checkedR2 > 0, 'expected at least one stored R2 candidate');
});

test('template functions default to English and render Japanese on request', () => {
  const emptyEn = r5CauseCandidate([]);
  assert.match(emptyEn.text, /no pre-assembly page lacks a machine-readable parts table/);
  assert.doesNotMatch(emptyEn.text, /プリ組立/);
  const emptyJa = r5CauseCandidate([], 'ja');
  assert.notEqual(emptyJa.text, emptyEn.text);
  assert.match(emptyJa.text, /機械可読な部品表がないプリ組立ページはありません/);

  const paths = ['a.md', 'b.md'];
  assert.ok(r5CauseCandidate(paths).text.includes('a.md, b.md'));
  assert.ok(r5CauseCandidate(paths, 'ja').text.includes('a.md、b.md'));

  const unresolvedFacts = {
    partName: 'Part X',
    unresolvedNames: ['Wood Screws', 'wood screws'],
    r5Paths: paths,
  };
  const unresolvedEn = changedPartUnreachedCauses(unresolvedFacts);
  const unresolvedJa = changedPartUnreachedCauses(unresolvedFacts, 'ja');
  assert.ok(
    unresolvedEn.some((cause) =>
      cause.text.includes('The unresolved name(s) Wood Screws, wood screws'),
    ),
  );
  assert.ok(
    unresolvedJa.some((cause) => cause.text.includes('Wood Screws、wood screws')),
  );

  const serviceFacts = {
    displayName: 'tee nuts',
    pages: ['a.md', 'b.md'],
    candidates: ['Tee Nut'],
    r2Names: ['packing.md'],
  };
  const serviceEn = unresolvedServiceCauses(serviceFacts);
  const serviceJa = unresolvedServiceCauses(serviceFacts, 'ja');
  assert.ok(serviceEn.some((cause) => cause.text.includes('candidate parts: Tee Nut')));
  assert.ok(serviceEn.some((cause) => cause.text.includes('also unresolved on packing.md')));
  assert.ok(serviceJa.some((cause) => cause.text.includes('Tee Nut')));
  assert.ok(serviceJa.some((cause) => cause.text.includes('packing.md')));

  const noCandidateJa = unresolvedServiceCauses(
    { displayName: 'tee nuts', pages: ['a.md'], candidates: [], r2Names: [] },
    'ja',
  );
  assert.ok(
    noCandidateJa.some((cause) => cause.text.includes('候補部品が記録されていません')),
  );

  const serviceOnlyFacts = {
    partName: 'Part X',
    servicePages: ['service.md'],
    packedFiles: ['kit.md'],
    unreferenced: true,
    r5Paths: paths,
  };
  const serviceOnlyEn = serviceOnlyPartCauses(serviceOnlyFacts);
  const serviceOnlyJa = serviceOnlyPartCauses(serviceOnlyFacts, 'ja');
  assert.ok(serviceOnlyEn.some((cause) => cause.text.includes('is packed on kit.md')));
  assert.ok(
    serviceOnlyEn.some((cause) => cause.text.includes('referenced by nothing else')),
  );
  assert.ok(serviceOnlyJa.some((cause) => cause.text.includes('kit.md')));
  assert.ok(
    serviceOnlyJa.some((cause) => cause.text.includes('他のどこからも参照されていません')),
  );

  const inferredFacts = {
    name: 'Old Name',
    inferred: true,
    sections: ['Miscellaneous'],
    files: ['a.md'],
  };
  const inferredEn = changedNameCauses(inferredFacts);
  const inferredJa = changedNameCauses(inferredFacts, 'ja');
  assert.ok(inferredEn[0].text.includes('removal statement'));
  assert.ok(inferredEn[0].text.includes('Old Name'));
  assert.ok(inferredJa[0].text.includes('Old Name'));
  assert.notEqual(inferredJa[0].text, inferredEn[0].text);
});

test('an unsupported language is rejected for body rendering', () => {
  assert.throws(() => findingCauses(findings[0], 'fr'), /lang ja or en/);
  assert.throws(() => findingCountermeasures(findings[0], 'fr'), /lang ja or en/);
});

function fixture(rule, overrides) {
  return {
    id: `${rule}-fixture`,
    rule,
    inferred: false,
    subject: { key: 'fixture', kind: 'part', label: 'fixture', nodeId: 'part:fixture' },
    evidence: [],
    queries: [],
    causes: [],
    countermeasures: [],
    summary: '',
    ...overrides,
  };
}

function partRow(name, extraFacts = {}) {
  return {
    role: 'part',
    nodeId: `part:${name}`,
    sourceFile: 'v1.7/bom/fixture.md',
    line: null,
    facts: { name, slug: 'fixture', categorySlug: 'fixtures', ...extraFacts },
  };
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('structured identifiers with commas stay whole and keep their count in both languages', () => {
  const r4 = fixture('R4', {
    evidence: [
      partRow('Screw, captive'),
      {
        role: 'packing-structure',
        nodeId: 'container:tools, deluxe.md',
        sourceFile: 'tools, deluxe.md',
        line: null,
        facts: { title: 'Tools' },
      },
      {
        role: 'packing-structure',
        nodeId: 'container:hardware-kit.md',
        sourceFile: 'hardware-kit.md',
        line: null,
        facts: { title: 'Hardware Kit' },
      },
    ],
  });
  for (const lang of ['en', 'ja']) {
    const body = findingCauses(r4, lang)
      .map((cause) => cause.text)
      .join('\n');
    assert.equal(countOccurrences(body, 'tools, deluxe.md'), 1, `${lang} split the path`);
    assert.equal(body.includes('tools、deluxe.md'), false, `${lang} rewrote the path`);
    assert.equal(countOccurrences(body, 'Screw, captive'), 1, `${lang} split the name`);
    assert.equal(body.includes('Screw、captive'), false, `${lang} rewrote the name`);
  }
  assert.ok(
    findingCauses(r4, 'ja')[0].text.includes('hardware-kit.md、tools, deluxe.md'),
    'Japanese must keep two items joined by its own separator',
  );
  assert.ok(
    findingCauses(r4, 'en')[0].text.includes('hardware-kit.md, tools, deluxe.md'),
    'English must keep two items',
  );

  const r7 = fixture('R7', {
    evidence: [
      partRow('Screw, captive'),
      {
        role: 'reference',
        nodeId: 'usage:service:page.md@1',
        sourceFile: 'page.md',
        line: 1,
        facts: { displayName: 'Screw, captive', resolvedPart: null, matchMethod: 'unmatched' },
      },
      {
        role: 'reference',
        nodeId: 'usage:service:page.md@2',
        sourceFile: 'page.md',
        line: 2,
        facts: { displayName: 'Bolt', resolvedPart: null, matchMethod: 'unmatched' },
      },
    ],
  });
  const r7Ja = findingCauses(r7, 'ja')
    .map((cause) => cause.text)
    .join('\n');
  assert.ok(r7Ja.includes('Bolt、Screw, captive'), `R7 ja lost the two names: ${r7Ja}`);
  assert.equal(r7Ja.includes('Screw、captive'), false, 'R7 ja rewrote a name');

  const r9 = fixture('R9', {
    subject: { key: 'tee nuts', kind: 'unresolved-name', label: 'tee nuts', nodeId: null },
    evidence: [
      partRow('Screw, captive', { candidate: true }),
      partRow('Nut', { candidate: true }),
      {
        role: 'service',
        nodeId: 'service:tools, deluxe.md',
        sourceFile: 'tools, deluxe.md',
        line: null,
        facts: { kind: 'maintenance', title: 'Tools' },
      },
      {
        role: 'reference',
        nodeId: 'usage:service:tools, deluxe.md@1',
        sourceFile: 'tools, deluxe.md',
        line: 1,
        facts: { displayName: 'tee nuts', resolvedPart: null, matchMethod: 'unmatched' },
      },
    ],
  });
  for (const lang of ['en', 'ja']) {
    const body = findingCauses(r9, lang)
      .map((cause) => cause.text)
      .join('\n');
    assert.equal(countOccurrences(body, 'Screw, captive'), 1, `${lang} split an R9 candidate`);
    assert.equal(body.includes('Screw、captive'), false, `${lang} rewrote an R9 candidate`);
    assert.equal(countOccurrences(body, 'tools, deluxe.md'), 1, `${lang} split an R9 page`);
  }
  assert.ok(
    findingCauses(r9, 'ja').some((cause) => cause.text.includes('Nut、Screw, captive')),
    'Japanese must keep the R9 candidate count',
  );
});

test('an R5 candidate with structured pages is localized without splitting identifiers', () => {
  const finding = fixture('R3', {
    evidence: [
      partRow('Screw, captive'),
      {
        role: 'pre-assembly-page',
        nodeId: 'preassembly:tools, deluxe.md',
        sourceFile: 'tools, deluxe.md',
        line: null,
        facts: { machineReadableReason: 'pdf-only', pdfCount: 1 },
      },
      {
        role: 'pre-assembly-page',
        nodeId: 'preassembly:b.md',
        sourceFile: 'b.md',
        line: null,
        facts: { machineReadableReason: 'no table', pdfCount: 1 },
      },
    ],
  });
  const ja = findingCauses(finding, 'ja');
  const r5 = ja.find((cause) => cause.rule === 'R5');
  assert.ok(r5, 'the R5 candidate must be present');
  assert.ok(r5.text.includes('2 件'), `R5 ja must keep the count: ${r5.text}`);
  assert.ok(
    r5.text.includes('b.md、tools, deluxe.md'),
    `R5 ja must keep both paths intact: ${r5.text}`,
  );
  assert.equal(r5.text.includes('tools、deluxe.md'), false, 'R5 ja rewrote a path');
});

test('an R5 candidate without structured pages falls back to the stored English text', () => {
  const storedR5 = {
    kind: 'inference',
    rule: 'R5',
    text:
      'R5: 1 pre-assembly page(s) have no machine-readable parts table (tools, deluxe.md), ' +
      'so their component lists cannot appear as references.',
  };
  const finding = fixture('R3', {
    evidence: [partRow('Screw, captive')],
    causes: [storedR5],
  });
  const r5 = findingCauses(finding, 'ja').find((cause) => cause.rule === 'R5');
  assert.ok(r5, 'the R5 candidate must be present');
  assert.equal(r5.text, storedR5.text, 'the stored English candidate must be kept verbatim');
  assert.equal(countOccurrences(r5.text, 'tools, deluxe.md'), 1, 'the path must stay one item');
  assert.equal(r5.text.includes('2 pre-assembly'), false, 'no quantity may be invented');
});

test('an R7 unresolved-name candidate without structured rows falls back to stored English', () => {
  const storedR2 = {
    kind: 'inference',
    rule: 'R2',
    text: 'The unresolved name(s) Screw, captive may be this part under another spelling.',
  };
  const finding = fixture('R7', {
    evidence: [partRow('Screw, captive')],
    causes: [storedR2],
  });
  const r2 = findingCauses(finding, 'ja').find((cause) => cause.rule === 'R2');
  assert.ok(r2, 'the R2 candidate must be present');
  assert.equal(r2.text, storedR2.text, 'the stored English candidate must be kept verbatim');
  assert.equal(r2.text.includes('Screw、captive'), false, 'the name must not be rewritten');
});

test('an R9 also-unresolved candidate uses structured pages or the stored English text', () => {
  const storedR2 = {
    kind: 'inference',
    rule: 'R2',
    text: 'The same name is also unresolved on tools, deluxe.md.',
  };
  const base = {
    subject: { key: 'tee nuts', kind: 'unresolved-name', label: 'tee nuts', nodeId: null },
    evidence: [
      {
        role: 'service',
        nodeId: 'service:tools, deluxe.md',
        sourceFile: 'tools, deluxe.md',
        line: null,
        facts: { kind: 'maintenance', title: 'Tools' },
      },
      {
        role: 'reference',
        nodeId: 'usage:service:tools, deluxe.md@1',
        sourceFile: 'tools, deluxe.md',
        line: 1,
        facts: { displayName: 'tee nuts', resolvedPart: null, matchMethod: 'unmatched' },
      },
    ],
    causes: [storedR2],
  };

  const fallback = fixture('R9', base);
  const fallbackR2 = findingCauses(fallback, 'ja').find((cause) => cause.rule === 'R2');
  assert.ok(fallbackR2, 'the R2 candidate must be present');
  assert.equal(fallbackR2.text, storedR2.text, 'the stored English candidate must be kept');
  assert.equal(fallbackR2.text.includes('tools、deluxe.md'), false, 'no path rewrite');

  const structured = fixture('R9', {
    ...base,
    causes: [],
    evidence: [
      ...base.evidence,
      {
        role: 'reference',
        nodeId: 'usage:service:other, page.md@1',
        sourceFile: 'other, page.md',
        line: 1,
        facts: { displayName: 'tee nuts', resolvedPart: null, matchMethod: 'unmatched' },
      },
    ],
  });
  const structuredR2 = findingCauses(structured, 'ja').find((cause) => cause.rule === 'R2');
  assert.ok(structuredR2, 'the structured R2 candidate must be present');
  assert.ok(
    structuredR2.text.includes('other, page.md'),
    `the structured page must stay intact: ${structuredR2.text}`,
  );
  assert.ok(structuredR2.text.includes('でも未解決です'), 'the candidate must be localized');
});

test('the committed findings document stays canonical and matches the pinned digest', () => {
  assert.equal(findingsText, canonicalJson(document));
  assert.equal(JSON.stringify(document).includes('text_ja'), false);

  const pinned = parseFindingsDigestLine(PINNED_FINDINGS_DIGEST);
  assert.ok(pinned, 'the pinned digest must parse');
  assert.equal(pinned.format, 'farmbot-findings-v1');

  const sidecar = parseFindingsDigestLine(readFileSync(FINDINGS_DIGEST_PATH, 'utf8'));
  assert.ok(sidecar, 'the sidecar must parse');
  assert.equal(sidecar.hex, pinned.hex, 'the sidecar is not the pinned digest');

  const actual = createHash('sha256').update(canonicalJson(document)).digest('hex');
  assert.equal(actual, pinned.hex, 'the committed findings bytes changed');
});

test('the default findings filter hides info and keeps the urgent order', () => {
  const ordered = orderFindings(findings);
  const visible = visibleFindings(ordered, false);
  const expected = ordered.filter((finding) => finding.severity !== 'info');

  assert.deepEqual(
    visible.map((finding) => finding.id),
    expected.map((finding) => finding.id),
  );
  assert.ok(visible.every((finding) => finding.severity !== 'info'));
  for (const level of ['action', 'review']) {
    assert.equal(
      visible.filter((finding) => finding.severity === level).length,
      findings.filter((finding) => finding.severity === level).length,
      `the default filter hides ${level} findings`,
    );
  }
});

test('including info shows the whole document in the same order', () => {
  const ordered = orderFindings(findings);
  const visible = visibleFindings(ordered, true);

  assert.deepEqual(
    visible.map((finding) => finding.id),
    ordered.map((finding) => finding.id),
  );
  assert.equal(visible.length, findings.length);
});

test('toggling info leaves the full counts intact', () => {
  const ordered = orderFindings(findings);
  const full = countBySeverity(findings);

  for (const includeInfo of [false, true]) {
    const visible = visibleFindings(ordered, includeInfo);
    assert.deepEqual(countBySeverity(findings), full);
    assert.equal(
      visible.filter((finding) => finding.severity === 'info').length,
      includeInfo ? full.info : 0,
    );
    assert.equal(visible.length, includeInfo ? full.total : full.total - full.info);
  }
});
