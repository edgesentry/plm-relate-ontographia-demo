import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('cancel during engine creation unloads without reload or model-host requests', async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const { loadCheckRoutingModel } = await vite.ssrLoadModule('/src/farmbot/check-webllm.ts');

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
  const loading = loadCheckRoutingModel({
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
