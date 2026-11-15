// Tests for the schema version 2 tables: the Change Log notes and the
// troubleshooting / maintenance service pages.
//
// The expected counts are never written by hand. A small independent oracle
// scans the source Markdown for the `[[part name]]` syntax, resolves each name
// against the `part` table with the same normalization the extract uses, and
// the tests compare the extract's rows with that scan.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { DuckDBInstance } from '@duckdb/node-api';

import { canonicalDigest, tableDigests } from '../scripts/extract.mjs';
import { parseFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { buildPartIndex, resolveName } from '../scripts/lib/normalize.mjs';
import { extractServicePages } from '../scripts/lib/service-pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const EXTRACT = resolve(ROOT, 'farmbot/scripts/extract.mjs');
const SOURCE = resolve(ROOT, 'farmbot/third_party/farmbot-genesis');
const SOURCE_LABEL = 'v1.7';
const COMMITTED_HASH = resolve(ROOT, 'farmbot/dist/farmbot.duckdb.sha256');
const FIXTURE = resolve(HERE, 'fixtures/extract-v1-tables.json');
const CHANGE_LOG = `${SOURCE_LABEL}/assembly/intro/change-log.md`;
const SERVICE_ROOTS = [
  { kind: 'troubleshooting', dir: `${SOURCE_LABEL}/extras/troubleshooting` },
  { kind: 'maintenance', dir: `${SOURCE_LABEL}/extras/maintenance` },
];
const LINK = /\[\[([^\]]+)\]\]/g;
const FENCE = /^\s*```/;

const tempDirs = [];
let buildDir = null;

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runExtract(outDir) {
  return spawnSync(process.execPath, [EXTRACT, '--out', outDir], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FARMBOT_GENESIS_DIR: '', FARMBOT_OUT_DIR: '' },
  });
}

function build() {
  if (!buildDir) {
    buildDir = tempDir('farmbot-extract-v2-');
    const result = runExtract(buildDir);
    assert.equal(result.status, 0, `extract failed:\n${result.stderr}\n${result.stdout}`);
  }
  return join(buildDir, 'farmbot.duckdb');
}

async function query(sql, params = []) {
  const instance = await DuckDBInstance.create(build(), { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    return (await connection.runAndReadAll(sql, params)).getRowObjectsJS();
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function markdownFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '_images') walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

function readSourcePage(relPath) {
  const text = readFileSync(join(SOURCE, relPath), 'utf8');
  const { data, body } = parseFrontmatter(text);
  return {
    path: relPath,
    title: typeof data.title === 'string' ? data.title : null,
    body,
  };
}

// The oracle's link scan: one entry per `[[name]]` occurrence, outside fences.
function scanLinks(body) {
  const links = [];
  let inFence = false;
  body.split(/\r?\n/).forEach((line, lineIndex) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const match of line.matchAll(LINK)) links.push({ line: lineIndex + 1, name: match[1].trim() });
  });
  return links;
}

// Resolve a display name against the extract's own `part` table names, using
// the shared normalization code.
function makeResolver(partNames) {
  const parts = partNames.map((name) => ({ name }));
  return (name) => resolveName(name, buildPartIndex(parts), parts).partName;
}

// Service links whose display name has no part page. This is the acceptance
// criterion, not a total: the totals come from the scan.
const KNOWN_UNRESOLVED = new Set(['tee nuts']);

before(() => {
  assert.ok(existsSync(SOURCE), `source submodule missing at ${SOURCE}`);
});

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

test('schema version is 2 and the new counts are recorded', async () => {
  const metadata = Object.fromEntries(
    (await query('SELECT key, value FROM extract_metadata')).map((row) => [row.key, row.value]),
  );
  assert.equal(metadata.schema_version, '2');

  const tables = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
  );
  const names = tables.map((row) => row.table_name);
  for (const table of ['change_note', 'service_page', 'service_reference']) {
    assert.ok(names.includes(table), `${table} is missing`);
  }

  const [{ n: changeNotes }] = await query('SELECT count(*) AS n FROM change_note');
  const [{ n: changeLinks }] = await query('SELECT count(*) AS n FROM change_note_link');
  const [{ n: servicePages }] = await query('SELECT count(*) AS n FROM service_page');
  const [{ n: serviceLinks }] = await query('SELECT count(*) AS n FROM service_reference');
  assert.equal(metadata.change_note_count, String(changeNotes));
  assert.equal(metadata.change_link_count, String(changeLinks));
  assert.equal(metadata.service_page_count, String(servicePages));
  assert.equal(metadata.service_reference_count, String(serviceLinks));
  assert.equal(metadata.change_link_resolved_count, String(changeLinks));
});

// The oracle's unit scan: for each `#` section, split the body into text units
// independently of the extract's parser. A unit is one list item or one
// paragraph; image-only lines and blank lines end a unit and are not units.
function scanUnits(body) {
  const units = [];
  let section = null;
  let block = [];
  const flush = () => {
    if (block.length > 0) {
      units.push({ section, text: block.join('\n').trim() });
      block = [];
    }
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      section = heading[2].replace(/\s*#+\s*$/, '').trim();
      continue;
    }
    if (!line.trim() || /^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      flush();
      block = [line];
      continue;
    }
    block.push(line);
  }
  flush();
  return units;
}

test('the change-log rows match an independent scan of the source', async () => {
  const partNames = (await query('SELECT name FROM part')).map((row) => row.name);
  const resolveToPart = makeResolver(partNames);

  const page = readSourcePage(CHANGE_LOG);
  const scanned = scanLinks(page.body);
  const units = scanUnits(page.body);
  const headings = [...page.body.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)].map((match) =>
    match[2].replace(/\s*#+\s*$/, '').trim(),
  );

  const actual = await query(
    'SELECT line_number, display_name, resolved_part FROM change_note_link ORDER BY line_number, display_name',
  );
  assert.equal(actual.length, scanned.length, 'link count');

  const actualSet = new Set(actual.map((row) => `${row.line_number}\u0000${row.display_name}`));
  const scannedSet = new Set(scanned.map((link) => `${link.line}\u0000${link.name}`));
  assert.deepEqual([...actualSet].sort(), [...scannedSet].sort());

  for (const link of scanned) {
    const resolved = resolveToPart(link.name);
    assert.ok(resolved, `change-log link ${JSON.stringify(link.name)} did not resolve`);
    const row = actual.find(
      (entry) => entry.line_number === link.line && entry.display_name === link.name,
    );
    assert.equal(row.resolved_part, resolved, `resolution for ${link.name}`);
  }

  const notes = await query('SELECT section, bullet, text, line_number FROM change_note');
  assert.deepEqual(
    [...new Set(notes.map((note) => note.section))].sort(),
    [...new Set(headings)].sort(),
    'every section heading is present',
  );
  assert.equal(notes.length, units.length, 'one row per text unit');

  const keys = notes.map((note) => `${note.section}\u0000${note.bullet}`);
  assert.equal(new Set(keys).size, keys.length, 'change_note is unique by (section, bullet)');
  for (const section of new Set(headings)) {
    const sectionNotes = notes.filter((note) => note.section === section);
    assert.ok(sectionNotes.length > 0, `section ${section} has no rows`);
    assert.deepEqual(
      sectionNotes.map((note) => note.bullet).sort((a, b) => Number(a) - Number(b)),
      sectionNotes.map((_, index) => index),
      `bullets in ${section} are 0..n-1`,
    );
  }
  console.log(
    `change log: ${new Set(headings).size} sections, ${notes.length} units, ` +
      `${scanned.length} links, ${actual.length} resolved`,
  );
});

test('the service rows match an independent scan of the source', async () => {
  const partNames = (await query('SELECT name FROM part')).map((row) => row.name);
  const resolveToPart = makeResolver(partNames);

  const scanned = [];
  const pagesWithLinks = new Map();
  let pageCount = 0;
  for (const root of SERVICE_ROOTS) {
    for (const file of markdownFiles(join(SOURCE, root.dir))) {
      const relPath = toPosix(relative(SOURCE, file));
      const page = readSourcePage(relPath);
      pageCount += 1;
      const links = scanLinks(page.body);
      if (links.length > 0) pagesWithLinks.set(relPath, root.kind);
      for (const link of links) {
        scanned.push({ page: relPath, line: link.line, name: link.name });
      }
    }
  }

  const actualPages = await query('SELECT path, title, kind FROM service_page ORDER BY path');
  const actualLinks = await query(
    'SELECT page_path, line_number, display_name, resolved_part FROM service_reference ' +
      'ORDER BY page_path, line_number, occurrence',
  );

  assert.equal(actualLinks.length, scanned.length, 'service link count');
  const actualSet = new Set(
    actualLinks.map((row) => `${row.page_path}\u0000${row.line_number}\u0000${row.display_name}`),
  );
  const scannedSet = new Set(scanned.map((link) => `${link.page}\u0000${link.line}\u0000${link.name}`));
  assert.deepEqual([...actualSet].sort(), [...scannedSet].sort());

  // Every page that has at least one link is listed, with the kind of its
  // directory; no page without links is listed.
  assert.deepEqual(
    actualPages.map((page) => page.path).sort(),
    [...pagesWithLinks.keys()].sort(),
  );
  for (const page of actualPages) {
    assert.equal(page.kind, pagesWithLinks.get(page.path), page.path);
    assert.ok(page.title, `${page.path} has no title`);
  }
  const byKind = {};
  for (const page of actualPages) {
    byKind[page.kind] = (byKind[page.kind] ?? 0) + 1;
  }

  const unresolved = new Set();
  for (const link of scanned) {
    const resolved = resolveToPart(link.name);
    const row = actualLinks.find(
      (entry) =>
        entry.page_path === link.page &&
        entry.line_number === link.line &&
        entry.display_name === link.name,
    );
    if (!resolved) unresolved.add(link.name);
    assert.equal(row.resolved_part, resolved, `resolution for ${link.name} on ${link.page}`);
  }
  assert.deepEqual([...unresolved].sort(), [...KNOWN_UNRESOLVED].sort());

  console.log(
    `service pages: ${pageCount} pages scanned, ${actualPages.length} with links ` +
      `(${Object.entries(byKind).map(([kind, count]) => `${kind} ${count}`).join(', ')}), ` +
      `${scanned.length} links, ${scanned.length - unresolved.size} resolved, ` +
      `unresolved ${[...unresolved].join(', ') || 'none'}`,
  );
});

test('service links are unique by page, line, name and occurrence', async () => {
  const rows = await query(
    'SELECT page_path, line_number, occurrence, display_name FROM service_reference',
  );
  const keys = rows.map(
    (row) => `${row.page_path}\u0000${row.line_number}\u0000${row.occurrence}\u0000${row.display_name}`,
  );
  assert.equal(new Set(keys).size, rows.length);

  // Two links on one line are two rows, distinguished by occurrence.
  const perLine = await query(
    'SELECT page_path, line_number, display_name, min(occurrence) AS first, ' +
      'max(occurrence) AS last, count(*) AS n FROM service_reference ' +
      'GROUP BY page_path, line_number, display_name HAVING count(*) > 1',
  );
  for (const group of perLine) {
    assert.equal(Number(group.first), 0, `${group.page_path}:${group.line_number}`);
    assert.equal(String(group.last), String(Number(group.n) - 1));
  }
});

test('the page parse does not depend on input order', async () => {
  const partNames = (await query('SELECT name FROM part')).map((row) => row.name);
  const parts = partNames.map((name) => ({ name }));
  const { buildPartIndex } = await import('../scripts/lib/normalize.mjs');
  const index = buildPartIndex(parts);

  const pages = SERVICE_ROOTS.flatMap((root) =>
    markdownFiles(join(SOURCE, root.dir)).map((file) => readSourcePage(toPosix(relative(SOURCE, file)))),
  );
  const forward = extractServicePages(pages, { index, parts });

  const reversed = extractServicePages([...pages].reverse(), { index, parts });
  assert.deepEqual(reversed.pages, forward.pages);
  assert.deepEqual(reversed.references, forward.references);

  // A deterministic shuffle (32-bit LCG seeded with a fixed value).
  let seed = 20261115;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shuffled = [...pages];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  assert.notDeepEqual(
    shuffled.map((page) => page.path),
    pages.map((page) => page.path),
    'the shuffle must actually reorder the pages',
  );
  const shuffledResult = extractServicePages(shuffled, { index, parts });
  assert.deepEqual(shuffledResult.pages, forward.pages);
  assert.deepEqual(shuffledResult.references, forward.references);
});

test('the existing tables keep their schema version 1 logical dumps', async () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const digests = await tableDigests(build());
  for (const [table, expected] of Object.entries(fixture.tables)) {
    assert.equal(digests[table], expected, `${table} changed`);
  }

  const metadata = Object.fromEntries(
    (await query('SELECT key, value FROM extract_metadata')).map((row) => [row.key, row.value]),
  );
  for (const [key, expected] of Object.entries(fixture.extractMetadata)) {
    if (key === 'schema_version') continue;
    assert.equal(metadata[key], expected, `metadata ${key} changed`);
  }
  assert.equal(metadata.schema_version, '2');
});

test('two extractions agree and match the committed digest', async () => {
  const second = tempDir('farmbot-extract-v2-rebuild-');
  const result = runExtract(second);
  assert.equal(result.status, 0, `extract failed:\n${result.stderr}`);

  const committed = readFileSync(COMMITTED_HASH, 'utf8').trim();
  const first = await canonicalDigest(build());
  const rebuilt = await canonicalDigest(join(second, 'farmbot.duckdb'));
  assert.equal(first, rebuilt);
  assert.equal(first, committed);
});
