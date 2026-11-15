# Findings notifications (email through the Worker)

The Worker sends a plain-text and HTML email summary when the bundled FarmBot
findings change. Email content comes only from
`worker/generated/notify-bundle.json`, which is generated at build time from
`farmbot/dist/farmbot.findings.json` after checking its SHA-256 sidecar. Request
bodies can select one finding by id; they never supply email content. The Worker
does not run WASM.

## What runs

| Trigger | Behavior |
| --- | --- |
| Cron (`0 * * * *`, hourly) | Reads the last digest from KV `NOTIFY_STATE` (`findings-digest`). Sends one summary when the bundled digest differs, then stores the new digest. No email when unchanged. A failed send, limiter refusal, or daily-cap refusal leaves the digest unset so the next run retries. |
| `POST /api/notify/test` | Owner-only test endpoint. Requires `Authorization: Bearer <NOTIFY_TOKEN>` and sends the same summary, or one finding with `{"findingId":"<bundled id>"}`. It never updates the stored digest. |

Both triggers share:
- `NOTIFY_GLOBAL_LIMITER` (simple, 1 per 60 seconds, constant key) for every send.
- `NOTIFY_CLIENT_LIMITER` (simple, 5 per 60 seconds) keyed by `CF-Connecting-IP`,
  or `unknown`, applied to every endpoint request before authentication.
- A KV daily cap at `sent:<UTC YYYY-MM-DD>`, `NOTIFY_DAILY_CAP` (default 10),
  with a two-day TTL.

Fail-closed order for the endpoint: method/path → client limiter → auth → body
validation → configuration check → global limiter → daily cap → send. Missing
bindings or secrets refuse the send (503 for the endpoint; the cron logs a skip).

## Maintainer setup

These are one-time account steps. CI and the tests never deploy and never touch
a Cloudflare account.

1. **Use a zone with Email Routing or Email Sending onboarded.** The Worker uses
   a `send_email` binding with no destination override, so the account must be
   allowed to send from `NOTIFY_FROM` to `NOTIFY_TO`. Sending to verified
   destination addresses in the account works on both Workers Free and Paid.
2. **Verify the destination address.** In the Cloudflare dashboard, onboard the
   sending domain and verify the destination mailbox (Email Routing → Destination
   addresses, or Email Sending → verified destinations). An unverified address
   will be rejected at send time.
3. **Set the secrets** (prompted; never commit values and never put them in
   `wrangler.jsonc`):

   ```bash
   npx wrangler secret put NOTIFY_TO     # recipient; the only value used for `to`
   npx wrangler secret put NOTIFY_FROM   # sender on the onboarded domain
   npx wrangler secret put NOTIFY_TOKEN  # at least 32 characters, e.g. openssl rand -hex 24
   ```

   `NOTIFY_TOKEN` shorter than 32 characters makes every endpoint request 401.
4. **Deploy.** Workers Builds deploys every push to `main` (`npm run build`,
   then `npx wrangler deploy`). The first deploy with this config auto-provisions
   the `NOTIFY_STATE` KV namespace (the config has no `id` on purpose). Until the
   secrets exist, the deployed Worker serves the site unchanged and refuses to
   send. To create the KV namespace yourself instead, run
   `npx wrangler kv namespace create NOTIFY_STATE` and add the printed `id` to
   `wrangler.jsonc` before merging.

   `PUBLIC_BASE_URL` is a non-secret `vars` value and must be a bare `https://`
   origin with no path or query. The committed value is
   `https://ontographia-plm-demo.egdesentry.workers.dev`.
5. **Smoke the endpoint** by hand (keep the token in a shell variable, not in
   shell history you share):

   ```bash
   curl -X POST "https://ontographia-plm-demo.egdesentry.workers.dev/api/notify/test" \
     -H "Authorization: Bearer $NOTIFY_TOKEN"
   ```

   Add `-H 'Content-Type: application/json' -d '{"findingId":"<bundled id>"}'`
   to send one finding. A successful response is exactly `{"ok":true}`.

The hourly cron starts after the first deploy with the cron trigger. The first
run sends a summary (there is no stored digest yet); later runs are silent until
`farmbot/dist/farmbot.findings.json` changes and the bundle is rebuilt.

## Disabling sending

Any of these stops email without affecting the static site:

- **Simplest:** delete or unset `NOTIFY_TO` and/or `NOTIFY_FROM`
  (`npx wrangler secret delete NOTIFY_TO`). The cron logs a skip and stores
  nothing; the endpoint returns 503. Re-adding both secrets resumes sending.
- Remove or comment out `triggers.crons` in `wrangler.jsonc` and redeploy. The
  endpoint still works for manual tests but nothing is scheduled.
- Delete `NOTIFY_TOKEN` (or keep it shorter than 32 characters) to disable the
  test endpoint with 401 while leaving the cron untouched.
- For a temporary mute, set `NOTIFY_DAILY_CAP` to `"0"` and redeploy; every send
  is refused by the daily cap.

## Local development and tests

```bash
# Regenerate worker/generated/notify-bundle.json (digest-checked)
npm run build:notify

# Pure logic tests: stubbed EMAIL.send, in-memory KV, stub limiters
npm run test:worker

# Contract test: real Worker via wrangler unstable_startWorker (needs dist/)
npm run build
npm run test:worker:contract

# Browser smoke against a local wrangler dev server (needs Playwright Chromium)
npx playwright install --with-deps chromium
npm run smoke:wrangler
```

`npm run typecheck` checks both the app and `worker/tsconfig.json`. `npm run
build` runs `build:notify` first, so a findings file that does not match its
sidecar digest fails the build instead of reaching an inbox.

Tests must use fake addresses and fake tokens. The committed examples use the
`.invalid` TLD and a token generated inside each test run. Logs are structured
JSON and deliberately exclude the recipient, sender, token, and Authorization
header.

## Operational notes

- `to` is only ever `env.NOTIFY_TO`; `from` is only ever `env.NOTIFY_FROM`. The
  email binding intentionally has no destination allowlist override.
- Every interpolated value in the HTML body is escaped (`& < > " '`). There are
  no remote images and no external CSS.
- Subjects contain only bundled data (severity counts, or a bundled finding id)
  and have CR/LF stripped.
- A missing `EMAIL`, `NOTIFY_STATE`, or limiter binding is treated as a
  configuration failure, never as a reason to send unthrottled.
