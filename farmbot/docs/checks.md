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
| `r2-assembly-unmatched.json` | `AssemblyChapter` | `HAS_USAGE` → `Usage` | R2 |
| `r2-manufacturing-unmatched.json` | `ManufacturingContainer` | `HAS_USAGE` → `Usage` | R2 |
| `r3-parts.json` | `Part` | — | R3 |
| `refs-assembly.json` | `AssemblyChapter` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4 |
| `refs-preassembly.json` | `PreAssembly` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4 |
| `refs-bag.json` | `Bag` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4 |
| `refs-kit.json` | `Kit` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4 |
| `refs-carton.json` | `Carton` | `HAS_USAGE` → `Usage` → `USES_ITEM` → `Part` | R3, R4 |
| `r5-unreadable-preassemblies.json` | `PreAssembly` | filter `machine_readable = false` | R5 |

The two R2 Intents bind `"unmatched"` as `$param_0`; the R5 Intent binds
`false` as `$param_0`. No other Intent carries a filter. Limits are 100 for the
small rules and 1000 for the part and reference lists; the runner throws if a
result reaches its limit, so a limit never truncates a finding silently.

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
| `findings` | the findings, sorted by id |

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
| `reference` with `usage:assembly:` or `usage:preassembly:` | Assembly / pre-assembly |
| `reference` with `usage:packing:` | Packing |
| `pre-assembly-page` | Assembly / pre-assembly |
| `design-change` | Design change |
| `service` | Service |

The last two roles are reserved for rules that do not emit evidence yet. Any
other role, structure prefix or usage kind throws instead of landing in a
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
| R2 | each structure → its unresolved reference, plus a dashed missing edge from the reference to the EBOM lane |
| R3 | dashed missing edges from the part to the assembly and packing lanes |
| R4 | the part → each packing line → the packing structure, plus a dashed missing edge from the part to the assembly lane |
| R5 | none; the page node stands alone |

A missing edge ends at a lane-level placeholder (`lane:<lane id>`), never at an
invented node: the target lane may not be drawn at all, and a placeholder is
not a node and is not counted as one. It records what the evidence cannot
confirm: the name resolves to no part (R2), no process references the part
(R3), or no assembly chapter, pre-assembly or bag references the packed part
(R4). The diagram names the target lanes of its missing links in a note below
the SVG; the edge itself is a short dashed stub inside the source lane, so it
never points at an empty column.

### Highlight and selection

Problem nodes are the finding's subject node, every quantity comparison node
and every unresolved reference. The impacted path is the link edges whose two
ends are both problem nodes. A quantity comparison node also shows the product
variant and the signed difference from its `facts` (`+4`, `−8`, `0`) with a
sign class.

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
`packing-structure`, `structure`, `reference` and `pre-assembly-page`.

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
- `structure`: a page-level node.
- `pre-assembly-page`: `preassembly_page` has no line.
- R2 packing reference lines: `packing_item` has no line column.

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

with `action` at 10 or more, `review` at 6 to 9, and `info` below 6. R3 and R4
are always `info`: they report a gap in the extract rather than a disagreement
between two documents, and the missing pre-assembly data can explain them
without any action on the part. The score and its factors are written into the
finding. On the current seed R1 has 11 action and 1 review, R2 has 2 review and
11 info, and R3, R4 and R5 are all info.

Overlap counts the other findings with the same subject node id. R1 findings for
the same part under `standard` and `xl` therefore both carry overlap 1; an R2
subject is a display name with no node id, so its overlap is 0.

## Causes and countermeasures

Causes come from fixed per-rule templates in `src/farmbot/agent/templates.mjs`.
Each cause is labelled `fact` when it restates an evidence value or a seed
property, and `inference` when it is a candidate explanation. A cause that
points at another rule carries that rule id. Every R3 and R4 finding includes
an inference with rule `R5`: the non-machine-readable pre-assembly pages cannot
contribute references, so the part may be listed on one of them. The finding
lists the page paths in that cause text.

The tool shows that two documents disagree. It does not decide which document
is right, and the countermeasures ask the reader to confirm the intended value
or add the missing reference.

## SQL oracles

Each rule has an independent DuckDB query under `farmbot/oracle/`. The test
compares the findings with these queries as sets (and as a multiset for R2,
which keeps one row per reference line):

| Oracle | Returned key | Rows on the current seed |
|---|---|---|
| `r1-packing-quantity.sql` | part, version, packing quantity, part quantity, difference, packing page | 12 |
| `r2-unresolved-references.sql` | display name, source file, line, source kind | 19 |
| `r3-unreferenced-parts.sql` | part name | 44 |
| `r4-packed-unreferenced-parts.sql` | part name | 11 |
| `r5-unreadable-preassemblies.sql` | page path, title, reason, PDF count | 6 |

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
