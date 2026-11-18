# FarmBot checks

The check engine turns check Intents into findings. A check Intent is the same
JSON shape as a preset-question Intent: it names a start class, a linear
traversal chain, optional property filters and the projections to return. An
absence rule adds a `not_exists` list of correlated sub-patterns. The engine
compiles each Intent with the Ontographia WASM compiler, executes it with the
Relate WASM engine against the committed seed, and evaluates a deterministic
rule in `src/farmbot/agent/`. The pinned compiler and engine versions are in
`package.json`.

The same ESM modules run in Node and in the browser. `src/farmbot/agent/` has no
Node-only import: the caller supplies the compiler, the executor, the check
Intent JSON, the seed digest and a map from node id to source file.
`farmbot/scripts/agent-farmbot.mjs` is the Node entry; the `/farmbot/` screen
supplies the same values from committed files (see [Browser entry](#browser-entry)).

## Rules

`CHECKS` in `src/farmbot/agent/checks.mjs` is the authoritative rule list: rule
id, direction, title and the Intents each rule reads. Current per-rule totals
are in `farmbot/dist/farmbot.findings.json`: each `rules[]` entry carries
`findingCount` and `severityCounts`, and each finding carries its own `inferred`
flag. `npm run agent:farmbot` regenerates that document.

The notes below record how a rule reads its rows and why; they are design
rationale, not a rule catalogue.

### R1: packing quantity differs from the part page

One finding per `quantity_difference` row, which is one part and one product
version. The rule joins three Intents on the difference node id: the compared
part, the packing container and the product variant. A part compared for both
`standard` and `xl` therefore produces two findings that share the part node.

### R2: a reference does not resolve to a part

One finding per distinct `display_name`, grouped in the rule module. The two
Intents keep the usage lines whose `match_method` is `unmatched`: one starts on
`AssemblyChapter`, the other on `ManufacturingContainer` (pre-assembly pages,
kits, the carton and bags).

### R3: a part referenced by no process

One Intent starts on `Part` and adds a `not_exists` entry for each process
structure: an assembly chapter, a pre-assembly page, a bag, a kit and the
carton. Each entry compiles to a correlated `NOT EXISTS`. The rows are the
finding set; no reference set is subtracted in the rule module. A bag owns the
`Accessory bag BOM` section of a pre-assembly page, so bags are a separate
reference source.

### R4: a part packed but not referenced by a process

Kit and the carton have no common packing-only superclass (`ManufacturingContainer`
also covers pre-assembly and bag), and the compiler has no `OR` between
`not_exists` entries. The rule therefore uses two Intents whose union is the
finding set: one starts on `Kit` and one on `Carton`, each traversing to a
`Part` and carrying `not_exists` entries for the assembly chapter, pre-assembly
and bag. A part is reported when it is packed in a kit or the carton and absent
from those three. A part referenced only by pre-assembly pages or an Accessory
bag is not reported. The kit and carton reference Intents still supply the
packing-structure and packing-line evidence.

### R5: a pre-assembly page with no machine-readable parts table

One finding per `PreAssembly` node whose `machine_readable` property is false.
A page is either marked `pdf-only` or is an index page with no component list.
The page contributes no usage lines, so its components cannot appear in R3 or
R4. R5 is a coverage limit and is always listed as a cause candidate in those
two rules.

### R6: a Change Log name still appears downstream

One finding per name. A name reaches R6 in one of two ways:

- **Fact.** A `change_note_link` resolves to a part (`AFFECTS_PART`). If a
  packing or service usage line resolves to that part, the part is still named
  downstream. The link is explicit, so the match is a fact.
- **Inferred.** A Change Log list item that removes or replaces something
  (`Removed…`, `Replaced…`, `Switched…`, `Dropped…`) names the old item in
  prose. Each downstream display name whose normalized words occur in that item
  is a candidate. If the same item also links a name that contains those words,
  the link is the replacement and covers the name; that keeps a statement such
  as "Replaced the black oxide wood screws with stainless steel
  [[T25 wood screws]]" from reporting the old word "wood screws".

The packing channel is `packing_item` only: kits, the carton and pack bags.
Pre-assembly pages and the Accessory bag BOM are manufacturing containers, but
their usage lines are not packing items, so R6 does not read them. A service
reference is `service_reference`.

The inference uses the same normalization as the extract
(`farmbot/docs/name-normalization.md`): case, punctuation, parentheticals and
plural endings do not distinguish names. Two display names that normalize to
one key (`Tee Nuts` and `tee nuts`) produce one finding with both evidence
rows. A name that is both linked and inferred stays one finding; the fact wins,
including when the only matching downstream row is unresolved.

Every finding carries the boolean `inferred`: true only for the prose match,
and the finding view labels it `fact` or `inferred`. Current totals follow from
`farmbot/dist/farmbot.findings.json` (`rules[].findingCount` and `inferred` on
each finding).

### R7: a changed part reaches nothing

A changed part is the target of a resolved `change_note_link`. One Intent starts
on `DesignChange`, traverses `AFFECTS_PART` to `Part` and carries `not_exists`
entries for the assembly chapter, pre-assembly, bag, kit, carton and service
procedure, so a row is a changed part that reaches no resolved usage anywhere
downstream. One finding is emitted per such part. The changed-part Intent still
supplies the design-change and part evidence. The R5 pages and unresolved names
are cause candidates: the part may be listed on a page the extract cannot read,
or under a name that did not resolve.

### R8: a service-only part

One Intent starts on `ServiceProcedure`, traverses `HAS_USAGE` → `Usage` →
`USES_ITEM` to a `Part` and carries `not_exists` entries for the assembly
chapter, a pre-assembly page and a bag. A row is therefore a part named by a
service page and absent from all process documentation. A packed part is not
excluded: the packing rows are evidence, not a reason to exclude the part. R4
and R3 are cause candidates when they apply, and R5 is always listed. Current
subjects and their evidence are in `farmbot/dist/farmbot.findings.json`.

### R9: a service-page reference that does not resolve

One finding per distinct unresolved display name on a service page. The finding
lists any candidate parts the extract recorded and names the pages where R2
records the same name as unresolved, not every page that happens to use it. R2
does not execute the service Intent, so a name that is unresolved on a service
page and on a packing page appears once in each rule. Current subjects and
evidence are in `farmbot/dist/farmbot.findings.json`.

## Check Intents

Every file under `farmbot/checks/` is a complete Intent, and `INTENT_FILES` in
`src/farmbot/agent/checks.mjs` lists the executed set. All traversals use
`direction: out` and start on the relationship's `from_class` side, because
the currently pinned Ontographia version (see `package.json`) still rejects
inbound steps (`edgesentry/ontographia#164`). The absence Intents add a
`not_exists` list, which that pinned version compiles to a correlated
`NOT EXISTS` sub-pattern. No Intent uses `DISTINCT`, sums or branching; the
pinned compiler still cannot express those, so the documented post-compile
`RETURN DISTINCT` step for Q2 and Q3 stays, and sums and branching belong to the
rule module (upstream issues `edgesentry/ontographia#166` and
`edgesentry/ontographia#167`).

Each Intent carries an explicit `limit`, and the runner throws when a result
reaches it, so a limit never truncates a finding silently. A shared reference
Intent is loaded for evidence, causes and severity even when a rule does not
record it as its own query.

`farmbot/checks/compiled.gold.json` pins the compiler output (query text and
params) for every Intent; a test recompiles each file and requires an exact
match.

## Findings document

`npm run agent:farmbot` writes `farmbot/dist/farmbot.findings.json` and
`farmbot/dist/farmbot.findings.json.sha256`. The writer under
`src/farmbot/agent/` defines the document shape, the format token and the
canonical layout: object keys are sorted at every level, array order follows
from the findings themselves, and no timestamp, absolute path or host value is
written. The sidecar is one digest line in the same style as
`farmbot.seed.json.sha256`.

The same run writes `farmbot/dist/farmbot.part-sources.json`, which maps
`part:<name>` to the part page path for every part that has one. It is the only
caller input the browser cannot derive from the seed; only the part evidence
`sourceFile` values depend on it.

The Node entry reads part page paths from the DuckDB extract
(`SELECT name, path FROM part`) and passes them to the engine. The extract is
not committed; in CI a test builds a private extract and passes `--extract`.
The rule evaluation itself never reads the extract.

`node farmbot/scripts/agent-farmbot.mjs --write-compiled-gold` regenerates the
compiled-Intent gold file.

## Browser entry

`src/farmbot/data.ts` imports every committed file the browser needs; nothing
under `farmbot/checks/` is copied. The compiler, the ontology text, one JSON
import per executed Intent, the part page paths, the seed digest and the
executor come from that module and the related modules under `src/farmbot/`.

The screen does not bundle `farmbot.findings.json`. It imports only the
sidecar so it can compare the browser result with the committed digest. Checks
run when the reader presses **Run checks**, or automatically once after load
when the URL carries a well-formed finding deep link; both paths reuse the
Relate session the preset questions use.

## Notification panel

The panel is computed in the browser from the same findings the checks
produced, so it needs no committed document. The counts, ordering, severity
labels and digest comparison live in `src/farmbot/findings-view.mjs`,
`src/farmbot/App.tsx` and the locale strings in `src/farmbot/i18n.ts`.

## Finding view

Opening a finding from the panel, or loading a deep link, shows the one-line
summary, the process-lane diagram (see [Process lanes](#process-lanes)) and one
row per evidence entry with the Intent, Cypher and bound parameters that
produced it, followed by the cause candidates and countermeasures. The
composition and the evidence-row helpers live in `src/farmbot/App.tsx` and
`src/farmbot/findings-view.mjs`.

Cause and countermeasure texts come from `src/farmbot/agent/templates.mjs` and
are stored in English. They are rendered as-is in both languages; the labels,
the headings and the one-line summary follow the selected language. Every
value is a React text node, so FarmBot document text is never interpreted as
HTML.

## Process lanes

The finding view draws one hand-built SVG diagram above the evidence table.
`src/farmbot/ProcessLanes.tsx` renders it; `layoutFinding` in
`src/farmbot/process-lanes.mjs` computes it without the DOM, so the Node tests
and the screen share one layout. Styling is classes and React attributes only
(no `<style>` element, no HTML string), so the page keeps `style-src 'self'`.

The lane model, the per-rule edge patterns, the highlight rules and the node
cap are defined and explained in `src/farmbot/process-lanes.mjs`; the data
attributes the browser smoke reads are set in `src/farmbot/ProcessLanes.tsx`. A
link the evidence cannot confirm ends at a lane-level placeholder rather than
at an invented node, because the target lane may not be drawn at all.

## Deep link

The format is `#finding=<id>`, where `<id>` is a finding id from the committed
document. `parseFindingHash` in `src/farmbot/findings-view.mjs` defines the
accepted shape: a malformed or overlong hash, or one with another key, is
ignored without opening a session or showing an error, and a well-formed id
that does not exist runs the checks but opens nothing. Selecting a finding in
the panel updates the address without sending a request.

## Finding id

A finding id is the rule id, a hyphen, and a lowercase ASCII slug of the
finding's subject key. `src/farmbot/agent/ids.mjs` defines the per-rule subject
key, the slug and the collision suffix.

The id of a subject depends only on the set of subjects, not on the order in
which they are passed: subjects are sorted by rule and key before any collision
is resolved, and the ids are returned keyed by rule and subject key. A repeated
rule-and-key pair is rejected rather than given two ids.

## Evidence rows

Each finding has at least one evidence row: a seed node id, its role in the
finding, the FarmBot document path and line when the source has one, and the
values taken from that node. The row shape, the role names and the line-number
rules live in `src/farmbot/agent/index.mjs` and
`src/farmbot/findings-view.mjs`.

A part evidence row's `sourceFile` is the part page path supplied by the Node
entry from the extract. If a caller supplies no source for a node, the field is
`null` rather than an invented path.

## Severity

The score formula, its factors, the level thresholds and the rules that are
always `info` are defined in `src/farmbot/agent/severity.mjs`. The factors and
the level are written into each finding; per-rule severity counts on the
committed seed are in `severityCounts` in
`farmbot/dist/farmbot.findings.json`.

## Causes and countermeasures

Causes come from fixed per-rule templates in `src/farmbot/agent/templates.mjs`.
Each cause is labelled `fact` when it restates an evidence value or a seed
property, and `inference` when it is a candidate explanation. A cause that
points at another rule carries that rule id.

The tool shows that two documents disagree. It does not decide which document
is right, and the countermeasures ask the reader to confirm the intended value
or add the missing reference.

## SQL oracles

Each rule has an independent DuckDB query under `farmbot/oracle/`, and
`npm run test:farmbot` compares each result with the engine output on the
committed seed. R2 and R9 keep one row per reference line, so they are compared
as multisets rather than sets. The R6 oracle shares the rule module's name
normalization (parentheticals, `&`, `w/`, `×`, and a singular fallback) and
promotes an inferred match whose key equals a changed part to a fact row,
including an unmatched row that other rules would not treat as a packing item.

## Verification

```sh
npm run agent:farmbot      # rebuild the findings, the sidecar and the part sources
npm run test:farmbot       # compile gold, oracle equality, two-run byte match
npm run smoke:farmbot      # browser: panel counts, deep link, no external request
```

The test rebuilds the findings and the part-sources file in two private
directories, compares them byte for byte with the committed files, checks the
sidecar digest, confirms that every evidence node id exists in the committed
seed, and confirms that the check Intents are the only Cypher inputs recorded
in the findings.

`farmbot/test/findings-browser-parity.test.mjs` runs the engine with the exact
inputs the browser supplies — the committed seed, the committed check Intents
and the part-sources file, with no DuckDB extract — and requires the canonical
output to equal the committed findings bytes. It also requires the same result
for reversed and shuffled check-Intent records and source maps.
`farmbot/test/findings-view.test.mjs` covers the hash rules, the summary
templates, ordering, per-severity counts and evidence-row uniqueness.
