import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_LIMITER_FALLBACK_KEY,
  DAILY_CAP_TTL_SECONDS,
  DIGEST_KEY,
  GLOBAL_LIMITER_KEY,
  handleNotifyRequest,
  runScheduled,
} from '../notify.ts';
import {
  NOTIFY_FROM,
  NOTIFY_PATH,
  NOTIFY_TO,
  NOTIFY_TOKEN,
  assertSecurityHeaders,
  bundle,
  captureLogs,
  cloneBundle,
  createEnv,
  createEmail,
  createKv,
  createLimiter,
  makeRequest,
} from './helpers.mjs';

const NOW = new Date('2026-11-15T12:34:56Z');
const SENT_KEY = 'sent:2026-11-15';

async function post(env, options = {}) {
  return handleNotifyRequest(makeRequest(options), env, options.bundle ?? bundle, NOW);
}

test('missing NOTIFY_TOKEN makes every request 401', async () => {
  const env = createEnv({ NOTIFY_TOKEN: undefined });
  const response = await post(env, { token: 'x'.repeat(48) });
  assert.equal(response.status, 401);
  assertSecurityHeaders(assert, response);
  assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' });
  assert.equal(env.EMAIL.messages.length, 0);
  assert.equal(env.NOTIFY_STATE.puts.length, 0);
  // The per-client limiter runs before auth; the global limiter must not run.
  assert.equal(env.NOTIFY_CLIENT_LIMITER.calls.length, 1);
  assert.equal(env.NOTIFY_GLOBAL_LIMITER.calls.length, 0);
});

test('a configured token shorter than 32 characters is rejected even when it matches', async () => {
  const shortToken = 'a'.repeat(31);
  const env = createEnv({ NOTIFY_TOKEN: shortToken });
  const response = await post(env, { token: shortToken });
  assert.equal(response.status, 401);
  assert.equal(env.EMAIL.messages.length, 0);
});

test('right token with no NOTIFY_TO or NOTIFY_FROM is a 503 and sends nothing', async () => {
  for (const key of ['NOTIFY_TO', 'NOTIFY_FROM']) {
    const env = createEnv({ [key]: undefined });
    const response = await post(env);
    assert.equal(response.status, 503, `${key} missing`);
    assertSecurityHeaders(assert, response);
    assert.deepEqual(await response.json(), { ok: false, error: 'unavailable' });
    assert.equal(env.EMAIL.messages.length, 0);
    assert.equal(env.NOTIFY_STATE.puts.length, 0);
    assert.equal(env.NOTIFY_GLOBAL_LIMITER.calls.length, 0);
  }
});

test('missing email, KV, or limiter bindings refuse the endpoint with 503', async () => {
  for (const key of ['EMAIL', 'NOTIFY_STATE', 'NOTIFY_GLOBAL_LIMITER', 'NOTIFY_CLIENT_LIMITER']) {
    const env = createEnv({ [key]: undefined });
    const response = await post(env);
    assert.equal(response.status, 503, `${key} missing`);
    assert.equal(env.EMAIL?.messages.length ?? 0, 0);
  }
});

test('cron with no secrets or missing bindings sends nothing and writes nothing', async () => {
  const cases = [
    createEnv({ NOTIFY_TO: undefined }),
    createEnv({ NOTIFY_FROM: undefined }),
    createEnv({ EMAIL: undefined }),
    createEnv({ NOTIFY_STATE: undefined }),
    createEnv({ NOTIFY_GLOBAL_LIMITER: undefined }),
    createEnv({ NOTIFY_CLIENT_LIMITER: undefined }),
    createEnv({ PUBLIC_BASE_URL: 'http://demo.example.invalid' }),
  ];
  for (const env of cases) {
    const result = await runScheduled(env, bundle, NOW);
    assert.equal(result.sent, false);
    assert.equal(env.EMAIL?.messages.length ?? 0, 0);
    assert.equal(env.NOTIFY_STATE?.puts.length ?? 0, 0);
  }
});

test('authorization rejects missing, malformed, and same-length wrong credentials', async () => {
  const wrongSameLength =
    NOTIFY_TOKEN.slice(0, -1) + (NOTIFY_TOKEN.endsWith('a') ? 'b' : 'a');
  const cases = [
    { label: 'no header', options: { token: null } },
    { label: 'wrong token', options: { token: wrongSameLength } },
    { label: 'wrong scheme', options: { token: null, headers: { Authorization: `Basic ${NOTIFY_TOKEN}` } } },
    { label: 'no scheme', options: { token: null, headers: { Authorization: NOTIFY_TOKEN } } },
    { label: 'empty bearer', options: { token: null, headers: { Authorization: 'Bearer' } } },
    { label: 'double space', options: { token: null, headers: { Authorization: `Bearer  ${NOTIFY_TOKEN}` } } },
    { label: 'tab separator', options: { token: null, headers: { Authorization: `Bearer\t${NOTIFY_TOKEN}` } } },
  ];
  for (const { label, options } of cases) {
    const env = createEnv();
    const response = await post(env, options);
    assert.equal(response.status, 401, label);
    assert.equal(env.EMAIL.messages.length, 0, label);
  }
});

test('the Bearer scheme is case-insensitive', async () => {
  const env = createEnv();
  const response = await post(env, {
    token: null,
    headers: { Authorization: `bEaReR ${NOTIFY_TOKEN}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('per-client limiter runs before auth and returns 429', async () => {
  const env = createEnv({
    NOTIFY_TOKEN: undefined,
    NOTIFY_CLIENT_LIMITER: createLimiter(false),
  });
  const response = await post(env, { token: null });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { ok: false, error: 'rate_limited' });
  assert.equal(env.EMAIL.messages.length, 0);
});

test('the per-client limiter is keyed by CF-Connecting-IP with an unknown fallback', async () => {
  const withIp = createEnv();
  await post(withIp, { ip: '203.0.113.9', token: null });
  assert.deepEqual(withIp.NOTIFY_CLIENT_LIMITER.calls, [{ key: '203.0.113.9' }]);

  const withoutIp = createEnv();
  await post(withoutIp, { token: null });
  assert.deepEqual(withoutIp.NOTIFY_CLIENT_LIMITER.calls, [
    { key: CLIENT_LIMITER_FALLBACK_KEY },
  ]);
});

test('global limiter refusal is 429 and sends nothing', async () => {
  const env = createEnv({ NOTIFY_GLOBAL_LIMITER: createLimiter(false) });
  const response = await post(env);
  assert.equal(response.status, 429);
  assert.equal(env.EMAIL.messages.length, 0);
  assert.equal(env.NOTIFY_STATE.puts.length, 0);
});

test('every send uses the global limiter with a constant key', async () => {
  const env = createEnv();
  await post(env);
  await runScheduled(env, bundle, NOW);
  const keys = env.NOTIFY_GLOBAL_LIMITER.calls.map((call) => call.key);
  assert.deepEqual(keys, [GLOBAL_LIMITER_KEY, GLOBAL_LIMITER_KEY]);
});

test('the daily KV cap returns 429 and does not send', async () => {
  const env = createEnv({ NOTIFY_STATE: createKv({ [SENT_KEY]: '10' }) });
  const response = await post(env);
  assert.equal(response.status, 429);
  assert.equal(env.EMAIL.messages.length, 0);

  const custom = createEnv({ NOTIFY_DAILY_CAP: '1', NOTIFY_STATE: createKv({ [SENT_KEY]: '1' }) });
  const customResponse = await post(custom);
  assert.equal(customResponse.status, 429);
  assert.equal(custom.EMAIL.messages.length, 0);
});

test('a successful send increments the daily counter with a two-day TTL', async () => {
  const env = createEnv();
  const response = await post(env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(env.EMAIL.messages.length, 1);
  const counter = env.NOTIFY_STATE.puts.find((put) => put.key === SENT_KEY);
  assert.ok(counter, 'daily counter was written');
  assert.equal(counter.value, '1');
  assert.equal(counter.options?.expirationTtl, DAILY_CAP_TTL_SECONDS);
});

test('the daily counter is written before EMAIL.send is called', async () => {
  const events = [];
  const state = createKv();
  const email = createEmail();
  const env = createEnv({
    NOTIFY_STATE: {
      ...state,
      async get(key) {
        events.push(`kv.get:${key}`);
        return state.get(key);
      },
      async put(key, value, options) {
        events.push(`kv.put:${key}=${value}`);
        return state.put(key, value, options);
      },
    },
    EMAIL: {
      ...email,
      async send(message) {
        events.push('email.send');
        return email.send(message);
      },
    },
  });
  const response = await post(env);
  assert.equal(response.status, 200);
  const putIndex = events.indexOf(`kv.put:${SENT_KEY}=1`);
  const sendIndex = events.indexOf('email.send');
  assert.ok(putIndex !== -1, `counter was not written: ${events.join(' -> ')}`);
  assert.ok(sendIndex !== -1, `email.send was not called: ${events.join(' -> ')}`);
  assert.ok(putIndex < sendIndex, `counter must be written first: ${events.join(' -> ')}`);
});

test('a daily-counter write failure is a 503 and EMAIL.send is never called', async () => {
  const failingState = () => ({
    store: new Map(),
    puts: [],
    async get() {
      return null;
    },
    async put() {
      throw new Error('kv write failed');
    },
  });

  const env = createEnv({ NOTIFY_STATE: failingState() });
  const response = await post(env);
  assert.equal(response.status, 503);
  assertSecurityHeaders(assert, response);
  assert.deepEqual(await response.json(), { ok: false, error: 'unavailable' });
  assert.equal(env.EMAIL.messages.length, 0);

  const cronEnv = createEnv({ NOTIFY_STATE: failingState() });
  const result = await runScheduled(cronEnv, bundle, NOW);
  assert.deepEqual(result, { sent: false, reason: 'state_error' });
  assert.equal(cronEnv.EMAIL.messages.length, 0);
});

test('a failed send still consumes the daily counter', async () => {
  const env = createEnv({ EMAIL: createEmail({ fail: true }) });
  const response = await post(env);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: 'send_failed' });
  assert.equal(env.EMAIL.messages.length, 0);
  const counter = env.NOTIFY_STATE.puts.find((put) => put.key === SENT_KEY);
  assert.ok(counter, 'counter was not reserved before the send');
  assert.equal(counter.value, '1');
  assert.equal(env.NOTIFY_STATE.store.get(SENT_KEY), '1');

  const cronEnv = createEnv({ EMAIL: createEmail({ fail: true }) });
  const result = await runScheduled(cronEnv, bundle, NOW);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'send_failed');
  assert.equal(cronEnv.NOTIFY_STATE.store.get(SENT_KEY), '1');
});

test('NOTIFY_DAILY_CAP=0 mutes sending through the daily cap', async () => {
  const env = createEnv({ NOTIFY_DAILY_CAP: '0' });
  const response = await post(env);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { ok: false, error: 'rate_limited' });
  assert.equal(env.EMAIL.messages.length, 0);

  const cronEnv = createEnv({ NOTIFY_DAILY_CAP: '0' });
  const result = await runScheduled(cronEnv, bundle, NOW);
  assert.deepEqual(result, { sent: false, reason: 'daily_cap_reached' });
  assert.equal(cronEnv.EMAIL.messages.length, 0);
  assert.equal(cronEnv.NOTIFY_STATE.store.has(DIGEST_KEY), false);
});

test('an unset NOTIFY_DAILY_CAP uses the default cap', async () => {
  const env = createEnv({ NOTIFY_DAILY_CAP: undefined });
  const response = await post(env);
  assert.equal(response.status, 200);
  assert.equal(env.EMAIL.messages.length, 1);
});

test('an invalid NOTIFY_DAILY_CAP is a config failure: 503, no send, nothing stored', async () => {
  for (const value of ['off', '-1', '2.9', ' 5', '5 ', '1e3']) {
    const env = createEnv({ NOTIFY_DAILY_CAP: value });
    const logs = captureLogs();
    let response;
    let result;
    try {
      response = await post(env);
      result = await runScheduled(env, bundle, NOW);
    } finally {
      logs.restore();
    }
    assert.equal(response.status, 503, JSON.stringify(value));
    assertSecurityHeaders(assert, response);
    assert.deepEqual(await response.json(), { ok: false, error: 'unavailable' }, JSON.stringify(value));
    assert.equal(env.EMAIL.messages.length, 0, JSON.stringify(value));
    assert.equal(env.NOTIFY_STATE.puts.length, 0, JSON.stringify(value));
    assert.deepEqual(result, { sent: false, reason: 'invalid_daily_cap' }, JSON.stringify(value));
    assert.ok(
      logs.parsed().some((entry) => entry.reason === 'invalid_daily_cap'),
      `${JSON.stringify(value)}: cron did not log invalid_daily_cap`,
    );
  }
});

test('body validation rejects everything outside the single-key findingId shape', async () => {
  const marker = 'MARKER-should-never-escape-<script>&"\'';
  const cases = [
    { label: 'unknown finding id', body: { findingId: 'R9-not-a-real-id' } },
    { label: 'marker as finding id', body: { findingId: marker } },
    { label: 'extra keys', body: { findingId: bundle.findings[0].id, marker } },
    { label: 'only extra key', body: { marker } },
    { label: 'array body', body: [bundle.findings[0].id] },
    { label: 'null body value', body: 'null' },
    { label: 'string body value', body: '"finding"' },
    { label: 'number body value', body: '42' },
    { label: 'non-JSON', body: 'not json at all' },
    { label: 'wrong content type', body: { findingId: bundle.findings[0].id }, contentType: 'text/plain' },
    { label: 'missing content type', body: { findingId: bundle.findings[0].id }, contentType: null },
    { label: 'oversized', body: JSON.stringify({ findingId: 'a'.repeat(1100) }) },
    { label: 'findingId too long', body: { findingId: 'a'.repeat(129) } },
    { label: 'findingId bad characters', body: { findingId: 'has space' } },
  ];
  for (const { label, body, contentType } of cases) {
    const env = createEnv();
    const logs = captureLogs();
    let response;
    let text;
    try {
      response = await post(env, { body, contentType });
      text = await response.text();
    } finally {
      logs.restore();
    }
    assert.equal(response.status, 400, label);
    assertSecurityHeaders(assert, response);
    assert.deepEqual(JSON.parse(text), { ok: false, error: 'invalid_request' }, label);
    assert.equal(env.EMAIL.messages.length, 0, label);
    assert.ok(!text.includes(marker), `${label}: response echoed the body`);
    assert.ok(!logs.lines.join('\n').includes(marker), `${label}: logs echoed the body`);
  }
});

test('an absent, empty, or empty-object body sends the summary', async () => {
  for (const options of [{}, { body: '' }, { body: {} }]) {
    const env = createEnv();
    const response = await post(env, options);
    assert.equal(response.status, 200);
    assert.equal(env.EMAIL.messages.length, 1);
    assert.match(env.EMAIL.messages[0].text, /FarmBot findings summary/);
  }
});

test('a bundled findingId sends only that finding', async () => {
  const finding = bundle.findings[3];
  const env = createEnv();
  const response = await post(env, { body: { findingId: finding.id } });
  assert.equal(response.status, 200);
  const message = env.EMAIL.messages[0];
  assert.match(message.subject, new RegExp(finding.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(message.text.includes(finding.summary));
  assert.ok(!message.text.includes('Top findings'));
});

test('method and path rules: 405 for non-POST, 404 for other /api paths', async () => {
  for (const method of ['GET', 'OPTIONS', 'HEAD', 'PUT', 'DELETE']) {
    const env = createEnv();
    const response = await post(env, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'POST', method);
    assertSecurityHeaders(assert, response);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  for (const path of ['/api/other', '/api/notify/test/', '/api', '/api/']) {
    const env = createEnv();
    const response = await post(env, { path });
    assert.equal(response.status, 404, path);
    assertSecurityHeaders(assert, response);
  }
});

test('a successful response body is exactly {"ok":true}', async () => {
  const env = createEnv();
  const response = await post(env);
  assertSecurityHeaders(assert, response);
  const body = await response.json();
  assert.deepEqual(body, { ok: true });
  assert.deepEqual(Object.keys(body), ['ok']);
});

test('every Worker-generated status carries the security headers', async () => {
  const scenarios = [
    ['200', () => post(createEnv())],
    ['400', () => post(createEnv(), { body: { findingId: 'missing' } })],
    ['401', () => post(createEnv(), { token: null })],
    ['404', () => post(createEnv(), { path: '/api/nope' })],
    ['405', () => post(createEnv(), { method: 'GET' })],
    ['429 client', () => post(createEnv({ NOTIFY_CLIENT_LIMITER: createLimiter(false) }))],
    ['429 global', () => post(createEnv({ NOTIFY_GLOBAL_LIMITER: createLimiter(false) }))],
    ['429 cap', () => post(createEnv({ NOTIFY_STATE: createKv({ [SENT_KEY]: '10' }) }))],
    ['503 config', () => post(createEnv({ NOTIFY_TO: undefined }))],
    ['503 cap config', () => post(createEnv({ NOTIFY_DAILY_CAP: 'off' }))],
    ['503 binding', () => post(createEnv({ NOTIFY_CLIENT_LIMITER: undefined }))],
  ];
  for (const [label, run] of scenarios) {
    const response = await run();
    assertSecurityHeaders(assert, response);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
      `${label}: no CORS`,
    );
  }
});

test('the test endpoint never updates the stored findings digest', async () => {
  const previous = `farmbot-findings-v1 sha256:${'1'.repeat(64)}`;
  const env = createEnv({ NOTIFY_STATE: createKv({ [DIGEST_KEY]: previous }) });
  const response = await post(env);
  assert.equal(response.status, 200);
  assert.equal(env.NOTIFY_STATE.store.get(DIGEST_KEY), previous);
  assert.ok(env.NOTIFY_STATE.puts.every((put) => put.key !== DIGEST_KEY));

  const empty = createEnv();
  await post(empty);
  assert.equal(empty.NOTIFY_STATE.store.has(DIGEST_KEY), false);
});

test('scheduled sends once per digest, skips unchanged digests, and re-sends on change', async () => {
  const env = createEnv();
  const first = await runScheduled(env, bundle, NOW);
  assert.deepEqual(first, { sent: true, storedDigest: true });
  assert.equal(env.EMAIL.messages.length, 1);
  assert.equal(env.NOTIFY_STATE.store.get(DIGEST_KEY), bundle.findingsDigest);

  const second = await runScheduled(env, bundle, NOW);
  assert.deepEqual(second, { sent: false, reason: 'unchanged' });
  assert.equal(env.EMAIL.messages.length, 1);
  assert.equal(env.NOTIFY_STATE.puts.filter((put) => put.key === DIGEST_KEY).length, 1);

  const changed = cloneBundle({ findingsDigest: `farmbot-findings-v1 sha256:${'2'.repeat(64)}` });
  const third = await runScheduled(env, changed, NOW);
  assert.deepEqual(third, { sent: true, storedDigest: true });
  assert.equal(env.EMAIL.messages.length, 2);
  assert.equal(env.NOTIFY_STATE.store.get(DIGEST_KEY), changed.findingsDigest);
});

test('a failed scheduled send does not store the digest and retries next run', async () => {
  const email = { messages: [], fail: true, async send(message) { if (this.fail) throw new Error('nope'); this.messages.push(message); } };
  const env = createEnv({ EMAIL: email });
  const failed = await runScheduled(env, bundle, NOW);
  assert.equal(failed.sent, false);
  assert.equal(env.NOTIFY_STATE.store.has(DIGEST_KEY), false);
  // The daily counter was reserved before the send failed, so only the digest
  // write is absent.
  assert.ok(env.NOTIFY_STATE.puts.every((put) => put.key !== DIGEST_KEY));
  assert.equal(env.NOTIFY_STATE.store.get(SENT_KEY), '1');

  email.fail = false;
  const retried = await runScheduled(env, bundle, NOW);
  assert.equal(retried.sent, true);
  assert.equal(env.NOTIFY_STATE.store.get(DIGEST_KEY), bundle.findingsDigest);
  assert.equal(env.NOTIFY_STATE.store.get(SENT_KEY), '2');
});

test('scheduled respects the global limiter and daily cap without storing the digest', async () => {
  const limited = createEnv({ NOTIFY_GLOBAL_LIMITER: createLimiter(false) });
  assert.equal((await runScheduled(limited, bundle, NOW)).sent, false);
  assert.equal(limited.NOTIFY_STATE.store.has(DIGEST_KEY), false);

  const capped = createEnv({ NOTIFY_STATE: createKv({ [SENT_KEY]: '10' }) });
  assert.equal((await runScheduled(capped, bundle, NOW)).sent, false);
  assert.equal(capped.EMAIL.messages.length, 0);
  assert.equal(capped.NOTIFY_STATE.store.has(DIGEST_KEY), false);
});

test('logs are structured JSON and never contain addresses or the token', async () => {
  const env = createEnv();
  const logs = captureLogs();
  try {
    await post(env);
    await runScheduled(env, bundle, NOW);
  } finally {
    logs.restore();
  }
  assert.ok(logs.lines.length > 0);
  for (const line of logs.lines) {
    const parsed = JSON.parse(line);
    assert.equal(typeof parsed.event, 'string');
  }
  const joined = logs.lines.join('\n');
  for (const secret of [NOTIFY_TO, NOTIFY_FROM, NOTIFY_TOKEN]) {
    assert.ok(!joined.includes(secret), 'logs leaked a secret');
  }
  assert.ok(!/authorization/i.test(joined));
});

test('an unexpected internal failure returns a 500 without leaking details', async () => {
  const env = createEnv({
    NOTIFY_CLIENT_LIMITER: {
      async limit() {
        throw new Error(`boom ${NOTIFY_TOKEN}`);
      },
    },
  });
  const logs = captureLogs();
  let response;
  try {
    response = await post(env);
  } finally {
    logs.restore();
  }
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.ok(!text.includes(NOTIFY_TOKEN));
  assert.ok(!logs.lines.join('\n').includes(NOTIFY_TOKEN));
});

test('the notify path constant matches the configured endpoint', () => {
  assert.equal(NOTIFY_PATH, '/api/notify/test');
});
