# Demo script (draft)

A draft narration guide for a later screen recording of `/farmbot/`. It is not a
timed shot list; timing, shot-list sign-off, recording and publishing are
separate steps (#74, #70, #60). Target spoken length: 1 to 2 minutes.

On-screen labels come from `src/farmbot/i18n.ts`. This script names those keys
rather than quoting the strings, so the labels stay in one place.

## Before recording

- Serve the local production build, or the post-freeze live `/farmbot/` screen
  after `farmbot-data-v2` and the matching production deploy, and open
  `/farmbot/` (see the repository README).
- Use the committed seed, checks and findings only. Do not edit them for the
  take, and do not put an inventory total in the narration. When a total would
  otherwise be needed, point at `farmbot/dist/farmbot.findings.json` or a
  command that regenerates it.
- Everything on this screen runs in the tab. The Worker email path is
  narrated, not triggered. There is no public send control on this page, and no
  email is sent during the take.
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

## Narration draft (about 90 to 110 seconds)

Spine: sample notification-email card → `#finding=` deep link → process-lane
diagram with each evidence row's Intent, executed Cypher, and bound parameters
→ a short deterministic Cypher-output rejection beat → close on closed routing
with the words "the model only routes; it never writes Cypher".

### 1. Sample notification card (about 12 seconds)

Open `/farmbot/` and point at the sample notification-email cards
(`sampleHeading`). Each card is a sample of notification email, not sent mail
(`sampleOpenFinding`). Nothing is sent from this screen.

Narration: "A reviewer can start from a notification and go straight to the
evidence, without leaving the tab."

### 2. Deep link and downstream evidence (about 18 seconds)

Follow a card's `#finding=` link to `/farmbot/#finding=R6-power-supply`. The id
is taken from `farmbot/dist/farmbot.findings.json`. This finding carries design
change, packing and service evidence.

Narration: "The Change Log changed this part. The checks do not take the Change
Log's word for it: the finding starts in the design-change lane
(`laneDesignChange`) and asks where the changed part still appears. The changed
part still appears in a packing list and on a service page. Each evidence row
names the source file and, where the source has one, the line."

### 3. Process-lane diagram and query provenance (about 18 seconds)

Stay on `R6-power-supply` and scroll to the diagram heading
(`processLanesHeading`).

Narration: "The diagram is built only from this finding's evidence rows. The
highlighted nodes are the problem nodes (`lanesLegendProblem`), and the
highlighted links between them are the impacted path (`lanesLegendPath`). The
path runs from the design-change lane (`laneDesignChange`) through the EBOM
part lane (`laneEbomPart`) to packing (`lanePacking`) and service
(`laneService`)."

Click a diagram node: its evidence row is selected. Then click that row's
select-node control (`evidenceSelect`): the node is selected from the table.
Point at the evidence query block (`evidenceQueriesLabel`,
`executedCypherLabel`, `paramsLabel`).

Narration: "Every evidence row carries the Intent, the executed Cypher, and the
bound parameters that produced it."

### 4. SBOM (materials) beat (about 12 seconds)

Switch to `/farmbot/#finding=R1-40mm-nut-bar-standard`. This finding cites a
part whose page documents `specs.material`, so the SBOM (materials) lane
(`laneSbom`) is visible on it. Point at the attached material evidence node
`material:stainless steel`, displayed as `Stainless Steel`.

Narration: "When a cited part page records a material, the SBOM (materials) lane
shows that documented material next to the part. It is a view of the recorded
values, not a software bill of materials and not a substance list. The lane
stays hidden on a finding that cites no such material."

### 5. BOP (instructions) and PDF-only marker (about 15 seconds)

Switch to `/farmbot/#finding=R2-barb`. This finding cites pre-assembly usage
and reference evidence on `v1.7/manufacturing/pre-assembly/tools/utm.md`
(`usage:preassembly:` / `preassembly:`), so the BOP (instructions) lane
(`laneBop`) is visible. The page records `machineReadable` as true with the
reason `markdown component list; assembly steps are PDF-only`. The PDF-only
diagram marker is NOT shown on `R2-barb`; do not say that it is.

Narration: "The BOP (instructions) lane shows the documented instruction
structure the evidence cites, not a factory routing."

Then switch to
`/farmbot/#finding=R5-v1-7-manufacturing-pre-assembly-cable-carrier-md`. This
finding cites a pre-assembly page recorded as `pdf-only`, and the BOP
(instructions) lane is visible on it too. Point at the PDF-only marker
(`lanesNodePdfOnly`, `[data-testid="process-node-pdf-only"]`).

Narration: "A pre-assembly page whose steps are only in a PDF gets this marker.
It records that the page has no machine-readable component list; it is not a claim
that the PDF was parsed."

### 6. Cypher-output rejection (about 12 seconds)

Scroll to the free-text heading (`checkFreeTextHeading`). The consent card
(`checkConsentTitle`) may be visible; declining leaves the rule chips
available. Use the labelled control (`checkRejectionDemoButton`), not a live
prompt hoping the model emits Cypher. The button feeds a fixed sample, not a
live model result (`checkRejectionDemoSampleLabel`, `checkRejectionDemoHint`).
The fixed sample text is `MATCH (part:Part) RETURN part`. The validator reason
is `routing output contains Cypher or a markdown fence`. The on-screen
rejection copy is `checkRoutingRejected` / `checkRoutingRejectedBody`. Nothing
new is compiled or executed. Do not film a live model roll.

Narration: "If the routing output contains Cypher or a markdown fence, the
screen rejects it. Nothing new is compiled or executed."

### 7. Closed routing close (about 12 seconds)

Stay on the free-text heading. Point at the always-visible bound
(`checkModelNoCypher`). Do not claim a particular routing result or model
accuracy for a typed sentence.

Narration: "The optional local model selects a closed check Intent and the
check engine does the work. In short, the model only routes; it never writes
Cypher."

If the take runs long, cut the decline-path explanation here first.

## Recording notes

- No email is sent and no secret is shown during the take.
- Keep the narration within 1 to 2 minutes, about 90 to 110 seconds. If it runs
  long, cut the decline-path explanation in step 7 first, then shorten step 6.
- Do not claim that the live deployment already serves a build you have not
  confirmed.
- The desk-fan screen at `/` is a different graph; do not film or describe its
  SBOM or BOP as `/farmbot/` behaviour.
