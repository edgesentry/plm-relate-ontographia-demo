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

The extract script accepts `--source` and `--out` (or the
`FARMBOT_GENESIS_DIR` and `FARMBOT_OUT_DIR` environment variables); the CLI and
the expected pinned submodule commit are in `farmbot/scripts/extract.mjs`. The
script refuses to run when the source is missing, is not a git checkout, or is
not at that pin.

After a successful build, `farmbot/dist/farmbot.duckdb` is the database
(gitignored) and `farmbot/dist/farmbot.duckdb.sha256` is the tracked SHA-256 of
its canonical dump. The sidecar is not the hash of the `.duckdb` file bytes:
the native file is not bit-identical across runs of the same extract, though
the logical rows are. The current schema version and the tracked digest live in
`farmbot/scripts/extract.mjs` and the sidecar; `farmbot/PROVENANCE.md` records
the source pin.

`npm run test:farmbot` rebuilds the database, computes the canonical digest,
and compares it with the tracked sidecar. The test is scoped to the FarmBot
tree and is not part of `npm run verify` or `npm run smoke`.

## Reproducibility

The same submodule pin, the same extract code, and the same pinned DuckDB
version produce the same canonical digest. The build does not read the clock,
the host name, or any environment-specific value, and it inserts rows in a
fixed order. The output file name is always `farmbot.duckdb`.

The digest is SHA-256 over a canonical dump, not over the `.duckdb` file bytes.
`canonicalDigest()` in `farmbot/scripts/extract.mjs` defines the dump layout and
writes the digest to the sidecar after each build. `npm run test:farmbot`
checks it.

## What the extract contains

The table definitions, metadata writes and graph-seed mapping live in
`farmbot/scripts/extract.mjs`, and the built extract is the source for the
tables, columns and row counts. Name matching rules and the meaning of
`not_comparable` are documented in `farmbot/docs/name-normalization.md`.

## Short-term distribution: CI artifacts

`.github/workflows/ci.yml` builds the extract and the release assets and
uploads them as artifacts. The release-assets job uploads the four release
files as the `farmbot-release-assets-v2` artifact. Artifacts expire, so they
are not the lasting distribution channel.

## Lasting distribution: GitHub Releases

The lasting release carries the same four assets: the DuckDB file, the store
archive, `farmbot.release.json` and `SHA256SUMS`. The asset table and the
verify walkthrough are in `farmbot/docs/relate-store.md`. Verify a downloaded
copy with `npm run release:verify -- <dir>`. Publishing is a maintainer step:
CI builds and uploads the artifact but never creates a release.

Cloudflare R2 is not used for these files. The release assets are the only
lasting channel.
