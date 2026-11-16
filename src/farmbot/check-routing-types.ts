import type { Intent } from './types';

export type CheckId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9';

export interface CheckRouting {
  check: CheckId;
  parameter: { domain: string; value: string } | null;
}

export interface CompiledCheckIntent {
  file: string;
  intent: Intent;
  path: string;
  cypher: string;
  params: Record<string, unknown>;
}

export interface CheckProposal {
  routing: CheckRouting;
  intents: CompiledCheckIntent[];
}

export type CheckPreparation =
  | { ok: true; proposal: CheckProposal }
  | { ok: false; stage: 'validation' | 'compile'; errors: string[] };

export interface ExecutedCheckIntent extends CompiledCheckIntent {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface CheckRunResult {
  proposal: CheckProposal;
  intents: ExecutedCheckIntent[];
  digest: string;
}

export type CheckPanelErrorKind = 'load' | 'generate' | 'validation' | 'compile' | 'execute';

export interface CheckPanelError {
  kind: CheckPanelErrorKind;
  detail: string;
}
