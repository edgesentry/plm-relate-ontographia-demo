# FarmBot Genesis Demo Video Recording Guide (v2)

Single-source-of-truth production guide for filming the v2 live `/farmbot/` demo video: **100 seconds (`1:40`)**, with **English voiceover narration (TTS or live voice)**, **targeted UI zoom-ins**, and **short non-overlapping captions**.

- **Live URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Target Length:** `100 seconds` (`1:40`) — fits comfortably inside the 1:35–1:45 pacing target and Devpost's 2-minute (`120s`) limit with zero dead air.
- **Audio & Visual Format:** English voiceover narration (~230 words at ~140 WPM) + crisp zoom-ins on high-value technical artifacts (SHA-256 verification, multi-hop graph traversal, Executed `CYPHER 25`, Bound parameters, `Stainless Steel`, `PDF only`, rejection banner, `REJECTED` / `CONFIRMED`) + short, non-overlapping captions placed in a dedicated bottom safe band.

---

## 1. Pre-Recording Setup

### Browser and Viewport
- **Clean Profile:** Dedicated browser profile with extensions, dev tools, bookmarks bar, and OS notifications ("Do Not Disturb") disabled.
- **Viewport:** `1280x800` at 100% browser zoom (capture at 2x DPR / `2560x1600` if using digital zoom-ins in post so zoomed regions stay razor-sharp).
- **Language:** Set `data-testid="lang-toggle"` to English (`en`).

### Local Model & Operational Guardrails
- **No Live Model Roll:** Use only the deterministic rejection button (`data-testid="farmbot-rejection-demo-button"`). Never click "Allow and load model" (`checkConsentAllow`) or type free-text prompts on film. Resolve any WebGPU consent card off-camera via "Decline" (`checkConsentDecline`).
- **Committed Data Only:** Use only the committed seed, checks, and findings (`farmbot/dist/farmbot.findings.json`). Never state hardcoded inventory counts in narration or captions.
- **In-Browser Only / No Secrets:** Everything executes in the browser tab. Never trigger `/api/notify/test`, configure secrets, or show email addresses/tokens.
- **Scope Boundary:** Do not film or describe the pre-contest desk-fan screen at `/` as `/farmbot/` behavior.
- **Relate Naming:** Name Relate as **"Relate, Neo4j's lightweight graph database"** in voiceover/captions when introduced.

---

## 2. Beat-by-Beat Shot List (`100 seconds` / `1:40` Total)

```
Beat 0 (8s) ─> Beat 1 (7s) ─> Beat 2 (15s) ─> Beat 3 (18s) ─> Beat 4 (11s) ─> Beat 5 (13s) ─> Beat 6 (9s) ─> Beat 7 (12s) ─> Beat 8 (7s)
Opening       Sample Card     Relate WASM      Graph Lanes &   SBOM Lane       BOP & PDF       Cypher Guard   Claim Verifier  Closing Bound
& Flow Strip  Click R6        SHA-256 + Evid.  Cypher Zoom     R1 Reconcile    R2 -> R5        Reject Demo    FAIL -> PASS    "Never Cypher"
                                                                                               (100s / 1:40 Total)
```

Pacing rule: Cut or speed-ramp any idle wait where the screen is static; every beat transitions immediately on a click, scroll, or zoom cue.

---

### Beat 0: Opening Hook and 3-Step Flow Strip
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open `/farmbot/` in a fresh English tab and let the landing frame settle.
  2. Do not click, scroll, or type during this opening beat.
- **On-Screen Requirements:**
  - Compact 3-step flow strip (`data-testid="flow-strip"`): `flowStepAgent` ("Agent finds the drift"), `flowStepEmail` ("Email link"), `flowStepAnalysis` ("Graph analysis in the browser").
  - `data-testid="how-it-works"` (`howItWorksLabel`) stays closed.
- **Zoom / Framing:** Full `1280x800` frame, gentle 1.15x push-in toward `data-testid="flow-strip"`.
- **English Voiceover:**
  > "Hardware docs drift across BOMs, assembly steps, packing lists, and service guides. Here, an audit runs live in your browser on Relate, Neo4j's lightweight graph database."
- **Short Caption:** `Zero-server PLM graph audit in the browser on Relate.`
- **Target Timing:** 8 seconds (0:00 to 0:08)
- **Cut Point:** Immediately after `"graph database."` as cursor moves onto the sample cards.

---

### Beat 1: Sample Notification Card to Deep Link
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Keep viewport at `y = 0` so all sample cards (`sampleHeading`: "Sample emails", `sampleIntro`) are visible.
  2. Hover the `R6-power-supply` card (`sampleScenarioDesignChange`, `sampleSummaryR6PowerSupply`) and click `Open R6-power-supply` (`sampleOpenFinding`).
- **On-Screen Requirements:**
  - `sampleCardLabel` ("Sample") badge visible so reviewers see these are sample cards, not sent mail.
- **Zoom / Framing:** 1.25x zoom onto the `R6-power-supply` card as the click ripple fires.
- **English Voiceover:**
  > "A reviewer starts from a sample notification link and jumps straight to the affected finding—no backend server required."
- **Short Caption:** `Deep link from sample alert -> live tab verification.`
- **Target Timing:** 7 seconds (0:08 to 0:15)
- **Cut Point:** Right as the click triggers the in-browser run and scrolls to `R6-power-supply`.

---

### Beat 2: Relate Embedded Value (Part A) — SHA-256 Seed Load & Downstream Evidence (`R6-power-supply`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Capture the first-Run in-memory load settling on `R6-power-supply` and highlight `findingsMatch` ("The browser result matches the committed findings").
  2. Sweep cursor down the `evidenceHeading` ("Evidence") rows (`design-change`, `part`, `structure`, `reference`, `packing-line`, `service`) showing source files and line numbers (`electronics.md:146`, `storing-farmbot-for-winter.md`, `power-supply.md`).
- **On-Screen Requirements:**
  - Finding header (`R6-power-supply`, `severityReview`), `findingsMatch` verification banner, and multi-source evidence table with file + line citations.
- **Zoom / Framing:** 1.4x zoom on the `findingsMatch` banner (2s), then pan down to the evidence rows citing `electronics.md`, packing, and `storing-farmbot-for-winter.md`.
- **English Voiceover:**
  > "On first run, the tab verifies the FarmBot seed's SHA-256 digest with Web Crypto, loads it into an in-memory Relate WASM database, and executes multi-hop Cypher locally. Every evidence row traces the changed Power Supply across assembly, packing, and service files down to the line number."
- **Short Caption:** `SHA-256 verified seed -> :memory: Relate WASM -> source-line evidence.`
- **Target Timing:** 15 seconds (0:15 to 0:30)
- **Cut Point:** Right after the cursor sweeps the cited source file lines.

---

### Beat 3: Relate Embedded Value (Part B) — Graph Traversal, Process Lanes & Cypher Provenance (`R6-power-supply`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Frame `[data-testid="process-lanes"]` (`processLanesHeading`) showing the five active lanes: `laneDesignChange` ("Design change"), `laneEbomPart` ("EBOM part"), `laneBop` ("BOP (instructions)"), `lanePacking` ("Packing"), and `laneService` ("Service"), plus legend (`lanesLegendProblem`, `lanesLegendPath`, `lanesLegendMissing`).
  2. Click diagram node `Power Supply` to highlight its evidence row, then click `Select node` (`evidenceSelect`) on a packing row to reciprocally highlight the graph.
  3. Expand "Intent, Cypher and parameters" (`evidenceQueriesLabel`) on that row.
- **On-Screen Requirements:**
  - Reciprocal node/row selection (`aria-pressed="true"`), dashed missing-link legend visible, and expanded query provenance block (`executedCypherLabel` showing `CYPHER 25 ...` and `paramsLabel` bound JSON).
- **Zoom / Framing:** Full lane traversal shot (7s) showing `Design change -> EBOM part -> BOP -> Packing -> Service`, then **1.6x zoom-in** directly on the expanded Intent, `CYPHER 25` query, and Bound parameters box (11s).
- **English Voiceover:**
  > "This isn't a flat table diff. Relate traverses the connected graph from design change through EBOM part, assembly instructions, packing, and service, flagging unconfirmed links with dashed edges. Click any node to trace its exact Ontographia Intent, executed Cypher, and bound parameters."
- **Short Caption:** `Multi-hop Relate traversal + Intent, executed Cypher & bound parameters.`
- **Target Timing:** 18 seconds (0:30 to 0:48)
- **Cut Point:** Hold 1.5s on the zoomed `CYPHER 25` + bound parameters block, then cut cleanly to `R1-40mm-nut-bar-standard`.

---

### Beat 4: SBOM (Materials) Lane & Quantity Reconciliation (`R1-40mm-nut-bar-standard`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R1-40mm-nut-bar-standard`
- **Click Sequence:**
  1. Navigate directly to `#finding=R1-40mm-nut-bar-standard`.
  2. Frame the finding header with `reconciliationCategoryR1` ("Quantity difference") and `reconciliationR1Note` ("Part page versus packing list"), then hover `Stainless Steel` in `laneSbom` ("SBOM (materials)").
- **On-Screen Requirements:**
  - Finding `R1-40mm-nut-bar-standard` (`checkR1Label`), category label `reconciliationCategoryR1` ("Quantity difference") with `reconciliationR1Note` ("Part page versus packing list"), and visible lanes `laneEbomPart`, `laneSbom` (`Stainless Steel`), and `lanePacking`.
- **Zoom / Framing:** **1.5x zoom-in** on `SBOM (materials)` lane and the `Stainless Steel` node alongside the quantity-difference header.
- **English Voiceover:**
  > "Lanes appear strictly from evidence. When a part page documents a material, the SBOM materials lane surfaces it—here, Stainless Steel alongside a packing quantity mismatch—without inventing substance data."
- **Short Caption:** `SBOM (materials) lane: evidence-only, hidden when undocumented.`
- **Target Timing:** 11 seconds (0:48 to 0:59)
- **Cut Point:** Immediately after `"substance data."` -> hard cut to `R2-barb`.

---

### Beat 5: BOP (Instructions) Lane and PDF-Only Audit Boundary (`R2-barb` -> `R5`)
- **Target URLs:**
  - Part A (5s): `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R2-barb`
  - Part B (8s): `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`
- **Click Sequence:**
  1. Open `#finding=R2-barb` and point to `laneBop` ("BOP (instructions)") — confirm no PDF-only marker appears.
  2. Cut to `#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md` and point directly at `[data-testid="process-node-pdf-only"]` ("PDF only").
- **On-Screen Requirements:**
  - `R2-barb`: `laneBop` visible, no PDF-only badge.
  - `R5`: `laneBop` visible with `[data-testid="process-node-pdf-only"]` ("PDF only", `lanesNodePdfOnlyShort`).
- **Zoom / Framing:** Wide shot on `R2-barb` `laneBop` (5s), then **1.7x zoom-in** on the `PDF only` badge in `R5` (8s).
- **English Voiceover:**
  > "The BOP instructions lane maps documented assembly structure, not assumed factory routing. When a pre-assembly page only links a PDF, this PDF-only marker flags the audit boundary instead of guessing unparsed steps."
- **Short Caption:** `BOP (instructions) lane + explicit PDF-only audit boundary.`
- **Target Timing:** 13 seconds (0:59 to 1:12)
- **Cut Point:** Right after `"unparsed steps."` -> cut to free-text check routing section.

---

### Beat 6: Deterministic Cypher-Output Rejection Guard
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open `checkRoutingHeading` ("Check routing") disclosure and scroll to `checkFreeTextHeading` ("Free-text check routing").
  2. Click `Show a rejected routing output` (`checkRejectionDemoButton`, `[data-testid="farmbot-rejection-demo-button"]`).
- **On-Screen Requirements:**
  - Fixed sample input `MATCH (part:Part) RETURN part` (`checkRejectionDemoSampleLabel`).
  - Rejection alert banner: `checkRoutingRejected` ("The routing output was rejected."), `checkRoutingRejectedBody` ("Nothing new was compiled or executed."), and validator reason `routing output contains Cypher or a markdown fence`.
- **Zoom / Framing:** **1.6x zoom-in** on the fixed Cypher payload and red rejection alert banner immediately after click.
- **English Voiceover:**
  > "For AI safety, any routing output containing raw Cypher or a markdown fence is blocked by the validator—nothing is compiled or executed."
- **Short Caption:** `Closed-routing validator blocks raw Cypher before compilation.`
- **Target Timing:** 9 seconds (1:12 to 1:21)
- **Cut Point:** Right after `"compiled or executed."` -> scroll down to Claim Verification panel.

---

### Beat 7: Deterministic Claim Verification Panel (`REJECTED` vs `CONFIRMED`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open `data-testid="claim-verifier-panel"` ("Deterministic claim verification").
  2. With default `uc1-hallucinated-part-fail` selected ("Titanium Servo Coupling is used in the gantry assembly chapter"), click `Verify claim` (`data-testid="verify-claim-run"`) and scroll `data-testid="claim-verdict"` into view -> shows `REJECTED` and `data-testid="claim-missing-evidence"` (`MISSING_part_node`).
  3. Click `uc1-hallucinated-part-pass` ("M5 x 10mm Screw is used in the gantry assembly chapter") and click `Verify claim` -> shows `CONFIRMED`.
- **On-Screen Requirements:**
  - `REJECTED` verdict + missing-node evidence block (6s), then `CONFIRMED` verdict (6s).
- **Zoom / Framing:** **1.6x zoom-in** on `REJECTED` + missing-node evidence, then hold zoom as it flips to `CONFIRMED`.
- **English Voiceover:**
  > "We can also replay agent claims against Relate. An invented part is deterministically rejected with the missing node; a real part in the graph is confirmed."
- **Short Caption:** `Agent claim replay: hallucinated part REJECTED -> valid part CONFIRMED.`
- **Target Timing:** 12 seconds (1:21 to 1:33)
- **Cut Point:** Hold 1s on `CONFIRMED`, then return to the closing bound.

---

### Beat 8: Closed-Routing Bound and Closing Line
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Frame the bottom of `checkFreeTextHeading` where `checkModelNoCypher` (`"The model only routes; it never writes Cypher."`) sits alongside the rejected Cypher sample.
- **On-Screen Requirements:**
  - `checkModelNoCypher` ("The model only routes; it never writes Cypher.") clearly legible in frame.
- **Zoom / Framing:** **1.7x zoom-in** centered on `"The model only routes; it never writes Cypher."` with clean 1-second end hold.
- **English Voiceover:**
  > "In short: the model only routes; it never writes Cypher."
- **Short Caption:** `The model only routes; it never writes Cypher.`
- **Target Timing:** 7 seconds (1:33 to 1:40)
- **Cut Point:** Hold 1 second of clean pause after `"it never writes Cypher."` and fade out.

---

## 3. Retake Checklist

1. Reload `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/` in a fresh tab (`en` active, `y = 0`).
2. Confirm no WebLLM model download was initiated and consent card is declined/unconsented.
3. Confirm clean browser chrome (no DevTools, bookmarks, or OS notifications).
4. Verify Beat 6 uses only `data-testid="farmbot-rejection-demo-button"` (no live typing).
5. Verify final audio + caption line ends verbatim with `"the model only routes; it never writes Cypher."`

---

## 4. Automated Capture & Post-Production Workflow (v2)

- **Sharp Digital Zooms:** Capture Playwright video (or screen recording) at `1280x800` with `deviceScaleFactor: 2` (`2560x1600` canvas) so 1.5x–1.7x zoom-ins on Cypher, `MISSING_part_node`, and `PDF only` badges remain crisp in 1080p/800p export.
- **Pre-Beat Trimming:** Record from context creation and trim initial page-load frames with `ffmpeg -ss <trimStartSec>` so Beat 0 begins cleanly at `0:00`.
- **Reliable Interactions:** Scroll `<summary>` elements to viewport center before clicking and assert the parent `<details>` has `open` (Beat 3 `details.evidence-queries`, Beat 7 `claim-verifier-panel`). After clicking `verify-claim-run`, scroll `[data-testid="claim-verdict"]` into view.
- **CSP-Safe Cursor Overlay:** When recording headless Playwright, intercept `/farmbot/*` HTML via `page.route` and append `'unsafe-inline'` to `style-src` for the recording session only, so a subtle pointer + click ripple renders without touching app code or `connect-src`.
- **English Voiceover & Non-Overlapping Captions:**
  - Generate or record the per-beat English voiceover tracks first, measure exact clip durations, and align beat holds to match voiceover + 0.5s breathing room (target total: `100s` / `1:40`).
  - Place short captions in a dedicated semi-transparent lower safe band (max 1 line, <=75 chars) that never covers active Cypher blocks, verdict badges, or buttons.
  - Export H.264 MP4 (`yuv420p`, `30fps`, stereo AAC 44.1 kHz, `-movflags +faststart`) plus a matching `.srt` file for YouTube/Vimeo closed captions.
