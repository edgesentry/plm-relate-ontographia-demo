# FarmBot Genesis Demo Video Recording Guide (v2)

Single-source-of-truth production guide for filming the v2 live `/farmbot/` demo video: **102 seconds (`1:42`)**, with **English voiceover narration (TTS or live voice)**, **targeted UI zoom-ins**, and **short non-overlapping captions** cut directly from the narration text.

- **Live URL:** `https://demo.edgesentry.io/farmbot/`
- **Target Length:** `102 seconds` (`1:42`), inside the 1:35 to 1:45 pacing target and Devpost's 2-minute (`120s`) limit with zero dead air.
- **Audio & Caption Contract:** Narration stays at or below 2.5 words/s per beat. Captions equal the narration text split into non-overlapping cues at or below 17 characters/s in a dedicated bottom safe band. No background music is tracked in this guide.

---

## 1. Pre-Recording Setup

### Browser and Viewport
- **Clean Profile:** Dedicated browser profile with extensions, dev tools, bookmarks bar, and OS notifications ("Do Not Disturb") disabled.
- **Viewport:** `1280x800` at 100% browser zoom (capture at 2x DPR / `2560x1600` if using digital zoom-ins in post so zoomed regions stay sharp).
- **Language:** Set `data-testid="lang-toggle"` to English (`en`).

### Local Model & Operational Guardrails
- **No Live Model Roll:** Use only the deterministic rejection button (`data-testid="farmbot-rejection-demo-button"`). Never click "Allow and load model" (`checkConsentAllow`) or type free-text prompts on film. Resolve any WebGPU consent card off-camera via "Decline" (`checkConsentDecline`).
- **Committed Data Only:** Use only the committed seed, checks, and findings (`farmbot/dist/farmbot.findings.json`). Never state hardcoded inventory counts in narration or captions.
- **In-Browser Only / No Secrets:** Everything executes in the browser tab. Never trigger `/api/notify/test`, configure secrets, or show email addresses or tokens.
- **Scope Boundary:** Do not film or describe the pre-contest desk-fan screen at `/` as `/farmbot/` behavior.
- **Relate Naming:** Name Relate as **"Relate, Neo4j's lightweight graph database"** in voiceover and captions when introduced.

---

## 2. Beat-by-Beat Shot List (`102 seconds` / `1:42` Total)

```
Beat 0 (10s) -> Beat 1 (7s) -> Beat 2 (15s) -> Beat 3 (18s) -> Beat 4 (11s) -> Beat 5 (13s) -> Beat 6 (9s) -> Beat 7 (13s) -> Beat 8 (6s)
Opening         Sample Card    Relate Graph    Graph Lanes &   SBOM Lane       BOP & PDF       Cypher Guard   Claim Panel     Closing Hold
& Flow Strip    Click R6       & Broken Link   Cypher Zoom     R1 Reconcile    R2 -> R5        Reject Demo    FAIL -> PASS    "Never Cypher"
                                                                                               (102s / 1:42 Total)
```

Pacing rule: Cut or speed-ramp any idle wait where the screen is static; every beat transitions immediately on a click, scroll, or zoom cue.

---

### Beat 0: Opening Hook and 3-Step Flow Strip
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Open `/farmbot/` in a fresh English tab and let the landing frame settle.
  2. Do not click, scroll, or type during this opening beat.
- **On-Screen Requirements:**
  - Compact 3-step flow strip (`data-testid="flow-strip"`): `flowStepAgent` ("Agent finds the drift"), `flowStepEmail` ("Email link"), `flowStepAnalysis` ("Graph analysis in the browser").
  - `data-testid="how-it-works"` (`howItWorksLabel`) stays closed.
- **Zoom / Framing:** Full `1280x800` frame, gentle 1.15x push-in toward `data-testid="flow-strip"`.
- **English Voiceover:**
  > "Change-log edits skipping BOM, packing, or service get built, shipped, and serviced wrong. A browser Relate graph, no backend, traces and proves the gap."
- **Caption Cues:**
  - `0:00-0:06`: "Change-log edits skipping BOM, packing, or service get built, shipped, and serviced wrong."
  - `0:06-0:10`: "A browser Relate graph, no backend, traces and proves the gap."
- **Target Timing:** 10 seconds (0:00 to 0:10)
- **Cut Point:** Immediately after `"proves the gap."` as cursor moves onto the sample cards.

---

### Beat 1: Sample Notification Card to Deep Link
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Start at `y = 0` so the sample cards (`sampleHeading`: "Sample emails", `sampleIntro`) are visible.
  2. Hover the `R6-power-supply` card (`sampleScenarioDesignChange`, `sampleSummaryR6PowerSupply`) and click `Open R6-power-supply` (`sampleOpenFinding`), which scrolls `[data-testid="finding-view"]` into view and moves the sample cards out of frame.
- **On-Screen Requirements:**
  - `sampleCardLabel` ("Sample") badge visible before the click so reviewers see these are sample cards, not sent mail.
- **Zoom / Framing:** 1.25x zoom onto the `R6-power-supply` card as the click ripple fires, easing back out as the page scrolls to `[data-testid="finding-view"]`.
- **English Voiceover:**
  > "A reviewer opens a sample alert, jumping straight to the finding. The model never writes Cypher."
- **Caption Cues:**
  - `0:10-0:14`: "A reviewer opens a sample alert, jumping straight to the finding."
  - `0:14-0:17`: "The model never writes Cypher."
- **Target Timing:** 7 seconds (0:10 to 0:17)
- **Cut Point:** Right as the click triggers the in-browser run and scrolls to `R6-power-supply`.

---

### Beat 2: Relate Embedded Value (Part A): SHA-256 Seed Load and Downstream Evidence (`R6-power-supply`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Capture the first-Run in-memory load settling on `R6-power-supply` and highlight `findingsMatch` ("The browser result matches the committed findings").
  2. Sweep cursor down the `evidenceHeading` ("Evidence") rows (`design-change`, `part`, `structure`, `reference`, `packing-line`, `service`) showing source files and line numbers (`electronics.md:146`, `storing-farmbot-for-winter.md`, `power-supply.md`).
- **On-Screen Requirements:**
  - Finding header (`R6-power-supply`, `severityReview`), `findingsMatch` verification banner, and multi-source evidence table with file and line citations.
- **Zoom / Framing:** 1.4x zoom on the `findingsMatch` banner (2s), then pan down to the evidence rows citing `electronics.md`, packing, and `storing-farmbot-for-winter.md`.
- **English Voiceover:**
  > "Your browser holds a Relate graph linking design, manufacturing, process, packing, and service documents, backed by a SHA-256-verified WASM seed. Here, it traces Power Supply straight to the broken links."
- **Caption Cues:**
  - `0:17-0:22`: "Your browser holds a Relate graph linking design, manufacturing, process,"
  - `0:22-0:28`: "packing, and service documents, backed by a SHA-256-verified WASM seed."
  - `0:28-0:32`: "Here, it traces Power Supply straight to the broken links."
- **Target Timing:** 15 seconds (0:17 to 0:32)
- **Cut Point:** Right after the cursor sweeps the cited source file lines.

---

### Beat 3: Relate Embedded Value (Part B): Graph Traversal, Process Lanes, and Cypher Provenance (`R6-power-supply`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Frame `[data-testid="process-lanes"]` (`processLanesHeading`) showing the five active lanes: `laneDesignChange` ("Design change"), `laneEbomPart` ("EBOM part"), `laneBop` ("BOP (instructions)"), `lanePacking` ("Packing"), and `laneService` ("Service"), plus legend (`lanesLegendProblem`, `lanesLegendPath`, `lanesLegendMissing`).
  2. Click diagram node `Power Supply` to highlight its evidence row, then click `Select node` (`evidenceSelect`) on a packing row to reciprocally highlight the graph.
  3. Expand "Intent, Cypher and parameters" (`evidenceQueriesLabel`) on that row.
- **On-Screen Requirements:**
  - Reciprocal node/row selection (`aria-pressed="true"`), dashed missing-link legend visible, and expanded query provenance block (`executedCypherLabel` showing `CYPHER 25 ...` and `paramsLabel` bound JSON).
- **Zoom / Framing:** Full lane traversal shot (7s) showing `Design change -> EBOM part -> BOP -> Packing -> Service`, then **1.6x zoom-in** directly on the expanded Intent, `CYPHER 25` query, and Bound parameters box (11s).
- **English Voiceover:**
  > "Relate walks from the design change through EBOM part, instructions, packing, and service, marking missing links dashed. Clicking a row opens the exact Intent, executed Cypher, and bound parameters that proved it."
- **Caption Cues:**
  - `0:32-0:37`: "Relate walks from the design change through EBOM part, instructions,"
  - `0:37-0:41`: "packing, and service, marking missing links dashed."
  - `0:41-0:46`: "Clicking a row opens the exact Intent, executed Cypher,"
  - `0:46-0:50`: "and bound parameters that proved it."
- **Target Timing:** 18 seconds (0:32 to 0:50)
- **Cut Point:** Hold 1.5s on the zoomed `CYPHER 25` and bound parameters block, then cut cleanly to `R1-40mm-nut-bar-standard`.

---

### Beat 4: SBOM (Materials) Lane and Quantity Reconciliation (`R1-40mm-nut-bar-standard`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/#finding=R1-40mm-nut-bar-standard`
- **Click Sequence:**
  1. Navigate directly to `#finding=R1-40mm-nut-bar-standard`.
  2. Frame the finding header with `reconciliationCategoryR1` ("Quantity difference") and `reconciliationR1Note` ("Part page versus packing list"), then hover `Stainless Steel` in `laneSbom` ("SBOM (materials)").
- **On-Screen Requirements:**
  - Finding `R1-40mm-nut-bar-standard` (`checkR1Label`), category label `reconciliationCategoryR1` ("Quantity difference") with `reconciliationR1Note` ("Part page versus packing list"), and visible lanes `laneEbomPart`, `laneSbom` (`Stainless Steel`), and `lanePacking`.
- **Zoom / Framing:** **1.5x zoom-in** on `SBOM (materials)` lane and the `Stainless Steel` node alongside the quantity-difference header.
- **English Voiceover:**
  > "Lanes appear only from evidence. When a part page lists a material, the SBOM lane shows Stainless Steel beside the quantity mismatch."
- **Caption Cues:**
  - `0:50-0:56`: "Lanes appear only from evidence. When a part page lists a material,"
  - `0:56-1:01`: "the SBOM lane shows Stainless Steel beside the quantity mismatch."
- **Target Timing:** 11 seconds (0:50 to 1:01)
- **Cut Point:** Immediately after `"quantity mismatch."` -> hard cut to `R2-barb`.

---

### Beat 5: BOP (Instructions) Lane and PDF-Only Audit Boundary (`R2-barb` to `R5`)
- **Target URLs:**
  - Part A (5s): `https://demo.edgesentry.io/farmbot/#finding=R2-barb`
  - Part B (8s): `https://demo.edgesentry.io/farmbot/#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`
- **Click Sequence:**
  1. Open `#finding=R2-barb` and point to `laneBop` ("BOP (instructions)"), confirming no PDF-only marker appears.
  2. Cut to `#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md` and point directly at `[data-testid="process-node-pdf-only"]` ("PDF only").
- **On-Screen Requirements:**
  - `R2-barb`: `laneBop` visible, no PDF-only badge.
  - `R5`: `laneBop` visible with `[data-testid="process-node-pdf-only"]` ("PDF only", `lanesNodePdfOnlyShort`).
- **Zoom / Framing:** Wide shot on `R2-barb` `laneBop` (5s), then **1.7x zoom-in** on the `PDF only` badge in `R5` (8s).
- **English Voiceover:**
  > "The BOP lane maps documented assembly steps, not factory routing. When a pre-assembly page only links a PDF, this PDF-only badge marks the audit boundary without guessing."
- **Caption Cues:**
  - `1:01-1:06`: "The BOP lane maps documented assembly steps, not factory routing."
  - `1:06-1:10`: "When a pre-assembly page only links a PDF,"
  - `1:10-1:14`: "this PDF-only badge marks the audit boundary without guessing."
- **Target Timing:** 13 seconds (1:01 to 1:14)
- **Cut Point:** Right after `"without guessing."` -> cut to free-text check routing section.

---

### Beat 6: Deterministic Cypher-Output Rejection Guard
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Open `checkRoutingHeading` ("Check routing") disclosure and scroll to `checkFreeTextHeading` ("Free-text check routing").
  2. Click `Show a rejected routing output` (`checkRejectionDemoButton`, `[data-testid="farmbot-rejection-demo-button"]`).
- **On-Screen Requirements:**
  - Fixed sample input `MATCH (part:Part) RETURN part` (`checkRejectionDemoSampleLabel`).
  - Rejection alert banner: `checkRoutingRejected` ("The routing output was rejected."), `checkRoutingRejectedBody` ("Nothing new was compiled or executed."), and validator reason `routing output contains Cypher or a markdown fence`.
- **Zoom / Framing:** **1.6x zoom-in** on the fixed Cypher payload and red rejection alert banner immediately after click.
- **English Voiceover:**
  > "If routing output contains raw Cypher or a markdown fence, the validator blocks it. Nothing new is compiled or executed."
- **Caption Cues:**
  - `1:14-1:19`: "If routing output contains raw Cypher or a markdown fence, the validator blocks it."
  - `1:19-1:23`: "Nothing new is compiled or executed."
- **Target Timing:** 9 seconds (1:14 to 1:23)
- **Cut Point:** Right after `"compiled or executed."` -> scroll down to Claim Verification panel.

---

### Beat 7: Deterministic Claim Verification Panel (`REJECTED` then `CONFIRMED`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Scroll down past the findings panel to the claim verification panel (`data-testid="claim-verifier-panel"`, summary heading "Deterministic claim verification", id `claim-verifier-heading`) and open it.
  2. Keep the default fixture `uc1-hallucinated-part-fail` selected ("Titanium Servo Coupling is used in the gantry assembly chapter (v1.7/assembly/gantry.md)."). Click `Verify claim` (`data-testid="verify-claim-run"`) and scroll `data-testid="claim-verdict"` into view; badge is `REJECTED` with missing-node or claimed-versus-actual evidence (`data-testid="claim-missing-evidence"` / `claim-actual-evidence`).
  3. Click `uc1-hallucinated-part-pass` ("M5 x 10mm Screw is used in the gantry assembly chapter (v1.7/assembly/gantry.md).") and click `Verify claim` again; badge is `CONFIRMED`.
- **On-Screen Requirements:**
  - Summary heading: "Deterministic claim verification".
  - `uc1-hallucinated-part-fail`: `REJECTED` verdict + missing-node or claimed-versus-actual evidence visible (7s).
  - `uc1-hallucinated-part-pass`: `CONFIRMED` verdict visible (6s).
- **Zoom / Framing:** **1.6x zoom-in** on `REJECTED` and missing-node evidence, holding zoom as it flips to `CONFIRMED`.
- **English Voiceover:**
  > "In the claim verification panel, an invented part is replayed as Intent queries and rejected with the missing node. A valid part in the graph is confirmed."
- **Caption Cues:**
  - `1:23-1:29`: "In the claim verification panel, an invented part is replayed as Intent queries"
  - `1:29-1:32`: "and rejected with the missing node."
  - `1:32-1:36`: "A valid part in the graph is confirmed."
- **Target Timing:** 13 seconds (1:23 to 1:36)
- **Cut Point:** Hold on `CONFIRMED` and transition directly into Beat 8 without scrolling.

---

### Beat 8: Claim Verdict Hold and Closing Line
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Do not scroll or click; hold on the `CONFIRMED` result in `data-testid="claim-verifier-panel"` from Beat 7.
- **On-Screen Requirements:**
  - `data-testid="claim-verdict"` (`CONFIRMED` badge) and `data-testid="claim-actual-evidence"` clearly legible in frame.
- **Zoom / Framing:** Hold the **1.6x zoom-in** on `data-testid="claim-verdict"` (`CONFIRMED` badge) with no scroll.
- **English Voiceover:**
  > "In short, the model only routes; it never writes Cypher."
- **Caption Cues:**
  - `1:36-1:42`: "In short, the model only routes; it never writes Cypher."
- **Target Timing:** 6 seconds (1:36 to 1:42)
- **Cut Point:** Hold cleanly on `CONFIRMED` after `"it never writes Cypher."` and end.

---

## 3. Retake Checklist

1. Reload `https://demo.edgesentry.io/farmbot/` in a fresh tab (`en` active, `y = 0`).
2. Confirm no WebLLM model download was initiated and consent card is declined or unconsented.
3. Confirm clean browser chrome (no DevTools, bookmarks, or OS notifications).
4. Verify Beat 6 uses only `data-testid="farmbot-rejection-demo-button"` (no live typing).
5. Verify final audio and caption line ends verbatim with `"In short, the model only routes; it never writes Cypher."`

---

## 4. Automated Capture & Post-Production Workflow (v2)

- **Sharp Digital Zooms:** Capture Playwright video at `1280x800` with `deviceScaleFactor: 2` (`2560x1600` canvas) so 1.5x to 1.7x zoom-ins on Cypher, `MISSING_part_node`, and `PDF only` badges stay sharp on export.
- **Pre-Beat Trimming:** Record from context creation and trim initial page-load frames with `ffmpeg -ss <trimStartSec>` so Beat 0 starts cleanly at `0:00`.
- **Reliable Interactions:** Scroll `<summary>` elements to viewport center before clicking and assert the parent `<details>` has `open` (Beat 3 `details.evidence-queries`, Beat 7 `claim-verifier-panel`). After clicking `verify-claim-run`, scroll `[data-testid="claim-verdict"]` into view.
- **CSP-Safe Cursor Overlay:** When recording headless Playwright, intercept `/farmbot/*` HTML via `page.route` and append `'unsafe-inline'` to `style-src` for the recording session only, so a subtle pointer and click ripple render without touching app code or `connect-src`.
- **Voiceover & Caption Export:**
  - Record or synthesize the per-beat English voiceover tracks first, align beat holds to match the cue timestamps (`102s` / `1:42` total), and place captions in a dedicated lower safe band that never covers active Cypher blocks, verdict badges, or buttons.
  - Export H.264 MP4 (`yuv420p`, `30fps`, stereo AAC 44.1 kHz, `-movflags +faststart`) plus a matching `.srt` file built from the exact cue timestamps above.
