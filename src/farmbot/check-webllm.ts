// FarmBot-specific use of the shared lazy WebLLM package boundary.
// The desk-fan prompt, templates and generator are deliberately not changed.
import {
  INTENT_MODEL_DOWNLOAD_BYTES,
  INTENT_MODEL_ID,
  INTENT_MODEL_VRAM_MB,
  modelLoadAbortError,
  reloadModelWithAbort,
} from '../lib/webllm';
import { allowedValues } from './data';
import { CHECK_ROUTING_JSON_SCHEMA } from './check-routing.mjs';
import {
  buildCheckRoutingSystemPrompt,
  buildCheckRoutingUserMessage,
} from './check-routing-prompt.mjs';

export {
  INTENT_MODEL_DOWNLOAD_BYTES,
  INTENT_MODEL_ID,
  INTENT_MODEL_VRAM_MB,
};

export interface CheckModelLoadOptions {
  signal?: AbortSignal;
  onProgress?: (report: { progress: number; text: string }) => void;
  /** Test-only factory; production keeps the consent-gated lazy package import. */
  createEngine?: typeof import('../lib/webllm-package').createIntentEngine;
}

export interface LoadedCheckModel {
  generate(text: string): Promise<string>;
  unload(): Promise<void>;
}

export const CHECK_ROUTING_SYSTEM_PROMPT = buildCheckRoutingSystemPrompt(allowedValues);

/** Nothing is imported from the WebLLM package until this function is called. */
export async function loadCheckRoutingModel(
  options: CheckModelLoadOptions = {},
): Promise<LoadedCheckModel> {
  const { signal } = options;
  if (signal?.aborted) throw modelLoadAbortError();

  const pkg = options.createEngine
    ? { createIntentEngine: options.createEngine }
    : await import('../lib/webllm-package');
  if (signal?.aborted) throw modelLoadAbortError();

  const engine = await pkg.createIntentEngine({
    initProgressCallback: (report) => {
      if (signal?.aborted) return;
      const progress = Number.isFinite(report.progress)
        ? Math.min(1, Math.max(0, report.progress))
        : 0;
      options.onProgress?.({ progress, text: report.text });
    },
  });

  // Shared abort-aware reload; identical to the desk-fan `loadIntentModel` path.
  await reloadModelWithAbort(engine, INTENT_MODEL_ID, signal);

  return {
    async generate(text: string): Promise<string> {
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: CHECK_ROUTING_SYSTEM_PROMPT },
          { role: 'user', content: buildCheckRoutingUserMessage(text) },
        ],
        temperature: 0,
        max_tokens: 256,
        stream: false,
        response_format: {
          type: 'json_object',
          schema: JSON.stringify(CHECK_ROUTING_JSON_SCHEMA),
        },
      });
      const content = completion.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('The model returned no routing JSON.');
      }
      return content;
    },
    async unload(): Promise<void> {
      await engine.unload();
    },
  };
}
