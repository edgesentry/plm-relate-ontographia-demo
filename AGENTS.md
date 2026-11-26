# AGENTS.md

High-level operating guide for AI coding agents working in `ontographia-plm-demo`.
Human-facing overview and setup instructions live in [`README.md`](README.md).

## Repository Map

- `src/farmbot/`: Primary `/farmbot/` React UI, browser Relate WASM loader (`data.ts`), check engine (`agent/checks.mjs`, `agent/index.mjs`), process-lane SVG diagram (`process-lanes.mjs`), findings view (`findings-view.mjs`), free-text closed routing (`CheckFreeTextPanel.tsx`), and i18n strings (`i18n.ts`).
- `src/` (top-level): Pre-contest desk-fan EOL/ECO screen at `/` and shared WebLLM package wrapper (`src/lib/webllm.ts`, `src/lib/webllm-package.ts`).
- `farmbot/ontology/farmbot.native.yaml`: Standalone FarmBot Genesis v1.7 ontology.
- `farmbot/checks/` & `farmbot/intents/`: Committed Ontographia check and preset Intents.
- `farmbot/oracle/`: DuckDB SQL oracles and `default-results.gold.json`.
- `farmbot/scripts/`: Extract (`extract.mjs`), graph builder (`graph.mjs`), agent findings generator (`agent-farmbot.mjs`), persistent Relate store (`relate-store.mjs`), and release asset bundler (`release-assets.mjs`).
- `farmbot/dist/`: Committed seed (`farmbot.seed.json` + `.sha256`), findings (`farmbot.findings.json` + `.sha256`), part-sources map, allowed-values map, DuckDB digest sidecar, and `farmbot.release.json`. Gitignored build outputs (`farmbot.relate-store/`, `farmbot.duckdb`) also live here.
- `farmbot/test/`: Unit, oracle, and doc-drift tests (`docs-drift.test.mjs`).
- `worker/`: Cloudflare Worker entry (`index.ts`), notification handler (`notify.ts`), generated bundle (`generated/notify-bundle.json`), and `worker-configuration.d.ts`.
- `scripts/`: Verification (`verify.mjs`), notify bundle builder (`build-notify-bundle.mjs`), and Playwright browser smoke suites (`smoke-farmbot.mjs`, `smoke.mjs`).

## Single-Source-of-Truth Documentation

Keep each concern in one file to avoid drift:

- Human overview, setup, and judge quickstart: `README.md`
- Paste-ready Devpost submission text: `farmbot/docs/devpost-submission.md`
- v2 demo video shot list, voiceover script, and zoom cues: `farmbot/docs/recording-guide.md`
- Check rules & deep-link contract: `farmbot/docs/checks.md`
- Persistent Relate directory store & release verification: `farmbot/docs/relate-store.md`
- DuckDB extract & canonical digest: `farmbot/docs/duckdb-distribution.md`
- Worker email notifications & cron: `farmbot/docs/notifications.md`
- Ontology & name normalization details: `farmbot/docs/ontology.md`, `farmbot/docs/name-normalization.md`

## Environment & URL Invariants

- **Node 22 required for FarmBot tests**: `npm run test:farmbot` and `npm run smoke:farmbot` enforce a Node 22 preflight. If the default shell Node differs, run with `npx -y node@22` or place Node 22 first on `PATH`.
- **Live deployment URL**: `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/` — the Workers account subdomain is literally **`egdesentry`** (not `edgesentry`). Do not "fix" this spelling.
- **GitHub repository**: `https://github.com/edgesentry/plm-relate-ontographia-demo` (must carry the `relate` topic).

## Architectural & Positioning Invariants

- **Relate naming**: External/submission prose must name Relate as `"Relate, Neo4j's lightweight graph database"`. The official contest title is `"Relate by Neo4j Hackathon"`.
- **Scope boundary (`/` vs `/farmbot/`)**: The desk-fan screen at `/` is pre-contest work on a separate fixture graph and never executes Cypher on Relate. Never describe desk-fan SBOM/BOP swimlanes as shipped `/farmbot/` behavior. On `/farmbot/`, lanes (`Design change`, `EBOM part`, `SBOM (materials)`, `BOP (instructions)`, `Packing`, `Service`) render dynamically from the opened finding's evidence rows.
- **Closed-routing AI bound**: Optional in-browser WebLLM (`Llama-3.2-1B-Instruct-q4f16_1-MLC`) is WebGPU-only and consent-gated. It may only emit a closed `{check, parameter}` routing JSON object. It never writes Cypher and never detects, explains, scores, or proposes countermeasures for findings. Keep the closing bound verbatim: `"the model only routes; it never writes Cypher"`.
- **Deterministic rejection demo**: The rejection beat uses the labelled button (`data-testid="farmbot-rejection-demo-button"`) with a fixed Cypher sample, never a live model roll.
- **Committed sidecars and generated files**:
  - After changing `wrangler.jsonc`, run `npm run types:worker` to refresh `worker/worker-configuration.d.ts` (`npm run verify` fails if stale).
  - `npm run build` runs `npm run build:notify`, verifying `farmbot/dist/farmbot.findings.json` against its `.sha256` sidecar and refreshing `worker/generated/notify-bundle.json`.

## Doc-Drift Guardrails (`farmbot/test/docs-drift.test.mjs`)

Any edit to `README.md`, `AGENTS.md`, or `farmbot/docs/*.md` must satisfy these automated checks:

- **No hardcoded inventory counts**: Never state hardcoded counts of check Intents, findings, rules, preset questions, or tests. Point to `farmbot/dist/farmbot.findings.json`, `INTENT_FILES`, or the command that reports them.
- **No copied dependency versions**: Never restate pinned `package.json` dependency versions in `farmbot/docs/` (or `AGENTS.md`). Point to `package.json` instead.
- **Valid repo paths only**: Every backtick-quoted repository path in `farmbot/docs/` must resolve to an existing file/directory or a `.gitignore`d build output.
- **Valid npm scripts only**: Every `npm run <script>` cited in docs must exist in `package.json`.
- **No `Editor Notes` heading** in `farmbot/docs/devpost-submission.md`, and keep internal issue numbers (`#60`, `#61`, `#69`, etc.) out of submission prose.
- **Video budget sync**: `farmbot/docs/recording-guide.md` must keep Beats 0–8 in order summing to the documented `100 seconds` (`1:40`) budget, with Beat 0 (`data-testid="flow-strip"`, no-click opening), Beat 4 (`R1-40mm-nut-bar-standard` reconciliation labels), Beat 8 verbatim closing line, and per-beat voiceover and zoom cues.

## Verification Commands

Run these before raising or updating a PR:

```bash
npm run verify
npm run test:farmbot          # requires Node 22
npm run smoke:farmbot         # requires Node 22 and dist/ from npm run build
npm run test:worker
npm run test:worker:contract  # requires dist/
```

Optional live/Wrangler checks:

```bash
npm run smoke:wrangler
npm run smoke:live
```

## Operational Constraints

- Do not merge PRs to `main` (the maintainer merges after CI and Workers Builds pass).
- Do not modify secrets, credentials, or call `/api/notify/test`.
- Keep temporary/scratch scripts outside the repository working tree.
