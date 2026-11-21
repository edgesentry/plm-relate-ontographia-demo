# Relate directory store

The FarmBot screen at `/farmbot/` runs the committed seed in an in-memory
Relate WASM database inside the browser tab. Nothing from that session is
written to disk. For inspection without a browser, the same seed can be loaded
into a persistent Relate **directory store** on disk with the Node client
`@relate/relate`, pinned in `package.json`.

The store is a build output. It is not committed, and its files are not
byte-hashed: the files are not guaranteed to be byte-identical across runs or
platforms, and the archive bytes differ between runs. What is committed is a
**logical** digest of the graph, stored in `farmbot/dist/farmbot.release.json`.

## Build

```sh
npm ci
node farmbot/scripts/relate-store.mjs
```

The default output directory is `farmbot/dist/farmbot.relate-store/`
(gitignored). The CLI, the build steps, the seed-digest check, and which
committed manifest fields a rebuild may rewrite are in
`farmbot/scripts/relate-store.mjs`. Use the manifest-rewrite option only for
a changed seed or load.

The store is built in a child Node process. The Node client has no `close()`
method, so the writer handle lives until its process exits; archiving or
copying the directory before that would capture a store that is still open.

## Why `RELATE_SNAPSHOT_FORMAT=json`

The snapshot codec is selected when the writable store is opened, by the
environment variable `RELATE_SNAPSHOT_FORMAT`, read by the native library. With
`RELATE_SNAPSHOT_FORMAT=json` the checkpoint writes the whole graph to
`graph.json`, which is readable JSON with `nodes` and `relationships` arrays.
Without the variable the default codec writes Parquet shards under `nodes/` and
`relationships/` instead. The environment variable must be set before the first
`Database.open` of the writable store in that process.

The build does not trust the variable blindly: it checks the two files above
after the checkpoint and fails if the JSON layout is not there.

## Layout

The store is one directory, including the WAL, the schema, and the
`.cypherlite.lock` and `.cypherlite.writer` marker files. File names and sizes
are engine details, not part of the contract: archive and move the directory
whole.

## Logical dump format

`logicalDump()` in `farmbot/scripts/relate-store.mjs` reads every node and
relationship through Cypher and serializes the graph canonically with typed
properties; that function and the `relateStore` section of
`farmbot/dist/farmbot.release.json` are the source of truth for the format,
digest and counts. The store is not byte-hashed: judges should verify the
logical digest, not assume byte-identical archive bytes.

## Reading a store read-only

The store archive is `farmbot-relate-store.tar.gz`; extracting it yields a
`farmbot.relate-store/` directory. A read-only open needs the
`.cypherlite.lock` marker files, so archive the whole directory: an archive
without them fails with `RelateError: internal error`. Writer markers may be
left in; they do not prevent a read-only open.

```js
import { createRequire } from 'node:module';
import { logicalDump } from './farmbot/scripts/relate-store.mjs';

const { Database } = createRequire(import.meta.url)('@relate/relate');
const db = Database.open('<extracted>/farmbot.relate-store', { readOnly: true });
const connection = db.connect();
console.log(connection.query('MATCH (n) RETURN count(n) AS nodes').rows[0]);
console.log(logicalDump('<extracted>/farmbot.relate-store').digest);
```

`Database.open(dir, { readOnly: true })` refuses writes and checkpoints, and any
number of readers may open the same directory. `@relate/relate` is a Node-only
devDependency; the browser keeps using `@relate/relate-wasm` in `:memory:`.

## Verify and publish release assets

```sh
npm run release:assets -- --out release-assets
npm run release:verify -- release-assets
```

`npm run release:assets` (`farmbot/scripts/release-assets.mjs`) rebuilds and
checks the assets and writes the release files plus `SHA256SUMS`; that script
lists the asset names and their roles, and `farmbot/dist/farmbot.release.json`
holds the logical digests and counts.
`npm run release:verify` (`farmbot/scripts/verify-release-assets.mjs`) checks a
downloaded directory, and `farmbot/scripts/lib/archive-guard.mjs` guards
extraction of the untrusted store archive. Both scripts are the source of truth
for the checks.

Publishing is a maintainer step: CI builds and uploads the
`farmbot-release-assets-v2` artifact but never creates or updates a Release.
Release `farmbot-data-v1` already exists; the next tag is `farmbot-data-v2`.
After a merge, download the artifact, verify it, and attach the files to that
tag:

```sh
gh run download <run-id> -n farmbot-release-assets-v2 -D release-assets
npm run release:verify -- release-assets
gh release create farmbot-data-v2 release-assets/* --target <merge-commit-sha> --title "FarmBot data v2" --notes "..."
```
