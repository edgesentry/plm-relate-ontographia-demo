// Focused guards for the pinned WebLLM download channel (issue #90).
//
// Both `/` and `/farmbot/` construct their engine through the appConfig
// exported from `src/lib/webllm-package.ts`, so these assertions cover the one
// channel. Nothing here fetches the wasm or the model; only the committed
// constants and package.json are checked. `scripts/verify.mjs` repeats the same
// checks after a production build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Independent copies of the pinned revisions; the test fails if the source
// constants drift from these verified values.
const PINNED_WEIGHTS_SHA = '2a37b0a5ecb622d51ddc2fac74de0b95872affd7';
const PINNED_MODEL_LIB_SHA = '146ed9cd4b4062e967b017fd2291f7106b50599f';
const PINNED_MODEL_URL =
  `https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/${PINNED_WEIGHTS_SHA}/`;
const PINNED_MODEL_LIB_URL =
  `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${PINNED_MODEL_LIB_SHA}` +
  '/web-llm-models/v0_2_87/base/Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm';
const PINNED_MODEL_LIB_SRI = 'sha256-jb1+gdOSkfJmYXa4RvNtkkpgPpSAusc57l/A0i90sf0=';
const PINNED_CHAT_CONFIG_SRI = 'sha256-DsUTtUtBmtRxAGQwaGvc/6rnECtB97Akb7/N4lF6zH8=';

let vite;
let webllmPackage;
let webllm;

before(async () => {
  vite = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  });
  // Load through the real TS modules; the package import inside
  // createIntentEngine is dynamic, so nothing from @mlc-ai/web-llm loads here.
  webllmPackage = await vite.ssrLoadModule('/src/lib/webllm-package.ts');
  webllm = await vite.ssrLoadModule('/src/lib/webllm.ts');
});

after(async () => {
  await vite.close();
});

test('the pinned appConfig lists only the intent model at immutable revisions', () => {
  assert.equal(webllmPackage.INTENT_MODEL_WEIGHTS_SHA, PINNED_WEIGHTS_SHA);
  assert.equal(webllmPackage.INTENT_MODEL_LIB_SHA, PINNED_MODEL_LIB_SHA);
  const records = webllmPackage.INTENT_APP_CONFIG.model_list;
  assert.equal(records.length, 1, 'the appConfig must expose exactly one download channel');
  const record = records[0];
  assert.equal(record.model_id, webllm.INTENT_MODEL_ID);
  assert.equal(record.model, PINNED_MODEL_URL);
  assert.equal(record.model_lib, PINNED_MODEL_LIB_URL);
  assert.equal(new URL(record.model).hostname, 'huggingface.co');
  assert.equal(new URL(record.model_lib).hostname, 'raw.githubusercontent.com');
  for (const [label, url] of [
    ['model', record.model],
    ['model_lib', record.model_lib],
  ]) {
    assert.ok(!url.includes('/main/'), `${label} URL must not track a moving branch: ${url}`);
  }
  // The trailing-slash /resolve/<sha>/ form makes WebLLM's cleanModelUrl keep
  // the URL verbatim instead of rewriting it to the moving resolve/main/.
  assert.match(record.model, /\/resolve\/[0-9a-f]{40}\/$/);
});

test('the pinned record keeps the documented VRAM and context window', () => {
  const record = webllmPackage.INTENT_APP_CONFIG.model_list[0];
  assert.equal(record.vram_required_MB, webllm.INTENT_MODEL_VRAM_MB);
  assert.equal(record.vram_required_MB, 879.04);
  assert.equal(record.low_resource_required, true);
  assert.equal(record.overrides.context_window_size, 4096);
});

test('the pinned record fails closed on a model_lib or config digest mismatch', () => {
  const integrity = webllmPackage.INTENT_APP_CONFIG.model_list[0].integrity;
  assert.equal(integrity.onFailure, 'error');
  assert.equal(integrity.model_lib, PINNED_MODEL_LIB_SRI);
  assert.equal(integrity.config, PINNED_CHAT_CONFIG_SRI);
});

test('package.json exact-pins the WebLLM package version', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    pkg.dependencies['@mlc-ai/web-llm'],
    '0.2.88',
    '@mlc-ai/web-llm must be an exact version, not a caret range',
  );
});
