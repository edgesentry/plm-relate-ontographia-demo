// Tests for the constructed SBOM (materials) view: the shared
// canonicalization module, the documented-material columns of the extract
// (fixture pages and the pinned submodule), and the `material` evidence rows
// the shared agent path attaches.
//
// Every expected value is either a real string from the pinned FarmBot
// Genesis v1.7 pages, a fixture page's own value, or a value derived here
// from the built extract. No count is written by hand.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { DuckDBInstance } from '@duckdb/node-api';
import { loadOntographia } from '@edgesentry/ontographia-wasm';

import { canonicalJson } from '../../src/farmbot/agent/canonical.mjs';
import { INTENT_FILES } from '../../src/farmbot/agent/checks.mjs';
import { compileCheck } from '../../src/farmbot/agent/compile.mjs';
import { collectFindings } from '../../src/farmbot/agent/index.mjs';
import { messages } from '../../src/farmbot/i18n.ts';
import {
  materialDisplayName,
  materialGroupsByRaw,
  materialKey,
  materialNodeId,
} from '../../src/farmbot/materials.mjs';
import { readParts } from '../scripts/extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const EXTRACT_SCRIPT = resolve(ROOT, 'farmbot/scripts/extract.mjs');
const FIXTURE_SOURCE = resolve(HERE, 'fixtures/material-parts');
const CHECKS_DIR = resolve(ROOT, 'farmbot/checks');
const ONTOLOGY_PATH = resolve(ROOT, 'farmbot/ontology/farmbot.native.yaml');
const SEED_PATH = resolve(ROOT, 'farmbot/dist/farmbot.seed.json');
const ONTOGRAPHIA_WASM = resolve(
  ROOT,
  'node_modules/@edgesentry/ontographia-wasm/ontographia_wasm.wasm',
);

const tempDirs = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Shared canonicalization

test('materialKey lowercases and collapses internal whitespace', () => {
  assert.equal(materialKey('Stainless Steel'), 'stainless steel');
  assert.equal(materialKey('  stainless   steel '), 'stainless steel');
  assert.equal(materialKey('Black Nylon PA66'), 'black nylon pa66');
  assert.equal(materialKey('Neoprene with fiberglass cords'), 'neoprene with fiberglass cords');
  assert.throws(() => materialKey(null), /needs a string/);
  assert.throws(() => materialKey(42), /needs a string/);
});

test('materialNodeId is the normalization key after the material: prefix', () => {
  assert.equal(materialNodeId('stainless steel'), 'material:stainless steel');
  assert.equal(
    materialNodeId(materialKey('Neoprene with fiberglass cords')),
    'material:neoprene with fiberglass cords',
  );
  assert.throws(() => materialNodeId(''), /non-empty key/);
  assert.throws(() => materialNodeId(null), /non-empty key/);
});

test('materialDisplayName picks the first raw string in code-unit order', () => {
  // 'S' sorts before 's', so the capitalized twin is the display name.
  assert.equal(materialDisplayName(['stainless steel', 'Stainless Steel']), 'Stainless Steel');
  assert.equal(materialDisplayName(['Stainless Steel', 'stainless steel']), 'Stainless Steel');
  // Plain code-unit order: uppercase letters sort first.
  assert.equal(materialDisplayName(['b', 'a', 'B']), 'B');
  assert.throws(() => materialDisplayName([]), /non-empty/);
  assert.throws(() => materialDisplayName(['ok', null]), /needs strings/);
});

test('materialGroupsByRaw skips absent values and keeps every distinct raw', () => {
  const groups = materialGroupsByRaw([
    'Stainless Steel',
    null,
    'stainless steel',
    '',
    undefined,
    'Stainless Steel',
  ]);
  assert.deepEqual([...groups.keys()], ['stainless steel']);
  assert.deepEqual(groups.get('stainless steel'), ['Stainless Steel', 'stainless steel']);
  assert.deepEqual([...materialGroupsByRaw([null, undefined, '']).keys()], []);
});

// ---------------------------------------------------------------------------
// Fixture part pages

/** The fixture categories map, shaped like the extract's own `readCategories`. */
function fixtureCategories() {
  return new Map([
    [
      'fasteners-and-hardware',
      {
        slug: 'fasteners-and-hardware',
        title: 'Fasteners and hardware',
        path: 'v1.7/bom/fasteners-and-hardware.md',
      },
    ],
  ]);
}

test('a fixture part page with specs.material persists its raw string', () => {
  const parts = readParts(FIXTURE_SOURCE, fixtureCategories());
  const byName = new Map(parts.map((part) => [part.name, part]));

  // The category page is not a part; every part page in the fixture is read.
  assert.equal(parts.length, 4);
  assert.equal(byName.has('Fasteners and hardware'), false);

  const screw = byName.get('Fixture Screw');
  assert.equal(screw.materialRaw, 'Stainless Steel');

  // The page without a material key and the page with an empty material value
  // both have no material, and nothing is invented for them.
  const spacer = byName.get('Fixture Plain Spacer');
  assert.equal(spacer.materialRaw, null);
  assert.equal(spacer.materialName, null);
  const blank = byName.get('Fixture Blank Material');
  assert.equal(blank.materialRaw, null);
  assert.equal(blank.materialName, null);
});

test('typographic twins share one display name but keep their raw strings', () => {
  const parts = readParts(FIXTURE_SOURCE, fixtureCategories());
  const byName = new Map(parts.map((part) => [part.name, part]));

  const screw = byName.get('Fixture Screw');
  const nutBar = byName.get('Fixture Nut Bar');
  assert.equal(screw.materialRaw, 'Stainless Steel');
  assert.equal(nutBar.materialRaw, 'stainless steel');

  // One display name for the shared key, chosen in plain code-unit order.
  assert.equal(screw.materialName, 'Stainless Steel');
  assert.equal(nutBar.materialName, 'Stainless Steel');

  // The raw strings are not rewritten on the parts that recorded them.
  assert.notEqual(screw.materialRaw, nutBar.materialRaw);
});

test('readParts is deterministic for any input page order', () => {
  const categories = fixtureCategories();
  const first = readParts(FIXTURE_SOURCE, categories);
  const second = readParts(FIXTURE_SOURCE, categories);
  assert.deepEqual(second, first);
});

// ---------------------------------------------------------------------------
// The pinned extract

// Build into a private temp directory: the committed farmbot/dist tree is a
// read-only source of expected bytes, never an output location for this file.
const OUTPUT_DIRECTORY = tempDir('farmbot-sbom-extract-');
const DB_PATH = join(OUTPUT_DIRECTORY, 'farmbot.duckdb');
const built = spawnSync(process.execPath, [EXTRACT_SCRIPT, '--out', OUTPUT_DIRECTORY], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, FARMBOT_GENESIS_DIR: '', FARMBOT_OUT_DIR: '' },
});
assert.equal(
  built.status,
  0,
  `extract failed:\n${built.stderr}\n${built.stdout}`,
);

async function query(sql) {
  const instance = await DuckDBInstance.create(DB_PATH, { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    return (await connection.runAndReadAll(sql)).getRowObjectsJS();
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

test('the pinned pages persist their documented material strings unchanged', async () => {
  const m5 = await query(
    "SELECT material_raw, material_name FROM part WHERE name = 'M5 x 10mm Screw'",
  );
  assert.deepEqual(m5, [{ material_raw: 'Stainless Steel', material_name: 'Stainless Steel' }]);

  // A page that records `materials` (plural) has no `specs.material` and no
  // material: nothing is invented for it.
  const box = await query(
    "SELECT material_raw, material_name FROM part WHERE name = 'Electronics Box'",
  );
  assert.deepEqual(box, [{ material_raw: null, material_name: null }]);

  // Some part pages document no material at all.
  const [{ n: withoutMaterial }] = await query(
    'SELECT count(*) AS n FROM part WHERE material_raw IS NULL',
  );
  assert.ok(Number(withoutMaterial) > 0, 'every part page suddenly has a material');
});

test('typographic twins in the pinned pages share a display name, not a raw string', async () => {
  const rows = await query(
    "SELECT name, material_raw, material_name FROM part WHERE material_raw IN ('Stainless Steel', 'Stainless steel') ORDER BY material_raw, name",
  );
  assert.ok(rows.length > 1, 'the pinned pages have no stainless-steel twins');
  assert.equal(new Set(rows.map((row) => row.material_name)).size, 1);
  assert.equal(rows[0].material_name, 'Stainless Steel');
  assert.equal(
    new Set(rows.map((row) => row.material_raw)).size,
    2,
    'the extract rewrote a raw material string',
  );
});

test('the material columns agree with the shared canonicalization', async () => {
  const rows = await query(
    'SELECT name, material_raw, material_name FROM part WHERE material_raw IS NOT NULL',
  );
  assert.ok(rows.length > 0, 'no part page documents a material');

  const groups = materialGroupsByRaw(rows.map((row) => row.material_raw));
  const expected = new Map(
    [...groups.entries()].map(([key, raws]) => [key, materialDisplayName(raws)]),
  );
  for (const row of rows) {
    assert.equal(
      row.material_name,
      expected.get(materialKey(row.material_raw)),
      `${row.name}: display name of ${row.material_raw}`,
    );
  }
});

test('the material metadata counts equal the part table', async () => {
  const metadata = Object.fromEntries(
    (await query('SELECT key, value FROM extract_metadata')).map((row) => [row.key, row.value]),
  );
  assert.equal(metadata.schema_version, '3');

  const [{ n: partsWithMaterial }] = await query(
    'SELECT count(*) AS n FROM part WHERE material_raw IS NOT NULL',
  );
  assert.equal(metadata.part_material_count, String(partsWithMaterial));

  const [{ n: materialKeys }] = await query(
    "SELECT count(DISTINCT regexp_replace(lower(trim(material_raw)), '\\s+', ' ', 'g')) AS n " +
      'FROM part WHERE material_raw IS NOT NULL',
  );
  assert.equal(metadata.material_key_count, String(materialKeys));

  // Every part with a material has a display name; no part without one does.
  const [{ n: rawWithoutName }] = await query(
    'SELECT count(*) AS n FROM part WHERE material_raw IS NOT NULL AND material_name IS NULL',
  );
  assert.equal(Number(rawWithoutName), 0);
  const [{ n: nameWithoutRaw }] = await query(
    'SELECT count(*) AS n FROM part WHERE material_raw IS NULL AND material_name IS NOT NULL',
  );
  assert.equal(Number(nameWithoutRaw), 0);
});

// ---------------------------------------------------------------------------
// The shared agent path

const ontologyText = readFileSync(ONTOLOGY_PATH, 'utf8');
const checks = Object.fromEntries(
  INTENT_FILES.map((file) => [file, JSON.parse(readFileSync(join(CHECKS_DIR, file), 'utf8'))]),
);
const engine = await loadOntographia(readFileSync(ONTOGRAPHIA_WASM));

const compiledByQuery = new Map();
for (const file of INTENT_FILES) {
  const compiled = compileCheck(engine, ontologyText, checks[file]);
  compiledByQuery.set(JSON.stringify([compiled.query, compiled.params]), file);
}

const seedDigest = readFileSync(`${SEED_PATH}.sha256`, 'utf8').trim();
const seedBytes = statSync(SEED_PATH).size;

/** Run the rule module with synthetic Intent rows keyed by Intent file. */
function runChecks(rows, sources) {
  return collectFindings({
    engine,
    ontology: ontologyText,
    checks,
    sources,
    seed: { bytes: seedBytes, digest: seedDigest },
    execute(query, params) {
      const file = compiledByQuery.get(JSON.stringify([query, params]));
      assert.ok(file, 'every executed query must come from a check Intent');
      return rows[file] ?? [];
    },
  });
}

const node = (properties) => ({ properties });

const materialPart = (name, raw, displayName) =>
  node({
    id: `part:${name}`,
    name,
    category_slug: 'fasteners-and-hardware',
    slug: name.toLowerCase().replaceAll(' ', '-'),
    material_raw: raw,
    material_name: displayName,
  });

const barePart = (name) =>
  node({
    id: `part:${name}`,
    name,
    category_slug: 'fasteners-and-hardware',
    slug: name.toLowerCase().replaceAll(' ', '-'),
  });

const SOURCES = {
  'part:Fixture Screw': 'v1.7/bom/fasteners-and-hardware/fixture-screw.md',
  'part:Fixture Nut Bar': 'v1.7/bom/fasteners-and-hardware/fixture-nut-bar.md',
  'part:Fixture Plain Spacer': 'v1.7/bom/fasteners-and-hardware/fixture-plain-spacer.md',
};

test('a finding that cites a part with a material also cites the material node', () => {
  const findings = runChecks(
    { 'r3-parts-without-reference.json': [{ part: materialPart('Fixture Screw', 'Stainless Steel', 'Stainless Steel') }] },
    SOURCES,
  );
  const r3 = findings.findings.filter((finding) => finding.rule === 'R3');
  assert.equal(r3.length, 1, 'the fixture yielded no R3 finding');

  const partRows = r3[0].evidence.filter((row) => row.role === 'part');
  const materialRows = r3[0].evidence.filter((row) => row.role === 'material');
  assert.equal(partRows.length, 1);
  assert.equal(materialRows.length, 1, `${r3[0].id} did not attach its material row`);

  assert.equal(materialRows[0].nodeId, 'material:stainless steel');
  assert.equal(materialRows[0].sourceFile, partRows[0].sourceFile);
  assert.equal(materialRows[0].line, null);
  assert.deepEqual(materialRows[0].facts, {
    displayName: 'Stainless Steel',
    material: 'Stainless Steel',
    partNodeId: 'part:Fixture Screw',
  });
});

test('a part without a documented material gets no material row', () => {
  const findings = runChecks(
    {
      'r3-parts-without-reference.json': [
        { part: barePart('Fixture Plain Spacer') },
        { part: materialPart('Fixture Screw', 'Stainless Steel', 'Stainless Steel') },
      ],
    },
    SOURCES,
  );
  const bySubject = new Map(findings.findings.map((finding) => [finding.subject.key, finding]));
  const spacer = bySubject.get('Fixture Plain Spacer');
  assert.ok(spacer, 'the fixture yielded no finding for the part without a material');
  assert.equal(
    spacer.evidence.some((row) => row.role === 'material'),
    false,
    `${spacer.id} cites a material its part page does not document`,
  );

  // The engine saw a part with a material, but that does not give the other
  // finding a material row.
  const screw = bySubject.get('Fixture Screw');
  assert.ok(screw, 'the fixture yielded no finding for the part with a material');
  assert.equal(screw.evidence.filter((row) => row.role === 'material').length, 1);
});

test('no material row is added for a part the finding does not cite', () => {
  // The reference Intent names a part with a material; the R3 finding cites a
  // different part, so its evidence must not mention the referenced material.
  const findings = runChecks(
    {
      'r3-parts-without-reference.json': [{ part: barePart('Fixture Plain Spacer') }],
      'refs-kit.json': [
        {
          structure: node({ id: 'container:fixture-kit.md', path: 'fixture-kit.md', title: 'Fixture Kit' }),
          usage: node({
            id: 'usage:packing:fixture-kit.md@0/0/0',
            display_name: 'Fixture Screw',
            match_method: 'exact',
            line_number: 3,
            quantity: 2,
          }),
          part: materialPart('Fixture Screw', 'Stainless Steel', 'Stainless Steel'),
        },
      ],
    },
    SOURCES,
  );
  const r3 = findings.findings.filter((finding) => finding.rule === 'R3');
  assert.equal(r3.length, 1);
  assert.equal(
    r3[0].evidence.some((row) => row.role === 'material'),
    false,
    `${r3[0].id} cites the material of a part it never cites`,
  );
});

test('twin raw strings keep their own row and share the material node', () => {
  const findings = runChecks(
    {
      'r3-parts-without-reference.json': [
        { part: materialPart('Fixture Screw', 'Stainless Steel', 'Stainless Steel') },
        { part: materialPart('Fixture Nut Bar', 'stainless steel', 'Stainless Steel') },
      ],
    },
    SOURCES,
  );
  const bySubject = new Map(findings.findings.map((finding) => [finding.subject.key, finding]));
  const screw = bySubject.get('Fixture Screw');
  const nutBar = bySubject.get('Fixture Nut Bar');
  assert.ok(screw && nutBar, 'the fixture yielded no findings for the twins');

  for (const [finding, raw] of [
    [screw, 'Stainless Steel'],
    [nutBar, 'stainless steel'],
  ]) {
    const materialRows = finding.evidence.filter((row) => row.role === 'material');
    assert.equal(materialRows.length, 1);
    // Both twins reach the one material node and keep their own raw string.
    assert.equal(materialRows[0].nodeId, 'material:stainless steel');
    assert.equal(materialRows[0].facts.material, raw);
    assert.equal(materialRows[0].facts.displayName, 'Stainless Steel');
  }
});

test('the material rows are deterministic for any input order', () => {
  const rows = {
    'r3-parts-without-reference.json': [
      { part: materialPart('Fixture Nut Bar', 'stainless steel', 'Stainless Steel') },
      { part: materialPart('Fixture Screw', 'Stainless Steel', 'Stainless Steel') },
      { part: barePart('Fixture Plain Spacer') },
    ],
  };
  const reference = canonicalJson(runChecks(rows, SOURCES));

  const reversed = {
    'r3-parts-without-reference.json': [...rows['r3-parts-without-reference.json']].reverse(),
  };
  assert.equal(
    canonicalJson(runChecks(reversed, SOURCES)),
    reference,
    'reversed Intent rows changed the findings',
  );
  assert.equal(
    canonicalJson(runChecks(rows, SOURCES)),
    reference,
    'a second run changed the findings',
  );

  const sourcesReversed = Object.fromEntries(Object.entries(SOURCES).reverse());
  assert.equal(
    canonicalJson(runChecks(rows, sourcesReversed)),
    reference,
    'reversed part sources changed the findings',
  );
});

test('the SBOM lane label exists in both language blocks', () => {
  assert.deepEqual(
    Object.keys(messages.en),
    Object.keys(messages.ja),
    'the ja/en i18n key sets or order differ',
  );
  assert.equal(messages.en.laneSbom, 'SBOM (materials)');
  assert.equal(messages.ja.laneSbom, 'SBOM（材料）');
});
