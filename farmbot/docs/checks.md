# FarmBot checks

The check engine turns check Intents into findings. A check Intent is the same
JSON shape as a preset-question Intent: it names a start class, a linear
traversal chain, optional property filters and the projections to return. The
engine compiles it with `@edgesentry/ontographia-wasm` 0.1.9, executes it with
`@relate/relate-wasm` 1.0.1 against the committed seed, and evaluates a
deterministic rule in `src/farmbot/agent/`.

The same ESM modules run in Node and in the browser. `src/farmbot/agent/` has no
Node-only import: the caller supplies the compiler, the executor, the check
Intent JSON, the seed digest and a map from node id to source file.
`farmbot/scripts/agent-farmbot.mjs` is the Node entry; the `/farmbot/` screen
supplies the same values from committed files (see [Browser entry](#browser-entry)).

## Rules

| ID | Direction | Check | Findings on the current seed |
|---|---|---|---|
| R1 | packing → design | packing quantity differs from the part page quantity | 12 |
| R2 | process → design | a reference in assembly, pre-assembly or packing does not resolve to a part | 13 names (19 lines) |
| R3 | design → process | part referenced by no process: no assembly chapter, pre-assembly, bag or packing list | 44 |
| R4 | packing → process | part packed but not referenced by any assembly chapter, pre-assembly or bag | 11 |
| R5 | all → document | pre-assembly page with no machine-readable parts table | 6 |
| R6 | design → packing/service | a name changed or removed in the Change Log still appears in a packing or service page | 9 (6 facts, 3 inferred) |
| R7 | design → downstream | a changed part reaches no assembly chapter, pre-assembly, packing list or service page | 6 |
| R8 | service → design | a part named by a service page is absent from assembly chapters and pre-assemblies | 5 |
| R9 | service → design | a service-page reference does not resolve to a part | 1 |

### R1: packing quantity differs from the part page

One finding per `quantity_difference` row, which is one part and one product
version. The rule joins three Intents on the difference node id: the compared
part, the packing container and the product variant. A part compared for both
`standard` and `xl` therefore produces two findings that share the part node.

### R2: a reference does not resolve to a part

One finding per distinct `display_name`, grouped in the rule module. The two
Intents keep the usage lines whose `match_method` is `unmatched`: one starts on
`AssemblyChapter`, the other on `ManufacturingContainer` (pre-assembly pages,
kits, the carton and bags). On the current seed the 19 lines are 4 in assembly
chapters, 9 in pre-assembly pages and 6 in packing lists.

### R3: a part referenced by no process

The engine has no negation, so the rule takes the part list and subtracts the
union of five reference Intents: assembly chapters, pre-assembly pages, bags,
kits and the carton. A bag owns the `Accessory bag BOM` section of a
pre-assembly page, so bags are a separate reference source.

### R4: a part packed but not referenced by a process

The packing references are the kit and carton Intents; the process references
are the assembly chapter, pre-assembly and bag Intents. Every packing reference
row carries its whole `Part` node, so R4 is derived from those rows; only R3
reads the full part list (`r3-parts.json`). A part is reported when it appears in
the packing references and in none of the process references. On the current
seed this is 11 parts. A part referenced only by pre-assembly pages is not
reported by R4; on the current seed `M3 Locknut` is referenced by four
pre-assembly pages.

### R5: a pre-assembly page with no machine-readable parts table

One finding per `PreAssembly` node whose `machine_readable` property is false.
On the current seed there are 6: 5 marked `pdf-only` and one index page with no
component list. The page contributes no usage lines, so its components cannot
appear in R3 or R4. R5 is a coverage limit and is always listed as a cause
candidate in those two rules.

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

Every finding carries the boolean `inferred`. It is `true` only for the prose
match; the finding view labels it `fact` or `inferred`. On the current seed R6
has 6 facts and 3 inferred names (Tee Nuts, PTFE Tape, Crop Stickers).

### R7: a changed part reaches nothing

A changed part is the target of a resolved `change_note_link`; the current seed
has 19. Reach is any resolved usage line in an assembly chapter, a
pre-assembly (including its Accessory bag BOM rows), a packing list or a
service page. One finding is emitted for each changed part with no such
reference, so 6 of 19. The R5 pages and unresolved names are cause candidates:
the part may be listed on a page the extract cannot read, or under a name that
did not resolve.

### R8: a service-only part

One finding per part named by a service page that no assembly chapter or
pre-assembly references. The current seed has 19 service-referenced parts and 5
findings: Leadscrew Block, Shaft Coupler and Pressure Regulator are also packed,
while Shunt and Z-Axis Extrusion have no other reference. The packing rows are
evidence, not a reason to exclude the part. R4 and R3 are cause candidates when
they apply, and R5 is always listed.

### R9: a service-page reference that does not resolve

One finding per distinct unresolved display name on a service page. The
finding lists the candidate parts the extract recorded (none on the current
seed) and names every service page, packing page and assembly page that uses
the same normalized name. The current seed has one: `tee nuts` on the
winter-storage page.

## Check Intents

Every file under `farmbot/checks/` is a complete Intent. All traversals use
`direction: out` and start on the relationship's `from_class` side, because
Ontographia 0.1.9 rejects inbound steps (`edgesentry/ontographia#164`). No
Intent uses `DISTINCT`, negation, sums or branching; those operations belong to
the rule module (upstream issues `edgesentry/ontographia#166` and
`edgesentry/ontographia#167`).

| File | Start | Chain | Rule |
|---|---|---|---|
| `r1-quantity-difference.json` | `QuantityDifference` | `COMPARES_PART` → `Part` | R1 |
| `r1-compared-in.json` | `QuantityDifference` | `COMPARED_IN` → `ManufacturingContainer` | R1 |
| `r1-for-variant.json` | `QuantityDifference` | `FOR_VARIANT` → `ProductVariant` | R1 |
| `r2-assembly-unmatched.json` | `AssemblyChapter` | `HAS_USAGE` → `Usage` | R2, R9 |
| `r2-manufacturing-unmatched.json` | `ManufacturingContainer` | `HAS_USAGE` → `Usage` | R2, R6, R9 |
| `r3-parts.json` | `Part` | — | R3 |
| `refs-assembly.json` | `AssemblyChapter` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4, R7, R8 |
| `refs-preassembly.json` | `PreAssembly` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4, R7, R8 |
| `refs-bag.json` | `Bag` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4, R6, R7, R8 |
| `refs-kit.json` | `Kit` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4, R6, R7, R8 |
| `refs-carton.json` | `Carton` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4, R6, R7, R8 |
| `r5-unreadable-preassemblies.json` | `PreAssembly` | filter `machine_readable = false` | R5, R7, R8 |
| `r6-changes.json` | `DesignChange` | — | R6 |
| `changed-parts.json` | `DesignChange` | `AFFECTS_PART` → `Part` | R6, R7 |
| `refs-service.json` | `ServiceProcedure` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R6, R7, R8 |
| `r9-service-unmatched.json` | `ServiceProcedure` | `HAS_USAGE` → `Usage`, filter `match_method = unmatched` | R6, R9 |
| `unmatched-candidates.json` | `UnmatchedName` | `CANDIDATE` → `Part` | R7, R9 |

The two R2 Intents and the R9 service Intent bind `"unmatched"` as `$param_0`;
the R5 Intent binds `false` as `$param_0`. No other Intent carries a filter.
Limits are 100 for the small rules and 1000 for the part, reference and
candidate lists; the runner throws if a result reaches its limit, so a limit
never truncates a finding silently. `changed-parts.json` is shared by R6 and
R7, and `refs-service.json` is shared by R6–R8; a shared Intent is recorded in
every rule that reads it.

`farmbot/checks/compiled.gold.json` pins the compiler output for every Intent
(query text and params). A test recompiles each file and requires an exact
match.

## Findings document

`npm run agent:farmbot` writes `farmbot/dist/farmbot.findings.json` and
`farmbot/dist/farmbot.findings.json.sha256`. The document has:

| Key | Content |
|---|---|
| `format` | `farmbot-findings-v1` |
| `seed` | `digest` from `farmbot.seed.json.sha256` and the seed `bytes` |
| `rules` | one entry per rule: direction, finding count, intent files, severity counts, title |
| `findings` | the findings, sorted by id; each finding has the boolean `inferred` |

Object keys are sorted at every level, the file is pretty-printed with two
spaces and ends in one newline. Array order is fixed: findings by id, evidence
rows by role and then node id, queries by Intent path, rules by rule id. No
timestamp, absolute path or host value is written.

The sidecar is one line, `farmbot-findings-v1 sha256:<64 lowercase hex>`, the
SHA-256 of the exact findings bytes. It follows the same style as
`farmbot.seed.json.sha256`.

The Node entry reads part page paths from the DuckDB extract
(`SELECT name, path FROM part`) and passes them to the engine. The extract is
not committed; in CI a test builds a private extract and passes `--extract`.
The rule evaluation itself never reads the extract.

The same run writes `farmbot/dist/farmbot.part-sources.json`
(format `farmbot-part-sources-v1`, canonical JSON with sorted keys and one
trailing newline). It maps `part:<name>` to the part page path for every part
that has one, and it is the only caller input the browser cannot derive from
the seed. The findings document and its sidecar do not include this file; only
the part evidence `sourceFile` values depend on it.

`node farmbot/scripts/agent-farmbot.mjs --write-compiled-gold` regenerates the
compiled-Intent gold file.

## Browser entry

`src/farmbot/data.ts` imports every committed file the browser needs; nothing
under `farmbot/checks/` is copied:

| Input | Where it comes from |
|---|---|
| compiler | `@edgesentry/ontographia-wasm` through `src/lib/ontographia.ts` |
| ontology text | `farmbot/ontology/farmbot.native.yaml?raw` |
| check Intents | one JSON import per file in `INTENT_FILES`, keyed by file name |
| part page paths | `farmbot/dist/farmbot.part-sources.json` |
| seed digest and bytes | the verified fetch in `src/farmbot/session.ts` |
| executor | the same in-memory Relate session the preset questions use |

The screen does not bundle `farmbot.findings.json`. It imports only the
sidecar `farmbot.findings.json.sha256?raw` so it can compare the browser result
with the committed digest.

Checks run when the reader presses **Run checks**, or automatically once after
load when the URL carries a well-formed finding deep link. Both paths open (or
reuse) the Relate session; the seed is fetched and its SHA-256 checked before
Relate is imported, exactly as for a preset question.

## Notification panel

The panel is computed in the browser after the verified seed loads. It shows
the total number of findings and one count per severity level, ordered by
severity, then by `severityScore` descending, then by id ascending. The order
does not depend on the order of the inputs. The UI severity labels are:

| Stored level | English label | Japanese label |
|---|---|---|
| `action` | Action needed | 対応が必要 |
| `review` | Check | 確認 |
| `info` | Info | 情報 |

The panel also shows whether the result matches the committed document: the
browser canonicalizes its findings with sorted keys, takes the SHA-256 of those
bytes, and compares the hex with the committed sidecar. A match line names the
digest; a mismatch is shown as an error instead. The computed count, ids,
per-severity counts and digest are also written to the debug hook that the
browser smoke reads.

## Finding view

Opening a finding from the panel, or loading a deep link, shows:

- a one-line summary from the per-rule template filled from `subject` and
  evidence `facts` / `sourceFile` (Japanese and English);
- a process-lane diagram above the table, built from the same evidence rows
  (see [Process lanes](#process-lanes));
- one row per evidence entry: role, seed node id, source file and, when the
  row has one, the line number; the values from that node; and a collapsible
  list of the Intent, Cypher and bound parameters that produced the row;
- cause candidates, each labelled `fact` or `inferred` (`inference` in the
  data), and the countermeasures.

Cause and countermeasure texts come from `src/farmbot/agent/templates.mjs` and
are stored in English. They are rendered as-is in both languages; the labels,
the headings and the one-line summary follow the selected language. Every
value is a React text node, so FarmBot document text is never interpreted as
HTML.

Evidence rows are unique per finding by role, node id, source file and line.
`evidenceRows` in `src/farmbot/findings-view.mjs` drops a repeated row and
attaches the finding's queries, so a row never appears twice.

## Process lanes

The finding view draws one hand-built SVG diagram above the evidence table.
`src/farmbot/ProcessLanes.tsx` renders it; `layoutFinding` in
`src/farmbot/process-lanes.mjs` computes it without the DOM, so the Node tests
and the screen share one layout. Styling is classes and React attributes only
(no `<style>` element, no HTML string), so the page keeps `style-src 'self'`.

### Lanes

The lane order is fixed, left to right: Design change, EBOM part, Assembly /
pre-assembly, Packing, Service. A lane is drawn only when the finding has a
node in it.

| Evidence role | Lane |
|---|---|
| `part` | EBOM part |
| `quantity-difference` | Packing (the packing count is compared with the part page) |
| `packing-line`, `packing-structure` | Packing |
| `structure` with `chapter:` or `preassembly:` | Assembly / pre-assembly |
| `structure` with `container:` or `bag:` | Packing |
| `structure` with `service:` | Service |
| `reference` with `usage:assembly:` or `usage:preassembly:` | Assembly / pre-assembly |
| `reference` with `usage:packing:` | Packing |
| `reference` with `usage:service:` | Service |
| `pre-assembly-page` | Assembly / pre-assembly |
| `design-change` | Design change |
| `service` | Service (the service page that owns the reference) |

Any other role, structure prefix or usage kind throws instead of landing in a
guessed lane, so a new rule has to declare its lane.

### Nodes

A node is one unique `nodeId` from the finding's evidence rows; it lists the
evidence row indexes it represents. Rows are ordered by lane order, then role,
then node id (plain code-unit comparison), then source file and line. The
evidence table uses the same order, so an index names the same row in both
places and a permuted evidence array produces the same diagram. The diagram
never draws a node the evidence rows do not cite.

### Edges

Edges come only from the evidence rows, by rule:

| Rule | Edges |
|---|---|
| R1 | each packing line → the quantity comparison → the part |
| R2 | each structure → an unresolved reference naming the same source file, plus a dashed missing edge from the reference to the EBOM lane |
| R3 | dashed missing edges from the part to the assembly and packing lanes |
| R4 | the part → each packing line → the packing structure, plus a dashed missing edge from the part to the assembly lane |
| R5 | none; the page node stands alone |
| R6 | the design change → the part (fact) or → each matching packing line and service reference (inferred); the part → each packing line and service reference that resolved to it, or each unmatched line and reference when the finding has one part; a packing line → its packing structure; a service reference → its service page, both joined by the same source file |
| R7 | the design change → the part, plus a dashed missing edge from the part to the assembly, packing and service lanes |
| R8 | the part → each service reference → its service page and → each packing line → its packing structure, joined by the same source file, plus a dashed missing edge from the part to the assembly lane |
| R9 | the service page → its unresolved reference, the reference → each candidate part the extract recorded, plus a dashed missing edge from the reference to the EBOM lane |

For R6, R8 and R9, a service reference and its service page are linked only when
both rows name the same `sourceFile`, exactly as for R2. R6 and R8 also join a
packing line to a packing structure only when both rows name the same
`sourceFile`, so a finding that cites two packing pages keeps two links rather
than a Cartesian product. A reference with no service page from the same source
file gets no page link. R6 inferred findings have no part node, so the design
change links straight to the downstream rows it matched. An R6 fact that also
absorbed an unmatched row attaches that row to the part (or to the design change
when the finding has more than one part), so every downstream node stays
reachable from the change. An R9 candidate part hangs off the unresolved
reference and is not left alone in the EBOM lane.

For R2, a structure → reference link is drawn only when the structure evidence
row and the reference evidence row name the same `sourceFile`. A reference with
no structure from the same source file gets no structure link, only its missing
edge.

A missing edge ends at a lane-level placeholder (`lane:<lane id>`), never at an
invented node: the target lane may not be drawn at all, and a placeholder is
not a node and is not counted as one. It records what the evidence cannot
confirm: the name resolves to no part (R2, R9), no process references the part
(R3), no assembly chapter, pre-assembly or bag references the packed part (R4),
no downstream page references the changed part (R7), or no assembly chapter or
pre-assembly references the service part (R8). The diagram names the target
lanes of its missing links in a note below the SVG; the edge itself is a short
dashed stub inside the source lane, so it never points at an empty column.

### Highlight and selection

Problem nodes are the finding's subject node, every design-change node, every
quantity comparison node, every unresolved reference and every packing line
whose `matchMethod` is `unmatched`. The impacted path is the link edges whose
two ends are both problem nodes. A quantity comparison node also shows the
product variant and the signed difference from its `facts` (`+4`, `−8`, `0`)
with a sign class.

Selecting a node highlights the evidence rows it represents and scrolls the
first of them into view; selecting an evidence row highlights its node. The
selected row carries `data-selected="true"`. Nodes are keyboard reachable and
select on Enter or Space.

### Node cap and overflow

`DEFAULT_NODE_CAP` is 12, above the largest committed finding (7 unique
evidence nodes). Nodes beyond the cap are not drawn; the diagram reports how
many were left out and points at the evidence table, which still lists every
row.

### Diagram attributes

Nodes carry `data-node-id`, `data-lane`, `data-evidence-index` (a comma list),
`data-problem` and `data-selected`; edges carry `data-from`, `data-to`,
`data-kind` (`link` or `missing`) and `data-path`. The browser smoke reads
these attributes. `farmbot/test/process-lanes.test.mjs` covers the lane
mapping, the node and edge sets of every committed finding, determinism under
reversed and shuffled evidence, the quantity sign classes, the highlight
rules, the node cap and the coordinates.

## Deep link

The format is `#finding=<id>`, where `<id>` is a finding id from the committed
document.

- Accepted ids match `^[A-Za-z0-9-]+$` after one safe percent-decode and are at
  most 64 characters. The id scheme itself is shorter.
- A hash with another key, an empty payload, an invalid escape, an unsupported
  character or an overlong payload is ignored: no session is opened, no request
  is made and no error is shown.
- A well-formed id that does not exist runs the checks but opens nothing and
  shows no error.
- `hashchange` after load opens a matching finding once the checks have
  finished. Selecting a finding in the panel updates the address with
  `history.replaceState`, which sends no request.

`parseFindingHash` in `src/farmbot/findings-view.mjs` implements these rules
and is covered by `farmbot/test/findings-view.test.mjs`.

## Finding id

A finding id is the rule id, a hyphen, and a lowercase ASCII slug of the
finding's subject key:

| Rule | Subject key |
|---|---|
| R1 | `<part name> <product variant code>` |
| R2 | unresolved display name |
| R3, R4 | part name |
| R5 | pre-assembly page path |
| R6 | part name (fact) or normalized display name (inferred) |
| R7, R8 | part name |
| R9 | unresolved service display name |

The slug keeps `[a-z0-9]`, turns every other run into one hyphen and trims
hyphens at both ends. When a slug is longer than 48 characters, or two subjects
in the same rule share a slug, the id ends with `-` plus eight lowercase hex
digits of an FNV-1a hash of the full subject key. Ids match
`^[A-Za-z0-9-]+$`, are unique within the document and are intended for
`#finding=<id>` deep links.

The id of a subject depends only on the set of subjects, not on the order in
which they are passed: subjects are sorted by rule and key before any collision
is resolved, and the ids are returned keyed by rule and subject key. A repeated
rule-and-key pair is rejected rather than given two ids.

## Evidence rows

Each finding has at least one evidence row:

| Field | Content |
|---|---|
| `nodeId` | seed node id, checked against `farmbot.seed.json` |
| `role` | what the node is in this finding |
| `sourceFile` | FarmBot document path, or `null` when no path exists |
| `line` | 1-based line number, or `null` when the source has none |
| `facts` | the values taken from that node for this finding |

Evidence roles are `quantity-difference`, `part`, `packing-line`,
`packing-structure`, `structure`, `reference`, `pre-assembly-page`,
`design-change` and `service`. A `service` row is the service page that owns a
service reference; a `reference` row is one of its usage lines.

Rows within one finding are unique by role, node id, source file and line: a
repeated row is the same citation of the same node and is dropped before the
rows are sorted. A structure node referenced on several lines of one page is
therefore cited once per finding.

Line numbers are available only on assembly and pre-assembly reference lines:
the `Usage` node copies `line_number` from `assembly_reference` or
`preassembly_reference`. The following kinds always emit `"line": null`:

- `part`: the `part` table has no line column.
- `quantity-difference`: derived from `quantity_difference`, which has no line.
- `packing-line` and `packing-structure`: `packing_item` stores table, row and
  child indexes, not a document line.
- `design-change`: the Change Log `line_number` of the note.
- `service`: a page-level node; `service_page` has no line.
- `structure`: a page-level node.
- `pre-assembly-page`: `preassembly_page` has no line.
- R2 packing reference lines: `packing_item` has no line column.
- R6, R7 and R8 packing rows: `packing_item` has no line column; their service
  reference rows keep the `service_reference.line_number`.

A part evidence row's `sourceFile` is the part page path supplied by the Node
entry from the extract. If a caller supplies no source for a node, the field is
`null` rather than an invented path.

## Severity

Every finding carries four integer factors: `processesReached` (distinct
structure nodes in the finding), `productVariantsReached` (R1: distinct product
variant codes among the part's quantity differences; R3 and R4: the number of
product versions for which the part declares a quantity; other rules: 0),
`quantityDifference` (absolute packing-minus-part difference) and `overlap`
(the number of other findings with the same subject node id). The severity
score is

```
score = 2 * processesReached + productVariantsReached
      + min(quantityDifference, 10) + 2 * overlap
```

with `action` at 10 or more, `review` at 6 to 9, and `info` below 6. R3, R4,
R7 and R8 are always `info`: they report a gap in the extract rather than a
disagreement between two documents, and the missing pre-assembly data can
explain them without any action on the part. The score and its factors are
written into the finding. On the current seed R1 has 11 action and 1 review, R2
has 2 review and 11 info, R3, R4 and R5 are all info, R6 has 3 review and 6
info, R7 and R8 are all info, and R9 is info.

Overlap counts the other findings with the same subject node id. R1 findings for
the same part under `standard` and `xl` therefore both carry overlap 1; an R2
subject is a display name with no node id, so its overlap is 0.

## Causes and countermeasures

Causes come from fixed per-rule templates in `src/farmbot/agent/templates.mjs`.
Each cause is labelled `fact` when it restates an evidence value or a seed
property, and `inference` when it is a candidate explanation. A cause that
points at another rule carries that rule id. Every R3, R4, R7 and R8 finding
includes an inference with rule `R5`: the non-machine-readable pre-assembly
pages cannot contribute references, so the part may be listed on one of them.
R7 also names unresolved names whose candidate list contains the part, and R8
names R4 and R3 when the part is packed or referenced by nothing else. R6
states whether the name came from a resolved link or from a removal statement.

The tool shows that two documents disagree. It does not decide which document
is right, and the countermeasures ask the reader to confirm the intended value
or add the missing reference.

## SQL oracles

Each rule has an independent DuckDB query under `farmbot/oracle/`. The test
compares the findings with these queries as sets, except R2 and R9, which keep
one row per reference line and are compared as multisets. `r6-changed-names.sql`
applies the same name normalization as the rule module (parentheticals, `&`,
`w/`, `×`, and a singular fallback) and promotes an inferred match whose key
equals a changed part to a fact row, including an unmatched row that other
rules would not treat as a packing item.

| Oracle | Returned key | Rows on the current seed |
|---|---|---|
| `r1-packing-quantity.sql` | part, version, packing quantity, part quantity, difference, packing page | 12 |
| `r2-unresolved-references.sql` | display name, source file, line, source kind | 19 |
| `r3-unreferenced-parts.sql` | part name | 44 |
| `r4-packed-unreferenced-parts.sql` | part name | 11 |
| `r5-unreadable-preassemblies.sql` | page path, title, reason, PDF count | 6 |
| `r6-changed-names.sql` | subject name, inferred flag, source file | 13 rows (9 findings) |
| `r7-unreached-changed-parts.sql` | changed part name | 6 |
| `r8-service-only-parts.sql` | part name, packed flag | 5 |
| `r9-unresolved-service.sql` | display name, source file, line, candidates | 1 |

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
