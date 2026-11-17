Model: Gemini 4 Hydrogen (Medium)

# Devpost Submission Text — FarmBot B1 (`/farmbot/`)

> Paste-ready sections below are written for `#61` (`Update Devpost submission text for FarmBot B1`) in the **Relate by Neo4j Hackathon**. Reader-facing prose contains no repository file paths, no hardcoded inventory counts, and no restated code tables. All source-file citations, `src/farmbot/i18n.ts` key mappings (English and Japanese), and verification notes are in the **Editor Notes** section at the end.

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

---

## Editor Notes (Do Not Paste into Devpost)

### Source-of-Truth Citations

- **Merged README & alignment:** `README.md` at `99423a54f9ddc9b569e819f6adbdaf347d942548` (background, purpose, where-to-look pointers under "Cross-process BOM checks", pre-event code disclosure, and Relate modes).
- **Rule table & executed Intent set:** `src/farmbot/agent/checks.mjs` (`CHECKS` for R1–R9, `INTENT_FILES`, `SHARED_INTENTS`, `ABSENCE_INTENTS`).
- **Engine entry & deterministic evaluation:** `src/farmbot/agent/index.mjs` (`collectFindings`, `inferred` / `fact` handling, severity & overlap calculation).
- **Closed `{check, parameter}` routing:** `src/farmbot/check-routing.mjs` (`CHECK_ROUTING_JSON_SCHEMA`, `validateCheckRouting`, `parseCheckRouting`, `expandCheckRouting`, `prepareCheckProposal`).
- **Local WebLLM integration & model constants:** `src/farmbot/check-webllm.ts` (`loadCheckRoutingModel`, lazy `../lib/webllm-package` import, `response_format` JSON schema) and `src/lib/webllm.ts` (`INTENT_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'`, `INTENT_MODEL_VRAM_MB = 879.04`, `INTENT_MODEL_DOWNLOAD_BYTES = 695_242_752`).
- **Consent & routing UI:** `src/farmbot/CheckFreeTextPanel.tsx` and `src/farmbot/CheckRoutingPanel.tsx`.
- **Process-lane SVG diagram & dashed missing links:** `src/farmbot/process-lanes.mjs` (`layoutFinding`), `src/farmbot/ProcessLanes.tsx`, and `src/farmbot/styles.css` (`.process-edge-missing` uses `stroke-dasharray: 5 3`).
- **Check Intents & ontology:** `farmbot/checks/` and `farmbot/ontology/farmbot.native.yaml`.
- **Findings document & regeneration:** `farmbot/dist/farmbot.findings.json` (format `farmbot-findings-v1`), regenerated by `npm run agent:farmbot` (`package.json`).
- **Browser smoke suite:** `scripts/smoke-farmbot.mjs`.
- **Package pins:** `package.json` (`@edgesentry/ontographia-wasm` `0.1.10`, `@relate/relate-wasm` `1.0.1`, `@relate/relate` `1.0.1`, `@mlc-ai/web-llm` `^0.2.88`, `@duckdb/node-api` `1.4.5-r.1`). Version numbers are omitted from the paste-ready prose.
- **Worker & notification config:** `wrangler.jsonc` (`triggers.crons`, `send_email`, `kv_namespaces`, `ratelimits`, `vars.NOTIFY_DAILY_CAP`, `PUBLIC_BASE_URL`), `worker/index.ts`, `worker/notify.ts`.

### `src/farmbot/i18n.ts` Key Mappings (English and Japanese)

- **In-tab execution (`subtitle`):**
  - `en`: `"Committed seed, Intents compiled by Ontographia, Cypher executed by Relate — all in this tab"`
  - `ja`: `"コミット済みシード、Ontographia がコンパイルした Intent、Relate が実行する Cypher — すべてこのタブ内で完結します"`
- **Lazy Relate loading (`relateIdle`):**
  - `en`: `"Relate (WASM) loads on the first Run. It is not requested on first paint."`
  - `ja`: `"Relate (WASM) は最初の実行時に読み込みます。初回描画時には要求しません。"`
- **Findings digest verification (`findingsHint`, `findingsMatch`):**
  - `en`: `"The check Intents run in this tab against the seed whose digest was verified. Nothing is sent anywhere."` / `"The browser result matches the committed findings"`
  - `ja`: `"チェック Intent は、ダイジェストを検証したシードに対してこのタブ内で実行します。どこにも送信しません。"` / `"ブラウザの結果はコミット済みの検出結果と一致しています"`
- **Evidence provenance (`intentLabel`, `executedCypherLabel`, `paramsLabel`, `evidenceQueriesLabel`):**
  - `en`: `"Intent"` / `"Executed Cypher"` / `"Bound parameters"` / `"Intent, Cypher and parameters"`
  - `ja`: `"Intent"` / `"実行された Cypher"` / `"バインドされたパラメータ"` / `"Intent・Cypher・パラメータ"`
- **Process lanes & missing links (`processLanesHeading`, `lanesLegendMissing`, `lanesMissingTitle`):**
  - `en`: `"Process lanes"` / `"Missing link"` / `"Missing link to lane"`
  - `ja`: `"プロセスレーン"` / `"欠落リンク"` / `"レーンへの欠落リンク"`
- **Fact vs. inferred (`factLabel`, `inferenceLabel`):**
  - `en`: `"fact"` / `"inferred"`
  - `ja`: `"事実"` / `"推定"`
- **Check routing & consent (`checkRoutingIntro`, `checkFreeTextIntro`, `checkConsentTitle`, `checkConsentBody`, `checkFreeTextPrivacy`, `checkModelNoCypher`, `checkWebgpuNotice`, `checkConsentDeclined`, `checkResultNote`):**
  - `checkRoutingIntro` (`en` / `ja`): `"Choose a rule chip, or convert one sentence after local model consent. Review the expanded Intents, then confirm before anything runs."` / `"ルールのチップを選ぶか、ローカルモデルの利用を許可して文章を変換してください。展開された Intent を確認してから実行します。"`
  - `checkFreeTextIntro` (`en` / `ja`): `"The local model selects only one routing object. The check engine, not the model, remains responsible for findings."` / `"ローカルモデルはルーティングオブジェクトを一つ選ぶだけです。検出結果の生成はモデルではなく従来のチェックエンジンが担当します。"`
  - `checkConsentTitle` (`en` / `ja`): `"Allow a local model download?"` / `"ローカルモデルのダウンロードを許可しますか？"`
  - `checkConsentBody` (`en` / `ja`): `"After you allow it, this browser downloads and caches the model. Text is processed locally; this demo sends no inference request to an API."` / `"許可すると、ブラウザがモデルをダウンロードしてキャッシュします。文章はローカルで処理され、このデモが推論リクエストを API に送信することはありません。"`
  - `checkFreeTextPrivacy` (`en` / `ja`): `"Consent is required before the lazy WebLLM package or model files are requested. Declining never disables the rule chips."` / `"WebLLM の遅延読み込みパッケージとモデルファイルの要求には同意が必要です。拒否してもルールのチップは使えます。"`
  - `checkModelNoCypher` (`en` / `ja`): `"The model never writes Cypher and never detects, explains, or scores a finding. Strict validation precedes Ontographia compilation."` / `"モデルは Cypher を記述せず、検出・説明・スコア計算も行いません。Ontographia のコンパイル前に厳密に検証します。"`
  - `checkWebgpuNotice` (`en` / `ja`): `"WebGPU is not available. The rule chips and parameter selectors still provide the same Intents; no model card or download is offered."` / `"WebGPU を利用できません。ルールのチップとパラメータセレクタで同じ Intent を使えます。モデルの許可カードとダウンロードは表示しません。"`
  - `checkConsentDeclined` (`en` / `ja`): `"Model access was declined. Nothing was downloaded; the rule chips and the rest of this screen remain available."` / `"モデルの利用を許可しませんでした。ダウンロードは行われず、ルールのチップと画面の他の機能を引き続き使えます。"`
  - `checkResultNote` (`en` / `ja`): `"These rows come only from the confirmed Intents. This path does not collect findings or calculate causes and severity."` / `"確認された Intent の行だけを表示しています。この経路では検出結果の収集、原因候補の生成、重大度の計算を行いません。"`
