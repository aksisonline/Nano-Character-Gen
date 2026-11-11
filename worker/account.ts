import { can, roleFor, type Action } from './authz'
import type { Env, GenerationSource, LinkedAccount } from './env'
import { json, session } from './session'
import { log } from './log'

const NULL = () => null

/** The OpenAI source is usable only when the backend says the link can generate images AND we have a model configured. */
export function openaiAvailable(env: Env, connections: LinkedAccount[] | null): boolean {
  if (!env.OPENAI_IMAGE_MODEL || !connections) return false
  return connections.some(c => c.provider === 'openai' && c.status === 'active' && c.capabilities.imageGeneration)
}

/**
 * RPC stubs expose every property name as a method, so a backend that predates these calls rejects at call time
 * instead of being feature-detectable. Any failure therefore means "unavailable" (null), never "not linked".
 */
export async function loadConnections(env: Env, sub: string): Promise<LinkedAccount[] | null> {
  try { return await env.ACCESS.listLinkedAccounts!(sub) } catch { return null }
}
export async function loadSource(env: Env, sub: string): Promise<GenerationSource> {
  try { return (await env.ACCESS.getPixelForgeSettings!(sub)).generationSource === 'openai' ? 'openai' : 'aks' } catch { return 'aks' }
}

const accountOrigin = (env: Env) => new URL(env.OIDC_ISSUER).origin

/** Handles /api/account*. Returns null when the path is not ours. */
export async function handleAccount(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url)
  const m = /^\/api\/account(?:\/(settings)|\/connections\/(openai)\/(unlink))?\/?$/.exec(url.pathname)
  if (!m) return null
  const method = request.method
  const action: Action | null =
    !m[1] && !m[2] && method === 'GET' ? 'account:read'
    : m[1] && method === 'PUT' ? 'account:update'
    : m[2] && method === 'POST' ? 'account:unlink' : null
  if (!action) return json({ error: 'Method not allowed' }, 405)

  const principal = roleFor(await session(env, request))
  if (!can(principal, action)) return json({ error: 'Sign in required' }, 401)
  if (method !== 'GET') {
    const origin = request.headers.get('Origin')
    if (origin && origin !== url.origin) return json({ error: 'Bad origin' }, 403)
  }
  const { sub } = principal
  const access = env.ACCESS

  if (action === 'account:read') {
    const user = await session(env, request)
    const [usage, storage, connections, source] = await Promise.all([
      access.getPixelForgeUsage(sub).catch(NULL),
      access.getPixelForgeStorageUsage(sub).catch(NULL),
      loadConnections(env, sub),
      loadSource(env, sub),
    ])
    const available = openaiAvailable(env, connections)
    const base = accountOrigin(env)
    return json({
      user: { name: user?.name ?? null, email: user?.email ?? null },
      usage, storage, connections,
      settings: { generationSource: source === 'openai' && available ? 'openai' : 'aks', openaiAvailable: available },
      links: { manage: `${base}/`, connectOpenai: `${base}/connect/openai?client=pixelforge` },
    })
  }

  if (action === 'account:update') {
    let body: any
    try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    const source = body?.generationSource
    if (source !== 'aks' && source !== 'openai') return json({ error: 'Invalid generationSource' }, 400)
    if (source === 'openai' && !openaiAvailable(env, await loadConnections(env, sub))) return json({ error: 'openai_unavailable' }, 409)
    try { await access.setPixelForgeSettings!(sub, { generationSource: source }) }
    catch (err) { log('error', 'settings_write_failed', { message: err instanceof Error ? err.message : String(err) }); return json({ error: 'Settings unavailable' }, 503) }
    return json({ generationSource: source })
  }

  // account:unlink. Remote revocation and the stored credential are the backend's job; we only ask.
  try {
    const removed = await access.unlinkAccount!(sub, 'openai')
    // A preference for a source that no longer exists must not linger.
    await access.setPixelForgeSettings!(sub, { generationSource: 'aks' }).catch(NULL)
    return json({ ok: true, removed })
  } catch (err) {
    log('error', 'unlink_failed', { message: err instanceof Error ? err.message : String(err) })
    return json({ error: 'Account service unavailable' }, 503)
  }
}
