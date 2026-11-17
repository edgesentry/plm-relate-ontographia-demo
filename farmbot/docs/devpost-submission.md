Model: Gemini 4 Hydrogen (Medium)

# Devpost Submission Text — FarmBot B1 (`/farmbot/`)

> Paste-ready sections below are written for `#61` (`Update Devpost submission text for FarmBot B1`) in the **Relate by Neo4j Hackathon**. Reader-facing prose contains no repository file paths, no hardcoded inventory counts, and no restated code tables.

---

## Project Title

Cross-Process PLM Graph Audit on FarmBot Genesis with Ontographia and Relate

---

## Short Description (Tagline)

In-browser PLM graph checks for FarmBot Genesis on Relate, Neo4j's lightweight graph database: deterministic Intents compile to Cypher to surface cross-document BOM disagreements with full query and evidence provenance.

---

## Long Description

### What it does

In hardware product lifecycle management (PLM), the same physical hardware is documented across multiple engineering and manufacturing sources—part pages, the Change Log, assembly and pre-assembly pages, packing lists (kits, bags, and cartons), and service procedures. Over time, these documents drift and disagree.

This submission is a working `/farmbot/` web application built on real open-source FarmBot Genesis v1.7 documentation. It runs deterministic, committed graph checks in the browser tab to surface cross-process disagreements and trace their evidence paths:

- **Cross-process disagreement checks:** Compares engineering documentation (part pages and the Change Log) against assembly, pre-assembly, packing, and service documentation to surface quantity mismatches, unresolved part references, unreferenced or unreached parts, unreadable pre-assembly tables, and stale names after design changes. The tool shows that two documents disagree and presents the evidence path; it does not decide which document is right.
- **Process-lane visualization and evidence provenance:** Opening a finding displays a rule summary, a hand-built SVG process-lane diagram (spanning Design change, EBOM part, Assembly / pre-assembly, Packing, and Service lanes), and an evidence table. Problem nodes and impacted paths are highlighted, unconfirmed links are drawn dashed toward a lane-level placeholder, and quantity comparisons show the variant and signed difference. Selecting a node highlights its evidence rows and vice versa. Every evidence row carries the exact Intent, executed Cypher, and bound parameters that produced it, alongside `fact` / `inferred` labels for causes and name matches.
- **Preset graph questions and parameter selectors:** Alongside the full check suite, the screen provides preset questions with committed allowed-value selectors (for example, filtering by part or category) and deep links to individual findings (`/farmbot/#finding=<id>`).
- **Deterministic verification:** The browser verifies the committed seed graph's SHA-256 digest with Web Crypto before loading it into memory, and compares the browser-computed findings against the committed findings document by canonical-JSON SHA-256. Findings can also be regenerated and compared offline.
- **Bilingual UI:** All screen headings, labels, rule summaries, and controls support both English and Japanese.

### How it uses Relate, Neo4j's lightweight graph database

The project uses **Relate, Neo4j's lightweight graph database**, in two complementary modes:

1. **In-browser `:memory:` execution (`/farmbot/`):** Because a browser tab has no local filesystem, the interactive `/farmbot/` screen lazily loads Relate WebAssembly (`@relate/relate-wasm`) only on the first user Run—never on first paint. After verifying the committed seed JSON's SHA-256 digest in the browser, it loads the FarmBot Genesis graph into an in-memory Relate database scoped to that tab and executes parameter-bound Cypher queries compiled by Ontographia (`@edgesentry/ontographia-wasm`).
2. **Inspectable persistent directory store (offline / Node):** For offline verification and judge inspection, the same seed is compiled into a persistent Relate directory store using `@relate/relate` in Node with the JSON snapshot codec. Reviewers can inspect the snapshot directly or open the directory store read-only from Node without running a browser or a database daemon.

### Positioning against `jexp/relate-ideas`

This submission is a shipped, inspectable `/farmbot/` demo, not a design sketch. It sits next to four ideas in [`jexp/relate-ideas`](https://github.com/jexp/relate-ideas) and takes them into a working run on real FarmBot Genesis documentation:

- **[InstantCypher](https://github.com/jexp/relate-ideas/blob/main/Project/instantcypher.md)** describes plain-language questions compiled to deterministic, inspectable Cypher, with the generated query always shown. This demo ships that path with tighter bounds: an ontology-constrained Intent is compiled to Cypher; an optional local model may only emit a closed `{check, parameter}` routing object after explicit user consent; and the screen shows the expanded Intent, the executed Cypher, and the bound parameters. The model does not write Cypher and does not detect, explain, or score a finding. Compilation and execution run in the browser tab: Ontographia compiles the Intents, and Relate, Neo4j's lightweight graph database, executes the Cypher against the committed seed. Findings are written to a committed document that can be regenerated and compared.
- **[LEGO Assembly Graphs](https://github.com/jexp/relate-ideas/blob/main/Project/lego-assembly-graphs.md)** compares a hobby build's bill of materials with a reference. This demo instead shows disagreement across engineering (part pages and the Change Log), assembly and pre-assembly, packing, and service documents for the same FarmBot Genesis hardware. It shows that two documents disagree; it does not decide which one is right.
- **[Configuration Misconvergence](https://github.com/jexp/relate-ideas/blob/main/Project/configuration-misconvergence.md)** is a useful name for that cross-document disagreement: the effective configuration is not the same in every source.
- **[The Fact-Check Engine](https://github.com/jexp/relate-ideas/blob/main/Project/the-fact-check-engine.md)** treats fact-checking as missing-edge detection with provenance. The demo already does this in two visible places: unresolved references in the committed checks, and missing edges drawn dashed toward a lane-level placeholder on the process-lane diagram, with the evidence rows and their Intent, Cypher, and parameters kept as provenance.

---

## Official Rules Disclosures (Relate by Neo4j Hackathon)

### 1. Product Capabilities Used (Relate)

- **Product:** Relate, Neo4j's lightweight graph database.
- **Capabilities used:**
  - In-browser `:memory:` graph database via `@relate/relate-wasm` for loading the SHA-256-verified FarmBot Genesis seed graph and executing compiled Cypher queries in the browser tab.
  - Persistent directory store via `@relate/relate` in Node (with the JSON snapshot codec) for reproducible offline builds, canonical logical-dump digest verification, and read-only store inspection.

### 2. Third-Party Tools, Libraries, Data, and Pre-Event Code

- **Graph & Ontology Compilation:** `@edgesentry/ontographia-wasm` (ontology-constrained Intent-to-Cypher compiler), `@relate/relate-wasm`, and `@relate/relate`.
- **Frontend & Build:** React, React DOM, TypeScript, Vite.
- **In-Browser Local Model Runtime:** `@mlc-ai/web-llm` (optional, WebGPU-only, consent-gated).
- **Offline Extract, Verification & Hosting:** `@duckdb/node-api` (canonical extract and SQL oracles), `yaml`, Playwright (headless browser smoke tests), Cloudflare Workers / Workers Assets / Wrangler (static hosting and optional digest-checked owner notification endpoint and hourly cron).
- **Data Provenance & Licenses:**
  - Repository license: Apache-2.0.
  - FarmBot Genesis v1.7 documentation: vendored git submodule (`FarmBot-Docs/farmbot-genesis`) with MIT third-party notice.
  - Ontographia desk-fan fixture provenance: Apache-2.0.
- **Pre-event vs. Contest Period Work:**
  - The repository was created prior to the Contest Period start with the Vite/React/TypeScript static scaffold, `@edgesentry/ontographia-wasm`, the desk-fan EOL/ECO screen at `/` (which compiles Intents for audit display without executing Cypher on Relate), Cloudflare Workers static-assets deploy configuration, and the desk-fan WebLLM path.
  - All FarmBot / Relate work submitted for the **Relate by Neo4j Hackathon** was developed during the Contest Period: the FarmBot Genesis v1.7 submodule integration, DuckDB canonical extract, standalone FarmBot ontology, `/farmbot/` screen, committed seed graph, preset questions, cross-process BOM check engine, process-lane diagram, closed-routing WebLLM check path, and persistent Relate directory store.

### 3. AI Tools Used in the Shipped Demo

- **What the shipped `/farmbot/` demo uses:** An optional, consent-gated local language model (`Llama-3.2-1B-Instruct-q4f16_1-MLC`) running in the browser tab via `@mlc-ai/web-llm` on WebGPU.
- **Strict operational bounds:**
  - **Consent and availability:** Explicit user consent is required before the lazy WebLLM package or model weights are requested. If WebGPU is unavailable or the user declines consent, nothing is downloaded, and the deterministic rule chips and parameter selectors provide the exact same Intents.
  - **Local-only inference:** Prompts are processed locally in the browser tab; the demo sends no inference requests to any external API.
  - **Closed routing only:** The model may emit only a closed `{check, parameter}` JSON routing object. Its output is strictly validated against the closed schema and committed allowed-values before Ontographia compiles the expanded Intents, and the user must review and confirm the proposal before Relate executes anything.
  - **No Cypher or finding generation:** The model never writes Cypher and never detects, explains, scores, or proposes countermeasures for any finding. Finding detection, evidence collection, severity scoring, and cause/countermeasure templates are handled deterministically by the check engine.
