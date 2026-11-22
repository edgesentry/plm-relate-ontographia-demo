// The deterministic Cypher-output rejection demonstration on /farmbot/.
//
// The fixture is validator input only. It must be rejected by the same closed
// routing parser that checks model text, before the compiler is consulted, and
// the localized labels must exist in both language blocks.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { CHECK_CATALOG } from '../../src/farmbot/check-catalog.mjs';
import { parseCheckRouting, prepareCheckProposal } from '../../src/farmbot/check-routing.mjs';
import { messages } from '../../src/farmbot/i18n.ts';
import {
  REJECTION_DEMO_UNEXPECTED_DETAIL,
  REJECTED_ROUTING_DEMO_ID,
  REJECTED_ROUTING_DEMO_TEXT,
  phaseAfterRejectionDemo,
  prepareRejectionDemo,
} from '../../src/farmbot/rejection-demo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const allowedValues = JSON.parse(
  readFileSync(join(ROOT, 'farmbot/dist/farmbot.allowed-values.json'), 'utf8'),
);
const ontology = readFileSync(join(ROOT, 'farmbot/ontology/farmbot.native.yaml'), 'utf8');
const checkIntents = Object.fromEntries(
  [...new Set(CHECK_CATALOG.flatMap((check) => check.intents))].map((file) => [
    file,
    JSON.parse(readFileSync(join(ROOT, 'farmbot/checks', file), 'utf8')),
  ]),
);

function compileOptions() {
  let compileCalls = 0;
  const compiler = {
    buildCypher() {
      compileCalls += 1;
      throw new Error('the rejection demo must never reach the compiler');
    },
  };
  return {
    options: { allowedValues, checkIntents, compiler, ontology },
    calls: () => compileCalls,
  };
}

test('the demonstration fixture is a fixed non-empty Cypher-like string', () => {
  assert.equal(REJECTED_ROUTING_DEMO_ID, 'cypher-output');
  assert.equal(typeof REJECTED_ROUTING_DEMO_TEXT, 'string');
  assert.ok(REJECTED_ROUTING_DEMO_TEXT.length > 0);
  assert.equal(Object.isFrozen(REJECTED_ROUTING_DEMO_TEXT), true);
});

test('the closed parser rejects the fixture with a Cypher reason', () => {
  const parsed = parseCheckRouting(REJECTED_ROUTING_DEMO_TEXT, allowedValues);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((error) => error.includes('Cypher')), parsed.errors.join('\n'));
});

test('the fixture is rejected at validation without calling the compiler', () => {
  const { options, calls } = compileOptions();
  const prepared = prepareCheckProposal(REJECTED_ROUTING_DEMO_TEXT, options);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.stage, 'validation');
  assert.ok(prepared.errors.some((error) => error.includes('Cypher')), prepared.errors.join('\n'));
  assert.equal(calls(), 0);
});

test('the rejection is deterministic across repeated calls', () => {
  const { options, calls } = compileOptions();
  const results = Array.from({ length: 3 }, () =>
    prepareCheckProposal(REJECTED_ROUTING_DEMO_TEXT, options),
  );
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  assert.equal(calls(), 0);
});

test('the rejection labels are present in both i18n blocks', () => {
  const en = messages.en;
  const ja = messages.ja;
  assert.equal(
    Object.keys(en).join('|'),
    Object.keys(ja).join('|'),
    'ja/en i18n key sets or order differ',
  );
  const expected = {
    checkRejectionDemoButton: ['Show a rejected routing output', '拒否されるルーティング出力を表示'],
    checkRejectionDemoHint: [
      'Fixed sample, not a model result: this feeds a Cypher-like text through the same validator that checks model output. Nothing is compiled or executed.',
      '固定のサンプルであり、モデルの出力ではありません。Cypher に見えるテキストを、モデル出力と同じ検証に通します。コンパイルも実行もしません。',
    ],
    checkRejectionDemoSampleLabel: [
      'Fixed sample input (not a model result)',
      '固定のサンプル入力（モデルの出力ではありません）',
    ],
  };
  for (const [key, [enValue, jaValue]] of Object.entries(expected)) {
    assert.equal(typeof en[key], 'string', `missing en.${key}`);
    assert.equal(typeof ja[key], 'string', `missing ja.${key}`);
    assert.equal(en[key], enValue, `en.${key}`);
    assert.equal(ja[key], jaValue, `ja.${key}`);
  }
});

test('pressing the demo while generating restores the ready phase, like selectChip', () => {
  assert.equal(phaseAfterRejectionDemo('generating'), 'ready');
  for (const phase of [
    'checking',
    'unsupported',
    'consent',
    'declined',
    'loading',
    'ready',
    'error',
  ]) {
    assert.equal(phaseAfterRejectionDemo(phase), phase, phase);
  }
});

test('the demo helper rejects the fixture without incrementing compile attempts', () => {
  const prepared = prepareRejectionDemo(REJECTED_ROUTING_DEMO_TEXT, {
    allowedValues,
    checkIntents,
    ontology,
  });
  assert.equal(prepared.kind, 'validation');
  assert.ok(prepared.detail.includes('Cypher'), prepared.detail);
  assert.equal(prepared.sample, REJECTED_ROUTING_DEMO_TEXT);
  assert.equal(prepared.compileAttemptsDelta, 0);
});

test('an unexpectedly valid fixture still does not compile or increment compile attempts', () => {
  const accepted = JSON.stringify({ check: 'R1', parameter: null });
  const parsed = parseCheckRouting(accepted, allowedValues);
  assert.equal(parsed.ok, true, 'precondition: R1 with a null parameter must validate');

  let compileCalls = 0;
  const compiler = {
    buildCypher() {
      compileCalls += 1;
      return 'MATCH (n) RETURN n';
    },
  };
  // The production chip/model path would compile this input.
  const throughCompiler = prepareCheckProposal(accepted, {
    allowedValues,
    checkIntents,
    compiler,
    ontology,
  });
  assert.equal(throughCompiler.ok, true, throughCompiler.ok ? '' : throughCompiler.errors.join('\n'));
  assert.ok(compileCalls > 0);

  const callsBeforeDemo = compileCalls;
  const prepared = prepareRejectionDemo(accepted, { allowedValues, checkIntents, ontology });
  assert.equal(prepared.kind, 'validation');
  assert.equal(prepared.detail, REJECTION_DEMO_UNEXPECTED_DETAIL);
  assert.equal(prepared.sample, accepted);
  assert.equal(prepared.compileAttemptsDelta, 0);
  // The helper hard-codes compiler: null, so the spy above is not used again.
  assert.equal(compileCalls, callsBeforeDemo);
});
