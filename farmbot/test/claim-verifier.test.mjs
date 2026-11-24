import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

import { loadOntographia } from '@edgesentry/ontographia-wasm';
import initRelate, { RelateDb } from '@relate/relate-wasm';

import { canonicalJson } from '../../src/farmbot/agent/canonical.mjs';
import { INTENT_FILES } from '../../src/farmbot/agent/checks.mjs';
import { verifyAgentClaim, verifyAllAgentClaims } from '../../src/farmbot/claim-verifier.mjs';
import { parseRelationshipEndpoints } from '../../src/farmbot/ontology-relationships.mjs';
import { buildSeedStatements, loadSeed } from '../../src/farmbot/seed-load.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const CLAIMS_PATH = resolve(ROOT, 'farmbot/claims/agent-claims.json');
const ONTOLOGY_PATH = resolve(ROOT, 'farmbot/ontology/farmbot.native.yaml');
const SEED_PATH = resolve(ROOT, 'farmbot/dist/farmbot.seed.json');
const ONTOGRAPHIA_WASM = resolve(
  ROOT,
  'node_modules/@edgesentry/ontographia-wasm/ontographia_wasm.wasm',
);
const RELATE_WASM = resolve(ROOT, 'node_modules/@relate/relate-wasm/relate_bg.wasm');

const claimsFile = JSON.parse(readFileSync(CLAIMS_PATH, 'utf8'));
const ontology = readFileSync(ONTOLOGY_PATH, 'utf8');
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

const intents = {
  q2: JSON.parse(
    readFileSync(resolve(ROOT, 'farmbot/intents/q2-assembly-chapters-for-part.json'), 'utf8'),
  ),
  q3: JSON.parse(
    readFileSync(resolve(ROOT, 'farmbot/intents/q3-structures-for-part.json'), 'utf8'),
  ),
};

const checkIntents = Object.fromEntries(
  INTENT_FILES.map((file) => [
    file,
    JSON.parse(readFileSync(resolve(ROOT, 'farmbot/checks', file), 'utf8')),
  ]),
);

const engine = await loadOntographia(readFileSync(ONTOGRAPHIA_WASM));
await initRelate({ module_or_path: readFileSync(RELATE_WASM) });
const db = new RelateDb();
const relationships = parseRelationshipEndpoints(ontology);
loadSeed(db, buildSeedStatements(seed, relationships));

after(() => {
  db.free();
});

const context = {
  engine,
  ontology,
  intents,
  checkIntents,
  execute(query, params) {
    const envelope = JSON.parse(
      db.execute(query, params === null ? null : JSON.stringify(params)),
    );
    if (envelope.error) throw new Error(envelope.error);
    return envelope.rows ?? [];
  },
};

test('agent-claims.json defines pass and fail fixtures for each of the 3 use cases', () => {
  assert.equal(claimsFile.format, 'farmbot-agent-claims-v1');
  assert.ok(Array.isArray(claimsFile.claims));
  assert.equal(claimsFile.claims.length, 6);

  const byUseCase = new Map();
  for (const fixture of claimsFile.claims) {
    const verdicts = byUseCase.get(fixture.useCase) ?? new Set();
    verdicts.add(fixture.expectedVerdict);
    byUseCase.set(fixture.useCase, verdicts);
  }
  assert.deepEqual(
    [...byUseCase.keys()].sort(),
    ['hallucinated-part', 'missed-change-impact', 'wrong-conclusion'],
  );
  for (const [useCase, verdicts] of byUseCase) {
    assert.deepEqual(
      [...verdicts].sort(),
      ['confirmed', 'rejected'],
      `${useCase} must include both confirmed and rejected fixtures`,
    );
  }
});

test('every checked-in claim fixture produces its expected deterministic verdict and evidence', () => {
  const byId = new Map(
    verifyAllAgentClaims(claimsFile.claims, context).map((result) => [result.claimId, result]),
  );

  for (const fixture of claimsFile.claims) {
    const result = byId.get(fixture.id);
    assert.ok(result, `missing verdict for ${fixture.id}`);
    assert.equal(
      result.verdict,
      fixture.expectedVerdict,
      `${fixture.id}: expected ${fixture.expectedVerdict}, got ${result.verdict} (${result.summary})`,
    );
    assert.ok(
      Array.isArray(result.evidence.queries) && result.evidence.queries.length > 0,
      `${fixture.id}: verdict must carry executed query provenance`,
    );
  }

  const uc1Fail = byId.get('uc1-hallucinated-part-fail');
  assert.equal(uc1Fail.reasonCode, 'missing_part_node');
  assert.deepEqual(uc1Fail.missing.nodes, ['Part(Titanium Servo Coupling)']);
  assert.equal(uc1Fail.missing.edges.length, 1);
  assert.equal(uc1Fail.actual.partExists, false);

  const uc1Pass = byId.get('uc1-hallucinated-part-pass');
  assert.equal(uc1Pass.reasonCode, 'confirmed');
  assert.deepEqual(uc1Pass.missing.nodes, []);
  assert.deepEqual(uc1Pass.missing.edges, []);
  assert.equal(uc1Pass.actual.partExists, true);
  assert.ok(uc1Pass.actual.matchingChapters.includes('v1.7/assembly/gantry.md'));

  const uc2Fail = byId.get('uc2-wrong-conclusion-fail');
  assert.equal(uc2Fail.reasonCode, 'quantity_mismatch');
  assert.equal(uc2Fail.evidence.ruleId, 'R1');
  assert.equal(uc2Fail.actual.packingQuantity, 28);
  assert.equal(uc2Fail.actual.partQuantity, 24);
  assert.equal(uc2Fail.actual.quantityDifference, 4);
  assert.equal(uc2Fail.actual.container, 'v1.7/manufacturing/packing/hardware-kit.md');

  const uc2Pass = byId.get('uc2-wrong-conclusion-pass');
  assert.equal(uc2Pass.reasonCode, 'confirmed');
  assert.equal(uc2Pass.evidence.ruleId, 'R1');
  assert.equal(uc2Pass.actual.packingQuantity, 28);
  assert.equal(uc2Pass.actual.partQuantity, 24);
  assert.equal(uc2Pass.actual.quantityDifference, 4);

  const uc3Fail = byId.get('uc3-missed-change-impact-fail');
  assert.equal(uc3Fail.reasonCode, 'missed_downstream_impact');
  assert.equal(uc3Fail.evidence.ruleId, 'R6');
  assert.equal(uc3Fail.actual.downstreamImpact, true);
  assert.deepEqual(uc3Fail.actual.affectedFiles, [
    'v1.7/assembly/electronics.md',
    'v1.7/extras/maintenance/storing-farmbot-for-winter.md',
    'v1.7/manufacturing/packing/power-supply.md',
  ]);

  const uc3Pass = byId.get('uc3-missed-change-impact-pass');
  assert.equal(uc3Pass.reasonCode, 'confirmed');
  assert.equal(uc3Pass.evidence.ruleId, 'R6');
  assert.equal(uc3Pass.actual.downstreamImpact, true);
  assert.deepEqual(uc3Pass.actual.affectedFiles, [
    'v1.7/assembly/electronics.md',
    'v1.7/extras/maintenance/storing-farmbot-for-winter.md',
    'v1.7/manufacturing/packing/power-supply.md',
  ]);
});

test('verifier is deterministic: running twice returns byte-identical canonical JSON', () => {
  const first = verifyAllAgentClaims(claimsFile.claims, context);
  const second = verifyAllAgentClaims([...claimsFile.claims].reverse(), context);
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test('a real part linked to an unrelated assembly chapter is rejected as missing_relationship', () => {
  const verdict = verifyAgentClaim(
    {
      id: 'uc1-missing-edge-only',
      useCase: 'hallucinated-part',
      claim: {
        kind: 'part-in-assembly',
        partName: '40mm Nut Bar',
        chapterPath: 'v1.7/assembly/electronics.md',
      },
    },
    context,
  );
  assert.equal(verdict.verdict, 'rejected');
  assert.equal(verdict.reasonCode, 'missing_relationship');
  assert.equal(verdict.actual.partExists, true);
  assert.deepEqual(verdict.missing.nodes, []);
  assert.equal(verdict.missing.edges.length, 1);
});

test('new claim verifier files contain no em dashes or curly quotes', () => {
  const forbidden = /[\u2014\u2018\u2019\u201C\u201D]/;
  for (const rel of [
    'farmbot/claims/agent-claims.json',
    'src/farmbot/claim-verifier.mjs',
    'src/farmbot/ClaimVerificationPanel.tsx',
  ]) {
    const text = readFileSync(resolve(ROOT, rel), 'utf8');
    assert.ok(
      !forbidden.test(text),
      `${rel} must not contain em dashes or curly quotes`,
    );
  }
});
