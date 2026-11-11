import { can, roleFor, type Action } from './authz'
import type { Env, PutResult } from './env'
import { json, session } from './session'
import { log } from './log'
import { UUID, validateCharacterDoc } from '../shared/character'

const MAX_BODY = 120_000 // bytes; the store enforces its own (smaller) per-item and per-user caps too
const NOT_FOUND = () => json({ error: 'Not found' }, 404)

const STATUS: Record<string, number> = {
  exists: 409, conflict: 409, not_found: 404, too_large: 413, item_limit: 409, storage_limit: 409, rate_limit: 429, invalid: 400,
}
const putResponse = (r: PutResult) => 'reason' in r
  ? json({ error: r.reason, currentRev: r.currentRev, retryAfterMs: r.retryAfterMs }, STATUS[r.reason] ?? 400,
      r.retryAfterMs ? { 'Retry-After': String(Math.ceil(r.retryAfterMs / 1000)) } : {})
  : json({ rev: r.rev, updatedAt: r.updatedAt })

async function readJson(request: Request): Promise<unknown | undefined> {
  const text = await request.text()
  if (text.length > MAX_BODY) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

/** Handles /api/characters*. Returns null when the path is not ours. */
export async function handleCharacters(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url)
  const m = /^\/api\/characters(?:\/([^/]+))?(?:\/(duplicate))?\/?$/.exec(url.pathname)
  if (!m) return null
  const [, rawId, sub] = m
  const method = request.method

  let action: Action | null = null
  if (!rawId && method === 'GET') action = 'character:list'
  else if (rawId && !sub && method === 'GET') action = 'character:read'
  else if (rawId && !sub && method === 'PUT') action = 'character:update' // also creates (baseRev null); checked below
  else if (rawId && !sub && method === 'DELETE') action = 'character:delete'
  else if (rawId && sub === 'duplicate' && method === 'POST') action = 'character:duplicate'
  if (!action) return json({ error: 'Method not allowed' }, 405)

  // Deny by default: unauthenticated, expired or tampered sessions have no principal.
  const principal = roleFor(await session(env, request))
  if (!can(principal, action)) return json({ error: 'Sign in required' }, 401)

  // Same-origin only for state changes (cookies are SameSite=Lax; this is defense in depth).
  if (method !== 'GET') {
    const origin = request.headers.get('Origin')
    if (origin && origin !== url.origin) return json({ error: 'Bad origin' }, 403)
  }

  const sub_ = principal.sub // the only user identity used below; never read from the body or query
  const access = env.ACCESS
  try {
    if (action === 'character:list') {
      const [items, usage] = await Promise.all([access.listPixelForgeCharacters(sub_), access.getPixelForgeStorageUsage(sub_)])
      return json({ items, usage })
    }
    if (!UUID.test(rawId!)) return NOT_FOUND() // malformed ids are indistinguishable from missing ones
    const id = rawId!.toLowerCase()

    if (action === 'character:read') {
      const row = await access.getPixelForgeCharacter(sub_, id)
      if (!row) return NOT_FOUND()
      let doc: unknown
      try { doc = JSON.parse(row.doc) } catch { return json({ error: 'Stored data is unreadable' }, 500) }
      return json({ id: row.id, rev: row.rev, updatedAt: row.updatedAt, doc })
    }
    if (action === 'character:delete') {
      const removed = await access.deletePixelForgeCharacter(sub_, id)
      return removed ? json({ ok: true }) : NOT_FOUND()
    }
    const body = await readJson(request)
    if (action === 'character:duplicate') {
      const b = body as { newId?: unknown; newName?: unknown } | undefined
      if (!b || typeof b.newId !== 'string' || !UUID.test(b.newId) || typeof b.newName !== 'string'
        || b.newName.length < 1 || b.newName.length > 80) return json({ error: 'invalid' }, 400)
      return putResponse(await access.duplicatePixelForgeCharacter(sub_, id, b.newId.toLowerCase(), b.newName))
    }
    // PUT: { doc, baseRev: number | null }; null creates, a number updates that exact revision.
    const b = body as { doc?: unknown; baseRev?: unknown } | undefined
    if (!b || typeof b !== 'object' || Object.keys(b).some((k) => k !== 'doc' && k !== 'baseRev')) return json({ error: 'invalid' }, 400)
    if (b.baseRev !== null && !(typeof b.baseRev === 'number' && Number.isInteger(b.baseRev) && b.baseRev >= 1)) return json({ error: 'invalid' }, 400)
    if (b.baseRev === null && !can(principal, 'character:create')) return json({ error: 'Forbidden' }, 403)
    const v = validateCharacterDoc(b.doc)
    if ('error' in v) return json({ error: 'invalid', field: v.error }, 400)
    return putResponse(await access.putPixelForgeCharacter(sub_, id, v.doc.name, JSON.stringify(v.doc), b.baseRev as number | null))
  } catch {
    log('error', 'characters_unavailable', { action })
    return json({ error: 'Storage unavailable' }, 503)
  }
}
