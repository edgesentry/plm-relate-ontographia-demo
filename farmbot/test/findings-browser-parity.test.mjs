// The browser supplies the committed seed, the committed check Intents and the
// committed part page paths; it has no DuckDB extract. This file runs the check
// engine with exactly those inputs and requires the committed findings bytes.
//
// It also proves that the result does not depend on the insertion order of the
// check Intent record or of the part page path map.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { loadOntographia } from '@edgesentry/ontographia-wasm';
import initRelate, { RelateDb } from '@relate/relate-wasm';

import { canonicalJson } from '../../src/farmbot/agent/canonical.mjs';
import { INTENT_FILES } from '../../src/farmbot/agent/checks.mjs';
import { collectFindings } from '../../src/farmbot/agent/index.mjs';
import { parseRelationshipEndpoints } from '../../src/farmbot/ontology-relationships.mjs';
import { buildSeedStatements, loadSeed } from '../../src/farmbot/seed-load.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHECKS_DIR = resolve(ROOT, 'farmbot/checks');
const ONTOLOGY_PATH = resolve(ROOT, 'farmbot/ontology/farmbot.native.yaml');
const SEED_PATH = resolve(ROOT, 'farmbot/dist/farmbot.seed.json');
const SEED_DIGEST_PATH = `${SEED_PATH}.sha256`;
const FINDINGS_PATH = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');
const PART_SOURCES_PATH = resolve(ROOT, 'farmbot/dist/farmbot.part-sources.json');
const ONTOGRAPHIA_WASM = resolve(
  ROOT,
  'node_modules/@edgesentry/ontographia-wasm/ontographia_wasm.wasm',
);
const RELATE_WASM = resolve(ROOT, 'node_modules/@relate/relate-wasm/relate_bg.wasm');

const ontologyText = readFileSync(ONTOLOGY_PATH, 'utf8');
const seedBytes = readFileSync(SEED_PATH);
const seed = JSON.parse(seedBytes.toString('utf8'));
const seedDigest = readFileSync(SEED_DIGEST_PATH, 'utf8').trim();
const committedFindingsText = readFileSync(FINDINGS_PATH, 'utf8');
const partSourcesDocument = JSON.parse(readFileSync(PART_SOURCES_PATH, 'utf8'));

const checksForward = Object.fromEntries(
  INTENT_FILES.map((file) => [file, JSON.parse(readFileSync(join(CHECKS_DIR, file), 'utf8'))]),
);

const engine = await loadOntographia(readFileSync(ONTOGRAPHIA_WASM));
await initRelate({ module_or_path: readFileSync(RELATE_WASM) });
const db = new RelateDb();
loadSeed(db, buildSeedStatements(seed, parseRelationshipEndpoints(ontologyText)));

/** A deterministic shuffle order: a small LCG drives the swaps. */
function shuffledOrder(length, seedValue) {
  const order = [...Array(length).keys()];
  let state = seedValue >>> 0;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function shuffledRecord(record, seedValue) {
  const entries = Object.entries(record);
  return Object.fromEntries(
    shuffledOrder(entries.length, seedValue).map((index) => entries[index]),
  );
}

function run(checks, sources) {
  return collectFindings({
    engine,
    ontology: ontologyText,
    checks,
    sources,
    seed: { bytes: seedBytes.length, digest: seedDigest },
    execute(query, params) {
      const envelope = JSON.parse(
        db.execute(query, params === null ? null : JSON.stringify(params)),
      );
      if (envelope.error) throw new Error(envelope.error);
      return envelope.rows ?? [];
    },
  });
}

const sourcesForward = { ...partSourcesDocument.sources };
const browserFindings = run(checksForward, sourcesForward);

test('the committed part-sources file lists part page paths', () => {
  assert.equal(partSourcesDocument.format, 'farmbot-part-sources-v1');
  const entries = Object.entries(partSourcesDocument.sources);
  assert.ok(entries.length > 0, 'the part-sources file is empty');
  for (const [key, value] of entries) {
    assert.match(key, /^part:.+$/, `${key} is not a part node id`);
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 0, `${key} has an empty path`);
  }
  assert.equal(
    readFileSync(PART_SOURCES_PATH, 'utf8'),
    canonicalJson(partSourcesDocument),
    'the part-sources file must be canonical JSON',
  );
});

test('the browser inputs reproduce the committed findings without an extract', () => {
  assert.equal(canonicalJson(browserFindings), committedFindingsText);
});

test('the browser result ignores the input order of checks and sources', () => {
  const checksReversed = Object.fromEntries(Object.entries(checksForward).reverse());
  const checksShuffled = shuffledRecord(checksForward, 43);
  const sourcesReversed = Object.fromEntries(Object.entries(sourcesForward).reverse());
  const sourcesShuffled = shuffledRecord(sourcesForward, 44);
  const sourceEntries = Object.entries(sourcesForward);
  const sourcesMap = new Map(
    shuffledOrder(sourceEntries.length, 45).map((index) => sourceEntries[index]),
  );

  const reference = canonicalJson(browserFindings);
  for (const [label, checks, sources] of [
    ['reversed checks', checksReversed, sourcesForward],
    ['shuffled checks', checksShuffled, sourcesForward],
    ['reversed sources', checksForward, sourcesReversed],
    ['shuffled sources', checksForward, sourcesShuffled],
    ['map sources', checksForward, sourcesMap],
    ['both shuffled', checksShuffled, sourcesShuffled],
  ]) {
    assert.equal(
      canonicalJson(run(checks, sources)),
      reference,
      `${label} changed the findings`,
    );
  }
});

test('no finding repeats an evidence row in the browser result', () => {
  assert.equal(browserFindings.findings.length, JSON.parse(committedFindingsText).findings.length);
  for (const finding of browserFindings.findings) {
    const identities = finding.evidence.map((row) =>
      JSON.stringify([row.role, row.nodeId, row.sourceFile, row.line]),
    );
    assert.equal(
      new Set(identities).size,
      identities.length,
      `${finding.id} repeats an evidence row`,
    );
  }
});
