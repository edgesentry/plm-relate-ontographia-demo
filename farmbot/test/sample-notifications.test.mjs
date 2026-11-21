// The sample notification-email cards on /farmbot/ cite committed findings.
//
// Each card is a display citation: its id, rule and severity must come from
// farmbot/dist/farmbot.findings.json, and every card must sit in the scenario
// group its rule's `direction` belongs to. The localized scenario and summary
// strings themselves live in src/farmbot/i18n.ts; the browser smoke compares
// the rendered summaries with summaryLine output for the committed document.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { CHECKS } from '../../src/farmbot/agent/checks.mjs';
import {
  SAMPLE_NOTIFICATIONS,
  SCENARIO_DIRECTIONS,
} from '../../src/farmbot/sample-notifications.mjs';

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
