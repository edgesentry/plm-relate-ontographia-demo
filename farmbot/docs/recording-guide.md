# FarmBot Genesis Demo Video Recording Guide

Single-source-of-truth production guide for filming the live `/farmbot/` demo video, paced to actual narration length (under Devpost's `120s` limit), with **English narration**, **hard-cut fixed framings at key moments**, and **short non-overlapping captions** cut directly from the single narration block per beat.

- **Live URL:** `https://demo.edgesentry.io/farmbot/`
- **Target Length:** Derived from actual narration length (under Devpost's `120s` limit; `82.7s` as last measured in v5). Beat durations match actual narration length with `<= 1.0 s` idle time after each beat's line, removed by trimming.
- **Audio & Caption Contract:** Narration stays at or below 2.5 words/s per beat. Captions live in one place per beat (`Narration & Caption Cues`), split into non-overlapping cues at or below 17 characters/s in a dedicated bottom safe band. No background music is tracked in this guide.

---

## 1. Pre-Recording Setup

### Browser and Viewport
- **Clean Profile:** Dedicated browser profile with extensions, dev tools, bookmarks bar, and OS notifications ("Do Not Disturb") disabled.
- **Viewport:** `1280x800` at 100% browser zoom (capture at 2x DPR / `2560x1600` if using digital crop-ins in post so fixed framings stay sharp).
- **Language:** Set `data-testid="lang-toggle"` to English (`en`).

### Local Model & Operational Guardrails
- **No Live Model Roll:** Use only the deterministic rejection button (`data-testid="farmbot-rejection-demo-button"`). Never click "Allow and load model" (`checkConsentAllow`) or type free-text prompts on film. Resolve any WebGPU consent card off-camera via "Decline" (`checkConsentDecline`).
- **Committed Data Only:** Use only the committed seed, checks, and findings (`farmbot/dist/farmbot.findings.json`). Never state hardcoded inventory counts in narration or captions.
- **In-Browser Only / No Secrets:** Everything executes in the browser tab. Never trigger `/api/notify/test`, configure secrets, or show email addresses or tokens.
- **Scope Boundary:** Do not film or describe the pre-contest desk-fan screen at `/` as `/farmbot/` behavior.
- **Relate Naming:** Name Relate as **"Relate, Neo4j's lightweight graph database"** when introduced.

---

## 2. Beat-by-Beat Shot List (Narration-Derived Timing)

```
Beat 0 -> Beat 1 -> Beat 2 -> Beat 3 -> Beat 4 -> Beat 5 -> Beat 6 -> Beat 7 -> Beat 8
Opening   Sample    Relate    Lanes &   SBOM      BOP &     Cypher    Claim     Closing
& Strip   Click R6  & Links   Cypher    R1 Match  PDF Only  Guard     Panel     Hold
```

Camera and pacing rules:
- The frame changes only on a real UI action or a hard cut; a still frame while narration plays is correct.
- Zoom is a hard cut to a fixed framing at key moments only (`CYPHER 25`, `PDF only`, `REJECTED -> CONFIRMED`); zoom crops must not cut text or lanes at the edges, and after a hard cut the target is already fully in frame (no settle scroll).
- The rejected-routing beat shows the click and the red panel appearing; idle time after a beat's narration ends is `<= 1.0 s`, removed by trimming.

---

### Beat 0: Opening Hook and 3-Step Flow Strip
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Open `/farmbot/` in a fresh English tab at `y = 0`.
  2. Do not click, scroll, or type during this opening beat; the first action starts by `0:04`.
- **On-Screen Requirements:**
  - Compact 3-step flow strip (`data-testid="flow-strip"`): `flowStepAgent` ("Agent finds the drift"), `flowStepEmail` ("Email link"), `flowStepAnalysis` ("Graph analysis in the browser").
  - `data-testid="how-it-works"` (`howItWorksLabel`) stays closed.
- **Zoom / Framing:** Full `1280x800` fixed frame (still frame while narration plays).
- **Narration & Caption Cues:**
  - `0:00-0:04`: "Missing packing or service updates cause wrong builds and shipments."
- **Target Timing:** 4 seconds (0:00 to 0:04)
- **Cut Point:** Immediately at `0:04` as the cursor selects `R6-power-supply`.

---

### Beat 1: Sample Notification Card to Deep Link
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Start at `y = 0` so the sample cards (`sampleHeading`: "Sample emails", `sampleIntro`) are visible.
  2. Hover the `R6-power-supply` card (`sampleScenarioDesignChange`, `sampleSummaryR6PowerSupply`) and click `Open R6-power-supply` (`sampleOpenFinding`), which scrolls `[data-testid="finding-view"]` into view and moves the sample cards out of frame.
- **On-Screen Requirements:**
  - `sampleCardLabel` ("Sample") badge visible before the click so reviewers see these are sample cards, not sent mail.
- **Zoom / Framing:** Full `1280x800` frame; frame changes only on the click and scroll to `[data-testid="finding-view"]`.
- **Narration & Caption Cues:**
  - `0:04-0:08`: "A reviewer opens a sample alert, jumping to the finding."
  - `0:08-0:10`: "The model never writes Cypher."
- **Target Timing:** 6 seconds (0:04 to 0:10)
- **Cut Point:** Trim idle tail `<= 1.0 s` after `"Cypher."` and transition to Beat 2.

---

### Beat 2: Relate Embedded Value (Part A): SHA-256 Seed Load and Downstream Evidence (`R6-power-supply`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Hold on `R6-power-supply` with `findingsMatch` ("The browser result matches the committed findings") and the `evidenceHeading` ("Evidence") rows (`design-change`, `part`, `structure`, `reference`, `packing-line`, `service`) showing `electronics.md:146`, `storing-farmbot-for-winter.md`, and `power-supply.md`.
- **On-Screen Requirements:**
  - Finding header (`R6-power-supply`, `severityReview`), `findingsMatch` verification banner, and multi-source evidence table with file and line citations.
- **Zoom / Framing:** Full `1280x800` fixed frame on `[data-testid="finding-view"]` and the evidence rows (still frame while narration plays).
- **Narration & Caption Cues:**
  - `0:10-0:14`: "Relate, Neo4j's lightweight graph database links design,"
  - `0:14-0:18`: "manufacturing, process, packing, and service documents"
  - `0:18-0:21`: "from a SHA-256-verified WASM seed."
  - `0:21-0:24`: "Here, it traces Power Supply to the broken links."
- **Target Timing:** 14 seconds (0:10 to 0:24)
- **Cut Point:** Trim idle tail `<= 1.0 s` after `"broken links."` and move to `[data-testid="process-lanes"]`.

---

### Beat 3: Relate Embedded Value (Part B): Graph Traversal, Process Lanes, and Cypher Provenance (`R6-power-supply`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Show `[data-testid="process-lanes"]` (`processLanesHeading`) with `laneDesignChange` ("Design change"), `laneEbomPart` ("EBOM part"), `laneBop` ("BOP (instructions)"), `lanePacking` ("Packing"), and `laneService` ("Service"), plus legend (`lanesLegendProblem`, `lanesLegendPath`, `lanesLegendMissing`).
  2. Click diagram node `Power Supply`, then click `Select node` (`evidenceSelect`) on a packing row (`aria-pressed="true"`).
  3. Expand "Intent, Cypher and parameters" (`evidenceQueriesLabel`) on that row, then "Show all check Intents" (`data-testid="evidence-queries-rest"`), open `farmbot/checks/r9-service-unmatched.json` (`{"param_0": "unmatched"}`), and hard-cut to that framing.
- **On-Screen Requirements:**
  - Reciprocal node/row selection (`aria-pressed="true"`), dashed missing-link legend visible, and expanded `farmbot/checks/r9-service-unmatched.json` (`executedCypherLabel` showing `CYPHER 25 ...` and `paramsLabel` `{"param_0": "unmatched"}`).
- **Zoom / Framing:** Full lane shot on `Design change -> EBOM part -> BOP -> Packing -> Service` (`0:24-0:31`), then one hard cut to a fixed `1.6x` framing on the expanded Intent, `CYPHER 25` query, and Bound parameters box (`0:31-0:39`), held only as long as its line.
- **Narration & Caption Cues:**
  - `0:24-0:28`: "Relate walks from design change through EBOM, packing, and service."
  - `0:28-0:32`: "The model only routes; Ontographia compiles the validated Intent"
  - `0:32-0:36`: "into a deterministic, parameter-bound query,"
  - `0:36-0:39`: "and Relate executes it against the graph."
- **Target Timing:** 15 seconds (0:24 to 0:39)
- **Cut Point:** End the `CYPHER 25` hold `<= 1.0 s` after `"against the graph."` with a hard cut to `R1-40mm-nut-bar-standard`.

---

### Beat 4: SBOM (Materials) Lane and Quantity Reconciliation (`R1-40mm-nut-bar-standard`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/#finding=R1-40mm-nut-bar-standard`
- **Click Sequence:**
  1. Navigate directly to `#finding=R1-40mm-nut-bar-standard`.
  2. Show the finding header with `reconciliationCategoryR1` ("Quantity difference"), `reconciliationR1Note` ("Part page versus packing list"), and `Stainless Steel` in `laneSbom` ("SBOM (materials)").
- **On-Screen Requirements:**
  - Finding `R1-40mm-nut-bar-standard` (`checkR1Label`), category label `reconciliationCategoryR1` ("Quantity difference") with `reconciliationR1Note` ("Part page versus packing list"), and visible lanes `laneEbomPart`, `laneSbom` (`Stainless Steel`), and `lanePacking`.
- **Zoom / Framing:** Full `1280x800` fixed framing showing the quantity-difference header, `laneEbomPart`, `laneSbom` (`Stainless Steel`), and `lanePacking`.
- **Narration & Caption Cues:**
  - `0:39-0:44`: "Lanes appear only from evidence. When a part page lists a material,"
  - `0:44-0:49`: "the SBOM lane shows Stainless Steel beside the quantity mismatch."
- **Target Timing:** 10 seconds (0:39 to 0:49)
- **Cut Point:** Hard cut to `R2-barb` within `<= 1.0 s` after `"quantity mismatch."`

---

### Beat 5: BOP (Instructions) Lane and PDF-Only Audit Boundary (`R2-barb` to `R5`)
- **Target URLs:**
  - Part A: `https://demo.edgesentry.io/farmbot/#finding=R2-barb`
  - Part B: `https://demo.edgesentry.io/farmbot/#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`
- **Click Sequence:**
  1. Open `#finding=R2-barb` showing `laneBop` ("BOP (instructions)") with no PDF-only marker.
  2. Hard cut to `#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md` showing `[data-testid="process-node-pdf-only"]` ("PDF only").
- **On-Screen Requirements:**
  - `R2-barb`: `laneBop` visible, no PDF-only badge.
  - `R5`: `laneBop` visible with `[data-testid="process-node-pdf-only"]` ("PDF only", `lanesNodePdfOnlyShort`).
- **Zoom / Framing:** Full `1280x800` frame on `R2-barb` `laneBop` (`0:49-0:54`), then hard cut to a fixed `1.7x` framing on the `PDF only` badge in `R5` (`0:54-1:02`).
- **Narration & Caption Cues:**
  - `0:49-0:54`: "The BOP lane maps documented assembly steps, not factory routing."
  - `0:54-0:58`: "When a pre-assembly page only links a PDF,"
  - `0:58-1:02`: "this PDF-only badge marks the audit boundary without guessing."
- **Target Timing:** 13 seconds (0:49 to 1:02)
- **Cut Point:** Hard cut to `Check routing` within `<= 1.0 s` after `"without guessing."`

---

### Beat 6: Deterministic Cypher-Output Rejection Guard
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Open `checkRoutingHeading` ("Check routing") disclosure (`checkFreeTextHeading`: "Free-text check routing").
  2. Click `Show a rejected routing output` (`checkRejectionDemoButton`, `[data-testid="farmbot-rejection-demo-button"]`).
- **On-Screen Requirements:**
  - Fixed sample input `MATCH (part:Part) RETURN part` (`checkRejectionDemoSampleLabel`).
  - Rejection alert banner: `checkRoutingRejected` ("The routing output was rejected."), `checkRoutingRejectedBody` ("Nothing new was compiled or executed."), and validator reason `routing output contains Cypher or a markdown fence`.
- **Zoom / Framing:** Full `1280x800` fixed framing on `Check routing` showing the click and the red rejection alert banner appearing.
- **Narration & Caption Cues:**
  - `1:02-1:07`: "If routing output contains raw Cypher or a markdown fence, the validator blocks it."
  - `1:07-1:11`: "Nothing new is compiled or executed."
- **Target Timing:** 9 seconds (1:02 to 1:11)
- **Cut Point:** Hard cut to Claim Verification panel within `<= 1.0 s` after `"compiled or executed."`

---

### Beat 7: Deterministic Claim Verification Panel (`REJECTED` then `CONFIRMED`)
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Open the claim verification panel (`data-testid="claim-verifier-panel"`, summary heading "Deterministic claim verification", id `claim-verifier-heading`).
  2. With `uc1-hallucinated-part-fail` selected ("Titanium Servo Coupling is used in the gantry assembly chapter (v1.7/assembly/gantry.md)."), click `Verify claim` (`data-testid="verify-claim-run"`), showing `REJECTED` (`data-testid="claim-verdict"`) and `data-testid="claim-missing-evidence"` / `claim-actual-evidence`.
  3. Click `uc1-hallucinated-part-pass` ("M5 x 10mm Screw is used in the gantry assembly chapter (v1.7/assembly/gantry.md).") and click `Verify claim` again; badge flips to `CONFIRMED`.
- **On-Screen Requirements:**
  - Summary heading: "Deterministic claim verification".
  - `uc1-hallucinated-part-fail`: `REJECTED` verdict + missing-node or claimed-versus-actual evidence visible.
  - `uc1-hallucinated-part-pass`: `CONFIRMED` verdict visible.
- **Zoom / Framing:** Hard cut to a fixed `1.6x` framing on `REJECTED` and missing-node evidence, holding that fixed framing as it flips to `CONFIRMED`.
- **Narration & Caption Cues:**
  - `1:11-1:17`: "In the claim verification panel, an invented part is replayed as Intent queries"
  - `1:17-1:20`: "and rejected with the missing node."
  - `1:20-1:24`: "A valid part in the graph is confirmed."
- **Target Timing:** 13 seconds (1:11 to 1:24)
- **Cut Point:** Hold on `CONFIRMED` and continue directly into Beat 8 without scrolling.

---

### Beat 8: Claim Verdict Hold and Closing Line
- **Target URL:** `https://demo.edgesentry.io/farmbot/`
- **Click Sequence:**
  1. Do not scroll or click; hold on the `CONFIRMED` result in `data-testid="claim-verifier-panel"` from Beat 7.
- **On-Screen Requirements:**
  - `data-testid="claim-verdict"` (`CONFIRMED` badge) and `data-testid="claim-actual-evidence"` clearly legible in frame.
- **Zoom / Framing:** Hold the fixed `1.6x` framing on `data-testid="claim-verdict"` (`CONFIRMED` badge) with no scroll.
- **Narration & Caption Cues:**
  - `1:24-1:28`: "In short, the model only routes; it never writes Cypher."
- **Target Timing:** 4 seconds (1:24 to 1:28)
- **Cut Point:** End `<= 1.0 s` after `"it never writes Cypher."` finishes.

---

## 3. Retake Checklist

1. Reload `https://demo.edgesentry.io/farmbot/` in a fresh tab (`en` active, `y = 0`).
2. Confirm no WebLLM model download was initiated and consent card is declined or unconsented.
3. Confirm clean browser chrome (no DevTools, bookmarks, or OS notifications).
4. Verify Beat 6 uses only `data-testid="farmbot-rejection-demo-button"` (no live typing).
5. Verify Beat 8 ends `<= 1.0 s` after `"In short, the model only routes; it never writes Cypher."`

---

## 4. Automated Capture & Post-Production Workflow

- **Sharp Fixed Framings:** Capture Playwright video at `1280x800` with `deviceScaleFactor: 2` (`2560x1600` canvas) so hard-cut `1.6x` to `1.7x` fixed framings on `CYPHER 25`, `PDF only`, and `REJECTED -> CONFIRMED` stay sharp on export.
- **Pre-Beat & Tail Trimming:** Record from context creation and trim initial page-load frames and any post-line idle tail `> 1.0 s` with `ffmpeg`.
- **Reliable Interactions:** Scroll `<summary>` elements to viewport center before clicking and assert the parent `<details>` has `open` (Beat 3 `details.evidence-queries` then `[data-testid="evidence-queries-rest"]`, Beat 7 `claim-verifier-panel`). After clicking `verify-claim-run`, scroll `[data-testid="claim-verdict"]` into view.
- **CSP-Safe Cursor Overlay:** When recording headless Playwright, intercept `/farmbot/*` HTML via `page.route` and append `'unsafe-inline'` to `style-src` for the recording session only, so a subtle pointer and click ripple render without touching app code or `connect-src`.
- **Voiceover & Caption Export:**
  - Synthesize or record each beat from `Narration & Caption Cues`, size each beat to its actual narration length (`<= 1.0 s` idle tail), and place captions in a dedicated lower safe band that never covers active Cypher blocks, verdict badges, or buttons.
  - Export H.264 MP4 (`yuv420p`, `30fps`, stereo AAC 44.1 kHz, `-movflags +faststart`) plus a matching `.srt` file built from the exact cue text above.
