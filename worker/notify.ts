// Pure notification logic for the Worker.
//
// Everything here takes its environment and dependencies as arguments so it can
// run under `node --experimental-strip-types` with stubbed EMAIL/KV/limiter
// bindings. `worker/index.ts` is a thin adapter around these functions.
//
// Content comes only from the build-time bundle. Request bodies can select one
// finding id from that bundle, and nothing else. This module never imports Node
// built-ins and uses only erasable TypeScript syntax.

export interface NotifyFinding {
  readonly id: string;
  readonly rule: string;
  readonly severity: string;
  readonly severityScore: number;
  readonly summary: string;
}

export interface NotifyRule {
  readonly id: string;
  readonly title: string;
}

export interface NotifyBundle {
  readonly format: string;
  readonly findingsDigest: string;
  readonly severityCounts: Readonly<Record<string, number>>;
  readonly findings: readonly NotifyFinding[];
  readonly rules: readonly NotifyRule[];
}

export interface EmailMessage {
  readonly to: string;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface EmailBinding {
  send(message: EmailMessage): Promise<unknown>;
}

export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface NotifyEnv {
  readonly EMAIL?: EmailBinding;
  readonly NOTIFY_STATE?: KvBinding;
  readonly NOTIFY_GLOBAL_LIMITER?: RateLimitBinding;
  readonly NOTIFY_CLIENT_LIMITER?: RateLimitBinding;
  readonly NOTIFY_TO?: string;
  readonly NOTIFY_FROM?: string;
  readonly NOTIFY_TOKEN?: string;
  readonly PUBLIC_BASE_URL?: string;
  readonly NOTIFY_DAILY_CAP?: string;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface ScheduledResult {
  readonly sent: boolean;
  readonly reason?: string;
  readonly storedDigest?: boolean;
}

export const NOTIFY_PATH = '/api/notify/test';
export const DIGEST_KEY = 'findings-digest';
export const GLOBAL_LIMITER_KEY = 'notify-global';
export const CLIENT_LIMITER_FALLBACK_KEY = 'unknown';
export const DAILY_CAP_DEFAULT = 10;
export const DAILY_CAP_TTL_SECONDS = 2 * 24 * 60 * 60;
export const MAX_BODY_BYTES = 1024;
export const FINDING_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
export const DAILY_CAP_PATTERN = /^\d+$/;

const SEVERITY_RANK: Readonly<Record<string, number>> = {
  action: 0,
  review: 1,
  info: 2,
};
const UNKNOWN_SEVERITY_RANK = 3;
const TOP_FINDING_LIMIT = 10;

const WORKER_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

const textEncoder = new TextEncoder();

function logEvent(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...details }));
}

function respond(status: number, body: Record<string, unknown>, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...WORKER_HEADERS, ...extraHeaders },
  });
}

function reject(status: number, error: string, reason: string, extraHeaders?: Record<string, string>): Response {
  logEvent('notify.rejected', { status, reason });
  return respond(status, { ok: false, error }, extraHeaders);
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Escape the five HTML-significant characters; order matters for `&`. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Constant-time string comparison that works in both Node and workerd.
 * Both inputs are hashed to 32-byte digests, then compared with an
 * XOR-accumulate loop so the running time does not depend on the first
 * differing byte. Length differences do not leak through the digest size.
 */
export async function timingSafeEqualStrings(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(left)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(right)),
  ]);
  const a = new Uint8Array(leftDigest);
  const b = new Uint8Array(rightDigest);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function severityRank(severity: string): number {
  return Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity)
    ? SEVERITY_RANK[severity]
    : UNKNOWN_SEVERITY_RANK;
}

/**
 * Rank action > review > info, then severityScore descending, then id ascending.
 * Duplicate ids are collapsed so an email never lists the same finding twice.
 */
export function rankFindings(findings: readonly NotifyFinding[]): NotifyFinding[] {
  const sorted = [...findings].sort((left, right) => {
    const rankDifference = severityRank(left.severity) - severityRank(right.severity);
    if (rankDifference !== 0) return rankDifference;
    if (left.severityScore !== right.severityScore) return right.severityScore - left.severityScore;
    return codeUnitCompare(left.id, right.id);
  });
  const seen = new Set<string>();
  const ranked: NotifyFinding[] = [];
  for (const finding of sorted) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);
    ranked.push(finding);
    if (ranked.length === TOP_FINDING_LIMIT) break;
  }
  return ranked;
}

/** Clean a subject line defensively. Subjects only ever contain bundle data. */
function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ').trim();
}

export function deepLink(baseUrl: string, findingId: string): string {
  return `${baseUrl}/farmbot/#finding=${encodeURIComponent(findingId)}`;
}

function summaryCounts(bundle: NotifyBundle): { action: number; review: number; info: number } {
  const counts = bundle.severityCounts ?? {};
  const read = (severity: string): number => {
    const value = counts[severity];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  };
  return { action: read('action'), review: read('review'), info: read('info') };
}

function summarySubject(bundle: NotifyBundle): string {
  const counts = summaryCounts(bundle);
  return cleanSubject(
    `FarmBot findings: ${counts.action} action, ${counts.review} review, ${counts.info} info`,
  );
}

/** Render the digest summary. Every interpolated value is escaped in HTML. */
export function renderSummary(bundle: NotifyBundle, baseUrl: string): RenderedEmail {
  const counts = summaryCounts(bundle);
  const top = rankFindings(bundle.findings);
  const subject = summarySubject(bundle);

  const textLines = [
    'FarmBot findings summary',
    '',
    `Source digest: ${bundle.findingsDigest}`,
    '',
    'Counts',
    `- action: ${counts.action}`,
    `- review: ${counts.review}`,
    `- info: ${counts.info}`,
    '',
    `Top findings (up to ${TOP_FINDING_LIMIT})`,
  ];
  if (top.length === 0) {
    textLines.push('- none');
  } else {
    for (const finding of top) {
      textLines.push(
        `- [${finding.severity}] ${finding.id}: ${finding.summary}`,
        `  ${deepLink(baseUrl, finding.id)}`,
      );
    }
  }
  const text = `${textLines.join('\n')}\n`;

  const listItems = top
    .map(
      (finding) =>
        `<li><strong>${escapeHtml(finding.severity)}</strong> ` +
        `<code>${escapeHtml(finding.id)}</code>: ${escapeHtml(finding.summary)}<br>` +
        `<a href="${escapeHtml(deepLink(baseUrl, finding.id))}">` +
        `${escapeHtml(deepLink(baseUrl, finding.id))}</a></li>`,
    )
    .join('');
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(subject)}</title></head><body>` +
    '<h1>FarmBot findings summary</h1>' +
    `<p>Source digest: <code>${escapeHtml(bundle.findingsDigest)}</code></p>` +
    '<ul>' +
    `<li>action: ${escapeHtml(counts.action)}</li>` +
    `<li>review: ${escapeHtml(counts.review)}</li>` +
    `<li>info: ${escapeHtml(counts.info)}</li>` +
    '</ul>' +
    `<h2>Top findings (up to ${escapeHtml(TOP_FINDING_LIMIT)})</h2>` +
    (top.length === 0 ? '<p>none</p>' : `<ul>${listItems}</ul>`) +
    '</body></html>';

  return { subject, text, html };
}

/** Render one bundled finding, or `null` when the id is not in the bundle. */
export function renderFinding(bundle: NotifyBundle, baseUrl: string, findingId: string): RenderedEmail | null {
  const finding = bundle.findings.find((candidate) => candidate.id === findingId);
  if (!finding) return null;
  const rule = bundle.rules.find((candidate) => candidate.id === finding.rule);
  const ruleTitle = rule ? rule.title : '';
  const link = deepLink(baseUrl, finding.id);
  const subject = cleanSubject(`FarmBot finding: ${finding.id}`);

  const textLines = [
    `FarmBot finding: ${finding.id}`,
    '',
    `Rule: ${finding.rule}${ruleTitle ? ` (${ruleTitle})` : ''}`,
    `Severity: ${finding.severity} (score ${finding.severityScore})`,
    '',
    finding.summary,
    '',
    link,
    '',
  ];
  const text = textLines.join('\n');

  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(subject)}</title></head><body>` +
    `<h1>FarmBot finding: <code>${escapeHtml(finding.id)}</code></h1>` +
    `<p>Rule: <code>${escapeHtml(finding.rule)}</code>` +
    (ruleTitle ? ` (${escapeHtml(ruleTitle)})` : '') +
    '</p>' +
    `<p>Severity: <strong>${escapeHtml(finding.severity)}</strong> ` +
    `(score ${escapeHtml(finding.severityScore)})</p>` +
    `<p>${escapeHtml(finding.summary)}</p>` +
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    '</body></html>';

  return { subject, text, html };
}

interface NotifyConfig {
  readonly to: string;
  readonly from: string;
  readonly baseUrl: string;
  readonly dailyCap: number;
}

type ConfigResult = { ok: true; config: NotifyConfig } | { ok: false; reason: string };

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Accept a bare `https://host` origin only. A single trailing slash is
 * normalized away; any other path, a query, a hash, credentials, or a
 * non-https scheme is rejected. Returns the origin (no trailing slash).
 */
export function normalizeBaseUrl(value: unknown): string | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  if (raw.includes('?') || raw.includes('#')) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.pathname !== '/') return null;
  if (url.search !== '' || url.hash !== '') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.hostname === '') return null;
  return url.origin;
}

/**
 * Parse NOTIFY_DAILY_CAP. Missing or empty means the default. A non-empty value
 * must be exactly ASCII digits: no sign, decimal point, exponent, or surrounding
 * whitespace. `null` means the configuration is invalid, which is a hard failure
 * rather than a silent fallback. `"0"` is valid and mutes sending through the
 * cap.
 */
export function dailyCapFromEnv(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return DAILY_CAP_DEFAULT;
  if (typeof value !== 'string') return null;
  if (!DAILY_CAP_PATTERN.test(value)) return null;
  return Number(value);
}

export function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function dailyCapKey(now: Date): string {
  return `sent:${utcDateKey(now)}`;
}

function hasEmailBinding(env: NotifyEnv): boolean {
  return Boolean(env.EMAIL) && typeof env.EMAIL?.send === 'function';
}

function hasKvBinding(env: NotifyEnv): boolean {
  return Boolean(env.NOTIFY_STATE) && typeof env.NOTIFY_STATE?.get === 'function' && typeof env.NOTIFY_STATE?.put === 'function';
}

function hasLimiter(binding: RateLimitBinding | undefined): binding is RateLimitBinding {
  return Boolean(binding) && typeof binding?.limit === 'function';
}

function resolveConfig(env: NotifyEnv): ConfigResult {
  if (!hasEmailBinding(env)) return { ok: false, reason: 'missing_email_binding' };
  if (!hasKvBinding(env)) return { ok: false, reason: 'missing_kv_binding' };
  if (!hasLimiter(env.NOTIFY_GLOBAL_LIMITER)) return { ok: false, reason: 'missing_global_limiter' };
  if (!hasLimiter(env.NOTIFY_CLIENT_LIMITER)) return { ok: false, reason: 'missing_client_limiter' };
  const to = nonEmptyString(env.NOTIFY_TO);
  if (!to) return { ok: false, reason: 'missing_recipient' };
  const from = nonEmptyString(env.NOTIFY_FROM);
  if (!from) return { ok: false, reason: 'missing_sender' };
  const baseUrl = normalizeBaseUrl(env.PUBLIC_BASE_URL);
  if (!baseUrl) return { ok: false, reason: 'invalid_public_base_url' };
  const dailyCap = dailyCapFromEnv(env.NOTIFY_DAILY_CAP);
  if (dailyCap === null) return { ok: false, reason: 'invalid_daily_cap' };
  return {
    ok: true,
    config: {
      to,
      from,
      baseUrl,
      dailyCap,
    },
  };
}

export type BodyResult =
  | { ok: true; findingId: string | null }
  | { ok: false; reason: string };

async function readBodyWithCap(request: Request): Promise<Uint8Array | null> {
  const body = request.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed; nothing else to do.
      }
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function isJsonContentType(header: string | null): boolean {
  if (typeof header !== 'string') return false;
  const [mediaType] = header.split(';');
  return mediaType.trim().toLowerCase() === 'application/json';
}

/**
 * Validate an optional body. Allowed shape: a JSON object with the single key
 * `findingId`, whose value is a bundled finding id. Anything else is a fixed
 * 400; body values are never echoed or logged.
 */
export async function parseRequestBody(request: Request, bundle: NotifyBundle): Promise<BodyResult> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readBodyWithCap(request);
  } catch {
    return { ok: false, reason: 'unreadable_body' };
  }
  if (bytes === null) return { ok: false, reason: 'body_too_large' };
  if (bytes.byteLength === 0) return { ok: true, findingId: null };
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return { ok: false, reason: 'wrong_content_type' };
  }
  let parsed: unknown;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    parsed = JSON.parse(decoded);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid_shape' };
  }
  const keys = Object.keys(parsed);
  if (keys.length === 0) return { ok: true, findingId: null };
  if (keys.length !== 1 || keys[0] !== 'findingId') {
    return { ok: false, reason: 'invalid_keys' };
  }
  const findingId = (parsed as { findingId?: unknown }).findingId;
  if (typeof findingId !== 'string' || !FINDING_ID_PATTERN.test(findingId)) {
    return { ok: false, reason: 'invalid_finding_id' };
  }
  if (!bundle.findings.some((finding) => finding.id === findingId)) {
    return { ok: false, reason: 'unknown_finding_id' };
  }
  return { ok: true, findingId };
}

function parseBearerToken(header: string | null): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer (\S+)$/i.exec(header);
  return match ? match[1] : null;
}

async function authenticate(request: Request, env: NotifyEnv): Promise<boolean> {
  const configured = env.NOTIFY_TOKEN;
  if (typeof configured !== 'string' || configured.length < 32) return false;
  const supplied = parseBearerToken(request.headers.get('Authorization'));
  if (supplied === null) return false;
  return timingSafeEqualStrings(configured, supplied);
}

interface DeliveryResult {
  readonly ok: boolean;
  readonly status: number;
  readonly reason: string;
}

function parseCount(value: string | null): number {
  if (typeof value !== 'string') return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Shared send path for cron and the endpoint: global limiter, KV daily cap,
 * then EMAIL.send. The counter is reserved (written) before the send so a
 * retried or concurrent request cannot spend the same slot twice; a failed
 * send keeps the reservation because the message may still have reached the
 * provider. `to` and `from` come only from the resolved config.
 *
 * The KV daily cap is best effort, not strict: KV is eventually consistent and
 * rate-limit bindings are scoped per location, so the cap is not enforced
 * across all Cloudflare locations.
 */
async function deliver(
  env: NotifyEnv,
  config: NotifyConfig,
  now: Date,
  message: RenderedEmail,
): Promise<DeliveryResult> {
  const email = env.EMAIL;
  const state = env.NOTIFY_STATE;
  const globalLimiter = env.NOTIFY_GLOBAL_LIMITER;
  if (
    !email ||
    typeof email.send !== 'function' ||
    !state ||
    typeof state.get !== 'function' ||
    typeof state.put !== 'function' ||
    !hasLimiter(globalLimiter)
  ) {
    return { ok: false, status: 503, reason: 'unavailable' };
  }
  let globalResult: { success: boolean };
  try {
    globalResult = await globalLimiter.limit({ key: GLOBAL_LIMITER_KEY });
  } catch {
    return { ok: false, status: 503, reason: 'limiter_error' };
  }
  if (!globalResult || globalResult.success !== true) {
    return { ok: false, status: 429, reason: 'rate_limited' };
  }

  const capKey = dailyCapKey(now);
  let storedCount: string | null;
  try {
    storedCount = await state.get(capKey);
  } catch {
    return { ok: false, status: 503, reason: 'state_error' };
  }
  const sentToday = parseCount(storedCount);
  if (sentToday >= config.dailyCap) {
    return { ok: false, status: 429, reason: 'daily_cap_reached' };
  }

  try {
    await state.put(capKey, String(sentToday + 1), {
      expirationTtl: DAILY_CAP_TTL_SECONDS,
    });
  } catch {
    // Without a reserved slot the send is refused; this fails closed.
    logEvent('notify.counter_write_failed', {});
    return { ok: false, status: 503, reason: 'state_error' };
  }

  try {
    await email.send({
      to: config.to,
      from: config.from,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch {
    // The reservation is intentionally kept: a send that failed may still have
    // reached the provider, so it stays counted against the day's cap.
    return { ok: false, status: 502, reason: 'send_failed' };
  }

  return { ok: true, status: 200, reason: 'sent' };
}

/**
 * Owner-only notification test endpoint.
 *
 * Order is fixed and fail-closed:
 * path/method -> per-client limiter -> auth -> body -> config -> global
 * limiter -> daily cap (reserve, then send). The stored findings digest is
 * never updated.
 */
export async function handleNotifyRequest(
  request: Request,
  env: NotifyEnv,
  bundle: NotifyBundle,
  now: Date = new Date(),
): Promise<Response> {
  try {
    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return reject(400, 'invalid_request', 'invalid_url');
    }
    if (pathname !== NOTIFY_PATH) {
      return reject(404, 'not_found', 'unknown_path');
    }
    if (request.method !== 'POST') {
      return reject(405, 'method_not_allowed', 'method', { Allow: 'POST' });
    }

    if (!hasLimiter(env.NOTIFY_CLIENT_LIMITER)) {
      return reject(503, 'unavailable', 'missing_client_limiter');
    }
    const clientKey = request.headers.get('CF-Connecting-IP')?.trim() || CLIENT_LIMITER_FALLBACK_KEY;
    let clientResult: { success: boolean };
    try {
      clientResult = await env.NOTIFY_CLIENT_LIMITER.limit({ key: clientKey });
    } catch {
      return reject(503, 'unavailable', 'client_limiter_error');
    }
    if (!clientResult || clientResult.success !== true) {
      return reject(429, 'rate_limited', 'client_limiter');
    }

    if (!(await authenticate(request, env))) {
      return reject(401, 'unauthorized', 'auth');
    }

    const body = await parseRequestBody(request, bundle);
    if (!body.ok) {
      return reject(400, 'invalid_request', body.reason);
    }

    const resolved = resolveConfig(env);
    if (!resolved.ok) {
      return reject(503, 'unavailable', resolved.reason);
    }

    const rendered =
      body.findingId === null
        ? renderSummary(bundle, resolved.config.baseUrl)
        : renderFinding(bundle, resolved.config.baseUrl, body.findingId);
    if (!rendered) {
      return reject(400, 'invalid_request', 'unknown_finding_id');
    }

    const delivered = await deliver(env, resolved.config, now, rendered);
    if (!delivered.ok) {
      const error =
        delivered.status === 429
          ? 'rate_limited'
          : delivered.status === 502
            ? 'send_failed'
            : 'unavailable';
      return reject(delivered.status, error, delivered.reason);
    }
    logEvent('notify.sent', { source: 'endpoint', kind: body.findingId === null ? 'summary' : 'finding' });
    return respond(200, { ok: true });
  } catch {
    logEvent('notify.error', { source: 'endpoint', stage: 'unexpected' });
    return respond(500, { ok: false, error: 'server_error' });
  }
}

/**
 * Hourly cron entry point. Sends one summary when the bundled digest differs
 * from the last stored digest, then stores the new digest. A failed send (or a
 * limiter/cap refusal, or missing config) leaves the stored digest untouched so
 * the next run retries.
 */
export async function runScheduled(
  env: NotifyEnv,
  bundle: NotifyBundle,
  now: Date = new Date(),
): Promise<ScheduledResult> {
  try {
    const resolved = resolveConfig(env);
    if (!resolved.ok) {
      logEvent('notify.skipped', { source: 'cron', reason: resolved.reason });
      return { sent: false, reason: resolved.reason };
    }

    const state = env.NOTIFY_STATE;
    if (!state || typeof state.get !== 'function' || typeof state.put !== 'function') {
      logEvent('notify.skipped', { source: 'cron', reason: 'missing_kv_binding' });
      return { sent: false, reason: 'missing_kv_binding' };
    }

    let lastDigest: string | null;
    try {
      lastDigest = await state.get(DIGEST_KEY);
    } catch {
      logEvent('notify.skipped', { source: 'cron', reason: 'state_error' });
      return { sent: false, reason: 'state_error' };
    }
    if (typeof lastDigest === 'string' && lastDigest.trim() === bundle.findingsDigest) {
      logEvent('notify.skipped', { source: 'cron', reason: 'unchanged' });
      return { sent: false, reason: 'unchanged' };
    }

    const rendered = renderSummary(bundle, resolved.config.baseUrl);
    const delivered = await deliver(env, resolved.config, now, rendered);
    if (!delivered.ok) {
      logEvent('notify.skipped', { source: 'cron', reason: delivered.reason });
      return { sent: false, reason: delivered.reason };
    }

    try {
      await state.put(DIGEST_KEY, bundle.findingsDigest);
    } catch {
      logEvent('notify.state_write_failed', { source: 'cron' });
      return { sent: true, reason: 'state_error', storedDigest: false };
    }

    logEvent('notify.sent', { source: 'cron', kind: 'summary' });
    return { sent: true, storedDigest: true };
  } catch {
    logEvent('notify.error', { source: 'cron', stage: 'unexpected' });
    return { sent: false, reason: 'error' };
  }
}
