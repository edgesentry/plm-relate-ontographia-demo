# Devpost Submission Text: FarmBot PLM Graph Audit (`/farmbot/`)

> Paste-ready sections for the **Relate by Neo4j Hackathon**. Reader-facing prose contains no repository file paths, no hardcoded inventory counts, and no internal ticket numbers.

---

## Project Title

> **Measured length:** 76 characters (11 words).

Cross-Process PLM Graph Audit on FarmBot Genesis with Ontographia and Relate

---

## Short Description (Tagline)

> **Field limit:** 140 characters (verified). **Measured length:** 140 characters (17 words).

In-browser cross-document BOM checks on Relate, Neo4j's lightweight graph database: deterministic Intents compile to Cypher with provenance.

---

## Built With

> **Field limit:** 25 tags maximum. **Measured count:** 18 tags.

Relate, Neo4j, Cypher, Ontographia, WebAssembly, React, TypeScript, Vite, WebLLM, WebGPU, Llama 3.2, DuckDB, YAML, Playwright, Cloudflare Workers, Wrangler, Git, Node.js

---

## Try It Out / Links

- **Working demo URL:** https://demo.edgesentry.io/farmbot/
- **Code repository URL:** https://github.com/edgesentry/plm-relate-ontographia-demo

---

## Video Demo Link

> **Field limit:** Public YouTube or Vimeo URL, up to 2 minutes. Replace with the v2 narrated video URL once uploaded.

https://youtu.be/YbGLU2pqlC0

---

## Long Description

### At a glance (30-second summary)

- **The problem:** Hardware engineering, assembly, packing, and service documents drift out of sync, and catching mismatches by hand is slow and error-prone.
- **What it does:** `/farmbot/` audits real FarmBot Genesis v1.7 docs in your browser tab, tracing mismatches like `Power Supply` (`R6-power-supply`) and `40mm Nut Bar` (`R1-40mm-nut-bar-standard`) to exact file lines and interactive process lanes.
- **Why Relate:** Built on **Relate, Neo4j's lightweight graph database**, it verifies a committed seed graph by SHA-256 and runs deterministic, parameter-bound Cypher in-memory via WebAssembly (`@relate/relate-wasm`, no backend) or offline in Node (`@relate/relate`).
- **The model never writes Cypher:** An optional, consent-gated local model only routes `{check, parameter}` and never writes Cypher or detects/scores findings.
- **Try it in 30 seconds at https://demo.edgesentry.io/farmbot/ (no install):** (1) open `#finding=R6-power-supply` and expand `Intent, Cypher and parameters`, (2) expand `Check routing` and press `Show a rejected routing output`, (3) expand `Deterministic claim verification` and click `Verify claim` on `uc1-hallucinated-part-fail` (`REJECTED`) then `uc1-hallucinated-part-pass` (`CONFIRMED`).

### What it does

The `/farmbot/` web application audits real FarmBot Genesis v1.7 documentation in your browser tab, graphing only what the documents state and never executing model-written Cypher so every finding is reproducible. Opening `#finding=R6-power-supply` traces a Change Log entry for `Power Supply` across assembly (`electronics.md`), packing (`power-supply.md`), and service (`storing-farmbot-for-winter.md`) files down to line numbers, while `#finding=R1-40mm-nut-bar-standard` flags a quantity difference of `4` between the `40mm Nut Bar` part page and packing list alongside `Stainless Steel` in `SBOM (materials)`.
- **Cross-process checks & process lanes:** Compares part pages and the Change Log against assembly, pre-assembly, packing, and service docs to surface quantity mismatches, unresolved references, unreached parts, unreadable tables, and stale names in an interactive SVG process-lane diagram with reciprocal node/row selection, dashed missing-link placeholders, and `fact` / `inferred` labels.
- **Query provenance, controls & bilingual verification:** Every evidence row exposes its Intent, executed Cypher, and bound parameters. Preset questions, `#finding=<id>` links, `Show a rejected routing output`, and `Deterministic claim verification` (`REJECTED` or `CONFIRMED`) run alongside Web Crypto SHA-256 seed and canonical-JSON findings verification in English and Japanese.

### How it uses Relate, Neo4j's lightweight graph database

**Relate, Neo4j's lightweight graph database**, executes identical parameter-bound Cypher for findings like `R6-power-supply` and `R1-40mm-nut-bar-standard` across two modes:
1. **In-browser `:memory:` execution (`/farmbot/`):** Relate WebAssembly (`@relate/relate-wasm`) loads lazily on first Run, verifies the committed seed JSON's SHA-256 digest with Web Crypto, loads the graph in-memory, and runs Ontographia-compiled (`@edgesentry/ontographia-wasm`) Cypher.
2. **Inspectable persistent directory store (offline / Node):** The same seed compiles into a persistent Relate directory store via `@relate/relate` with the JSON snapshot codec for read-only Node inspection without a browser or daemon.

### Positioning against `jexp/relate-ideas`

This submission ships a live `/farmbot/` audit on FarmBot Genesis docs (tracing `Power Supply` in `R6-power-supply` and `40mm Nut Bar` drift in `R1-40mm-nut-bar-standard`), turning four `jexp/relate-ideas` concepts into a working run:
- **[InstantCypher](https://github.com/jexp/relate-ideas/blob/main/Project/instantcypher.md):** Ontology-constrained Intents compile via Ontographia to parameter-bound Cypher in Relate with Intent, Cypher, and parameters shown; an optional consent-gated local model may only emit `{check, parameter}`.
- **[LEGO Assembly Graphs](https://github.com/jexp/relate-ideas/blob/main/Project/lego-assembly-graphs.md) & [Configuration Misconvergence](https://github.com/jexp/relate-ideas/blob/main/Project/configuration-misconvergence.md):** Surfaces cross-document configuration misconvergence across engineering, assembly, pre-assembly, packing, and service sources for the same hardware.
- **[The Fact-Check Engine](https://github.com/jexp/relate-ideas/blob/main/Project/the-fact-check-engine.md):** Implements missing-edge detection with provenance via unresolved-reference checks, dashed lane placeholders, and `REJECTED` / `CONFIRMED` claim verification.

### Scope

- **Surfaces disagreements without arbitrating:** Shows that two documents disagree and presents the evidence path; it does not decide which document is right.
- **Evidence-bounded lanes:** `SBOM (materials)` renders only documented `specs.material` attributes (not a software BOM or CAS substance list); `BOP (instructions)` renders documented assembly/pre-assembly structure (not factory routing, `WorkCenter`, or `Operation` classes) and marks `pdf-only` pages explicitly as unparsed audit boundaries without guessing contents.
- **Closed routing & fixed rejection sample:** The optional local model only routes `{check, parameter}` and never writes Cypher or detects/scores findings; `Show a rejected routing output` replays a fixed payload rather than a live model roll.
- **Tab-local execution:** Checks run in-browser or offline with no live email delivery or exposed credentials.

---

## Official Rules Disclosures (Relate by Neo4j Hackathon)

### 1. Product Capabilities Used (Relate)

- **Relate, Neo4j's lightweight graph database:** Runs in-browser `:memory:` (`@relate/relate-wasm`) on the SHA-256-verified FarmBot Genesis seed graph, and builds a persistent Node directory store (`@relate/relate`, JSON snapshot codec) for reproducible offline inspection and digest verification.

### 2. Third-Party Tools, Libraries, Data, and Pre-Event Code

- **Graph & Ontology Compilation:** `@edgesentry/ontographia-wasm` (ontology-constrained Intent-to-Cypher compiler), `@relate/relate-wasm`, and `@relate/relate`.
- **Frontend & Build:** React, React DOM, TypeScript, Vite.
- **In-Browser Local Model Runtime:** `@mlc-ai/web-llm` (optional, WebGPU-only, consent-gated).
- **Offline Extract, Verification & Hosting:** `@duckdb/node-api` (canonical extract and SQL oracles), `yaml`, Playwright (headless browser smoke tests), Cloudflare Workers / Workers Assets / Wrangler (static hosting and optional digest-checked owner notification endpoint and hourly cron).
- **Data Provenance & Licenses:** Repository is Apache-2.0; FarmBot Genesis v1.7 docs (`FarmBot-Docs/farmbot-genesis`) carry an MIT third-party notice; Ontographia desk-fan fixture is Apache-2.0.
- **Pre-event vs. Contest Period Work:**
  - The repository was created prior to the Contest Period start with the Vite/React/TypeScript scaffold, `@edgesentry/ontographia-wasm`, the desk-fan EOL/ECO screen at `/` (which compiles Intents for audit display without executing Cypher on Relate), Cloudflare Workers static-assets deploy configuration, and the desk-fan WebLLM path.
  - All FarmBot / Relate work submitted for the **Relate by Neo4j Hackathon** was developed during the Contest Period: the FarmBot Genesis v1.7 submodule integration, DuckDB canonical extract, standalone FarmBot ontology, `/farmbot/` screen, committed seed graph, preset questions, cross-process BOM check engine, process-lane diagram with its SBOM (materials) and BOP (instructions) lanes, closed-routing WebLLM check path, deterministic Cypher-output rejection demonstration, claim verification panel, and persistent Relate directory store.

### 3. AI Tools Used in the Shipped Demo

- **What the shipped `/farmbot/` demo uses:** An optional, consent-gated local language model (`Llama-3.2-1B-Instruct-q4f16_1-MLC`) running in the browser tab via `@mlc-ai/web-llm` on WebGPU.
- **Strict operational bounds:**
  - **Consent and availability:** Explicit user consent is required before the lazy WebLLM package or model weights are requested. If WebGPU is unavailable or the user declines consent, nothing is downloaded, and the deterministic rule chips and parameter selectors provide the exact same Intents.
  - **Local-only inference:** Prompts are processed locally in the browser tab; the demo sends no inference requests to any external API.
  - **Closed routing only:** The model may emit only a closed `{check, parameter}` JSON routing object. Its output is strictly validated against the closed schema and committed allowed-values before Ontographia compiles the expanded Intents, and the user must review and confirm the proposal before Relate executes anything.
  - **No Cypher or finding generation:** The model never writes Cypher and never detects, explains, scores, or proposes countermeasures for any finding. Finding detection, evidence collection, severity scoring, and cause/countermeasure templates are handled deterministically by the check engine.
  - **Deterministic rejection demonstration:** A labelled control feeds a fixed sample through the same closed-routing validator. Output that contains Cypher or a markdown fence is rejected, and nothing new is compiled or executed. No live model roll is used to obtain the sample.
