# Demo script (draft)

A draft narration guide for a later screen recording of `/farmbot/`. It is not a
timed shot list; timing, shot-list sign-off, recording and publishing are
separate steps. Target spoken length: 1–2 minutes.

On-screen labels come from `src/farmbot/i18n.ts`. This script names those keys
rather than quoting the strings, so the labels stay in one place.

## Before recording

- Serve the local production build and open `/farmbot/` (see the repository
  README).
- Use the committed seed, checks and findings. Do not edit them for the take.
- Everything on this screen runs in the tab. The email path in step 4 is
  narrated, not triggered.

## Narration draft (about 90 seconds)

### 1. Design change (about 20 seconds)

Open `/farmbot/#finding=R6-power-supply`. The id is taken from
`farmbot/dist/farmbot.findings.json`.

Narration: "The Change Log changed this part. The checks do not take the Change
Log's word for it: the finding starts in the design-change lane
(`laneDesignChange`) and asks where the changed part still appears."

### 2. Downstream finding (about 20 seconds)

Point at the packing and service evidence rows below the diagram.

Narration: "The changed part still appears in a packing list and on a service
page. Each evidence row names the source file and, where the source has one,
the line."

### 3. Process-lane diagram (about 20 seconds)

Scroll to the diagram heading (`processLanesHeading`).

Narration: "The diagram is built only from this finding's evidence rows. The
highlighted nodes are the problem nodes (`lanesLegendProblem`), and the
highlighted links between them are the impacted path (`lanesLegendPath`). The
path runs from the design-change lane (`laneDesignChange`) through the EBOM
part lane (`laneEbomPart`) to packing (`lanePacking`) and service
(`laneService`)."

Click a diagram node: its evidence row is selected. Then click that row's
select-node control (`evidenceSelect`): the node is selected from the table.

### 4. Email (about 15 seconds)

Do not look for a send button. Leave the findings panel (`findingsHeading`) on
screen while saying:

"The panel is computed in this tab and sends nothing anywhere. Email is sent by
the Worker, not by this screen. How that path works is in
`farmbot/docs/notifications.md`. There is no public send control on this page."

Do not call `/api/notify/test`, set secrets, or show destination addresses or
tokens.

### 5. Free text (about 25 seconds)

Scroll to the free-text heading (`checkFreeTextHeading`). Follow the consent
card (`checkConsentTitle`) with `checkConsentAllow` or `checkConsentDecline`;
declining leaves the rule chips available, as the on-screen notice says.

Type the field's placeholder sentence (`checkInputPlaceholder`), or one
sentence of your own. Press convert (`checkConvert`). Review the expanded
Intents under the proposal heading (`checkProposalHeading`), then confirm
(`checkRunProposal`).

Narration: "The local model only selects a closed check Intent. The check engine
still does the work: the model never writes Cypher and never detects, scores or
explains a finding. I review the expanded Intents before anything runs."

Do not claim a particular routing result or model accuracy for the typed
sentence; the model runs locally and its choice is only a routing proposal.

## Recording notes

- No email is sent and no secret is shown during the take.
- Do not claim that the live deployment already serves this build.
- Keep the narration within 1–2 minutes. If it runs long, cut the decline path
  in step 5 first.
