import type { Env } from './env'

export type Outage = { reason?: string; eta?: string; since?: string }

export const OUTAGE_FLAG = 'site-outage'
const TIMEOUT_MS = 500
const MAX_REASON = 300
const MAX_SHORT = 100

function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  // strip control chars, collapse whitespace, truncate
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  return s || undefined
}

/**
 * Reads the `site-outage` JSON flag: { enabled: boolean, reason?, eta?, since? }.
 * Returns null when the site is up. FAILS OPEN: any error, timeout, missing
 * binding or malformed value => null, so a Flagship problem never takes the site down.
 */
export async function getOutage(env: Env, _request?: Request): Promise<Outage | null> {
  if (!env.FLAGS) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const value = await Promise.race<unknown>([
      env.FLAGS.getObjectValue<Record<string, unknown>>(OUTAGE_FLAG, { enabled: false }),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), TIMEOUT_MS) }),
    ])
    if (!value || typeof value !== 'object') return null
    const v = value as Record<string, unknown>
    if (v.enabled !== true) return null
    return {
      reason: clean(v.reason, MAX_REASON),
      eta: clean(v.eta, MAX_SHORT),
      since: clean(v.since, MAX_SHORT),
    }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
