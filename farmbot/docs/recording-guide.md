# FarmBot Genesis B1 Demo Video Recording Guide

A timed, shootable recording guide for filming the live `/farmbot/` screen in one pass against the accepted 9-beat spine (a Beat 0 opening plus eight beats). The take is a silent screen recording: no voiceover is recorded, and the English caption lines (the existing narration text from `farmbot/docs/demo-script.md`, unchanged) are burned in after the take. This guide turns that draft into an operational shot list with exact live URLs, click sequences, on-screen UI requirements (keyed to `src/farmbot/i18n.ts`), target durations, and cut points.

Live URL: `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`  
Target Screen Length: 129 seconds, ending at 2:09 (the nine named beats sum to the documented screen-and-caption total; captions and music are added after the take).

---

## 1. Pre-Recording Setup

### Browser and Environment
- **Browser Profile:** Use a clean, dedicated browser profile with all browser extensions, developer tools overlays, bookmarks bars, and search suggestions hidden or disabled.
- **Window and Viewport:** Recommend a clean desktop window sized to `1280x800` (the standard resolution validated during the Issue #110 walkthrough and live evaluation). *Note: This viewport is an operational recommendation for clear layout of process lanes and Cypher query boxes, not a Devpost rule.* Ensure the browser zoom is set to 100%.
- **Operating System Notifications:** Set "Do Not Disturb" / "Focus" mode to ON on the recording workstation to suppress desktop banners, dock badges, and audio chimes.

### Language Setting
- **On-Screen Language:** The take is silent and the captions are English. Ensure the on-screen language toggle (`data-testid="lang-toggle"`, `language`) is set to English (`en`). All headings, labels, and descriptions must display English UI strings.

### Local Model and WebGPU Configuration
- **No Live Model Roll:** The recording uses the deterministic rejection demo control (`checkRejectionDemoButton`) and does not invoke a live model roll or prompt typing.
- **Consent Card Handling:**
  - If WebGPU is supported, the consent card (`checkConsentTitle`: "Allow a local model download?") may appear above the free-text section.
  - **Do NOT click "Allow and load model" (`checkConsentAllow`) during recording.** No WebLLM package (`@mlc-ai/web-llm`) or model weights (879 MB) should be downloaded on film.
  - To prevent layout shifts during the take, resolve the consent prompt off-camera prior to recording by clicking "Decline" (`checkConsentDecline`), which cleanly reveals `checkConsentDeclined` ("Model access was declined. Nothing was downloaded; the rule chips and the rest of this screen remain available.").
  - If WebGPU is not supported on the host machine, the page displays `checkWebgpuNotice` ("WebGPU is not available..."). This fallback state is completely acceptable and does not interfere with beats 1 through 8.
- **No Model Warm-up:** Because the take relies exclusively on the deterministic button and fixed sample text, no WebLLM warm-up is required or permitted.

### Operational Guardrails (from Repo Docs)
- **Committed Data Only:** Use only the committed seed graph, check rules, and findings (`farmbot/dist/farmbot.findings.json`). Do not modify them for the take.
- **No Inventory Totals:** Do not state inventory totals (e.g., number of findings, rules, intents, or seeds) in a caption line.
- **In-Browser Execution Only:** Everything runs locally in the browser tab. The Cloudflare Worker email notification path is described as a concept, never triggered.
- **No Secrets or Endpoints:** Do not call `/api/notify/test`, configure secrets, or display destination email addresses or API tokens.
- **Public Deployed Build:** Do not claim that the deployment serves an unconfirmed build.
- **Scope Restriction:** The desk-fan screen at `/` represents a different graph; do not film or describe its fixtures as `/farmbot/` behaviour.

---

## 2. Beat-by-Beat Shot List

```
Spine Overview:
Beat 0 (12s) ──> Beat 1 (12s) ──> Beat 2 (22s) ──> Beat 3 (23s) ──> Beat 4 (17s) ──> Beat 5 (17s) ──> Beat 6 (9s) ──> Beat 7 (10s) ──> Beat 8 (7s)
Opening        Sample Cards     Deep Link R6     Lanes & Cypher   SBOM Lane R1     BOP & PDF R2/R5   Rejection Button Claim Verification Closing Bound
                                                                                      (129s Total)
```

Pacing notes, so the silent take lands on the documented screen-and-caption total:

- The 12-second Beat 0 opening is added.
- Beats 2 through 5 are stretched to the caption reading pace (18, 18, 12, and 15 seconds become 22, 23, 17, and 17 seconds), and the new Beat 7 claim verification is added at 10 seconds.
- Beat 6 is trimmed by 3 seconds (12 to 9 seconds); Beat 8 is trimmed by 5 seconds (12 to 7 seconds), by dropping its first sentence; the closing line stays verbatim.
- The nine named beats sum to 129 seconds (2:09), the documented screen-and-caption total.

### Beat 0: Opening (Background, Purpose, and Flow Overview)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open the URL in a fresh browser tab and let the first frame settle.
  2. Do not click, do not scroll, and do not type: this beat is a silent hold on the landing before any Beat 1 screen operation.
- **On-Screen Requirements:**
  - The compact 3-step flow strip above the sample notification cards (`data-testid="flow-strip"`), showing one short line: `flowStepAgent` ("Agent finds the drift"), then `flowStepEmail` ("Email link"), then `flowStepAnalysis` ("Graph analysis in the browser").
  - The "How it works" disclosure (`data-testid="how-it-works"`, `howItWorksLabel`) stays closed, so the EBOM/MBOM and engine definitions stay off the fold during the take.
- **English Caption Line:**
  > "Hardware docs drift across BOMs, packing lists, and service pages. An agent spots the broken subgraph, emails a link, and clicking it runs live graph verification right in your browser."
- **Target Timing:** 12 seconds (0:00 to 0:12)
- **Cut Point:** Right after the 12-second hold ends, as the camera settles on the sample notification cards for Beat 1.

---

### Beat 1: Sample Notification Card
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open the URL in a fresh browser tab.
  2. Confirm English UI is active (`data-testid="lang-toggle"` shows English selected).
  3. Keep the viewport scrolled to the top (`y = 0`): at `1280x800` the header, the flow strip, and every sample card with its `sampleOpenFinding` link are fully visible, with no link clipped at the bottom edge.
  4. Hover or place cursor near the sample notification cards, specifically the second card citing `R6-power-supply`.
- **On-Screen Requirements:**
  - Section heading: `sampleHeading` ("Sample emails").
  - Explanation: `sampleIntro` ("Sample emails, not sent. Opening a link runs the checks in this tab.").
  - Four visible sample notification cards (`R1-40mm-nut-bar-standard`, `R6-power-supply`, `R8-shaft-coupler`, `R3-fuse`).
  - Each card displays badge `sampleCardLabel` ("Sample"), its scenario line (for example `sampleScenarioDesignChange`, "Design change downstream"), and open link `sampleOpenFinding` ("Open" plus the finding id).
  - Card 2 displays `sampleSummaryR6PowerSupply` ("The Change Log links 'Power Supply', but assembly, packing, and service pages still list it.").
- **English Caption Line:**
  > "A reviewer can start from a notification and go straight to the evidence, without leaving the tab."
- **Target Timing:** 12 seconds (0:12 to 0:24)
- **Cut Point:** Immediately after the 12-second hold ends, right as the cursor moves to click the "Open R6-power-supply" link on the `R6-power-supply` card.

---

### Beat 2: Deep Link and Downstream Evidence (`R6-power-supply`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Click the "Open R6-power-supply" link on the `R6-power-supply` sample card (or navigate directly to `#finding=R6-power-supply`).
  2. The tab executes in-memory checks and automatically scrolls down to the highlighted `R6-power-supply` finding container.
  3. Cursor points to the compact finding header (id, severity badge, score, subject) and the downstream evidence table.
- **On-Screen Requirements:**
  - Finding heading: `findingHeading` ("Finding") with the compact id `R6-power-supply`, severity badge `severityReview` ("Check"), score and subject; the full rule title stays on the rule-chip panel, not on this header.
  - The sample card's scenario line (for example `sampleScenarioDesignChange`, "Design change downstream") and its severity badge name the case the finding header's compact id opens.
  - Findings verification notice: `findingsMatch` ("The browser result matches the committed findings").
  - Evidence table (`evidenceHeading`: "Evidence") displaying rows with roles: `design-change`, `part`, `structure`, `reference`, `packing-line`, `packing-structure`, and `service`.
  - Each evidence row shows its role plus the source file and line on one line (for example `electronics.md:146`); the exact path, the seed node and the facts sit behind the row's `evidenceFactsLabel` ("Facts") disclosure.
  - Exact source files cited by the rows: `electronics.md`, `storing-farmbot-for-winter.md`, and `power-supply.md`, with each row's Facts disclosure carrying the exact path.
- **English Caption Line:**
  > "The Change Log changed this part. The checks do not take the Change Log's word for it: the finding starts in the design-change lane and asks where the changed part still appears. The changed part still appears in the BOP (instructions) lane, in a packing list and on a service page. Each evidence row names the source file and, where the source has one, the line."
- **Target Timing:** 22 seconds (0:24 to 0:46)
- **Cut Point:** Right after the camera showcases the source file path and line numbers in the evidence table.

---

### Beat 3: Process-Lane Diagram and Query Provenance (`R6-power-supply`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Scroll slightly so the SVG process lanes diagram (`[data-testid="process-lanes"]`) is fully in view above the evidence table.
  2. Click the diagram node `Power Supply (part:Power Supply)`. Note that the corresponding evidence row in the table below is automatically highlighted.
  3. In the evidence table below, click `Select node` (`evidenceSelect`) on the packing evidence row (`usage:packing:...`). Note that the diagram node highlights reciprocally.
  4. Click to expand "Intent, Cypher and parameters" (`evidenceQueriesLabel`) on that evidence row.
- **On-Screen Requirements:**
  - Diagram title: `processLanesHeading` ("Process lanes").
  - Five active swimlanes visible: `laneDesignChange` ("Design change"), `laneEbomPart` ("EBOM part"), `laneBop` ("BOP (instructions)"), `lanePacking` ("Packing"), and `laneService` ("Service").
  - In `laneBop`, the assembly chapter `chapter:v1.7/assembly/electronics.md` is rendered with display text `Electronics`, next to its `usage:assembly:` reference nodes for `power supply`. The lane is the documented instruction structure the evidence cites, not a factory routing.
  - Legend items: `lanesLegendProblem` ("Problem"), `lanesLegendPath` ("Impacted path"), and `lanesLegendMissing` ("Missing link").
  - Reciprocal highlight active between SVG nodes and table rows (`aria-pressed="true"`).
  - Expanded query block showing:
    - Intent identifier (e.g., `farmbot/checks/changed-parts.json`).
    - Executed Cypher query text block (`executedCypherLabel`: "Executed Cypher", showing `CYPHER 25 ...`).
    - Bound parameters block (`paramsLabel`: "Bound parameters", showing JSON parameter map).
- **English Caption Line:**
  > "The diagram is built only from this finding's evidence rows. The highlighted nodes are the problem nodes, and the highlighted links between them are the impacted path. The path runs from the design-change lane through the EBOM part lane to the BOP (instructions) lane, packing and service. Every evidence row carries the Intent, the executed Cypher, and the bound parameters that produced it."
- **Target Timing:** 23 seconds (0:46 to 1:09)
- **Cut Point:** As the executed Cypher block and bound parameters are clearly displayed on screen.

---

### Beat 4: SBOM (Materials) Lane (`R1-40mm-nut-bar-standard`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R1-40mm-nut-bar-standard`
- **Click Sequence:**
  1. Open/navigate to the `#finding=R1-40mm-nut-bar-standard` deep link.
  2. The screen scrolls to finding `R1-40mm-nut-bar-standard`.
  3. Position viewport to show the process-lane diagram.
  4. Cursor indicates the newly visible `SBOM (materials)` lane and hovers over the `Stainless Steel` node.
- **On-Screen Requirements:**
  - Finding header indicates `R1-40mm-nut-bar-standard` (`checkR1Label`: "R1 · Packing quantity differs from the part page quantity").
  - Reconciliation category on screen: the finding view shows the category label `reconciliationCategoryR1` ("Quantity difference") with the comparison note `reconciliationR1Note` ("Part page versus packing list"). On-screen only: no extra caption, and the beat keeps its 17-second target timing.
  - Process lanes rendered: `laneEbomPart` ("EBOM part"), `laneSbom` ("SBOM (materials)"), and `lanePacking` ("Packing").
  - In `laneSbom`, the material node `material:stainless steel` is rendered with display text `Stainless Steel`.
  - Contrast note visible or demonstrable: `laneSbom` is present here because the part page documents `specs.material`, but was absent on `R6-power-supply`.
- **English Caption Line:**
  > "When a cited part page records a material, the SBOM (materials) lane shows that documented material next to the part. It is a view of the recorded values, not a software bill of materials and not a substance list. The lane stays hidden on a finding that cites no such material."
- **Target Timing:** 17 seconds (1:09 to 1:26)
- **Cut Point:** Immediately following the explanation that the lane stays hidden when no material is documented.

---

### Beat 5: BOP (Instructions) Lane and the PDF-Only Marker
- **Target URLs:**
  - Part A: `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R2-barb`
  - Part B: `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`
- **Click Sequence:**
  1. Navigate to `#finding=R2-barb`.
  2. Point at the `BOP (instructions)` lane (`laneBop`). Note that the PDF-only marker is absent.
  3. Navigate to `#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`.
  4. Point directly at the `[data-testid="process-node-pdf-only"]` badge on the pre-assembly node in `laneBop`.
- **On-Screen Requirements:**
  - On `R2-barb`:
    - Finding `R2-barb` (`checkR2Label`).
    - Visible lane: `laneBop` ("BOP (instructions)").
    - The PDF-only marker is explicitly NOT present on this finding.
  - On `R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`:
    - Finding `R5-v1-7-manufacturing-pre-assembly-cable-carrier-md` (`checkR5Label`: "R5 · A pre-assembly page has no machine-readable parts table").
    - Visible lane: `laneBop` ("BOP (instructions)").
    - PDF-only marker visible on the node (drawn label "PDF only", `lanesNodePdfOnlyShort`; the long explanation stays on the SVG title, element `[data-testid="process-node-pdf-only"]`).
- **English Caption Lines:**
  - *On R2-barb (approx. 6 seconds):*
    > "The BOP (instructions) lane shows the documented instruction structure the evidence cites, not a factory routing."
  - *On R5-cable-carrier (approx. 11 seconds):*
    > "A pre-assembly page whose steps are only in a PDF gets this marker. It records that the page has no machine-readable component list; it is not a claim that the PDF was parsed."
- **Target Timing:** 17 seconds total across both findings (1:26 to 1:43; R5 at about 1:32)
- **Cut Point:** Right after the camera highlights the "PDF only" badge.

---

### Beat 6: Deterministic Cypher-Output Rejection Demo
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open the `checkRoutingHeading` ("Check routing") disclosure, then scroll to the "Free-text check routing" section (`checkFreeTextHeading`).
  2. Confirm the consent card was declined off-camera or left unconsented (do not click Allow).
  3. Do not type in the input box (`checkInputLabel`).
  4. Click the labelled button: `Show a rejected routing output` (`checkRejectionDemoButton`, `[data-testid="farmbot-rejection-demo-button"]`).
- **On-Screen Requirements:**
  - Section heading: `checkFreeTextHeading` ("Free-text check routing").
  - Fixed sample input label: `checkRejectionDemoSampleLabel` ("Fixed sample input (not a model result)").
  - Fixed sample text rendered: `MATCH (part:Part) RETURN part`.
  - Rejection alert banner: `checkRoutingRejected` ("The routing output was rejected.").
  - Rejection body: `checkRoutingRejectedBody` ("Nothing new was compiled or executed.").
  - Validator rejection reason string displayed: `routing output contains Cypher or a markdown fence`.
  - Zero compilation or execution attempts triggered.
- **English Caption Line:**
  > "If the routing output contains Cypher or a markdown fence, the screen rejects it. Nothing new is compiled or executed."
- **Target Timing:** 9 seconds (1:43 to 1:52)
- **Cut Point:** As the rejection alert banner and validator error string are clearly readable.

---

### Beat 7: Deterministic Claim Verification Panel
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Scroll down from the free-text section, past the findings panel, to the claim verification panel below it (`data-testid="claim-verifier-panel"`, a collapsed `<details>` disclosure) and open it; the summary heading is "Deterministic claim verification" (element id `claim-verifier-heading`).
  2. Keep the default fixture selected: `uc1-hallucinated-part-fail` (chip title "UC1 Fail: Invented part in gantry assembly", use-case label "Use case 1: Hallucinated part"). The fixed agent claim reads "Titanium Servo Coupling is used in the gantry assembly chapter (v1.7/assembly/gantry.md)." Click `Verify claim` (`data-testid="verify-claim-run"`); the badge is `REJECTED` and the evidence includes the missing node or claimed-versus-actual block (`data-testid="claim-missing-evidence"` / `claim-actual-evidence`).
  3. Click the `uc1-hallucinated-part-pass` chip (chip title "UC1 Pass: Valid part in gantry assembly"); the fixed agent claim reads "M5 x 10mm Screw is used in the gantry assembly chapter (v1.7/assembly/gantry.md)." Click `Verify claim` again; the badge is `CONFIRMED`.
- **On-Screen Requirements:**
  - Panel summary heading: "Deterministic claim verification".
  - REJECTED run on `uc1-hallucinated-part-fail`: badge `REJECTED`, with the missing node or claimed-versus-actual evidence visible.
  - CONFIRMED run on `uc1-hallucinated-part-pass`: badge `CONFIRMED`.
- **English Caption Lines:**
  - *On the REJECTED run (approx. 5 seconds):*
    > "A fixed agent claim is replayed as Intent queries and rejected."
  - *On the CONFIRMED run (approx. 5 seconds):*
    > "A claim that matches the graph is confirmed."
- **Target Timing:** 10 seconds (1:52 to 2:02)
- **Cut Point:** As the `CONFIRMED` badge settles, before the camera returns to the free-text section for Beat 8.

---

### Beat 8: Closed Routing Bound and Closing
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Scroll back up to the "Free-text check routing" section and stay within it.
  2. Direct the cursor / zoom toward the permanently visible notice at the bottom of the section (`checkModelNoCypher`).
- **On-Screen Requirements:**
  - The static boundary notice text (`checkModelNoCypher`):
    `"The model only routes; it never writes Cypher."`
  - The fixed sample `MATCH (part:Part) RETURN part` and the validator reason `routing output contains Cypher or a markdown fence` stay in frame with the bound.
- **English Caption Line:**
  > "In short, the model only routes; it never writes Cypher."
- **Target Timing:** 7 seconds (2:02 to 2:09)
- **Cut Point:** Hold for 1 second of clean pause immediately following the final caption phrase `"it never writes Cypher."`
- **Pacing & Trimming Directive:** The named trim already applies: Beat 8 carries only its closing line, and Beat 6 is 9 seconds. If a retake still runs long, tighten the pause before the Beat 6 button press first. The concluding sentence `"In short, the model only routes; it never writes Cypher."` must remain intact as the final caption statement of the video.

---

## 3. Retake Checklist

Use this checklist between recording takes to reset the environment cleanly:

1. **URL & Navigation Reset:**
   - Reload `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/` in the fresh tab.
   - Verify page title reads `"FarmBot doc inconsistencies, traced to evidence"`.
2. **Language Toggle:**
   - Verify `data-testid="lang-toggle"` is set to English (`en`).
3. **Local Model Consent State:**
   - Confirm no model download has been initiated.
   - Confirm consent card is declined or unconsented. No network download requests to Hugging Face or WebLLM assets.
   - If WebGPU is unavailable, verify `checkWebgpuNotice` displays cleanly.
4. **Clean UI Chrome:**
   - Check that no browser console, dev inspector, bookmarks, or system notifications overlap the viewport.
5. **Rejection Button Reset:**
   - Verify the rejection demo area is clean. Ensure it is triggered only via `checkRejectionDemoButton` feeding `MATCH (part:Part) RETURN part` (no free-text typing).
6. **Final Caption Check:**
   - Confirm the final caption phrase remains verbatim: `"the model only routes; it never writes Cypher."`

---

## 4. Quoted Video Constraints

The following constraints are quoted verbatim from the repository documentation. No container, resolution, bitrate, or hosting requirements beyond these are specified in the project files.

### From `farmbot/docs/demo-script.md`:

> "Target screen length: 129 seconds (2:09)."

> "Keep the silent take within the documented 129 seconds. If it runs long, shorten step 6 first, then step 0; the closing caption must stay the final statement."

> "Do not claim that the live deployment already serves a build you have not confirmed."

> "The desk-fan screen at `/` is a different graph; do not film or describe its SBOM or BOP as `/farmbot/` behaviour."

> "Do not film a live model roll."

> "No email is sent and no secret is shown during the take."

### From `farmbot/docs/devpost-submission.md` (Positioning Decision 4):

> "The public demo video URL is filled in after recording (#70, #60) and is not known yet. Do not invent a video URL. Name Relate as 'Relate, Neo4j's lightweight graph database' if the narration names it. The official contest title is 'Relate by Neo4j Hackathon'."

---

## 5. Automated Recording & Post-Production Best Practices (Lessons from v1 Take)

The following operational practices were established while producing the v1 submission video (`118s`, `1280x800` H.264 MP4 + `.srt`):

### 1. Aligning Duration to the 2-Minute Devpost Limit
- While the 9-beat baseline sums to `129s` (`2:09`), Devpost's submission rule specifies up to **2 minutes (`120s`)**.
- All nine caption blocks fit comfortably inside **`118s` (`1:58`)** without dropping any caption text by trimming idle holds:
  - Beat 0: `10s` | Beat 1: `10s` | Beat 2: `20s` | Beat 3: `21s` | Beat 4: `16s` | Beat 5: `16s` (`6s` R2 + `10s` R5) | Beat 6: `8s` | Beat 7: `10s` (`5s` FAIL + `5s` PASS) | Beat 8: `7s`.

### 2. Automated Browser Capture & CSP-Safe Cursor Cues
- **Pre-beat trimming:** Record from context creation and capture the timestamp immediately after `networkidle` and language verification (`en`), then trim the initial loading frames via `ffmpeg -ss <trimStartSec>` so Beat 0 starts cleanly at `0:00`.
- **Reliable `<details>` expansion:** Scroll the `<summary>` element to viewport center before clicking, and verify the parent `<details>` has the `open` attribute before proceeding (especially on `details.evidence-queries` in Beat 3).
- **Post-click scrolling on Beat 7:** After clicking `[data-testid="verify-claim-run"]` and waiting for `[data-testid="claim-verdict"]`, explicitly scroll `[data-testid="claim-verdict"]` into view; otherwise the `REJECTED` / `CONFIRMED` badge and evidence grid sit below the `800px` fold.
- **Cursor overlay under strict CSP:** Headless Playwright recordings omit the OS cursor. Because `/farmbot/` enforces `style-src 'self'`, injecting inline `<style>` tags or `element.style` transforms is blocked by CSP. To render a subtle pointer and click-ripple overlay without altering app code or `connect-src`, intercept only the `/farmbot/*` HTML document response in Playwright (`page.route`) and append `'unsafe-inline'` to `style-src` for the recording session.
- **Exact selector note:** The rejection demo button uses `data-testid="farmbot-rejection-demo-button"` in `src/farmbot/CheckFreeTextPanel.tsx`.

### 3. Caption Burn-In & Subtitle Export
- **Portable burn-in without `libass`/`drawtext`:** If the local `ffmpeg` build lacks `subtitles`/`drawtext` filters, render each beat's English caption as a transparent `1280x800` PNG using Python `Pillow` and composite them with `ffmpeg`'s `overlay=0:0:enable='between(t,start,end)'` filter chain.
- **Audio & streaming compatibility:** Attach a silent stereo AAC track (`-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:a aac`) and `-movflags +faststart` (`yuv420p`, `30fps`) so YouTube/Vimeo ingest cleanly, and emit a matching `.srt` file from the measured beat timestamps for closed-caption (CC) upload.
