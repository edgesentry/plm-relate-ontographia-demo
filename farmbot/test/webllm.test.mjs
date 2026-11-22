import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Loads the real TS module through Vite (the existing pattern in
// check-webllm.test.mjs) so the shared abort-aware reload sequence in
// src/lib/webllm.ts runs for real; only engine creation is replaced by the
// test-only createEngine option, so no WebLLM package code runs and no model
// host is contacted.
async function loadWebllmModule(t) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  return vite.ssrLoadModule('/src/lib/webllm.ts');
}

test('cancel between engine creation and reload unloads without reload or model-host requests', async (t) => {
  const { loadIntentModel } = await loadWebllmModule(t);

  let resolveCreation;
  let markCreationStarted;
  const creation = new Promise((resolve) => {
    resolveCreation = resolve;
  });
  const creationStarted = new Promise((resolve) => {
    markCreationStarted = resolve;
  });
  const reloadModels = [];
  const modelRequests = [];
  let unloadCalls = 0;
  const engine = {
    async reload(modelId) {
      reloadModels.push(modelId);
      for (const url of [
        `https://models.test/${encodeURIComponent(modelId)}`,
        `https://model-libraries.test/${encodeURIComponent(modelId)}`,
      ]) {
        modelRequests.push(url);
      }
    },
    async unload() {
      unloadCalls += 1;
    },
  };
  const controller = new AbortController();
  const loading = loadIntentModel({
    signal: controller.signal,
    createEngine,
  });

  // Load through the real TS module, replacing only package creation.
  async function createEngine() {
    markCreationStarted();
    await creation;
    return engine;
  }

  await creationStarted;
  controller.abort();
  const requestsAtCancel = [...modelRequests];
  resolveCreation();

  await assert.rejects(loading, { name: 'AbortError' });
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  assert.equal(unloadCalls, 1);
  assert.deepEqual(reloadModels, []);
  assert.deepEqual(modelRequests, requestsAtCancel);
});

test('cancel during reload unloads the engine and rejects with AbortError', async (t) => {
  const { loadIntentModel, INTENT_MODEL_ID } = await loadWebllmModule(t);

  let resolveReload;
  let markReloadStarted;
  const reload = new Promise((resolve) => {
    resolveReload = resolve;
  });
  const reloadStarted = new Promise((resolve) => {
    markReloadStarted = resolve;
  });
  const reloadModels = [];
  let unloadCalls = 0;
  const engine = {
    async reload(modelId) {
      reloadModels.push(modelId);
      markReloadStarted();
      await reload;
    },
    async unload() {
      unloadCalls += 1;
    },
  };
  const controller = new AbortController();
  const loading = loadIntentModel({
    signal: controller.signal,
    createEngine: async () => engine,
  });

  await reloadStarted;
  controller.abort();
  resolveReload();

  await assert.rejects(loading, { name: 'AbortError' });
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  // One unload from the abort listener and one awaited unload from the
  // post-reload abort check; a cancelled load never returns a live engine.
  assert.equal(unloadCalls, 2);
  assert.deepEqual(reloadModels, [INTENT_MODEL_ID]);
});
