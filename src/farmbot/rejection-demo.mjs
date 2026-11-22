// Validator input for the rejection demonstration on /farmbot/ only: this fixed
// string is never a query to be executed and never a model result. The screen
// feeds it through the same closed routing parser that checks model text.
import { prepareCheckProposal } from './check-routing.mjs';

export const REJECTED_ROUTING_DEMO_TEXT = 'MATCH (part:Part) RETURN part';
export const REJECTED_ROUTING_DEMO_ID = 'cypher-output';

export const REJECTION_DEMO_UNEXPECTED_DETAIL =
  'The rejection demonstration fixture was unexpectedly accepted.';

/** Restore phase the same way as selectChip: only 'generating' returns to 'ready'. */
export function phaseAfterRejectionDemo(phase) {
  return phase === 'generating' ? 'ready' : phase;
}

/**
 * Production-path demo helper. The compiler is never passed, and the result
 * never asks the UI to increment compileAttempts, even if `text` unexpectedly
 * validates and would otherwise reach compile.
 */
export function prepareRejectionDemo(text, { allowedValues, checkIntents, ontology }) {
  const prepared = prepareCheckProposal(text, {
    allowedValues,
    checkIntents,
    compiler: null,
    ontology,
  });
  if (prepared.ok || prepared.stage === 'compile') {
    return {
      kind: 'validation',
      detail: REJECTION_DEMO_UNEXPECTED_DETAIL,
      sample: text,
      compileAttemptsDelta: 0,
    };
  }
  return {
    kind: 'validation',
    detail: prepared.errors.join('\n'),
    sample: text,
    compileAttemptsDelta: 0,
  };
}
