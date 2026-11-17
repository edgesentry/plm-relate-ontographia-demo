import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
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
const DEVPOST_DOC = join(DOCS_DIR, 'devpost-submission.md');
const I18N_SOURCE = resolve(ROOT, 'src/farmbot/i18n.ts');
const DEVPOST_SKIP = existsSync(DEVPOST_DOC)
  ? false
  : 'farmbot/docs/devpost-submission.md is not in the repository yet; this check waits for the #73 submission text.';

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

const DEVPOST_EDITOR_HEADING = /^(#{1,6})\s+.*editor notes/i;
const I18N_HEADING = /^(#{1,6})\s+.*i18n/i;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
 * Split the submission text at the editor-notes heading. Everything before the
 * heading is the paste-ready section; the heading and what follows are the
 * editor notes. Returns null when the heading is absent, since neither section
 * can then be told apart from the other.
 *
 * @param {string} text
 * @returns {{ pasteReady: string, editorNotes: string } | null}
 */
function devpostSections(text) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => DEVPOST_EDITOR_HEADING.test(line));
  if (index === -1) return null;
  return {
    pasteReady: lines.slice(0, index).join('\n'),
    editorNotes: lines.slice(index).join('\n'),
  };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function quotedTokens(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

/**
 * A backtick token looks like a repository path when it has a slash (a
 * directory or a nested path) or a known filename extension. URLs, npm
 * scoped packages (`@scope/name`), relative import specifiers (`./`, `../`),
 * commands, and bare identifiers such as an i18n key or a format name do not.
 * Editor notes cite paths from the repository root, not package names or
 * import specifiers.
 *
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeRepoPath(token) {
  if (/\s/.test(token)) return false;
  if (/^https?:\/\//i.test(token)) return false;
  if (token.startsWith('@')) return false;
  if (token.startsWith('./') || token.startsWith('../')) return false;
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

/**
 * Cited repository paths in the editor notes must resolve to a file or a
 * directory inside the repository. The set is derived from the document; no
 * expected path is kept. A path with a `..` segment or an absolute path outside
 * the repository escapes it and fails.
 *
 * @param {string} editorNotes
 * @returns {string[]}
 */
function devpostPathProblems(editorNotes) {
  const problems = [];
  const seen = new Set();
  for (const token of quotedTokens(editorNotes)) {
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
    if (!existsSync(resolved)) {
      problems.push(`cited repository path ${token} does not exist in the repository`);
    }
  }
  return problems;
}

/**
 * The lines under the first heading in the editor notes that matches /i18n/,
 * up to the next heading of the same or a higher level. Returns an empty string
 * when there is no such heading, so the cited-key set is then empty.
 *
 * @param {string} editorNotes
 * @returns {string}
 */
function i18nSubsection(editorNotes) {
  const lines = editorNotes.split(/\r?\n/);
  const start = lines.findIndex((line) => I18N_HEADING.test(line));
  if (start === -1) return '';
  const level = /^(#{1,6})/.exec(lines[start])[1].length;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+/.exec(lines[index]);
    if (heading && heading[1].length <= level) break;
    body.push(lines[index]);
  }
  return body.join('\n');
}

/**
 * Top-level keys of one i18n object. Both objects are flat, so a key is a line
 * indented two spaces with a name and a colon; the object closes on the first
 * line that starts with a brace.
 *
 * @param {string} source
 * @param {RegExp} opening
 * @returns {Set<string>}
 */
function i18nObjectKeys(source, opening) {
  const match = opening.exec(source);
  assert.ok(match, `src/farmbot/i18n.ts does not declare ${opening}`);
  const keys = new Set();
  for (const line of source.slice(match.index + match[0].length).split(/\r?\n/)) {
    if (/^\}/.test(line)) break;
    const key = /^  ([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (key) keys.add(key[1]);
  }
  return keys;
}

/**
 * @returns {{ en: Set<string>, ja: Set<string> }}
 */
function i18nSourceKeys() {
  const source = readFileSync(I18N_SOURCE, 'utf8');
  return {
    en: i18nObjectKeys(source, /const en\s*=\s*\{/),
    ja: i18nObjectKeys(source, /const ja[^=\n]*=\s*\{/),
  };
}

/**
 * Cited i18n keys in the i18n subsection are backtick tokens that are plain
 * identifiers, excluding the language ids. Each cited key must exist in both
 * objects, since the source text is parsed rather than imported.
 *
 * @param {string} editorNotes
 * @returns {string[]}
 */
function devpostKeyProblems(editorNotes) {
  const keys = i18nSourceKeys();
  const problems = [];
  for (const token of new Set(quotedTokens(i18nSubsection(editorNotes)))) {
    if (!IDENTIFIER.test(token) || token === 'en' || token === 'ja') continue;
    const missing = ['en', 'ja'].filter((lang) => !keys[lang].has(token));
    if (missing.length > 0) {
      problems.push(`cited i18n key ${token} is missing from ${missing.join(' and ')}`);
    }
  }
  return problems;
}

/**
 * The paste-ready section is reader-facing text, so it must point at the
 * artifact or command instead of stating an inventory count.
 *
 * @param {string} pasteReady
 * @returns {string[]}
 */
function pasteReadyInventoryProblems(pasteReady) {
  const problems = [];
  for (const block of markdownBlocks(pasteReady)) {
    for (const shape of inventoryProblems(block)) {
      problems.push(`${shape}: ${block}`);
    }
  }
  return problems;
}

test('the Devpost editor notes cite repository paths that exist', { skip: DEVPOST_SKIP }, () => {
  const sections = devpostSections(readFileSync(DEVPOST_DOC, 'utf8'));
  assert.ok(
    sections,
    'farmbot/docs/devpost-submission.md has no editor-notes heading, so its path citations cannot be derived',
  );
  assert.deepEqual(devpostPathProblems(sections.editorNotes), []);
});

test('the Devpost editor notes cite i18n keys that exist in both languages', { skip: DEVPOST_SKIP }, () => {
  const sections = devpostSections(readFileSync(DEVPOST_DOC, 'utf8'));
  assert.ok(
    sections,
    'farmbot/docs/devpost-submission.md has no editor-notes heading, so its i18n citations cannot be derived',
  );
  assert.deepEqual(devpostKeyProblems(sections.editorNotes), []);
});

test('the Devpost paste-ready text states no hardcoded inventory count', { skip: DEVPOST_SKIP }, () => {
  const sections = devpostSections(readFileSync(DEVPOST_DOC, 'utf8'));
  assert.ok(
    sections,
    'farmbot/docs/devpost-submission.md has no editor-notes heading, so its paste-ready section cannot be derived',
  );
  const problems = pasteReadyInventoryProblems(sections.pasteReady);
  assert.deepEqual(
    problems,
    [],
    `farmbot/docs/devpost-submission.md: states a hardcoded inventory instead of ` +
      `pointing at farmbot/dist/farmbot.findings.json, INTENT_FILES or the reporting ` +
      `command: ${problems.join('; ')}`,
  );
});

function devpostFixture(pasteReady, editorNotes) {
  return `${pasteReady}\n\n## Editor notes\n\n${editorNotes}\n`;
}

test('a Devpost file without an editor-notes heading cannot be read', () => {
  assert.equal(devpostSections('# Submission\n\nNo notes here.\n'), null);
  assert.equal(devpostSections('# Editor notes\n\nOnly notes.\n').pasteReady.trim(), '');
});

test('a Devpost editor note that cites a missing repository path fails and names it', () => {
  const missing = 'farmbot/docs/does-not-exist-here.md';
  const text = devpostFixture('Paste-ready text.', `- Claim source: \`${missing}\``);
  const problems = devpostPathProblems(devpostSections(text).editorNotes);
  assert.ok(
    problems.some((problem) => problem.includes(missing)),
    `a missing cited path must fail and name ${missing}: ${problems.join('; ')}`,
  );

  const escaped = devpostFixture('Paste-ready text.', '- Claim source: `farmbot/docs/../../outside.md`');
  assert.ok(
    devpostPathProblems(devpostSections(escaped).editorNotes).some((problem) =>
      problem.includes('farmbot/docs/../../outside.md'),
    ),
    'a cited path that escapes the repository must fail and name it',
  );

  const notPaths = devpostFixture(
    'Paste-ready text.',
    [
      '- Package pin: `@edgesentry/ontographia-wasm`',
      "- Relative import: `../lib/webllm-package`",
    ].join('\n'),
  );
  assert.deepEqual(
    devpostPathProblems(devpostSections(notPaths).editorNotes),
    [],
    'an npm scoped package or a relative import specifier is not a repository path',
  );
});

test('a Devpost editor note that cites an unknown i18n key fails and names it', () => {
  const missing = 'totallyMissingKey';
  const text = devpostFixture(
    'Paste-ready text.',
    `### i18n key mapping\n\n- \`${missing}\` maps to the heading.`,
  );
  const problems = devpostKeyProblems(devpostSections(text).editorNotes);
  assert.ok(
    problems.some(
      (problem) =>
        problem.includes(missing) && problem.includes('en') && problem.includes('ja'),
    ),
    `an unknown cited key must fail and name ${missing} and both languages: ${problems.join('; ')}`,
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

  const scoped = devpostFixture('Paste-ready text.', '- The demo compiles 5 check Intents.');
  assert.deepEqual(
    pasteReadyInventoryProblems(devpostSections(scoped).pasteReady),
    [],
    'an inventory count in the editor notes is outside the paste-ready section',
  );
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

test('a well-formed Devpost sample passes the path, key and paste-ready checks', () => {
  const text = devpostFixture(
    'The demo ships a compiled seed and runs the checks in the browser.',
    [
      '- Submission source: `farmbot/docs/checks.md`',
      '- Docs directory: `farmbot/docs/`',
      '- i18n source: `src/farmbot/i18n.ts`',
      '- Package pin: `@edgesentry/ontographia-wasm`',
      '- Relative import from the WebLLM module: `../lib/webllm-package`',
      '',
      '### i18n key mapping',
      '',
      '- `title` is the page heading.',
      '- `run` is the run button.',
    ].join('\n'),
  );
  const sections = devpostSections(text);
  assert.deepEqual(devpostPathProblems(sections.editorNotes), []);
  assert.deepEqual(devpostKeyProblems(sections.editorNotes), []);
  assert.deepEqual(pasteReadyInventoryProblems(sections.pasteReady), []);
});
