# Demo script (draft)

A draft narration guide for a later screen recording of `/farmbot/`. It is not a
timed shot list; timing, shot-list sign-off, recording and publishing are
separate steps. Target spoken length: 1–2 minutes.

## Before recording

- Serve the local production build and open `/farmbot/` (see the repository
  README).
- Use the committed seed, checks and findings. Do not edit them for the take.
- Everything on this screen runs in the tab. The email path in step 4 is
  narrated, not triggered.

## Narration draft (about 90 seconds)

### 1. Design change (about 20 seconds)

Open `/farmbot/#finding=R6-power-supply`.

Why this id: it is an R6 finding whose Change Log link resolved to a part
(`fact`), and its evidence includes both a packing page and a service page, so
one view covers the downstream path. The id comes from
`farmbot/dist/farmbot.findings.json`.

Narration: "The Change Log changed this part. The checks do not take the Change
Log's word for it: the finding starts in the **Design change** (**設計変更**)
lane and asks where the changed part still appears."

### 2. Downstream finding (about 20 seconds)

Point at the packing and service evidence rows below the diagram.

Narration: "The changed part still appears in a packing list and on a service
page. Each evidence row names the source file and, where the source has one,
the line."

### 3. Process-lane diagram (about 20 seconds)

Scroll to **Process lanes** (**プロセスレーン**).

Narration: "The diagram is built only from this finding's evidence rows. The
blue nodes are **Problem** (**問題**) nodes, and the highlighted links between
them are the **Impacted path** (**影響経路**). The path runs from **Design
change** (**設計変更**) through the **EBOM part** (**EBOM 部品**) lane to
**Packing** (**梱包**) and **Service** (**サービス**)."

Click a diagram node: its evidence row is selected. Then click that row's
**Select node** (**ノードを選択**) button: the node is selected from the table.

### 4. Email (about 15 seconds)

Do not look for a send button. Leave the **Check findings** (**チェック結果**)
panel on screen while saying:

"The panel is computed in this tab and sends nothing anywhere. Email is sent by
the Worker, not by this screen: an hourly cron compares the digest of the
bundled findings and emails a summary when it changes, and an owner-only test
endpoint can send the same summary. The message uses the Cloudflare Email
Service binding, goes only to verified destinations, is rate-limited, and its
secrets are set by the maintainer. There is no public send control on this
page."

Do not call `/api/notify/test`, set secrets, or show destination addresses or
tokens.

### 5. Free text (about 25 seconds)

Scroll to **Free-text check routing** (**自由な文章からチェックを選択**).

The consent card is **Allow a local model download?** (**ローカルモデルのダウンロードを許可しますか？**). Choose **Allow and load model** (**許可してモデルを読み込む**), or **Decline** (**許可しない**); declining leaves the rule
chips available, as the on-screen notice says.

Type the input placeholder sentence, "For example: Which service-page references
do not resolve to parts?" ("例: サービスページの参照で部品に解決できないものは
どれですか？"), or one sentence of your own. Press **Convert** (**変換**). Review
the expanded Intents under **Confirm the proposed Intents** (**提案された Intent
を確認**), then press **Confirm and run** (**確認して実行**).

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
