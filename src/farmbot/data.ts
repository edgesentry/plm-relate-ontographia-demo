// Committed FarmBot artifacts used by the /farmbot/ screen.
//
// The five Intents are read from farmbot/intents/, the check Intents from
// farmbot/checks/, the selector domains from
// farmbot/dist/farmbot.allowed-values.json, the part page paths from
// farmbot/dist/farmbot.part-sources.json, and the ontology text from
// farmbot/ontology/farmbot.native.yaml. The committed findings document is not
// imported: only its digest sidecar is, so the browser result can be compared
// with it without bundling the document. The seed is deliberately NOT imported
// here: it is fetched as raw bytes at Run time so its digest can be checked
// against the committed value.

import q1Json from '../../farmbot/intents/q1-packing-differences.json';
import q2Json from '../../farmbot/intents/q2-assembly-chapters-for-part.json';
import q3Json from '../../farmbot/intents/q3-structures-for-part.json';
import q4Json from '../../farmbot/intents/q4-kit-parts-for-category.json';
import q5Json from '../../farmbot/intents/q5-unmatched-references.json';
import r1ComparedInJson from '../../farmbot/checks/r1-compared-in.json';
import r1ForVariantJson from '../../farmbot/checks/r1-for-variant.json';
import r1QuantityDifferenceJson from '../../farmbot/checks/r1-quantity-difference.json';
import r2AssemblyUnmatchedJson from '../../farmbot/checks/r2-assembly-unmatched.json';
import r2ManufacturingUnmatchedJson from '../../farmbot/checks/r2-manufacturing-unmatched.json';
import r3PartsWithoutReferenceJson from '../../farmbot/checks/r3-parts-without-reference.json';
import r4KitPartsWithoutProcessJson from '../../farmbot/checks/r4-kit-parts-without-process.json';
import r4CartonPartsWithoutProcessJson from '../../farmbot/checks/r4-carton-parts-without-process.json';
import r7ChangedPartsUnreachedJson from '../../farmbot/checks/r7-changed-parts-unreached.json';
import r8ServicePartsWithoutProcessJson from '../../farmbot/checks/r8-service-parts-without-process.json';
import refsAssemblyJson from '../../farmbot/checks/refs-assembly.json';
import refsBagJson from '../../farmbot/checks/refs-bag.json';
import refsCartonJson from '../../farmbot/checks/refs-carton.json';
import refsKitJson from '../../farmbot/checks/refs-kit.json';
import refsPreassemblyJson from '../../farmbot/checks/refs-preassembly.json';
import r5UnreadablePreassembliesJson from '../../farmbot/checks/r5-unreadable-preassemblies.json';
import changedPartsJson from '../../farmbot/checks/changed-parts.json';
import r6ChangesJson from '../../farmbot/checks/r6-changes.json';
import r9ServiceUnmatchedJson from '../../farmbot/checks/r9-service-unmatched.json';
import refsServiceJson from '../../farmbot/checks/refs-service.json';
import unmatchedCandidatesJson from '../../farmbot/checks/unmatched-candidates.json';
import allowedValuesJson from '../../farmbot/dist/farmbot.allowed-values.json';
import agentClaimsJson from '../../farmbot/claims/agent-claims.json';
import partSourcesJson from '../../farmbot/dist/farmbot.part-sources.json';
import findingsSidecar from '../../farmbot/dist/farmbot.findings.json.sha256?raw';
import ontologyYaml from '../../farmbot/ontology/farmbot.native.yaml?raw';
import { INTENT_FILES } from './agent/checks.mjs';
import { parseFindingsDigestLine } from './findings-view.mjs';
import { QUESTIONS } from './questions.mjs';
import type {
  AllowedValuesFile,
  Intent,
  PartSourcesFile,
  Question,
  QuestionId,
} from './types';

export const questions = QUESTIONS as readonly Question[];

export const intents: Record<QuestionId, Intent> = {
  q1: q1Json as Intent,
  q2: q2Json as Intent,
  q3: q3Json as Intent,
  q4: q4Json as Intent,
  q5: q5Json as Intent,
};

export const allowedValues = allowedValuesJson as AllowedValuesFile;

/**
 * The committed check Intents, keyed by file name exactly as the Node entry
 * keys them. Every file comes from farmbot/checks/; no Intent JSON is copied.
 */
export const checkIntents: Record<string, object> = {
  'changed-parts.json': changedPartsJson,
  'r1-compared-in.json': r1ComparedInJson,
  'r1-for-variant.json': r1ForVariantJson,
  'r1-quantity-difference.json': r1QuantityDifferenceJson,
  'r2-assembly-unmatched.json': r2AssemblyUnmatchedJson,
  'r2-manufacturing-unmatched.json': r2ManufacturingUnmatchedJson,
  'r3-parts-without-reference.json': r3PartsWithoutReferenceJson,
  'r4-kit-parts-without-process.json': r4KitPartsWithoutProcessJson,
  'r4-carton-parts-without-process.json': r4CartonPartsWithoutProcessJson,
  'r7-changed-parts-unreached.json': r7ChangedPartsUnreachedJson,
  'r8-service-parts-without-process.json': r8ServicePartsWithoutProcessJson,
  'r5-unreadable-preassemblies.json': r5UnreadablePreassembliesJson,
  'r6-changes.json': r6ChangesJson,
  'r9-service-unmatched.json': r9ServiceUnmatchedJson,
  'refs-assembly.json': refsAssemblyJson,
  'refs-bag.json': refsBagJson,
  'refs-carton.json': refsCartonJson,
  'refs-kit.json': refsKitJson,
  'refs-preassembly.json': refsPreassemblyJson,
  'refs-service.json': refsServiceJson,
  'unmatched-candidates.json': unmatchedCandidatesJson,
};

// The record must carry exactly the files the check engine asks for.
for (const file of INTENT_FILES) {
  if (!Object.prototype.hasOwnProperty.call(checkIntents, file)) {
    throw new Error(`missing check Intent ${file}`);
  }
}
if (Object.keys(checkIntents).length !== INTENT_FILES.length) {
  throw new Error('the check Intent record has unexpected entries');
}

/** Part page paths written by the agent from the extract, for evidence rows. */
export const partSources = partSourcesJson as PartSourcesFile;

/** Fixed agent-claim fixtures verified deterministically against the Relate graph. */
export const agentClaims = agentClaimsJson;

/** SHA-256 hex of the committed findings document, from its sidecar. */
export const COMMITTED_FINDINGS_DIGEST = (() => {
  const parsed = parseFindingsDigestLine(findingsSidecar);
  if (!parsed) throw new Error('farmbot.findings.json.sha256 is not a digest line');
  return parsed.hex;
})();

/** Native ontology text handed to the compiler and to the seed loader. */
export const farmbotOntology = ontologyYaml;

/** Pinned FarmBot Genesis source revision, from farmbot/PROVENANCE.md. */
export const SOURCE_PIN = '44e0fa24d4a538dfa1255a4e89308ccabf3abaeb';

/** The committed default filter value of an Intent (Intents without one return null). */
export function defaultFilterValue(intent: Intent): string | null {
  return intent.filter?.[0]?.value ?? null;
}
