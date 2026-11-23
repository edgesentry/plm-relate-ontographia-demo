// Sample notification-email cards for the /farmbot/ landing.
//
// Each card cites one finding id from farmbot/dist/farmbot.findings.json, the
// same way farmbot/docs/demo-script.md cites R6-power-supply, so a reviewer's
// first click opens a committed finding. The scenario names group the rules by
// the `direction` field already declared on `CHECKS` in
// src/farmbot/agent/checks.mjs; no product category beyond that grouping is
// invented. The cards are display citations only: nothing here sends email,
// and the deep link reuses the existing finding view.
//
// The localized scenario and summary strings live in src/farmbot/i18n.ts,
// selected by the existing language toggle. The summary keys hold exactly what
// `summaryLine` returns for the cited finding in each language, and the
// browser smoke compares the rendered cards with the committed findings
// document, so a regenerated findings file cannot leave stale sample text.

import { CHECKS } from './agent/checks.mjs';

/**
 * Scenario groups: the `direction` values of the rules each sample scenario
 * covers. The groups partition every direction declared on `CHECKS`.
 *
 * @typedef {'packing' | 'designChange' | 'service' | 'coverage'} SampleScenario
 */

/**
 * Scenario label keys in src/farmbot/i18n.ts, one per scenario group.
 *
 * @typedef {'sampleScenarioPacking'
 *   | 'sampleScenarioDesignChange'
 *   | 'sampleScenarioService'
 *   | 'sampleScenarioCoverage'
 * } SampleScenarioKey
 */

/**
 * Summary keys in src/farmbot/i18n.ts, one per cited finding.
 *
 * @typedef {'sampleSummaryR1NutBar'
 *   | 'sampleSummaryR6PowerSupply'
 *   | 'sampleSummaryR8ShaftCoupler'
 *   | 'sampleSummaryR3Fuse'
 * } SampleSummaryKey
 */

/**
 * One sample notification-email card.
 *
 * @typedef {object} SampleNotification
 * @property {string} id A finding id cited from farmbot/dist/farmbot.findings.json.
 * @property {'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9'} rule
 * @property {'action' | 'review' | 'info'} severity
 * @property {SampleScenario} scenario
 * @property {SampleScenarioKey} scenarioKey
 * @property {SampleSummaryKey} summaryKey
 */

/**
 * The `direction` values each scenario group covers. Rules stay in the group
 * their `direction` belongs to; together the groups cover every rule.
 */
export const SCENARIO_DIRECTIONS = Object.freeze({
  packing: Object.freeze([
    'packing-to-design',
    'process-to-design',
    'packing-to-process',
  ]),
  designChange: Object.freeze(['design-to-downstream']),
  service: Object.freeze(['service-to-design']),
  coverage: Object.freeze(['design-to-process', 'all-to-document']),
});

/** @type {readonly SampleNotification[]} */
export const SAMPLE_NOTIFICATIONS = Object.freeze([
  Object.freeze({
    id: 'R1-40mm-nut-bar-standard',
    rule: 'R1',
    severity: 'action',
    scenario: 'packing',
    scenarioKey: 'sampleScenarioPacking',
    summaryKey: 'sampleSummaryR1NutBar',
  }),
  Object.freeze({
    id: 'R6-power-supply',
    rule: 'R6',
    severity: 'review',
    scenario: 'designChange',
    scenarioKey: 'sampleScenarioDesignChange',
    summaryKey: 'sampleSummaryR6PowerSupply',
  }),
  Object.freeze({
    id: 'R8-shaft-coupler',
    rule: 'R8',
    severity: 'info',
    scenario: 'service',
    scenarioKey: 'sampleScenarioService',
    summaryKey: 'sampleSummaryR8ShaftCoupler',
  }),
  Object.freeze({
    id: 'R3-fuse',
    rule: 'R3',
    severity: 'info',
    scenario: 'coverage',
    scenarioKey: 'sampleScenarioCoverage',
    summaryKey: 'sampleSummaryR3Fuse',
  }),
]);

// Every card must stay in the group its rule's `direction` belongs to, so the
// landing cannot invent a grouping `CHECKS` does not declare. This runs in the
// browser bundle too, like the check-Intent record check in src/farmbot/data.ts.
const directionByRule = new Map(CHECKS.map((rule) => [rule.id, rule.direction]));
for (const card of SAMPLE_NOTIFICATIONS) {
  const direction = directionByRule.get(card.rule);
  if (direction === undefined) {
    throw new Error(`sample notification ${card.id} cites unknown rule ${card.rule}`);
  }
  if (!SCENARIO_DIRECTIONS[card.scenario].includes(direction)) {
    throw new Error(
      `sample notification ${card.id} groups rule ${card.rule} (${direction}) under ` +
        `the wrong scenario`,
    );
  }
}

// The groups together cover every declared direction exactly once, so the
// scenario list on the landing is the check engine's own grouping.
const groupedDirections = Object.values(SCENARIO_DIRECTIONS).flat();
for (const rule of CHECKS) {
  const occurrences = groupedDirections.filter((direction) => direction === rule.direction).length;
  if (occurrences !== 1) {
    throw new Error(
      `rule ${rule.id} (${rule.direction}) is covered by ${occurrences} scenario groups, expected 1`,
    );
  }
}
