import type { Env } from './env'

export const SESSION_COOKIE = 'pf_session'
export const FLOW_COOKIE = 'pf_flow'
export const SESSION_TTL = 7 * 86_400
export const enc = new TextEncoder()
export const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
export async function sign(env: Env, payload: object) {
  if (!env.SESSION_SECRET || enc.encode(env.SESSION_SECRET).length < 32) throw new Error('weak secret')
  const body = b64u(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(body))
  return `${body}.${b64u(sig)}`
}
export async function verify<T extends { exp: number }>(env: Env, token: string | undefined): Promise<T | null> {
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
export function cookie(request: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:'
  return `${secure ? '__Host-' : ''}${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}
export function readCookie(request: Request, name: string) {
  const secure = new URL(request.url).protocol === 'https:'
  const key = `${secure ? '__Host-' : ''}${name}=`
  return request.headers.get('Cookie')?.split(/;\s*/).find(c => c.startsWith(key))?.slice(key.length)
}
export const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)))

export async function session(env: Env, request: Request) {
  return verify<{ sub: string; name?: string; email?: string; exp: number }>(env, readCookie(request, SESSION_COOKIE))
}

