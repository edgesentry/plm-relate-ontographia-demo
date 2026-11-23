// The EBOM / MBOM reconciliation grouping on /farmbot/ (issue #124).
//
// R1, R3 and R4 are already computed as three separate rules. This module maps
// each of them to its category label key in src/farmbot/i18n.ts so the finding
// list, the finding view and the sample notification cards show one shared
// label per category, and every other rule stays outside the grouping. The map
// is presentation only: no rule, Intent, finding or seed value changes here.

import { CHECKS } from './agent/checks.mjs';

/**
 * Category label keys in src/farmbot/i18n.ts, one per reconciliation rule.
 *
 * @type {Record<string, import('./i18n.ts').MessageKey>}
 */
export const RECONCILIATION_CATEGORY_KEYS = Object.freeze({
  R1: 'reconciliationCategoryR1',
  R3: 'reconciliationCategoryR3',
  R4: 'reconciliationCategoryR4',
});

/** The rules presented as the EBOM / MBOM reconciliation categories. */
export const RECONCILIATION_RULES = Object.freeze([
  ...Object.keys(RECONCILIATION_CATEGORY_KEYS),
]);

/**
 * The category label key of one rule, or null when the rule stays ungrouped.
 *
 * @param {string} rule
 * @returns {import('./i18n.ts').MessageKey | null}
 */
export function reconciliationCategoryKey(rule) {
  return Object.prototype.hasOwnProperty.call(RECONCILIATION_CATEGORY_KEYS, rule)
    ? RECONCILIATION_CATEGORY_KEYS[rule]
    : null;
}

// Every reconciliation rule must be a committed check, so the grouping cannot
// invent a rule the engine never runs. This runs in the browser bundle too,
// like the scenario guard in src/farmbot/sample-notifications.mjs.
const committedRules = new Set(CHECKS.map((rule) => rule.id));
for (const rule of RECONCILIATION_RULES) {
  if (!committedRules.has(rule)) {
    throw new Error(`reconciliation category cites unknown rule ${rule}`);
  }
}
