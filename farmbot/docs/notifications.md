# Findings notifications (email through the Worker)

The Worker sends a plain-text and HTML email summary when the bundled FarmBot
findings change. Email content comes only from
`worker/generated/notify-bundle.json`, which is generated at build time from
`farmbot/dist/farmbot.findings.json` after checking its SHA-256 sidecar. Request
bodies can select one finding by id; they never supply email content. The Worker
does not run WASM.

## How it runs

The schedule and the limiter bindings are declared in `wrangler.jsonc`; the test
route (`NOTIFY_PATH`) is defined in `worker/notify.ts`. The request handling,
the digest-and-send flow and the fail-closed order are implemented in
`worker/index.ts` and `worker/notify.ts`. Read those files for the trigger list,
the limiter values and the payload shape. They are not restated here.

### The daily cap is best effort

The cap is a guard rail, not a strict quota. Sends reserve their slot before
calling the email binding, so a failed send still counts and a request whose
counter write fails is refused without sending. KV is eventually consistent,
though, and the rate limiters are scoped per Cloudflare location, so the cap is
not enforced across all locations: a burst that lands on several locations at
once can exceed the configured cap.

## Maintainer setup

These are one-time account steps. CI and the tests never deploy and never touch
a Cloudflare account.

1. **Use a zone with Email Routing or Email Sending onboarded.** The Worker uses
   a `send_email` binding with no destination override, so the account must be
   allowed to send from the sender address to the recipient. Sending to verified
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
4. **Deploy.** Workers Builds deploys every push to `main`. The first deploy with
   this config auto-provisions the `NOTIFY_STATE` KV namespace (the config has no
   `id` on purpose). Until the secrets exist, the deployed Worker serves the site
   unchanged and refuses to send. To create the KV namespace yourself instead, run
   `npx wrangler kv namespace create NOTIFY_STATE` and add the printed `id` to
   `wrangler.jsonc` before merging.

   `PUBLIC_BASE_URL` is a committed non-secret `vars` value in `wrangler.jsonc`;
   its shape must be a bare `https://` origin with no path or query.
5. **Smoke the endpoint** by hand (keep the token in a shell variable, not in
   shell history you share), posting to the test route in `worker/index.ts` with
   the bearer token and, optionally, a bundled finding id. A successful response
   is exactly `{"ok":true}`.

The cron starts after the first deploy with the trigger enabled. The first run
sends a summary (there is no stored digest yet); later runs are silent until
`farmbot/dist/farmbot.findings.json` changes and the bundle is rebuilt.

## Disabling sending

Any of these stops email without affecting the static site:

- **Simplest:** delete or unset `NOTIFY_TO` and/or `NOTIFY_FROM`
  (`npx wrangler secret delete NOTIFY_TO`). The cron logs a skip and stores
  nothing; the endpoint refuses the send. Re-adding both secrets resumes sending.
- Remove or comment out the cron trigger in `wrangler.jsonc` and redeploy. The
  endpoint still works for manual tests but nothing is scheduled.
- Delete `NOTIFY_TOKEN` (or keep it shorter than 32 characters) to disable the
  test endpoint with 401 while leaving the cron untouched.
- For a temporary mute, set the daily-cap variable to `"0"` and redeploy; every
  send is refused by the daily cap. `"0"` is a valid value; a malformed value is
  a configuration failure instead. See `worker/notify.ts` for how the value is
  parsed.

## Local development and tests

The commands for regenerating the bundle and the Worker types, the pure logic
tests, the contract test and the browser smoke live in `package.json` as
`build:notify`, `types:worker`, `test:worker`, `test:worker:contract` and
`smoke:wrangler`. The contract test and the smoke need `dist/`; the smoke also
needs Playwright Chromium.

`npm run typecheck` checks both the app and `worker/tsconfig.json`. `npm run
build` runs `build:notify` first, so a findings file that does not match its
sidecar digest fails the build instead of reaching an inbox. `npm run verify`
also runs `wrangler types --check worker/worker-configuration.d.ts` and fails if
`worker/generated/notify-bundle.json` differs from a fresh `npm run
build:notify` output. Both generated files are committed, so tests and CI need
no generation step.

Tests must use fake addresses and fake tokens. The committed examples use the
`.invalid` TLD and a token generated inside each test run. Logs are structured
JSON and deliberately exclude the recipient, sender, token, and Authorization
header.

## Operational notes

- `to` is only ever `env.NOTIFY_TO`; `from` is only ever `env.NOTIFY_FROM`. The
  email binding intentionally has no destination allowlist override.
- Every interpolated value in the HTML body is escaped, there are no remote
  images and no external CSS, and subjects contain only bundled data with CR/LF
  stripped.
- A missing email, KV, or limiter binding is treated as a configuration
  failure, never as a reason to send unthrottled.
