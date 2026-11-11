# Linked accounts (OpenAI) — PixelForge ⇄ AKS-Access contract

Status: both sides implemented (AKS-Access on `feat/linked-accounts`). Amended 2026-11-11 after implementing the AKS-Access side; see "Amendments" at the end.
PixelForge degrades gracefully while the backend lacks these methods (the Connections section shows "unavailable").

## Why the split

External-account links belong to the **AKS account**, not to one app. AKS-Access runs the OAuth dance with OpenAI,
stores the link (and, later, any credential), and exposes it to any AKS app through the existing `AccessService`
RPC. PixelForge never sees an OpenAI client secret or refresh token and never talks to `auth.openai.com`.
A future AKS app gets the same linking by binding `ACCESS` and calling the same methods with its own `appId`.

## What OpenAI actually offers (checked 2026-11-11)

Two different things, easy to conflate:

1. **Sign in with ChatGPT (identity)** — <https://developers.openai.com/siwc/website>. OIDC code + PKCE, scopes
   `openid profile email`, `id_token` is the required artifact. Gives a stable `sub` scoped by issuer + client id.
   Linking policy from OpenAI (step 7): linked `sub` → that account; email match is **not** proof of ownership, so a
   signed-in user must confirm the link; otherwise create per product policy. Limited trial for selected commercial
   partners — a client id (`oaiapp_…`) must be requested: <https://developers.openai.com/siwc/request-client-id>.
2. **ChatGPT plan usage** — <https://developers.openai.com/siwc/token-sharing-open-source>. Lets an app call
   `POST https://api.openai.com/v1/responses` with the user's access token (`store:false`, `stream:true`), billed to their
   ChatGPT plan. Documented for open-source / locally hosted apps; paid or remotely hosted apps must submit OpenAI's
   interest form. **Image generation is listed as unsupported on this route.** Access token 1 h, rotating refresh token
   30 days (`offline_access`), revocation endpoint in the OpenID configuration.

Consequence: linking (1) can ship now once a client id exists. Using the plan for *image* generation (2) cannot work
today, so every capability that depends on it is reported `false` by the backend and PixelForge gates on it.

## Browser flow (link)

```
PixelForge  ──GET──▶  https://auth.aksisonline.com/connect/openai?client=pixelforge
AKS-Access: needs an AKS session (else /sign-in with the pending request, like the OIDC handover)
            shows handover UI ("AKS-CESS → OpenAI"), user confirms, redirects to OpenAI
OpenAI      ──▶ https://auth.aksisonline.com/api/auth/callback/openai   (Better Auth 1.7.18; register exactly this callback)
AKS-Access  ──302──▶ {registered return URL for client}?account=linked
                      or ?account=link_failed   (denied, expired, already linked to another AKS account, …)
```

The return URL comes only from the AKS-Access client registry (`pixelforge` → `https://pixelforge.aksisonline.com/`,
and `http://127.0.0.1:5173/` for dev). Never from a query parameter.

## RPC additions on `AccessService`

`userId` is the verified OIDC `sub`, as for every other method. Invalid input throws; callers fail closed.

```ts
listLinkableProviders(): LinkedProvider[]   // addition: [] until OpenAI linking is configured; use to hide "Connect"
type LinkedProvider = 'openai'
interface LinkedAccount {
  provider: LinkedProvider
  label: string            // display only: provider email/name. Never a token, never an id that can be replayed
  linkedAt: string         // ISO UTC
  status: 'active' | 'reauth_required'
  capabilities: { identity: true; planUsage: boolean; imageGeneration: boolean }
}
listLinkedAccounts(userId): Promise<LinkedAccount[]>
unlinkAccount(userId, provider: LinkedProvider): Promise<boolean>   // revokes remote token if any; false = was not linked

getProviderAccess(userId, provider: LinkedProvider, appId: string): Promise<
  | { ok: true; accessToken: string; expiresAt: string }            // <= 1 h, short-lived, never persisted by the caller
  | { ok: false; reason: 'not_linked' | 'reauth_required' | 'not_supported' | 'app_not_allowed' | 'usage_limit' | 'unavailable' }>

getPixelForgeSettings(userId): Promise<{ generationSource: 'aks' | 'openai' }>   // default 'aks'
setPixelForgeSettings(userId, s: { generationSource: 'aks' | 'openai' }): Promise<void>

// existing method, new optional 4th argument
reservePixelForge(userId, turnId, kind, source?: 'aks' | 'openai')
```

`source: 'openai'` reservations keep the in-flight guard (1 active) and the 30/min attempt limit, but **do not
consume the weekly AKS generation** (the user is paying with their own plan). `finishPixelForge` is unchanged.
`getPixelForgeUsage` keeps returning the AKS weekly counter only.

`getProviderAccess` is an entitlement check as well as a credential fetch: only app ids on an allow-list in AKS-Access
may call it, and only for their own `provider` scope. It is the *only* path a token leaves AKS-Access.

## PixelForge Worker behaviour (this repo)

- `GET /api/account` → `{ user, usage, storage, connections, settings, links }`; `connections` is `null` if the
  backend lacks the RPC (rollout skew) so the UI can say so instead of showing "not linked".
- `POST /api/account/connections/openai/unlink`, `PUT /api/account/settings {generationSource}`.
- `generationSource: 'openai'` is accepted only if a linked account reports `imageGeneration: true` **and**
  `OPENAI_IMAGE_MODEL` is configured. `generate` then reserves with `source:'openai'`, fetches a token via
  `getProviderAccess(sub, 'openai', 'pixelforge')`, calls `/v1/responses` (store:false, stream:true, `image_generation`
  tool) and charges nothing against the AKS weekly counter. No silent fallback to AKS quota on failure.
- Link / manage URLs are derived from the origin of `OIDC_ISSUER`; PixelForge stores no provider state.

## Amendments (AKS-Access implementation, 2026-11-11)

- **Callback path** is `/api/auth/callback/openai` (Better Auth 1.7.18's fixed generic-OAuth path), not `/oauth2/callback/openai`.
- **Added** `listLinkableProviders()`; PixelForge may call it (optional) to know whether "Connect" can work at all.
- **Capabilities** are honest and conservative: `planUsage` is `true` only when `OPENAI_PLAN_USAGE_ENABLED=true` AND a usable
  credential is stored; `imageGeneration` additionally needs `OPENAI_IMAGE_GENERATION_ENABLED=true`. Defaults: both `false`.
  With a default deployment every linked account reports `{identity:true, planUsage:false, imageGeneration:false}`.
- **Enforcement behind the capability**: `setPixelForgeSettings(.., {generationSource:'openai'})` and
  `reservePixelForge(.., 'openai')` **throw** unless the user has an active link reporting `imageGeneration: true`
  (fail closed; PixelForge's own gating stays the first line). Unlinking resets the stored source to `'aks'`.
  `source` may be omitted, `undefined` or `null` (= `'aks'`); any other value throws.
- **`getProviderAccess`** order: invalid input throws; app not on the allow-list → `app_not_allowed`; no link → `not_linked`;
  flag off → `not_supported`; identity-only link (no credential) → `not_supported`; credential needs re-auth →
  `reauth_required`; refresh failed/outage or any internal error → `unavailable`. `usage_limit` is never produced by
  AKS-Access (it is OpenAI's 429 `subscription_sharing_usage_limit_exceeded`, which PixelForge sees directly). Tokens are
  returned only in the `ok` result and are never logged or persisted by PixelForge.
- **Plan usage cannot be obtained through this link flow.** OpenAI's plan-usage OAuth is a separate registration
  (`client_id=dynamic_agent_client`, loopback-only `http://127.0.0.1:<port>` redirect, `ext_agent_host_id`,
  `resource=https://api.openai.com/v1`, scopes `offline_access resource.invoke chatgpt.tokens.use.direct`) documented only for
  open-source/local apps, and image generation is listed unsupported. The AKS-Access vault exists but is unreachable until
  OpenAI offers a hosted flow. So `planUsage`/`imageGeneration` stay `false` and PixelForge must keep AKS generation as the source.
- Links store issuer, client id, `sub` and a display label only; no OpenAI tokens or raw ID tokens are kept.
