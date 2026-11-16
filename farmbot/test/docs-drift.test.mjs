import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'yaml';

import { CHECKS } from '../../src/farmbot/agent/checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ALLOWED_VALUES = resolve(ROOT, 'farmbot/dist/farmbot.allowed-values.json');
const INTENTS_README = resolve(ROOT, 'farmbot/intents/README.md');
const WORKFLOW = resolve(ROOT, '.github/workflows/ci.yml');
const DOCS_DIR = resolve(ROOT, 'farmbot/docs');
const DUCKDB_DOC = join(DOCS_DIR, 'duckdb-distribution.md');
const README = resolve(ROOT, 'README.md');
const CHECKS_DOC = join(DOCS_DIR, 'checks.md');
const ORACLE_DIR = resolve(ROOT, 'farmbot/oracle');

const ARTIFACT_CONTEXT = /artifact|gh run download/i;
const JOB_CONTEXT = /\b(?:job|workflow)\b/i;

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

/**
 * Split Markdown into blocks that keep wrapped lines together: a paragraph or
 * a list item, a heading, a table row or a fenced code block. The artifact name
 * may wrap onto the next line, so the check must not look at one line alone.
 *
 * @param {string} text
 * @returns {string[]}
 */
function markdownBlocks(text) {
  const blocks = [];
  let current = null;
  let inFence = false;
  const flush = () => {
    if (current) {
      const block = current.join(' ').replace(/\s+/g, ' ').trim();
      if (block !== '') blocks.push(block);
    }
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      flush();
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    const startsBlock =
      /^\s*(?:[-*+]|\d+\.)\s+/.test(line) ||
      /^\s*#{1,6}\s+/.test(line) ||
      /^\s*\|/.test(line);
    if (startsBlock) {
      flush();
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      current = [line];
    }
  }
  flush();
  return blocks;
}

/**
 * @param {string} block
 * @returns {string[]}
 */
function releaseTokens(block) {
  return [...block.matchAll(/farmbot-release-assets[\w.-]*/g)].map((match) =>
    match[0].trim(),
  );
}

/**
 * Validate one Markdown block.
 *
 * Every name shaped like a release-assets name is treated as an artifact name
 * unless it is the workflow job id and the block talks about a job or workflow.
 * A wrapped name is still in the same block, so a stale name fails even when
 * the block also names the job. A block that only mentions "artifact" in prose
 * names no release-assets token and is not judged here; the document-level
 * check still requires at least one block that names the artifact.
 *
 * @param {string} block
 * @param {string} artifact
 * @param {ReadonlySet<string>} jobIds
 * @returns {string[]}
 */
function blockProblems(block, artifact, jobIds) {
  const problems = [];
  const jobContext = JOB_CONTEXT.test(block);
  for (const token of releaseTokens(block)) {
    if (token === artifact) continue;
    if (jobIds.has(token) && jobContext) continue;
    if (jobIds.has(token)) {
      problems.push(`job id ${token} is mentioned outside a job context: ${block}`);
      continue;
    }
    problems.push(`unknown release-assets name ${token}: ${block}`);
  }
  return problems;
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
  const workflow = parse(readFileSync(WORKFLOW, 'utf8'));
  const jobIds = new Set(Object.keys(workflow.jobs));

  for (const path of [DUCKDB_DOC, README]) {
    const blocks = markdownBlocks(readFileSync(path, 'utf8'));
    const mentions = blocks.filter((block) => ARTIFACT_CONTEXT.test(block));
    assert.ok(mentions.length > 0, `${path} does not mention the ${artifact} artifact`);
    assert.ok(
      mentions.some((block) => block.includes(artifact)),
      `${path} does not name the ${artifact} artifact next to the artifact context`,
    );
  }

  for (const path of [...markdownFiles(DOCS_DIR), README]) {
    for (const block of markdownBlocks(readFileSync(path, 'utf8'))) {
      for (const problem of blockProblems(block, artifact, jobIds)) {
        assert.fail(`${path}: ${problem}`);
      }
    }
  }
});

test('a wrapped artifact mention is checked as one block', () => {
  const artifact = 'farmbot-release-assets-v2';
  const jobIds = new Set(['farmbot-release-assets']);
  const correct = markdownBlocks(
    'CI uploads the `farmbot-release-assets-v2`\nartifact after a merge.\n',
  );
  assert.equal(correct.length, 1);
  assert.deepEqual(blockProblems(correct[0], artifact, jobIds), []);

  const stale = markdownBlocks(
    'CI uploads the `farmbot-release-assets-v1`\nartifact after a merge.\n',
  );
  assert.equal(stale.length, 1);
  assert.equal(blockProblems(stale[0], artifact, jobIds).length, 1);
});

test('a block that mentions both the job and the artifact passes only with both names right', () => {
  const artifact = 'farmbot-release-assets-v2';
  const jobIds = new Set(['farmbot-release-assets']);
  const good = 'The `farmbot-release-assets` job uploads the `farmbot-release-assets-v2` artifact.';
  assert.deepEqual(blockProblems(good, artifact, jobIds), []);

  const wrongArtifact =
    'The `farmbot-release-assets` job uploads the `farmbot-release-assets-v1` artifact.';
  assert.equal(blockProblems(wrongArtifact, artifact, jobIds).length, 1);

  const jobOnly = 'The `farmbot-release-assets` job checks out the submodule.';
  assert.deepEqual(blockProblems(jobOnly, artifact, jobIds), []);

  const jobWithoutContext = 'Run `farmbot-release-assets` before the release.';
  assert.equal(blockProblems(jobWithoutContext, artifact, jobIds).length, 1);

  const staleCodeAndArtifact =
    'The `farmbot-release-assets-v1` job uploads the `farmbot-release-assets-v2` artifact.';
  assert.equal(blockProblems(staleCodeAndArtifact, artifact, jobIds).length, 1);
});

/**
 * The rows of the rule-id table: everything between the `## Rules` heading and
 * the next heading. A rule id mentioned elsewhere in the document is not a
 * table row.
 *
 * @param {string} text
 * @returns {string}
 */
function rulesTableText(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Rules\s*$/.test(line));
  assert.notEqual(start, -1, 'farmbot/docs/checks.md has no "## Rules" heading');
  const rows = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,6}\s+/.test(line)) break;
    rows.push(line);
  }
  return rows.join('\n');
}

test('the rule table is scoped to its own section', () => {
  const fixture = [
    '## Rules',
    '',
    '| ID | Direction | Check |',
    '|---|---|---|',
    '| R1 | a | in the rule table |',
    '',
    '## Other',
    '',
    '| ID | Note |',
    '|---|---|',
    '| R9 | outside the rule table |',
    '',
  ].join('\n');
  const scoped = rulesTableText(fixture);
  assert.match(scoped, /\|\s*R1\s*\|/);
  assert.doesNotMatch(scoped, /\|\s*R9\s*\|/);
  // The whole file would match the id that the scoped table must exclude.
  assert.match(fixture, /\|\s*R9\s*\|/);
});

test('every rule id is documented and has an oracle file', () => {
  const checksDoc = rulesTableText(readFileSync(CHECKS_DOC, 'utf8'));
  const oracleFiles = readdirSync(ORACLE_DIR).filter((name) => name.endsWith('.sql'));
  for (const rule of CHECKS) {
    assert.match(
      checksDoc,
      new RegExp(`\\|\\s*${rule.id}\\s*\\|`),
      `${rule.id} is missing from the rules table in farmbot/docs/checks.md`,
    );
    const prefix = `${rule.id.toLowerCase()}-`;
    assert.ok(
      oracleFiles.some((name) => name.startsWith(prefix)),
      `${rule.id} has no farmbot/oracle/${prefix}*.sql oracle`,
    );
  }
});
