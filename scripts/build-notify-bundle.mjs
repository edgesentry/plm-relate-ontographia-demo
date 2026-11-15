// Build the Worker's notification bundle from the committed FarmBot findings.
//
// The Worker never reads findings from a request or from `dist/` at runtime.
// Instead this script copies the fields the email renderer needs into
// `worker/generated/notify-bundle.json` (committed) after checking the findings
// file against its sidecar digest. `npm run build` runs this first, so a stale
// or tampered findings file fails the build instead of reaching an inbox.
//
// The output is deterministic: fixed key order, findings and rules sorted by
// id, two-space indentation, and a trailing newline.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FINDINGS_PATH = join(root, 'farmbot/dist/farmbot.findings.json');
export const DIGEST_PATH = join(root, 'farmbot/dist/farmbot.findings.json.sha256');
export const BUNDLE_PATH = join(root, 'worker/generated/notify-bundle.json');

export const BUNDLE_FORMAT = 'farmbot-notify-v1';
const DIGEST_FORMAT = 'farmbot-findings-v1';
const DIGEST_LINE = /^farmbot-findings-v1 sha256:([0-9a-f]{64})$/;
const SEVERITIES = ['action', 'review', 'info'];

const codeUnitCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

const requireString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

/**
 * Verify the findings bytes against the sidecar line and return the canonical
 * digest line (`farmbot-findings-v1 sha256:<hex>`).
 */
export function verifyDigest(findingsBytes, digestText) {
  const line = digestText.trim();
  const match = DIGEST_LINE.exec(line);
  if (!match) {
    throw new Error(
      `${DIGEST_PATH} must contain exactly "farmbot-findings-v1 sha256:<64 hex>", got ${JSON.stringify(line)}`,
    );
  }
  const actual = createHash('sha256').update(findingsBytes).digest('hex');
  if (actual !== match[1]) {
    throw new Error(
      `farmbot.findings.json SHA-256 is ${actual}, but the sidecar says ${match[1]}; rebuild the extract before notifying`,
    );
  }
  return `${DIGEST_FORMAT} sha256:${actual}`;
}

/**
 * Build the bundle object from parsed findings and its canonical digest line.
 * Exported so the drift test can regenerate in memory.
 */
export function buildBundle(source, findingsDigest) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.findings)) {
    throw new Error('farmbot.findings.json must contain a findings array');
  }
  const seen = new Set();
  const findings = source.findings.map((finding) => {
    const id = requireString(finding?.id, 'finding.id');
    if (seen.has(id)) throw new Error(`duplicate finding id: ${id}`);
    seen.add(id);
    const severity = requireString(finding?.severity, `finding ${id}.severity`);
    if (!SEVERITIES.includes(severity)) {
      throw new Error(`finding ${id} has unknown severity ${JSON.stringify(severity)}`);
    }
    if (typeof finding.severityScore !== 'number' || !Number.isFinite(finding.severityScore)) {
      throw new Error(`finding ${id}.severityScore must be a finite number`);
    }
    return {
      id,
      rule: requireString(finding?.rule, `finding ${id}.rule`),
      severity,
      severityScore: finding.severityScore,
      summary: requireString(finding?.summary, `finding ${id}.summary`),
    };
  });
  findings.sort((left, right) => codeUnitCompare(left.id, right.id));

  const severityCounts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings) severityCounts[finding.severity] += 1;

  const rules = (Array.isArray(source.rules) ? source.rules : [])
    .map((rule) => ({
      id: requireString(rule?.id, 'rule.id'),
      title: requireString(rule?.title, `rule ${rule?.id}.title`),
    }))
    .sort((left, right) => codeUnitCompare(left.id, right.id));

  return {
    format: BUNDLE_FORMAT,
    findingsDigest,
    severityCounts,
    findings,
    rules,
  };
}

/** Read the committed inputs and return the exact bytes to write. */
export function generateBundle() {
  const findingsBytes = readFileSync(FINDINGS_PATH);
  const digestLine = verifyDigest(findingsBytes, readFileSync(DIGEST_PATH, 'utf8'));
  let source;
  try {
    source = JSON.parse(findingsBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${FINDINGS_PATH} is not valid JSON: ${error.message}`);
  }
  const bundle = buildBundle(source, digestLine);
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = generateBundle();
  mkdirSync(dirname(BUNDLE_PATH), { recursive: true });
  writeFileSync(BUNDLE_PATH, output);
  const parsed = JSON.parse(output);
  const counts = SEVERITIES.map((severity) => `${severity} ${parsed.severityCounts[severity]}`).join(', ');
  console.log(
    `wrote worker/generated/notify-bundle.json (${parsed.findings.length} findings: ${counts})`,
  );
}
