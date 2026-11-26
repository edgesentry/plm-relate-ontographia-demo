# ontographia-plm-demo

Static, in-browser PLM graph audit with Ontographia and **Relate, Neo4j's lightweight graph database**.

> For AI coding agents, architectural invariants, and doc-drift rules, see [`AGENTS.md`](AGENTS.md).

## Live demo

- **FarmBot PLM Audit (primary):** <https://demo.edgesentry.io/farmbot/> (cross-document inconsistency checks over FarmBot Genesis v1.7 with process-lane diagrams, executed Cypher provenance, and deterministic claim verification).
- **Desk-fan fixture (secondary / pre-contest):** <https://demo.edgesentry.io/> (static EOL / ECO Intent-compilation screen at `/`).

## Use case

Hardware product lifecycle management (PLM) documents drift over time across engineering bills of materials (EBOM), assembly and pre-assembly instructions (BOP), packing lists, the Change Log, and service procedures. This app audits the open-source [FarmBot Genesis v1.7](https://github.com/FarmBot-Docs/farmbot-genesis) documentation in a browser tab so a reviewer can trace disagreements straight to source files and line numbers:

- **Cross-process disagreement checks:** Surfaces packing quantity mismatches, unresolved part references, unreferenced or unreached parts, `pdf-only` pre-assembly pages, and stale names after design changes. The tool reports disagreements with evidence paths; it does not decide which document is right.
- **Process-lane visualization & provenance:** Opening a finding renders a dynamic SVG process-lane diagram (`Design change`, `EBOM part`, `SBOM (materials)`, `BOP (instructions)`, `Packing`, `Service`, shown only when cited by that finding's evidence) alongside an evidence table where every row carries the exact Intent, executed Cypher, and bound parameters. Deep links open any finding directly at `/farmbot/#finding=<id>`.
- **Preset graph questions:** Parameterized Ontographia Intents (packing differences, assembly chapters for a part, reachable structures, kit parts by category, unmatched references) compile to parameter-bound Cypher and run in Relate. Definitions live in `farmbot/intents/`, `src/farmbot/i18n.ts`, and `farmbot/oracle/default-results.gold.json` (with a post-compile `RETURN DISTINCT` step in `src/farmbot/distinct-return.mjs` where needed).
- **Closed-routing AI bound & claim verification:** An optional, consent-gated local WebLLM (`Llama-3.2-1B-Instruct-q4f16_1-MLC`) may only emit a closed `{check, parameter}` routing object; it never writes Cypher or scores findings. A deterministic rejection button and claim verification panel demonstrate these guardrails on demand.

## How it uses Relate

The project uses **Relate, Neo4j's lightweight graph database**, in two complementary modes:

- **In-browser `:memory:` (`@relate/relate-wasm`, `/farmbot/`):** Because a browser tab has no filesystem, `/farmbot/` lazily loads Relate WASM on the first Run (never on first paint), fetches `/farmbot/farmbot.seed.json`, verifies its SHA-256 digest with Web Crypto, loads the graph into a tab-scoped `:memory:` database, and executes Ontographia-compiled Cypher queries. Browser-computed findings are verified against the committed findings sidecar by canonical-JSON SHA-256; nothing is sent to any server.
- **Persistent directory store (`@relate/relate`, `farmbot/dist/farmbot.relate-store/`):** For offline verification and judge inspection, the same seed compiles into a persistent Relate directory store using the JSON snapshot codec (`graph.json` can be read as plain JSON or opened read-only from Node). Both client packages are pinned in `package.json`.
- **Graph model:** FarmBot Genesis v1.7 EBOM/MBOM/BOP/packing/service data extracted via DuckDB and mapped using `farmbot/ontology/farmbot.native.yaml`. Committed node and relationship counts live in `relateStore.nodes` and `relateStore.relationships` inside `farmbot/dist/farmbot.release.json`. See [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md) and [`farmbot/docs/checks.md`](farmbot/docs/checks.md).

## Quick start

### Prerequisites

- Node 22 (place Node 22 first on `PATH` and run `node` / `npm` directly without `npx`)
- npm

### Run locally

```bash
npm ci
npm run dev
```

Open <http://localhost:5173/farmbot/>.

### Run tests and browser smoke

```bash
npm run verify
npm run test:farmbot
npm run smoke:farmbot
```

- `npm run test:farmbot` runs unit, doc-drift, and oracle checks under `farmbot/test/` against `farmbot/oracle/default-results.gold.json`.
- `npm run smoke:farmbot` drives headless Chromium against `dist/` (built by `npm run verify` / `npm run build`).

Worker notification checks (local only, no account or email sent; see [`farmbot/docs/notifications.md`](farmbot/docs/notifications.md)):

```bash
npm run types:worker
npm run test:worker
npm run build && npm run test:worker:contract
npm run smoke:wrangler
```

Live deployment smoke:

```bash
npm run smoke:live
SMOKE_BASE_URL=https://demo.edgesentry.io/ node scripts/smoke-farmbot.mjs
```

## Data, digests, and reproducible builds

Committed data artifacts live in `farmbot/dist/`:

- `farmbot/dist/farmbot.seed.json` and `farmbot/dist/farmbot.seed.json.sha256` (file-byte SHA-256)
- `farmbot/dist/farmbot.findings.json` and `farmbot/dist/farmbot.findings.json.sha256` (regenerated via `npm run agent:farmbot`; run `node farmbot/scripts/extract.mjs` first on a fresh clone)
- `farmbot/dist/farmbot.part-sources.json`, `farmbot/dist/farmbot.duckdb.sha256` (canonical table dump), and `farmbot/dist/farmbot.release.json` (logical digests and counts)

The DuckDB database (`farmbot/dist/farmbot.duckdb`) and persistent Relate directory store (`farmbot/dist/farmbot.relate-store/`) are gitignored build outputs. Rebuild and verify them from a fresh clone:

```bash
git clone --recurse-submodules https://github.com/edgesentry/plm-relate-ontographia-demo.git
cd plm-relate-ontographia-demo
npm ci
npm run release:assets
npm run release:verify -- release-assets
```

- Release asset names and roles are declared in `farmbot/scripts/release-assets.mjs`; logical digests and counts are in `farmbot/dist/farmbot.release.json`.
- Release `farmbot-data-v1`: <https://github.com/edgesentry/plm-relate-ontographia-demo/releases/tag/farmbot-data-v1>.
- CI builds and uploads the `farmbot-release-assets-v2` artifact; verifying and publishing the next release tag is a maintainer step documented in [`farmbot/docs/relate-store.md`](farmbot/docs/relate-store.md#verify-and-publish-release-assets) and [`farmbot/docs/duckdb-distribution.md`](farmbot/docs/duckdb-distribution.md).

### Third-party provenance and licenses

- Project license: Apache-2.0 (`LICENSE`).
- FarmBot Genesis v1.7 documentation: git submodule pinned at `44e0fa24d4a538dfa1255a4e89308ccabf3abaeb` (MIT notice in `farmbot/notices/LICENSE`).
- Ontographia desk-fan fixture provenance: `vendor/ontographia/PROVENANCE.md` (Apache-2.0).

## Hackathon disclosures and pre-event code

- **Hackathon:** Relate by Neo4j Hackathon (<https://relate.devpost.com/>, [Official Rules](https://relate.devpost.com/rules))
- **Contest Period:** 2026-11-11 18:00 PST to 2026-12-11 18:00 PST (2026-11-12 10:00 to 2026-12-12 10:00 Asia/Singapore)
- **Public repository:** <https://github.com/edgesentry/plm-relate-ontographia-demo> (topics: `relate`, `relate-neo4j-hackathon`, `ontographia`)
- **Pre-event code:** Repository created 2026-11-05 22:27 UTC (`1c07d8e`). 16 commits reached `main` before the Contest Period: the Vite/React/TypeScript scaffold, `@edgesentry/ontographia-wasm`, the desk-fan EOL/ECO screen at `/`, Cloudflare Workers deploy config, and the desk-fan WebLLM path.
- **Contest Period work:** All FarmBot / Relate work was built during the Contest Period: the FarmBot Genesis v1.7 submodule, DuckDB extract, standalone ontology, `/farmbot/` screen, committed seed, preset Intents and oracles, cross-process check engine, process-lane diagram, deterministic rejection and claim verification panels, and persistent Relate store.

### Desk-fan demo (`/`)

The pre-contest screen at `/` demonstrates Intent compilation (without Relate execution) over `vendor/ontographia/data/fixtures/deskfan_eol.graph.json` with an optional, consent-gated WebLLM (`Llama-3.2-1B-Instruct-q4f16_1-MLC`, 879.04 MB VRAM, 695,242,752 bytes download from allowlisted Hugging Face / GitHub hosts in `public/_headers`). Smoke commands: `npm run smoke` (stubbed headless), `npm run smoke:webgpu` (headed Chrome download check), and `npm run smoke:live`.

## Deploy

Production deploys automatically to Cloudflare Workers (with Workers Assets) via Workers Builds on merge to `main`. PRs run GitHub Actions CI only. Configuration lives in `wrangler.jsonc`, `package.json`, and `public/_headers` (CSP, `application/wasm`, immutable `/assets/*` caching). See [`farmbot/docs/notifications.md`](farmbot/docs/notifications.md) for optional email notification secrets and cron setup.
