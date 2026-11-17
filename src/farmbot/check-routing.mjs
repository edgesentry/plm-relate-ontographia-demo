// Strict routing-object parsing, validation, expansion and compilation.
// This module has no DOM or WASM imports, so Node and the browser share it.
import { CHECK_BY_ID, CHECK_IDS } from './check-catalog.mjs';
import { planQuestion } from './plan.mjs';

export const CHECK_ROUTING_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['check', 'parameter'],
  properties: {
    check: { type: 'string', enum: [...CHECK_IDS] },
    parameter: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['domain', 'value'],
          properties: {
            domain: { type: 'string' },
            value: { type: 'string' },
          },
        },
      ],
    },
  },
});

const OK_KEYS = ['check', 'parameter'];
const PARAMETER_KEYS = ['domain', 'value'];
const CYPHER_TEXT = /(?:```|\bCYPHER\s+\d+\b|\bMATCH\s*[({]|\bRETURN\s+|\bCREATE\s*[({]|\bMERGE\s*[({]|\bDELETE\s+|\bDETACH\s+DELETE\b)/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function cypherStrings(value, path = 'output') {
  if (typeof value === 'string') {
    return CYPHER_TEXT.test(value) ? [`${path} contains Cypher or a markdown fence`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => cypherStrings(entry, `${path}[${index}]`));
  }
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      cypherStrings(entry, `${path}.${key}`),
    );
  }
  return [];
}

/** Validate a parsed value against the closed routing schema and catalog. */
export function validateCheckRouting(value, allowedValues) {
  const errors = cypherStrings(value);
  if (!isObject(value)) {
    errors.push('routing output root must be an object');
    return { ok: false, errors };
  }
  if (!exactKeys(value, OK_KEYS)) {
    errors.push('routing output must have exactly the required keys check and parameter');
  }

  const check = CHECK_BY_ID.get(value.check);
  if (typeof value.check !== 'string' || !check) {
    errors.push(`unknown check id ${String(value.check)}`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'parameter')) {
    return { ok: false, errors };
  }

  const supplied = value.parameter;
  const declared = check?.parameter ?? null;
  if (supplied === null) {
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: { check: value.check, parameter: null } };
  }
  if (!isObject(supplied)) {
    errors.push('parameter must be null or an object');
    return { ok: false, errors };
  }
  if (!exactKeys(supplied, PARAMETER_KEYS)) {
    errors.push('parameter must have exactly the required keys domain and value');
  }
  if (typeof supplied.domain !== 'string' || typeof supplied.value !== 'string') {
    errors.push('parameter domain and value must be strings');
    return { ok: false, errors };
  }
  if (!declared) {
    errors.push(`${value.check} declares no parameter`);
    return { ok: false, errors };
  }
  if (supplied.domain !== declared.domain) {
    errors.push(`${value.check} requires parameter domain ${declared.domain}`);
    return { ok: false, errors };
  }
  const domain = allowedValues?.[declared.domain];
  if (!Array.isArray(domain)) {
    errors.push(`allowed-values domain ${declared.domain} is unavailable`);
    return { ok: false, errors };
  }
  if (!domain.includes(supplied.value)) {
    errors.push(`value is not a member of ${declared.domain}`);
    return { ok: false, errors };
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      check: value.check,
      parameter: { domain: supplied.domain, value: supplied.value },
    },
  };
}

/** Parse model text as JSON; fences, prose and Cypher are not extracted. */
export function parseCheckRouting(text, allowedValues) {
  if (typeof text !== 'string') {
    return { ok: false, errors: ['routing output must be a JSON string'] };
  }
  if (CYPHER_TEXT.test(text) && !text.trim().startsWith('{')) {
    return { ok: false, errors: ['routing output contains Cypher or a markdown fence'] };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [`invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  return validateCheckRouting(parsed, allowedValues);
}

function topLevelAliases(intent) {
  return new Set([
    intent.start?.alias,
    ...(intent.traverse ?? []).map((step) => step.to?.alias),
  ]);
}

/**
 * Expand a validated routing object into structured clones of committed
 * Intents. Only top-level aliases receive a filter; committed data is untouched.
 */
export function expandCheckRouting(routing, checkIntents) {
  const check = CHECK_BY_ID.get(routing.check);
  if (!check) throw new Error(`unknown check ${routing.check}`);
  return check.intents.map((file) => {
    if (!Object.prototype.hasOwnProperty.call(checkIntents, file)) {
      throw new Error(`missing check Intent ${file}`);
    }
    const intent = structuredClone(checkIntents[file]);
    if (routing.parameter && topLevelAliases(intent).has(check.parameter.alias)) {
      intent.filter = [
        ...(intent.filter ?? []),
        {
          alias: check.parameter.alias,
          property: check.parameter.property,
          op: 'eq',
          value: routing.parameter.value,
        },
      ];
    }
    return { file, intent };
  });
}

export function summarizeIntentPath(intent) {
  const parts = [intent.start.class];
  for (const step of intent.traverse ?? []) {
    parts.push(`${step.relationship} (${step.direction})`, step.to.class);
  }
  return parts.join(' → ');
}

/**
 * Shared chip/model oracle. Validation always finishes before the first call to
 * the compiler; compilation creates a proposal but never executes a query.
 */
export function prepareCheckProposal(
  input,
  { allowedValues, checkIntents, compiler, ontology },
) {
  const validated =
    typeof input === 'string'
      ? parseCheckRouting(input, allowedValues)
      : validateCheckRouting(input, allowedValues);
  if (!validated.ok) return { ok: false, stage: 'validation', errors: validated.errors };

  let expanded;
  try {
    expanded = expandCheckRouting(validated.value, checkIntents);
  } catch (error) {
    return {
      ok: false,
      stage: 'validation',
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  try {
    const intents = expanded.map(({ file, intent }) => {
      const plan = planQuestion(compiler, ontology, intent, false);
      return {
        file,
        intent,
        path: summarizeIntentPath(intent),
        cypher: plan.compiled,
        params: plan.params,
      };
    });
    return { ok: true, proposal: { routing: validated.value, intents } };
  } catch (error) {
    return {
      ok: false,
      stage: 'compile',
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
