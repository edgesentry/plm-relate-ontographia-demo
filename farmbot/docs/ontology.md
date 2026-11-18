# FarmBot Genesis ontology

This document describes the standalone ontology in
`farmbot/ontology/farmbot.native.yaml` and how it maps onto the DuckDB extract
built by `farmbot/scripts/extract.mjs`. The YAML is the source of truth for the
classes, relationships and properties; this document records the purpose and the
design constraints behind them.

## Purpose

The ontology models one pinned release of the FarmBot Genesis documentation
set (v1.7): its parts, the two product versions, the assembly chapters, the
pre-assembly pages, the packing lists, and the comparisons and unmatched
names that the extract derives. It exists so that intents can be compiled
into Cypher against a named, typed schema instead of against column names
guessed at query time.

The extract also carries the Change Log notes and the troubleshooting and
maintenance service pages. They are mapped to graph classes too: `DesignChange`
reads `change_note` and links to parts through `AFFECTS_PART`;
`ServiceProcedure` is a subclass of `Structure`, so its references are ordinary
`Usage` lines and unresolved service names become `UnmatchedName` nodes seen in
the service page.

The file is self-contained. It does not import, extend, wrap or copy any
other ontology in this repository or elsewhere, and it is not tied to the
unrelated product-structure demo that also lives here: different namespace,
different classes, different tables. Nothing in the FarmBot path reads from
or writes to that demo.

## Manage the generation logic, not the graph

The repository holds three things: the ontology, the deterministic code that
turns the extract into graph data (`farmbot/scripts/graph.mjs` and the
recipes in `farmbot/recipes/`), and the digests of the extract and of the
generated graph. The DuckDB file and any graph store are build outputs: they
are produced in CI and thrown away. A change in the graph is therefore always
explained by a change in the ontology, the generation code, or the pinned
source, never by someone editing a store by hand.

The UI seed is the one exception. `farmbot/dist/farmbot.seed.json` and its
sidecar are committed because the deploy build does not run the extract. The
DuckDB file and any Relate store stay out of git. The tests regenerate the
seed from a private copy of the extract and fail on any byte difference.

## Graph generation

`farmbot/scripts/graph.mjs` opens the DuckDB extract read-only, reads the
ontology, and writes a JSON seed plus a digest sidecar. Its options, their
defaults and the sidecar format are defined by that script.

The recipes under `farmbot/recipes/` select what the run writes: the `full`
recipe writes the whole graph, and the `part` recipe writes a strict subgraph
for one named part. How a recipe expands is a property of the recipe file, not
of this document.

Node ids are stable and derived only from extract keys. The generator defines
the id scheme, and it validates each label, property and relationship type,
including the declared source and target classes, before it writes anything, so
an undeclared name fails the run.

The seed is canonical: object keys are sorted, nodes and edges are sorted, and
no clock, host name or environment value is read. The committed seed's digest
sidecar records the SHA-256 of its exact bytes.

## Class model

`Item` and `Structure` are abstract. `Item` is the target of every usage
line, so `USES_ITEM` can be declared once for parts and containers alike.
`Structure` is the owner of every usage line, so `HAS_USAGE` can be declared
once for assembly chapters and containers alike. `ManufacturingContainer`
inherits from both, which is what makes a container usable as a component of
another container.

`QuantityDifference` is a subclass of `QuantityComparison`, not a separate
kind of node: both describe one comparison, and the subclass only marks the
subset whose packing count disagrees with the part page. The full class list,
superclasses and their source tables are in
`farmbot/ontology/farmbot.native.yaml`.

### Constructed views, not official labels

The engineering BOM grouping (assembly chapters) and the manufacturing BOM
grouping (pre-assembly, kit, bag, carton) are views this repository
constructs from the documentation. "EBOM" and "MBOM" are our shorthand. They
are not official FarmBot labels, and the model does not claim to reproduce
how FarmBot organises or builds its product.

## Relationships

Every relationship is declared exactly once and points outward
(`direction: out`). There are no relationship properties in the native
format; see the modelling rules for where the per-link facts went. The
declaration, with each relationship's source and target class, is in the
ontology YAML.

`SEEN_IN` and `CANDIDATE` are many-to-many in practice, because a name can be
seen on several pages and can have several candidate parts. `CANDIDATE` only
has targets when the extract recorded candidates; many unmatched names have
none. `APPLIES_TO` is only set where a row is unambiguously tied to one
version; a row that applies to both is left without that edge rather than
duplicated.

## Properties

Property names are DuckDB column names, except for a few values the graph
derives rather than reads from one column. The declared datatypes follow the
column types (`VARCHAR` → `string`, `INTEGER` → `integer`, `BOOLEAN` →
`boolean`). The property list, owner classes and datatypes are in the ontology
YAML; the derived names are the `DERIVED_PROPERTIES` set in
`farmbot/test/ontology.test.mjs`.

A few points of intent that the YAML does not carry:

- `Part.market_price` stays a string because the source mixes currencies and
  ranges.
- The extract stores product versions as a column value, not as a table, so the
  generator creates the two `ProductVariant` nodes itself and resolves the
  `version` column to `code`.
- `Usage.quantity` and `Usage.unit` are derived from the packing row for the
  applicable version; when a row carries both version counts the usage is not
  tied to one variant, so both are left null and no `APPLIES_TO` edge is
  emitted.

## Modelling rules

1. **Quantity lives on a usage node.** The native format has no relationship
   properties, so the count belongs to the `Usage` node rather than to
   `HAS_USAGE` or `USES_ITEM`. A consumer reading a quantity reads it from
   the usage line, not from the edge.

2. **Two kinds of variant.** `ProductVariant.code` is `standard` or `xl`,
   the values of the extract's `version` column. `Part` keeps
   `quantity_standard` and `quantity_xl` because the part page declares both
   counts itself. `PartVariant` is a different concept: it is an option of a
   part, such as a length, with its own row in `part_variant`.

3. **Comparisons and name resolution.** `QuantityDifference` is a subclass of
   `QuantityComparison`, and there is one node per comparison row, so a
   difference can be queried either as a comparison or as a difference.
   `Usage.match_method` records how each reference resolved (exact,
   normalized, qualified and so on), which is how a query can separate solid
   links from fuzzy ones.

4. **Container classification by page path.** A pre-assembly page becomes a
   `PreAssembly`, the main carton page becomes the `Carton`, and the other
   packing pages that carry a packing list become `Kit`. A packing page with no
   references is not modelled. `farmbot/scripts/graph.mjs` holds the paths.

5. **Bags are narrow.** Only pack-type `packing_item` rows and the
   `Accessory bag BOM` section of the pre-assembly pages produce `Bag` nodes.
   An ordinary item whose `sub_packing` column reads `Press-to-seal bag` does
   not create a bag; that value stays a `Usage` attribute. Component rows of a
   pack row keep the kit page path and record the pack label as plain text, so
   components cannot yet be attached to a bag by key.

6. **Carton-to-kit nesting is expressible but not populated.** `USES_ITEM`
   points at `Item`, and `ManufacturingContainer` is an `Item`, so a carton
   can use a kit as a component without another relationship name. The
   extract does not build those edges today, because the main carton page
   links kits with plain Markdown links instead of wikilinks. Filling them
   needs a separate extract change.

7. **Service procedures are Structures.** Making `ServiceProcedure` a
   subclass of `Structure` lets its references reuse `HAS_USAGE` → `Usage` →
   `USES_ITEM` unchanged. A service page is not a manufacturing container and
   does not enter the MBOM; it is a process document that reaches parts.

8. **Design changes only link resolved parts.** `AFFECTS_PART` comes from
   `change_note_link.resolved_part`. The Change Log text itself stays on the
   `DesignChange` node as text; it is not parsed for extra part names.

9. **Limitations of the currently pinned Ontographia version (see
   `package.json`).**
   (a) With `direction: in`, validation still checks the relationship's
   `from_class` against the previous node's class. Intents must therefore
   start from the `from_class` side and traverse outward.
   (b) Loading an ontology does not reject a relationship that names an
   undeclared class, a duplicate relationship name, or an unknown key; the
   parser ignores what it does not know. The test in
   `farmbot/test/ontology.test.mjs` performs those checks itself, so a
   malformed ontology fails the test suite rather than passing silently at
   load time.

## Validation

`farmbot/test/ontology.test.mjs` parses the YAML and checks the shape of the
declaration, every named class, the datatypes and directions against the allowed
sets, and that every modelled property (except the derived ones) is a real
column of a mapped source table in the DuckDB extract. It also compiles a few
intents through the WebAssembly binding to confirm that the declared
relationships produce the expected Cypher. When the extract is missing, the test
builds it with the existing extract script.

The graph test builds its own private copy of the extract, generates the full
seed twice, and checks byte-identical output and digests. It checks that every
label, property and relationship type in the seed is declared and that ancestor
labels are present, rebuilds the committed seed and digest from scratch, and
confirms that an undeclared name makes the generator fail. It also runs the part
recipe and checks that the result is a strict subset of the full graph.
`npm run test:farmbot` runs the extract, ontology, and graph tests.
