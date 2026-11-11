// Structured JSON logs for Cloudflare Workers Logs (observability enabled in wrangler.jsonc).
// One JSON object per line; query by `event` in the dashboard. Never log secrets, cookies, images or full prompts.
type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

export function log(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ event, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

// Short non-reversible tag so one user's events can be correlated without writing their id to logs.
export async function userTag(sub: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub))
  return [...new Uint8Array(d).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Prompt text only goes to logs when the provider refused it, truncated, so refusals can be reviewed.
export const snippet = (s: unknown, n = 160) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').slice(0, n) : undefined)
