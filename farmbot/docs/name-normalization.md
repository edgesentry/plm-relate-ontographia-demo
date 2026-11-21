# Display-name normalization

The BOM part pages use display titles such as `M5 x 10mm Screw`, while the
assembly and manufacturing pages refer to parts in prose and in packing-list
cells such as `[[M5 x 10mm Screws]]`, `Belt (1.7m)`, or
`X-Axis [[Cable Carrier]]`. The extract matches those references to the BOM
part pages and records what it could not match. It never rewrites the source
names and never changes a quantity.

The matching is ours. It is a constructed correspondence between pages in the
pinned submodule; it is not an official FarmBot label.

## Matching order and normalization

`farmbot/scripts/lib/normalize.mjs` is the source of truth for the matching
tiers (`resolveName`), the normalization steps (`normalizeName`), the singular
form (`singularizeName`) and the packing-only qualifier tier
(`resolveWithQualifier`).

Two intent points are worth keeping. A tier that matches more than one part is
treated as ambiguous, and the extract does not choose a candidate. Length
numbers stay part of a name (`M5 x 10mm Screw` is not reduced to `M5 Screw`),
because lengths distinguish individual parts.

## Qualifier-assisted matching

Some packing-list cells put the distinguishing words outside the link, such as
`X-Axis [[Cable Carrier]]`; `Cable Carrier` alone is ambiguous, but the
qualified name resolves to one part. A qualifier is tried only when the raw
link name does not resolve. Qualifiers are not used for assembly prose: a
phrase such as `wood screws` stays unresolved because the prose does not say
which wood-screw part is meant.

## Unmatched names

Every unresolved display name is written to `unmatched_name` by
`farmbot/scripts/extract.mjs`; that table and its columns are the source of
truth for what is recorded. Names that do not resolve are kept, not dropped and
not assigned to a nearest part. The diagnostic candidates recorded with them
are never used to resolve anything.

The pinned pages leave some names unresolved for a reason. `Wood Screws` and
`Magnets` each match more than one part, so the reference does not say which
one; `Tee Nuts` has no BOM part page at all.

## Quantities

`farmbot/scripts/extract.mjs` defines how part and packing quantities are read,
summed per page, and inherited by nested components; it also writes difference
rows. No quantity is corrected and no cause is inferred.

A comparison is `match` when the sums agree, `difference` when both sides are
plain counts and disagree, and `not_comparable` when the packing cell uses a
non-count unit such as `1 pack` or `1 each`. Difference rows are written to
`quantity_difference` as they are.
