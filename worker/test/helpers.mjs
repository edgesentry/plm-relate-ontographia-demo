// Shared stubs for the Worker notification tests.
//
// Everything is in-memory: no network, no real email addresses, no real KV.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');
export const generatedBundlePath = join(root, 'worker/generated/notify-bundle.json');
export const generatedBundle = readFileSync(generatedBundlePath, 'utf8');
export const bundle = JSON.parse(generatedBundle);

// Obviously fake addresses and a random per-run token (48 hex characters).
export const NOTIFY_TO = 'owner@example.invalid';
export const NOTIFY_FROM = 'notifier@example.invalid';
export const NOTIFY_TOKEN = randomBytes(24).toString('hex');
export const PUBLIC_BASE_URL = 'https://demo.example.invalid';
export const NOTIFY_PATH = '/api/notify/test';

export function createKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  const puts = [];
  return {
    store,
    puts,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      puts.push({ key, value, options });
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

export function createLimiter(success = true) {
  const calls = [];
  return {
    calls,
    setSuccess(next) {
      this.success = next;
    },
    success,
    async limit(options) {
      calls.push(options);
      return { success: this.success };
    },
  };
}

export function createEmail({ fail = false } = {}) {
  return {
    messages: [],
    fail,
    async send(message) {
      if (this.fail) throw new Error('stub email failure');
      this.messages.push(message);
      return { messageId: 'stub-message' };
    },
  };
}

export function createEnv(overrides = {}) {
  return {
    EMAIL: createEmail(),
    NOTIFY_STATE: createKv(),
    NOTIFY_GLOBAL_LIMITER: createLimiter(true),
    NOTIFY_CLIENT_LIMITER: createLimiter(true),
    NOTIFY_TO,
    NOTIFY_FROM,
    NOTIFY_TOKEN,
    PUBLIC_BASE_URL,
    NOTIFY_DAILY_CAP: '10',
    ...overrides,
  };
}

export function makeRequest({
  method = 'POST',
  path = NOTIFY_PATH,
  token = NOTIFY_TOKEN,
  headers = {},
  body,
  contentType = 'application/json',
  ip,
} = {}) {
  const allHeaders = { ...headers };
  if (token !== null && allHeaders.Authorization === undefined) {
    allHeaders.Authorization = `Bearer ${token}`;
  }
  if (ip !== undefined) allHeaders['CF-Connecting-IP'] = ip;
  let requestBody;
  if (body !== undefined) {
    requestBody = typeof body === 'string' ? body : JSON.stringify(body);
    if (contentType !== null) allHeaders['Content-Type'] = contentType;
  }
  return new Request(`https://demo.example.invalid${path}`, {
    method,
    headers: allHeaders,
    body: requestBody,
  });
}

/** Capture every console.log line; structured logs are newline-delimited JSON. */
export function captureLogs() {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.map((value) => String(value)).join(' '));
  };
  return {
    lines,
    restore() {
      console.log = original;
    },
    parsed() {
      return lines.map((line) => JSON.parse(line));
    },
  };
}

export function assertSecurityHeaders(assert, response) {
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(
    response.headers.get('content-security-policy'),
    "default-src 'none'; frame-ancestors 'none'",
  );
  assert.equal(response.headers.get('access-control-allow-origin'), null);
}

/** Deterministic shuffle so a failure is reproducible. */
export function shuffled(items, seed) {
  const copy = [...items];
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function cloneBundle(overrides = {}) {
  return { ...bundle, ...overrides };
}
