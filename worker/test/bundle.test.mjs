import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUNDLE_FORMAT,
  BUNDLE_PATH,
  DIGEST_PATH,
  FINDINGS_PATH,
  buildBundle,
  generateBundle,
  verifyDigest,
} from '../../scripts/build-notify-bundle.mjs';
import { generatedBundlePath } from './helpers.mjs';

test('the committed bundle matches a fresh in-memory build byte for byte', () => {
  const committed = readFileSync(generatedBundlePath, 'utf8');
  assert.equal(committed, generateBundle());
});

test('severity counts equal those recomputed from the source findings', () => {
  const source = JSON.parse(readFileSync(FINDINGS_PATH, 'utf8'));
  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
  const expected = { action: 0, review: 0, info: 0 };
  for (const finding of source.findings) expected[finding.severity] += 1;
  assert.deepEqual(bundle.severityCounts, expected);
  assert.equal(bundle.format, BUNDLE_FORMAT);
});

test('the bundle digest is the committed findings sidecar line', () => {
  const sidecar = readFileSync(DIGEST_PATH, 'utf8').trim();
  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
  assert.equal(bundle.findingsDigest, sidecar);
});

test('findings and rules are sorted by id and finding ids are unique', () => {
  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
  const findingIds = bundle.findings.map((finding) => finding.id);
  assert.deepEqual(findingIds, [...findingIds].sort());
  assert.equal(new Set(findingIds).size, findingIds.length);
  const ruleIds = bundle.rules.map((rule) => rule.id);
  assert.deepEqual(ruleIds, [...ruleIds].sort());
  for (const finding of bundle.findings) {
    assert.deepEqual(Object.keys(finding), ['id', 'rule', 'severity', 'severityScore', 'summary']);
  }
});

test('buildBundle rejects duplicate ids and unknown severities', () => {
  const base = {
    id: 'R1-one',
    rule: 'R1',
    severity: 'action',
    severityScore: 1,
    summary: 'one',
  };
  assert.throws(
    () =>
      buildBundle(
        { findings: [base, { ...base }], rules: [] },
        `farmbot-findings-v1 sha256:${'a'.repeat(64)}`,
      ),
    /duplicate finding id/,
  );
  assert.throws(
    () =>
      buildBundle(
        { findings: [{ ...base, severity: 'critical' }], rules: [] },
        `farmbot-findings-v1 sha256:${'a'.repeat(64)}`,
      ),
    /unknown severity/,
  );
});

test('verifyDigest rejects a mismatched sidecar and a malformed line', () => {
  const bytes = Buffer.from('{"findings":[]}\n');
  assert.throws(
    () => verifyDigest(bytes, `farmbot-findings-v1 sha256:${'a'.repeat(64)}`),
    /sidecar says/,
  );
  assert.throws(() => verifyDigest(bytes, 'not-a-digest'), /must contain exactly/);
});
