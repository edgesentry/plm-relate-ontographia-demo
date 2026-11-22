# FarmBot Genesis B1 Demo Video Recording Guide

A timed, shootable recording guide for filming the live `/farmbot/` screen in one pass against the accepted 8-beat spine (a Beat 0 opening plus the seven beats). This guide translates the draft narration from `farmbot/docs/demo-script.md` into an operational shot list with exact live URLs, click sequences, on-screen UI requirements (keyed to `src/farmbot/i18n.ts`), English voiceover lines, target durations, and cut points.

Live URL: `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`  
Target Spoken Length: 90 to 110 seconds (1 to 2 minutes envelope; the eight named beats sum to 103 seconds).

---

## 1. Pre-Recording Setup

### Browser and Environment
- **Browser Profile:** Use a clean, dedicated browser profile with all browser extensions, developer tools overlays, bookmarks bars, and search suggestions hidden or disabled.
- **Window and Viewport:** Recommend a clean desktop window sized to `1280x800` (the standard resolution validated during the Issue #110 walkthrough and live evaluation). *Note: This viewport is an operational recommendation for clear layout of process lanes and Cypher query boxes, not a Devpost rule.* Ensure the browser zoom is set to 100%.
- **Operating System Notifications:** Set "Do Not Disturb" / "Focus" mode to ON on the recording workstation to suppress desktop banners, dock badges, and audio chimes.

### Language Setting
- **On-Screen Language:** The voiceover is recorded in English. Ensure the on-screen language toggle (`data-testid="lang-toggle"`, `language`) is set to English (`en`). All headings, labels, and descriptions must display English UI strings.

### Local Model and WebGPU Configuration
- **No Live Model Roll:** The recording uses the deterministic rejection demo control (`checkRejectionDemoButton`) and does not invoke a live model roll or prompt typing.
- **Consent Card Handling:**
  - If WebGPU is supported, the consent card (`checkConsentTitle`: "Allow a local model download?") may appear above the free-text section.
  - **Do NOT click "Allow and load model" (`checkConsentAllow`) during recording.** No WebLLM package (`@mlc-ai/web-llm`) or model weights (879 MB) should be downloaded on film.
  - To prevent layout shifts during the take, resolve the consent prompt off-camera prior to recording by clicking "Decline" (`checkConsentDecline`), which cleanly reveals `checkConsentDeclined` ("Model access was declined. Nothing was downloaded; the rule chips and the rest of this screen remain available.").
  - If WebGPU is not supported on the host machine, the page displays `checkWebgpuNotice` ("WebGPU is not available..."). This fallback state is completely acceptable and does not interfere with beats 1 through 7.
- **No Model Warm-up:** Because the take relies exclusively on the deterministic button and fixed sample text, no WebLLM warm-up is required or permitted.

### Operational Guardrails (from Repo Docs)
- **Committed Data Only:** Use only the committed seed graph, check rules, and findings (`farmbot/dist/farmbot.findings.json`). Do not modify them for the take.
- **No Inventory Totals:** Do not state inventory totals (e.g., number of findings, rules, intents, or seeds) in the voiceover.
- **In-Browser Execution Only:** Everything runs locally in the browser tab. The Cloudflare Worker email notification path is narrated as a concept, never triggered.
- **No Secrets or Endpoints:** Do not call `/api/notify/test`, configure secrets, or display destination email addresses or API tokens.
- **Public Deployed Build:** Do not claim that the deployment serves an unconfirmed build.
- **Scope Restriction:** The desk-fan screen at `/` represents a different graph; do not film or describe its fixtures as `/farmbot/` behaviour.

---

## 2. Beat-by-Beat Shot List

```
Spine Overview:
Beat 0 (12s) ──> Beat 1 (12s) ──> Beat 2 (18s) ──> Beat 3 (18s) ──> Beat 4 (12s) ──> Beat 5 (15s) ──> Beat 6 (9s) ──> Beat 7 (7s)
Opening        Sample Cards     Deep Link R6     Lanes & Cypher   SBOM Lane R1     BOP & PDF R2/R5   Rejection Button Closing Bound
                                                                                      (103s Total)
```

Named trim, so the opening plus the seven beats stays inside the spoken envelope:

- The 12-second Beat 0 opening is added.
- Beat 6 is trimmed by 3 seconds (12 to 9 seconds).
- Beat 7 is trimmed by 5 seconds (12 to 7 seconds), by dropping its first sentence; the closing line stays verbatim.
- The eight named beats sum to 103 seconds, inside the 90 to 110 second spoken envelope and under 2 minutes.

### Beat 0: Opening (Background, Purpose, and Flow Overview)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open the URL in a fresh browser tab and let the first frame settle.
  2. Do not click, do not scroll, and do not type: this beat is spoken over the landing before any Beat 1 screen operation.
- **On-Screen Requirements:**
  - The compact 3-step flow strip above the sample notification cards (`data-testid="flow-strip"`), showing one short line: `flowStepAgent` ("Agent finds the drift"), then `flowStepEmail` ("Email link"), then `flowStepAnalysis` ("Graph analysis in the browser").
  - The "How it works" disclosure (`data-testid="how-it-works"`, `howItWorksLabel`) stays closed, so the EBOM/MBOM and engine definitions stay off the fold during the take.
- **English Voiceover Line:**
  > "Hardware docs drift across BOMs, packing lists, and service pages. An agent spots the broken subgraph, emails a link, and clicking it runs live graph verification right in your browser."
- **Target Timing:** 12 seconds
- **Cut Point:** Right after the narrator finishes the spoken line, as the camera settles on the sample notification cards for Beat 1.

---

### Beat 1: Sample Notification Card
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Open the URL in a fresh browser tab.
  2. Confirm English UI is active (`data-testid="lang-toggle"` shows English selected).
  3. Keep the viewport scrolled to the top (`y = 0`): at `1280x800` the header, the flow strip, and every sample card with its `sampleOpenFinding` link are fully visible, with no link clipped at the bottom edge.
  4. Hover or place cursor near the sample notification cards, specifically the second card citing `R6-power-supply`.
- **On-Screen Requirements:**
  - Section heading: `sampleHeading` ("Sample notification emails").
  - Explanation: `sampleIntro` ("Each card is a sample of a notification email, not a sent one...").
  - Four visible sample notification cards (`R1-40mm-nut-bar-standard`, `R6-power-supply`, `R8-shaft-coupler`, `R3-fuse`).
  - Each card displays badge `sampleCardLabel` ("Sample"), scenario label `sampleScenarioLabel`, and open link `sampleOpenFinding` ("Open the finding").
  - Card 2 displays `sampleSummaryR6PowerSupply` ("The Change Log links 'Power Supply', but v1.7/extras/maintenance/storing-farmbot-for-winter.md, v1.7/manufacturing/packing/power-supply.md still list it.").
- **English Voiceover Line:**
  > "A reviewer can start from a notification and go straight to the evidence, without leaving the tab."
- **Target Timing:** 12 seconds
- **Cut Point:** Immediately after the narrator finishes speaking, right as the cursor moves to click "Open the finding" on the `R6-power-supply` card.

---

### Beat 2: Deep Link and Downstream Evidence (`R6-power-supply`)
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/#finding=R6-power-supply`
- **Click Sequence:**
  1. Click "Open the finding" on the `R6-power-supply` sample card (or navigate directly to `#finding=R6-power-supply`).
  2. The tab executes in-memory checks and automatically scrolls down to the highlighted `R6-power-supply` finding container.
  3. Cursor points to the finding header, rule description, and the downstream evidence table.
- **On-Screen Requirements:**
  - Finding heading: `findingHeading` ("Finding"), `findingIdLabel` ("Finding ID: R6-power-supply").
  - Rule details: `ruleLabel` ("Rule"), severity badge `severityReview` ("Check"), and rule title `checkR6Label` ("R6 · A name changed or removed in the Change Log still appears in packing or service pages").
  - Findings verification notice: `findingsMatch` ("The browser result matches the committed findings").
  - Evidence table (`evidenceHeading`: "Evidence") displaying rows with roles: `design-change`, `part`, `packing-line`, `packing-structure`, and `service`.
  - Column headers: `evidenceRoleLabel` ("Role"), `evidenceNodeLabel` ("Seed node"), `evidenceSourceLabel` ("Source file"), `evidenceLineLabel` ("Line").
  - Exact source files visible: `v1.7/extras/maintenance/storing-farmbot-for-winter.md` and `v1.7/manufacturing/packing/power-supply.md`.
- **English Voiceover Line:**
  > "The Change Log changed this part. The checks do not take the Change Log's word for it: the finding starts in the design-change lane and asks where the changed part still appears. The changed part still appears in a packing list and on a service page. Each evidence row names the source file and, where the source has one, the line."
- **Target Timing:** 18 seconds
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
  - Four active swimlanes visible: `laneDesignChange` ("Design change"), `laneEbomPart` ("EBOM part"), `lanePacking` ("Packing"), and `laneService` ("Service").
  - Legend items: `lanesLegendProblem` ("Problem"), `lanesLegendPath` ("Impacted path"), and `lanesLegendMissing` ("Missing link").
  - Reciprocal highlight active between SVG nodes and table rows (`aria-pressed="true"`).
  - Expanded query block showing:
    - Intent identifier (e.g., `farmbot/checks/changed-parts.json`).
    - Executed Cypher query text block (`executedCypherLabel`: "Executed Cypher", showing `CYPHER 25 ...`).
    - Bound parameters block (`paramsLabel`: "Bound parameters", showing JSON parameter map).
- **English Voiceover Line:**
  > "The diagram is built only from this finding's evidence rows. The highlighted nodes are the problem nodes, and the highlighted links between them are the impacted path. The path runs from the design-change lane through the EBOM part lane to packing and service. Every evidence row carries the Intent, the executed Cypher, and the bound parameters that produced it."
- **Target Timing:** 18 seconds
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
  - Process lanes rendered: `laneEbomPart` ("EBOM part"), `laneSbom` ("SBOM (materials)"), and `lanePacking` ("Packing").
  - In `laneSbom`, the material node `material:stainless steel` is rendered with display text `Stainless Steel`.
  - Contrast note visible or demonstrable: `laneSbom` is present here because the part page documents `specs.material`, but was absent on `R6-power-supply`.
- **English Voiceover Line:**
  > "When a cited part page records a material, the SBOM (materials) lane shows that documented material next to the part. It is a view of the recorded values, not a software bill of materials and not a substance list. The lane stays hidden on a finding that cites no such material."
- **Target Timing:** 12 seconds
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
    - PDF-only marker visible on the node (`lanesNodePdfOnly`: "PDF only (no machine-readable steps)", element `[data-testid="process-node-pdf-only"]`).
- **English Voiceover Lines:**
  - *On R2-barb (approx. 5 to 6 seconds):*
    > "The BOP (instructions) lane shows the documented instruction structure the evidence cites, not a factory routing."
  - *On R5-cable-carrier (approx. 9 to 10 seconds):*
    > "A pre-assembly page whose steps are only in a PDF gets this marker. It records that the page has no machine-readable component list; it is not a claim that the PDF was parsed."
- **Target Timing:** 15 seconds total across both findings
- **Cut Point:** Right after the camera highlights the "PDF only (no machine-readable steps)" badge.

---

### Beat 6: Deterministic Cypher-Output Rejection Demo
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Scroll to the "Free-text check routing" section (`checkFreeTextHeading`).
  2. Confirm the consent card was declined off-camera or left unconsented (do not click Allow).
  3. Do not type in the input box (`checkInputLabel`).
  4. Click the labelled button: `Show a rejected routing output` (`checkRejectionDemoButton`, `[data-testid="check-rejection-demo-button"]`).
- **On-Screen Requirements:**
  - Section heading: `checkFreeTextHeading` ("Free-text check routing").
  - Fixed sample input label: `checkRejectionDemoSampleLabel` ("Fixed sample input (not a model result)").
  - Fixed sample text rendered: `MATCH (part:Part) RETURN part`.
  - Rejection alert banner: `checkRoutingRejected` ("The routing output was rejected.").
  - Rejection body: `checkRoutingRejectedBody` ("Nothing new was compiled or executed. Use plain text or choose a rule chip instead.").
  - Validator rejection reason string displayed: `routing output contains Cypher or a markdown fence`.
  - Zero compilation or execution attempts triggered.
- **English Voiceover Line:**
  > "If the routing output contains Cypher or a markdown fence, the screen rejects it. Nothing new is compiled or executed."
- **Target Timing:** 9 seconds
- **Cut Point:** As the rejection alert banner and validator error string are clearly readable.

---

### Beat 7: Closed Routing Bound and Closing
- **Target URL:** `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/`
- **Click Sequence:**
  1. Stay within the "Free-text check routing" section.
  2. Direct the cursor / zoom toward the permanently visible notice at the bottom of the section (`checkModelNoCypher`).
- **On-Screen Requirements:**
  - The static boundary notice text (`checkModelNoCypher`):
    `"The model never writes Cypher and never detects, explains, or scores a finding. Strict validation precedes Ontographia compilation."`
  - Rule chips (`checkChipListLabel`) and committed artifact digests visible in the background, reinforcing deterministic execution.
- **English Voiceover Line:**
  > "In short, the model only routes; it never writes Cypher."
- **Target Timing:** 7 seconds
- **Cut Point:** Hold for 1 second of clean pause immediately following the final spoken phrase `"it never writes Cypher."`
- **Pacing & Trimming Directive:** The named trim already applies: Beat 7 speaks only its closing line, and Beat 6 is 9 seconds. If a retake still runs long, tighten the pause before the Beat 6 button press first. The concluding sentence `"In short, the model only routes; it never writes Cypher."` must remain intact as the final spoken statement of the video.

---

## 3. Retake Checklist

Use this checklist between recording takes to reset the environment cleanly:

1. **URL & Navigation Reset:**
   - Reload `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/` in the fresh tab.
   - Verify page title reads `"Cross-document inconsistencies in FarmBot Genesis documentation, traced to evidence"`.
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
6. **Final Voiceover Check:**
   - Confirm the final voiceover phrase remains verbatim: `"the model only routes; it never writes Cypher."`

---

## 4. Quoted Video Constraints

The following constraints are quoted verbatim from the repository documentation. No container, resolution, bitrate, or hosting requirements beyond these are specified in the project files.

### From `farmbot/docs/demo-script.md`:

> "Target spoken length: 1 to 2 minutes."

> "Keep the narration within 1 to 2 minutes, about 90 to 110 seconds. If it runs long, shorten step 6 first, then step 0; the closing words must stay the final statement."

> "Do not claim that the live deployment already serves a build you have not confirmed."

> "The desk-fan screen at `/` is a different graph; do not film or describe its SBOM or BOP as `/farmbot/` behaviour."

> "Do not film a live model roll."

> "No email is sent and no secret is shown during the take."

### From `farmbot/docs/devpost-submission.md` (Positioning Decision 4):

> "The public demo video URL is filled in after recording (#70, #60) and is not known yet. Do not invent a video URL. Name Relate as 'Relate, Neo4j's lightweight graph database' if the narration names it. The official contest title is 'Relate by Neo4j Hackathon'."
