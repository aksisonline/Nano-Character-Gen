# Site outage kill switch (Cloudflare Flagship)

The whole site can be put into "temporarily out of service" mode from Cloudflare, with no redeploy.
The flag is `site-outage` in the Flagship app `pixelforge` (app id `b7b2670d-25fd-4624-a75a-c5e6b00ca4e4`),
bound to the Worker as `env.FLAGS`. Flagship is in open beta.

## Flag shape

JSON flag with two variations. The value of the *served* variation is what the Worker reads:

| variation | value |
|-----------|-------|
| `up` (default) | `{"enabled":false}` |
| `outage` | `{"enabled":true,"reason":"...","eta":"...","since":"..."}` |

Only `enabled` (must be exactly `true`), `reason` (string, max 300 chars), `eta` and `since` (strings, max 100 chars) are used.
Control chars are stripped; non-strings are dropped. Normal state: default variation = `up`.
Changes propagate globally in up to ~30 seconds.

## Turn the site OFF (outage)

Dashboard: Compute > Flagship > `pixelforge` > `site-outage` > edit the `outage` variation JSON (set `reason`, optional `eta`),
then set the default variation to `outage` and save.

CLI (APP=b7b2670d-25fd-4624-a75a-c5e6b00ca4e4):

    npx wrangler flagship flags update $APP site-outage --remote \
      --set-variation 'outage={"enabled":true,"reason":"The image generation API is down","eta":"~30 min","since":"2026-11-10 14:05 UTC"}' \
      --default-variation outage

## Change the reason while down

Same `--set-variation outage=...` command (or edit the variation in the dashboard). No redeploy.

## Turn the site back ON

Dashboard: set the default variation back to `up`.

    npx wrangler flagship flags set $APP site-outage -V up --remote

Check what the Worker sees:

    npx wrangler flagship flags eval $APP site-outage --remote

## REST API (curl)

Needs an API token with Flagship write permission; ACCOUNT_ID = 66e9f84afafa5af53ebdd33f027849b0. Wrangler's `--json` output and
the API reference at https://developers.cloudflare.com/flagship/ give the exact endpoints; the CLI above wraps
`/accounts/$ACCOUNT_ID/flagship/apps/$APP/flags/site-outage`. Easiest: `npx wrangler flagship flags get $APP site-outage --remote --json`
to see the object, then PUT/PATCH the same shape (`default_variation`, `variations`) to that URL with
`Authorization: Bearer $CLOUDFLARE_API_TOKEN`.

## Fail open

`getOutage()` in `worker/flags.ts` returns `null` (site up) if the binding is missing, the call throws, takes longer than 500 ms,
the flag is missing, or the value is malformed / `enabled` is not `true`. A Flagship outage therefore never takes the site down.
Flagship itself also keeps serving the last propagated config if its dashboard is unavailable.
