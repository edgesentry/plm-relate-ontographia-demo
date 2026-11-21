# FarmBot checks

A check Intent is the JSON shape used under `farmbot/checks/`; an absence rule
adds a `not_exists` list of correlated sub-patterns. The engine compiles each
Intent with the Ontographia WASM compiler, executes it against the committed seed
with the Relate WASM engine, and applies a deterministic rule in
`src/farmbot/agent/`.

The same ESM modules run in Node and in the browser with no Node-only import: the
caller supplies the compiler, the executor, the check Intents, the seed digest and
a node-id-to-source map. `farmbot/scripts/agent-farmbot.mjs` is the Node entry;
the `/farmbot/` screen supplies the same values (see [Browser entry](#browser-entry)).

## Rules

`CHECKS` in `src/farmbot/agent/checks.mjs` is the authoritative rule list, and
`farmbot/dist/farmbot.findings.json` carries the current `findingCount`,
`severityCounts` and per-finding `inferred` flag; `npm run agent:farmbot`
regenerates it. The notes below are design rationale for how a rule reads its
rows, not a rule catalogue: start classes, `not_exists` entries and join keys are
in `farmbot/checks/` and `CHECKS` / `INTENT_FILES`.

### R1: packing quantity differs from the part page

One finding per `quantity_difference` row (one part and product version); a part
compared for both `standard` and `xl` produces two findings that share the part
node.

### R2: a reference does not resolve to a part

One finding per distinct `display_name`, grouped in the rule module; Intents keep
only usage lines whose `match_method` is `unmatched`.

### R3: a part referenced by no process

Each process structure is a `not_exists` entry compiled to a correlated
`NOT EXISTS`; the rows are the finding set and the rule module subtracts no
reference set. Bags are a separate source because a bag owns a pre-assembly page's
`Accessory bag BOM` section.

### R4: a part packed but not referenced by a process

Kit and the carton share no packing-only superclass and the compiler has no `OR`
between `not_exists` entries, so two Intents whose union is the finding set cover
them. A part referenced only by pre-assembly pages or an Accessory bag is not
reported; the kit and carton reference Intents still supply the packing evidence.

### R5: a pre-assembly page with no machine-readable parts table

One finding per page whose `machine_readable` property is false: `pdf-only` or an
index page with no component list. It contributes no usage lines, so its
components cannot appear in R3 or R4; R5 is a coverage limit and always a cause
candidate there.

### R6: a Change Log name still appears downstream

One finding per name, reached either way. A **fact** is a `change_note_link` that
resolves to the part still named by a packing or service usage line. An
**inferred** candidate is a downstream display name whose normalized words occur
in a removal or replacement item, unless that item also links a name containing
those words: the link is the replacement and covers it, so "Replaced the black
oxide wood screws with stainless steel [[T25 wood screws]]" does not report "wood
screws".

R6 reads packing items and service references only; pre-assembly pages and the
Accessory bag BOM are manufacturing containers, not packing items. The inference
shares the extract's normalization (`farmbot/docs/name-normalization.md`): names
that normalize to one key merge into one finding, and a linked-and-inferred name
stays one finding with the fact winning. The finding carries the boolean
`inferred` (true only for the prose match); the finding view labels it
`fact` or `inferred`. Totals are in `farmbot/dist/farmbot.findings.json`.

### R7: a changed part reaches nothing

A changed part is the target of a resolved `change_note_link`; its `not_exists`
entries mean a row reaches no resolved usage downstream. R5 pages and unresolved
names are cause candidates for a part on an unreadable page or under an
unresolved name.

### R8: a service-only part

A row is a service-named part absent from process documentation; packed parts are
not excluded because packing rows are evidence. R4 and R3 are cause candidates
when they apply, and R5 always is.

### R9: a service-page reference that does not resolve

One finding per distinct unresolved service-page name, listing candidate parts and
the pages where R2 records the name as unresolved, not every page that uses it.
R2 does not execute the service Intent, so such a name appears once in each rule.

## Check Intents

Every file under `farmbot/checks/` is a complete Intent and `INTENT_FILES` in
`src/farmbot/agent/checks.mjs` is the executed set. All traversals use
`direction: out` from the relationship's `from_class` side, because the pinned
Ontographia version (see `package.json`) still rejects inbound steps
(`edgesentry/ontographia#164`); a `not_exists` list compiles to a correlated
`NOT EXISTS`. No Intent uses `DISTINCT`, sums or branching: the documented
post-compile `RETURN DISTINCT` for Q2 and Q3 stays, and sums and branching belong
to the rule module (`edgesentry/ontographia#166`, `#167`).

Each Intent carries an explicit `limit` and the runner throws when a result
reaches it, so a result is never truncated silently. Shared reference Intents are
loaded for evidence, causes and severity. `farmbot/checks/compiled.gold.json`
pins the compiler output and a test requires an exact recompile.

## Findings document

`npm run agent:farmbot` writes `farmbot/dist/farmbot.findings.json` and its
`.sha256` sidecar; the writer in `src/farmbot/agent/` defines the document shape
and canonical layout, so the output is byte-stable (sorted keys, no timestamp,
path or host value). The sidecar is one digest line like
`farmbot.seed.json.sha256`; the Node entry's flags and defaults are in
`farmbot/scripts/agent-farmbot.mjs`.

The same run writes `farmbot/dist/farmbot.part-sources.json`, mapping
`part:<name>` to its part page path. It is the only caller input the browser
cannot derive from the seed, and only part evidence `sourceFile` values depend on
it. The Node entry reads the paths from the uncommitted DuckDB extract; rule
evaluation never reads it.

## Browser entry

`src/farmbot/data.ts` imports every committed file the browser needs; nothing
under `farmbot/checks/` is copied. The screen imports only the sidecar, not the
findings document, to compare the browser result with the committed digest.
Checks run on **Run checks**, once after load from a well-formed deep link, or
once when a well-formed finding hash is clicked on a page whose checks have not
run; all three reuse the preset-question Relate session.

## Notification panel

The panel is computed from the produced findings and needs no committed document;
`src/farmbot/findings-view.mjs` and `src/farmbot/App.tsx` define its counts,
ordering, labels and digest comparison, with strings in `src/farmbot/i18n.ts`.

The landing leads with sample notification-email cards. `SCENARIO_DIRECTIONS` in
`src/farmbot/sample-notifications.mjs` groups the rules by the `direction`
field on `CHECKS`, and each card cites one finding id from
`farmbot/dist/farmbot.findings.json`; the localized scenario and summary strings
live in `src/farmbot/i18n.ts`, and `scripts/smoke-farmbot.mjs` compares the
rendered cards with the committed document. The cards are samples: nothing is
sent from the page, and the Worker email path in `worker/notify.ts` is the only
sender.

## Finding view

Opening a finding shows the summary, the process-lane diagram (see
[Process lanes](#process-lanes)), evidence rows with their Intent, Cypher and
parameters, then cause candidates and countermeasures; composition is in
`src/farmbot/App.tsx` and `src/farmbot/findings-view.mjs`.

Cause and countermeasure texts come from `src/farmbot/agent/templates.mjs` and
stay in English; labels, headings and the summary follow the selected language.
Every value is a React text node, so document text is never interpreted as HTML.

## Process lanes

`src/farmbot/ProcessLanes.tsx` renders the hand-built SVG diagram above the
evidence table, and `layoutFinding` in `src/farmbot/process-lanes.mjs` computes it
without the DOM, so Node tests and the screen share one layout; that module
defines the lane model, per-rule edge patterns, highlight rules and node cap.
Styling is classes and React attributes only, keeping `style-src 'self'`; a link
the evidence cannot confirm ends at a lane-level placeholder rather than an
invented node, since the target lane may not be drawn.

## Deep link

The format is `#finding=<id>` from the committed document. `parseFindingHash` in
`src/farmbot/findings-view.mjs` defines the accepted shape: a malformed or
overlong hash is ignored without a session or error, and a well-formed missing id
runs the checks but opens nothing. A hash change on an already-open page opens
the matching finding and starts the checks when they have not run, which is the
path a sample-email card takes on an idle screen. Selecting a finding updates
the address without a request.

## Finding id

`src/farmbot/agent/ids.mjs` defines a finding id from the per-rule subject key,
slug and collision suffix. Ids depend only on the subject set, not input order:
subjects are sorted before a collision is resolved, and a repeated rule-and-key
pair is rejected.

## Evidence rows

`src/farmbot/agent/index.mjs` and `src/farmbot/findings-view.mjs` define the row
shape, roles and line-number rules. A part row's `sourceFile` is the Node entry's
page path, or `null` when no source is supplied rather than an invented path.

## Severity

`src/farmbot/agent/severity.mjs` defines the score, factors, level thresholds and
always-`info` rules; the factors and level are written into each finding, and
`severityCounts` in `farmbot/dist/farmbot.findings.json` holds per-rule counts.

## Causes and countermeasures

Causes come from fixed per-rule templates in `src/farmbot/agent/templates.mjs`;
each is `fact` when it restates an evidence value or seed property and `inference`
when it is a candidate explanation, and a cross-rule cause carries that rule id.
The tool shows that two documents disagree without deciding which is right; the
countermeasures ask the reader to confirm the value or add the missing reference.

## SQL oracles

Each rule has an independent DuckDB query under `farmbot/oracle/`, and
`npm run test:farmbot` compares each with the engine on the committed seed. R2 and
R9 keep one row per reference line, so they compare as multisets. The R6 oracle
shares the rule's name normalization (parentheticals, `&`, `w/`, `×`, singular
fallback) and promotes an inferred match equal to a changed part to a fact row,
including an unmatched row other rules would not treat as a packing item.

## Verification

```sh
npm run agent:farmbot      # rebuild the findings, the sidecar and the part sources
npm run test:farmbot       # compile gold, oracle equality, two-run byte match
npm run smoke:farmbot      # browser: panel counts, deep link, no external request
```

`npm run test:farmbot` runs the committed suite, including the browser parity in
`farmbot/test/findings-browser-parity.test.mjs` and the view rules in
`farmbot/test/findings-view.test.mjs`.
