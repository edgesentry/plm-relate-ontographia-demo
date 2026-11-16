# ontographia-plm-demo

Static, in-browser PLM graph queries with Ontographia and Relate by Neo4j.

## Use case

Exploring and auditing product lifecycle management (PLM) data for the open-source [FarmBot Genesis v1.7](https://github.com/FarmBot-Docs/farmbot-genesis) hardware project across engineering bills of materials (EBOM) and manufacturing bills of materials (MBOM) / assembly documentation:

- **Packing differences**: Detecting discrepancies between the packing list and the BOM (e.g. quantity mismatches).
- **Assembly chapters for a part**: Identifying which assembly chapters use a specific part to assess change impact.
- **Structures a part reaches**: Forward-tracing which assembly chapters, pre-assembly tools, kits and service procedures reach a part.
- **Kit parts in a category**: Listing kit parts that belong to a specific functional category.
- **Unmatched references**: Surfacing manufacturing references that did not resolve to a canonical part page.

High-level questions expressed as Ontographia Intents compile into parameter-bound Cypher queries and execute in Relate.

## How it uses Relate

- Mode: in memory (browser screen at `/farmbot/`) | directory store (inspectable build output)
- Why this mode: A browser tab has no filesystem, so the interactive `/farmbot/` screen runs `@relate/relate-wasm` 1.0.1 in `:memory:`. The committed seed graph is fetched from `/farmbot/farmbot.seed.json`, verified by SHA-256 with Web Crypto against the committed digest, and loaded into an in-memory database that exists only in that tab. Relate WASM is lazily imported only on the first Run (not on first paint). For offline inspection, the same seed is compiled into a persistent Relate directory store using Node `@relate/relate` 1.0.1 with the JSON snapshot codec (`RELATE_SNAPSHOT_FORMAT=json`). Reviewers can inspect `graph.json` directly as plain JSON or open the directory store read-only from Node without running a browser or database daemon.
- What the graph models: FarmBot Genesis v1.7 EBOM and MBOM data, including BOM parts, part variants, BOM categories, product variants, assembly chapters, pre-assembly pages, kits, the main carton, bags, service procedures, usage lines, packing-versus-BOM quantity comparisons, quantity differences, unresolved references, and Change Log design changes. The logical store contains 656 nodes and 1087 relationships. Node labels include `Part`, `PartVariant`, `BomCategory`, `ProductVariant`, `AssemblyChapter`, `PreAssembly`, `ServiceProcedure`, `Kit`, `Carton`, `Bag`, `Usage`, `QuantityComparison`, `QuantityDifference`, `UnmatchedName`, and `DesignChange`, along with abstract labels `Item`, `Structure`, `ManufacturingContainer`, and `Correspondence` that concrete nodes also carry.

Relationship types and counts (from the logical dump):

| Type | Count | Type | Count |
| --- | ---: | --- | ---: |
| `HAS_USAGE` | 302 | `USES_ITEM` | 279 |
| `IN_CATEGORY` | 149 | `COMPARED_IN` | 76 |
| `COMPARES_PART` | 76 | `FOR_VARIANT` | 76 |
| `HAS_PART_VARIANT` | 44 | `APPLIES_TO` | 38 |
| `SEEN_IN` | 18 | `CANDIDATE` | 10 |
| `AFFECTS_PART` | 19 | | |

The browser screen does not execute against the unpacked directory store; it executes queries against the in-memory database and displays the committed store logical digest and node/relationship counts from `farmbot/dist/farmbot.release.json`.

## Setup and run

### Prerequisites

- Node >=22 (or use `npx -y node@22`)
- npm

### Run locally

```bash
npm ci
npm run dev
```

Open <http://localhost:5173/farmbot/> to access the FarmBot query screen.

### Run tests and smoke

To build and run the browser smoke suite against a local production build:

```bash
npx -y node@22 scripts/verify.mjs
npm run smoke:farmbot
```

`npm run smoke:farmbot` requires `dist/` and checks the five preset questions against `farmbot/oracle/default-results.gold.json`.

Worker notification checks (no account, no email sent):

```bash
npm run types:worker   # refresh the committed worker/worker-configuration.d.ts
npm run test:worker
npm run build && npm run test:worker:contract
npm run smoke:wrangler
```

`smoke:wrangler` starts a local `wrangler dev` and runs both browser smoke suites against it. See [farmbot/docs/notifications.md](farmbot/docs/notifications.md).

### Live demo

- Live demo: <https://ontographia-plm-demo.egdesentry.workers.dev/> (HTTP 200 confirmed 2026-11-14)
- FarmBot query screen: <https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/>

To run the browser smoke suite against the live deployment:

```bash
SMOKE_BASE_URL=https://ontographia-plm-demo.egdesentry.workers.dev/ npx -y node@22 scripts/smoke-farmbot.mjs
```

### Preset questions

The screen provides five preset questions with localized labels (`src/farmbot/i18n.ts`):

- **Q1 · Packing differences** — "Which parts disagree between the packing list and the BOM?" — 12 rows — no selector — columns: `part`, `packing_minus_part`
- **Q2 · Assembly chapters for a part** — "Which assembly chapters use this part?" — default filter: `M5 x 10mm Screw` — 2 rows — DISTINCT applied after compile
- **Q3 · Structures a part reaches** — "If this part changes, which structures reach it — assembly chapters, pre-assemblies, kits or service procedures?" — default filter: `M5 Flange Locknut` — 7 rows — DISTINCT applied after compile
- **Q4 · Kit parts in a category** — "Which kit parts belong to this category?" — default filter: `fasteners-and-hardware` — 24 rows
- **Q5 · Unmatched references** — "Which references did not resolve to a part page?" — 18 rows (14 distinct `display_name` values, including one unresolved service name) — filter `status = unmatched` is embedded in the Intent, no on-screen selector

*Note on query compilation*: Ontographia 0.1.10 still cannot express `DISTINCT`; Q2 and Q3 receive a documented post-compile `RETURN DISTINCT` step. Q1, Q4, and Q5 are not modified. Q1 projects only `part` and `packing_minus_part`. Quantity differences are reported, not corrected. Q3 traverses any `Structure`, so it returns a `ServiceProcedure` page when the part has a service reference; the selector lists the parts that appear in an assembly chapter, a pre-assembly and a kit.

### Check findings panel

**Run checks** compiles the check Intents in `farmbot/checks/` (the executed set is `INTENT_FILES` in `src/farmbot/agent/checks.mjs`), executes them in the same in-memory Relate session, and evaluates rules R1–R9 in the browser (`src/farmbot/agent/`). On the committed seed the totals come from `farmbot/dist/farmbot.findings.json`: `findings.length` is the finding total, and each `rules[].findingCount` plus `severityCounts` gives the per-rule and per-severity breakdown. The panel shows the finding count and the per-severity counts (action needed / check / info), ordered by severity, then severity score, then id. Its result is compared with the committed findings sidecar by canonical-JSON SHA-256, and a match line names the digest. Nothing is sent to any host.

Opening a finding shows the one-line summary for its rule, a process-lane diagram of the evidence nodes, one row per evidence entry with the values taken from that seed node, and — for each row — the Intent, Cypher and bound parameters that produced it. Cause candidates and countermeasures carry `fact` / `inferred` labels. An R6 finding also states whether its name came from a resolved Change Log link (`fact`) or from a removal statement matched by normalized name (`inferred`). Cause and countermeasure text is stored in English; the labels, headings and summary follow the selected language. All document text is rendered as text nodes.

The diagram is hand-built SVG (`src/farmbot/ProcessLanes.tsx`) laid out by the pure `layoutFinding` in `src/farmbot/process-lanes.mjs`. Lanes are Design change, EBOM part, Assembly / pre-assembly, Packing and Service; a lane without evidence is not drawn. Nodes are exactly the finding's evidence node ids, ordered by lane, then role, then node id, capped per finding (overflow is reported and stays in the table). Problem nodes and the impacted path are highlighted, a link the evidence cannot confirm is drawn dashed toward a lane-level placeholder and named in a note below the diagram, and a quantity comparison shows its variant and signed difference. Selecting a node highlights its evidence row and selecting a row highlights its node. The diagram keeps its natural width (it is not stretched on wide screens), so it stays readable on a phone. The rules are documented in [`farmbot/docs/checks.md`](farmbot/docs/checks.md#process-lanes).

### Finding deep links

`/farmbot/#finding=<id>` opens one finding after the checks finish. Ids come from `farmbot/dist/farmbot.findings.json` and match `^[A-Za-z0-9-]+$`. A malformed hash, or a hash with another key, is ignored: no Relate session, no request and no error. A well-formed id that does not exist runs the checks but opens nothing.

## Where the data lives

The committed seed and sidecar digests live in `farmbot/dist/`:

- Seed file: `farmbot/dist/farmbot.seed.json` (395675 bytes) and sidecar `farmbot/dist/farmbot.seed.json.sha256`
- Findings document: `farmbot/dist/farmbot.findings.json` (format `farmbot-findings-v1`) and sidecar `farmbot/dist/farmbot.findings.json.sha256`
- Part page paths: `farmbot/dist/farmbot.part-sources.json` (format `farmbot-part-sources-v1`), written by `npm run agent:farmbot`
- DuckDB extract sidecar: `farmbot/dist/farmbot.duckdb.sha256` (the DuckDB file itself is a build output and is gitignored)
- Release manifest: `farmbot/dist/farmbot.release.json` (format `farmbot-release-manifest-v1`)

The directory store and DuckDB extract are gitignored under `farmbot/dist/.gitignore` (`*.duckdb`, `farmbot.relate-store/`, `farmbot-relate-store.tar.gz`).

### Cryptographic digests

| Artifact | Digest |
| --- | --- |
| Committed seed | `farmbot-graph-v1 sha256:5e0a2e2b65bf89ce61a1dbc217c7df2bcf09f61b527bf4626348892a52b15cd3` |
| DuckDB extract | `farmbot-canonical-v1 sha256:9bf30774ca18b815d2c7ba2bc6f221a0bf0e9e03acdeb1d11676b8cb22c4c040` |
| Relate store (logical) | `farmbot-relate-store-v3 sha256:f50e731c116c5a34fa418bb71e09ef9b2dc48b8f45eb75a1774ec12860be68ae` |

- The seed digest is the SHA-256 of the committed file bytes.
- The DuckDB digest is a canonical dump of all tables, not the file bytes. The Change Log and service tables were already in the extract, so this digest is unchanged by the graph mapping.
- The Relate store digest is a canonical logical dump (`farmbot-relate-store-v3`) over all nodes and relationships (documented in `farmbot/docs/relate-store.md`). The archive bytes can differ between builds; judges should verify the logical store digest rather than assuming byte-identical tar.gz archives.

### GitHub Release assets

GitHub Release `farmbot-data-v1`: <https://github.com/edgesentry/plm-relate-ontographia-demo/releases/tag/farmbot-data-v1>  
Target commit: `6aa2bc5cd595d23bf1d742d64b5963ae7b45da6b`

| Asset | Size | Role |
| --- | ---: | --- |
| `farmbot-relate-store.tar.gz` | 21847 bytes | Relate persistent directory store archive |
| `farmbot.duckdb` | 5517312 bytes | DuckDB canonical extract database |
| `farmbot.release.json` | 801 bytes | Release manifest |
| `SHA256SUMS` | 262 bytes | Checksums of release assets |

The next release tag is `farmbot-data-v2`. It uses the same four asset names and carries the seed, DuckDB and store digests above. CI builds and verifies it as the `farmbot-release-assets-v2` artifact; creating the GitHub Release is a maintainer step. Once `farmbot-data-v2` exists it replaces `farmbot-data-v1`; until then v1 stays published. The `/farmbot/` screen never fetches release assets — it reads the committed seed and manifest — so it keeps working regardless of which release tag is current.

### Third-party provenance and licenses

- Project license: Apache-2.0 at `LICENSE`
- FarmBot Genesis documentation source: submodule pinned at `44e0fa24d4a538dfa1255a4e89308ccabf3abaeb` (Genesis v1.7, also recorded in `farmbot/dist/farmbot.release.json`). Third-party notice: MIT in `farmbot/notices/LICENSE`.
- Ontographia demo data provenance: `vendor/ontographia/PROVENANCE.md` (Apache-2.0).

## Pre-event code used in this submission

This section provides a factual list of what was already in the repository before the Contest Period, and what was added during it.

### Hackathon context

- Hackathon: Relate by Neo4j Hackathon
- Overview: <https://relate.devpost.com/>
- Official Rules: <https://relate.devpost.com/rules>
- Contest Period: Starts 6:00 PM PST on Wednesday, November 11, 2026, which is 2026-11-12 10:00 in Asia/Singapore. Ends 6:00 PM PST on Friday, December 11, 2026, which is 2026-12-12 10:00 in Asia/Singapore.
- Public repository: <https://github.com/edgesentry/plm-relate-ontographia-demo>
- GitHub topics: `relate`, `relate-neo4j-hackathon`, `ontographia`

### Repository timeline

- Repository created at 2026-11-05 22:27 UTC, which is 2026-11-06 06:27 in Asia/Singapore, before the Contest Period start (2026-11-12 10:00 Asia/Singapore).
- First commit: `1c07d8e` Initial commit (2026-11-06 06:27 Asia/Singapore).
- 16 commits reached `main` before the Contest Period start. They include: Vite/React/TypeScript static scaffold (#1), `@edgesentry/ontographia-wasm` 0.1.9 from npm, the desk-fan EOL/ECO Intent-driven swimlane at `/` (#2), Cloudflare Workers static-assets deploy config, live smoke, ripple-pulse animation (#12), and in-browser WebLLM free-text to a validated Intent (#15, 2026-11-11 21:10 Asia/Singapore).
- 10 commits reached `main` on or after the Contest Period start, through `6aa2bc5`. They include: headed WebGPU model-download smoke (#17); FarmBot Genesis v1.7 submodule with provenance (#23, first FarmBot work, 2026-11-12 19:43 Asia/Singapore); DuckDB extract (#24); FarmBot ontology (#21 / #25); Phase 2a Relate spike, graph generator, preset Intents and oracle, `/farmbot/` screen, browser smoke, and persistent store / Release assets (PRs #33–#38). Release `farmbot-data-v1` was published from `6aa2bc5`.

The desk-fan screen at `/` and its WebLLM path remain in the repository. The work submitted for this hackathon's FarmBot / Relate demonstration is the `/farmbot/` screen, the committed seed, and the persistent Relate store published on Release `farmbot-data-v1`.

## Desk-fan demo

The repository retains the desk-fan EOL / ECO demonstration at `/`:

- **Traversal**: An Intent-driven traversal over a vendored fixture graph (`vendor/ontographia/data/fixtures/deskfan_eol.graph.json`).
- **Compilation without execution**: The WASM engine compiles each chip's Intent into parameter-bound Cypher shown in the HUD as an audit artifact. Cypher is not executed on a graph database; results come from a small in-browser Intent executor (`src/lib/executor.ts`).
- **Lanes**: Four lanes represent EBOM, MBOM, SBOM, and BOP (the fixture has no MBOM nodes or tags, so that lane displays a "not in this fixture" notice).
- **Optional in-browser WebLLM**: An optional free-text interface runs `Llama-3.2-1B-Instruct-q4f16_1-MLC` locally via `@mlc-ai/web-llm` in the browser tab:
  - Requires WebGPU and explicit user consent.
  - Memory and storage: 879.04 MB VRAM (from WebLLM `prebuiltAppConfig.vram_required_MB`); 695,242,752 bytes download (documented Hugging Face `usedStorage`, not measured here).
  - The model is asked for Intent JSON only, validated against an explicit Intent schema; it never outputs Cypher and prompts are never sent to external inference APIs.
  - Model weights and `model_lib` WASM are downloaded only after consent from the CSP allowlist in `public/_headers` (`https://huggingface.co`, `https://us.aws.cdn.hf.co`, `https://raw.githubusercontent.com`).
  - Two-step flow: **Convert** asks the model for Intent JSON, validates, compiles, and shows a proposal without execution; **Run** executes the proposal through `buildCypher` + `executeIntent`.
- **Smoke tests**:
  - `npm run smoke`: Headless Playwright Chromium smoke test for chips, HUD, ja/en toggle, CSP, and consent gate (uses a test stub; never downloads the model).
  - `npm run smoke:webgpu`: Headed system Chrome test that downloads the model to assert network transfers from allowlisted hosts and WebGPU initialization without typing prompts.
  - `npm run smoke:live`: Runs smoke tests against the deployed origin (`SMOKE_BASE_URL=https://ontographia-plm-demo.egdesentry.workers.dev/ npm run smoke`).

## Verify and smoke

### Verification suite

Run the comprehensive verification check:

```bash
npm run verify
```

`npm run verify` checks:
- TypeScript typecheck (`tsc --noEmit`)
- Committed Worker env types (`wrangler types --check worker/worker-configuration.d.ts`)
- The committed notify bundle matches a fresh digest-checked rebuild
- Data and i18n structure checks
- Ontographia WASM smoke compilation (all five Intents plus a malformed Intent, ABI rejection)
- Intent executor gold tests and schema rejection tests
- Free-text prompt-set shape and WebLLM prompt/lazy-import guards
- Package and dist WASM binary SHA-256 integrity
- FarmBot seed copy byte-identity between source and distribution
- CSP header allowlist rules in `public/_headers`
- Production builds of both entries (`dist/index.html` and `dist/farmbot/index.html`)

### FarmBot unit and oracle tests

```bash
npm run test:farmbot
```

Tests the SHA-256 digest guard, shared `RETURN DISTINCT` step, ontology endpoint parser, seed loader, default questions against `farmbot/oracle/default-results.gold.json`, the check engine and its SQL oracles, the browser-equivalent findings run (no DuckDB extract), the committed part-sources file, and the panel helpers (deep-link hashing, summary lines, ordering, per-severity counts, evidence-row uniqueness).

### FarmBot browser smoke

```bash
npx -y node@22 scripts/verify.mjs
npm run smoke:farmbot
```

Drives headless Playwright Chromium to verify `/farmbot/`:
1. Question chips are visible and Ontographia is ready before first Run.
2. First paint requests neither Relate WASM asset nor lazy Relate chunk.
3. The page displays the committed seed digest, matching the SHA-256 of `/farmbot/farmbot.seed.json`.
4. All five preset questions execute with default selectors and match `farmbot/oracle/default-results.gold.json` row-for-row (12 / 2 / 7 / 24 / 18 rows).
5. Relate WASM is requested same-origin on the first successful Run.
6. The notification panel's finding count, ids and per-severity counts equal `farmbot/dist/farmbot.findings.json`, and the digest line reports a match.
7. `/farmbot/#finding=<id>` opens that finding with its summary, evidence rows and per-row Intent/Cypher/parameters; a well-formed but unknown id opens nothing and shows no error.
8. Malformed hashes (`#finding=%E0%A4%A`, `#foo`) run nothing, request no Relate asset, and show no error.
9. A single-byte-tampered seed is rejected with expected and actual digests, loads no rows, and never requests Relate.
10. Zero CSP violations, zero non-same-origin network requests, and zero uncaught page errors in every context.

### Local measurements and performance budgets

Measured on 2026-11-13 on macOS 27.2.1 arm64, Node 22.23.5, Playwright 1.65.0 with Chromium 158.0.8127.18, from a local `npm run smoke:farmbot` run against a local Node 22 production build. These are local numbers; no CI-runner timings were observed.

Artifact sizes (raw / `gzip -9 -n` bytes):

| Artifact | raw bytes | gzip -9 -n bytes |
| --- | ---: | ---: |
| `dist/assets/ontographia_wasm-BOJRSUvY.wasm` | 512627 | 173885 |
| `dist/assets/relate_bg-9Q1Zsp67.wasm` | 6932319 | 2424791 |
| `dist/assets/relate-loader-C129q4jF.js` | 12367 | 4579 |
| `dist/assets/farmbot-r6Jv9-bp.js` | 100944 | 27863 |
| `dist/farmbot/farmbot.seed.json` | 395675 | 21459 |

The `farmbot` chunk and the seed rows were re-measured on 2026-11-15 with the same tooling after the DesignChange/ServiceProcedure graph and the evidence keyboard controls were added; the other rows are unchanged from the 2026-11-13 build.

Timings from that local run:

| Measurement | ms | Proposed budget |
| --- | ---: | ---: |
| Seed fetch + digest + Relate load | 585.9 | 2000 |
| Q1 `session.execute` | 4.2 | 100 |
| Q2 `session.execute` | 3.8 | 100 |
| Q3 `session.execute` | 3.2 | 100 |
| Q4 `session.execute` | 1.5 | 100 |
| Q5 `session.execute` | 0.8 | 100 |

Budgets are printed in smoke output but not enforced unless `SMOKE_FARMBOT_ENFORCE_BUDGET=1`.

## Rebuild and inspect the Relate store

### Rebuilding from a fresh clone

```bash
git clone --recurse-submodules https://github.com/edgesentry/plm-relate-ontographia-demo.git
cd plm-relate-ontographia-demo
npm ci
npm run release:assets
npm run release:verify -- release-assets
```

`npm run release:assets` rebuilds the DuckDB file and the store (`RELATE_SNAPSHOT_FORMAT=json`), checks both digests and the counts against the committed manifest, and writes the release files plus `SHA256SUMS` into `release-assets/`.

To verify downloaded release assets:

```bash
npm run release:verify -- <dir>
```

### Opening the store read-only from Node

Extract `farmbot-relate-store.tar.gz` and open the directory; keep the `.cypherlite.lock` marker files, or the read-only open fails:

```bash
tar -xzf farmbot-relate-store.tar.gz
node --input-type=module -e "
import { createRequire } from 'node:module';
const { Database } = createRequire(import.meta.url)('@relate/relate');
const db = Database.open('farmbot.relate-store', { readOnly: true });
console.log(db.connect().query('MATCH (n) RETURN count(n) AS nodes').rows[0]);
"
```

`Database.open(dir, { readOnly: true })` opens the directory read-only. `farmbot/scripts/relate-store.mjs` exports `logicalDump(dir)` for the digest and `buildStore(dir)` for a rebuild.

### Maintainer: publishing the release

CI uploads the `farmbot-release-assets-v2` artifact; it never creates a release. After a merge, download the artifact, verify it, and attach the files:

Release `farmbot-data-v1` already exists and targets `6aa2bc5cd595d23bf1d742d64b5963ae7b45da6b`. CI uploads a `farmbot-release-assets-v2` artifact after later merges; it never creates or updates the Release. The next tag is `farmbot-data-v2`, which replaces v1 once the maintainer creates it. To publish it:

```bash
gh run download <run-id> -n farmbot-release-assets-v2 -D release-assets
npm run release:verify -- release-assets
gh release create farmbot-data-v2 release-assets/* --target <merge-commit-sha> --title "FarmBot data v2" --notes "..."
```

## Deploy

Deployment targets Cloudflare Workers with static assets via Workers Builds (Git integration), not Cloudflare Pages. `npm run build` emits `dist/`; `public/_headers` is copied into `dist/` by Vite and is honored by Workers Assets, where it carries the CSP, the `application/wasm` content type, and immutable caching for hashed `/assets/*`. Deployment is a maintainer step; CI does not deploy.

`wrangler.jsonc` at the repository root configures a Worker with a small script plus static assets:
- Worker name: `ontographia-plm-demo`
- Script entry: `worker/index.ts` (notification endpoint and digest cron; no WASM)
- Assets directory: `./dist`, bound as `ASSETS`
- `assets.run_worker_first: ["/api/*"]`: only API paths run the script first; every other path is served directly by Workers Assets with the same `_headers` behavior
- Deliberately omits `not_found_handling` so unknown paths return 404 instead of falling back to `index.html`

`npm run build` first runs `npm run build:notify`, which checks `farmbot/dist/farmbot.findings.json` against its `.sha256` sidecar and regenerates the committed `worker/generated/notify-bundle.json`. The Worker sends email only from that bundle. `worker/worker-configuration.d.ts` is also committed; regenerate it with `npm run types:worker` after editing `wrangler.jsonc`, and `npm run verify` fails if it is stale. See [farmbot/docs/notifications.md](farmbot/docs/notifications.md) for Email Routing / Email Sending onboarding, the `NOTIFY_TO`, `NOTIFY_FROM`, and `NOTIFY_TOKEN` secrets, KV auto-provisioning, the hourly cron, how to disable sending, and how to run `types:worker`, `test:worker`, `test:worker:contract`, and `smoke:wrangler`.

### Workers Builds settings

In Cloudflare Dashboard (**Workers & Pages → Create an application → Workers → Connect to Git**):

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | repository root (leave default) |
| Production branch | `main` |
| Build variable `NODE_VERSION` | `22` (Settings > Build > Build Variables and Secrets) |

### Checking that a merge went live

Every push to `main` starts a build in the Worker's Deployments list. To confirm a merge is live, compare the hashed bundle name served at `/` (`assets/index-*.js`) before and after the build, then run:

```bash
npm run smoke:live
```
