// Closed FarmBot check catalog shared by the model prompt, validator and UI.
//
// Intent file names and titles come from CHECKS. A parameter is declared only
// where a top-level start/traverse alias can carry a property equality filter;
// expansion leaves Intents without that alias unchanged.
import { CHECKS } from './agent/checks.mjs';

export const CHECK_IDS = Object.freeze([
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
  'R6',
  'R7',
  'R8',
  'R9',
]);

const parameter = (domain, alias, property) =>
  Object.freeze({ domain, alias, property });

const PARAMETERS = Object.freeze({
  R1: null,
  R2: null,
  R3: parameter('part_names', 'part', 'name'),
  R4: parameter('part_names', 'part', 'name'),
  R5: null,
  R6: null,
  R7: parameter('part_names', 'part', 'name'),
  R8: parameter('part_names_in_service_procedures', 'part', 'name'),
  R9: null,
});

const ROUTING_HINTS = Object.freeze({
  R1: 'quantity difference, packing quantity, BOM quantity, 数量差, 梱包数量',
  R2: 'unresolved assembly or packing reference, 組立・梱包の未解決参照',
  R3: 'part with no process reference, unreferenced part, 工程から参照されない部品',
  R4: 'packed part absent from assembly or pre-assembly, 梱包にあるが工程にない部品',
  R5: 'pre-assembly without a machine-readable parts table, 機械可読でないプリ組立',
  R6: 'Change Log name still in assembly, packing or service, 変更ログの名前が組立・梱包・サービスに残る',
  R7: 'changed part reaches no downstream page, 下流に到達しない変更部品',
  R8: 'service-only part, service part absent from process, サービスのみの部品',
  R9: 'unresolved service-page reference, サービスページの未解決参照',
});

/**
 * Build the canonical catalog independently of the order of the supplied rule
 * records. Every committed rule must appear exactly once.
 */
export function createCheckCatalog(rules = CHECKS) {
  const byId = new Map();
  for (const rule of rules) {
    if (!CHECK_IDS.includes(rule.id)) throw new Error(`unknown check ${rule.id}`);
    if (byId.has(rule.id)) throw new Error(`duplicate check ${rule.id}`);
    byId.set(rule.id, rule);
  }
  return Object.freeze(
    CHECK_IDS.map((id) => {
      const rule = byId.get(id);
      if (!rule) throw new Error(`missing check ${id}`);
      return Object.freeze({
        id,
        title: rule.title,
        intents: Object.freeze([...rule.intents]),
        parameter: PARAMETERS[id],
        routingHint: ROUTING_HINTS[id],
      });
    }),
  );
}

export const CHECK_CATALOG = createCheckCatalog();
export const CHECK_BY_ID = new Map(CHECK_CATALOG.map((check) => [check.id, check]));

/** Return a copy of one routing object with only its closed-set keys. */
export function checkRoutingTemplate(id) {
  const check = CHECK_BY_ID.get(id);
  if (!check) throw new Error(`unknown check ${id}`);
  return {
    check: id,
    parameter: check.parameter
      ? { domain: check.parameter.domain, value: '<allowed value>' }
      : null,
  };
}
