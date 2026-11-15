// Smoke the real Worker entry with `wrangler dev`, then run the existing
// browser smoke suites against it. This is the CI check that `/` and
// `/farmbot/` still behave exactly as the assets-only build did now that
// `worker/index.ts` exists.
//
// Requires `npm run build` and Playwright Chromium:
//   npx playwright install --with-deps chromium
//   npm run smoke:wrangler
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'farmbot/index.html'))) {
  console.error('dist/ is missing; run `npm run build` before `npm run smoke:wrangler`');
  process.exit(1);
}

const wranglerBin = join(root, 'node_modules', '.bin', 'wrangler');
if (!existsSync(wranglerBin)) {
  console.error(`wrangler is not installed at ${wranglerBin}; run npm ci`);
  process.exit(1);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const port = await freePort();
const base = `http://127.0.0.1:${port}/`;

const wrangler = spawn(
  wranglerBin,
  ['dev', '--config', 'wrangler.jsonc', '--ip', '127.0.0.1', '--port', String(port), '--log-level', 'error'],
  {
    cwd: root,
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  },
);

let output = '';
const record = (chunk) => {
  output += chunk.toString();
  // Keep the buffer bounded if wrangler is chatty.
  if (output.length > 20000) output = output.slice(-20000);
};
wrangler.stdout.on('data', record);
wrangler.stderr.on('data', record);

let exited = false;
let stopping = false;
wrangler.once('exit', (code, signal) => {
  exited = true;
  if (!stopping && code !== 0 && code !== null) {
    console.error(`wrangler dev exited early (code ${code}, signal ${signal})`);
  }
});

async function waitForWorker() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error('wrangler dev exited before becoming ready');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await delay(250);
  }
  throw new Error(`wrangler dev did not answer on ${base} within 120s\n${output}`);
}

function stopWorker() {
  if (exited) return;
  stopping = true;
  try {
    process.kill(-wrangler.pid, 'SIGTERM');
  } catch {
    wrangler.kill('SIGTERM');
  }
}

function run(script) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(root, script)], {
      cwd: root,
      env: { ...process.env, SMOKE_BASE_URL: base },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${script} failed (code ${code}, signal ${signal})`));
    });
  });
}

try {
  console.log(`starting wrangler dev on ${base}`);
  await waitForWorker();
  console.log('worker is ready; running smoke.mjs');
  await run('scripts/smoke.mjs');
  console.log('smoke.mjs passed; running smoke-farmbot.mjs');
  await run('scripts/smoke-farmbot.mjs');
  console.log('smoke:wrangler passed');
} catch (error) {
  console.error(error.message);
  if (output.trim()) console.error(`\n--- wrangler output ---\n${output}`);
  process.exitCode = 1;
} finally {
  stopWorker();
}
