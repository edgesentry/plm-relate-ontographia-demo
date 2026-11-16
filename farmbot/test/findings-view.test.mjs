// Tests for the pure view helpers behind the notification panel and the
// finding view. Every expectation is computed from the committed findings
// document; no count, id or summary is written into this file.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  countBySeverity,
  evidenceRows,
  orderFindings,
  parseFindingHash,
  parseFindingsDigestLine,
  summaryLine,
} from '../../src/farmbot/findings-view.mjs';
import {
  unresolvedServiceCauses,
  unresolvedServiceCountermeasures,
} from '../../src/farmbot/agent/templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FINDINGS_PATH = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');
const FINDINGS_DIGEST_PATH = `${FINDINGS_PATH}.sha256`;

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
