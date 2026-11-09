// @ts-nocheck — runs under `bun test`; not part of the app/worker type-check.
import { describe, expect, test } from 'bun:test'
import worker from '../worker/index'
import { sign } from '../worker/session'
import { SPRITE_PIXELS, packPixels, unpackPixels, validateCharacterDoc } from '../shared/character'

const SECRET = 'x'.repeat(40)
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// In-memory stand-in for AccessService: one private store per userId, like the per-user Durable Object.
function fakeAccess() {
  const stores = new Map<string, Map<string, any>>()
  const calls: string[][] = []
  const store = (u: string) => { if (!stores.has(u)) stores.set(u, new Map()); return stores.get(u)! }
  return {
    stores, calls,
    async listPixelForgeCharacters(u) { calls.push(['list', u]); return [...store(u).values()].map(({ id, name, updatedAt, bytes }) => ({ id, name, updatedAt, bytes })) },
    async getPixelForgeStorageUsage(u) { return { items: store(u).size, bytes: 0, maxItems: 40, maxBytes: 1, maxItemBytes: 1 } },
    async getPixelForgeCharacter(u, id) { calls.push(['get', u, id]); return store(u).get(id) ?? null },
    async putPixelForgeCharacter(u, id, name, doc, baseRev) {
      calls.push(['put', u, id])
      const s = store(u), cur = s.get(id)
      if (baseRev === null) { if (cur) return { ok: false, reason: 'exists' } }
      else { if (!cur) return { ok: false, reason: 'not_found' }; if (cur.rev !== baseRev) return { ok: false, reason: 'conflict', currentRev: cur.rev } }
      const rev = (cur?.rev ?? 0) + 1
      s.set(id, { id, name, doc, rev, updatedAt: 1, bytes: doc.length })
      return { ok: true, rev, updatedAt: 1 }
    },
    async deletePixelForgeCharacter(u, id) { calls.push(['delete', u, id]); return store(u).delete(id) },
    async duplicatePixelForgeCharacter(u, id, newId, newName) {
      const cur = store(u).get(id); if (!cur) return { ok: false, reason: 'not_found' }
      store(u).set(newId, { ...cur, id: newId, name: newName, rev: 1 }); return { ok: true, rev: 1, updatedAt: 1 }
    },
  }
}

const doc = (over = {}) => ({
  v: 1, name: 'Hero', prompt: 'a knight', palette: [null, '#000000', '#ffffff'],
  pixels: packPixels(new Array(SPRITE_PIXELS).fill(1), 3), animations: [], ...over,
})

async function call(env, method, path, { user, body, raw, headers = {} } = {}) {
  const h = new Headers(headers)
  if (user) h.set('Cookie', `pf_session=${await sign(env, { sub: user, name: 'T', exp: Math.floor(Date.now() / 1000) + 600 })}`)
  if (body !== undefined) h.set('Content-Type', 'application/json')
  return worker.fetch(new Request(`http://localhost${path}`, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) }), env)
}
const mk = () => { const access = fakeAccess(); return { env: { SESSION_SECRET: SECRET, ACCESS: access, ASSETS: { fetch: async () => new Response('x') } }, access } }

describe('authentication (deny by default)', () => {
  for (const [method, path] of [['GET', '/api/characters'], ['GET', `/api/characters/${ID}`], ['PUT', `/api/characters/${ID}`], ['DELETE', `/api/characters/${ID}`], ['POST', `/api/characters/${ID}/duplicate`]]) {
    test(`${method} ${path} without a session is 401 and never reaches storage`, async () => {
      const { env, access } = mk()
      const res = await call(env, method, path, { body: method === 'PUT' || method === 'POST' ? {} : undefined })
      expect(res.status).toBe(401)
      expect(access.calls.length).toBe(0)
    })
  }
  test('tampered session cookie is 401', async () => {
    const { env, access } = mk()
    const good = await sign(env, { sub: A, exp: Math.floor(Date.now() / 1000) + 600 })
    const [body, sig] = good.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: B, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')
    for (const token of [`${forged}.${sig}`, `${body}.${sig.slice(0, -2)}AA`, 'garbage']) {
      const res = await worker.fetch(new Request('http://localhost/api/characters', { headers: { Cookie: `pf_session=${token}` } }), env)
      expect(res.status).toBe(401)
    }
    expect(access.calls.length).toBe(0)
  })
  test('expired session is 401', async () => {
    const { env } = mk()
    const token = await sign(env, { sub: A, exp: Math.floor(Date.now() / 1000) - 5 })
    const res = await worker.fetch(new Request('http://localhost/api/characters', { headers: { Cookie: `pf_session=${token}` } }), env)
    expect(res.status).toBe(401)
  })
  test('session signed with another secret is 401', async () => {
    const { env } = mk()
    const token = await sign({ SESSION_SECRET: 'y'.repeat(40) }, { sub: A, exp: Math.floor(Date.now() / 1000) + 600 })
    const res = await worker.fetch(new Request('http://localhost/api/characters', { headers: { Cookie: `pf_session=${token}` } }), env)
    expect(res.status).toBe(401)
  })
})

describe('ownership matrix', () => {
  test('owner can create, read, update, list, duplicate, delete', async () => {
    const { env } = mk()
    expect((await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null } })).status).toBe(200)
    const read = await (await call(env, 'GET', `/api/characters/${ID}`, { user: A })).json()
    expect(read.rev).toBe(1); expect(read.doc.name).toBe('Hero')
    expect((await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc({ name: 'Hero 2' }), baseRev: 1 } })).status).toBe(200)
    const list = await (await call(env, 'GET', '/api/characters', { user: A })).json()
    expect(list.items.map((i) => i.name)).toEqual(['Hero 2'])
    const dup = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    expect((await call(env, 'POST', `/api/characters/${ID}/duplicate`, { user: A, body: { newId: dup, newName: 'Copy' } })).status).toBe(200)
    expect((await call(env, 'DELETE', `/api/characters/${ID}`, { user: A })).status).toBe(200)
    expect((await call(env, 'GET', `/api/characters/${ID}`, { user: A })).status).toBe(404)
  })

  test("another user gets 404 (not 403) for every operation on someone else's id, and changes nothing", async () => {
    const { env, access } = mk()
    await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null } })
    const before = JSON.stringify([...access.stores.get(A)])
    expect((await call(env, 'GET', `/api/characters/${ID}`, { user: B })).status).toBe(404)
    expect((await call(env, 'PUT', `/api/characters/${ID}`, { user: B, body: { doc: doc({ name: 'Hacked' }), baseRev: 1 } })).status).toBe(404)
    expect((await call(env, 'DELETE', `/api/characters/${ID}`, { user: B })).status).toBe(404)
    expect((await call(env, 'POST', `/api/characters/${ID}/duplicate`, { user: B, body: { newId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', newName: 'x' } })).status).toBe(404)
    expect((await (await call(env, 'GET', '/api/characters', { user: B })).json()).items).toEqual([])
    expect(JSON.stringify([...access.stores.get(A)])).toBe(before)
  })

  test('the user id is never taken from the client', async () => {
    const { env, access } = mk()
    await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null } })
    // body/query/header smuggling attempts as user B must not reach A's data
    const smuggle = await call(env, 'GET', `/api/characters/${ID}?sub=${A}&userId=${A}`, { user: B, headers: { 'X-User-Id': A, 'X-Sub': A } })
    expect(smuggle.status).toBe(404)
    const extra = await call(env, 'PUT', `/api/characters/${ID}`, { user: B, body: { doc: doc(), baseRev: null, sub: A, userId: A } })
    expect(extra.status).toBe(400) // unknown body fields are rejected
    expect(access.calls.every(([, u]) => u === B || u === A)).toBe(true)
    expect(access.calls.filter(([op, u]) => u === B && ['put'].includes(op)).length).toBe(0)
  })

  test('malformed and tampered ids are indistinguishable from missing ones', async () => {
    const { env, access } = mk()
    for (const id of ['1', 'not-a-uuid', '..%2f..%2fetc%2fpasswd', `${ID}%00`, ID.toUpperCase().replace(/A/g, 'G'), '%2e%2e']) {
      const res = await call(env, 'GET', `/api/characters/${id}`, { user: A })
      expect(res.status).toBe(404)
    }
    expect(access.calls.filter((c) => c[0] === 'get').length).toBe(0)
  })

  test('cross-origin state changes are rejected', async () => {
    const { env } = mk()
    const res = await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null }, headers: { Origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
  })

  test('revision conflict is surfaced, not silently overwritten', async () => {
    const { env } = mk()
    await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null } })
    const res = await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: 7 } })
    expect(res.status).toBe(409)
    expect((await res.json()).currentRev).toBe(1)
  })
})

describe('validation', () => {
  const put = (env, d, baseRev = null) => call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: d, baseRev } })
  test('rejects unknown fields, bad shapes and out-of-range data', async () => {
    const { env } = mk()
    const cases = [
      doc({ extra: 1 }), doc({ v: 2 }), doc({ name: '' }), doc({ name: 'x'.repeat(81) }), doc({ prompt: 'x'.repeat(601) }),
      doc({ palette: [] }), doc({ palette: ['red'] }), doc({ palette: new Array(37).fill('#000000') }),
      doc({ pixels: 'a'.repeat(10) }), doc({ pixels: 'z'.repeat(SPRITE_PIXELS) }), // index beyond palette
      doc({ animations: new Array(13).fill(0).map((_, i) => ({ id: `a${i}`, name: 'n', prompt: '', frameCount: 1, fps: 8, loop: true, frames: [] })) }),
      doc({ animations: [{ id: 'a', name: 'n', prompt: '', frameCount: 1, fps: 8, loop: true, frames: [], extra: 1 }] }),
      doc({ animations: [{ id: 'a', name: 'n', prompt: '', frameCount: 1, fps: 0, loop: true, frames: [] }] }),
      doc({ animations: [{ id: 'a', name: 'n', prompt: '', frameCount: 1, fps: 8, loop: true, frames: ['bad'] }] }),
      'string', null, [],
    ]
    for (const c of cases) expect((await put(env, c)).status).toBe(400)
  })
  test('rejects oversize bodies and invalid JSON', async () => {
    const { env } = mk()
    expect((await call(env, 'PUT', `/api/characters/${ID}`, { user: A, raw: 'x'.repeat(130_000), headers: { 'Content-Type': 'application/json' } })).status).toBe(400)
    expect((await call(env, 'PUT', `/api/characters/${ID}`, { user: A, raw: '{nope' })).status).toBe(400)
  })
  test('pack/unpack round trips', () => {
    const px = Array.from({ length: SPRITE_PIXELS }, (_, i) => i % 24)
    expect(unpackPixels(packPixels(px, 24))).toEqual(px)
    expect(validateCharacterDoc(doc({ palette: new Array(24).fill('#112233'), pixels: packPixels(px, 24) })).ok).toBe(true)
  })
})

describe('storage errors', () => {
  test('store limit and rate-limit results map to HTTP codes with Retry-After', async () => {
    const { env, access } = mk()
    access.putPixelForgeCharacter = async () => ({ ok: false, reason: 'rate_limit', retryAfterMs: 4200 })
    const res = await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null } })
    expect(res.status).toBe(429); expect(res.headers.get('Retry-After')).toBe('5')
    access.putPixelForgeCharacter = async () => ({ ok: false, reason: 'storage_limit' })
    expect((await call(env, 'PUT', `/api/characters/${ID}`, { user: A, body: { doc: doc(), baseRev: null } })).status).toBe(409)
  })
  test('storage outage is 503 and leaks nothing', async () => {
    const { env, access } = mk()
    access.listPixelForgeCharacters = async () => { throw new Error('secret internal detail') }
    const res = await call(env, 'GET', '/api/characters', { user: A })
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('secret')
  })
})
