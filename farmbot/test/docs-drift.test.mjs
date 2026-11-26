import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse } from 'yaml';

import { CHECKS, INTENT_FILES } from '../../src/farmbot/agent/checks.mjs';
import { messages } from '../../src/farmbot/i18n.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ALLOWED_VALUES = resolve(ROOT, 'farmbot/dist/farmbot.allowed-values.json');
const INTENTS_README = resolve(ROOT, 'farmbot/intents/README.md');
const WORKFLOW = resolve(ROOT, '.github/workflows/ci.yml');
const DOCS_DIR = resolve(ROOT, 'farmbot/docs');
const DUCKDB_DOC = join(DOCS_DIR, 'duckdb-distribution.md');
const RELATE_STORE_DOC = join(DOCS_DIR, 'relate-store.md');
const RECORDING_GUIDE = join(DOCS_DIR, 'recording-guide.md');
const README = resolve(ROOT, 'README.md');
const AGENTS_MD = resolve(ROOT, 'AGENTS.md');
const ORACLE_DIR = resolve(ROOT, 'farmbot/oracle');
const FINDINGS_DOC = resolve(ROOT, 'farmbot/dist/farmbot.findings.json');
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const SPIKE_DOC = join(DOCS_DIR, 'relate-spike.md');
const DEVPOST_DOC = join(DOCS_DIR, 'devpost-submission.md');
const DEVPOST_SKIP = existsSync(DEVPOST_DOC)
  ? false
  : 'farmbot/docs/devpost-submission.md is not in the repository yet; this check waits for the #73 submission text.';

const ARTIFACT_CONTEXT = /artifact|gh run download/i;
const JOB_CONTEXT = /\b(?:job|workflow)\b/i;

function allowedValueDomains() {
  const values = JSON.parse(readFileSync(ALLOWED_VALUES, 'utf8'));
  return Object.keys(values).filter((key) => key !== 'format');
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

/**
 * GitHub-style heading slug, derived from the heading text.
 *
 * @param {string} title
 * @returns {string}
 */
function markdownHeadingSlug(title) {
  return title
    .replace(/`+/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * @param {string} text
 * @returns {{ title: string, slug: string }[]}
 */
function markdownHeadings(text) {
  const headings = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      const title = match[2].replace(/\s+#+$/, '').trim();
      headings.push({ title, slug: markdownHeadingSlug(title) });
    }
  }
  return headings;
}

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

const NUMBER_WORD_BY_VALUE = new Map([
  [0, 'zero'],
  [1, 'one'],
  [2, 'two'],
  [3, 'three'],
  [4, 'four'],
  [5, 'five'],
  [6, 'six'],
  [7, 'seven'],
  [8, 'eight'],
  [9, 'nine'],
  [10, 'ten'],
  [11, 'eleven'],
  [12, 'twelve'],
  [13, 'thirteen'],
  [14, 'fourteen'],
  [15, 'fifteen'],
  [16, 'sixteen'],
  [17, 'seventeen'],
  [18, 'eighteen'],
  [19, 'nineteen'],
  [20, 'twenty'],
  [30, 'thirty'],
  [40, 'forty'],
  [50, 'fifty'],
  [60, 'sixty'],
  [70, 'seventy'],
  [80, 'eighty'],
  [90, 'ninety'],
  [100, 'hundred'],
]);
for (const tens of [20, 30, 40, 50, 60, 70, 80, 90]) {
  for (let ones = 1; ones <= 9; ones += 1) {
    NUMBER_WORD_BY_VALUE.set(
      tens + ones,
      `${NUMBER_WORD_BY_VALUE.get(tens)}-${NUMBER_WORD_BY_VALUE.get(ones)}`,
    );
  }
}
const NUMBER_WORDS = [...NUMBER_WORD_BY_VALUE.values()]
  .map((word) => word.replace('-', '[- ]'))
  .join('|');
const NUMBER_PATTERN = String.raw`(?:\d+|${NUMBER_WORDS})`;

function numberWord(value) {
  const word = NUMBER_WORD_BY_VALUE.get(value);
  assert.ok(word, `inventory fixture count ${value} has no single-word form`);
  return word;
}

/**
 * Shapes that state an inventory of check Intents, findings or rules. The
 * check is syntactic on purpose: a hardcoded count fails even when it happens
 * to match the committed data today, because it goes stale on the next data
 * change. A doc must point at the artifact or the command instead.
 *
 * The number is not compared with the live data. A structural sentence such as
 * "one finding per name", "two findings that share the part node", "the two
 * Intents", "those two rules", "rules R1–R9", "one entry per rule" or a field
 * name such as `findingCount` names no inventory and is left alone.
 */
const INVENTORY_SHAPES = [
  {
    label: 'a count before "check/reference Intent(s)"',
    pattern: new RegExp(`\\b${NUMBER_PATTERN}\\s+(?:check|reference)\\s+Intents?\\b`, 'i'),
  },
  {
    label: 'a per-rule finding count',
    pattern: new RegExp(`\\bR\\d+\\s+${NUMBER_PATTERN}\\b`),
  },
  {
    label: 'a finding total',
    pattern: new RegExp(`\\bfor\\s+${NUMBER_PATTERN}\\s+in\\s+total\\b`, 'i'),
  },
  {
    label: 'a count stated on the seed',
    pattern: new RegExp(
      `\\bon\\s+the\\s+(?:current|committed)\\s+seed\\b[^.!?]*[^\\w-]${NUMBER_PATTERN}(?![\\w-])`,
      'i',
    ),
  },
  {
    label: 'a count the seed is said to have',
    pattern: new RegExp(
      `\\bthe\\s+(?:current|committed)\\s+seed\\s+has\\s+${NUMBER_PATTERN}\\b`,
      'i',
    ),
  },
  {
    label: 'a fact and inferred count',
    pattern: new RegExp(`\\bhas\\s+${NUMBER_PATTERN}\\s+facts?\\b`, 'i'),
  },
  {
    label: 'a findings count',
    pattern: new RegExp(
      `\\b${NUMBER_PATTERN}\\s+findings\\b(?!\\s+that\\s+share\\s+the\\s+part\\s+node\\b)`,
      'i',
    ),
  },
  {
    label: 'a rules count',
    pattern: new RegExp(`(?<!those )\\b${NUMBER_PATTERN}\\s+rules\\b`, 'i'),
  },
  {
    label: 'a tests count',
    pattern: new RegExp(`\\b${NUMBER_PATTERN}\\s+tests\\b`, 'i'),
  },
  {
    label: 'a name count',
    pattern: new RegExp(`\\bthe\\s+${NUMBER_PATTERN}\\s+names?\\b`, 'i'),
  },
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
  return [README, AGENTS_MD, ...markdownFiles(DOCS_DIR)];
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
  const r6Findings = findings.findings.filter((finding) => finding.rule === 'R6');
  const r6Facts = r6Findings.filter((finding) => !finding.inferred).length;
  const r6Inferred = r6Findings.length - r6Facts;
  const live = {
    intents: INTENT_FILES.length,
    referenceIntents: INTENT_FILES.filter((file) => file.startsWith('refs-')).length,
    rules: CHECKS.length,
    findings: findings.findings.length,
  };

  const failing = [
    `**Run checks** compiles the ${numberWord(live.intents)} check Intents in \`farmbot/checks/\`.`,
    `**Run checks** compiles the ${live.intents} check Intents in \`farmbot/checks/\`.`,
    'The five reference Intents provide evidence.',
    `The ${live.referenceIntents} reference Intents provide evidence.`,
    `On the committed seed the findings are R1 ${perRule.get('R1')}, R2 ${perRule.get('R2')}, for ${live.findings} in total.`,
    `The per-rule totals are R1 ${numberWord(perRule.get('R1'))}, R2 ${numberWord(perRule.get('R2'))}.`,
    `R6 accounts for ${numberWord(r6Findings.length)} in total.`,
    `On the current seed there are ${perRule.get('R5')} pages with no machine-readable table.`,
    `On the current seed there are ${numberWord(perRule.get('R5'))} pages with no machine-readable table.`,
    `R6 has ${r6Facts} facts and ${r6Inferred} inferred names.`,
    `R6 has ${numberWord(r6Facts)} facts and ${numberWord(r6Inferred)} inferred names.`,
    `The current seed has 19 service-referenced parts and ${perRule.get('R8')} findings: Leadscrew Block and Shunt.`,
    `The current seed has ${numberWord(perRule.get('R8'))} findings.`,
    'The findings document contains zero findings.',
    'The current seed has zero rules.',
    `The oracle returns ${perRule.get('R2')} rows (${perRule.get('R6')} findings).`,
    `The oracle returns ${numberWord(perRule.get('R2'))} rows (${numberWord(perRule.get('R6'))} findings).`,
    `The engine evaluates ${live.rules} rules in the browser.`,
    `The engine evaluates ${numberWord(live.rules)} rules in the browser.`,
    'The farmbot suite has 43 tests.',
    `The farmbot suite has ${numberWord(live.rules)} tests.`,
    'On the current seed R9 records the one name `tee nuts`.',
    `R9 records the ${perRule.get('R9')} name in the findings document.`,
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
    'The rule emits one finding per subject.',
    'The rule emits 1 finding per subject.',
    'A part compared for both `standard` and `xl` produces two findings that share the part node.',
    'A part compared for both `standard` and `xl` produces 2 findings that share the part node.',
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

test('the intents README points at the allowed-values file and its generator', () => {
  const domains = allowedValueDomains();
  assert.ok(
    domains.length > 0,
    'farmbot/dist/farmbot.allowed-values.json declares no domains',
  );
  const generator = resolve(ROOT, 'farmbot/scripts/allowed-values.mjs');
  assert.ok(existsSync(generator), 'farmbot/scripts/allowed-values.mjs is missing');
  const text = readFileSync(INTENTS_README, 'utf8');
  assert.ok(
    text.includes('farmbot/dist/farmbot.allowed-values.json'),
    'farmbot/intents/README.md does not point at farmbot/dist/farmbot.allowed-values.json',
  );
  assert.ok(
    text.includes('farmbot/scripts/allowed-values.mjs'),
    'farmbot/intents/README.md does not point at farmbot/scripts/allowed-values.mjs',
  );
});

test('documented npm run commands exist in package.json', () => {
  const scripts = Object.keys(JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).scripts);
  const files = [README, AGENTS_MD, ...markdownFiles(DOCS_DIR)];
  const pattern = /npm run ([a-zA-Z0-9:-]+)/g;
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      assert.ok(
        scripts.includes(name),
        `${path} names npm run ${name}, which package.json does not declare`,
      );
    }
  }
});

test('the Genesis submodule pin agrees across README, provenance, extract and release manifest', () => {
  const extract = readFileSync(resolve(ROOT, 'farmbot/scripts/extract.mjs'), 'utf8');
  const declared = /export const EXPECTED_PIN = '([0-9a-f]{40})'/.exec(extract);
  assert.ok(declared, 'farmbot/scripts/extract.mjs does not declare EXPECTED_PIN');
  const pin = declared[1];
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, 'farmbot/dist/farmbot.release.json'), 'utf8'),
  );
  assert.equal(
    manifest.genesis?.pin,
    pin,
    'farmbot/dist/farmbot.release.json genesis.pin differs from EXPECTED_PIN',
  );
  for (const rel of ['README.md', 'farmbot/PROVENANCE.md']) {
    const text = readFileSync(resolve(ROOT, rel), 'utf8');
    assert.ok(text.includes(pin), `${rel} does not name the Genesis pin ${pin}`);
  }
});

test('release-asset docs point at the script and manifest rather than a copied table', () => {
  const script = resolve(ROOT, 'farmbot/scripts/release-assets.mjs');
  assert.ok(existsSync(script), 'farmbot/scripts/release-assets.mjs is missing');
  const manifest = resolve(ROOT, 'farmbot/dist/farmbot.release.json');
  assert.ok(existsSync(manifest), 'farmbot/dist/farmbot.release.json is missing');
  const readme = readFileSync(README, 'utf8');
  const duckdb = readFileSync(DUCKDB_DOC, 'utf8');
  const store = readFileSync(RELATE_STORE_DOC, 'utf8');
  for (const [path, text] of [
    ['README.md', readme],
    ['farmbot/docs/duckdb-distribution.md', duckdb],
    ['farmbot/docs/relate-store.md', store],
  ]) {
    assert.ok(
      text.includes('farmbot/scripts/release-assets.mjs'),
      `${path} does not point at farmbot/scripts/release-assets.mjs`,
    );
    assert.ok(
      text.includes('farmbot/dist/farmbot.release.json') ||
        text.includes('farmbot.release.json'),
      `${path} does not point at the release manifest`,
    );
  }
  const headings = markdownHeadings(store);
  const verify = headings.find((heading) =>
    /verify and publish release assets/i.test(heading.title),
  );
  assert.ok(
    verify,
    'farmbot/docs/relate-store.md has no Verify and publish release assets heading',
  );
  assert.ok(
    readme.includes(`farmbot/docs/relate-store.md#${verify.slug}`),
    `README.md does not point at farmbot/docs/relate-store.md#${verify.slug}, derived from "${verify.title}"`,
  );
  const duckdbProse = markdownBlocks(duckdb).join('\n');
  assert.ok(
    !/asset table/i.test(duckdbProse),
    'farmbot/docs/duckdb-distribution.md still promises an asset table',
  );
});

test('extract and store docs do not restate CLI flags outside code fences', () => {
  const flags = [
    '--source',
    '--out',
    '--write-manifest',
    'FARMBOT_GENESIS_DIR',
    'FARMBOT_OUT_DIR',
  ];
  const duckdb = readFileSync(DUCKDB_DOC, 'utf8');
  const store = readFileSync(RELATE_STORE_DOC, 'utf8');
  assert.ok(
    duckdb.includes('farmbot/scripts/extract.mjs'),
    'farmbot/docs/duckdb-distribution.md does not point at farmbot/scripts/extract.mjs',
  );
  assert.ok(
    store.includes('farmbot/scripts/relate-store.mjs'),
    'farmbot/docs/relate-store.md does not point at farmbot/scripts/relate-store.mjs',
  );
  for (const [path, text] of [
    ['farmbot/docs/duckdb-distribution.md', duckdb],
    ['farmbot/docs/relate-store.md', store],
  ]) {
    const prose = markdownBlocks(text).join('\n');
    for (const flag of flags) {
      assert.ok(
        !prose.includes(flag),
        `${path} restates ${flag} outside code fences`,
      );
    }
  }
});

test('preset and release-asset docs do not restate inventory counts', () => {
  const readme = readFileSync(README, 'utf8');
  const duckdb = readFileSync(DUCKDB_DOC, 'utf8');
  const readmeProse = markdownBlocks(readme).join('\n');
  const duckdbProse = markdownBlocks(duckdb).join('\n');
  assert.ok(
    readme.includes('farmbot/oracle/default-results.gold.json'),
    'README.md does not point at farmbot/oracle/default-results.gold.json',
  );
  assert.ok(
    !/\b(?:[0-9]+|five)\s+preset questions\b/i.test(readmeProse),
    'README.md restates a hardcoded preset-question count',
  );
  assert.ok(
    duckdb.includes('farmbot/scripts/release-assets.mjs'),
    'farmbot/docs/duckdb-distribution.md does not point at farmbot/scripts/release-assets.mjs',
  );
  assert.ok(
    !/\b(?:[0-9]+|four)\s+release files\b/i.test(duckdbProse),
    'farmbot/docs/duckdb-distribution.md restates a hardcoded release-asset count',
  );
  assert.ok(
    !/carries the DuckDB extract, the Relate directory store archive/.test(readmeProse),
    'README.md restates the release-asset list instead of pointing at the script',
  );
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

test('every rule id has an oracle file', () => {
  const oracleFiles = readdirSync(ORACLE_DIR).filter((name) => name.endsWith('.sql'));
  for (const rule of CHECKS) {
    const prefix = `${rule.id.toLowerCase()}-`;
    assert.ok(
      oracleFiles.some((name) => name.startsWith(prefix)),
      `${rule.id} has no farmbot/oracle/${prefix}*.sql oracle`,
    );
  }
});

const DEVPOST_EDITOR_HEADING = /^(#{1,6})\s+.*editor notes/i;

/**
 * Return the first heading that looks like an Editor Notes section, or null
 * when none is present.
 *
 * @param {string} text
 * @returns {string | null}
 */
function editorNotesHeading(text) {
  return (
    text.split(/\r?\n/).find((line) => DEVPOST_EDITOR_HEADING.test(line)) ?? null
  );
}

/**
 * The Devpost submission text is reader-facing text, so it must point at the
 * artifact or command instead of stating an inventory count.
 *
 * @param {string} text
 * @returns {string[]}
 */
function pasteReadyInventoryProblems(text) {
  const problems = [];
  for (const block of markdownBlocks(text)) {
    for (const shape of inventoryProblems(block)) {
      problems.push(`${shape}: ${block}`);
    }
  }
  return problems;
}

test('the Devpost submission text has no Editor Notes section', { skip: DEVPOST_SKIP }, () => {
  const heading = editorNotesHeading(readFileSync(DEVPOST_DOC, 'utf8'));
  assert.equal(
    heading,
    null,
    `farmbot/docs/devpost-submission.md must not contain an Editor Notes section (found ${heading})`,
  );
});

test('the Devpost paste-ready text states no hardcoded inventory count', { skip: DEVPOST_SKIP }, () => {
  const problems = pasteReadyInventoryProblems(readFileSync(DEVPOST_DOC, 'utf8'));
  assert.deepEqual(
    problems,
    [],
    `farmbot/docs/devpost-submission.md: states a hardcoded inventory instead of ` +
      `pointing at farmbot/dist/farmbot.findings.json, INTENT_FILES or the reporting ` +
      `command: ${problems.join('; ')}`,
  );
});

test('a Devpost submission with an Editor Notes heading fails the editor-notes check', () => {
  assert.equal(editorNotesHeading('# Submission\n\nNo notes here.\n'), null);
  assert.equal(
    editorNotesHeading('# Submission\n\n## Editor Notes (Do Not Paste into Devpost)\n'),
    '## Editor Notes (Do Not Paste into Devpost)',
  );
});

test('a Devpost paste-ready block with a hardcoded inventory fails via the inventory rule', () => {
  const fixtures = [
    'The demo compiles 5 check Intents.',
    'The demo compiles five check Intents.',
    'The findings document contains zero findings.',
  ];
  for (const pasteReady of fixtures) {
    assert.ok(
      pasteReadyInventoryProblems(pasteReady).length > 0,
      `this hardcoded inventory must fail: ${pasteReady}`,
    );
  }
});

test('Devpost structural sentences pass the paste-ready inventory rule', () => {
  const fixtures = [
    'One finding per distinct `display_name`, grouped in the rule module.',
    'The two Intents keep the usage lines whose `match_method` is `unmatched`.',
  ];
  for (const pasteReady of fixtures) {
    assert.deepEqual(
      pasteReadyInventoryProblems(pasteReady),
      [],
      `this structural sentence must pass: ${pasteReady}`,
    );
  }
});

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
];
const VERSION_TOKEN = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Derive the set of single-version tokens declared in a parsed package.json.
 * Range operators are stripped so `^18.3.1` yields `18.3.1`; an entry that is
 * still a range (`||`, a hyphen range, whitespace) is skipped rather than
 * turned into an invented token. Nested dependency maps such as npm `overrides`
 * are walked. The result maps a token to every package that declares it.
 *
 * @param {Record<string, unknown>} pkg
 * @returns {Map<string, string[]>}
 */
function declaredVersionTokens(pkg) {
  const tokens = new Map();
  const add = (name, specification) => {
    if (typeof specification !== 'string') return;
    const token = specification.trim().replace(/^[<>=~^v\s]+/, '');
    if (token === '' || /[\s|]/.test(token) || !VERSION_TOKEN.test(token)) return;
    const packages = tokens.get(token);
    if (packages) {
      if (!packages.includes(name)) packages.push(name);
    } else {
      tokens.set(token, [name]);
    }
  };
  const walk = (map) => {
    for (const [name, specification] of Object.entries(map)) {
      if (typeof specification === 'string') add(name, specification);
      else if (specification && typeof specification === 'object') walk(specification);
    }
  };
  for (const section of DEPENDENCY_SECTIONS) {
    const map = pkg[section];
    if (map && typeof map === 'object') walk(map);
  }
  return tokens;
}

/**
 * Version tokens are matched as whole versions: a preceding `v` still counts,
 * but a digit, dot, letter or operator next to the match means it is part of a
 * longer version (`1.0.10`, `11.0.1`, `0.1.0.1`) and is not a copy.
 *
 * @param {string} text
 * @param {Map<string, string[]>} tokens
 * @returns {{ token: string, packages: string[] }[]}
 */
function versionCopyProblems(text, tokens) {
  const problems = [];
  for (const [token, packages] of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(?:^|[^\\w.+-])[vV]?${escaped}(?![\\w+-])(?!\\.\\d)`,
    );
    if (pattern.test(text)) problems.push({ token, packages });
  }
  return problems;
}

const PATH_EXTENSIONS = new Set([
  'md',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'jsonc',
  'yml',
  'yaml',
  'css',
  'sql',
]);

/**
 * @param {string} text
 * @returns {string[]}
 */
function quotedTokens(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

/**
 * A backtick token looks like a repository path when it has a slash or a known
 * filename extension. URLs (any URI scheme), npm scoped packages, relative
 * import specifiers, leading-slash browser routes, commands and bare
 * identifiers do not.
 *
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeRepoPath(token) {
  if (/\s/.test(token)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(token)) return false;
  if (token.startsWith('@')) return false;
  if (token.startsWith('./') || token.startsWith('../')) return false;
  if (token.startsWith('/')) return false;
  if (token.includes('/')) return true;
  const extension = /\.([A-Za-z0-9]+)$/.exec(token);
  return Boolean(extension && PATH_EXTENSIONS.has(extension[1].toLowerCase()));
}

/**
 * @param {string} candidate
 * @returns {boolean}
 */
function insideRoot(candidate) {
  return candidate === ROOT || candidate.startsWith(`${ROOT}${sep}`);
}

function topLevelNames() {
  return new Set(readdirSync(ROOT).filter((name) => name !== '.git'));
}

function firstSegment(token) {
  return token.replace(/\/+$/, '').split('/')[0];
}

/**
 * Levenshtein edit distance between two strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function editDistance(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Classify a cited path's first segment against the live top-level names.
 *
 * `exact` keeps the normal existence check. `typo` means the segment is a
 * case variant of a live name or one edit away from one: on a case-sensitive
 * filesystem such a citation cannot resolve, so the token is a cited
 * repository path that does not exist. `external` is any other segment, which
 * may name a context-relative path or an external repository.
 *
 * @param {string} segment
 * @param {ReadonlySet<string>} topLevel
 * @returns {'exact' | 'typo' | 'external'}
 */
function topLevelMatch(segment, topLevel) {
  if (topLevel.has(segment)) return 'exact';
  const folded = segment.toLowerCase();
  for (const name of topLevel) {
    const candidate = name.toLowerCase();
    if (candidate === folded || editDistance(folded, candidate) === 1) return 'typo';
  }
  return 'external';
}

/**
 * Translate one .gitignore glob into an anchored regular expression.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        source += '.*';
        index += 1;
        if (glob[index + 1] === '/') index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Match one .gitignore pattern against a repository-relative path. A pattern
 * without a slash matches at any depth; a directory pattern also matches an
 * ancestor directory. Patterns are relative to the directory that holds the
 * ignore file.
 *
 * @param {string} pattern
 * @param {boolean} dirOnly
 * @param {string} relativePath
 * @param {string} base
 * @returns {boolean}
 */
function ignorePatternMatches(pattern, dirOnly, relativePath, base) {
  let candidate = relativePath;
  if (base !== '') {
    if (candidate !== base && !candidate.startsWith(`${base}/`)) return false;
    candidate = candidate === base ? '' : candidate.slice(base.length + 1);
  }
  if (candidate === '') return false;
  let glob = pattern;
  const anchored = glob.startsWith('/');
  if (anchored) glob = glob.slice(1);
  if (glob === '') return false;
  const expression = globToRegExp(glob);
  const parts = candidate.split('/');
  if (!glob.includes('/') && !anchored) {
    if (expression.test(parts[parts.length - 1])) return true;
    return dirOnly && parts.slice(0, -1).some((part) => expression.test(part));
  }
  if (expression.test(candidate)) return true;
  if (!dirOnly) return false;
  for (let index = 1; index < parts.length; index += 1) {
    if (expression.test(parts.slice(0, index).join('/'))) return true;
  }
  return false;
}

/**
 * Follow the .gitignore files that apply to a repository-relative path, from
 * the root outward, so a cited build output can be absent from a clean
 * checkout. No path or pattern is kept here; the ignore files are the source.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function gitignored(relativePath) {
  const segments = relativePath.split('/');
  const bases = [''];
  for (let index = 0; index < segments.length - 1; index += 1) {
    bases.push(segments.slice(0, index + 1).join('/'));
  }
  let ignored = false;
  for (const base of bases) {
    const ignoreFile = base === '' ? join(ROOT, '.gitignore') : join(ROOT, base, '.gitignore');
    if (!existsSync(ignoreFile)) continue;
    for (const raw of readFileSync(ignoreFile, 'utf8').split(/\r?\n/)) {
      let line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      let negated = false;
      if (line.startsWith('!')) {
        negated = true;
        line = line.slice(1);
      }
      if (line.startsWith('\\')) line = line.slice(1);
      const dirOnly = line.endsWith('/');
      if (dirOnly) line = line.replace(/\/+$/, '');
      if (line === '') continue;
      if (ignorePatternMatches(line, dirOnly, relativePath, base)) {
        ignored = !negated;
      }
    }
  }
  return ignored;
}

/**
 * Cited repository paths must resolve inside the repository. A token whose
 * first segment is a live top-level name, a case variant of one, or one edit
 * away from one is a repository-root path, so a typo of a live name fails;
 * context-relative or external names (`nodes/`, `manifest.json`,
 * `owner/repo#id`) are not judged. `..` segments and resolutions outside ROOT
 * fail. An absent path that a .gitignore covers is an acceptable build-output
 * citation; a typo is not.
 *
 * @param {string} text
 * @returns {string[]}
 */
function repoPathProblems(text) {
  const problems = [];
  const seen = new Set();
  const topLevel = topLevelNames();
  for (const token of quotedTokens(text)) {
    if (seen.has(token) || !looksLikeRepoPath(token)) continue;
    seen.add(token);
    if (token.split('/').includes('..')) {
      problems.push(`cited repository path ${token} escapes the repository`);
      continue;
    }
    const resolved = resolve(ROOT, token);
    if (!insideRoot(resolved)) {
      problems.push(`cited repository path ${token} escapes the repository`);
      continue;
    }
    const match = topLevelMatch(firstSegment(token), topLevel);
    if (match === 'external') continue;
    if (match === 'typo') {
      problems.push(`cited repository path ${token} does not exist in the repository`);
      continue;
    }
    if (existsSync(resolved)) continue;
    if (gitignored(token.replace(/\/+$/, ''))) continue;
    problems.push(`cited repository path ${token} does not exist in the repository`);
  }
  return problems;
}

test('farmbot/docs restate no dependency version pinned in package.json', () => {
  const tokens = declaredVersionTokens(JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')));
  assert.ok(tokens.size > 0, 'package.json declares no single-version token this check can use');
  const extra = [
    INTENTS_README,
    resolve(ROOT, 'vendor/ontographia/PROVENANCE.md'),
  ];
  for (const path of [...markdownFiles(DOCS_DIR), ...extra]) {
    // relate-spike.md is a dated spike report whose measured evidence may
    // coincide with a current pin, so only check (b) applies to it.
    if (path === SPIKE_DOC) continue;
    const text = readFileSync(path, 'utf8');
    for (const { token, packages } of versionCopyProblems(text, tokens)) {
      assert.fail(
        `${path}: restates dependency version ${token} (${packages.join(', ')}); ` +
          'point at package.json instead',
      );
    }
  }
});

test('farmbot/docs cite repository paths that exist', () => {
  for (const path of markdownFiles(DOCS_DIR)) {
    for (const problem of repoPathProblems(readFileSync(path, 'utf8'))) {
      assert.fail(`${path}: ${problem}`);
    }
  }
});

test('a fixture dependency map yields whole version tokens and skips ranges', () => {
  const tokens = declaredVersionTokens({
    dependencies: { alpha: '^1.2.3', beta: '~4.5.6' },
    devDependencies: { gamma: '1.4.5-r.1', delta: '>=7.0.0 <8.0.0' },
    optionalDependencies: { epsilon: '9.9.9' },
    peerDependencies: { zeta: '0.1.10' },
    overrides: { eta: '2.0.0', theta: { iota: '3.0.0' } },
  });
  assert.deepEqual(tokens.get('1.2.3'), ['alpha']);
  assert.deepEqual(tokens.get('4.5.6'), ['beta']);
  assert.deepEqual(tokens.get('1.4.5-r.1'), ['gamma']);
  assert.deepEqual(tokens.get('9.9.9'), ['epsilon']);
  assert.deepEqual(tokens.get('0.1.10'), ['zeta']);
  assert.deepEqual(tokens.get('2.0.0'), ['eta']);
  assert.deepEqual(tokens.get('3.0.0'), ['iota']);
  assert.equal(tokens.has('7.0.0'), false);
  assert.equal(tokens.has('8.0.0'), false);
});

test('a copy of a declared dependency version fails and names it', () => {
  const tokens = new Map([['1.0.1', ['@relate/relate']]]);
  const problems = versionCopyProblems('The Node client `@relate/relate` 1.0.1.', tokens);
  assert.ok(
    problems.some(
      (problem) => problem.token === '1.0.1' && problem.packages.includes('@relate/relate'),
    ),
    `a copied pin must fail and name the package: ${JSON.stringify(problems)}`,
  );
  assert.ok(
    versionCopyProblems('Pin v0.1.10 for the engine.', new Map([['0.1.10', ['engine']]])).length >
      0,
    'a v-prefixed copy is still a copy',
  );
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  assert.deepEqual(
    versionCopyProblems('FarmBot Genesis v1.7', declaredVersionTokens(pkg)),
    [],
    '1.7 is not a declared pin, so the Genesis version must pass',
  );
});

test('a version that is only a substring of a longer version does not fail', () => {
  const tokens = new Map([['1.0.1', ['pkg']]]);
  assert.deepEqual(versionCopyProblems('1.0.10 11.0.1 1.0.11 0.1.0.1', tokens), []);
});

test('a cited missing or escaping repository path fails and names the token', () => {
  const missing = 'farmbot/docs/does-not-exist-here.md';
  const missingProblems = repoPathProblems(`Claim source: \`${missing}\``);
  assert.ok(
    missingProblems.some((problem) => problem.includes(missing)),
    `a missing cited path must fail and name ${missing}: ${missingProblems.join('; ')}`,
  );

  const escaped = 'farmbot/docs/../../outside.md';
  const escapedProblems = repoPathProblems(`Claim source: \`${escaped}\``);
  assert.ok(
    escapedProblems.some((problem) => problem.includes(escaped)),
    `an escaping cited path must fail and name ${escaped}: ${escapedProblems.join('; ')}`,
  );
});

test('a typo of a live top-level name fails and names the token', () => {
  assert.ok(
    existsSync(join(ROOT, 'wrangler.jsonc')),
    'this fixture assumes wrangler.jsonc is a live repo-root file',
  );
  assert.ok(
    existsSync(join(ROOT, 'farmbot')),
    'this fixture assumes farmbot is a live repo-root directory',
  );
  const fixtures = ['farmbo/docs/ontology.md', 'wrangler.json', 'FarmBot/docs/ontology.md'];
  for (const token of fixtures) {
    const problems = repoPathProblems(`Claim source: \`${token}\``);
    assert.ok(
      problems.some((problem) => problem.includes(token)),
      `a typo of a live top-level name must fail and name ${token}: ${problems.join('; ')}`,
    );
  }
});

test('a typo under a real top-level name still fails', () => {
  assert.ok(
    repoPathProblems('Typo: `farmbot/docs/does-not-exist-here.md`').length > 0,
    'a typo under a real top-level name still fails',
  );
});

test('non-repository backtick tokens are not judged as repository paths', () => {
  const text = [
    '- Package pin: `@edgesentry/ontographia-wasm`',
    '- Relative import: `../lib/webllm-package`',
    '- Demo route: `/farmbot/`',
    '- Finding deep link: `/farmbot/#finding=R6-power-supply`',
    '- Notify endpoint: `/api/notify/test`',
    '- Website: `https://github.com/jexp/relate-ideas`',
    '- Local file URL: `file:///tmp/report.json`',
    '- Upstream issue: `edgesentry/ontographia#164`',
    '- External repository: `jexp/relate-ideas`',
    '- External docs: `FarmBot-Docs/farmbot-genesis`',
    '- Source-relative path: `v1.7/extras/troubleshooting/`',
    '- Bare artefact name: `graph.json`',
    '- Bare directory: `nodes/`',
    '- Short unit: `w/`',
    '- Command: `npm run test:farmbot`',
    '- Bare identifier: `findingCount`',
  ].join('\n');
  assert.deepEqual(
    repoPathProblems(text),
    [],
    'an npm package, relative import, route, URL, owner/repo id, short unit or bare name is not a repository path',
  );
});

test('a cited gitignored build output may be absent from the checkout', () => {
  assert.deepEqual(
    repoPathProblems(
      'Store: `farmbot/dist/farmbot.relate-store/` and `farmbot/dist/farmbot.duckdb`.',
    ),
    [],
    'a gitignored build output is an acceptable citation even when absent',
  );
  assert.ok(
    repoPathProblems('Typo: `farmbot/docs/does-not-exist-here.md`').length > 0,
    'a typo under a real top-level name still fails',
  );
});

// --- v2 demo video guide budget and single-source-of-truth checks ------------
//
// farmbot/docs/recording-guide.md is the single source of truth for the v2
// narrated + zoomed demo video: Beats 0 through 8 sum to 102 seconds (1:42),
// Beat 0 opens with a 6 to 10 second no-click overview over the flow strip,
// narration stays at or below 2.5 words/s per beat, captions match the
// narration text in non-overlapping cues at or below 17 chars/s, Beat 4
// records the R1 reconciliation labels, Beat 7 covers the claim verification
// panel (REJECTED then CONFIRMED), and Beat 8 keeps the exact closing line.

const CLOSING_LINE = 'In short, the model only routes; it never writes Cypher.';
const VIDEO_TOTAL_SECONDS = 102;
const MAX_WORDS_PER_SECOND = 2.5;
const MAX_CAPTION_CHARS_PER_SECOND = 17;

/**
 * Parse `M:SS` into integer seconds.
 *
 * @param {string} stamp
 * @returns {number}
 */
function parseTimestamp(stamp) {
  const [minutes, seconds] = stamp.split(':').map(Number);
  return minutes * 60 + seconds;
}

/**
 * The beats the recording guide documents, in document order. Each beat is a
 * "### Beat N: ..." section that states one "**Target Timing:** N seconds"
 * line, a quoted "**English Voiceover:**" block, and "**Caption Cues:**" items.
 * Any other heading ends the section.
 *
 * @param {string} text
 * @returns {{
 *   n: number,
 *   seconds: number | null,
 *   range: [number, number] | null,
 *   voiceover: string | null,
 *   cues: { start: number, end: number, text: string }[],
 *   body: string,
 * }[]}
 */
function recordingGuideBeats(text) {
  const beats = [];
  let current = null;
  let expectingVoiceover = false;
  let inCues = false;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^### Beat (\d+):\s/.exec(line);
    if (heading) {
      current = {
        n: Number(heading[1]),
        seconds: null,
        range: null,
        voiceover: null,
        cues: [],
        body: [],
      };
      beats.push(current);
      expectingVoiceover = false;
      inCues = false;
      continue;
    }
    if (!current) continue;
    if (/^#{1,3}\s/.test(line)) {
      current = null;
      expectingVoiceover = false;
      inCues = false;
      continue;
    }
    const timing =
      /^[-*]\s*\*\*Target Timing:\*\*\s*(\d+)\s*seconds\s*\((\d+:\d{2})\s+to\s+(\d+:\d{2})\)/.exec(
        line,
      );
    if (timing && current.seconds === null) {
      current.seconds = Number(timing[1]);
      current.range = [parseTimestamp(timing[2]), parseTimestamp(timing[3])];
    }
    if (/^[-*]\s*\*\*English Voiceover:\*\*/.test(line)) {
      expectingVoiceover = true;
      inCues = false;
    } else if (expectingVoiceover) {
      const quote = /^\s*>\s*"(.+)"\s*$/.exec(line);
      if (quote) {
        current.voiceover = quote[1];
        expectingVoiceover = false;
      }
    }
    if (/^[-*]\s*\*\*Caption Cues:\*\*/.test(line)) {
      inCues = true;
      expectingVoiceover = false;
    } else if (inCues) {
      const cue = /^\s*[-*]\s*`(\d+:\d{2})-(\d+:\d{2})`:\s*"(.+)"\s*$/.exec(line);
      if (cue) {
        current.cues.push({
          start: parseTimestamp(cue[1]),
          end: parseTimestamp(cue[2]),
          text: cue[3],
        });
      } else if (/^[-*]\s*\*\*/.test(line)) {
        inCues = false;
      }
    }
    current.body.push(line);
  }
  return beats.map((beat) => ({ ...beat, body: beat.body.join('\n') }));
}

test('the recording guide opens with a 6 to 10 second Beat 0 before Beat 1', () => {
  const guideBeats = recordingGuideBeats(readFileSync(RECORDING_GUIDE, 'utf8'));
  assert.deepEqual(
    guideBeats.map((beat) => beat.n),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    `farmbot/docs/recording-guide.md must document exactly beats 0 through 8 in order; found ` +
      `${guideBeats.map((beat) => beat.n).join(', ')}`,
  );
  const opening = guideBeats[0];
  assert.ok(
    opening.seconds !== null && opening.seconds >= 6 && opening.seconds <= 10,
    `farmbot/docs/recording-guide.md documents a ${opening.seconds} second opening; Beat 0 must be 6 to 10 seconds`,
  );
  assert.ok(
    opening.body.includes('data-testid="flow-strip"'),
    'farmbot/docs/recording-guide.md Beat 0 does not name the flow strip as its visual overview',
  );
  assert.ok(
    /do not click|no click/i.test(opening.body),
    'farmbot/docs/recording-guide.md Beat 0 does not state the no-operation rule',
  );
});

test('the documented durations sum to the v2 102-second video budget', () => {
  const text = readFileSync(RECORDING_GUIDE, 'utf8');
  const beats = recordingGuideBeats(text);
  let cursor = 0;
  for (const beat of beats) {
    assert.ok(
      Number.isInteger(beat.seconds) && beat.seconds > 0,
      `farmbot/docs/recording-guide.md beat ${beat.n} has no documented duration`,
    );
    assert.ok(
      beat.range && beat.range[0] === cursor && beat.range[1] === cursor + beat.seconds,
      `farmbot/docs/recording-guide.md beat ${beat.n} range does not match contiguous ${cursor}..${cursor + beat.seconds}`,
    );
    cursor += beat.seconds;
  }
  assert.equal(
    cursor,
    VIDEO_TOTAL_SECONDS,
    `farmbot/docs/recording-guide.md documents ${cursor} seconds; the named beats must sum to ${VIDEO_TOTAL_SECONDS} seconds`,
  );
  assert.ok(
    text.includes(`${VIDEO_TOTAL_SECONDS} seconds`),
    `farmbot/docs/recording-guide.md does not state the documented ${VIDEO_TOTAL_SECONDS} second total`,
  );
  assert.ok(
    !/\bBGM\b/i.test(text),
    'farmbot/docs/recording-guide.md must not include BGM instructions (added later on YouTube)',
  );
});

test('every beat specifies speakable narration, zoom cues, and non-overlapping captions <= 17 chars/s', () => {
  const beats = recordingGuideBeats(readFileSync(RECORDING_GUIDE, 'utf8'));
  for (const beat of beats) {
    assert.ok(
      beat.body.includes('**Zoom / Framing:**'),
      `farmbot/docs/recording-guide.md Beat ${beat.n} is missing a Zoom / Framing cue`,
    );
    assert.ok(
      beat.voiceover && beat.voiceover.length > 0,
      `farmbot/docs/recording-guide.md Beat ${beat.n} is missing a quoted English Voiceover line`,
    );
    const words = beat.voiceover.trim().split(/\s+/).length;
    const wordsPerSecond = words / beat.seconds;
    assert.ok(
      wordsPerSecond <= MAX_WORDS_PER_SECOND,
      `Beat ${beat.n} narration is ${wordsPerSecond.toFixed(2)} words/s (${words} words in ${beat.seconds}s), exceeding ${MAX_WORDS_PER_SECOND} words/s`,
    );
    assert.ok(
      beat.cues.length > 0,
      `farmbot/docs/recording-guide.md Beat ${beat.n} has no Caption Cues`,
    );
    let cueCursor = beat.range[0];
    for (const cue of beat.cues) {
      assert.ok(
        cue.start >= cueCursor && cue.end > cue.start && cue.end <= beat.range[1],
        `Beat ${beat.n} has overlapping or out-of-range caption cue ${cue.start}-${cue.end}`,
      );
      const duration = cue.end - cue.start;
      const charsPerSecond = cue.text.length / duration;
      assert.ok(
        charsPerSecond <= MAX_CAPTION_CHARS_PER_SECOND,
        `Beat ${beat.n} cue "${cue.text}" is ${charsPerSecond.toFixed(2)} chars/s, exceeding ${MAX_CAPTION_CHARS_PER_SECOND} chars/s`,
      );
      cueCursor = cue.end;
    }
    const joined = beat.cues.map((cue) => cue.text).join(' ');
    assert.equal(
      joined,
      beat.voiceover,
      `Beat ${beat.n} caption cues do not match the narration text verbatim`,
    );
  }
});

test('Beat 7 documents the claim verification panel (REJECTED then CONFIRMED)', () => {
  const beat7 = recordingGuideBeats(readFileSync(RECORDING_GUIDE, 'utf8')).find(
    (beat) => beat.n === 7,
  );
  assert.ok(beat7, 'farmbot/docs/recording-guide.md has no Beat 7');
  assert.equal(beat7.seconds, 13, 'Beat 7 must keep its 13-second budget');
  for (const needle of [
    'claim-verifier-panel',
    'uc1-hallucinated-part-fail',
    'REJECTED',
    'uc1-hallucinated-part-pass',
    'CONFIRMED',
    'verify-claim-run',
  ]) {
    assert.ok(
      beat7.body.includes(needle),
      `farmbot/docs/recording-guide.md Beat 7 is missing ${needle}`,
    );
  }
});

test('the Beat 8 closing line stays verbatim in the recording guide', () => {
  const guideBeat8 = recordingGuideBeats(readFileSync(RECORDING_GUIDE, 'utf8')).find(
    (beat) => beat.n === 8,
  );
  assert.ok(guideBeat8, 'the recording guide has no Beat 8');
  assert.equal(
    guideBeat8.voiceover,
    CLOSING_LINE,
    `the recording guide Beat 8 voiceover must be verbatim "${CLOSING_LINE}"`,
  );
});

test('no doc references the removed demo-script.md file', () => {
  for (const path of [README, AGENTS_MD, ...markdownFiles(DOCS_DIR)]) {
    const text = readFileSync(path, 'utf8');
    assert.ok(
      !text.includes('demo-script.md'),
      `${path} still references the removed demo-script.md`,
    );
  }
});

test('Beat 4 records the on-screen reconciliation labels for the R1 shot', () => {
  const guideBeat4 = recordingGuideBeats(readFileSync(RECORDING_GUIDE, 'utf8')).find(
    (beat) => beat.n === 4,
  );
  assert.ok(guideBeat4, 'farmbot/docs/recording-guide.md has no Beat 4');
  assert.equal(
    guideBeat4.seconds,
    11,
    'farmbot/docs/recording-guide.md Beat 4 does not keep its 11-second budget',
  );
  const flat = guideBeat4.body.replace(/\s+/g, ' ');
  assert.ok(
    flat.includes('R1-40mm-nut-bar-standard'),
    'farmbot/docs/recording-guide.md Beat 4 no longer names the R1 deep link',
  );
  assert.ok(
    flat.includes('reconciliationCategoryR1'),
    'farmbot/docs/recording-guide.md Beat 4 does not record the on-screen category label key',
  );
  assert.ok(
    flat.includes('reconciliationR1Note'),
    'farmbot/docs/recording-guide.md Beat 4 does not record the comparison note key',
  );
  assert.ok(
    flat.includes(messages.en.reconciliationCategoryR1),
    `farmbot/docs/recording-guide.md Beat 4 does not quote messages.en.reconciliationCategoryR1 (${JSON.stringify(messages.en.reconciliationCategoryR1)}) verbatim`,
  );
  assert.ok(
    flat.includes(messages.en.reconciliationR1Note),
    `farmbot/docs/recording-guide.md Beat 4 does not quote messages.en.reconciliationR1Note (${JSON.stringify(messages.en.reconciliationR1Note)}) verbatim`,
  );
});

test('checks.md names the three reconciliation categories and keeps the R1 comparison', () => {
  const flat = readFileSync(join(DOCS_DIR, 'checks.md'), 'utf8').replace(/\s+/g, ' ');
  assert.ok(
    flat.includes('EBOM / MBOM reconciliation'),
    'farmbot/docs/checks.md does not name the EBOM / MBOM reconciliation grouping',
  );
  for (const category of [
    'missing from process (R3)',
    'manufacturing- or packing-only (R4)',
    'quantity difference (R1)',
  ]) {
    assert.ok(
      flat.includes(category),
      `farmbot/docs/checks.md does not name the ${category} category`,
    );
  }
  assert.ok(
    /packing-list quantity versus the part-page quantity/i.test(flat),
    'farmbot/docs/checks.md does not keep the packing list versus part page ' +
      'quantity comparison on R1',
  );
  assert.ok(
    !/\bintentional difference\b/i.test(flat),
    'farmbot/docs/checks.md must not add an intentional-difference category',
  );
});
