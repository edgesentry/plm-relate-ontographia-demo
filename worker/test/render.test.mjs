import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyCapFromEnv,
  deepLink,
  escapeHtml,
  normalizeBaseUrl,
  rankFindings,
  renderFinding,
  renderSummary,
  timingSafeEqualStrings,
} from '../notify.ts';
import { bundle, cloneBundle, shuffled } from './helpers.mjs';

const BASE = 'https://demo.example.invalid';

function bundleWithSummary(summary, idSeed = 'R1-weird.id_with-chars') {
  return cloneBundle({
    findings: [
      { id: idSeed, rule: 'R1', severity: 'action', severityScore: 99, summary },
      { id: 'R2-second', rule: 'R2', severity: 'info', severityScore: 1, summary: 'second' },
    ],
    rules: [
      { id: 'R1', title: 'Packing quantity differs' },
      { id: 'R2', title: 'Unmatched reference' },
    ],
    severityCounts: { action: 1, review: 0, info: 1 },
  });
}

test('HTML escapes the five significant characters in interpolated values', () => {
  assert.equal(escapeHtml(`<script>&"'`), '&lt;script&gt;&amp;&quot;&#39;');
  const rendered = renderSummary(bundleWithSummary(`<script>&"'`), BASE);
  assert.ok(!rendered.html.includes('<script>'));
  assert.ok(rendered.html.includes('&lt;script&gt;&amp;&quot;&#39;'));
  // Plain text is not HTML; it intentionally carries the summary verbatim.
  assert.ok(rendered.text.includes('<script>&"\''));
});

test('HTML uses no remote images, no <img>, and no plain http URLs', () => {
  const summary = renderSummary(bundleWithSummary('plain summary'), BASE);
  const finding = renderFinding(bundleWithSummary('plain summary'), BASE, 'R1-weird.id_with-chars');
  for (const html of [summary.html, finding.html]) {
    assert.ok(!/<img\b/i.test(html));
    assert.ok(!html.includes('http://'));
    assert.ok(!/<link\b/i.test(html));
    assert.ok(!/<style\b/i.test(html));
  }
});

test('deep links point at the FarmBot hash and encode the finding id', () => {
  const id = 'R1-weird.id_with-chars';
  const rendered = renderSummary(bundleWithSummary('summary', id), BASE);
  const link = `${BASE}/farmbot/#finding=${encodeURIComponent(id)}`;
  assert.equal(deepLink(BASE, id), link);
  assert.ok(rendered.text.includes(link));
  assert.ok(rendered.html.includes(link.replace(/&/g, '&amp;')));
  assert.ok(rendered.text.includes('#finding='));
});

test('renderFinding returns null for an id outside the bundle', () => {
  assert.equal(renderFinding(bundle, BASE, 'R9-missing'), null);
});

test('subjects never contain CR or LF', () => {
  const weird = cloneBundle({
    findings: [
      { id: 'bad\r\nBcc: someone@example.invalid', rule: 'R1', severity: 'action', severityScore: 1, summary: 'x' },
    ],
    severityCounts: { action: 1, review: 0, info: 0 },
  });
  assert.ok(!/[\r\n]/.test(renderSummary(weird, BASE).subject));
  const finding = renderFinding(weird, BASE, 'bad\r\nBcc: someone@example.invalid');
  assert.ok(finding);
  assert.ok(!/[\r\n]/.test(finding.subject));
});

test('ranking is deterministic: action > review > info, then score desc, then id asc', () => {
  const finding = (id, severity, severityScore) => ({
    id,
    rule: 'R1',
    severity,
    severityScore,
    summary: id,
  });
  const ranked = rankFindings([
    finding('b', 'action', 5),
    finding('a', 'action', 5),
    finding('c', 'action', 9),
    finding('d', 'review', 100),
    finding('e', 'info', 1000),
    finding('a', 'action', 5),
  ]);
  assert.deepEqual(
    ranked.map((item) => item.id),
    ['c', 'a', 'b', 'd', 'e'],
  );
});

test('the summary lists at most 10 unique findings in rank order', () => {
  const ranked = rankFindings(bundle.findings);
  assert.equal(ranked.length, 10);
  assert.equal(new Set(ranked.map((finding) => finding.id)).size, ranked.length);
  const rendered = renderSummary(bundle, BASE);
  const listedIds = rendered.text
    .split('\n')
    .map((line) => /^- \[[^\]]+\] ([^:]+): /.exec(line))
    .filter(Boolean)
    .map((match) => match[1]);
  assert.deepEqual(listedIds, ranked.map((finding) => finding.id));
});

test('shuffling the bundle several times yields byte-identical emails', () => {
  const baseline = renderSummary(bundle, BASE);
  for (const seed of [1, 7, 42, 1234, 987654321]) {
    const shuffledBundle = cloneBundle({ findings: shuffled(bundle.findings, seed) });
    const rendered = renderSummary(shuffledBundle, BASE);
    assert.equal(rendered.subject, baseline.subject, `seed ${seed}`);
    assert.equal(rendered.text, baseline.text, `seed ${seed}`);
    assert.equal(rendered.html, baseline.html, `seed ${seed}`);
  }
});

test('constant-time comparison accepts equal strings and rejects differences', async () => {
  assert.equal(await timingSafeEqualStrings('a'.repeat(48), 'a'.repeat(48)), true);
  assert.equal(await timingSafeEqualStrings('a'.repeat(48), 'b'.repeat(48)), false);
  assert.equal(await timingSafeEqualStrings('a'.repeat(48), 'a'.repeat(47)), false);
  assert.equal(await timingSafeEqualStrings('', ''), true);
});

test('PUBLIC_BASE_URL must be bare https with no path, query, hash, or credentials', () => {
  assert.equal(normalizeBaseUrl('https://demo.example.invalid'), 'https://demo.example.invalid');
  for (const value of [
    'http://demo.example.invalid',
    'https://demo.example.invalid/farmbot',
    'https://demo.example.invalid?x=1',
    'https://demo.example.invalid#x',
    'https://user:pass@demo.example.invalid',
    'demo.example.invalid',
    '',
    undefined,
  ]) {
    assert.equal(normalizeBaseUrl(value), null, String(value));
  }
});

test('a single trailing slash on PUBLIC_BASE_URL is normalized away', () => {
  assert.equal(normalizeBaseUrl('https://demo.example.invalid/'), 'https://demo.example.invalid');
  assert.equal(normalizeBaseUrl('https://demo.example.invalid//'), null);
});

test('NOTIFY_DAILY_CAP: empty is the default, digits only, anything else is invalid', () => {
  assert.equal(dailyCapFromEnv(undefined), 10);
  assert.equal(dailyCapFromEnv(''), 10);
  assert.equal(dailyCapFromEnv('3'), 3);
  assert.equal(dailyCapFromEnv('007'), 7);
  assert.equal(dailyCapFromEnv('0'), 0);
  for (const value of ['off', '-1', '2.9', ' 5', '5 ', '1e3', 'not-a-number', '+5', '5\n']) {
    assert.equal(dailyCapFromEnv(value), null, JSON.stringify(value));
  }
});
