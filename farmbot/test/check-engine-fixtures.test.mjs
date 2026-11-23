// Rule-module fixtures that the committed seed cannot shape: R6 name
// collisions and channel scope, and an unresolved service name on several
// pages. The SQL oracle reads the same fixture tables, so both implementations
// answer the same question.
//
// Every expected row is derived from the fixture values, and the name keys come
// from `normalizeName` / `singularizeName` so the SQL oracle has to agree.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { DuckDBInstance } from '@duckdb/node-api';
import { loadOntographia } from '@edgesentry/ontographia-wasm';

import { CHECKS, INTENT_FILES } from '../../src/farmbot/agent/checks.mjs';
import { compileCheck } from '../../src/farmbot/agent/compile.mjs';
import { collectFindings } from '../../src/farmbot/agent/index.mjs';
import { normalizeName, singularizeName } from '../../src/farmbot/agent/names.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHECKS_DIR = resolve(ROOT, 'farmbot/checks');
const ONTOLOGY_PATH = resolve(ROOT, 'farmbot/ontology/farmbot.native.yaml');
const SEED_PATH = resolve(ROOT, 'farmbot/dist/farmbot.seed.json');
const ORACLE_PATH = resolve(ROOT, 'farmbot/oracle/r6-changed-names.sql');
const ONTOGRAPHIA_WASM = resolve(
  ROOT,
  'node_modules/@edgesentry/ontographia-wasm/ontographia_wasm.wasm',
);

const ontologyText = readFileSync(ONTOLOGY_PATH, 'utf8');
const seedBytes = readFileSync(SEED_PATH);
const seedDigest = readFileSync(`${SEED_PATH}.sha256`, 'utf8').trim();
const checks = Object.fromEntries(
  INTENT_FILES.map((file) => [
    file,
    JSON.parse(readFileSync(join(CHECKS_DIR, file), 'utf8')),
  ]),
);
const engine = await loadOntographia(readFileSync(ONTOGRAPHIA_WASM));

const node = (properties) => ({ properties });

const compiledByQuery = new Map();
for (const file of INTENT_FILES) {
  const compiled = compileCheck(engine, ontologyText, checks[file]);
  compiledByQuery.set(JSON.stringify([compiled.query, compiled.params]), file);
}

/** Run the rule module with synthetic Intent rows keyed by Intent file. */
function runChecks(rows) {
  return collectFindings({
    engine,
    ontology: ontologyText,
    checks,
    seed: { bytes: seedBytes.length, digest: seedDigest },
    execute(query, params) {
      const file = compiledByQuery.get(JSON.stringify([query, params]));
      assert.ok(file, 'every executed query must come from a check Intent');
      return rows[file] ?? [];
    },
  });
}

/** Run the committed R6 oracle against a fresh in-memory database. */
async function oracleRows(packingItems, changeNotes, changeLinks, serviceReferences = [], assemblyReferences = []) {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    await connection.run(
      'CREATE TABLE packing_item (page_path VARCHAR, display_name VARCHAR, resolved_part VARCHAR)',
    );
    await connection.run(
      'CREATE TABLE service_reference (page_path VARCHAR, display_name VARCHAR, resolved_part VARCHAR)',
    );
    await connection.run(
      'CREATE TABLE assembly_reference (page_path VARCHAR, display_name VARCHAR, resolved_part VARCHAR)',
    );
    await connection.run(
      'CREATE TABLE change_note (section VARCHAR, bullet INTEGER, text VARCHAR)',
    );
    await connection.run(
      'CREATE TABLE change_note_link (section VARCHAR, bullet INTEGER, display_name VARCHAR, resolved_part VARCHAR)',
    );
    for (const row of packingItems) {
      await connection.run(
        'INSERT INTO packing_item (page_path, display_name, resolved_part) VALUES (?, ?, ?)',
        row,
      );
    }
    for (const row of serviceReferences) {
      await connection.run(
        'INSERT INTO service_reference (page_path, display_name, resolved_part) VALUES (?, ?, ?)',
        row,
      );
    }
    for (const row of assemblyReferences) {
      await connection.run(
        'INSERT INTO assembly_reference (page_path, display_name, resolved_part) VALUES (?, ?, ?)',
        row,
      );
    }
    for (const row of changeNotes) {
      await connection.run(
        'INSERT INTO change_note (section, bullet, text) VALUES (?, ?, ?)',
        row,
      );
    }
    for (const row of changeLinks) {
      await connection.run(
        'INSERT INTO change_note_link (section, bullet, display_name, resolved_part) VALUES (?, ?, ?, ?)',
        row,
      );
    }
    const reader = await connection.runAndReadAll(readFileSync(ORACLE_PATH, 'utf8'));
    return reader.getRowObjectsJS().map((row) => ({
      inferred: row.inferred,
      name: row.name,
      source_file: row.source_file,
    }));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function sortedRows(rows) {
  return rows
    .map((row) => JSON.stringify([row.inferred, row.name, row.source_file]))
    .sort();
}

test('the SQL name keys equal normalizeName and singularizeName', async () => {
  const names = [
    'Belt (1.7m)',
    'Nuts & Bolts',
    'Luer Lock Needle w/ cover (16 Gauge)',
    'M5 × 10 Screw',
    'Seeds',
  ];
  const packingItems = names.map((name, index) => [`page-${index}.md`, name, null]);
  const changeNotes = names.map((name, index) => [
    'Changed',
    index + 1,
    `- Removed the ${singularizeName(name)}.`,
  ]);
  const rows = await oracleRows(packingItems, changeNotes, []);

  const expected = names.map((name, index) => ({
    inferred: true,
    name: normalizeName(name),
    source_file: `page-${index}.md`,
  }));
  assert.deepEqual(sortedRows(rows), sortedRows(expected));
});

test('the SQL name keys singularize on the last word only', async () => {
  const names = ['Grads', 'F10 Bolts', 'Nuts And Washers'];
  const packingItems = names.map((name, index) => [`page-${index}.md`, name, null]);
  const changeNotes = names.map((name, index) => [
    'Changed',
    index + 1,
    `- Removed the ${singularizeName(name)}.`,
  ]);
  const rows = await oracleRows(packingItems, changeNotes, []);
  const expected = names.map((name, index) => ({
    inferred: true,
    name: normalizeName(name),
    source_file: `page-${index}.md`,
  }));
  assert.deepEqual(sortedRows(rows), sortedRows(expected));

  // A multi-word key whose last word is three characters long ending in `s`
  // must not singularize. The prose names the singular form, so the two only
  // match when the SQL keys the last word, as `singularizeName` does.
  const shortLast = normalizeName('F10 Las');
  assert.equal(singularizeName('F10 Las'), shortLast, 'a three-character last word stays');
  const shortRows = await oracleRows(
    [['short.md', 'F10 Las', null]],
    [['Changed', 1, `- Removed the ${normalizeName('F10 La')}.`]],
    [],
  );
  assert.deepEqual(shortRows, [], 'the short last word must not be singularized');

  assert.equal(singularizeName('F10 Bolts').endsWith('bolt'), true);
  assert.equal(singularizeName('Bus'), 'bus');
});

test('the SQL oracle strips parentheticals until stable', async () => {
  const names = ['Part (a)(b)(c)', 'Thing ((one)) ((two))', 'Widget (old) (rev 2)'];
  const packingItems = names.map((name, index) => [`page-${index}.md`, name, null]);
  const changeNotes = names.map((name, index) => [
    'Changed',
    index + 1,
    `- Removed the ${normalizeName(name)}.`,
  ]);
  const rows = await oracleRows(packingItems, changeNotes, []);
  const expected = names.map((name, index) => ({
    inferred: true,
    name: normalizeName(name),
    source_file: `page-${index}.md`,
  }));
  for (const index of names.keys()) {
    assert.equal(
      normalizeName(names[index]).includes('('),
      false,
      `${names[index]} still has parentheses after normalizeName`,
    );
  }
  assert.deepEqual(sortedRows(rows), sortedRows(expected));
});

test('an unresolved replacement link still suppresses the old name on both sides', async () => {
  const removalText =
    '- Replaced the black oxide wood screws with [[stainless steel screws]].';
  const rows = await oracleRows(
    [['hardware-kit.md', 'wood screws', null]],
    [['Changed', 1, removalText]],
    [['Changed', 1, 'stainless steel screws', null]],
  );
  assert.deepEqual(rows, [], 'the oracle must suppress the old name');

  const findings = runChecks({
    'r6-changes.json': [
      { change: node({ id: 'change:wood-screws', section: 'Changed', bullet: 1, text: removalText, line: 1, path: 'change-log.md' }) },
    ],
    'r2-manufacturing-unmatched.json': [
      {
        structure: node({ id: 'container:hardware-kit.md', path: 'hardware-kit.md', title: 'Hardware Kit' }),
        usage: node({
          id: 'usage:packing:hardware-kit.md@0/0/0',
          display_name: 'wood screws',
          match_method: 'unmatched',
        }),
      },
    ],
  });
  assert.deepEqual(
    findings.findings.filter((finding) => finding.rule === 'R6'),
    [],
    'the engine must suppress the old name',
  );
});

test('the SQL oracle promotes an unmatched row that collides with a changed part', async () => {
  const rows = await oracleRows(
    [
      ['fileA.md', 'Tee Nuts', 'Tee Nuts'],
      ['fileB.md', 'tee nuts', null],
    ],
    [
      ['Changed', 1, '- Removed the drop-in tee nuts.'],
      ['Changed', 4, '* Switched the old fasteners to [[Tee Nuts]].'],
    ],
    [['Changed', 4, 'Tee Nuts', 'Tee Nuts']],
  );
  assert.deepEqual(sortedRows(rows), sortedRows([
    { inferred: false, name: 'Tee Nuts', source_file: 'fileA.md' },
    { inferred: false, name: 'Tee Nuts', source_file: 'fileB.md' },
  ]));
});

test('a changed part matched only by an unmatched row is still a fact', async () => {
  const teeLinkNote = {
    section: 'Changed',
    bullet: 4,
    text: '* Switched the old fasteners to [[Tee Nuts]].',
  };
  const teePart = {
    id: 'part:Tee Nuts',
    name: 'Tee Nuts',
    category_slug: 'fasteners',
    slug: 'tee-nuts',
  };
  const rows = await oracleRows(
    [['fileB.md', 'tee nuts', null]],
    [
      ['Changed', 1, '- Removed the drop-in tee nuts.'],
      ['Changed', 4, teeLinkNote.text],
    ],
    [['Changed', 4, 'Tee Nuts', 'Tee Nuts']],
  );
  assert.deepEqual(sortedRows(rows), sortedRows([
    { inferred: false, name: 'Tee Nuts', source_file: 'fileB.md' },
  ]));

  const findings = runChecks({
    'changed-parts.json': [
      {
        change: node({ id: 'change:tee-link', ...teeLinkNote, line: 4, path: 'change-log.md' }),
        part: node(teePart),
      },
    ],
    'r6-changes.json': [
      { change: node({ id: 'change:tee', section: 'Changed', bullet: 1, text: '- Removed the drop-in tee nuts.', line: 1, path: 'change-log.md' }) },
      { change: node({ id: 'change:tee-link', ...teeLinkNote, line: 4, path: 'change-log.md' }) },
    ],
    'r2-manufacturing-unmatched.json': [
      {
        structure: node({ id: 'container:fileB.md', path: 'fileB.md', title: 'Kit B' }),
        usage: node({
          id: 'usage:packing:fileB.md@0/0/0',
          display_name: 'tee nuts',
          match_method: 'unmatched',
        }),
      },
    ],
  });
  const r6 = findings.findings.filter((finding) => finding.rule === 'R6');
  assert.equal(r6.length, 1, 'the unmatched-only row must still yield one fact finding');
  assert.equal(r6[0].inferred, false, 'the fact wins over the inference');
  assert.equal(r6[0].subject.key, 'Tee Nuts');
  assert.deepEqual(
    [...new Set(r6[0].evidence.filter((row) => row.role === 'packing-structure').map((row) => row.sourceFile))],
    ['fileB.md'],
  );
});

test('collectFindings and the oracle agree on the collision and channel scope', async () => {
  const teeNote = { section: 'Changed', bullet: 1, text: '- Removed the drop-in tee nuts.' };
  const magnetsNote = { section: 'Changed', bullet: 2, text: '- Removed the magnets.' };
  const rotaryNote = { section: 'Changed', bullet: 3, text: '- Removed the rotary tool chuck.' };
  const teeLinkNote = {
    section: 'Changed',
    bullet: 4,
    text: '* Switched the old fasteners to [[Tee Nuts]].',
  };

  const teePart = {
    id: 'part:Tee Nuts',
    name: 'Tee Nuts',
    category_slug: 'fasteners',
    slug: 'tee-nuts',
  };
  const rotaryPart = {
    id: 'part:Rotary Tool Chuck',
    name: 'Rotary Tool Chuck',
    category_slug: 'tools',
    slug: 'rotary-tool-chuck',
  };

  const rows = {
    'changed-parts.json': [
      {
        change: node({ id: 'change:tee-link', ...teeLinkNote, line: 4, path: 'change-log.md' }),
        part: node(teePart),
      },
    ],
    'r6-changes.json': [
      { change: node({ id: 'change:tee', ...teeNote, line: 1, path: 'change-log.md' }) },
      { change: node({ id: 'change:magnets', ...magnetsNote, line: 2, path: 'change-log.md' }) },
      { change: node({ id: 'change:rotary', ...rotaryNote, line: 3, path: 'change-log.md' }) },
      {
        change: node({
          id: 'change:tee-link',
          ...teeLinkNote,
          line: 4,
          path: 'change-log.md',
        }),
      },
    ],
    'refs-assembly.json': [
      {
        structure: node({ id: 'chapter:tracks.md', path: 'tracks.md', title: 'Tracks' }),
        usage: node({
          id: 'usage:assembly:tracks.md@1',
          display_name: 'Tee Nuts',
          match_method: 'exact',
          line_number: 7,
        }),
        part: node(teePart),
      },
    ],
    'refs-kit.json': [
      {
        structure: node({ id: 'container:fileA.md', path: 'fileA.md', title: 'Kit A' }),
        usage: node({
          id: 'usage:packing:fileA.md@0/0/0',
          display_name: 'Tee Nuts',
          match_method: 'exact',
        }),
        part: node(teePart),
      },
    ],
    'refs-bag.json': [
      {
        structure: node({
          id: 'bag:accessory:tool.md',
          path: 'tool.md',
          title: 'Tool',
        }),
        usage: node({
          id: 'usage:preassembly:tool.md@3',
          display_name: 'Rotary Tool Chuck',
          match_method: 'exact',
        }),
        part: node(rotaryPart),
      },
    ],
    'r2-manufacturing-unmatched.json': [
      {
        structure: node({ id: 'container:fileB.md', path: 'fileB.md', title: 'Kit B' }),
        usage: node({
          id: 'usage:packing:fileB.md@0/0/0',
          display_name: 'tee nuts',
          match_method: 'unmatched',
        }),
      },
      {
        structure: node({ id: 'preassembly:pre.md', path: 'pre.md', title: 'Pre' }),
        usage: node({
          id: 'usage:preassembly:pre.md@1',
          display_name: 'Magnets',
          match_method: 'unmatched',
        }),
      },
      {
        structure: node({ id: 'bag:accessory:tool.md', path: 'tool.md', title: 'Tool' }),
        usage: node({
          id: 'usage:preassembly:tool.md@2',
          display_name: 'Rotary Tool Chuck',
          match_method: 'unmatched',
        }),
      },
    ],
  };

  const findings = runChecks(rows);

  const r6 = findings.findings.filter((finding) => finding.rule === 'R6');
  assert.equal(r6.length, 1, 'the fixture must yield one R6 finding');
  const [finding] = r6;
  assert.equal(finding.inferred, false, 'the linked fact wins');
  assert.equal(finding.subject.key, 'Tee Nuts');
  const files = [
    ...new Set(
      finding.evidence
        .filter(
          (row) =>
            row.role === 'packing-structure' ||
            row.role === 'service' ||
            row.role === 'structure',
        )
        .map((row) => row.sourceFile),
    ),
  ].sort();
  assert.deepEqual(files, ['fileA.md', 'fileB.md', 'tracks.md']);
  // The assembly-chapter channel cites the chapter as a structure row and its
  // usage line as a reference row, so both land on the BOP lane.
  const chapterRows = finding.evidence.filter((row) => row.role === 'structure');
  assert.equal(chapterRows.length, 1, 'the fixture must cite one assembly chapter');
  assert.equal(
    chapterRows[0].nodeId,
    'chapter:tracks.md',
    'the cited structure row is not the assembly chapter',
  );
  assert.ok(
    finding.evidence.some(
      (row) =>
        row.role === 'reference' && row.nodeId === 'usage:assembly:tracks.md@1',
    ),
    'the fixture cites no assembly-chapter usage row',
  );
  for (const row of finding.evidence) {
    const nodeId = String(row.nodeId);
    assert.equal(nodeId.startsWith('preassembly:'), false, `${nodeId} is a pre-assembly page`);
    assert.equal(nodeId.startsWith('bag:accessory:'), false, `${nodeId} is an Accessory bag`);
    assert.equal(nodeId.startsWith('usage:preassembly:'), false, `${nodeId} is a pre-assembly line`);
  }

  const oracle = await oracleRows(
    [
      ['fileA.md', 'Tee Nuts', 'Tee Nuts'],
      ['fileB.md', 'tee nuts', null],
    ],
    [
      ['Changed', 1, teeNote.text],
      ['Changed', 2, magnetsNote.text],
      ['Changed', 3, rotaryNote.text],
      ['Changed', 4, teeLinkNote.text],
    ],
    [['Changed', 4, 'Tee Nuts', 'Tee Nuts']],
    [],
    [['tracks.md', 'Tee Nuts', 'Tee Nuts']],
  );
  const actual = files.map((sourceFile) => ({
    inferred: finding.inferred,
    name: finding.subject.key,
    source_file: sourceFile,
  }));
  assert.deepEqual(sortedRows(actual), sortedRows(oracle));
});

test('the R6 result ignores the input order of the Intent rows', () => {
  const teeNote = { section: 'Changed', bullet: 1, text: '- Removed the drop-in tee nuts.' };
  const teeLinkNote = {
    section: 'Changed',
    bullet: 4,
    text: '* Switched the old fasteners to [[Tee Nuts]].',
  };
  const teePart = {
    id: 'part:Tee Nuts',
    name: 'Tee Nuts',
    category_slug: 'fasteners',
    slug: 'tee-nuts',
  };

  const rows = {
    'changed-parts.json': [
      {
        change: node({ id: 'change:tee-link', ...teeLinkNote, line: 4, path: 'change-log.md' }),
        part: node(teePart),
      },
    ],
    'r6-changes.json': [
      { change: node({ id: 'change:tee', ...teeNote, line: 1, path: 'change-log.md' }) },
      { change: node({ id: 'change:tee-link', ...teeLinkNote, line: 4, path: 'change-log.md' }) },
    ],
    'refs-kit.json': [
      {
        structure: node({ id: 'container:fileA.md', path: 'fileA.md', title: 'Kit A' }),
        usage: node({
          id: 'usage:packing:fileA.md@0/0/0',
          display_name: 'Tee Nuts',
          match_method: 'exact',
        }),
        part: node(teePart),
      },
    ],
    'r2-manufacturing-unmatched.json': [
      {
        structure: node({ id: 'container:fileB.md', path: 'fileB.md', title: 'Kit B' }),
        usage: node({
          id: 'usage:packing:fileB.md@0/0/0',
          display_name: 'tee nuts',
          match_method: 'unmatched',
        }),
      },
    ],
  };

  /** Deterministic shuffle order driven by a small LCG. */
  const shuffle = (values, seed) => {
    const order = [...Array(values.length).keys()];
    let state = seed >>> 0;
    for (let index = order.length - 1; index > 0; index -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const swap = state % (index + 1);
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order.map((index) => values[index]);
  };

  const reference = runChecks(rows).findings.filter((finding) => finding.rule === 'R6');
  assert.ok(reference.length > 0, 'the R6 fixture must produce findings');

  for (const [label, transform] of [
    ['reversed', (list) => [...list].reverse()],
    ['shuffled', (list) => shuffle(list, 47)],
  ]) {
    const permuted = Object.fromEntries(
      Object.entries(rows).map(([file, list]) => [file, transform(list)]),
    );
    const result = runChecks(permuted).findings.filter((finding) => finding.rule === 'R6');
    assert.deepEqual(result, reference, `${label} Intent rows changed the R6 findings`);
  }
});

test('one unresolved service name on two pages joins both pages', () => {
  const findings = runChecks({
    'r9-service-unmatched.json': [
      {
        structure: node({ id: 'service:a.md', path: 'a.md', kind: 'maintenance', title: 'A' }),
        usage: node({
          id: 'usage:service:a.md@0',
          display_name: 'tee nuts',
          match_method: 'unmatched',
          line_number: 1,
        }),
      },
      {
        structure: node({ id: 'service:b.md', path: 'b.md', kind: 'maintenance', title: 'B' }),
        usage: node({
          id: 'usage:service:b.md@1',
          display_name: 'tee nuts',
          match_method: 'unmatched',
          line_number: 2,
        }),
      },
    ],
  });

  const r9 = findings.findings.filter((finding) => finding.rule === 'R9');
  assert.equal(r9.length, 1, 'the two pages must yield one finding');
  const [finding] = r9;
  for (const page of ['a.md', 'b.md']) {
    assert.ok(finding.summary.includes(page), `the summary drops ${page}`);
    assert.ok(finding.causes[0].text.includes(page), `the causes drop ${page}`);
    assert.ok(finding.countermeasures[0].includes(page), `the countermeasures drop ${page}`);
  }
});

test('every rule reads its R9 R2 Intents through the rule table', () => {
  const r9 = CHECKS.find((rule) => rule.id === 'R9');
  assert.ok(r9);
  for (const file of ['r2-assembly-unmatched.json', 'r2-manufacturing-unmatched.json']) {
    assert.ok(r9.intents.includes(file), `R9 does not declare ${file}`);
  }
});
