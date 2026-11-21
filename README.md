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
- Why this mode: A browser tab has no filesystem, so the interactive `/farmbot/` screen runs the Relate WASM client in `:memory:`. The committed seed graph is fetched from `/farmbot/farmbot.seed.json`, verified by SHA-256 with Web Crypto against the committed digest, and loaded into an in-memory database that exists only in that tab. Relate WASM is lazily imported on the first Run, not on first paint. For offline inspection, the same seed is compiled into a persistent Relate directory store with the Node client (both clients are pinned in `package.json`) and the JSON snapshot codec; reviewers can read `graph.json` as plain JSON or open the store read-only from Node. The build and its codec rationale are in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md).
- What the graph models: FarmBot Genesis v1.7 EBOM and MBOM data, mapped from the DuckDB extract. The node classes and relationship types are declared in `farmbot/ontology/farmbot.native.yaml`, and the committed counts are `relateStore.nodes` and `relateStore.relationships` in `farmbot/dist/farmbot.release.json`. The browser screen executes against the in-memory database, not the unpacked directory store, and displays that logical digest and those counts.

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

`npm run smoke:farmbot` requires `dist/` and checks the preset questions against `farmbot/oracle/default-results.gold.json`.

Worker notification checks (no account, no email sent):

```bash
npm run types:worker   # refresh the committed worker/worker-configuration.d.ts
npm run test:worker
npm run build && npm run test:worker:contract
npm run smoke:wrangler
```

`smoke:wrangler` starts a local `wrangler dev` and runs both browser smoke suites against it. See [farmbot/docs/notifications.md](farmbot/docs/notifications.md).

### Live demo

- FarmBot screen (primary): <https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/> — cross-document inconsistency checks over FarmBot Genesis v1.7, with findings, evidence and the process-lane diagram.
- Desk-fan fixture (secondary): <https://ontographia-plm-demo.egdesentry.workers.dev/> — the EOL / ECO desk-fan screen at `/` (HTTP 200 confirmed 2026-11-14).

To run the browser smoke suite against the live deployment:

```bash
SMOKE_BASE_URL=https://ontographia-plm-demo.egdesentry.workers.dev/ npx -y node@22 scripts/smoke-farmbot.mjs
```

### Preset questions

The preset questions' wording, localized labels, default filter values, columns and expected rows are defined by data, not by this README: the Intent files in `farmbot/intents/`, the labels in `src/farmbot/i18n.ts`, and the expected results in `farmbot/oracle/default-results.gold.json`. Some answers are a set rather than a list, and the pinned compiler still cannot express `DISTINCT`, so those questions receive a documented post-compile `RETURN DISTINCT` step (`src/farmbot/distinct-return.mjs`). Quantity differences are reported, not corrected.

### Check findings panel

**Run checks** compiles the check Intents, executes them in the same in-memory Relate session, and evaluates the rules in the browser, then compares the result with the committed findings sidecar by canonical-JSON SHA-256; nothing is sent to any host. Opening a finding shows its summary, a process-lane diagram of the evidence nodes, one row per evidence entry with the Intent, Cypher and bound parameters that produced it, then the cause candidates and countermeasures. The rules, the executed Intent set, totals, severity ordering and the diagram lanes are defined in `src/farmbot/agent/checks.mjs`, `src/farmbot/findings-view.mjs`, `farmbot/dist/farmbot.findings.json` and `src/farmbot/process-lanes.mjs`, and explained in [`farmbot/docs/checks.md`](farmbot/docs/checks.md).

### Finding deep links

`/farmbot/#finding=<id>` opens one finding after the checks finish. The accepted id shape and the handling of a malformed or unknown hash are defined by `parseFindingHash` in `src/farmbot/findings-view.mjs` and explained in [`farmbot/docs/checks.md`](farmbot/docs/checks.md#deep-link).

## Cross-process BOM checks

**Background.** The same FarmBot Genesis v1.7 hardware is documented in several places — part pages, packing lists, assembly and pre-assembly pages, the Change Log, and service pages. Those documents can disagree. The `/farmbot/` screen exists so a reviewer can see the disagreement and the evidence path.

**Purpose.** Run deterministic, committed checks across those documents. The tool shows that two documents disagree; it does not decide which one is right. A local model, when used, may only select a closed check Intent. It does not detect, score, explain a cause, or propose a countermeasure.

**Where to look.**

- Rule table and the executed Intent set: `src/farmbot/agent/checks.mjs` (`CHECKS`, `INTENT_FILES`, `SHARED_INTENTS`). Engine entry: `src/farmbot/agent/index.mjs` (`collectFindings`). Browser wiring: `src/farmbot/data.ts`.
- Check Intents and compiled-Intent gold: `farmbot/checks/`. SQL oracles: `farmbot/oracle/`.
- Ontology: `farmbot/ontology/farmbot.native.yaml`. Extract: `farmbot/scripts/extract.mjs`. Graph seed: `farmbot/scripts/graph.mjs` and `farmbot/recipes/`.
- Findings output: `farmbot/dist/farmbot.findings.json` and `farmbot/dist/farmbot.findings.json.sha256`, written by `npm run agent:farmbot` (`farmbot/scripts/agent-farmbot.mjs` in `package.json`). On a fresh clone, build the gitignored extract first: `node farmbot/scripts/extract.mjs`.
- Browser smoke: `npm run smoke:farmbot` (`scripts/smoke-farmbot.mjs`).
- Email / cron: `wrangler.jsonc` (`triggers.crons`, `send_email`, `kv_namespaces`, `ratelimits`, `vars.NOTIFY_DAILY_CAP`, `PUBLIC_BASE_URL`); Worker: `worker/index.ts`, `worker/notify.ts`; bundle: `npm run build:notify` (`scripts/build-notify-bundle.mjs`) writes `worker/generated/notify-bundle.json`.

## Where the data lives

The committed seed, findings document, part-sources map, DuckDB sidecar and release manifest live in `farmbot/dist/`:

- `farmbot/dist/farmbot.seed.json` and `farmbot/dist/farmbot.seed.json.sha256`
- `farmbot/dist/farmbot.findings.json` and `farmbot/dist/farmbot.findings.json.sha256`
- `farmbot/dist/farmbot.part-sources.json`
- `farmbot/dist/farmbot.duckdb.sha256` (the DuckDB file itself is a build output)
- `farmbot/dist/farmbot.release.json`

The directory store and the DuckDB file are gitignored under `farmbot/dist/.gitignore`. Format tokens and digests are declared in `farmbot/dist/farmbot.release.json`.

Each committed digest means something different. The seed digest is the SHA-256 of the seed file bytes. The DuckDB digest is a canonical dump of all tables, not the file bytes; the Change Log and service tables were already in the extract, so the graph mapping leaves it unchanged. The Relate store digest is a canonical logical dump over all nodes and relationships, whose format is documented in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md); the archive bytes can differ between builds, so verify the logical digest rather than assuming byte-identical archives.

Release `farmbot-data-v1`: <https://github.com/edgesentry/plm-relate-ontographia-demo/releases/tag/farmbot-data-v1>. It carries the assets listed in `farmbot/scripts/release-assets.mjs`. Asset names and roles are declared in that script; logical digests and counts are in `farmbot/dist/farmbot.release.json`. How to verify a downloaded copy and publish the next tag is in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md#verify-and-publish-release-assets). The next tag, `farmbot-data-v2`, uses the same asset names and the digests in that manifest; CI builds and verifies it as the `farmbot-release-assets-v2` artifact, and creating the Release is a maintainer step. Once v2 exists it replaces v1. The `/farmbot/` screen never fetches release assets — it reads the committed seed and manifest — so it keeps working regardless of which tag is current.

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

**Verification suite.** `scripts/verify.mjs` (`npm run verify`) defines the current checks; read it for the list.

```bash
npm run verify
```

**FarmBot unit and oracle tests.** The suites live under `farmbot/test/` (`npm run test:farmbot`) and compare the default questions against `farmbot/oracle/default-results.gold.json`.

```bash
npm run test:farmbot
```

**FarmBot browser smoke.** `scripts/smoke-farmbot.mjs` (`npm run smoke:farmbot`) drives headless Chromium against `/farmbot/`; the assertions are defined there.

```bash
npx -y node@22 scripts/verify.mjs
npm run smoke:farmbot
```

### Local measurements and performance budgets

These are dated lab notes, not a contract. Measured on 2026-11-13 on macOS arm64 with the Playwright Chromium from the pinned devDependencies, from a local `npm run smoke:farmbot` run against a local Node 22 production build. No CI-runner timings were observed.

Artifact sizes as measured on that run, raw / `gzip -9 -n` bytes: Ontographia WASM binary 512627 / 173885; Relate WASM binary 6932319 / 2424791; Relate loader chunk 12367 / 4579; FarmBot screen bundle 100944 / 27863; `dist/farmbot/farmbot.seed.json` 395675 / 21459.

The `farmbot` chunk and the seed rows were re-measured on 2026-11-15 with the same tooling after the DesignChange/ServiceProcedure graph and the evidence keyboard controls were added; the other rows are unchanged from the 2026-11-13 build. Timings from that run, in ms: seed fetch + digest + Relate load 585.9; Q1 `session.execute` 4.2; Q2 3.8; Q3 3.2; Q4 1.5; Q5 0.8.

The proposed budgets (`SEED_BUDGET_MS` and the per-query budget in `scripts/smoke-farmbot.mjs`) are printed in smoke output but not enforced unless `SMOKE_FARMBOT_ENFORCE_BUDGET=1`.

## Rebuild and inspect the Relate store

Building the directory store, why the JSON snapshot codec is used, the logical dump format, and how to open a store read-only from Node are documented in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md). The DuckDB extract and its canonical digest are documented in [`farmbot/docs/duckdb-distribution.md`](farmbot/docs/duckdb-distribution.md). The verify and publish walkthrough is in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md#verify-and-publish-release-assets). The npm scripts they use are declared in `package.json`.

**Rebuilding from a fresh clone.**

```bash
git clone --recurse-submodules https://github.com/edgesentry/plm-relate-ontographia-demo.git
cd plm-relate-ontographia-demo
npm ci
npm run release:assets
npm run release:verify -- release-assets
```

`npm run release:assets` rebuilds the DuckDB file and the store, checks both digests and the counts against the committed manifest, and writes the release files plus `SHA256SUMS` into `release-assets/`. `npm run release:verify -- <dir>` repeats the checks on a downloaded copy; `farmbot/scripts/relate-store.mjs` exports `logicalDump(dir)` for the digest and `buildStore(dir)` for a rebuild.

**Maintainer: publishing the release.** CI builds and uploads the `farmbot-release-assets-v2` artifact but never creates or updates a Release; publishing is a maintainer step. After a merge, download that artifact, verify it, and attach the files to the next tag (`farmbot-data-v2`) as described in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md#verify-and-publish-release-assets).

## Deploy

Deployment targets Cloudflare Workers with static assets via Workers Builds (Git integration), not Cloudflare Pages. Production deploys happen when a change is merged to `main`: Workers Builds builds and deploys it automatically. Pull requests only run GitHub Actions CI (build and tests); GitHub Actions does not deploy, and the `protect-main` ruleset requires those CI checks to pass before a merge.

`npm run build` emits `dist/`; `public/_headers` is copied into `dist/` by Vite and is honored by Workers Assets, where it carries the CSP, the `application/wasm` content type, and immutable caching for hashed `/assets/*`.

The Worker name, script entry, assets directory, `run_worker_first` and the deliberate omission of `not_found_handling` are configured in `wrangler.jsonc`; the build and deploy commands are the npm scripts in `package.json`. The dashboard-side Workers Builds settings (production branch and build variable) are a maintainer matter.

`npm run build` first runs `npm run build:notify`, which checks `farmbot/dist/farmbot.findings.json` against its `.sha256` sidecar and regenerates the committed `worker/generated/notify-bundle.json`. The Worker sends email only from that bundle. `worker/worker-configuration.d.ts` is also committed; regenerate it with `npm run types:worker` after editing `wrangler.jsonc`, and `npm run verify` fails if it is stale. See [farmbot/docs/notifications.md](farmbot/docs/notifications.md) for Email Routing / Email Sending onboarding, the `NOTIFY_TO`, `NOTIFY_FROM`, and `NOTIFY_TOKEN` secrets, KV auto-provisioning, the hourly cron, how to disable sending, and how to run `types:worker`, `test:worker`, `test:worker:contract`, and `smoke:wrangler`.

### Checking that a merge went live

Each merge to `main` starts a Workers Builds run. Confirm it went live by checking the "Workers Builds" check run on the merge commit, then run:

```bash
npm run smoke:live
```
