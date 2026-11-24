# Demo script (draft)

A draft caption guide for a later silent screen recording of `/farmbot/`. It is
not a timed shot list; timing, shot-list sign-off, recording and publishing are
separate steps (#74, #70, #60). The take has no voiceover; the caption lines
below are burned in after the take. Target screen length: 129 seconds (2:09).

For the timed, shootable recording guide, see `farmbot/docs/recording-guide.md`.

On-screen labels come from `src/farmbot/i18n.ts`. This script names those keys
rather than quoting the strings, so the labels stay in one place.

## Before recording

- Serve the local production build, or the post-freeze live `/farmbot/` screen
  after `farmbot-data-v2` and the matching production deploy, and open
  `/farmbot/` (see the repository README).
- Use the committed seed, checks and findings only. Do not edit them for the
  take, and do not put an inventory total in a caption line. When a total would
  otherwise be needed, point at `farmbot/dist/farmbot.findings.json` or a
  command that regenerates it.
- Everything on this screen runs in the tab. The Worker email path is
  described, not triggered. There is no public send control on this page, and
  no email is sent during the take.
- Do not call `/api/notify/test`, set secrets, or show destination addresses or
  tokens.
- Do not claim a live deployment serves a build you have not confirmed.
- The desk-fan screen at `/` is a different graph. Do not film it or describe
  its SBOM or BOP swimlanes as `/farmbot/` behaviour.

## Process lanes on `/farmbot/`

The process-lane diagram uses these lanes: Design change, EBOM part, SBOM
(materials), BOP (instructions), Packing, and Service (`laneDesignChange`,
`laneEbomPart`, `laneSbom`, `laneBop`, `lanePacking`, `laneService`). Which
lanes appear is decided by the opened finding's evidence rows, not by the
screen as a whole. No single committed finding shows every lane, so the beats
below open specific findings to show specific lanes.

- The SBOM (materials) lane (`laneSbom`) is a constructed view of documented
  `specs.material` values on cited part pages. It is shown only when the opened
  finding cites a part whose page documents a material, and hidden otherwise.
- The BOP (instructions) lane (`laneBop`) is a constructed view of existing
  assembly-chapter and pre-assembly nodes and their usage or reference
  evidence. It is shown only when the opened finding cites that evidence, and
  hidden otherwise. It is not factory routing.
- A pre-assembly page recorded as `pdf-only` shows a PDF-only marker
  (`lanesNodePdfOnly`, `[data-testid="process-node-pdf-only"]`) on the diagram.
  That marker is not a claim that the page was parsed.

## Caption draft (about 129 seconds)

Spine: opening background and purpose over the landing flow strip → sample
notification-email card → `#finding=` deep link → process-lane diagram with
each evidence row's Intent, executed Cypher, and bound parameters → a short
deterministic Cypher-output rejection beat → the deterministic claim
verification panel → close on closed routing with the words "the model only
routes; it never writes Cypher".

Pacing notes, so the silent take lands on the documented screen-and-caption total:

- The 12-second step 0 opening is added.
- Steps 2 through 5 are stretched to the caption reading pace (18, 18, 12, and 15 seconds become 22, 23, 17, and 17 seconds), and the new step 7 claim verification is added at 10 seconds.
- Step 6 is trimmed by 3 seconds (12 to 9 seconds); step 8 is trimmed by 5 seconds (12 to 7 seconds), by dropping its first sentence; the closing line stays verbatim.
- The nine named durations sum to 129 seconds (2:09), the documented screen-and-caption total.

### 0. Opening (about 12 seconds)

The take is silent; hold on the landing before any screen operation. The
camera holds on the compact 3-step flow strip above the sample notification
cards (`[data-testid="flow-strip"]`, labels `flowStepAgent`, `flowStepEmail`,
`flowStepAnalysis`): the agent finds the drift, the email link, and graph
analysis in the browser. The `howItWorksLabel` disclosure
(`[data-testid="how-it-works"]`) stays closed, so the EBOM/MBOM and engine
definitions stay off the fold. No click, no scroll, no typing.

Caption: "Hardware docs drift across BOMs, packing lists, and service
pages. An agent spots the broken subgraph, emails a link, and clicking it
runs live graph verification right in your browser."

### 1. Sample notification card (about 12 seconds)

Open `/farmbot/` and point at the sample notification-email cards
(`sampleHeading`). Each card is a sample of notification email, not sent mail
(`sampleIntro`). Nothing is sent from this screen.

Caption: "A reviewer can start from a notification and go straight to the
evidence, without leaving the tab."

### 2. Deep link and downstream evidence (about 22 seconds)

Follow a card's `#finding=` link to `/farmbot/#finding=R6-power-supply`. The id
is taken from `farmbot/dist/farmbot.findings.json`. This finding carries design
change, assembly-chapter, packing and service evidence.

Caption: "The Change Log changed this part. The checks do not take the Change
Log's word for it: the finding starts in the design-change lane
(`laneDesignChange`) and asks where the changed part still appears. The changed
part still appears in the BOP (instructions) lane (`laneBop`), in a packing
list and on a service page. Each evidence row names the source file and, where
the source has one, the line."

### 3. Process-lane diagram and query provenance (about 23 seconds)

Stay on `R6-power-supply`. At the filming viewport the lane pane stays beside
the evidence rows, so the diagram heading (`processLanesHeading`) and the
selected node stay in frame without scrolling.

Caption: "The diagram is built only from this finding's evidence rows. The
highlighted nodes are the problem nodes (`lanesLegendProblem`), and the
highlighted links between them are the impacted path (`lanesLegendPath`). The
path runs from the design-change lane (`laneDesignChange`) through the EBOM
part lane (`laneEbomPart`) to the BOP (instructions) lane (`laneBop`), packing
(`lanePacking`) and service (`laneService`); the BOP lane holds the
assembly-chapter evidence, not a factory routing."

Click a diagram node: its evidence row is selected. Then click that row's
select-node control (`evidenceSelect`): the node is selected from the table.
Point at the evidence query block (`evidenceQueriesLabel`,
`executedCypherLabel`, `paramsLabel`).

Caption: "Every evidence row carries the Intent, the executed Cypher, and the
bound parameters that produced it."

### 4. SBOM (materials) beat (about 17 seconds)

Switch to `/farmbot/#finding=R1-40mm-nut-bar-standard`. This finding cites a
part whose page documents `specs.material`, so the SBOM (materials) lane
(`laneSbom`) is visible on it. Point at the attached material evidence node
`material:stainless steel`, displayed as `Stainless Steel`.

On screen the finding view also carries the reconciliation presentation for
this shot: the category label `reconciliationCategoryR1` (Quantity difference)
with the comparison note `reconciliationR1Note` (Part page versus packing
list). Do not caption them; the beat stays the SBOM (materials) lane inside
the same about-17-second budget.

Caption: "When a cited part page records a material, the SBOM (materials) lane
shows that documented material next to the part. It is a view of the recorded
values, not a software bill of materials and not a substance list. The lane
stays hidden on a finding that cites no such material."

### 5. BOP (instructions) and PDF-only marker (about 17 seconds)

Switch to `/farmbot/#finding=R2-barb`. This finding cites pre-assembly usage
and reference evidence on `v1.7/manufacturing/pre-assembly/tools/utm.md`
(`usage:preassembly:` / `preassembly:`), so the BOP (instructions) lane
(`laneBop`) is visible. The page records `machineReadable` as true with the
reason `markdown component list; assembly steps are PDF-only`. The PDF-only
diagram marker is NOT shown on `R2-barb`; do not claim that it is.

Caption: "The BOP (instructions) lane shows the documented instruction
structure the evidence cites, not a factory routing."

Then switch to
`/farmbot/#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`. This
finding cites a pre-assembly page recorded as `pdf-only`, and the BOP
(instructions) lane is visible on it too. Point at the PDF-only marker
(`lanesNodePdfOnly`, `[data-testid="process-node-pdf-only"]`).

Caption: "A pre-assembly page whose steps are only in a PDF gets this marker.
It records that the page has no machine-readable component list; it is not a claim
that the PDF was parsed."

### 6. Cypher-output rejection (about 9 seconds)

Open `checkRoutingHeading`, then scroll to the free-text heading
(`checkFreeTextHeading`). The consent card (`checkConsentTitle`) may be
visible; declining keeps the chips. Use the labelled control
(`checkRejectionDemoButton`), never a live prompt. The button feeds the
fixed sample (`checkRejectionDemoSampleLabel`, `checkRejectionDemoHint`).
The fixed sample text is `MATCH (part:Part) RETURN part`. The validator
reason is `routing output contains Cypher or a markdown fence`. The
on-screen rejection copy is `checkRoutingRejected` / `checkRoutingRejectedBody`.
Nothing new is compiled or executed. Do not film a live model roll.

Caption: "If the routing output contains Cypher or a markdown fence, the
screen rejects it. Nothing new is compiled or executed."

### 7. Claim verification panel (about 10 seconds)

Scroll down to the claim verification panel
(`[data-testid="claim-verifier-panel"]`), a collapsed disclosure below the
findings panel, and open it; the summary heading is "Deterministic claim
verification". The first chip is selected by default
(`uc1-hallucinated-part-fail`, "UC1 Fail: Invented part in gantry assembly",
use-case label "Use case 1: Hallucinated part"), so run it first with the
`Verify claim` button (`[data-testid="verify-claim-run"]`). The fixed agent
claim is "Titanium Servo Coupling is used in the gantry assembly chapter
(v1.7/assembly/gantry.md)." and the badge is REJECTED, with the missing node
or claimed-versus-actual evidence (`claim-missing-evidence` /
`claim-actual-evidence`).

Caption: "A fixed agent claim is replayed as Intent queries and rejected."

Then select `uc1-hallucinated-part-pass` ("UC1 Pass: Valid part in gantry
assembly") and run `Verify claim` again. The fixed agent claim is "M5 x 10mm
Screw is used in the gantry assembly chapter (v1.7/assembly/gantry.md)." and
the badge is CONFIRMED.

Caption: "A claim that matches the graph is confirmed."

### 8. Closed routing close (about 7 seconds)

Return to the free-text heading. Point at the always-visible bound
(`checkModelNoCypher`). Do not claim a particular routing result or model
accuracy for a typed sentence.

Caption: "In short, the model only routes; it never writes Cypher."

If the take still runs long, shorten step 6 first; the closing caption stays
the final statement.

## Recording notes

- No email is sent and no secret is shown during the take.
- Keep the silent take within the documented 129 seconds. If it runs long,
  shorten step 6 first, then step 0; the closing caption must stay the final
  statement.
- Do not claim that the live deployment already serves a build you have not
  confirmed.
- The desk-fan screen at `/` is a different graph; do not film or describe its
  SBOM or BOP as `/farmbot/` behaviour.
