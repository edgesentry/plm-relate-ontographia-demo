import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ALLOWED_VALUES = resolve(ROOT, 'farmbot/dist/farmbot.allowed-values.json');
const INTENTS_README = resolve(ROOT, 'farmbot/intents/README.md');
const WORKFLOW = resolve(ROOT, '.github/workflows/ci.yml');
const DOCS_DIR = resolve(ROOT, 'farmbot/docs');
const DUCKDB_DOC = join(DOCS_DIR, 'duckdb-distribution.md');
const README = resolve(ROOT, 'README.md');

const ARTIFACT_TOKEN = /farmbot-release-assets[\w.-]*/g;
const ARTIFACT_CONTEXT = /artifact|gh run download/;

function allowedValueDomains() {
  const values = JSON.parse(readFileSync(ALLOWED_VALUES, 'utf8'));
  return new Set(Object.keys(values).filter((key) => key !== 'format'));
}

function documentedDomains() {
  const lines = readFileSync(INTENTS_README, 'utf8').split('\n');
  const header = lines.findIndex((line) => /^\|\s*Key\s*\|\s*Domain\s*\|/.test(line));
  assert.notEqual(header, -1, 'farmbot/intents/README.md has no Key/Domain table');
  const domains = new Set();
  for (let index = header + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('|')) break;
    const match = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (match) domains.add(match[1]);
  }
  return domains;
}

function releaseAssetArtifact() {
  const workflow = parse(readFileSync(WORKFLOW, 'utf8'));
  const job = workflow.jobs['farmbot-release-assets'];
  assert.ok(job, 'the workflow has no farmbot-release-assets job');
  const upload = job.steps.find(
    (step) =>
      typeof step.uses === 'string' && step.uses.startsWith('actions/upload-artifact'),
  );
  assert.ok(upload, 'the farmbot-release-assets job uploads no artifact');
  return upload.with.name;
}

function artifactTokens(line) {
  return line.match(ARTIFACT_TOKEN) ?? [];
}

function markdownFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(directory, name));
}

test('the allowed-values domains and the intents README table agree', () => {
  const domains = allowedValueDomains();
  const documented = documentedDomains();

  for (const domain of domains) {
    assert.ok(
      documented.has(domain),
      `allowed-values domain ${domain} is missing from farmbot/intents/README.md`,
    );
  }
  for (const domain of documented) {
    assert.ok(
      domains.has(domain),
      `farmbot/intents/README.md documents ${domain}, which the allowed-values file does not define`,
    );
  }
});

test('the documented release artifact name matches the workflow', () => {
  const artifact = releaseAssetArtifact();
  const duckdbDoc = readFileSync(DUCKDB_DOC, 'utf8');
  const readme = readFileSync(README, 'utf8');

  for (const [label, text] of [
    ['farmbot/docs/duckdb-distribution.md', duckdbDoc],
    ['README.md', readme],
  ]) {
    assert.ok(
      text.includes(artifact),
      `${label} does not mention the ${artifact} artifact`,
    );
    for (const line of text.split('\n')) {
      if (!ARTIFACT_CONTEXT.test(line)) continue;
      for (const token of artifactTokens(line)) {
        assert.equal(
          token,
          artifact,
          `${label} names the artifact ${token} instead of ${artifact}: ${line.trim()}`,
        );
      }
    }
  }

  const workflow = parse(readFileSync(WORKFLOW, 'utf8'));
  const jobIds = new Set(Object.keys(workflow.jobs));
  for (const path of [...markdownFiles(DOCS_DIR), README]) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      for (const token of artifactTokens(line)) {
        assert.ok(
          token === artifact || jobIds.has(token),
          `${path} mentions the unknown release-assets name ${token}`,
        );
      }
    }
  }
});
