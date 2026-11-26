# Retrospective: PR #136 (`docs/v2-submission-and-agents-md`)

Concrete facts and follow-ups from rebasing, tightening, and verifying PR #136 on `edgesentry/plm-relate-ontographia-demo`.

## 1. How to keep it safe with fewer approvals

- **Root cause of extra approvals in this run:**
  - `node` / `npm` exited with code `255` inside the sandbox because the Node 22 binary lives under `~/.local/share/mise/installs/node/22.23.4/bin` (outside the workspace).
  - `gh` failed inside the sandbox on `~/.config/gh/config.yml` (`operation not permitted`), and `git fetch` / `git push` / `curl` required network access.
- **Concrete mitigations:**
  - Expose the pinned Node 22 toolchain read-only to the sandbox (or allow-list the local `node --test` and `npm run` prefix) so local unit, doc-drift, and build verification run without elevation.
  - Never use `npx` in agent commands or docs; invoking `node` and `npm run` directly avoids runtime package downloads, keeps command prefixes stable, and eliminates unnecessary network calls.
  - Keep read-only local checks separated from mutating remote commands (`git push`, `gh pr ...`) so only remote writes require approval.

## 2. Did docs and tokens stay small?

Yes. Replacing text in place and removing `farmbot/docs/demo-script.md` cut the core doc footprint by **39.8%** (361 fewer lines):

| File | Before (`origin/main`) | After (PR #136) | Delta |
| --- | ---: | ---: | ---: |
| `README.md` | 226 | 115 | -111 |
| `farmbot/docs/devpost-submission.md` | 154 | 118 | -36 |
| `farmbot/docs/recording-guide.md` | 305 | 232 | -73 |
| `farmbot/docs/demo-script.md` | 223 | 0 (deleted) | -223 |
| `AGENTS.md` | 0 | 82 | +82 |
| **Total** | **908** | **547** | **-361 (-39.8%)** |

Separating `AGENTS.md` (82 lines) from `README.md` (115 lines) lets coding agents load invariants, doc-drift rules, and commands in one compact file instead of scanning human-facing background prose.

## 3. Did deterministic verification get stronger?

Yes:

- **Doc-drift suite (`farmbot/test/docs-drift.test.mjs`)**: 35 tests pass (`npm run test:farmbot`: 300/300 pass, `npm run verify`: OK) on Node `v22.23.4`.
- **New deterministic assertions added in this PR:**
  - `AGENTS.md` is now covered by inventory-count and `npm run` script existence checks.
  - `farmbot/docs/recording-guide.md` is enforced as the single source of truth (`102 seconds` / `1:42` contiguous Beats 0 to 8, no `BGM` instructions, zero references to deleted `demo-script.md`).
  - Beat 7 is pinned to the claim verification panel (`claim-verifier-panel`, `uc1-hallucinated-part-fail` `REJECTED`, `uc1-hallucinated-part-pass` `CONFIRMED`, `verify-claim-run`).
  - Beat 8 voiceover is pinned verbatim to `"In short, the model only routes; it never writes Cypher."`.
  - Every beat's narration rate is checked (`<= 2.5` words/s) and every caption cue is checked for verbatim match to narration, non-overlapping timestamps, and `<= 17` chars/s.
- **External fact check**: `curl -sI` confirmed `https://ontographia-plm-demo.egdesentry.workers.dev/farmbot/` returns `HTTP/2 200` while `https://ontographia-plm-demo.edgesentry.workers.dev/farmbot/` does not resolve, preventing an erroneous spelling change.
- **Typography check**: Initial diff scan caught 17 added lines containing Unicode dashes; after cleanup, added-line Unicode dash and curly-quote hits dropped to `0`.

## 4. Generic checks to move to `agent-ops-kit`

These checks are repo-agnostic and should live in `agent-ops-kit` rather than being re-implemented per repository:

1. **Diff typography gate**: Fail on Unicode dashes (`U+2012..U+2015`, `U+2212`) and curly quotes (`U+2018..U+201D`) in added lines of `git diff`.
2. **Stale path and deleted-file reference check**: Scan Markdown docs and code comments for backtick-quoted repo paths that do not exist (respecting `.gitignore`) or filenames deleted in the current PR.
3. **Markdown `npm run` and pinned-version drift check**: Verify every documented `npm run <script>` exists in `package.json` and flag copied dependency version numbers in docs.
4. **Doc bloat budget report**: Print net line delta across modified Markdown files on PRs to discourage append-only doc growth.
5. **Timed script and caption linter**: Reusable validator for beat timestamp contiguity, narration words/s cap, non-overlapping caption cues, and chars/s cap.
