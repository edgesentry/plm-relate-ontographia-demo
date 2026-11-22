// The /farmbot/ landing fold contract (#117).
//
// The first frame at the filming viewport (1280x800) must read at a glance:
// a compact 3-step flow strip sits above the sample notification cards, and
// the long explainSources/explainEngine prose is reachable from a closed
// "How it works" disclosure instead of standing open above the fold. These
// checks run without a browser: the App.tsx JSX is the render definition,
// the i18n module is the label source, and the browser smoke re-checks the
// real DOM at 1280x800 in scripts/smoke-farmbot.mjs. No card count is
// hardcoded here; the card catalog stays the source.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { messages } from '../../src/farmbot/i18n.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const APP_PATH = resolve(ROOT, 'src/farmbot/App.tsx');
const APP_SOURCE = readFileSync(APP_PATH, 'utf8');

const FLOW_STEP_KEYS = ['flowStepAgent', 'flowStepEmail', 'flowStepAnalysis'];
const FOLD_TEXT_BUDGET = 90;

/**
 * The JSX block of the element that carries the given testid, from its
 * opening tag to its closing tag.
 *
 * @param {string} source
 * @param {string} tag
 * @param {string} testid
 * @returns {string}
 */
function renderBlock(source, tag, testid) {
  const pattern = new RegExp(`<${tag}[^>]*data-testid="${testid}"[^>]*>`);
  const match = pattern.exec(source);
  assert.ok(match, `src/farmbot/App.tsx renders no <${tag} data-testid="${testid}">`);
  const close = source.indexOf(`</${tag}>`, match.index);
  assert.ok(
    close >= 0,
    `src/farmbot/App.tsx never closes <${tag} data-testid="${testid}">`,
  );
  return source.slice(match.index, close + `</${tag}>`.length);
}

test('the explain prose is collapsed into a closed How it works disclosure', () => {
  const block = renderBlock(APP_SOURCE, 'details', 'how-it-works');
  assert.ok(
    block.includes("t('howItWorksLabel')"),
    'the disclosure summary must use the howItWorksLabel key',
  );
  assert.ok(
    block.includes("t('explainSources')") && block.includes("t('explainEngine')"),
    'the disclosure must keep the full explainSources and explainEngine text reachable',
  );
  const openingTag = block.slice(0, block.indexOf('>') + 1);
  assert.ok(
    !/\bopen\b/.test(openingTag),
    `the disclosure carries an open attribute, so first render expands the prose: ${openingTag}`,
  );
});

test('a compact 3-step flow strip renders above the sample notification cards', () => {
  const strip = renderBlock(APP_SOURCE, 'p', 'flow-strip');
  for (const key of FLOW_STEP_KEYS) {
    assert.ok(
      strip.includes(`t('${key}')`),
      `the flow strip must render the ${key} step`,
    );
  }
  assert.equal(
    (strip.match(/aria-hidden="true"/g) ?? []).length,
    2,
    'the two flow arrows must be decorative spans, not extra text',
  );
  const stripAt = APP_SOURCE.indexOf('data-testid="flow-strip"');
  const cardsAt = APP_SOURCE.indexOf('className="sample-list"');
  assert.ok(
    stripAt >= 0 && cardsAt > stripAt,
    'the flow strip must be rendered above the sample notification card list',
  );
});

test('the flow strip and disclosure labels are short, single-line strings in both languages', () => {
  for (const key of ['howItWorksLabel', ...FLOW_STEP_KEYS]) {
    for (const lang of ['en', 'ja']) {
      const label = messages[lang][key];
      assert.equal(
        typeof label,
        'string',
        `src/farmbot/i18n.ts has no ${lang} ${key} label`,
      );
      assert.ok(label.trim() !== '', `the ${lang} ${key} label is empty`);
      assert.ok(
        !label.includes('\n'),
        `the ${lang} ${key} label must be a single line`,
      );
    }
  }
  for (const lang of ['en', 'ja']) {
    const steps = FLOW_STEP_KEYS.map((key) => messages[lang][key]);
    const total = steps.join('').length;
    assert.ok(
      total <= FOLD_TEXT_BUDGET,
      `the ${lang} flow strip text is ${total} characters, longer than one short line ` +
        `(budget ${FOLD_TEXT_BUDGET}): ${steps.join(' -> ')}`,
    );
  }
  assert.notEqual(
    FLOW_STEP_KEYS.map((key) => messages.ja[key]).join('|'),
    FLOW_STEP_KEYS.map((key) => messages.en[key]).join('|'),
    'the ja flow strip labels copy the en labels',
  );
});
