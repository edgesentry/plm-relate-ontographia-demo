// Unit tests for the recorded primary-query rule behind the evidence query
// block (issue #119). The first expand of `details.evidence-queries` shows one
// primary Intent, its executed Cypher and its bound parameters; the row's
// other queries wait behind the show-all control, and the count on that
// control is derived from the row's own queries. These tests cover the split
// that drives the render; the DOM contract itself (primary visible, the rest
// not visible until the control is used) is asserted on the Playwright smoke
// path in `scripts/smoke-farmbot.mjs`. No inventory total is hardcoded here:
// every count is read from the committed findings document.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { messages } from '../../src/farmbot/i18n.ts';
import { evidenceRows, splitEvidenceQueries } from '../../src/farmbot/findings-view.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FINDINGS_PATH = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');
const findings = JSON.parse(readFileSync(FINDINGS_PATH, 'utf8')).findings;
const powerSupply = findings.find((finding) => finding.id === 'R6-power-supply');
assert.ok(powerSupply, 'the committed findings have no R6-power-supply finding');

test('every R6-power-supply evidence row keeps one primary query from its own list', () => {
  for (const row of evidenceRows(powerSupply)) {
    const { primary, rest } = splitEvidenceQueries(row, row.queries);
    assert.ok(primary, 'a row has no primary query to show first');
    assert.ok(
      row.queries.includes(primary),
      'the primary query is not one of the row\'s own queries',
    );
    assert.equal(
      rest.length,
      row.queries.length - 1,
      'the queries behind the control are not exactly the row\'s other queries',
    );
    for (const query of rest) {
      assert.ok(
        row.queries.includes(query),
        'a query behind the control is not one of the row\'s own queries',
      );
      assert.notEqual(query, primary, 'the primary query is also behind the control');
    }
    // Provenance stays on the primary block: the Intent, the executed Cypher
    // and the bound parameters.
    assert.equal(typeof primary.intent, 'string');
    assert.ok(primary.intent.length > 0, 'the primary query names no Intent');
    assert.equal(typeof primary.cypher, 'string');
    assert.ok(primary.cypher.length > 0, 'the primary query carries no Cypher');
    assert.ok(primary.params && typeof primary.params === 'object', 'the primary query has no bound parameters');
  }
});

test('the packing rows of R6-power-supply keep the packing reference Intent primary', () => {
  const rows = evidenceRows(powerSupply).filter(
    (row) => row.role === 'packing-structure' || row.role === 'packing-line',
  );
  assert.ok(rows.length > 0, 'R6-power-supply has no packing evidence row');
  for (const row of rows) {
    const { primary, rest } = splitEvidenceQueries(row, row.queries);
    // The extract classifies the main carton page as the Carton and every
    // other packing page as a Kit, so a citation of the power-supply packing
    // page comes from the kit packing reference Intent, not from the rule's
    // check Intents.
    assert.ok(
      String(primary.intent).endsWith('/refs-kit.json'),
      `the packing primary is ${String(primary.intent)}, expected the kit packing reference Intent`,
    );
    assert.ok(
      rest.includes(row.queries[0]),
      'the row\'s first check Intent is not behind the show-all control',
    );
  }
});

test('the carton packing rows of the committed R6 findings keep the carton reference Intent primary', () => {
  const cartonFindings = findings.filter((finding) =>
    finding.evidence.some(
      (row) => (row.role === 'packing-structure' || row.role === 'packing-line') && row.sourceFile?.endsWith('/main-carton.md'),
    ),
  );
  assert.ok(cartonFindings.length > 0, 'no committed finding cites the main carton page');
  for (const finding of cartonFindings) {
    for (const row of evidenceRows(finding)) {
      if (row.role !== 'packing-structure' && row.role !== 'packing-line') continue;
      const { primary, rest } = splitEvidenceQueries(row, row.queries);
      assert.ok(
        String(primary.intent).endsWith('/refs-carton.json'),
        `the carton packing primary is ${String(primary.intent)}, expected the carton reference Intent`,
      );
      assert.ok(
        rest.length === row.queries.length - 1,
        'the carton row does not hide its other queries behind the control',
      );
    }
  }
});

test('the service rows of R6-power-supply keep the service reference Intent primary', () => {
  const rows = evidenceRows(powerSupply).filter(
    (row) => row.role === 'service' || (row.role === 'reference' && row.facts?.sourceKind === 'service'),
  );
  assert.ok(rows.length > 0, 'R6-power-supply has no service evidence row');
  for (const row of rows) {
    const { primary } = splitEvidenceQueries(row, row.queries);
    assert.ok(
      String(primary.intent).endsWith('/refs-service.json'),
      `the service primary is ${String(primary.intent)}, expected the service reference Intent`,
    );
  }
});

test('a row that marks its own primary query keeps that mark', () => {
  const queries = [
    { intent: 'farmbot/checks/first.json', cypher: 'CYPHER 25 MATCH first', params: {} },
    { intent: 'farmbot/checks/marked.json', cypher: 'CYPHER 25 MATCH marked', params: {} },
  ];
  const row = { role: 'part', nodeId: 'part:Synthetic', primaryQuery: 'farmbot/checks/marked.json' };
  const { primary, rest } = splitEvidenceQueries(row, queries);
  assert.equal(primary, queries[1], 'the marked query did not win');
  assert.deepEqual(rest, [queries[0]], 'the unmarked query is not behind the control');
});

test('a row with more than one query and no recorded derivation keeps the first query primary', () => {
  const queries = [
    { intent: 'farmbot/checks/first.json', cypher: 'CYPHER 25 MATCH first', params: {} },
    { intent: 'farmbot/checks/second.json', cypher: 'CYPHER 25 MATCH second', params: {} },
    { intent: 'farmbot/checks/third.json', cypher: 'CYPHER 25 MATCH third', params: {} },
  ];
  const row = { role: 'design-change', nodeId: 'designchange:Synthetic' };
  const { primary, rest } = splitEvidenceQueries(row, queries);
  assert.equal(primary, queries[0], 'the first query is not the primary');
  assert.equal(rest.length, queries.length - 1, 'the count behind the control is not derived');
  assert.ok(!rest.includes(primary), 'the primary is also behind the control');
});

test('a synthetic packing row with no recorded packing Intent falls back to the first query', () => {
  const queries = [
    { intent: 'farmbot/checks/only.json', cypher: 'CYPHER 25 MATCH only', params: {} },
    { intent: 'farmbot/checks/other.json', cypher: 'CYPHER 25 MATCH other', params: {} },
  ];
  const row = { role: 'packing-line', nodeId: 'usage:packing:synthetic.md@0/1/0', sourceFile: 'synthetic.md' };
  const { primary, rest } = splitEvidenceQueries(row, queries);
  assert.equal(primary, queries[0], 'a row whose packing Intent is absent did not fall back');
  assert.deepEqual(rest, [queries[1]]);
});

test('an unresolved service reference prefers the unmatched-service Intent', () => {
  const queries = [
    { intent: 'farmbot/checks/changed-parts.json', cypher: 'CYPHER 25 MATCH parts', params: {} },
    { intent: 'farmbot/checks/r9-service-unmatched.json', cypher: 'CYPHER 25 MATCH unmatched', params: { param_0: 'unmatched' } },
    { intent: 'farmbot/checks/refs-service.json', cypher: 'CYPHER 25 MATCH service', params: {} },
  ];
  const row = {
    role: 'reference',
    nodeId: 'usage:service:synthetic.md@1',
    facts: { sourceKind: 'service', matchMethod: 'unmatched' },
  };
  const { primary, rest } = splitEvidenceQueries(row, queries);
  assert.equal(primary, queries[1], 'the unresolved service usage did not pick the unmatched Intent');
  assert.deepEqual(rest, [queries[0], queries[2]]);
});

test('a row with no queries has no primary and nothing behind the control', () => {
  const row = { role: 'part', nodeId: 'part:Synthetic' };
  const { primary, rest } = splitEvidenceQueries(row, []);
  assert.equal(primary, null);
  assert.deepEqual(rest, []);
});

test('the show-all control label exists in both languages', () => {
  assert.ok(
    typeof messages.en.evidenceShowRestLabel === 'string' &&
      messages.en.evidenceShowRestLabel.trim().length > 0,
    'src/farmbot/i18n.ts has no en evidenceShowRestLabel label',
  );
  assert.ok(
    typeof messages.ja.evidenceShowRestLabel === 'string' &&
      messages.ja.evidenceShowRestLabel.trim().length > 0,
    'src/farmbot/i18n.ts has no ja evidenceShowRestLabel label',
  );
  assert.notEqual(
    messages.en.evidenceShowRestLabel,
    messages.ja.evidenceShowRestLabel,
    'the ja control label is a copy of the en label',
  );
});
