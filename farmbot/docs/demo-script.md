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

### To be implemented in `/farmbot/` before recording

These beats stay in the video spine. They are **not shipped on `/farmbot/`
today**. Do not film them, and do not claim they already exist, until they are
on the frozen `/farmbot/` screen:

- SBOM lane(s) and BOP lane(s) on the `/farmbot/` process-lane diagram. The
  desk-fan screen at `/` already has EBOM / MBOM / SBOM / BOP swimlanes; that
  is a different screen and a different graph. `/farmbot/` currently shows
  Design change, EBOM part, Assembly / pre-assembly, Packing, and Service
  (`laneDesignChange`, `laneEbomPart`, `laneAssembly`, `lanePacking`,
  `laneService`).
- A Cypher-output rejection beat that is deterministic and reproducible: a
  fixed sample input or control whose path shows `checkRoutingRejected` /
  `checkRoutingRejectedBody` by feeding Cypher-like text into the closed
  routing parser. Do not rely on a live model roll to produce Cypher.

## Narration draft (about 90 seconds)

Spine: sample notification-email card → `#finding=` deep link → process-lane
diagram plus Intent, executed Cypher, and bound parameters → close on closed
routing. Add the rejection beat and any SBOM / BOP lane visibility only after
those features ship on `/farmbot/`.

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

If, after the work above lands, this finding also shows an SBOM or BOP lane,
name only the lanes that are visible on that take. Do not name a lane that is
not on screen.

### 4. Closed routing (about 15 seconds)

Scroll to the free-text heading (`checkFreeTextHeading`). The consent card
(`checkConsentTitle`) is visible; declining leaves the rule chips available.

Narration: "The optional local model only selects a closed check Intent. The
check engine still does the work: the model never writes Cypher and never
detects, scores or explains a finding. I review the expanded Intents before
anything runs."

Point at the always-visible bound (`checkModelNoCypher`). Do not claim a
particular routing result or model accuracy for a typed sentence.

### 5. Cypher-output rejection (only after it ships; about 15 seconds)

Use the deterministic demonstration control or fixed sample input, not a live
prompt hoping the model emits Cypher.

Narration: "If the routing output contains Cypher, the screen rejects it
(`checkRoutingRejected`). Nothing new is compiled or executed."

If this control is not yet on the frozen screen, skip this shot.

## Recording notes

- No email is sent and no secret is shown during the take.
- Do not claim that the live deployment already serves a build you have not
  confirmed.
- Do not claim that `/farmbot/` already has SBOM or BOP lanes, or a
  deterministic rejection control, until those are on the frozen screen.
- Keep the narration within 1–2 minutes. If it runs long, cut the decline path
  in step 4 first, then shorten step 5.
