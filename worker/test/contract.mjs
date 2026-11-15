// Tier 3 contract test: start the real Worker (built dist/ + worker/index.ts)
// with wrangler's in-process dev server, then check asset behavior, the
// notification endpoint's fail-closed responses, and the scheduled handler.
//
// Run after `npm run build`:
//   node worker/test/contract.mjs
//
// The test injects its own fake token as a dev-only binding. It never sets
// NOTIFY_TO/NOTIFY_FROM, so no email can be sent.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { unstable_startWorker as startWorker } from 'wrangler';

const root = resolve(import.meta.dirname, '../..');
const dist = join(root, 'dist');
const token = randomBytes(24).toString('hex');

if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'farmbot/index.html'))) {
  throw new Error('dist/ is missing; run `npm run build` before the contract test');
}

/** Parse the `/*` block from public/_headers. */
function readAssetHeaders() {
  const lines = readFileSync(join(root, 'public/_headers'), 'utf8').split(/\r?\n/);
  const wanted = new Map();
  let currentRule = null;
  for (const line of lines) {
    if (!line.trim()) {
      currentRule = null;
      continue;
    }
    if (!/^\s/.test(line)) {
      currentRule = line.trim();
      continue;
    }
    if (currentRule !== '/*') continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    wanted.set(name, value);
  }
  return wanted;
}

const assetHeaders = readAssetHeaders();
assert.ok(assetHeaders.has('content-security-policy'), '_headers must set a CSP');
assert.ok(assetHeaders.has('x-content-type-options'), '_headers must set nosniff');
assert.ok(assetHeaders.has('referrer-policy'), '_headers must set referrer policy');

function assertSecurityHeaders(response, label) {
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8',
    `${label}: content type`,
  );
  assert.equal(response.headers.get('cache-control'), 'no-store', `${label}: cache control`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${label}: nosniff`);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer', `${label}: referrer`);
  assert.equal(
    response.headers.get('content-security-policy'),
    "default-src 'none'; frame-ancestors 'none'",
    `${label}: CSP`,
  );
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    null,
    `${label}: no CORS headers`,
  );
}

async function request(worker, path, init = {}) {
  return worker.fetch(`${new URL(path, await worker.url).href}`, init);
}

const worker = await startWorker({
  config: join(root, 'wrangler.jsonc'),
  // Override any local `.dev.vars` so this test can never send real mail.
  bindings: {
    NOTIFY_TOKEN: { type: 'plain_text', value: token },
    NOTIFY_TO: { type: 'plain_text', value: '' },
    NOTIFY_FROM: { type: 'plain_text', value: '' },
  },
  dev: { remote: false, logLevel: 'error', testScheduled: true },
});

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

try {
  await worker.ready;
  const base = await worker.url;
  console.log(`contract worker ready at ${base.origin}`);

  for (const path of ['/', '/farmbot/']) {
    check(`asset ${path} returns 200 with _headers security headers`, async () => {
      const response = await request(worker, path);
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get('content-security-policy'),
        assetHeaders.get('content-security-policy'),
      );
      await response.arrayBuffer();
      assert.equal(
        response.headers.get('x-content-type-options'),
        assetHeaders.get('x-content-type-options'),
      );
      assert.equal(
        response.headers.get('referrer-policy'),
        assetHeaders.get('referrer-policy'),
      );
    });
  }

  check('unknown paths return 404', async () => {
    const response = await request(worker, '/definitely-not-a-page');
    assert.equal(response.status, 404);
  });

  check('API without an Authorization header is 401', async () => {
    const response = await request(worker, '/api/notify/test', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    });
    assert.equal(response.status, 401);
    assertSecurityHeaders(response, '401');
  });

  check('API with a wrong token is 401', async () => {
    const response = await request(worker, '/api/notify/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${'f'.repeat(48)}`,
        'CF-Connecting-IP': '203.0.113.2',
      },
    });
    assert.equal(response.status, 401);
    assertSecurityHeaders(response, '401 wrong token');
  });

  check('API with the right token but no NOTIFY_TO/NOTIFY_FROM is 503', async () => {
    const response = await request(worker, '/api/notify/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'CF-Connecting-IP': '203.0.113.3',
      },
    });
    assert.equal(response.status, 503);
    assertSecurityHeaders(response, '503');
    assert.deepEqual(await response.json(), { ok: false, error: 'unavailable' });
  });

  check('non-POST on the API returns 405 with Allow: POST', async () => {
    const response = await request(worker, '/api/notify/test', { method: 'OPTIONS' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assertSecurityHeaders(response, '405');
  });

  check('scheduled trigger does not crash', async () => {
    const response = await request(
      worker,
      '/cdn-cgi/local/scheduled?format=json&cron=0+*+*+*+*',
    );
    assert.ok(response.status < 500, `scheduled trigger returned ${response.status}`);
    const result = await response.json();
    assert.ok(result === null || typeof result === 'object');
  });

  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(error);
    }
  }
  console.log(`\n${checks.length - failed}/${checks.length} contract checks passed`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await worker.dispose();
}
