// Lazy boundary for the @mlc-ai/web-llm npm package.
//
// This module is imported dynamically by `webllm.ts` only after the user gives
// consent, so the package and its weights are never loaded on first paint.
// `WEBLLM_PACKAGE_TAG` lets the smoke test find and replace this exact chunk
// with a local stub; it is not user-facing.
//
// Every engine is constructed with the explicit `INTENT_APP_CONFIG` below, so
// `engine.reload(INTENT_MODEL_ID)` can never fall back to WebLLM's default
// `prebuiltAppConfig`, whose URLs track the moving `main` branch and which
// carries no application-level digest. Both entries — desk-fan `/` via
// `webllm.ts` and `/farmbot/` via `check-webllm.ts` — load through this one
// pinned download channel. `scripts/verify.mjs` asserts the URLs, the commit
// SHAs and the SRI digests; it never fetches the artifacts.

import type { AppConfig, ModelRecord } from '@mlc-ai/web-llm';

export const WEBLLM_PACKAGE_TAG = 'ontographia-webllm-package-v1';

/**
 * Commit SHA of huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC (the
 * repo tip when this was pinned). Hugging Face commits are immutable, so the
 * weights can no longer move under the URL.
 */
export const INTENT_MODEL_WEIGHTS_SHA = '2a37b0a5ecb622d51ddc2fac74de0b95872affd7';

/**
 * Commit of github.com/mlc-ai/binary-mlc-llm-libs that added the pinned model
 * library (`[WASM] Add v0_2_87 models`); the blob is identical to current
 * `main`, so this pins the same bytes the npm package's prebuilt record names.
 */
export const INTENT_MODEL_LIB_SHA = '146ed9cd4b4062e967b017fd2291f7106b50599f';

/**
 * Weights URL pinned to the commit SHA. The `/resolve/<sha>/` form WITH the
 * trailing slash makes WebLLM's `cleanModelUrl` use the URL verbatim instead
 * of rewriting it to the moving `resolve/main/`.
 */
export const INTENT_MODEL_URL = `https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/${INTENT_MODEL_WEIGHTS_SHA}/`;

/** Compiled model library (WASM) URL pinned to the adding commit, not `main`. */
export const INTENT_MODEL_LIB_URL = `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${INTENT_MODEL_LIB_SHA}/web-llm-models/v0_2_87/base/Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm`;

/**
 * SRI digests of the pinned artifacts. WebLLM verifies them itself during
 * `reload` and, with `onFailure: "error"`, throws on mismatch, so a mutated
 * artifact fails closed instead of being executed.
 *
 * sha256 of the model_lib WASM (6,295,402 bytes at the pinned commit):
 * 8dbd7e81d39291f2666176b846f36d924a603e9480bac739ee5fc0d22f74b1fd
 */
export const INTENT_MODEL_LIB_SRI = 'sha256-jb1+gdOSkfJmYXa4RvNtkkpgPpSAusc57l/A0i90sf0=';

/**
 * sha256 of `mlc-chat-config.json` at the pinned revision:
 * 0ec513b54b419ad471006430686bdcffaae7102b41f7b0246fbfcde2517acc7f
 */
export const INTENT_CHAT_CONFIG_SRI = 'sha256-DsUTtUtBmtRxAGQwaGvc/6rnECtB97Akb7/N4lF6zH8=';

/**
 * The only model record this application can load. `model_id` mirrors
 * `INTENT_MODEL_ID` in `webllm.ts` (that module stays free of package imports,
 * so the value is repeated here); `scripts/verify.mjs` asserts the two never
 * drift apart. The metadata matches WebLLM's prebuilt record for this model:
 * 879.04 MB VRAM, low-resource, 4096-token context window. The prebuilt record
 * declares no `required_features`, so neither does this one.
 */
export const INTENT_MODEL_RECORD: ModelRecord = {
  model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  model: INTENT_MODEL_URL,
  model_lib: INTENT_MODEL_LIB_URL,
  vram_required_MB: 879.04,
  low_resource_required: true,
  overrides: { context_window_size: 4096 },
  integrity: {
    config: INTENT_CHAT_CONFIG_SRI,
    model_lib: INTENT_MODEL_LIB_SRI,
    onFailure: 'error',
  },
};

/** The explicit appConfig every `createIntentEngine` engine is built with. */
export const INTENT_APP_CONFIG: AppConfig = {
  model_list: [INTENT_MODEL_RECORD],
};

export interface IntentEngineConfig {
  initProgressCallback?: (report: { progress: number; text: string }) => void;
}

export interface IntentEngine {
  reload(modelId: string): Promise<void>;
  unload(): Promise<void>;
  chat: {
    completions: {
      create(request: {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        temperature?: number;
        max_tokens?: number;
        stream?: false;
        response_format?: { type: 'json_object'; schema: string };
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

export async function createIntentEngine(config: IntentEngineConfig): Promise<IntentEngine> {
  const { MLCEngine } = await import('@mlc-ai/web-llm');
  const engine = new MLCEngine({ ...config, appConfig: INTENT_APP_CONFIG });
  // Keeps the build tag in this lazy chunk (the smoke test locates the chunk by
  // it); it is not read by the app.
  (engine as unknown as { __ontographiaPackageTag?: string }).__ontographiaPackageTag =
    WEBLLM_PACKAGE_TAG;
  return engine as unknown as IntentEngine;
}
