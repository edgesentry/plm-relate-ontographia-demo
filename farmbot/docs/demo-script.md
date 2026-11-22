# Demo script (draft)

A draft narration guide for a later screen recording of `/farmbot/`. It is not a
timed shot list; timing, shot-list sign-off, recording and publishing are
separate steps (#74, #70, #60). Target spoken length: 1–2 minutes.

On-screen labels come from `src/farmbot/i18n.ts`. This script names those keys
rather than quoting the strings, so the labels stay in one place.

## Before recording

- Serve the local production build, or the post-freeze live `/farmbot/` screen
  after `farmbot-data-v2` and the matching production deploy, and open
  `/farmbot/` (see the repository README).
- Use the committed seed, checks and findings. Do not edit them for the take.
- Everything on this screen runs in the tab. The Worker email path is
  narrated, not triggered. There is no public send control on this page.
- Do not call `/api/notify/test`, set secrets, or show destination addresses or
  tokens.

### The BOP lane on `/farmbot/`

- The BOP lane is on the `/farmbot/` process-lane diagram. Look at the
  process-lane diagram on a finding whose evidence reaches an assembly chapter
  or a pre-assembly, and point at `BOP (instructions)` (`laneBop`). It stays
  hidden when the opened finding cites no such evidence, so name it only on a
  take where it is visible. The desk-fan screen at `/` has its own
  EBOM / MBOM / SBOM / BOP swimlanes; that is a different screen and a
  different (fictional) graph.

`/farmbot/` already shows Design change, EBOM part, SBOM (materials), BOP
(instructions), Packing, and Service (`laneDesignChange`, `laneEbomPart`,
`laneSbom`, `laneBop`, `lanePacking`, `laneService`). The SBOM
(materials) lane appears only when the opened finding cites a part whose page
documents `specs.material`. The BOP (instructions) lane appears only when the
opened finding cites an assembly chapter, a pre-assembly or their
usage/reference evidence. The Cypher-output rejection beat uses the labelled
control (`checkRejectionDemoButton`): a fixed sample through the closed
routing parser, not a live model roll.

## Narration draft (about 90 seconds)

Spine: sample notification-email card → `#finding=` deep link → process-lane
diagram plus Intent, executed Cypher, and bound parameters → close on closed
routing. The SBOM (materials) lane is on the diagram whenever the opened
finding cites a part with a documented material. The BOP (instructions) lane
is on the diagram whenever the opened finding cites an assembly chapter, a
pre-assembly or their usage/reference evidence, and it is hidden otherwise.
The rejection beat uses the labelled control (`checkRejectionDemoButton`).

### 1. Sample notification card (about 15 seconds)

Open `/farmbot/` and point at the sample notification-email cards
(`sampleHeading`). The cards are samples of notification email, not sent mail
(`sampleOpenFinding`). Nothing is sent from this screen.

Narration: "A reviewer can start from a notification and go straight to the
evidence, without leaving the tab."

### 2. Deep link and downstream evidence (about 20 seconds)

Follow a card's `#finding=` link. One committed example already used in this
draft is `/farmbot/#finding=R6-power-supply`. The id is taken from
`farmbot/dist/farmbot.findings.json`.

Narration: "The Change Log changed this part. The checks do not take the Change
Log's word for it: the finding starts in the design-change lane
(`laneDesignChange`) and asks where the changed part still appears. The changed
part still appears in a packing list and on a service page. Each evidence row
names the source file and, where the source has one, the line."

### 3. Process-lane diagram and query provenance (about 25 seconds)

Scroll to the diagram heading (`processLanesHeading`).

Narration: "The diagram is built only from this finding's evidence rows. The
highlighted nodes are the problem nodes (`lanesLegendProblem`), and the
highlighted links between them are the impacted path (`lanesLegendPath`). The
path runs from the design-change lane (`laneDesignChange`) through the EBOM
part lane (`laneEbomPart`) to packing (`lanePacking`) and service
(`laneService`)."

Click a diagram node: its evidence row is selected. Then click that row's
select-node control (`evidenceSelect`): the node is selected from the table.
Point at the evidence query block (`evidenceQueriesLabel`,
`executedCypherLabel`).

Narration: "Every evidence row carries the Intent, the executed Cypher, and the
bound parameters that produced it."

If the finding shows the SBOM (materials) lane (`laneSbom`), which it does
whenever the finding cites a part whose page documents `specs.material`, name
it as the materials the cited part pages record, next to the EBOM part lane.
It stays hidden when no cited part documents a material, so name it only when
it is visible on that take. If the finding reaches an assembly chapter or a
pre-assembly, name the BOP (instructions) lane (`laneBop`) as the documented
instruction structure the evidence cites; it stays hidden when the finding
cites no such evidence, so name it only when it is visible on that take.

### 4. Closed routing (about 15 seconds)

Scroll to the free-text heading (`checkFreeTextHeading`). The consent card
(`checkConsentTitle`) is visible; declining leaves the rule chips available.

Narration: "The optional local model only selects a closed check Intent. The
check engine still does the work: the model never writes Cypher and never
detects, scores or explains a finding. I review the expanded Intents before
anything runs."

Point at the always-visible bound (`checkModelNoCypher`). Do not claim a
particular routing result or model accuracy for a typed sentence.

### 5. Cypher-output rejection (about 15 seconds)

Use the labelled demonstration control (`checkRejectionDemoButton`), not a live
prompt hoping the model emits Cypher.

Narration: "If the routing output contains Cypher, the screen rejects it
(`checkRoutingRejected`). Nothing new is compiled or executed."

## Recording notes

- No email is sent and no secret is shown during the take.
- Do not claim that the live deployment already serves a build you have not
  confirmed.
- Name the SBOM (materials) lane only when it is visible on the take: it
  appears when the opened finding cites a part whose page documents
  `specs.material`, and stays hidden otherwise. Name the BOP (instructions)
  lane (`laneBop`) only when it is visible on the take: it appears when the
  opened finding cites an assembly chapter, a pre-assembly or their
  usage/reference evidence, and stays hidden otherwise.
- Keep the narration within 1–2 minutes. If it runs long, cut the decline path
  in step 4 first, then shorten step 5.
