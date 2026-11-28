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

> **Field limit:** Public YouTube or Vimeo URL, up to 2 minutes.

https://youtu.be/Z9mzhPbKBn0

---

## Image gallery

1. **01 — Landing view & sample alert cards:** Three-step in-browser workflow strip (`Agent finds the drift -> Email link -> Graph analysis in the browser`) and sample finding cards (`R6-power-supply`, `R1-40mm-nut-bar-standard`, `R8-shaft-coupler`, `R3-fuse`).
2. **02 — Cross-process lane diagram (`R6-power-supply`):** Interactive SVG process lanes (`Design change -> EBOM part -> BOP (instructions) -> Packing -> Service`) tracing `Power Supply` across downstream documents alongside its evidence table.
3. **03 — SBOM (materials) & quantity reconciliation (`R1-40mm-nut-bar-standard`):** Quantity difference (`28 -> 24`, `+4`) between the part page and packing list, with the `SBOM (materials)` lane showing `Stainless Steel` strictly from documented evidence.
4. **04 — BOP (instructions) & `PDF only` audit boundary (`R5`):** Pre-assembly page `cable-carrier.md` marked explicitly as `PDF only` in `BOP (instructions)` to show the unparsed audit boundary without guessing contents.
5. **05 — Deterministic Cypher-output rejection guard:** Fixed sample `MATCH (part:Part) RETURN part` blocked by the closed-routing validator (`The routing output was rejected. Nothing new was compiled or executed.`).
6. **06 — Claim verification (`REJECTED`):** Replaying an invented `Titanium Servo Coupling` claim as compiled Intent queries returns `REJECTED` with `missing_part_node`, missing edge, and actual graph evidence.
7. **07 — Parameter-bound `CYPHER 25` provenance:** Expanded `Intent` and compiled `CYPHER 25` query (`FILTER usage.match_method = $param_0`) with non-empty bound parameters (`{"param_0": "unmatched"}`).
8. **08 — Claim verification (`CONFIRMED`):** Replaying a valid `M5 x 10mm Screw` claim in `v1.7/assembly/gantry.md` returns `CONFIRMED` with matching chapter and structure evidence.

---

## Image gallery

> **Field limit:** 140 characters per caption.

1. **01 — Landing view & sample cards (131 chars):** Three-step in-browser workflow strip and sample alert cards (R6-power-supply, R1-40mm-nut-bar-standard, R8-shaft-coupler, R3-fuse).
2. **02 — Cross-process lanes (130 chars):** Interactive SVG process lanes (Design change to Service) tracing Power Supply across downstream docs alongside the evidence table.
3. **03 — SBOM & quantity mismatch (129 chars):** Quantity mismatch (28 to 24, +4) between part page and packing list, with SBOM (materials) showing Stainless Steel from evidence.
4. **04 — BOP & PDF-only boundary (123 chars):** Pre-assembly page cable-carrier.md marked explicitly as PDF only in BOP (instructions) to show the unparsed audit boundary.
5. **05 — Cypher rejection guard (120 chars):** Fixed sample MATCH (part:Part) RETURN part blocked by the closed-routing validator: nothing new is compiled or executed.
6. **06 — Claim verification REJECTED (133 chars):** Replaying an invented Titanium Servo Coupling claim returns REJECTED with missing_part_node, missing edge, and actual graph evidence.
7. **07 — Parameter-bound CYPHER 25 (132 chars):** Expanded Intent (r9-service-unmatched.json) and compiled CYPHER 25 query with non-empty bound parameters ({"param_0": "unmatched"}).
8. **08 — Claim verification CONFIRMED (116 chars):** Replaying a valid M5 x 10mm Screw claim in gantry.md returns CONFIRMED with matching chapter and structure evidence.

---

## About the project

### At a glance (30-second summary)

- **Versus unconstrained LLM-to-Cypher:** Unconstrained LLM-to-Cypher can invent labels or edges silently; here the model only routes, Ontographia compiles a deterministic parameter-bound query, Relate executes it, and every answer has provenance or a hard boundary (PDF only, REJECTED).
- **The problem:** Hardware engineering, assembly, packing, and service documents drift out of sync, leading to wrong builds and wrong shipments.
- **What it does:** `/farmbot/` audits FarmBot Genesis v1.7 docs in your browser tab, tracing mismatches (`R6-power-supply`, `R1-40mm-nut-bar-standard`) to file lines and interactive process lanes.
- **Why Relate:** Runs on **Relate, Neo4j's lightweight graph database** with no backend.
- **Try it at https://demo.edgesentry.io/farmbot/ (no install):** (1) open `#finding=R6-power-supply` and expand `Intent, Cypher and parameters`, (2) expand `Check routing` and press `Show a rejected routing output`, (3) expand `Deterministic claim verification` and click `Verify claim` on `uc1-hallucinated-part-fail` (`REJECTED`) then `uc1-hallucinated-part-pass` (`CONFIRMED`).

### Inspiration

Hardware product lifecycle management (PLM) documentation drifts silently across engineering bills of materials (EBOM), materials lists (SBOM), assembly and pre-assembly instructions (BOP), packing lists, change logs, and service procedures. Out-of-sync packing or service updates lead to assembly errors and incorrect shipments.

While auditing open-source hardware documentation such as **FarmBot Genesis v1.7**, we saw how easily cross-document disagreements hide across markdown tables, part references, and `pdf-only` pre-assembly links. At the same time, giving an LLM free-form Text-to-Cypher access to a graph database introduces a subtle reliability risk: **syntactically valid queries that silently miss edges, hallucinate labels, or fabricate evidence**.

We were inspired to build a deterministic, auditable alternative powered by **Relate, Neo4j's lightweight graph database**, and **Ontographia**: an in-browser PLM graph audit where the AI model only routes to validated checks, never writes Cypher, and every finding exposes its exact `CYPHER 25` provenance.

### What it does

**PLM Graph Audit on FarmBot with Ontographia and Relate** (`https://demo.edgesentry.io/farmbot/`) audits cross-document consistency across FarmBot Genesis v1.7 directly inside a browser tab—with zero server-side secrets or data uploads:

- **Cross-Process Disagreement Detection**: Surfaces packing quantity mismatches (`R1`), unresolved part references (`R2`), unreferenced or unreached parts, `pdf-only` pre-assembly boundaries (`R5`), and stale names after design changes (`R6`).
- **Evidence-Driven Process-Lane Diagrams**: Renders a dynamic SVG process-lane diagram (`Design change`, `EBOM part`, `SBOM (materials)`, `BOP (instructions)`, `Packing`, `Service`) where lanes appear *only* when cited by a finding's evidence, linked bidirectionally to source files and line numbers.
- **Full Cypher Provenance**: Every evidence row expands to reveal the compiled Ontographia Intent, the executed `CYPHER 25` query, and its bound JSON parameters (e.g., `{"param_0": "unmatched"}`).
- **Closed-Routing Guardrails & Claim Verification**: An optional, consent-gated local WebLLM (`Llama-3.2-1B-Instruct-q4f16_1-MLC`) can route free-text questions to preset checks, while a deterministic validator rejects any output containing raw Cypher or markdown fences. A Claim Verification panel replays claims as Intent queries to mark hallucinated parts `REJECTED` (with missing-node evidence) and valid graph facts `CONFIRMED`.

### How we built it

#### 1. DuckDB Extraction & Dual-Mode Relate Graph Architecture
We pinned **FarmBot Genesis v1.7** as a git submodule, extracted EBOM, SBOM, BOP, packing, and service records with **DuckDB**, and mapped them into the extracted FarmBot property graph using a declarative YAML ontology (`farmbot/ontology/farmbot.native.yaml`).

We run **Relate** in two complementary modes:
- **In-browser `:memory:` (`@relate/relate-wasm`)**: Lazily loads Relate WASM on the first audit run, fetches `farmbot.seed.json`, verifies its integrity via Web Crypto SHA-256, and executes all queries inside a tab-scoped `:memory:` database.
- **Persistent directory store (`@relate/relate`)**: Compiles the same seed into a JSON-snapshot Relate directory store (`farmbot.relate-store/`) for offline verification and reproducible CI builds.

Browser-computed findings are checked against the committed findings sidecar (`farmbot.findings.json`) by canonical-JSON SHA-256:

$$
\operatorname{SHA256}\left(\operatorname{canonical}(\mathcal{F}\sb{\text{browser}})\right) = \operatorname{SHA256}\left(\operatorname{canonical}(\mathcal{F}\sb{\text{committed}})\right)
$$

#### 2. Ontographia Intent Compilation & Closed-Routing Bound
Instead of Text-to-Cypher, every preset graph question is an **Ontographia Intent** compiled via `@edgesentry/ontographia-wasm`. When natural-language routing is used, the model may only emit a closed routing pair $(c, p)$:

$$
\text{LLM}(x) \mapsto (c, p) \in \mathcal{C} \times \mathcal{P}\sb{c}, \qquad \mathcal{Q} = \operatorname{Compile}\sb{\text{Ontographia}}(c, p)
$$

where $\mathcal{C}$ is the finite set of audited check intents and $\mathcal{P}\sb{c}$ is the validated parameter domain for intent $c$. Any routing output containing raw `MATCH`/`RETURN` Cypher or a markdown code fence is blocked before compilation or execution.

#### 3. Static Client & Automated Verification
The frontend is built with **React, TypeScript, and Vite** and deployed as static assets on **Cloudflare Workers**. An automated test suite (`test:farmbot`, `smoke:farmbot`, and `default-results.gold.json` oracle checks) verifies parity between offline Node/Relate execution and in-browser Relate WASM execution.

### How it uses Relate & Ontographia

The model only routes; Ontographia compiles the validated Intent into a deterministic, parameter-bound query, and Relate executes it against the graph. **Relate, Neo4j's lightweight graph database**, runs identical parameter-bound queries across `:memory:` WebAssembly (`@relate/relate-wasm`) in the browser and an inspectable persistent directory store (`@relate/relate`) offline.

### Challenges we ran into

1. **Running a Graph Database Inside a Stateless Browser Tab**:
   A browser tab has no local filesystem for traditional database persistence. Loading `@relate/relate-wasm` lazily into `:memory:` while verifying both the incoming seed and the resulting findings with Web Crypto SHA-256 digests kept first paint fast and execution 100% client-side.
2. **Eliminating LLM Query Hallucination**:
   Small local models frequently misspell relationship types or invent Cypher clauses. Enforcing a strict `{check, parameter}` routing contract—backed by a deterministic rejection guard—eliminated query hallucination without sacrificing natural-language triage.
3. **Representing Incomplete Real-World Documentation Honestly**:
   Pre-assembly pages that only link external PDFs cannot be parsed as markdown tables. Rather than guessing missing steps, we modeled `pdf-only` as an explicit audit boundary in the graph and surfaced a `PDF only` badge directly in the BOP lane.
4. **Cross-Process Schema Alignment**:
   Aligning identifiers across design changes, EBOM tables, SBOM materials, BOP chapters, packing lists, and service guides required careful normalization in DuckDB and strict golden-oracle testing to ensure zero drift between offline and browser results.

### Accomplishments that we're proud of

- **Zero-Server Verifiable Graph Audit**: Packaged the full PLM knowledge graph and Relate WASM execution engine into a static browser app whose outputs cryptographically match the committed findings SHA-256 digest.
- **Strict "Model Only Routes" Safety Invariant**: Demonstrated both deterministic Cypher-injection rejection (`MATCH (part:Part) RETURN part`) and live graph-backed Claim Verification (`REJECTED` vs. `CONFIRMED`) without letting an LLM touch query syntax.
- **Readable Visual Provenance for Hardware Teams**: Connected interactive SVG process lanes, source file/line citations, and parameter-bound `CYPHER 25` queries so engineers can trace any inconsistency in seconds.

### What we learned

- **Separate Routing from Query Generation**: LLMs excel at mapping user intent onto a bounded catalog $\mathcal{C}$, while deterministic compilers like Ontographia guarantee safe, parameter-bound `CYPHER 25` execution.
- **Cryptographic Digests Build Confidence in Client-Side Tools**: Verifying browser-computed results against a committed canonical-JSON SHA-256 digest turns a static web demo into a reproducible audit artifact.
- **Explicit Audit Boundaries Matter**: Showing where automation stops (such as `PDF only` pre-assembly chapters) is just as important as showing what the graph proves.

### What's next for PLM Graph Audit on FarmBot with Ontographia and Relate

- **PDF & CAD BOM Ingestion**: Extend the DuckDB extraction pipeline to parse `pdf-only` pre-assembly sheets and structured STEP/CAD BOM exports so those audit boundaries become full graph edges.
- **CI/CD Pull-Request Gate for Hardware Docs**: Run the persistent `@relate/relate` store and Ontographia checks as a GitHub Action on hardware documentation PRs to catch packing, EBOM, and service drift before release tags are cut.
- **Multi-Revision Diffing**: Compare Relate snapshots across hardware revisions (e.g., FarmBot Genesis v1.6 vs. v1.7) to highlight newly introduced or resolved cross-process disagreements automatically.

---

## Official Rules Disclosures (Relate by Neo4j Hackathon)

### 1. Product Capabilities Used (Relate)

- **Relate, Neo4j's lightweight graph database:** Runs in-browser `:memory:` (`@relate/relate-wasm`) and builds a persistent Node directory store (`@relate/relate`) for reproducible offline inspection.

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
