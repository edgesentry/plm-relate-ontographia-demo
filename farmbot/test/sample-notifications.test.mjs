// The sample notification-email cards on /farmbot/ cite committed findings.
//
// Each card is a display citation: its id, rule and severity must come from
// farmbot/dist/farmbot.findings.json, and every card must sit in the scenario
// group its rule's `direction` belongs to. The localized summary strings in
// src/farmbot/i18n.ts must stay byte-identical to displaySummaryLine output
// for the cited finding in each language (the on-screen summary drops full
// paths for kind labels and file basenames; the stored `summary` keeps the
// path catalogue), so a regenerated findings file or a changed template cannot
// leave stale sample text; the browser smoke additionally compares the
// rendered cards with the same committed document.
//
// The R1 and R3 cards carry their EBOM / MBOM reconciliation category label
// (issue #124), so the tests below pin that grouping's heading, its three
// category labels, the R1 part-page versus packing-list comparison note and
// the intro that names the info-severity toggle in both languages.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { CHECKS } from '../../src/farmbot/agent/checks.mjs';
import { displaySummaryLine } from '../../src/farmbot/findings-view.mjs';
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

test('every sample notification summary equals displaySummaryLine for its finding', () => {
  for (const card of SAMPLE_NOTIFICATIONS) {
    const finding = findingsDocument.findings.find(
      (candidate) => candidate.id === card.id,
    );
    assert.ok(finding, `sample notification cites unknown finding id ${card.id}`);
    for (const lang of ['en', 'ja']) {
      const actual = messages[lang][card.summaryKey];
      const expected = displaySummaryLine(finding, lang);
      assert.equal(
        actual,
        expected,
        `sample notification ${card.id} ${lang} summary differs from displaySummaryLine\n` +
          `  expected: ${expected}\n  actual:   ${actual}`,
      );
    }
  }
});

test('displaySummaryLine keeps the facts and drops the full paths', () => {
  // The stored summary keeps the path catalogue, so a regenerated findings
  // document cannot drift past this comparison unnoticed.
  for (const finding of findingsDocument.findings) {
    const line = displaySummaryLine(finding, 'en');
    assert.ok(line.length > 0, `${finding.id} has an empty display summary`);
    assert.ok(
      !line.includes('v1.7/'),
      `${finding.id} display summary still shows a full directory path: ${line}`,
    );
  }

  // The four sample cards keep every fact of the stored summary: part names,
  // deltas, variants and the rule's meaning.
  const hero = findingsDocument.findings.find(
    (candidate) => candidate.id === 'R6-power-supply',
  );
  assert.ok(hero, 'the committed file has no R6-power-supply finding');
  assert.equal(
    displaySummaryLine(hero, 'en'),
    'The Change Log links "Power Supply", but assembly, packing, and service ' +
      'pages still list it.',
    'the R6 hero display summary changed wording',
  );
  assert.equal(
    displaySummaryLine(hero, 'ja'),
    '変更ログは "Power Supply" を挙げていますが、組立・梱包・サービスページにも残っています。',
    'the R6 hero Japanese display summary changed wording',
  );

  // A single packing downstream file keeps singular grammar and a kind label.
  const packingOnly = findingsDocument.findings.find((candidate) => {
    if (candidate.rule !== 'R6') return false;
    const roles = new Set(candidate.evidence.map((row) => row.role));
    return roles.has('packing-structure') && !roles.has('service') && !roles.has('structure');
  });
  assert.ok(packingOnly, 'the committed file has no R6 finding with a single packing file');
  assert.match(
    displaySummaryLine(packingOnly, 'en'),
    /^The Change Log (?:links|removal statement names) ".+", but the packing page still lists it\.$/,
    `the single-packing R6 display summary lost its kind label or grammar: ` +
      displaySummaryLine(packingOnly, 'en'),
  );

  // The inferred verb stays a fact of the finding.
  const inferred = findingsDocument.findings.find(
    (candidate) => candidate.rule === 'R6' && candidate.inferred === true,
  );
  assert.ok(inferred, 'the committed file has no inferred R6 finding');
  assert.match(
    displaySummaryLine(inferred, 'en'),
    /^The Change Log removal statement names /,
    'the inferred R6 display summary lost its removal-statement verb',
  );

  // R1 names the packing file, not its directory chain.
  const nutBar = findingsDocument.findings.find(
    (candidate) => candidate.id === 'R1-40mm-nut-bar-standard',
  );
  assert.ok(nutBar, 'the committed file has no R1-40mm-nut-bar-standard finding');
  assert.equal(
    displaySummaryLine(nutBar, 'en'),
    'The hardware-kit packing list and the 40mm Nut Bar part page disagree by ' +
      '4 for standard.',
    'the R1 display summary changed beyond the packing-file basename',
  );
  assert.equal(
    displaySummaryLine(nutBar, 'ja'),
    'hardware-kit の梱包リストと 40mm Nut Bar の部品ページでは、standard の数量が ' +
      '4 だけ異なります。',
    'the R1 Japanese display summary changed beyond the packing-file basename',
  );

  // An R6 finding with no downstream evidence must not interpolate
  // "undefined" in either language.
  const noDownstream = {
    ...hero,
    id: 'R6-synthetic-no-downstream',
    evidence: hero.evidence.filter(
      (row) =>
        row.role !== 'structure' &&
        row.role !== 'packing-structure' &&
        row.role !== 'service',
    ),
  };
  assert.equal(
    displaySummaryLine(noDownstream, 'en'),
    'The Change Log links "Power Supply", but it is not listed anywhere.',
    'the empty-kinds English R6 display summary is unguarded',
  );
  assert.equal(
    displaySummaryLine(noDownstream, 'ja'),
    '変更ログは "Power Supply" を挙げていますが、どこにも残っています。',
    'the empty-kinds Japanese R6 display summary changed wording',
  );
  assert.ok(
    !displaySummaryLine(noDownstream, 'en').includes('undefined'),
    'the empty-kinds English R6 display summary interpolates undefined',
  );

  // An unsupported language is rejected like summaryLine.
  assert.throws(() => displaySummaryLine(nutBar, 'fr'), /lang ja or en/);
  assert.throws(() => displaySummaryLine(null, 'en'), /needs a finding/);
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

test('the reconciliation intro exists and quotes the info-severity toggle label', () => {
  for (const lang of ['en', 'ja']) {
    assert.equal(
      typeof messages[lang].reconciliationIntro,
      'string',
      `src/farmbot/i18n.ts has no ${lang} reconciliationIntro`,
    );
    assert.notEqual(
      messages[lang].reconciliationIntro,
      '',
      `the ${lang} reconciliationIntro is empty`,
    );
    assert.equal(
      typeof messages[lang].reconciliationCategoryLabel,
      'string',
      `src/farmbot/i18n.ts has no ${lang} reconciliationCategoryLabel`,
    );
    assert.notEqual(
      messages[lang].reconciliationCategoryLabel,
      '',
      `the ${lang} reconciliationCategoryLabel is empty`,
    );
  }
  assert.ok(
    messages.en.reconciliationIntro.includes(messages.en.showInfoFindings),
    'the English reconciliationIntro must quote messages.en.showInfoFindings verbatim',
  );
  assert.ok(
    messages.ja.reconciliationIntro.includes(messages.ja.showInfoFindings),
    'the Japanese reconciliationIntro must quote messages.ja.showInfoFindings verbatim',
  );
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
    'Part page vs packing list',
    'the R1 card scenario must keep the part page versus packing list wording',
  );
  assert.equal(
    messages.ja[r1Card.scenarioKey],
    '部品ページと梱包リスト',
    'the R1 card Japanese scenario must keep the same comparison',
  );
  const r3Card = SAMPLE_NOTIFICATIONS.find((card) => card.rule === 'R3');
  assert.ok(r3Card, 'the sample catalog cites no R3 card');
  assert.equal(
    messages.en[r3Card.scenarioKey],
    'Process coverage gaps',
    'the R3 card scenario must name the coverage-gap case',
  );
  assert.equal(
    messages.ja[r3Card.scenarioKey],
    '工程カバレッジの欠落',
    'the R3 card Japanese scenario must name the coverage-gap case',
  );
});
