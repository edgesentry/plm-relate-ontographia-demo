import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'yaml';

import { CHECKS, INTENT_FILES } from '../../src/farmbot/agent/checks.mjs';

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
const FINDINGS_DOC = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');

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

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
].join('|');

/**
 * Shapes that state an inventory of check Intents, findings or rules. The
 * check is syntactic on purpose: a hardcoded count fails even when it happens
 * to match the committed data today, because it goes stale on the next data
 * change. A doc must point at the artifact or the command instead.
 *
 * The number is not compared with the live data. A structural sentence such as
 * "one finding per name", "two findings that share the part node", "the two
 * Intents", "rules R1–R9", "one entry per rule" or a field name such as
 * `findingCount` names no inventory and is left alone.
 */
const INVENTORY_SHAPES = [
  {
    label: 'a count before "check Intent(s)"',
    pattern: new RegExp(`\\b(?:\\d+|${NUMBER_WORDS})\\s+check\\s+Intents?\\b`, 'i'),
  },
  { label: 'a per-rule finding count', pattern: /\bR\d+\s+\d{1,4}\b/ },
  { label: 'a finding total', pattern: /\bfor\s+\d+\s+in\s+total\b/i },
  {
    label: 'a count stated on the seed',
    pattern: /\bon\s+the\s+(?:current|committed)\s+seed\b[^.!?]*[^\w-]\d+(?![\w-])/i,
  },
  {
    label: 'a count the seed is said to have',
    pattern: /\bthe\s+(?:current|committed)\s+seed\s+has\s+\d+/i,
  },
  { label: 'a fact and inferred count', pattern: /\bhas\s+\d+\s+facts?\b/i },
  { label: 'a findings count', pattern: /\b\d+\s+findings\b/ },
  { label: 'a rules count', pattern: /\b\d+\s+rules\b/ },
  { label: 'a tests count', pattern: /\b\d+\s+tests\b/ },
  {
    label: 'a seed-count table column',
    pattern: /\b(?:findings|rows)\s+on\s+the\s+(?:current|committed)\s+seed\b/i,
  },
];

/**
 * @param {string} block
 * @returns {string[]}
 */
function inventoryProblems(block) {
  return INVENTORY_SHAPES.filter(({ pattern }) => pattern.test(block)).map(
    ({ label }) => label,
  );
}

function documentedInventoryPaths() {
  return [README, ...markdownFiles(DOCS_DIR)];
}

test('the docs state no hardcoded check-Intent, finding or rule count', () => {
  const findings = JSON.parse(readFileSync(FINDINGS_DOC, 'utf8'));
  const live = {
    intents: INTENT_FILES.length,
    rules: CHECKS.length,
    findings: findings.findings.length,
  };
  assert.ok(
    live.intents > 0 && live.rules > 0 && live.findings > 0,
    'the live count source is empty, so this test could not mean anything',
  );

  for (const path of documentedInventoryPaths()) {
    for (const block of markdownBlocks(readFileSync(path, 'utf8'))) {
      const problems = inventoryProblems(block);
      assert.deepEqual(
        problems,
        [],
        `${path}: states ${problems.join(', ')} instead of pointing at ` +
          `farmbot/dist/farmbot.findings.json, INTENT_FILES or the reporting ` +
          `command: ${block}`,
      );
    }
  }
});

test('a hardcoded inventory count fails even when it matches the committed data', () => {
  const findings = JSON.parse(readFileSync(FINDINGS_DOC, 'utf8'));
  const perRule = new Map(findings.rules.map((rule) => [rule.id, rule.findingCount]));
  const live = {
    intents: INTENT_FILES.length,
    rules: CHECKS.length,
    findings: findings.findings.length,
  };

  const failing = [
    '**Run checks** compiles the seventeen check Intents in `farmbot/checks/`.',
    `**Run checks** compiles the ${live.intents} check Intents in \`farmbot/checks/\`.`,
    `On the committed seed the findings are R1 ${perRule.get('R1')}, R2 ${perRule.get('R2')}, for ${live.findings} in total.`,
    `On the current seed there are ${perRule.get('R5')} pages with no machine-readable table.`,
    'On the current seed R6 has 6 facts and 3 inferred names.',
    `The current seed has 19 service-referenced parts and ${perRule.get('R8')} findings: Leadscrew Block and Shunt.`,
    'The oracle returns 13 rows (9 findings).',
    'The engine evaluates 9 rules in the browser.',
    'The farmbot suite has 43 tests.',
    '| ID | Direction | Check | Findings on the current seed |',
    '| Oracle | Returned key | Rows on the current seed |',
  ];
  for (const fixture of failing) {
    const blocks = markdownBlocks(`${fixture}\n`);
    assert.ok(
      blocks.some((block) => inventoryProblems(block).length > 0),
      `this hardcoded inventory must fail: ${fixture}`,
    );
  }

  const passing = [
    'One finding per distinct `display_name`, grouped in the rule module.',
    'A part compared for both `standard` and `xl` produces two findings that share the part node.',
    'The two Intents keep the usage lines whose `match_method` is `unmatched`.',
    'The rule therefore uses two Intents whose union is the finding set.',
    'The rule joins three Intents on the difference node id.',
    'R5 is a cause candidate in those two rules.',
    'The engine evaluates rules R1–R9 in the browser.',
    '`rules` has one entry per rule: direction, finding count, intent files, severity counts, title.',
    'Current per-rule totals are in `farmbot/dist/farmbot.findings.json`: each `rules[]` entry carries `findingCount` and `severityCounts`.',
    '`INTENT_FILES` in `src/farmbot/agent/checks.mjs` is the executed check-Intent set.',
    '`npm run agent:farmbot` regenerates the findings document; `npm run test:farmbot` compares each oracle on the committed seed.',
    '16 commits reached `main` before the Contest Period start.',
    '- **Q1 · Packing differences** — 12 rows — no selector',
    'The committed seed graph is verified by SHA-256 and loaded into memory.',
  ];
  for (const fixture of passing) {
    const blocks = markdownBlocks(`${fixture}\n`);
    assert.ok(
      blocks.every((block) => inventoryProblems(block).length === 0),
      `this structural sentence or data pointer must pass: ${fixture}`,
    );
  }
});

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
