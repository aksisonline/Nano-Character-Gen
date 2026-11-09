<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PixelForge Sprite Studio

Create a pixel-art character, refine its base sprite, then define and generate
animation clips individually. Preview each clip and export one or all of them
as transparent GIFs.

View your app in AI Studio: https://ai.studio/apps/drive/1udfLhn1BGyXFggS_M_yuILvXX-NeaY8K

## Run locally

Generation goes through a Cloudflare Worker (`worker/`) that holds the Gemini key,
requires an AKS account (OIDC via AKS-Access) and enforces a weekly generation
quota through the `ACCESS` service binding (`reservePixelForge` / `finishPixelForge`).
The Gemini key never reaches the browser.

1. `bun install`
2. Copy `.dev.vars.example` to `.dev.vars` and set `GEMINI_API_KEY`, a random `SESSION_SECRET` (32+ chars) and `OIDC_CLIENT_SECRET`.
3. `bun run build && bun run cf:dev` (API on :8788), then `bun run dev` (UI on http://127.0.0.1:5173, proxies `/api`).
   Open the UI at 127.0.0.1:5173 (the registered redirect URI); AKS-Access must be reachable for sign-in.
4. Deploy: `wrangler secret put` the three secrets, then `bun run deploy`.

The workflow is **Create → Edit → Animate**. Animation clips have their own
name, motion prompt, frame count, playback FPS, and loop setting.

## Saved characters (per-user storage)

Everything a signed-in user makes is autosaved (debounced ~2s, single write in flight, latest state wins) and listed under **My characters** (open, duplicate, delete).

- **JSON only.** Stored value is `shared/character.ts` `CharacterDoc` v1: name, prompt, palette (hex), base sprite and animation frames as packed base-36 palette-index strings, plus clip settings. No rendered images or sprite sheets are stored; the studio re-renders from the JSON.
- **Where.** In AKS-Access, one SQLite Durable Object per user (`pixelforge-chars:<sub>`) behind the `ACCESS` service binding (`list/get/put/delete/duplicatePixelForgeCharacter`, `getPixelForgeStorageUsage`). PixelForge has no storage of its own. AKS-Access purges it with the quota object 5 days after account deletion; a user who signs up again inside that window keeps the same `sub` and their characters.
- **Authorization.** `worker/authz.ts`: deny by default; role `user` has full CRUD on its **own** items only. The user id is always the verified session `sub`, never a body/query/header value. Other users' ids (and malformed ids) return 404, not 403. Unknown body fields and unknown JSON fields are rejected. There is no admin path; one must be a separate, audited, read-only-by-default addition.
- **Limits** (enforced by the store as well as validated here): item <= 96 KB, 40 items and 1.5 MB per user, 30 writes/minute. Writes use revision numbers (`baseRev`); conflicts are surfaced.
- **Quota.** Weekly generation quota is unchanged; storage never touches it.
- **Tests:** `bun run test` covers the authorization matrix (no session, tampered/expired/foreign-signed cookies, own vs other user, id smuggling, bad ids, cross-origin writes, validation, store errors).
- **Deploy order:** AKS-Access with the character store first, then PixelForge.
