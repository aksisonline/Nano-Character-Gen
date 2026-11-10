/// <reference types="@cloudflare/workers-types" />
// PixelForge API Worker: AKS sign-in (OIDC code + PKCE), per-account quota via ACCESS, Gemini proxy.
// The Gemini key never reaches the browser.
import { ASPECT_RATIOS, buildAnimationPrompt, buildSpritePrompt } from '../shared/prompts'

import type { Env } from './env'
import { FLOW_COOKIE, SESSION_COOKIE, SESSION_TTL, b64u, cookie, enc, json, rand, readCookie, session, sign, unb64u, verify } from './session'
import { handleCharacters } from './characters'
import { getOutage, type Outage } from './flags'

async function login(env: Env, request: Request) {
  const url = new URL(request.url)
  const state = rand(), verifier = rand(48)
  const challenge = b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)))
  const auth = new URL(`${env.OIDC_ISSUER}/oauth2/authorize`)
  auth.search = new URLSearchParams({
    client_id: env.OIDC_CLIENT_ID, response_type: 'code', scope: 'openid profile email',
    redirect_uri: `${url.origin}/api/auth/callback`, state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString()
  const flow = await sign(env, { state, verifier, exp: Math.floor(Date.now() / 1000) + 600 })
  return new Response(null, { status: 302, headers: { Location: auth.toString(), 'Set-Cookie': cookie(request, FLOW_COOKIE, flow, 600), 'Cache-Control': 'no-store' } })
}

// Send the browser back to the app with a flag instead of leaving it on a raw JSON error.
function signInFailed(request: Request) {
  return new Response(null, { status: 302, headers: { Location: new URL('/?signin=failed', request.url).toString(), 'Cache-Control': 'no-store' } })
}

async function callback(env: Env, request: Request) {
  const url = new URL(request.url)
  const flow = await verify<{ state: string; verifier: string; exp: number }>(env, readCookie(request, FLOW_COOKIE))
  const code = url.searchParams.get('code')
  if (!flow || !code || url.searchParams.get('state') !== flow.state) return signInFailed(request)
  const res = await fetch(`${env.OIDC_ISSUER}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${encodeURIComponent(env.OIDC_CLIENT_ID)}:${encodeURIComponent(env.OIDC_CLIENT_SECRET)}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: flow.verifier,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  })
  if (!res.ok) { console.error(JSON.stringify({ event: 'oidc_token_failed', status: res.status })); return signInFailed(request) }
  const { access_token } = await res.json<{ access_token?: string }>()
  if (!access_token) { console.error(JSON.stringify({ event: 'oidc_no_access_token' })); return signInFailed(request) }
  // Identity comes from the issuer's userinfo endpoint over the back channel, not from client-parsed tokens.
  const info = await fetch(`${env.OIDC_ISSUER}/oauth2/userinfo`, { headers: { Authorization: `Bearer ${access_token}` } })
  const claims = info.ok ? await info.json<{ sub?: string; name?: string }>() : {}
  if (!claims.sub) { console.error(JSON.stringify({ event: 'oidc_userinfo_failed', status: info.status })); return signInFailed(request) }
  const token = await sign(env, { sub: claims.sub, name: claims.name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL })
  const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', cookie(request, SESSION_COOKIE, token, SESSION_TTL))
  headers.append('Set-Cookie', cookie(request, FLOW_COOKIE, '', 0))
  return new Response(null, { status: 302, headers })
}

const MAX_PROMPT = 600
const MAX_IMAGE_B64 = 2_000_000

async function callGemini(env: Env, parts: unknown[], aspectRatio: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.MODEL_NAME}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio } } }),
    },
  )
  if (!res.ok) return { ok: false as const, providerFailure: true }
  const data = await res.json<any>()
  for (const p of data.candidates?.[0]?.content?.parts ?? []) {
    const d = p.inlineData ?? p.inline_data
    if (d?.data) return { ok: true as const, image: `data:${d.mimeType ?? d.mime_type};base64,${d.data}` }
  }
  return { ok: false as const, providerFailure: false }
}

async function generate(env: Env, request: Request, kind: 'sprite' | 'animation') {
  const user = await session(env, request)
  if (!user) return json({ error: 'Sign in required' }, 401)
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Bad origin' }, 403)

  let body: any
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const turnId = body?.turnId
  if (typeof turnId !== 'string' || !/^[0-9a-f-]{36}$/i.test(turnId)) return json({ error: 'Invalid turnId' }, 400)

  let parts: unknown[], aspectRatio: string
  const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  if (kind === 'sprite') {
    if (!str(body.prompt, MAX_PROMPT)) return json({ error: 'Invalid prompt' }, 400)
    parts = [{ text: buildSpritePrompt(body.prompt) }]
    aspectRatio = '3:4'
  } else {
    const { name, prompt, frameCount, columns, rows, aspectRatio: ar, image } = body
    const int = (v: unknown, max: number) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max
    if (!str(name, 60) || !str(prompt, MAX_PROMPT) || !int(frameCount, 16) || !int(columns, 16) || !int(rows, 16)
      || columns * rows !== frameCount || !(ASPECT_RATIOS as readonly string[]).includes(ar)
      || typeof image !== 'string' || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
      return json({ error: 'Invalid request' }, 400)
    }
    parts = [{ text: buildAnimationPrompt({ name, prompt, frameCount, columns, rows }) }, { inlineData: { mimeType: 'image/png', data: image } }]
    aspectRatio = ar
  }

  // Reserve before any inference; failure to reach the quota service fails closed.
  let r
  try { r = await env.ACCESS.reservePixelForge(user.sub, turnId, kind) }
  catch { return json({ error: 'Usage service unavailable' }, 503) }
  if (!r.allowed || !r.reservationId) {
    return json({ error: 'quota', reason: r.reason, remaining: r.remaining, resetsAt: r.resetsAt }, 429)
  }
  let out
  try { out = await callGemini(env, parts, aspectRatio) } catch { out = { ok: false as const, providerFailure: true } }
  try { await env.ACCESS.finishPixelForge(user.sub, turnId, r.reservationId, out.ok || !out.providerFailure) } catch { /* stays charged */ }
  if (!out.ok) return json({ error: out.providerFailure ? 'Image provider failed' : 'No image generated' }, 502)
  const usage = await env.ACCESS.getPixelForgeUsage(user.sub).catch(() => null)
  return json({ image: out.image, usage })
}

const RETRY_AFTER = '300'

async function outageResponse(env: Env, request: Request, outage: Outage, isApi: boolean): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': RETRY_AFTER }
  if (isApi) return json({ error: 'Service temporarily out of service', outage }, 503, headers)
  // Serve the SPA shell with the outage details injected; index.tsx renders <OutagePage/> when it sees them.
  const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), { headers: request.headers }))
  const payload = JSON.stringify(outage).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ' ')
  const res = new HTMLRewriter()
    .on('head', { element(el) { el.append(`<script>window.__PF_OUTAGE__=${payload}</script>`, { html: true }) } })
    .transform(shell)
  const out = new Response(res.body, { status: 503, headers: res.headers })
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
  out.headers.delete('ETag')
  return out
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    const isApi = pathname.startsWith('/api/')
    // Kill switch (Cloudflare Flagship `site-outage`). Static files (paths with an extension), the public
    // /fun arcade bypass it; every other page and all /api/* calls is replaced by the outage page / 503.
    const isStaticFile = /\.[a-z0-9]+$/i.test(pathname) && !/\.html?$/i.test(pathname) // .html is the app shell, so it is gated like a page
    const isPage = !isApi && !isStaticFile && pathname !== '/fun' && pathname !== '/fun/'
    if (isApi || isPage) {
      const outage = await getOutage(env, request)
      if (outage) return outageResponse(env, request, outage, isApi)
    }
    if (!isApi) return env.ASSETS.fetch(request)
    try {
      const characters = await handleCharacters(request, env)
      if (characters) return characters
      if (pathname === '/api/auth/login' && request.method === 'GET') return await login(env, request)
      if (pathname === '/api/auth/callback' && request.method === 'GET') return await callback(env, request)
      if (pathname === '/api/auth/logout' && request.method === 'POST')
        return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, SESSION_COOKIE, '', 0) })
      if (pathname === '/api/me' && request.method === 'GET') {
        const user = await session(env, request)
        if (!user) return json({ user: null })
        const usage = await env.ACCESS.getPixelForgeUsage(user.sub).catch(() => null)
        return json({ user: { name: user.name ?? null }, usage })
      }
      if (pathname === '/api/generate/sprite' && request.method === 'POST') return await generate(env, request, 'sprite')
      if (pathname === '/api/generate/animation' && request.method === 'POST') return await generate(env, request, 'animation')
      return json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error(JSON.stringify({ event: 'unhandled', path: pathname, message: err instanceof Error ? err.message : String(err) }))
      return json({ error: 'Service unavailable' }, 503)
    }
  },
} satisfies ExportedHandler<Env>
