import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { DuckDBInstance } from '@duckdb/node-api';
import { loadOntographia } from '@edgesentry/ontographia-wasm';
import initRelate, { RelateDb } from '@relate/relate-wasm';
import { loadOntology } from '../scripts/graph.mjs';
import { generate as generateAllowedValues } from '../scripts/allowed-values.mjs';
import { insertDistinctReturn } from '../../src/farmbot/distinct-return.mjs';
import { planQuestion } from '../../src/farmbot/plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const EXTRACT = resolve(ROOT, 'farmbot/scripts/extract.mjs');
const ONTOLOGY_PATH = resolve(ROOT, 'farmbot/ontology/farmbot.native.yaml');
const INTENTS_DIR = resolve(ROOT, 'farmbot/intents');
const ORACLE_DIR = resolve(ROOT, 'farmbot/oracle');
const GOLD_RESULTS = resolve(ROOT, 'farmbot/oracle/default-results.gold.json');
const COMMITTED_SEED = resolve(ROOT, 'farmbot/dist/farmbot.seed.json');
const COMMITTED_SEED_DIGEST = `${COMMITTED_SEED}.sha256`;
const COMMITTED_ALLOWED_VALUES = resolve(
  ROOT,
  'farmbot/dist/farmbot.allowed-values.json',
);
const ONTOGRAPHIA_WASM = resolve(
  ROOT,
  'node_modules/@edgesentry/ontographia-wasm/ontographia_wasm.wasm',
);
const RELATE_WASM = resolve(
  ROOT,
  'node_modules/@relate/relate-wasm/relate_bg.wasm',
);
const SEED_DIGEST = readFileSync(COMMITTED_SEED_DIGEST, 'utf8').trim();

const QUESTION_FILES = [
  'q1-packing-differences.json',
  'q2-assembly-chapters-for-part.json',
  'q3-structures-for-part.json',
  'q4-kit-parts-for-category.json',
  'q5-unmatched-references.json',
];

// The Intent JSON shape is one traversal chain, so the container and product
// variant of a quantity comparison cannot be bound together with its part.
// Q1 therefore projects the part and the signed difference only; see
// farmbot/intents/README.md.
const ORACLE_PARAMS = {
  'q1-packing-differences.json': null,
  'q2-assembly-chapters-for-part.json': { part_name: 'M5 x 10mm Screw' },
  'q3-structures-for-part.json': { part_name: 'M5 Flange Locknut' },
  'q4-kit-parts-for-category.json': { category_slug: 'fasteners-and-hardware' },
  'q5-unmatched-references.json': { status: 'unmatched' },
};

// Q2 and Q3 project unique owners. Ontographia 0.1.10 still cannot emit DISTINCT, so
// the compiled statement is post-processed after compilation and before
// execution by `insertDistinctReturn`, the shared step in
// src/farmbot/distinct-return.mjs that the screen also uses. Everything else,
// including the $param_N placeholders, stays exactly as compiled.
const DISTINCT_QUESTIONS = new Set([
  'q2-assembly-chapters-for-part.json',
  'q3-structures-for-part.json',
]);

const temporaryDirectories = [];

function tempDir(prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runWire(db, query, params) {
  return JSON.parse(
    db.execute(query, params === null ? null : JSON.stringify(params)),
  );
}

function groupBy(entries, keyOf) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return groups;
}

function toJs(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toJs);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJs(entry)]),
    );
  }
  return value;
}

function multiset(rows) {
  return rows
    .map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(row)
            .sort()
            .map((key) => [key, toJs(row[key])]),
        ),
      ),
    )
    .sort();
}

// Build the extract into a private directory. FarmBot tests write their
// extract into a temp directory of their own; the committed farmbot/dist
// tree is only a read-only source of expected bytes. This file must not
// open farmbot/dist/farmbot.duckdb.
const PRIVATE_DIRECTORY = tempDir('farmbot-questions-extract-');
const built = spawnSync(process.execPath, [EXTRACT, '--out', PRIVATE_DIRECTORY], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert.equal(
  built.status,
  0,
  `extract failed:\n${built.stderr}\n${built.stdout}`,
);
const EXTRACT_PATH = join(PRIVATE_DIRECTORY, 'farmbot.duckdb');

const ontology = loadOntology(ONTOLOGY_PATH);
const ontologyText = readFileSync(ONTOLOGY_PATH, 'utf8');
const seedBytes = readFileSync(COMMITTED_SEED);
const seed = JSON.parse(seedBytes.toString('utf8'));
const allowedValues = JSON.parse(
  readFileSync(COMMITTED_ALLOWED_VALUES, 'utf8'),
);
const engine = await loadOntographia(readFileSync(ONTOGRAPHIA_WASM));
await initRelate({ module_or_path: readFileSync(RELATE_WASM) });

const db = new RelateDb();

for (const [labelSet, nodes] of groupBy(seed.nodes, (node) =>
  node.labels.join(':'),
)) {
  const labelText = labelSet
    .split(':')
    .map((label) => `:${label}`)
    .join('');
  const result = runWire(
    db,
    `UNWIND $rows AS row CREATE (n${labelText}) SET n += row`,
    { rows: nodes.map((node) => ({ id: node.id, ...node.properties })) },
  );
  if (result.error) throw new Error(`seeding ${labelSet}: ${result.error}`);
}

// Edge endpoints are matched on the relationship's declared classes, which the
// generator puts on every concrete node as ancestor labels.
for (const [type, edges] of groupBy(seed.edges, (edge) => edge.type)) {
  const declaration = ontology.relationships.get(type);
  if (!declaration) throw new Error(`undeclared relationship type ${type}`);
  const result = runWire(
    db,
    `UNWIND $rows AS row ` +
      `MATCH (a:${declaration.from} {id: row.from}), ` +
      `(b:${declaration.to} {id: row.to}) ` +
      `CREATE (a)-[:${type}]->(b)`,
    { rows: edges.map((edge) => ({ from: edge.from, to: edge.to })) },
  );
  if (result.error) throw new Error(`seeding ${type}: ${result.error}`);
}

const extractInstance = await DuckDBInstance.create(EXTRACT_PATH, {
  access_mode: 'READ_ONLY',
});
const extractConnection = await extractInstance.connect();

after(() => {
  extractConnection.closeSync();
  extractInstance.closeSync();
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const intents = new Map(
  QUESTION_FILES.map((file) => [
    file,
    JSON.parse(readFileSync(join(INTENTS_DIR, file), 'utf8')),
  ]),
);

const compiled = new Map(
  QUESTION_FILES.map((file) => [
    file,
    engine.buildCypher(ontologyText, intents.get(file), {
      ontologyPathHint: 'farmbot.native.yaml',
    }),
  ]),
);

function oracleSql(file) {
  return readFileSync(
    join(ORACLE_DIR, file.replace('.json', '.sql')),
    'utf8',
  );
}

async function oracleRows(file) {
  const params = ORACLE_PARAMS[file];
  const reader = await extractConnection.runAndReadAll(
    oracleSql(file),
    params === null ? undefined : params,
  );
  return reader.getRowObjectsJS();
}

async function runQuestion(file) {
  const intent = intents.get(file);
  const { query, params } = compiled.get(file);
  const executed = DISTINCT_QUESTIONS.has(file)
    ? insertDistinctReturn(query)
    : query;
  const result = runWire(db, executed, params);
  assert.equal(result.error, null, `${file}: ${result.error}`);
  assert.ok(
    result.rows.length < intent.limit,
    `${file} returned ${result.rows.length} rows and reached its limit ${intent.limit}`,
  );
  const expected = await oracleRows(file);
  assert.deepEqual(
    multiset(result.rows),
    multiset(expected),
    `${file}: Relate rows differ from the SQL oracle`,
  );
  return {
    intent,
    query,
    executed,
    rows: result.rows,
    columns: result.columns ?? [],
  };
}

test('the committed seed is the official graph with its pinned digest', () => {
  assert.ok(seed.nodes.length > 0, 'the committed seed has no node');
  assert.ok(seed.edges.length > 0, 'the committed seed has no edge');
  const digest = createHash('sha256').update(seedBytes).digest('hex');
  assert.equal(
    readFileSync(COMMITTED_SEED_DIGEST, 'utf8'),
    `farmbot-graph-v1 sha256:${digest}\n`,
  );
  assert.equal(`farmbot-graph-v1 sha256:${digest}`, SEED_DIGEST);

  const nodeCount = runWire(db, 'MATCH (n) RETURN count(n) AS nodes', null);
  assert.equal(nodeCount.error, null);
  assert.equal(nodeCount.rows[0].nodes, seed.nodes.length);
  const edgeCount = runWire(db, 'MATCH ()-[r]->() RETURN count(r) AS edges', null);
  assert.equal(edgeCount.error, null);
  assert.equal(edgeCount.rows[0].edges, seed.edges.length);
});

test('no shipped Intent traverses a relationship backwards', () => {
  for (const [file, intent] of intents) {
    const steps = intent.traverse ?? [];
    assert.ok(steps.length > 0, `${file} has no traverse step`);
    for (const [index, step] of steps.entries()) {
      assert.equal(
        step.direction,
        'out',
        `${file} traverse[${index}] (${step.relationship}) must use direction out`,
      );
    }
  }
});

test('every Intent compiles to parameter-bound Cypher with no literal filter value', () => {
  for (const [file, intent] of intents) {
    const { query, params } = compiled.get(file);
    const filters = intent.filter ?? [];
    assert.equal(
      Object.keys(params).length,
      filters.length,
      `${file}: one bound parameter per filter`,
    );
    for (const [name, value] of Object.entries(params)) {
      assert.ok(query.includes(`$${name}`), `${file}: missing $${name}`);
      assert.equal(query.includes(value), false, `${file}: literal ${value} in Cypher`);
    }
    for (const filter of filters) {
      const bound = Object.entries(params).filter(
        ([, value]) => value === filter.value,
      );
      assert.equal(
        bound.length,
        1,
        `${file}: filter value ${filter.value} is not bound exactly once`,
      );
    }
  }
});

test('the allowed-values file regenerates byte for byte and covers every parameter', async () => {
  const out = tempDir('farmbot-allowed-values-');
  const generated = await generateAllowedValues({
    extract: EXTRACT_PATH,
    out,
  });
  const committed = readFileSync(COMMITTED_ALLOWED_VALUES);
  assert.deepEqual(
    generated.values,
    allowedValues,
    'the committed allowed-values file is stale; regenerate it with farmbot/scripts/allowed-values.mjs',
  );
  assert.ok(
    committed.equals(readFileSync(generated.path)),
    'regenerated allowed-values bytes differ from the committed file',
  );

  const domains = {
    'q2-assembly-chapters-for-part.json': 'part_names_in_assembly_chapters',
    'q3-structures-for-part.json': 'part_names_in_all_three_structure_kinds',
    'q4-kit-parts-for-category.json': 'category_slugs_in_kits',
    'q5-unmatched-references.json': 'unmatched_statuses',
  };
  for (const [file, key] of Object.entries(domains)) {
    const [filter] = intents.get(file).filter;
    assert.ok(
      allowedValues[key].includes(filter.value),
      `${file}: ${filter.value} is not in ${key}`,
    );
  }
});

test('Q1 compares every packing difference with the oracle', async () => {
  const file = 'q1-packing-differences.json';
  const { rows } = await runQuestion(file);
  assert.equal(rows.length, (await oracleRows(file)).length);

  // Companion check for the columns the Intent cannot project: every
  // difference row belongs to a kit and carries a product version.
  const containers = toJs(
    (
      await extractConnection.runAndReadAll(
        'SELECT DISTINCT packing_page, version FROM quantity_difference ' +
          'ORDER BY packing_page, version',
      )
    ).getRowObjectsJS(),
  );
  assert.deepEqual(containers, [
    {
      packing_page: 'v1.7/manufacturing/packing/hardware-kit.md',
      version: 'standard',
    },
    {
      packing_page: 'v1.7/manufacturing/packing/hardware-kit.md',
      version: 'xl',
    },
  ]);
  for (const container of containers) {
    const node = seed.nodes.find(
      (entry) =>
        entry.labels.includes('Kit') &&
        entry.properties.path === container.packing_page,
    );
    assert.ok(node, `${container.packing_page} is not a Kit`);
  }
});

test('Q2 returns unique assembly chapters and adds DISTINCT after compilation', async () => {
  const file = 'q2-assembly-chapters-for-part.json';
  const { query, executed, rows } = await runQuestion(file);
  assert.equal(
    query.includes('DISTINCT'),
    false,
    'raw compiler output must not contain DISTINCT',
  );
  assert.ok(
    executed.includes('RETURN DISTINCT '),
    'executed statement needs RETURN DISTINCT',
  );
  assert.equal(new Set(multiset(rows)).size, rows.length);
  assert.equal(rows.length, (await oracleRows(file)).length);
});

test('Q3 returns unique structures and reaches every structure kind the part has', async () => {
  const file = 'q3-structures-for-part.json';
  const { query, executed, rows } = await runQuestion(file);
  assert.equal(
    query.includes('DISTINCT'),
    false,
    'raw compiler output must not contain DISTINCT',
  );
  assert.ok(
    executed.includes('RETURN DISTINCT '),
    'executed statement needs RETURN DISTINCT',
  );
  assert.equal(new Set(multiset(rows)).size, rows.length);
  assert.equal(rows.length, (await oracleRows(file)).length);

  // The Intent projects a structure path, not a class. Map each returned path
  // back to the seed labels and assert every structure kind the oracle says the
  // part reaches is reached, including ServiceProcedure when it has a service
  // reference.
  const labelsByPath = new Map();
  for (const node of seed.nodes) {
    if (!node.labels.includes('Structure')) continue;
    const path = node.properties.path;
    if (!labelsByPath.has(path)) labelsByPath.set(path, new Set());
    labelsByPath.get(path).add(node.labels[0]);
  }
  const expectedKinds = new Set();
  for (const row of await oracleRows(file)) {
    const labels = labelsByPath.get(row.structure);
    assert.ok(labels, `no Structure node has path ${row.structure}`);
    for (const label of labels) expectedKinds.add(label);
  }
  const reached = new Set();
  for (const row of rows) {
    const labels = labelsByPath.get(row.structure);
    assert.ok(labels, `no Structure node has path ${row.structure}`);
    for (const label of labels) reached.add(label);
  }
  for (const label of expectedKinds) {
    assert.ok(reached.has(label), `Q3 reached no ${label}`);
  }
  assert.ok(reached.has('AssemblyChapter'), 'Q3 reached no assembly chapter');
  assert.ok(reached.has('PreAssembly'), 'Q3 reached no pre-assembly');
  assert.ok(reached.has('Kit'), 'Q3 reached no kit');

  // A part with a service reference: the same Q3 Intent must now return the
  // ServiceProcedure page, matching the oracle.
  const servicePart = allowedValues.part_names_in_service_procedures[0];
  assert.ok(servicePart, 'the allowed values have no service part');
  const serviceIntent = structuredClone(intents.get(file));
  serviceIntent.filter[0].value = servicePart;
  const servicePlan = planQuestion(engine, ontologyText, serviceIntent, true);
  const serviceResult = runWire(db, servicePlan.executed, servicePlan.params);
  assert.equal(serviceResult.error, null, serviceResult.error);
  const serviceOracle = toJs(
    (
      await extractConnection.runAndReadAll(oracleSql(file), { part_name: servicePart })
    ).getRowObjectsJS(),
  );
  assert.deepEqual(multiset(serviceResult.rows), multiset(serviceOracle));
  const reachedService = serviceResult.rows.some((row) =>
    (labelsByPath.get(row.structure) ?? new Set()).has('ServiceProcedure'),
  );
  assert.ok(reachedService, `Q3 did not reach a service procedure for ${servicePart}`);
});

test('Q4 compares every kit part in the category with the oracle', async () => {
  const file = 'q4-kit-parts-for-category.json';
  const { rows } = await runQuestion(file);
  assert.equal(rows.length, (await oracleRows(file)).length);
});

test('Q5 compares every unmatched reference with the oracle', async () => {
  const file = 'q5-unmatched-references.json';
  const { rows } = await runQuestion(file);
  const expected = await oracleRows(file);
  assert.equal(rows.length, expected.length);
  assert.equal(
    new Set(rows.map((row) => row.display_name)).size,
    new Set(expected.map((row) => row.display_name)).size,
  );
});

test('the committed default-result gold matches Relate and the SQL oracle', async () => {
  const gold = JSON.parse(readFileSync(GOLD_RESULTS, 'utf8'));
  assert.equal(gold.format, 'farmbot-default-results-v1');
  assert.equal(gold.seedDigest, SEED_DIGEST);
  assert.equal(gold.seedBytes, seedBytes.length);
  assert.deepEqual(
    gold.questions.map((entry) => entry.id),
    ['q1', 'q2', 'q3', 'q4', 'q5'],
  );
  for (const [index, file] of QUESTION_FILES.entries()) {
    const entry = gold.questions[index];
    assert.equal(entry.intentFile, file);
    // runQuestion re-derives the rows from Relate and asserts they equal the
    // SQL oracle, so this comparison also pins the gold to the oracle.
    const { rows, columns } = await runQuestion(file);
    assert.equal(entry.rowCount, rows.length, `${file}: gold row count`);
    assert.deepEqual(entry.columns, columns, `${file}: gold columns`);
    assert.deepEqual(
      entry.rows.map((row) => JSON.stringify(row)),
      multiset(rows),
      `${file}: gold rows must match Relate and the SQL oracle`,
    );
  }
});
