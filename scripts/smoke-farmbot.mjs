// Headless browser smoke for the FarmBot screen at /farmbot/.
//
// Unlike `vite preview`, this script serves dist/ with the production headers
// from `_headers` (the CSP, the WASM content type, and the immutable asset
// cache rule), so a "zero CSP violations" result is meaningful. Set
// SMOKE_BASE_URL to drive a deployed origin instead; the given origin is used
// as the site root and its headers are left alone.
//
// The script does not build. Run `npx -y node@22 scripts/verify.mjs` (or a Node
// 22 `npm run build`) first. On any assertion failure it exits 1.
//
// Proposed latency budgets are reported but not enforced. Set
// SMOKE_FARMBOT_ENFORCE_BUDGET=1 to fail when a budget is missed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

import { CHECK_CATALOG } from '../src/farmbot/check-catalog.mjs';
import {
  orderFindings,
  summaryLine,
} from '../src/farmbot/findings-view.mjs';
import { layoutFinding } from '../src/farmbot/process-lanes.mjs';
import { SAMPLE_NOTIFICATIONS } from '../src/farmbot/sample-notifications.mjs';

const root = resolve(import.meta.dirname, '..');
const liveBase = process.env.SMOKE_BASE_URL?.trim();
const port = Number(process.env.SMOKE_PORT ?? 4175);
const base = (liveBase || `http://127.0.0.1:${port}`).replace(/\/?$/, '/');
const baseOrigin = new URL(base).origin;
const entryUrl = `${base}farmbot/`;
const useLive = Boolean(liveBase);
const enforceBudget = process.env.SMOKE_FARMBOT_ENFORCE_BUDGET === '1';

const SEED_BUDGET_MS = 2000;
const QUERY_BUDGET_MS = 100;
const EXPECTED_SEED_SHA256 = readFileSync(
  join(root, 'farmbot/dist/farmbot.seed.json.sha256'),
  'utf8',
)
  .trim()
  .replace(/^farmbot-graph-v1 sha256:/, '');
const EXPECTED_SEED_DIGEST = `farmbot-graph-v1 sha256:${EXPECTED_SEED_SHA256}`;
const QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5'];

const committedSeedPath = join(root, 'farmbot/dist/farmbot.seed.json');
const committedManifest = JSON.parse(
  readFileSync(join(root, 'farmbot/dist/farmbot.release.json'), 'utf8'),
);
const EXPECTED_STORE_DIGEST =
  `${committedManifest.relateStore.digestFormat} ` +
  `sha256:${committedManifest.relateStore.sha256}`;
const goldPath = join(root, 'farmbot/oracle/default-results.gold.json');
const findingsPath = join(root, 'farmbot/dist/farmbot.findings.json');
const findingsDigestPath = `${findingsPath}.sha256`;

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

/** `blob:` and `data:` URLs are not outbound hosts. */
const isExternal = (url) => {
  const parsed = new URL(url);
  return (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    parsed.origin !== baseOrigin
  );
};

const isModelHost = (url) => {
  const hostname = new URL(url).hostname;
  return (
    hostname === 'huggingface.co' ||
    hostname === 'hf.co' ||
    hostname.endsWith('.hf.co') ||
    hostname === 'raw.githubusercontent.com'
  );
};

const isLazyWebllmUrl = (url) =>
  /webllm-package/.test(pathOf(url)) || /\/lib-[^/]+\.js$/.test(pathOf(url));

function findLazyWebllmChunk() {
  const assets = join(root, 'dist/assets');
  if (!existsSync(assets)) throw new Error('dist/assets is missing; run the production build first');
  return readdirSync(assets)
    .filter((file) => file.endsWith('.js'))
    .find((file) =>
      readFileSync(join(assets, file), 'utf8').includes('ontographia-webllm-package-v1'),
    );
}

function assertNoModelRequests(requests, label) {
  const modelHosts = requests.filter(isModelHost);
  assert(modelHosts.length === 0, `${label} requested model host(s): ${modelHosts.join(', ')}`);
  const lazyChunks = requests.filter(isLazyWebllmUrl);
  assert(lazyChunks.length === 0, `${label} loaded lazy WebLLM chunk(s): ${lazyChunks.join(', ')}`);
  return { modelHosts: modelHosts.length, lazyChunks: lazyChunks.length };
}

/** Mirrors `cellText` in src/farmbot/App.tsx. */
const cellText = (value) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// --- static server: dist/ plus the production `_headers` rules --------------

function parseHeaderRules(text) {
  const rules = [];
  let rule = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      rule = null;
      continue;
    }
    if (/^\s/.test(line)) {
      if (!rule) continue;
      const separator = line.indexOf(':');
      if (separator === -1) continue;
      rule.headers.push([
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ]);
      continue;
    }
    rule = { pattern: line.trim(), headers: [] };
    rules.push(rule);
  }
  return rules;
}

/** One `*` splat, matched greedily; absolute patterns use their path. */
function patternMatches(pattern, pathname) {
  const path = /^https?:\/\//.test(pattern) ? new URL(pattern).pathname : pattern;
  const source = path
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(pathname);
}

/** Rules apply in file order; repeated headers are comma-joined. */
function headersFor(rules, pathname) {
  const headers = new Map();
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, pathname)) continue;
    for (const [name, value] of rule.headers) {
      headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
    }
  }
  return headers;
}

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

async function startStaticServer() {
  const distRoot = join(root, 'dist');
  for (const file of ['farmbot/index.html', 'farmbot/farmbot.seed.json']) {
    if (!existsSync(join(distRoot, file))) {
      throw new Error(
        `dist/${file} is missing; run \`npx -y node@22 scripts/verify.mjs\` ` +
          '(or a Node 22 `npm run build`) first',
      );
    }
  }
  const headersPath = join(distRoot, '_headers');
  assert(
    existsSync(headersPath),
    'dist/_headers is missing; the production CSP cannot be applied without it',
  );
  const rules = parseHeaderRules(readFileSync(headersPath, 'utf8'));
  assert(rules.length > 0, 'dist/_headers contains no rules');

  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
      );
    } catch {
      response.writeHead(400);
      response.end('bad request');
      return;
    }
    const filePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const target = resolve(distRoot, `.${filePath}`);
    if (
      !target.startsWith(`${distRoot}${sep}`) ||
      !existsSync(target) ||
      !statSync(target).isFile()
    ) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    const bytes = readFileSync(target);
    const headers = new Map([
      ['Content-Type', MIME_TYPES.get(extname(target)) ?? 'application/octet-stream'],
      ['Content-Length', String(bytes.length)],
    ]);
    for (const [name, value] of headersFor(rules, pathname)) {
      headers.set(name, value);
    }
    response.writeHead(200, Object.fromEntries(headers));
    response.end(bytes);
  });

  await new Promise((resolveListening, rejectListening) => {
    server.once('error', (error) => {
      rejectListening(
        new Error(
          `could not serve dist/ on 127.0.0.1:${port} (${error.code ?? error.message}); ` +
            'set SMOKE_PORT to a free port',
        ),
      );
    });
    server.listen(port, '127.0.0.1', resolveListening);
  });

  return {
    server,
    close: () =>
      new Promise((resolveClosed) => {
        server.closeAllConnections?.();
        server.close(() => resolveClosed());
      }),
  };
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await delay(250);
  }
  throw new Error(`the FarmBot entry did not respond at ${url}`);
}

async function launchBrowser() {
  const attempts = [];
  try {
    return { browser: await chromium.launch(), mode: 'playwright-chromium' };
  } catch (error) {
    attempts.push(`bundled chromium: ${error.message}`);
  }
  try {
    return { browser: await chromium.launch({ channel: 'chrome' }), mode: 'system-chrome' };
  } catch (error) {
    attempts.push(`system chrome: ${error.message}`);
  }
  throw new Error(
    `No Chromium available. Install it with \`npx playwright install chromium\`.\n` +
      attempts.join('\n'),
  );
}

// --- first-paint asset discovery --------------------------------------------

function jsRefsFromHtml(html, entryHref) {
  return new Set(
    [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) =>
      basename(new URL(match[1], entryHref).pathname),
    ),
  );
}

function readLocalEntryInfo() {
  const html = readFileSync(join(root, 'dist/farmbot/index.html'), 'utf8');
  const assets = join(root, 'dist/assets');
  const jsFiles = readdirSync(assets).filter((file) => file.endsWith('.js'));
  const relateChunk = jsFiles.find((file) =>
    readFileSync(join(assets, file), 'utf8').includes('relate_bg'),
  );
  const relateWasm = readdirSync(assets)
    .filter((file) => file.endsWith('.wasm'))
    .find((file) => file.includes('relate_bg'));
  return {
    firstPaintChunks: jsRefsFromHtml(html, entryUrl),
    relateChunk: relateChunk ?? null,
    relateWasm: relateWasm ?? null,
  };
}

async function readLiveEntryInfo() {
  const response = await fetch(entryUrl);
  if (!response.ok) throw new Error(`${entryUrl} returned HTTP ${response.status}`);
  return {
    firstPaintChunks: jsRefsFromHtml(await response.text(), entryUrl),
    relateChunk: null,
    relateWasm: null,
  };
}

// --- browser helpers --------------------------------------------------------

async function prepareContext(browser, label, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    locale: 'en-US',
  });
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        window.__cspViolations.push({
          violatedDirective: event.violatedDirective,
          effectiveDirective: event.effectiveDirective,
          blockedURI: event.blockedURI,
          documentURI: event.documentURI,
          disposition: event.disposition,
          statusCode: event.statusCode,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
          columnNumber: event.columnNumber,
        });
      },
      true,
    );
  });
  const requests = [];
  const responses = [];
  context.on('request', (request) => requests.push(request.url()));
  context.on('response', (response) =>
    responses.push({
      url: response.url(),
      status: response.status(),
      contentType: response.headers()['content-type'] ?? '',
    }),
  );
  const pageErrors = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { label, context, page, requests, responses, pageErrors };
}

const readCspViolations = (page) =>
  page.evaluate(() => window.__cspViolations ?? []);

const externalRequests = (requests) => requests.filter((url) => isExternal(url));

/** Assert that one browser context made no CSP, page or cross-origin noise. */
async function assertContextClean(fixture) {
  const csp = await readCspViolations(fixture.page);
  assert(csp.length === 0, `${fixture.label} CSP violation(s): ${JSON.stringify(csp)}`);
  assert(
    fixture.pageErrors.length === 0,
    `${fixture.label} page error(s): ${fixture.pageErrors.join(' | ')}`,
  );
  const external = externalRequests(fixture.requests);
  assert(
    external.length === 0,
    `${fixture.label} non-same-origin request(s): ${external.join(', ')}`,
  );
  return { cspViolations: csp.length, external };
}

function isRelateAssetUrl(url, entryInfo) {
  const pathname = pathOf(url);
  if (/\/relate_bg[^/]*\.wasm$/.test(pathname)) return true;
  if (/\/relate-loader[^/]*\.js$/.test(pathname)) return true;
  if (entryInfo.relateWasm && pathname.endsWith(`/${entryInfo.relateWasm}`)) return true;
  if (entryInfo.relateChunk && pathname.endsWith(`/${entryInfo.relateChunk}`)) return true;
  return false;
}

const isWasmUrl = (url) => /\.wasm$/.test(pathOf(url));

async function readTimings(page) {
  const text = await page.locator('[data-testid="timings"]').textContent();
  return JSON.parse(text);
}

const budgetRecords = [];

function checkBudget(label, measuredMs, budgetMs) {
  const measured = Number(measuredMs.toFixed(2));
  const ok = measured <= budgetMs;
  budgetRecords.push({ label, measuredMs: measured, budgetMs, ok, enforced: enforceBudget });
  if (!ok) {
    console.log(
      `budget miss: ${label} measured ${measured} ms, proposed budget ${budgetMs} ms ` +
        (enforceBudget
          ? '(enforced by SMOKE_FARMBOT_ENFORCE_BUDGET=1)'
          : '(budget not yet enforced)'),
    );
  }
  return ok;
}

async function readTable(page) {
  return page.evaluate(() => {
    const result = document.querySelector('[data-testid="result"]');
    if (!result) return null;
    const table = result.querySelector('table');
    if (!table) return { headers: [], rows: [] };
    return {
      headers: [...table.querySelectorAll('thead th')].map((cell) => cell.textContent ?? ''),
      rows: [...table.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''),
      ),
    };
  });
}

/** The drawn diagram, read back from its `data-` attributes. */
async function readDiagram(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="process-lanes"]');
    const svg = root?.querySelector('svg') ?? null;
    const nodes = [...(root?.querySelectorAll('[data-node-id]') ?? [])].map((element) => ({
      id: element.getAttribute('data-node-id') ?? '',
      lane: element.getAttribute('data-lane') ?? '',
      evidenceIndexes: (element.getAttribute('data-evidence-index') ?? '')
        .split(',')
        .filter((value) => value !== '')
        .map(Number),
      problem: element.getAttribute('data-problem'),
      selected: element.getAttribute('data-selected'),
    }));
    const edges = [...(root?.querySelectorAll('[data-kind]') ?? [])].map((element) => ({
      from: element.getAttribute('data-from') ?? '',
      to: element.getAttribute('data-to') ?? '',
      kind: element.getAttribute('data-kind') ?? '',
    }));
    const rows = [...document.querySelectorAll('[data-testid="evidence-row"]')].map((element) => ({
      index: Number(element.getAttribute('data-evidence-index')),
      selected: element.getAttribute('data-selected'),
    }));
    return {
      present: Boolean(root),
      nodes,
      edges,
      rows,
      svgWidth: svg ? svg.getBoundingClientRect().width : null,
      viewportWidth: window.innerWidth,
    };
  });
}

/** The diagram the layout function says a finding has. */
function expectedDiagram(finding) {
  const layout = layoutFinding(finding);
  return {
    nodeIds: layout.nodes.map((node) => node.id).sort(),
    lanes: layout.nodes.map((node) => `${node.id}\u0000${node.lane}`).sort(),
    problems: layout.nodes
      .filter((node) => node.problem)
      .map((node) => node.id)
      .sort(),
    edges: layout.edges.map((edge) => `${edge.from}\u0000${edge.to}\u0000${edge.kind}`).sort(),
    missing: layout.edges.filter((edge) => edge.kind === 'missing').length,
    rows: layout.nodes.reduce((total, node) => total + node.evidenceIndexes.length, 0),
  };
}

async function main() {
  const committedSeedBytes = readFileSync(committedSeedPath);
  const committedSeedSha = sha256Hex(committedSeedBytes);
  assert(
    committedSeedSha === EXPECTED_SEED_SHA256,
    `the committed seed SHA-256 is ${committedSeedSha}, expected ${EXPECTED_SEED_SHA256}`,
  );

  const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
  assert(gold.format === 'farmbot-default-results-v1', 'unexpected gold fixture format');
  assert(gold.seedDigest === EXPECTED_SEED_DIGEST, 'gold fixture seed digest is stale');
  assert(gold.seedBytes === committedSeedBytes.length, 'gold fixture seed byte length is stale');
  assert(
    JSON.stringify(gold.questions.map((question) => question.id)) ===
      JSON.stringify(QUESTION_IDS),
    'gold fixture must cover q1..q5 in order',
  );
  for (const question of gold.questions) {
    assert(
      Number.isInteger(question.rowCount) && question.rowCount >= 0,
      `${question.id}: gold row count ${question.rowCount} is not a non-negative integer`,
    );
  }

  const findingsDocument = JSON.parse(readFileSync(findingsPath, 'utf8'));
  assert(
    findingsDocument.format === 'farmbot-findings-v1',
    'unexpected findings document format',
  );
  const findings = findingsDocument.findings;
  const expectedFindingsDigest = readFileSync(findingsDigestPath, 'utf8').trim();
  assert(
    /^farmbot-findings-v1 sha256:[0-9a-f]{64}$/.test(expectedFindingsDigest),
    `the findings sidecar is not a digest line: ${expectedFindingsDigest}`,
  );
  const expectedFindingIds = findings.map((finding) => finding.id).sort();
  const expectedSeverity = { action: 0, review: 0, info: 0 };
  for (const finding of findings) expectedSeverity[finding.severity] += 1;
  const orderedFindings = orderFindings(findings);
  const expectedVisibleIds = orderedFindings
    .filter((finding) => finding.severity !== 'info')
    .map((finding) => finding.id);
  const expectedRevealedIds = orderedFindings.map((finding) => finding.id);

  // The deep link opens the finding with the most evidence rows; ties break by
  // id so the choice comes from the committed file only.
  const deepLinkFinding = [...findings].sort(
    (left, right) =>
      right.evidence.length - left.evidence.length ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )[0];

  const tampered = Buffer.from(committedSeedBytes);
  tampered[Math.floor(tampered.length / 2)] ^= 0x01;
  const tamperedSha = sha256Hex(tampered);
  assert(tamperedSha !== committedSeedSha, 'the tampered seed must change the digest');

  const summary = {
    ok: false,
    base,
    mode: useLive ? 'live' : 'local',
    node: process.version,
    browser: null,
    entry: entryUrl,
    cspHeader: null,
    seed: null,
    firstPaint: null,
    questions: [],
    timings: null,
    budgets: budgetRecords,
    findings: null,
    deepLink: null,
    sampleEmails: null,
    processLanes: null,
    unknownFinding: null,
    malformedHashes: [],
    checkRouting: { beforeConsent: null, noWebgpu: null, invalidModelOutputs: null },
    tamperedSeed: null,
    cspViolations: null,
    nonSameOriginRequests: [],
    pageErrors: [],
    error: null,
  };

  let localServer = null;
  let browser = null;
  let happy = null;
  let tamper = null;

  try {
    if (useLive) {
      await waitForServer(entryUrl);
    } else {
      localServer = await startStaticServer();
    }
    const entryInfo = useLive ? await readLiveEntryInfo() : readLocalEntryInfo();
    assert(
      entryInfo.firstPaintChunks.size > 0,
      'the FarmBot entry HTML references no JS chunk',
    );

    const launched = await launchBrowser();
    browser = launched.browser;
    summary.browser = { mode: launched.mode, version: browser.version() };

    // Happy path: first paint, digest, five default questions, timings.
    happy = await prepareContext(browser, 'happy');
    const page = happy.page;
    const navigation = await page.goto(entryUrl, { waitUntil: 'load', timeout: 60000 });
    const documentCsp = navigation?.headers()['content-security-policy'] ?? '';
    if (!useLive) {
      assert(
        /default-src 'none'/.test(documentCsp),
        'the document response did not carry the production CSP header',
      );
      assert(
        /script-src 'self' 'wasm-unsafe-eval'/.test(documentCsp),
        `the document CSP script-src is wrong: ${documentCsp}`,
      );
      assert(
        /connect-src 'self'/.test(documentCsp),
        `the document CSP connect-src is wrong: ${documentCsp}`,
      );
    }
    summary.cspHeader = documentCsp || null;
    await page.waitForSelector('[data-testid="abi"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="run"]:not([disabled])', { timeout: 30000 });

    const chips = await page.evaluate(() =>
      ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => {
        const chip = document.querySelector(`[data-testid="question-${id}"]`);
        return {
          id,
          present: Boolean(chip),
          visible: Boolean(chip) && chip.getBoundingClientRect().height > 0,
        };
      }),
    );
    for (const chip of chips) {
      assert(chip.present, `question chip ${chip.id} is missing`);
      assert(chip.visible, `question chip ${chip.id} is not visible`);
    }

    const expectedDigest = (
      await page.locator('[data-testid="expected-digest"]').textContent()
    )?.trim();
    assert(
      expectedDigest === EXPECTED_SEED_DIGEST,
      `the page shows seed digest ${JSON.stringify(expectedDigest)}`,
    );

    const storeDigest = (
      await page.locator('[data-testid="store-digest"]').textContent()
    )?.trim();
    assert(
      storeDigest === EXPECTED_STORE_DIGEST,
      `the page shows store digest ${JSON.stringify(storeDigest)}`,
    );
    const storeNodes = (
      await page.locator('[data-testid="store-nodes"]').textContent()
    )?.trim();
    assert(
      storeNodes === String(committedManifest.relateStore.nodes),
      `the page shows ${JSON.stringify(storeNodes)} store nodes`,
    );
    const storeRelationships = (
      await page.locator('[data-testid="store-relationships"]').textContent()
    )?.trim();
    assert(
      storeRelationships === String(committedManifest.relateStore.relationships),
      `the page shows ${JSON.stringify(storeRelationships)} store relationships`,
    );

    // Let every first-paint request register before freezing the list.
    await delay(300);
    const firstPaintRequests = [...happy.requests];
    const relateBeforeRun = firstPaintRequests.filter((url) =>
      isRelateAssetUrl(url, entryInfo),
    );
    assert(
      relateBeforeRun.length === 0,
      `first paint requested the Relate engine: ${relateBeforeRun.join(', ')}`,
    );
    const unexpectedJs = firstPaintRequests.filter((url) => {
      const pathname = pathOf(url);
      if (!pathname.endsWith('.js')) return false;
      if (new URL(url).origin !== baseOrigin) return false;
      return !entryInfo.firstPaintChunks.has(basename(pathname));
    });
    assert(
      unexpectedJs.length === 0,
      `first paint requested a JS chunk the entry HTML does not reference: ${unexpectedJs.join(', ')}`,
    );
    const firstPaintModel = assertNoModelRequests(firstPaintRequests, 'FarmBot first paint');
    summary.firstPaint = {
      requests: firstPaintRequests.map((url) => pathOf(url)),
      questionChips: chips.length,
      checkChips: CHECK_CATALOG.length,
      relateRequests: relateBeforeRun.length,
      unexpectedJs,
      ...firstPaintModel,
    };

    // The seed actually served to this origin must hash to the committed digest.
    const servedSeed = await page.evaluate(async () => {
      const response = await fetch(new URL('farmbot.seed.json', document.baseURI), {
        cache: 'no-store',
      });
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      return { status: response.status, url: response.url, bytes: bytes.byteLength, hex };
    });
    assert(servedSeed.status === 200, `served seed returned HTTP ${servedSeed.status}`);
    assert(
      new URL(servedSeed.url).origin === baseOrigin,
      `the seed must be fetched same-origin, got ${servedSeed.url}`,
    );
    assert(
      servedSeed.hex === EXPECTED_SEED_SHA256,
      `served seed SHA-256 is ${servedSeed.hex}, expected ${EXPECTED_SEED_SHA256}`,
    );
    assert(
      servedSeed.bytes === committedSeedBytes.length,
      `served seed is ${servedSeed.bytes} bytes, committed seed is ${committedSeedBytes.length}`,
    );

    // Notification panel: run the checks in the same page and compare the
    // panel and the debug hook with the committed findings document.
    await page.click('[data-testid="run-checks"]');
    await page.waitForSelector('[data-testid="findings-count"]', { timeout: 180000 });
    const panel = await page.evaluate(() => {
      const number = (selector) => {
        const element = document.querySelector(selector);
        return element ? Number(element.textContent) : null;
      };
      const digest = document.querySelector('[data-testid="findings-digest"]');
      return {
        count: number('[data-testid="findings-count"]'),
        action: number('[data-testid="severity-action"]'),
        review: number('[data-testid="severity-review"]'),
        info: number('[data-testid="severity-info"]'),
        digest: (digest?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ids: [...document.querySelectorAll('[data-testid="finding-list"] [data-finding-id]')].map(
          (element) => element.getAttribute('data-finding-id'),
        ),
      };
    });
    assert(
      panel.count === findings.length,
      `the panel shows ${panel.count} findings, the committed file has ${findings.length}`,
    );
    assert(
      JSON.stringify(panel.ids) === JSON.stringify(expectedVisibleIds),
      'the default list does not show exactly the committed action and review findings',
    );
    for (const level of ['action', 'review', 'info']) {
      assert(
        panel[level] === expectedSeverity[level],
        `the panel shows ${panel[level]} ${level} findings, the committed file has ${expectedSeverity[level]}`,
      );
    }

    const toggle = page.locator('[data-testid="toggle-info-findings"]');
    assert(
      (await toggle.count()) === 1,
      'the findings severity filter control is missing',
    );
    assert(
      (await toggle.getAttribute('aria-pressed')) === 'false',
      'the findings severity filter is not in its default state',
    );
    await toggle.click();
    const revealedIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="finding-list"] [data-finding-id]')].map(
        (element) => element.getAttribute('data-finding-id'),
      ),
    );
    assert(
      JSON.stringify(revealedIds) === JSON.stringify(expectedRevealedIds),
      'revealing info findings did not show the whole committed list in order',
    );
    assert(
      (await toggle.getAttribute('aria-pressed')) === 'true',
      'the findings severity filter did not report the revealed state',
    );
    await toggle.click();
    const restoredIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="finding-list"] [data-finding-id]')].map(
        (element) => element.getAttribute('data-finding-id'),
      ),
    );
    assert(
      JSON.stringify(restoredIds) === JSON.stringify(expectedVisibleIds),
      'hiding info findings did not restore the default list',
    );

    assert(
      panel.digest.includes(expectedFindingsDigest),
      `the panel does not show the committed digest: ${panel.digest}`,
    );
    assert(
      /matches the committed findings/i.test(panel.digest),
      `the panel does not report a match: ${panel.digest}`,
    );

    const checksTimings = (await readTimings(page)).checks;
    assert(checksTimings, 'the debug hook has no check result');
    assert(checksTimings.matches === true, 'the browser result does not match the committed file');
    assert(
      checksTimings.digest === expectedFindingsDigest,
      `the browser digest is ${checksTimings.digest}, expected ${expectedFindingsDigest}`,
    );
    assert(
      checksTimings.count === findings.length,
      `the debug hook reports ${checksTimings.count} findings`,
    );
    assert(
      JSON.stringify([...checksTimings.ids].sort()) === JSON.stringify(expectedFindingIds),
      'the debug hook finding ids differ from the committed file',
    );
    for (const level of ['action', 'review', 'info']) {
      assert(
        checksTimings.bySeverity[level] === expectedSeverity[level],
        `the debug hook reports ${checksTimings.bySeverity[level]} ${level} findings`,
      );
    }
    summary.findings = {
      panelCount: panel.count,
      committedCount: findings.length,
      defaultVisibleCount: expectedVisibleIds.length,
      revealedCount: revealedIds.length,
      idsMatch: true,
      severity: { panel: { action: panel.action, review: panel.review, info: panel.info }, file: expectedSeverity },
      digest: checksTimings.digest,
      matches: checksTimings.matches,
      checksMs: Number(checksTimings.ms.toFixed(2)),
    };

    for (const [index, question] of gold.questions.entries()) {
      const id = QUESTION_IDS[index];
      await page.click(`[data-testid="question-${id}"]`);
      await page.waitForSelector('[data-testid="run"]:not([disabled])', {
        timeout: 30000,
      });
      await page.click('[data-testid="run"]');
      await page.waitForFunction(
        ({ intentFile, rowCount }) => {
          const result = document.querySelector('[data-testid="result"]');
          const count = document.querySelector('[data-testid="row-count"]');
          return (
            Boolean(result) &&
            Boolean(count) &&
            result.textContent.includes(intentFile) &&
            Number(count.textContent) === rowCount
          );
        },
        { intentFile: question.intentFile, rowCount: question.rowCount },
        { timeout: 60000 },
      );
      await page.waitForSelector('[data-testid="run"]:not([disabled])', {
        timeout: 30000,
      });

      const table = await readTable(page);
      assert(table, `${id}: no result table`);
      assert(
        JSON.stringify(table.headers) === JSON.stringify(question.columns),
        `${id}: columns ${JSON.stringify(table.headers)} != ${JSON.stringify(question.columns)}`,
      );
      const expectedRows = question.rows
        .map((row) =>
          JSON.stringify(question.columns.map((column) => cellText(row[column]))),
        )
        .sort();
      const actualRows = table.rows.map((row) => JSON.stringify(row)).sort();
      assert(
        JSON.stringify(actualRows) === JSON.stringify(expectedRows),
        `${id}: on-screen rows differ from the gold oracle\n` +
          `  expected: ${expectedRows.join(' | ')}\n` +
          `  actual:   ${actualRows.join(' | ')}`,
      );
      const rowCount = Number(
        await page.locator('[data-testid="row-count"]').textContent(),
      );
      assert(rowCount === question.rowCount, `${id}: row-count is ${rowCount}`);

      const timings = await readTimings(page);
      const queryMs = timings.queries?.[id];
      assert(
        typeof queryMs === 'number' && Number.isFinite(queryMs),
        `${id}: query timing was not recorded (${JSON.stringify(timings)})`,
      );
      checkBudget(`query ${id}`, queryMs, QUERY_BUDGET_MS);
      if (index === 0) {
        assert(
          typeof timings.seedLoadMs === 'number' && Number.isFinite(timings.seedLoadMs),
          `seed load timing was not recorded (${JSON.stringify(timings)})`,
        );
        checkBudget('seed load', timings.seedLoadMs, SEED_BUDGET_MS);
      }

      summary.questions.push({
        id,
        intentFile: question.intentFile,
        columns: table.headers,
        rowCount,
        rowsMatchGold: true,
        queryMs: Number(queryMs.toFixed(2)),
      });
    }

    summary.timings = await readTimings(page);
    for (const id of QUESTION_IDS) {
      assert(
        typeof summary.timings.queries?.[id] === 'number',
        `${id}: missing query timing`,
      );
    }

    const verifiedDigest = (
      await page.locator('[data-testid="verified-digest"]').textContent()
    )?.trim();
    assert(
      verifiedDigest === EXPECTED_SEED_DIGEST,
      `the verified digest shown is ${JSON.stringify(verifiedDigest)}`,
    );
    const seedBytesShown = Number(
      await page.locator('[data-testid="seed-bytes"]').textContent(),
    );
    assert(
      seedBytesShown === committedSeedBytes.length,
      `the screen loaded ${seedBytesShown} seed bytes, expected ${committedSeedBytes.length}`,
    );
    summary.seed = {
      expectedDigest,
      servedSha256: servedSeed.hex,
      servedBytes: servedSeed.bytes,
      verifiedDigest,
      seedBytesShown,
    };

    const relateWasmRequests = happy.requests.filter(
      (url) => isWasmUrl(url) && /relate_bg/.test(pathOf(url)),
    );
    assert(
      relateWasmRequests.length > 0,
      'the first Run did not request the Relate WASM asset',
    );
    const wasmResponses = happy.responses.filter((response) => isWasmUrl(response.url));
    assert(wasmResponses.length > 0, 'no .wasm response was observed');
    for (const response of wasmResponses) {
      assert(
        new URL(response.url).origin === baseOrigin,
        `WASM must be served same-origin: ${response.url}`,
      );
      assert(response.status === 200, `WASM response ${response.url} was ${response.status}`);
      assert(
        response.contentType.startsWith('application/wasm'),
        `WASM response ${response.url} has content-type ${response.contentType}`,
      );
    }
    for (const url of relateWasmRequests) {
      assert(
        new URL(url).origin === baseOrigin,
        `the Relate WASM must be same-origin, got ${url}`,
      );
    }

    const happyCsp = await readCspViolations(page);
    assert(happyCsp.length === 0, `CSP violation(s): ${JSON.stringify(happyCsp)}`);
    assert(
      happy.pageErrors.length === 0,
      `page error(s): ${happy.pageErrors.join(' | ')}`,
    );
    const happyExternal = externalRequests(happy.requests);
    assert(
      happyExternal.length === 0,
      `non-same-origin request(s): ${happyExternal.join(', ')}`,
    );

    // Consent is an explicit gate on FarmBot too. Merely typing and attempting
    // Convert cannot fetch model hosts or cross the lazy-package boundary.
    const consentFixture = await prepareContext(browser, 'check-routing-before-consent');
    await consentFixture.context.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: { requestAdapter: async () => ({}) },
      });
    });
    await consentFixture.page.goto(entryUrl, { waitUntil: 'load', timeout: 60000 });
    await consentFixture.page.waitForSelector('[data-testid="farmbot-free-text-consent"]', {
      timeout: 30000,
    });
    await consentFixture.page.waitForSelector('[data-testid="run"]:not([disabled])', {
      timeout: 30000,
    });
    await consentFixture.page.fill(
      '[data-testid="farmbot-free-text-input"]',
      'Which service references are unresolved?',
    );
    await consentFixture.page.evaluate(() => {
      document.querySelector('[data-testid="farmbot-free-text-convert"]')?.click();
    });
    await delay(200);
    const consentState = await consentFixture.page.evaluate(() => ({
      convertDisabled:
        document.querySelector('[data-testid="farmbot-free-text-convert"]')?.disabled ?? null,
      modelText: document.querySelector('[data-testid="farmbot-free-text-consent"]')?.textContent ?? '',
      checkChips: [...document.querySelectorAll('[data-testid^="check-chip-"]')].map((element) =>
        element.getAttribute('data-testid'),
      ),
      proposal: Boolean(document.querySelector('[data-testid="farmbot-check-proposal"]')),
    }));
    assert(consentState.convertDisabled === true, 'FarmBot Convert is enabled before consent');
    assert(!consentState.proposal, 'FarmBot Convert produced a proposal before consent');
    assert(
      JSON.stringify(consentState.checkChips) ===
        JSON.stringify(CHECK_CATALOG.map((check) => `check-chip-${check.id}`)),
      `FarmBot check chips differ from the catalog: ${consentState.checkChips.join(', ')}`,
    );
    for (const needle of ['Llama-3.2-1B-Instruct-q4f16_1-MLC', '879.04 MB', '695,242,752']) {
      assert(
        consentState.modelText.includes(needle),
        `FarmBot consent metadata does not include ${needle}`,
      );
    }
    await consentFixture.page.click('[data-testid="farmbot-free-text-decline-button"]');
    await consentFixture.page.waitForSelector('[data-testid="farmbot-free-text-declined"]');
    await consentFixture.page.click('[data-testid="check-chip-R3"]');
    await consentFixture.page.waitForSelector('[data-testid="farmbot-check-proposal"]');
    assert(
      !(await consentFixture.page.locator('[data-testid="farmbot-free-text-consent"]').count()),
      'declining consent left the consent card visible',
    );
    assert(
      (await consentFixture.page.locator('[data-testid="farmbot-free-text-convert"]').isDisabled()),
      'declining consent enabled Convert',
    );
    const consentClean = await assertContextClean(consentFixture);
    summary.checkRouting.beforeConsent = {
      convertDisabled: consentState.convertDisabled,
      declinedChipProposal: true,
      ...assertNoModelRequests(consentFixture.requests, 'before FarmBot consent'),
      ...consentClean,
      pageErrors: [...consentFixture.pageErrors],
    };
    await consentFixture.context.close();

    // No WebGPU: no consent card, but a parameterized chip proposal and the
    // already-loaded Relate question/check paths still work end to end.
    const noGpuFixture = await prepareContext(browser, 'check-routing-no-webgpu');
    await noGpuFixture.context.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    });
    await noGpuFixture.page.goto(entryUrl, { waitUntil: 'load', timeout: 60000 });
    await noGpuFixture.page.waitForSelector('[data-testid="farmbot-webgpu-notice"]', {
      timeout: 30000,
    });
    await noGpuFixture.page.waitForSelector('[data-testid="run"]:not([disabled])', {
      timeout: 30000,
    });
    assert(
      !(await noGpuFixture.page.locator('[data-testid="farmbot-free-text-consent"]').count()),
      'the FarmBot consent card appeared without WebGPU',
    );
    assert(
      (await noGpuFixture.page.locator('[data-testid="farmbot-free-text-convert"]').isDisabled()),
      'FarmBot Convert is enabled without WebGPU',
    );
    const routingValues = JSON.parse(
      readFileSync(join(root, 'farmbot/dist/farmbot.allowed-values.json'), 'utf8'),
    );
    const parameterizedCheck = CHECK_CATALOG.find((check) => check.id === 'R8');
    assert(parameterizedCheck?.parameter, 'R8 must expose its service-part selector fixture');
    const values = routingValues[parameterizedCheck.parameter.domain];
    const value = values[1] ?? values[0];
    await noGpuFixture.page.click('[data-testid="check-chip-R8"]');
    await noGpuFixture.page.selectOption('[data-testid="check-parameter"]', value);
    const expectedRouting = {
      check: 'R8',
      parameter: { domain: parameterizedCheck.parameter.domain, value },
    };
    await noGpuFixture.page.waitForFunction(
      (expected) =>
        document.querySelector('[data-testid="farmbot-check-proposal-routing"]')?.textContent &&
        JSON.stringify(JSON.parse(document.querySelector('[data-testid="farmbot-check-proposal-routing"]').textContent)) ===
          JSON.stringify(expected),
      expectedRouting,
      { timeout: 30000 },
    );
    const expandedProposal = JSON.parse(
      await noGpuFixture.page.locator('[data-testid="farmbot-check-proposal-intents"]').textContent(),
    );
    assert(
      expandedProposal.length === parameterizedCheck.intents.length,
      'the R8 chip proposal does not expand every catalog Intent',
    );
    assert(
      expandedProposal.some((entry) =>
        (entry.intent.filter ?? []).some((filter) => filter.value === value),
      ),
      'the R8 chip proposal did not apply the selected parameter',
    );
    await noGpuFixture.page.click('[data-testid="farmbot-check-proposal-run"]');
    await noGpuFixture.page.waitForSelector('[data-testid="farmbot-check-result"]', {
      timeout: 180000,
    });
    const confirmedRouting = JSON.parse(
      await noGpuFixture.page.locator('[data-testid="farmbot-check-result-routing"]').textContent(),
    );
    assert(
      JSON.stringify(confirmedRouting) === JSON.stringify(expectedRouting),
      'the confirmed R8 routing differs from its proposal',
    );
    const queryResults = await noGpuFixture.page
      .locator('[data-testid^="check-query-result-"]')
      .count();
    assert(
      queryResults === parameterizedCheck.intents.length,
      `R8 produced ${queryResults} query result areas, expected ${parameterizedCheck.intents.length}`,
    );
    await noGpuFixture.page.click('[data-testid="question-q1"]');
    await noGpuFixture.page.click('[data-testid="run"]');
    await noGpuFixture.page.waitForFunction(
      (rowCount) =>
        document.querySelector('[data-testid="result"]')?.textContent?.includes(
          'q1-packing-differences.json',
        ) && Number(document.querySelector('[data-testid="row-count"]')?.textContent) === rowCount,
      gold.questions[0].rowCount,
      { timeout: 60000 },
    );
    await noGpuFixture.page.click('[data-testid="run-checks"]');
    await noGpuFixture.page.waitForSelector('[data-testid="findings-count"]', {
      timeout: 180000,
    });
    assert(
      Number(await noGpuFixture.page.locator('[data-testid="findings-count"]').textContent()) ===
        findings.length,
      'Run checks changed on the WebGPU-disabled path',
    );
    const noGpuClean = await assertContextClean(noGpuFixture);
    summary.checkRouting.noWebgpu = {
      consentCard: false,
      confirmedRouting,
      queryResults,
      q1Rows: gold.questions[0].rowCount,
      findingsCount: findings.length,
      ...assertNoModelRequests(noGpuFixture.requests, 'WebGPU-disabled FarmBot'),
      ...noGpuClean,
      pageErrors: [...noGpuFixture.pageErrors],
    };
    await noGpuFixture.context.close();

    // Replace only the same tiny package-boundary chunk used by the desk-fan
    // smoke. Invalid model outputs are rejected without the real model package,
    // model hosts, compilation or execution.
    if (!useLive) {
      const lazyChunk = findLazyWebllmChunk();
      assert(lazyChunk, 'the lazy WebLLM package chunk was not found');
      const stubSource = [
        "export const WEBLLM_PACKAGE_TAG = 'ontographia-webllm-package-v1';",
        'class StubEngine {',
        '  constructor(config) { this.config = config || {}; }',
        '  async reload() {',
        "    if (this.config.initProgressCallback) this.config.initProgressCallback({ progress: 1, text: 'stub model ready' });",
        '  }',
        '  async unload() {}',
        '}',
        'StubEngine.prototype.chat = { completions: { create: async () => {',
        '  const output = globalThis.__FARMBOT_SMOKE_MODEL_OUTPUT__;',
        "  return { choices: [{ message: { content: String(output == null ? '' : output) } }] };",
        '} } };',
        'export async function createIntentEngine(config) { return new StubEngine(config); }',
      ].join('\n');
      const invalidFixture = await prepareContext(browser, 'check-routing-invalid-model');
      await invalidFixture.context.addInitScript(() => {
        Object.defineProperty(navigator, 'gpu', {
          configurable: true,
          value: { requestAdapter: async () => ({}) },
        });
      });
      await invalidFixture.context.route(`**/assets/${lazyChunk}`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/javascript', body: stubSource }),
      );
      await invalidFixture.page.goto(entryUrl, { waitUntil: 'load', timeout: 60000 });
      await invalidFixture.page.click('[data-testid="farmbot-free-text-consent-button"]');
      await invalidFixture.page.fill(
        '[data-testid="farmbot-free-text-input"]',
        'Which parts have no process reference?',
      );
      await invalidFixture.page.waitForFunction(
        () => !document.querySelector('[data-testid="farmbot-free-text-convert"]')?.disabled,
        undefined,
        { timeout: 15000 },
      );
      const invalidCases = [
        {
          label: 'unknown check',
          output: JSON.stringify({ check: 'R10', parameter: null }),
          needle: 'unknown check id',
        },
        {
          label: 'extra key',
          output: JSON.stringify({ check: 'R3', parameter: null, unexpected: true }),
          needle: 'exactly the required keys',
        },
        { label: 'Cypher', output: 'MATCH (part:Part) RETURN part', needle: 'Cypher' },
      ];
      const invalidRecords = [];
      for (const testCase of invalidCases) {
        await invalidFixture.page.evaluate((output) => {
          globalThis.__FARMBOT_SMOKE_MODEL_OUTPUT__ = output;
        }, testCase.output);
        await invalidFixture.page.click('[data-testid="farmbot-free-text-convert"]');
        await invalidFixture.page.waitForFunction(
          (needle) =>
            document
              .querySelector('[data-testid="farmbot-free-text-error"]')
              ?.textContent?.includes(needle),
          testCase.needle,
          { timeout: 15000 },
        );
        const state = await invalidFixture.page.evaluate(() => ({
          proposal: Boolean(document.querySelector('[data-testid="farmbot-check-proposal"]')),
          result: Boolean(document.querySelector('[data-testid="farmbot-check-result"]')),
          debug: JSON.parse(
            document.querySelector('[data-testid="farmbot-check-routing-debug"]')?.textContent ??
              '{}',
          ),
        }));
        assert(!state.proposal && !state.result, `${testCase.label} left output on screen`);
        assert(
          state.debug.compileAttempts === 0 && state.debug.runs === 0,
          `${testCase.label} reached compile or execution: ${JSON.stringify(state.debug)}`,
        );
        invalidRecords.push({ case: testCase.label, rejected: true, ...state.debug });
      }
      const invalidClean = await assertContextClean(invalidFixture);
      const invalidModelHosts = invalidFixture.requests.filter(isModelHost);
      assert(
        invalidModelHosts.length === 0,
        `the FarmBot model stub fetched model host(s): ${invalidModelHosts.join(', ')}`,
      );
      const realPackageRequests = invalidFixture.requests.filter((url) =>
        /\/lib-[^/]+\.js$/.test(pathOf(url)),
      );
      assert(
        realPackageRequests.length === 0,
        `the FarmBot model stub fetched the real package: ${realPackageRequests.join(', ')}`,
      );
      summary.checkRouting.invalidModelOutputs = {
        lazyChunk,
        boundaryStubRequests: invalidFixture.requests.filter((url) => url.endsWith(lazyChunk)).length,
        modelHosts: invalidModelHosts.length,
        realPackageRequests: realPackageRequests.length,
        cases: invalidRecords,
        ...invalidClean,
        pageErrors: [...invalidFixture.pageErrors],
      };
      await invalidFixture.context.close();
    }

    // Tampered seed: the digest check must run first and reject the bytes.
    tamper = await prepareContext(browser, 'tampered-seed');
    await tamper.context.route(
      (url) => url.pathname.endsWith('/farmbot/farmbot.seed.json'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: tampered,
        }),
    );
    await tamper.page.goto(entryUrl, { waitUntil: 'load', timeout: 60000 });
    await tamper.page.waitForSelector('[data-testid="abi"]', { timeout: 30000 });
    await tamper.page.waitForSelector('[data-testid="run"]:not([disabled])', {
      timeout: 30000,
    });
    const relateBeforeTamperedRun = tamper.requests.filter((url) =>
      isRelateAssetUrl(url, entryInfo),
    );
    assert(
      relateBeforeTamperedRun.length === 0,
      `the tampered-seed context requested Relate before Run: ${relateBeforeTamperedRun.join(', ')}`,
    );
    await tamper.page.click('[data-testid="run"]');
    await tamper.page.waitForSelector('[data-testid="error"]', { timeout: 30000 });

    const tamperState = await tamper.page.evaluate(() => ({
      errorText: document.querySelector('[data-testid="error"]')?.textContent ?? '',
      result: Boolean(document.querySelector('[data-testid="result"]')),
      rowCount: document.querySelector('[data-testid="row-count"]')?.textContent ?? null,
      bodyText: document.body.innerText,
    }));
    const expectedActualDigest = `farmbot-graph-v1 sha256:${tamperedSha}`;
    assert(
      tamperState.errorText.includes(EXPECTED_SEED_DIGEST),
      `the digest error does not show the expected digest: ${tamperState.errorText}`,
    );
    assert(
      tamperState.errorText.includes(expectedActualDigest),
      `the digest error does not show the tampered digest: ${tamperState.errorText}`,
    );
    assert(
      /do not match the committed digest/i.test(tamperState.errorText),
      `the digest error does not name the mismatch: ${tamperState.errorText}`,
    );
    assert(!tamperState.result, 'the tampered seed produced a result panel');
    assert(tamperState.rowCount === null, 'the tampered seed produced rows');
    assert(
      !/DEMO-|affected_products/.test(tamperState.bodyText),
      'desk-fan fixture content appeared on the FarmBot screen',
    );
    const relateAfterTamper = tamper.requests.filter((url) =>
      isRelateAssetUrl(url, entryInfo),
    );
    assert(
      relateAfterTamper.length === 0,
      `a rejected seed must not load Relate: ${relateAfterTamper.join(', ')}`,
    );
    // Run checks after a preset question failed: the checks box reports its own
    // failure, and the question box neither duplicates nor disappears.
    const questionErrorsBeforeChecks = await tamper.page
      .locator('[data-testid="error"]')
      .count();
    const questionErrorBefore = await tamper.page
      .locator('[data-testid="error"]')
      .textContent();
    const questionErrorBeforeChecks = (questionErrorBefore ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    assert(
      questionErrorsBeforeChecks === 1,
      `the tampered-seed context shows ${questionErrorsBeforeChecks} question error ` +
        'banner(s) before Run checks, expected 1',
    );
    await tamper.page.click('[data-testid="run-checks"]');
    await tamper.page.waitForSelector('[data-testid="checks-error"]', { timeout: 30000 });
    const tamperChecksState = await tamper.page.evaluate(() => {
      const checksError = document.querySelector('[data-testid="checks-error"]');
      const questionError = document.querySelector('[data-testid="error"]');
      return {
        checksErrorCount: document.querySelectorAll('[data-testid="checks-error"]').length,
        checksErrorVisible: Boolean(
          checksError && checksError.getBoundingClientRect().height > 0,
        ),
        checksErrorText: (checksError?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        questionErrorCount: document.querySelectorAll('[data-testid="error"]').length,
        questionErrorText: (questionError?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    });
    assert(
      tamperChecksState.checksErrorCount === 1,
      `the tampered-seed checks failure shows ` +
        `${tamperChecksState.checksErrorCount} checks error banner(s), expected 1`,
    );
    assert(
      tamperChecksState.checksErrorVisible,
      'the tampered-seed checks error box is not visible',
    );
    assert(
      tamperChecksState.questionErrorCount === questionErrorsBeforeChecks,
      `Run checks changed the question error banner count from ` +
        `${questionErrorsBeforeChecks} to ${tamperChecksState.questionErrorCount}`,
    );
    assert(
      tamperChecksState.questionErrorText === questionErrorBeforeChecks,
      'Run checks cleared or changed the question error banner',
    );
    const tamperCsp = await readCspViolations(tamper.page);
    assert(tamperCsp.length === 0, `tampered-seed CSP violation(s): ${JSON.stringify(tamperCsp)}`);
    const tamperExternal = externalRequests(tamper.requests);
    assert(
      tamperExternal.length === 0,
      `tampered-seed non-same-origin request(s): ${tamperExternal.join(', ')}`,
    );
    assert(
      tamper.pageErrors.length === 0,
      `tampered-seed page error(s): ${tamper.pageErrors.join(' | ')}`,
    );
    summary.tamperedSeed = {
      rejected: true,
      error: tamperState.errorText.replace(/\s+/g, ' ').trim().slice(0, 400),
      relateRequests: relateAfterTamper.length,
      rows: null,
      cspViolations: tamperCsp.length,
      pageErrors: [...tamper.pageErrors],
      checks: {
        questionErrorsBefore: questionErrorsBeforeChecks,
        questionErrorsAfter: tamperChecksState.questionErrorCount,
        questionErrorUnchanged:
          tamperChecksState.questionErrorText === questionErrorBeforeChecks,
        checksErrorCount: tamperChecksState.checksErrorCount,
        checksErrorVisible: tamperChecksState.checksErrorVisible,
        checksError: tamperChecksState.checksErrorText.slice(0, 400),
      },
    };

    // Deep link: a well-formed hash runs the checks and opens the finding.
    const deep = await prepareContext(browser, 'deep-link');
    const deepExpectedSummary = summaryLine(deepLinkFinding, 'en');
    await deep.page.goto(`${entryUrl}#finding=${encodeURIComponent(deepLinkFinding.id)}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await deep.page.waitForSelector('[data-testid="finding-view"]', { timeout: 180000 });
    await deep.page.waitForSelector(
      `[data-testid="finding-row-${deepLinkFinding.id}"]`,
      { timeout: 30000 },
    );
    const deepState = await deep.page.evaluate(() => {
      const view = document.querySelector('[data-testid="finding-view"]');
      const rows = [...document.querySelectorAll('[data-testid="evidence-row"]')];
      return {
        visible: Boolean(view) && view.getBoundingClientRect().height > 0,
        id: document.querySelector('[data-testid="finding-open-id"]')?.textContent?.trim() ?? '',
        summary:
          document
            .querySelector('[data-testid="finding-summary"]')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? '',
        evidenceRows: rows.length,
        evidenceWithQueries: rows.filter((row) => row.querySelector('details pre')).length,
        firstCypher: rows[0]?.querySelector('details pre')?.textContent ?? '',
        hash: window.location.hash,
      };
    });
    assert(deepState.visible, 'the deep link did not show the finding view');
    assert(
      deepState.id === deepLinkFinding.id,
      `the deep link opened ${JSON.stringify(deepState.id)}`,
    );
    assert(
      (await deep.page.locator(`[data-testid="finding-row-${deepLinkFinding.id}"]`).count()) === 1,
      'the deep-linked finding has no row in the filtered list',
    );
    assert(
      deepState.summary.includes(deepExpectedSummary),
      `the finding summary ${JSON.stringify(deepState.summary)} does not contain ` +
        `${JSON.stringify(deepExpectedSummary)}`,
    );
    assert(
      deepState.evidenceRows === deepLinkFinding.evidence.length,
      `the finding shows ${deepState.evidenceRows} evidence rows, expected ` +
        `${deepLinkFinding.evidence.length}`,
    );
    assert(
      deepState.evidenceWithQueries === deepLinkFinding.evidence.length,
      'an evidence row does not show its Intent, Cypher and parameters',
    );
    assert(
      deepState.firstCypher === deepLinkFinding.queries[0].cypher,
      'the evidence row does not show the rule Cypher',
    );
    assert(
      deepState.hash === `#finding=${deepLinkFinding.id}`,
      `the deep-link hash changed to ${deepState.hash}`,
    );
    const deepRelate = deep.requests.filter((url) => isRelateAssetUrl(url, entryInfo));
    assert(deepRelate.length > 0, 'the deep link did not run the checks');
    const deepClean = await assertContextClean(deep);
    summary.deepLink = {
      id: deepLinkFinding.id,
      summary: deepState.summary,
      evidenceRows: deepState.evidenceRows,
      relateRequests: deepRelate.length,
      ...deepClean,
    };

    // Deep link to a finding the default filter hides: the checks run, the
    // finding opens, the filter reveals it just enough, and its row appears.
    const infoDeepLinkFinding = findings
      .filter((finding) => finding.severity === 'info')
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0];
    assert(infoDeepLinkFinding, 'the committed file has no info finding');
    const infoDeep = await prepareContext(browser, 'deep-link-info');
    await infoDeep.page.goto(
      `${entryUrl}#finding=${encodeURIComponent(infoDeepLinkFinding.id)}`,
      { waitUntil: 'load', timeout: 60000 },
    );
    await infoDeep.page.waitForSelector('[data-testid="finding-view"]', { timeout: 180000 });
    await infoDeep.page.waitForSelector(
      `[data-testid="finding-row-${infoDeepLinkFinding.id}"]`,
      { timeout: 30000 },
    );
    const infoDeepState = await infoDeep.page.evaluate(
      (findingId) => ({
        id: document.querySelector('[data-testid="finding-open-id"]')?.textContent?.trim() ?? '',
        row: Boolean(document.querySelector(`[data-testid="finding-row-${findingId}"]`)),
        ids: [...document.querySelectorAll('[data-testid="finding-list"] [data-finding-id]')].map(
          (element) => element.getAttribute('data-finding-id'),
        ),
      }),
      infoDeepLinkFinding.id,
    );
    assert(
      infoDeepState.id === infoDeepLinkFinding.id,
      'the info deep link did not open its finding',
    );
    assert(infoDeepState.row, 'the info deep link did not reveal its row');
    assert(
      JSON.stringify(infoDeepState.ids) === JSON.stringify(expectedRevealedIds),
      'the info deep link did not reveal the whole committed list in order',
    );

    // A return to the same finding hash must reveal its row again, even after a
    // manual hide and a no-op hash in between. The id and check result are
    // unchanged, so only the hash event itself can trigger the reveal.
    const readInfoDeepState = () =>
      infoDeep.page.evaluate(
        (findingId) => ({
          id: document.querySelector('[data-testid="finding-open-id"]')?.textContent?.trim() ?? '',
          row: Boolean(document.querySelector(`[data-testid="finding-row-${findingId}"]`)),
          pressed:
            document
              .querySelector('[data-testid="toggle-info-findings"]')
              ?.getAttribute('aria-pressed') ?? null,
          ids: [...document.querySelectorAll('[data-testid="finding-list"] [data-finding-id]')].map(
            (element) => element.getAttribute('data-finding-id'),
          ),
        }),
        infoDeepLinkFinding.id,
      );

    await infoDeep.page.locator('[data-testid="toggle-info-findings"]').click();
    await infoDeep.page.waitForFunction(
      (findingId) => !document.querySelector(`[data-testid="finding-row-${findingId}"]`),
      infoDeepLinkFinding.id,
      { timeout: 30000 },
    );
    const infoHiddenState = await readInfoDeepState();
    assert(
      infoHiddenState.id === infoDeepLinkFinding.id,
      'hiding info findings closed the selected finding',
    );
    assert(!infoHiddenState.row, 'hiding info findings did not hide the selected row');
    assert(
      infoHiddenState.pressed === 'false',
      'hiding info findings did not report the default state',
    );
    assert(
      JSON.stringify(infoHiddenState.ids) === JSON.stringify(expectedVisibleIds),
      'hiding info findings did not restore the default list',
    );

    // A non-finding hash is a no-op: the selection and the hidden filter stay.
    await infoDeep.page.evaluate(() => {
      window.location.hash = '#foo';
    });
    await infoDeep.page.waitForFunction(
      () => window.location.hash === '#foo',
      undefined,
      { timeout: 30000 },
    );
    await delay(250);
    const infoOtherHashState = await readInfoDeepState();
    assert(
      infoOtherHashState.id === infoDeepLinkFinding.id,
      'a non-finding hash changed the selected finding',
    );
    assert(!infoOtherHashState.row, 'a non-finding hash revealed a hidden row');
    assert(
      infoOtherHashState.pressed === 'false',
      'a non-finding hash changed the findings filter',
    );

    // Back to the same finding hash: the row must appear again.
    await infoDeep.page.evaluate((findingId) => {
      window.location.hash = `#finding=${encodeURIComponent(findingId)}`;
    }, infoDeepLinkFinding.id);
    await infoDeep.page.waitForFunction(
      (findingId) => Boolean(document.querySelector(`[data-testid="finding-row-${findingId}"]`)),
      infoDeepLinkFinding.id,
      { timeout: 30000 },
    );
    const infoRepeatedState = await readInfoDeepState();
    assert(
      infoRepeatedState.id === infoDeepLinkFinding.id,
      'returning to the same finding hash closed the selected finding',
    );
    assert(
      infoRepeatedState.row,
      'returning to the same finding hash did not reveal its row',
    );
    assert(
      infoRepeatedState.pressed === 'true',
      'returning to the same finding hash did not turn the filter on',
    );
    assert(
      JSON.stringify(infoRepeatedState.ids) === JSON.stringify(expectedRevealedIds),
      'returning to the same finding hash did not reveal the whole committed list in order',
    );

    const infoDeepClean = await assertContextClean(infoDeep);
    await infoDeep.context.close();
    summary.deepLink.info = {
      id: infoDeepLinkFinding.id,
      rowVisible: infoDeepState.row,
      repeatedReveal: {
        rowVisible: infoRepeatedState.row,
        filterPressed: infoRepeatedState.pressed,
      },
      ...infoDeepClean,
    };

    // Sample notification emails: the landing leads with clearly labelled
    // cards whose cited ids exist in the committed findings document, and a
    // click on a card from an idle page (checks not run yet) must auto-run the
    // checks through the same-page hash change and open the cited finding.
    // This is the idle `hashchange` path, not a fresh load with a hash.
    const sample = await prepareContext(browser, 'sample-email');
    await sample.page.goto(entryUrl, { waitUntil: 'load', timeout: 60000 });
    await sample.page.waitForSelector('[data-testid="abi"]', { timeout: 30000 });
    await sample.page.waitForSelector('[data-testid="sample-notifications"]', {
      timeout: 30000,
    });

    const titleEn = await sample.page.title();
    assert(
      /Cross-document inconsistencies in FarmBot Genesis documentation/i.test(titleEn),
      `the document title is ${JSON.stringify(titleEn)}`,
    );
    await sample.page.selectOption('[data-testid="lang-toggle"]', 'ja');
    await sample.page.waitForFunction(
      () => /FarmBot Genesis ドキュメントの文書間不一致/.test(document.title),
      undefined,
      { timeout: 30000 },
    );
    await sample.page.selectOption('[data-testid="lang-toggle"]', 'en');
    await sample.page.waitForFunction(
      () => /Cross-document inconsistencies in FarmBot Genesis documentation/i.test(document.title),
      undefined,
      { timeout: 30000 },
    );

    const sampleCards = await sample.page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="sample-card"]')].map((card) => ({
        id: card.getAttribute('data-finding-id') ?? '',
        rule: card.getAttribute('data-rule') ?? '',
        severity: card.getAttribute('data-severity') ?? '',
        href: card.querySelector('[data-testid="sample-open-finding"]')?.getAttribute('href') ?? '',
        badge:
          card.querySelector('[data-testid="sample-badge"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        summary:
          (card.querySelector('[data-testid="sample-summary"]')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
        text: (card.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })),
    );
    assert(
      sampleCards.length === SAMPLE_NOTIFICATIONS.length,
      `the landing shows ${sampleCards.length} sample cards, expected ${SAMPLE_NOTIFICATIONS.length}`,
    );
    assert(
      JSON.stringify(sampleCards.map((card) => card.id)) ===
        JSON.stringify(SAMPLE_NOTIFICATIONS.map((card) => card.id)),
      'the sample cards differ from the catalog ids or order',
    );
    for (const card of sampleCards) {
      const finding = findings.find((candidate) => candidate.id === card.id);
      assert(finding, `a sample card cites unknown finding id ${card.id}`);
      assert(
        card.rule === finding.rule,
        `sample card ${card.id} states rule ${card.rule}, the committed finding has ${finding.rule}`,
      );
      assert(
        card.severity === finding.severity,
        `sample card ${card.id} states severity ${card.severity}, the committed finding has ${finding.severity}`,
      );
      assert(
        card.href === `#finding=${card.id}`,
        `sample card ${card.id} links to ${JSON.stringify(card.href)}`,
      );
      assert(
        card.badge === 'Sample',
        `sample card ${card.id} is not labelled as a sample: ${card.badge}`,
      );
      const expectedSummary = summaryLine(finding, 'en').replace(/\s+/g, ' ').trim();
      assert(
        card.summary === expectedSummary,
        `sample card ${card.id} does not show the committed summary\n` +
          `  expected: ${expectedSummary}\n  actual:   ${card.summary}`,
      );
    }
    const samplesAboveQuestions = await sample.page.evaluate(() => {
      const samples = document.querySelector('[data-testid="sample-notifications"]');
      const questions = document.querySelector('[data-testid="question-q1"]');
      return Boolean(
        samples &&
          questions &&
          samples.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    assert(
      samplesAboveQuestions,
      'the sample notification cards are not above the preset questions',
    );

    // The cited finding is drawn from the committed file only, so the diagram
    // and row expectations come from the same document.
    const idleCard = sampleCards[0];
    const idleFinding = findings.find((candidate) => candidate.id === idleCard.id);
    assert(idleFinding, `the first sample card cites unknown finding id ${idleCard.id}`);
    assert(
      !(await sample.page.locator('[data-testid="findings-count"]').count()),
      'the checks ran before the sample card was clicked',
    );
    const idleRelate = sample.requests.filter((url) => isRelateAssetUrl(url, entryInfo));
    assert(idleRelate.length === 0, `the idle landing requested Relate: ${idleRelate.join(', ')}`);

    await sample.page
      .locator(`[data-testid="sample-card"][data-finding-id="${idleCard.id}"]`)
      .locator('[data-testid="sample-open-finding"]')
      .click();
    await sample.page.waitForSelector('[data-testid="finding-view"]', { timeout: 180000 });
    await sample.page.waitForSelector(
      `[data-testid="finding-row-${idleCard.id}"]`,
      { timeout: 30000 },
    );
    const sampleClickState = await sample.page.evaluate(
      (findingId) => ({
        hash: window.location.hash,
        id: document.querySelector('[data-testid="finding-open-id"]')?.textContent?.trim() ?? '',
        count: Number(document.querySelector('[data-testid="findings-count"]')?.textContent ?? '0'),
        lanes: Boolean(document.querySelector('[data-testid="process-lanes"]')),
        evidenceRows: document.querySelectorAll('[data-testid="evidence-row"]').length,
      }),
      idleCard.id,
    );
    assert(
      sampleClickState.hash === `#finding=${idleCard.id}`,
      `the sample click left the hash at ${sampleClickState.hash}`,
    );
    assert(
      sampleClickState.id === idleCard.id,
      `the sample click opened ${JSON.stringify(sampleClickState.id)}`,
    );
    assert(
      sampleClickState.count === findings.length,
      `the sample click ran checks reporting ${sampleClickState.count} findings`,
    );
    assert(
      sampleClickState.lanes,
      'the sample finding opened without its process-lane diagram',
    );
    assert(
      sampleClickState.evidenceRows === idleFinding.evidence.length,
      `the sample finding shows ${sampleClickState.evidenceRows} evidence rows, expected ` +
        `${idleFinding.evidence.length}`,
    );
    const sampleTimings = await readTimings(sample.page);
    assert(sampleTimings.checks, 'the sample click left no check result');
    assert(
      sampleTimings.checks.matches === true,
      'the sample click produced a result that does not match the committed findings',
    );
    const clickRelate = sample.requests.filter((url) => isRelateAssetUrl(url, entryInfo));
    assert(clickRelate.length > 0, 'the sample card click did not run the checks');
    const notifyRequests = sample.requests.filter((url) =>
      pathOf(url).startsWith('/api/notify'),
    );
    assert(
      notifyRequests.length === 0,
      `the sample card sent a notification request: ${notifyRequests.join(', ')}`,
    );

    // The production build serves a same-origin favicon, so GET /favicon.ico
    // is not a 404.
    const favicon = await sample.page.evaluate(async () => {
      const response = await fetch('/favicon.ico', { cache: 'no-store' });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
      };
    });
    assert(favicon.status === 200, `GET /favicon.ico returned HTTP ${favicon.status}`);
    assert(
      favicon.contentType.startsWith('image/x-icon'),
      `GET /favicon.ico has content type ${JSON.stringify(favicon.contentType)}`,
    );

    const sampleClean = await assertContextClean(sample);
    const sampleModel = assertNoModelRequests(sample.requests, 'sample email landing');
    summary.sampleEmails = {
      cards: sampleCards.map((card) => ({
        id: card.id,
        rule: card.rule,
        severity: card.severity,
        href: card.href,
      })),
      aboveQuestions: true,
      idleClick: {
        id: idleCard.id,
        hash: sampleClickState.hash,
        findingsCount: sampleClickState.count,
        processLanes: sampleClickState.lanes,
        evidenceRows: sampleClickState.evidenceRows,
        checksDigestMatches: sampleTimings.checks.matches,
        relateRequests: clickRelate.length,
        notifyRequests: notifyRequests.length,
      },
      favicon: { status: favicon.status, contentType: favicon.contentType },
      titleFollowsToggle: true,
      ...sampleModel,
      ...sampleClean,
    };
    await sample.context.close();

    // Process lanes: one deep link per rule in the committed file. The drawn
    // nodes and edges must equal the layout function's output for that finding,
    // a node click selects its evidence rows, and a row click selects its node.
    const ruleFindings = [...new Set(findings.map((finding) => finding.rule))]
      .sort()
      .map(
        (rule) =>
          [...findings]
            .filter((finding) => finding.rule === rule)
            .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0],
      );
    const processLaneFixtures = [];
    summary.processLanes = { rules: [], r2ManyStructures: null, r6Inferred: null, phone: null };

    for (const finding of ruleFindings) {
      const expected = expectedDiagram(finding);
      const fixture = await prepareContext(browser, `process-lanes-${finding.rule}`);
      await fixture.page.goto(`${entryUrl}#finding=${encodeURIComponent(finding.id)}`, {
        waitUntil: 'load',
        timeout: 60000,
      });
      await fixture.page.waitForSelector('[data-testid="process-lanes"] [data-node-id]', {
        timeout: 180000,
      });
      await fixture.page.waitForSelector(
        `[data-testid="finding-row-${finding.id}"]`,
        { timeout: 30000 },
      );
      assert(
        (await fixture.page.locator(`[data-testid="finding-row-${finding.id}"]`).count()) === 1,
        `${finding.rule}: the deep-linked finding has no row in the filtered list`,
      );
      const diagram = await readDiagram(fixture.page);
      assert(diagram.present, `${finding.rule}: the process-lane diagram is missing`);
      assert(
        JSON.stringify(diagram.nodes.map((node) => node.id).sort()) ===
          JSON.stringify(expected.nodeIds),
        `${finding.rule}: drawn nodes ` +
          `${JSON.stringify(diagram.nodes.map((node) => node.id).sort())} != ` +
          `${JSON.stringify(expected.nodeIds)}`,
      );
      assert(
        JSON.stringify(diagram.nodes.map((node) => `${node.id}\u0000${node.lane}`).sort()) ===
          JSON.stringify(expected.lanes),
        `${finding.rule}: a node is drawn in the wrong lane`,
      );
      assert(
        JSON.stringify(
          diagram.nodes
            .filter((node) => node.problem === 'true')
            .map((node) => node.id)
            .sort(),
        ) === JSON.stringify(expected.problems),
        `${finding.rule}: the problem nodes differ from the layout`,
      );
      assert(
        JSON.stringify(
          diagram.edges.map((edge) => `${edge.from}\u0000${edge.to}\u0000${edge.kind}`).sort(),
        ) === JSON.stringify(expected.edges),
        `${finding.rule}: the drawn edges differ from the layout`,
      );
      assert(
        diagram.edges.filter((edge) => edge.kind === 'missing').length === expected.missing,
        `${finding.rule}: expected ${expected.missing} missing link(s)`,
      );
      assert(
        diagram.rows.length === expected.rows,
        `${finding.rule}: the evidence table has ${diagram.rows.length} rows, ` +
          `expected ${expected.rows}`,
      );

      const firstNode = diagram.nodes[0];
      assert(firstNode, `${finding.rule}: the diagram has no node`);
      await fixture.page.locator('[data-testid="process-lanes"] [data-node-id]').first().click();
      const afterNodeClick = await readDiagram(fixture.page);
      const selectedRows = afterNodeClick.rows
        .filter((row) => row.selected === 'true')
        .map((row) => row.index)
        .sort((left, right) => left - right);
      assert(
        JSON.stringify(selectedRows) ===
          JSON.stringify([...firstNode.evidenceIndexes].sort((left, right) => left - right)),
        `${finding.rule}: clicking the node selected rows ${JSON.stringify(selectedRows)}`,
      );
      assert(
        JSON.stringify(
          afterNodeClick.nodes.filter((node) => node.selected === 'true').map((node) => node.id),
        ) === JSON.stringify([firstNode.id]),
        `${finding.rule}: the clicked node is not the only selected node`,
      );

      const otherRow =
        afterNodeClick.rows.find((row) => !firstNode.evidenceIndexes.includes(row.index)) ??
        afterNodeClick.rows[0];
      assert(otherRow, `${finding.rule}: the evidence table has no row to click`);
      await fixture.page
        .locator('[data-testid="evidence-row"]')
        .nth(otherRow.index)
        .click({ position: { x: 4, y: 4 } });
      const afterRowClick = await readDiagram(fixture.page);
      const rowNode = afterRowClick.nodes.find((node) =>
        node.evidenceIndexes.includes(otherRow.index),
      );
      assert(rowNode, `${finding.rule}: no node represents evidence row ${otherRow.index}`);
      assert(
        rowNode.selected === 'true',
        `${finding.rule}: clicking evidence row ${otherRow.index} did not select its node`,
      );
      assert(
        afterRowClick.nodes.filter((node) => node.selected === 'true').length === 1,
        `${finding.rule}: more than one node is selected after a row click`,
      );

      // Clear the selection through the existing finding controls, so the
      // keyboard check starts from an unselected row even when the finding has
      // a single evidence row. Closing the finding and reopening it resets the
      // shared selection.
      await fixture.page.locator('[data-testid="close-finding"]').click();
      await fixture.page
        .locator(`[data-testid="finding-row-${finding.id}"]`)
        .click();
      await fixture.page.waitForSelector(
        '[data-testid="process-lanes"] [data-node-id]',
      );
      const clearedDiagram = await readDiagram(fixture.page);
      assert(
        clearedDiagram.rows.every((row) => row.selected === 'false'),
        `${finding.rule}: reopening the finding kept an evidence row selected`,
      );

      // Keyboard: focus a "Select node" button and press Enter. The button
      // selects its row and node, exposes aria-pressed, and keeps focus.
      const keyboardRow =
        clearedDiagram.rows.find((row) => row.index !== otherRow.index) ??
        clearedDiagram.rows[0];
      assert(keyboardRow, `${finding.rule}: the evidence table has no keyboard row`);
      const keyboardButton = fixture.page
        .locator('[data-testid="evidence-row"]')
        .nth(keyboardRow.index)
        .locator('button.evidence-select');
      await keyboardButton.focus();
      const beforeEnter = await fixture.page.evaluate((index) => {
        const row = document.querySelector(
          `[data-testid="evidence-row"][data-evidence-index="${index}"]`,
        );
        const button = row?.querySelector('button.evidence-select') ?? null;
        return {
          rowSelected: row?.getAttribute('data-selected') ?? null,
          pressed: button?.getAttribute('aria-pressed') ?? null,
          focusOnButton: document.activeElement === button,
        };
      }, keyboardRow.index);
      assert(
        beforeEnter.rowSelected === 'false',
        `${finding.rule}: evidence row ${keyboardRow.index} was already selected before Enter`,
      );
      assert(
        beforeEnter.pressed === 'false',
        `${finding.rule}: aria-pressed is ${JSON.stringify(beforeEnter.pressed)} before Enter`,
      );
      assert(
        beforeEnter.focusOnButton,
        `${finding.rule}: focus is not on the Select node button before Enter`,
      );

      await fixture.page.keyboard.press('Enter');
      await fixture.page.waitForFunction(
        (index) => {
          const row = document.querySelector(
            `[data-testid="evidence-row"][data-evidence-index="${index}"]`,
          );
          return row?.getAttribute('data-selected') === 'true';
        },
        keyboardRow.index,
      );
      const keyboardState = await fixture.page.evaluate((index) => {
        const row = document.querySelector(
          `[data-testid="evidence-row"][data-evidence-index="${index}"]`,
        );
        const button = row?.querySelector('button.evidence-select') ?? null;
        return {
          rowSelected: row?.getAttribute('data-selected') ?? null,
          pressed: button?.getAttribute('aria-pressed') ?? null,
          focusOnButton: document.activeElement === button,
        };
      }, keyboardRow.index);
      assert(
        keyboardState.rowSelected === 'true',
        `${finding.rule}: the Select node button did not select its row`,
      );
      assert(
        keyboardState.pressed === 'true',
        `${finding.rule}: aria-pressed is ${JSON.stringify(keyboardState.pressed)} after selection`,
      );
      assert(
        keyboardState.focusOnButton,
        `${finding.rule}: focus left the Select node button after Enter`,
      );
      const keyboardDiagram = await readDiagram(fixture.page);
      const keyboardNode = keyboardDiagram.nodes.find((node) =>
        node.evidenceIndexes.includes(keyboardRow.index),
      );
      assert(
        keyboardNode,
        `${finding.rule}: no node represents evidence row ${keyboardRow.index}`,
      );
      assert(
        keyboardNode.selected === 'true',
        `${finding.rule}: the Select node button did not select its node`,
      );

      // Toggling the row's details must not change the selection, and focus
      // must stay inside the details element.
      const details = fixture.page
        .locator('[data-testid="evidence-row"]')
        .nth(keyboardRow.index)
        .locator('details.evidence-queries');
      const summaryElement = details.locator('summary');
      const selectedBeforeToggle = (await readDiagram(fixture.page)).rows
        .filter((row) => row.selected === 'true')
        .map((row) => row.index)
        .sort((left, right) => left - right);
      await summaryElement.focus();
      const openBefore = await details.evaluate((element) => element.open);
      await fixture.page.keyboard.press('Enter');
      const openAfterFirst = await details.evaluate((element) => element.open);
      const focusAfterFirst = await details.evaluate(
        (element) => element.contains(document.activeElement),
      );
      await fixture.page.keyboard.press('Enter');
      const openAfterSecond = await details.evaluate((element) => element.open);
      const focusAfterSecond = await details.evaluate(
        (element) => element.contains(document.activeElement),
      );
      assert(
        openAfterFirst !== openBefore && openAfterSecond === openBefore,
        `${finding.rule}: the details did not toggle (${openBefore} -> ${openAfterFirst} -> ${openAfterSecond})`,
      );
      assert(
        focusAfterFirst && focusAfterSecond,
        `${finding.rule}: focus left the details while toggling`,
      );
      const selectedAfterToggle = (await readDiagram(fixture.page)).rows
        .filter((row) => row.selected === 'true')
        .map((row) => row.index)
        .sort((left, right) => left - right);
      assert(
        JSON.stringify(selectedAfterToggle) === JSON.stringify(selectedBeforeToggle),
        `${finding.rule}: toggling details changed the selection from ` +
          `${JSON.stringify(selectedBeforeToggle)} to ${JSON.stringify(selectedAfterToggle)}`,
      );

      const clean = await assertContextClean(fixture);
      processLaneFixtures.push({ fixture, clean });
      summary.processLanes.rules.push({
        id: finding.id,
        rule: finding.rule,
        nodes: diagram.nodes.length,
        edges: diagram.edges.length,
        missingEdges: expected.missing,
        evidenceRows: diagram.rows.length,
        selectedFromNode: selectedRows.length,
        selectedFromRow: rowNode.id,
        selectedFromKeyboard: keyboardNode.id,
        detailsToggled: true,
        selectionUnchangedByDetails: true,
        ...clean,
      });
    }

    // R2 goes to the finding with the most structure rows: its links must follow
    // the shared source file, so an all-pairs cross product would show up here.
    const structureCount = (finding) =>
      new Set(
        finding.evidence
          .filter((row) => row.role === 'structure')
          .map((row) => row.nodeId),
      ).size;
    const r2Finding = findings
      .filter((finding) => finding.rule === 'R2')
      .sort(
        (left, right) =>
          structureCount(right) - structureCount(left) ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      )[0];
    assert(r2Finding, 'the committed file has no R2 finding');

    const r2Expected = expectedDiagram(r2Finding);
    const r2Fixture = await prepareContext(browser, 'process-lanes-r2-many-structures');
    await r2Fixture.page.goto(`${entryUrl}#finding=${encodeURIComponent(r2Finding.id)}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await r2Fixture.page.waitForSelector('[data-testid="process-lanes"] [data-node-id]', {
      timeout: 180000,
    });
    const r2Diagram = await readDiagram(r2Fixture.page);
    assert(r2Diagram.present, 'the R2 process-lane diagram is missing');
    assert(
      JSON.stringify(r2Diagram.nodes.map((node) => node.id).sort()) ===
        JSON.stringify(r2Expected.nodeIds),
      `the R2 diagram shows different nodes from the layout: ` +
        `${JSON.stringify(r2Diagram.nodes.map((node) => node.id).sort())} != ` +
        `${JSON.stringify(r2Expected.nodeIds)}`,
    );
    assert(
      JSON.stringify(
        r2Diagram.edges.map((edge) => `${edge.from}\u0000${edge.to}\u0000${edge.kind}`).sort(),
      ) === JSON.stringify(r2Expected.edges),
      'the R2 diagram draws different edges from the layout',
    );
    assert(
      r2Diagram.edges.filter((edge) => edge.kind === 'missing').length === r2Expected.missing,
      `the R2 diagram draws a different number of missing links than ${r2Expected.missing}`,
    );
    const r2Clean = await assertContextClean(r2Fixture);
    processLaneFixtures.push({ fixture: r2Fixture, clean: r2Clean });
    summary.processLanes.r2ManyStructures = {
      id: r2Finding.id,
      structures: structureCount(r2Finding),
      nodes: r2Diagram.nodes.length,
      edges: r2Diagram.edges.length,
      missingEdges: r2Expected.missing,
      ...r2Clean,
    };

    // R6: open one inferred finding by deep link. Its diagram must start at the
    // Design change lane and reach both Packing and Service, the drawn nodes and
    // edges must equal layoutFinding, the view must show the inferred label, and
    // the context must stay free of CSP and cross-origin noise.
    const r6Inferred = findings
      .filter(
        (finding) =>
          finding.rule === 'R6' &&
          finding.inferred === true &&
          finding.evidence.some((row) => row.role === 'packing-structure') &&
          finding.evidence.some((row) => row.role === 'service'),
      )
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0];
    assert(r6Inferred, 'the committed file has no inferred R6 finding with packing and service rows');
    const r6Expected = expectedDiagram(r6Inferred);
    const r6Layout = layoutFinding(r6Inferred);
    const r6Change = r6Layout.nodes.find((node) => node.lane === 'design-change');
    assert(r6Change, `${r6Inferred.id}: the R6 diagram has no design-change node`);
    const r6Reachable = new Set([r6Change.id]);
    const r6Links = r6Layout.edges.filter((edge) => edge.kind === 'link');
    let r6Grew = true;
    while (r6Grew) {
      r6Grew = false;
      for (const edge of r6Links) {
        if (!r6Reachable.has(edge.from) || r6Reachable.has(edge.to)) continue;
        r6Reachable.add(edge.to);
        r6Grew = true;
      }
    }
    const r6Lanes = new Set(
      r6Layout.nodes.filter((node) => r6Reachable.has(node.id)).map((node) => node.lane),
    );
    assert(r6Lanes.has('packing'), `${r6Inferred.id}: no packing node downstream of the change`);
    assert(r6Lanes.has('service'), `${r6Inferred.id}: no service node downstream of the change`);

    const r6Fixture = await prepareContext(browser, 'process-lanes-r6-inferred');
    await r6Fixture.page.goto(`${entryUrl}#finding=${encodeURIComponent(r6Inferred.id)}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await r6Fixture.page.waitForSelector('[data-testid="process-lanes"] [data-node-id]', {
      timeout: 180000,
    });
    const r6Diagram = await readDiagram(r6Fixture.page);
    assert(
      JSON.stringify(r6Diagram.nodes.map((node) => node.id).sort()) ===
        JSON.stringify(r6Expected.nodeIds),
      `the R6 diagram shows different nodes from the layout: ` +
        `${JSON.stringify(r6Diagram.nodes.map((node) => node.id).sort())}`,
    );
    assert(
      JSON.stringify(
        r6Diagram.edges.map((edge) => `${edge.from}\u0000${edge.to}\u0000${edge.kind}`).sort(),
      ) === JSON.stringify(r6Expected.edges),
      'the R6 diagram draws different edges from the layout',
    );
    assert(
      r6Diagram.nodes.some((node) => node.lane === 'design-change'),
      'the R6 diagram has no node in the Design change lane',
    );
    const r6InferredFlag = await r6Fixture.page
      .locator('[data-testid="finding-inferred"]')
      .getAttribute('data-inferred');
    assert(
      r6InferredFlag === 'true',
      `the R6 finding view shows data-inferred=${JSON.stringify(r6InferredFlag)}`,
    );
    const r6Clean = await assertContextClean(r6Fixture);
    processLaneFixtures.push({ fixture: r6Fixture, clean: r6Clean });
    summary.processLanes.r6Inferred = {
      id: r6Inferred.id,
      inferred: true,
      nodes: r6Diagram.nodes.length,
      edges: r6Diagram.edges.length,
      lanes: [...r6Lanes].sort(),
      ...r6Clean,
    };

    // Phone viewport: the diagram must not exceed a 375px-wide screen.
    const phone = await prepareContext(browser, 'process-lanes-phone', {
      width: 375,
      height: 812,
    });
    await phone.page.goto(`${entryUrl}#finding=${encodeURIComponent(deepLinkFinding.id)}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await phone.page.waitForSelector('[data-testid="process-lanes"] [data-node-id]', {
      timeout: 180000,
    });
    const phoneDiagram = await readDiagram(phone.page);
    assert(
      typeof phoneDiagram.svgWidth === 'number',
      'the phone context drew no process-lane SVG',
    );
    assert(
      phoneDiagram.viewportWidth === 375,
      `the phone viewport is ${phoneDiagram.viewportWidth}px wide`,
    );
    assert(
      phoneDiagram.svgWidth <= phoneDiagram.viewportWidth,
      `the diagram is ${phoneDiagram.svgWidth}px wide in a ` +
        `${phoneDiagram.viewportWidth}px viewport`,
    );
    const phoneExpected = expectedDiagram(deepLinkFinding);
    assert(
      JSON.stringify(phoneDiagram.nodes.map((node) => node.id).sort()) ===
        JSON.stringify(phoneExpected.nodeIds),
      'the phone diagram shows different nodes from the layout',
    );
    const phoneClean = await assertContextClean(phone);
    processLaneFixtures.push({ fixture: phone, clean: phoneClean });
    summary.processLanes.phone = {
      id: deepLinkFinding.id,
      viewportWidth: phoneDiagram.viewportWidth,
      svgWidth: Number(phoneDiagram.svgWidth.toFixed(2)),
      nodes: phoneDiagram.nodes.length,
      ...phoneClean,
    };

    // A well-formed but unknown id may run the checks; it opens nothing and
    // shows no error.
    const unknown = await prepareContext(browser, 'unknown-finding');
    await unknown.page.goto(`${entryUrl}#finding=does-not-exist`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await unknown.page.waitForSelector('[data-testid="findings-count"]', { timeout: 180000 });
    const unknownState = await unknown.page.evaluate(() => ({
      view: Boolean(document.querySelector('[data-testid="finding-view"]')),
      error: Boolean(
        document.querySelector('[data-testid="error"]') ||
          document.querySelector('[data-testid="checks-error"]'),
      ),
      count: Number(document.querySelector('[data-testid="findings-count"]')?.textContent),
    }));
    assert(!unknownState.view, 'an unknown finding id opened a finding');
    assert(!unknownState.error, 'an unknown finding id showed an error');
    assert(
      unknownState.count === findings.length,
      `the unknown-id page reports ${unknownState.count} findings`,
    );
    const unknownClean = await assertContextClean(unknown);
    summary.unknownFinding = { opened: false, ...unknownClean };

    // Malformed hashes do nothing: no session, no request, no error.
    for (const hash of ['#finding=%E0%A4%A', '#foo']) {
      const malformed = await prepareContext(browser, `malformed-${hash}`);
      await malformed.page.goto(`${entryUrl}${hash}`, { waitUntil: 'load', timeout: 60000 });
      await malformed.page.waitForSelector('[data-testid="abi"]', { timeout: 30000 });
      await malformed.page.waitForSelector('[data-testid="run"]:not([disabled])', {
        timeout: 30000,
      });
      await delay(500);
      const malformedState = await malformed.page.evaluate(() => ({
        view: Boolean(document.querySelector('[data-testid="finding-view"]')),
        checksRan: Boolean(document.querySelector('[data-testid="findings-count"]')),
        error: Boolean(
          document.querySelector('[data-testid="error"]') ||
            document.querySelector('[data-testid="checks-error"]'),
        ),
      }));
      assert(!malformedState.view, `${hash} opened a finding`);
      assert(!malformedState.checksRan, `${hash} ran the checks`);
      assert(!malformedState.error, `${hash} showed an error`);
      const relate = malformed.requests.filter((url) => isRelateAssetUrl(url, entryInfo));
      assert(relate.length === 0, `${hash} requested Relate: ${relate.join(', ')}`);
      const malformedClean = await assertContextClean(malformed);
      summary.malformedHashes.push({
        hash,
        opened: false,
        checksRan: false,
        relateRequests: relate.length,
        pageErrors: [...malformed.pageErrors],
        ...malformedClean,
      });
    }

    summary.cspViolations = {
      happy: happyCsp.length,
      tampered: tamperCsp.length,
      deepLink: summary.deepLink.cspViolations,
      deepLinkInfo: summary.deepLink.info.cspViolations,
      sampleEmails: summary.sampleEmails.cspViolations,
      processLanes: processLaneFixtures.map((entry) => entry.clean.cspViolations),
      unknown: summary.unknownFinding.cspViolations,
      malformed: summary.malformedHashes.map((entry) => entry.cspViolations),
      checkRouting: {
        beforeConsent: summary.checkRouting.beforeConsent.cspViolations,
        noWebgpu: summary.checkRouting.noWebgpu.cspViolations,
        invalidModelOutputs: summary.checkRouting.invalidModelOutputs?.cspViolations ?? null,
      },
    };
    summary.pageErrors = [
      ...happy.pageErrors,
      ...tamper.pageErrors,
      ...deep.pageErrors,
      ...infoDeep.pageErrors,
      ...sample.pageErrors,
      ...processLaneFixtures.flatMap((entry) => entry.fixture.pageErrors),
      ...unknown.pageErrors,
      ...summary.malformedHashes.flatMap((entry) => entry.pageErrors),
      ...summary.checkRouting.beforeConsent.pageErrors,
      ...summary.checkRouting.noWebgpu.pageErrors,
      ...(summary.checkRouting.invalidModelOutputs?.pageErrors ?? []),
    ];
    summary.nonSameOriginRequests = [
      ...new Set([
        ...happyExternal,
        ...tamperExternal,
        ...deepClean.external,
        ...infoDeepClean.external,
        ...sampleClean.external,
        ...processLaneFixtures.flatMap((entry) => entry.clean.external),
        ...unknownClean.external,
        ...summary.malformedHashes.flatMap((entry) => entry.external),
        ...summary.checkRouting.beforeConsent.external,
        ...summary.checkRouting.noWebgpu.external,
        ...(summary.checkRouting.invalidModelOutputs?.external ?? []),
      ]),
    ];

    const missed = budgetRecords.filter((record) => !record.ok);
    if (enforceBudget && missed.length > 0) {
      throw new Error(
        `budget(s) missed with SMOKE_FARMBOT_ENFORCE_BUDGET=1: ${missed
          .map((record) => `${record.label} ${record.measuredMs} ms > ${record.budgetMs} ms`)
          .join(', ')}`,
      );
    }

    summary.ok = true;
    console.log(JSON.stringify(summary, null, 2));
    console.log(
      'smoke:farmbot OK (5 questions, seed digest verified, 0 CSP violations, 0 non-same-origin requests)',
    );
  } catch (error) {
    summary.error = error.message;
    for (const fixture of [happy, tamper]) {
      if (!fixture) continue;
      try {
        const violations = await readCspViolations(fixture.page);
        summary[`${fixture.label}CspViolations`] = violations;
      } catch {
        // The page may already be gone.
      }
    }
    console.log(JSON.stringify(summary, null, 2));
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // The browser may already be gone.
      }
    }
    if (localServer) {
      try {
        await localServer.close();
      } catch {
        // A leftover listener dies with the process.
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('smoke:farmbot FAILED:', error.message);
    process.exit(1);
  });
