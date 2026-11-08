/// <reference types="@cloudflare/workers-types" />
// PixelForge API Worker: AKS sign-in (OIDC code + PKCE), per-account quota via ACCESS, Gemini proxy.
// The Gemini key never reaches the browser.
import { ASPECT_RATIOS, buildAnimationPrompt, buildSpritePrompt } from '../shared/prompts'

interface AccessRpc {
  reservePixelForge(userId: string, turnId: string, kind: 'sprite' | 'animation'): Promise<{
    allowed: boolean; reason?: string; remaining: number; resetsAt: string; reservationId?: string
  }>
  finishPixelForge(userId: string, turnId: string, reservationId: string, succeeded: boolean): Promise<void>
  getPixelForgeUsage(userId: string): Promise<{ limit: number; remaining: number; resetsAt: string }>
}
interface Env {
  ASSETS: Fetcher
  ACCESS: AccessRpc
  GEMINI_API_KEY: string
  SESSION_SECRET: string
  OIDC_CLIENT_SECRET: string
  OIDC_ISSUER: string
  OIDC_CLIENT_ID: string
  MODEL_NAME: string
}

const SESSION_COOKIE = 'pf_session'
const FLOW_COOKIE = 'pf_flow'
const SESSION_TTL = 7 * 86_400
const enc = new TextEncoder()
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
async function sign(env: Env, payload: object) {
  if (!env.SESSION_SECRET || enc.encode(env.SESSION_SECRET).length < 32) throw new Error('weak secret')
  const body = b64u(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(body))
  return `${body}.${b64u(sig)}`
}
async function verify<T extends { exp: number }>(env: Env, token: string | undefined): Promise<T | null> {
  if (!token || !env.SESSION_SECRET) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), unb64u(sig), enc.encode(body))
    if (!ok) return null
    const data = JSON.parse(new TextDecoder().decode(unb64u(body))) as T
    return data.exp > Date.now() / 1000 ? data : null
  } catch { return null }
}
function cookie(request: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:'
  return `${secure ? '__Host-' : ''}${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}
function readCookie(request: Request, name: string) {
  const secure = new URL(request.url).protocol === 'https:'
  const key = `${secure ? '__Host-' : ''}${name}=`
  return request.headers.get('Cookie')?.split(/;\s*/).find(c => c.startsWith(key))?.slice(key.length)
}
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)))

async function session(env: Env, request: Request) {
  return verify<{ sub: string; name?: string; exp: number }>(env, readCookie(request, SESSION_COOKIE))
}

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

async function callback(env: Env, request: Request) {
  const url = new URL(request.url)
  const flow = await verify<{ state: string; verifier: string; exp: number }>(env, readCookie(request, FLOW_COOKIE))
  const code = url.searchParams.get('code')
  if (!flow || !code || url.searchParams.get('state') !== flow.state) return json({ error: 'Invalid sign-in state' }, 400)
  const res = await fetch(`${env.OIDC_ISSUER}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.OIDC_CLIENT_ID}:${env.OIDC_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: flow.verifier,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  })
  if (!res.ok) return json({ error: 'Sign-in failed' }, 502)
  const { access_token } = await res.json<{ access_token?: string }>()
  if (!access_token) return json({ error: 'Sign-in failed' }, 502)
  // Identity comes from the issuer's userinfo endpoint over the back channel, not from client-parsed tokens.
  const info = await fetch(`${env.OIDC_ISSUER}/oauth2/userinfo`, { headers: { Authorization: `Bearer ${access_token}` } })
  const claims = info.ok ? await info.json<{ sub?: string; name?: string }>() : {}
  if (!claims.sub) return json({ error: 'Sign-in failed' }, 502)
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
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
