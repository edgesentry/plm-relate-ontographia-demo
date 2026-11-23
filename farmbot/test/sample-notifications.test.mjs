// The sample notification-email cards on /farmbot/ cite committed findings.
//
// Each card is a display citation: its id, rule and severity must come from
// farmbot/dist/farmbot.findings.json, and every card must sit in the scenario
// group its rule's `direction` belongs to. The localized summary strings in
// src/farmbot/i18n.ts must stay byte-identical to summaryLine output for the
// cited finding in each language, so a regenerated findings file or a changed
// template cannot leave stale sample text; the browser smoke additionally
// compares the rendered cards with the same committed document.
//
// The R1 and R3 cards carry their EBOM / MBOM reconciliation category label
// (issue #124), so the tests below pin that grouping's heading, its three
// category labels, and the R1 part-page versus packing-list comparison note in
// both languages.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { CHECKS } from '../../src/farmbot/agent/checks.mjs';
import { summaryLine } from '../../src/farmbot/findings-view.mjs';
import { messages } from '../../src/farmbot/i18n.ts';
import {
  SAMPLE_NOTIFICATIONS,
  SCENARIO_DIRECTIONS,
} from '../../src/farmbot/sample-notifications.mjs';
import {
  RECONCILIATION_CATEGORY_KEYS,
  RECONCILIATION_RULES,
  reconciliationCategoryKey,
} from '../../src/farmbot/reconciliation.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FINDINGS_DOC = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');

const findingsDocument = JSON.parse(readFileSync(FINDINGS_DOC, 'utf8'));

test('every sample notification cites one committed finding as stated', () => {
  for (const card of SAMPLE_NOTIFICATIONS) {
    const finding = findingsDocument.findings.find(
      (candidate) => candidate.id === card.id,
    );
    assert.ok(finding, `sample notification cites unknown finding id ${card.id}`);
    assert.equal(
      finding.rule,
      card.rule,
      `sample notification ${card.id} states rule ${card.rule}, the committed finding has ${finding.rule}`,
    );
    assert.equal(
      finding.severity,
      card.severity,
      `sample notification ${card.id} states severity ${card.severity}, the committed finding has ${finding.severity}`,
    );
  }
});

test('every sample notification stays in its rule direction group', () => {
  const directionByRule = new Map(CHECKS.map((rule) => [rule.id, rule.direction]));
  for (const card of SAMPLE_NOTIFICATIONS) {
    const direction = directionByRule.get(card.rule);
    assert.ok(direction, `sample notification ${card.id} cites unknown rule ${card.rule}`);
    assert.ok(
      SCENARIO_DIRECTIONS[card.scenario].includes(direction),
      `sample notification ${card.id} groups rule ${card.rule} (${direction}) under ` +
        `scenario ${card.scenario}`,
    );
  }
});

test('the scenario groups cover every rule direction exactly once', () => {
  const grouped = Object.values(SCENARIO_DIRECTIONS).flat();
  for (const rule of CHECKS) {
    const occurrences = grouped.filter((direction) => direction === rule.direction).length;
    assert.equal(
      occurrences,
      1,
      `rule ${rule.id} (${rule.direction}) is covered by ${occurrences} scenario groups`,
    );
  }
});

test('no two sample notifications cite the same finding or scenario', () => {
  const ids = SAMPLE_NOTIFICATIONS.map((card) => card.id);
  assert.equal(new Set(ids).size, ids.length, 'a finding id is cited twice');
  const scenarios = SAMPLE_NOTIFICATIONS.map((card) => card.scenario);
  assert.equal(
    new Set(scenarios).size,
    scenarios.length,
    'a scenario group is cited twice',
  );
});

test('every sample notification summary equals summaryLine for its finding', () => {
  for (const card of SAMPLE_NOTIFICATIONS) {
    const finding = findingsDocument.findings.find(
      (candidate) => candidate.id === card.id,
    );
    assert.ok(finding, `sample notification cites unknown finding id ${card.id}`);
    for (const lang of ['en', 'ja']) {
      const actual = messages[lang][card.summaryKey];
      const expected = summaryLine(finding, lang);
      assert.equal(
        actual,
        expected,
        `sample notification ${card.id} ${lang} summary differs from summaryLine\n` +
          `  expected: ${expected}\n  actual:   ${actual}`,
      );
    }
  }
});

test('the reconciliation group heading and category labels stay exact in both languages', () => {
  assert.equal(messages.en.reconciliationHeading, 'EBOM / MBOM reconciliation');
  assert.equal(messages.ja.reconciliationHeading, 'EBOM と MBOM の照合');
  assert.equal(messages.en.reconciliationCategoryR1, 'Quantity difference');
  assert.equal(messages.ja.reconciliationCategoryR1, '数量の相違');
  assert.equal(messages.en.reconciliationCategoryR3, 'Missing from process');
  assert.equal(messages.ja.reconciliationCategoryR3, '工程から欠落');
  assert.equal(messages.en.reconciliationCategoryR4, 'Manufacturing- or packing-only');
  assert.equal(messages.ja.reconciliationCategoryR4, '製造または梱包にのみ存在');
  assert.equal(messages.en.reconciliationR1Note, 'Part page versus packing list');
  assert.equal(messages.ja.reconciliationR1Note, '部品ページと梱包リストの比較');
});

test('the reconciliation rules are committed checks with a label in each language', () => {
  assert.deepEqual(
    [...RECONCILIATION_RULES].sort(),
    ['R1', 'R3', 'R4'],
    'the reconciliation grouping must cover exactly R1, R3 and R4',
  );
  const committedRules = new Set(CHECKS.map((rule) => rule.id));
  for (const rule of RECONCILIATION_RULES) {
    assert.ok(
      committedRules.has(rule),
      `reconciliation rule ${rule} is not a committed check`,
    );
    const key = RECONCILIATION_CATEGORY_KEYS[rule];
    assert.equal(reconciliationCategoryKey(rule), key, `${rule} maps to its own key`);
    for (const lang of ['en', 'ja']) {
      assert.equal(
        typeof messages[lang][key],
        'string',
        `src/farmbot/i18n.ts has no ${lang} ${key} label`,
      );
      assert.notEqual(messages[lang][key], '', `the ${lang} ${key} label is empty`);
    }
  }
  assert.equal(
    reconciliationCategoryKey('R6'),
    null,
    'R6 must stay outside the reconciliation grouping',
  );
  assert.equal(
    reconciliationCategoryKey('R8'),
    null,
    'R8 must stay outside the reconciliation grouping',
  );
});

test('the sample cards that cite a reconciliation rule are the R1 and R3 cards', () => {
  const grouped = SAMPLE_NOTIFICATIONS.filter(
    (card) => reconciliationCategoryKey(card.rule) !== null,
  ).map((card) => card.rule);
  assert.ok(
    grouped.includes('R1'),
    `the R1 sample card must carry a reconciliation category, got ${grouped.join(', ')}`,
  );
  assert.ok(
    grouped.includes('R3'),
    `the R3 sample card must carry a reconciliation category, got ${grouped.join(', ')}`,
  );
  const r1Card = SAMPLE_NOTIFICATIONS.find((card) => card.rule === 'R1');
  assert.ok(r1Card, 'the sample catalog cites no R1 card');
  assert.equal(
    messages.en[r1Card.scenarioKey],
    'Reconciliation: part page versus packing list',
    'the R1 card scenario must keep the part page versus packing list wording',
  );
  assert.equal(
    messages.ja[r1Card.scenarioKey],
    '照合: 部品ページと梱包リストの比較',
    'the R1 card Japanese scenario must keep the same comparison',
  );
  const r3Card = SAMPLE_NOTIFICATIONS.find((card) => card.rule === 'R3');
  assert.ok(r3Card, 'the sample catalog cites no R3 card');
  assert.match(
    messages.en[r3Card.scenarioKey],
    /^Reconciliation: /,
    'the R3 card scenario must name the reconciliation group',
  );
  assert.match(
    messages.ja[r3Card.scenarioKey],
    /^照合: /,
    'the R3 card Japanese scenario must name the reconciliation group',
  );
});
