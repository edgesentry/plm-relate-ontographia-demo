# DuckDB extract distribution

The FarmBot tree builds one DuckDB file from the pinned Genesis submodule. The
binary is a build output and is not committed. The expected content digest is
committed, and the file is distributed in two ways: a short-lived CI artifact
and a GitHub Release. The same release carries the persistent Relate directory
store (`farmbot/docs/relate-store.md`).

The constructed EBOM and MBOM views, and the derived correspondence tables in
the extract, are ours. They are not official FarmBot labels.

## Build and test

Run from the repository root:

```sh
npm ci
node farmbot/scripts/extract.mjs
npm run test:farmbot
```

The extract script accepts `--source <path>` and `--out <directory>` (or
`FARMBOT_GENESIS_DIR` and `FARMBOT_OUT_DIR`). The default source is
`farmbot/third_party/farmbot-genesis`. The script refuses to run when that path
is missing, is not a git checkout, or is not at
`44e0fa24d4a538dfa1255a4e89308ccabf3abaeb`.

After a successful build:

- `farmbot/dist/farmbot.duckdb` — the DuckDB database (gitignored);
- `farmbot/dist/farmbot.duckdb.sha256` — the SHA-256 of a canonical dump of
  every table (lowercase hexadecimal plus a newline). This is not the hash
  of the `.duckdb` file bytes. The native file is not bit-identical across
  runs of the same extract: the logical rows are the same, but a small
  number of storage bytes change. The sidecar is tracked.

The current schema version is **2**. Schema version 1 had the same tables
except `change_note`, `change_note_link`, `service_page` and
`service_reference`; those four tables were added in version 2. Its canonical
digest was `6c32e7067b21679531fd7b6959670b76dcad461227137c96e54078a70ac3ee84`.
The current digest is
`9bf30774ca18b815d2c7ba2bc6f221a0bf0e9e03acdeb1d11676b8cb22c4c040`.
Every schema version 1 table keeps the same logical dump, so only
`extract_metadata` and the four new tables differ.

`npm run test:farmbot` rebuilds the database, computes the canonical digest,
and compares it with the tracked sidecar. The test is scoped to the FarmBot
tree and is not part of `npm run verify` or `npm run smoke`.

To build the release files (DuckDB, store archive, manifest and
`SHA256SUMS`) and to check a downloaded copy:

```sh
npm run release:assets -- --out release-assets
npm run release:verify -- release-assets
```

## Reproducibility

The same submodule pin, the same extract code, and the same pinned DuckDB
version produce the same canonical digest. The build does not read the
clock, the host name, or any environment-specific value, and it inserts rows
in a fixed order. The output file name is always `farmbot.duckdb`.

The canonical digest is SHA-256 over a stable dump, not over the `.duckdb`
file. The dump format (`farmbot-canonical-v1`) is: every base table in name
order; for each table, the column names in ordinal order, then every row
ordered by those columns, as JSON. The extract script writes this digest to
the sidecar after each successful build. To check a downloaded copy, rebuild
or run:

```sh
node --input-type=module -e "import { canonicalDigest } from './farmbot/scripts/extract.mjs'; const d = await canonicalDigest('farmbot/dist/farmbot.duckdb'); const fs = await import('node:fs'); const expected = fs.readFileSync('farmbot/dist/farmbot.duckdb.sha256', 'utf8').trim(); if (d !== expected) { console.error('canonical digest mismatch'); process.exit(1); } console.log(d);"
```

`npm run test:farmbot` performs the same check, including a rebuild.

## What the extract contains

| Table | Contents |
| --- | --- |
| `part` | One row per BOM part page with a `quantity` key (149 rows). `quantity_standard` and `quantity_xl` are per-kit totals across variants; the raw pipe-delimited values are kept in the `_raw` columns. |
| `part_variant` | Positional variant rows for the part pages with a pipe-delimited `variants` field. |
| `bom_category` | BOM category index pages and their part counts. |
| `assembly_page`, `assembly_reference` | Top-level assembly chapters and every `[[part name]]` reference. |
| `preassembly_page` | Pre-assembly pages with `machine_readable`, a reason, PDF count, and reference count. PDF-only pages are recorded as not machine-readable; no OCR is performed. |
| `preassembly_reference` | Components from Markdown component tables and component lists. |
| `packing_page`, `packing_item` | Packing-list rows, including nested screw-pack components with their own quantities. |
| `quantity_comparison` | Packing-list quantity sums compared with part-page quantities, per page and version. |
| `quantity_difference` | The subset of comparisons whose plain-count quantities disagree. |
| `unmatched_name` | Display names that did not resolve, with source counts and diagnostic candidates. |
| `change_note` | One row per text unit of the v1.7 Change Log page: the section heading, the 0-based unit index within the section, the raw source text (plain text, no HTML rendering), the 1-based first source line, the linked display names in order, the link count, and a resolution status (`no_links`, `all_resolved`, `none_resolved` or `partially_resolved`). A unit is one paragraph or one list item; image-only lines and blank lines end a unit and are not units themselves. |
| `change_note_link` | One row per `[[part name]]` link in the Change Log, in section/unit order: the section, unit index, 0-based link index within the unit, line, display name, normalized name, resolved part, match method and diagnostic candidates. |
| `service_page` | Every troubleshooting or maintenance page under `v1.7/extras/troubleshooting/` and `v1.7/extras/maintenance/` that carries at least one part link: path, frontmatter title, kind (`troubleshooting` or `maintenance`) and reference count. Pages with no part links are not listed. `pallet-stacking.md` lives under `v1.7/manufacturing/packing/`, so it is not a service page at all. |
| `service_reference` | One row per part link on a service page: page path, 1-based line, 0-based occurrence within the line, display name, normalized name, resolved part (null when unresolved), match method (`exact`, `normalized`, `singular`, `ambiguous` or `unmatched`) and diagnostic candidates. Rows are unique by (page, line, display name, occurrence), so the same name linked twice on one line keeps two rows. Unresolved service links are recorded here only; they are not added to `unmatched_name`, whose logical dump is unchanged. |
| `extract_metadata` | Source pin, source label, schema version, row counts, and DuckDB version. Key `change_note_count` (23), `change_link_count` (19), `change_link_resolved_count` (19), `service_page_count` (5), `service_reference_count` (23) and `service_reference_resolved_count` (22). |

The Change Log and service tables are mapped into the graph seed. `change_note`
becomes `DesignChange`, and each resolved `change_note_link` becomes
`AFFECTS_PART`. `service_page` becomes `ServiceProcedure` (a `Structure`), and
`service_reference` becomes `Usage` rows with `source_kind = service`.
Unresolved service references stay out of `unmatched_name` but become
`UnmatchedName` nodes with `SEEN_IN` in the graph, derived from
`service_reference`.

The current pinned source yields 9 Change Log sections and 23 text units; all
19 Change Log links resolve. Fifteen pages make up the two service directories
(nine troubleshooting, six maintenance); five of them carry part links, so
`service_page` has 5 rows (3 troubleshooting, 2 maintenance). Those five pages
hold 23 links, 22 of which resolve. The one unresolved name is `tee nuts`,
recorded in `service_reference` with a null `resolved_part` and not added to
`unmatched_name`.

Name matching rules and the meaning of `not_comparable` are documented in
`farmbot/docs/name-normalization.md`.

## Short-term distribution: CI artifacts

The `farmbot` job in `.github/workflows/ci.yml` checks out the submodule,
installs dependencies, runs `npm run test:farmbot`, and uploads both files as
the `farmbot-duckdb` artifact with 90 days of retention. The job uses
SHA-pinned checkout, setup-node, and upload-artifact actions.

The `farmbot-release-assets` job also checks out the submodule on Node 22 and
runs `npm run release:assets -- --out release-assets` followed by
`npm run release:verify -- release-assets`. It uploads the four release files
(the DuckDB file, the store archive, the release manifest and `SHA256SUMS`) as
the `farmbot-release-assets-v2` artifact with 90 days of retention. Both
artifacts expire, so neither is the lasting distribution channel.

## Lasting distribution: GitHub Releases

The canonical release tag is `farmbot-data-v2`. It replaces `farmbot-data-v1`
once the maintainer creates it. Both tags use the same four asset names:

| Asset | Contents |
| --- | --- |
| `farmbot.duckdb` | The DuckDB extract. |
| `farmbot-relate-store.tar.gz` | The persistent Relate directory store, JSON snapshot codec. |
| `farmbot.release.json` | The digest manifest: seed, DuckDB canonical and store logical digests, counts, and the Genesis pin. |
| `SHA256SUMS` | `sha256sum`-format hashes of the other three files. |

Publishing is a maintainer step. CI builds and uploads the
`farmbot-release-assets-v2` artifact but never creates a release. The maintainer
downloads that artifact, verifies it locally, and attaches the files to the
release:

```sh
gh run download <run-id> -n farmbot-release-assets-v2 -D release-assets
npm run release:verify -- release-assets
gh release create farmbot-data-v2 release-assets/* \
  --target <merge-commit-sha> --title "FarmBot data v2" --notes "..."
```

To check a downloaded copy of the assets:

```sh
npm run release:verify -- <dir>
```

It verifies every `SHA256SUMS` line against the file bytes, checks that the
bundled `farmbot.release.json` equals the committed manifest, extracts the
store archive into a temporary directory, recomputes the store's logical
digest and counts, and computes the DuckDB canonical digest. It prints one line
per check and stops at the first failure.

Cloudflare R2 is not used for these files. The release assets are the only
lasting channel.

