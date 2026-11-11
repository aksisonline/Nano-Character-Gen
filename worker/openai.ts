// Image generation on a user's own linked OpenAI plan (Responses API, streaming, store:false).
// Only reachable when AKS-Access reports `imageGeneration` for the link AND OPENAI_IMAGE_MODEL is set: OpenAI's plan-usage
// route currently lists image generation as unsupported (https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations),
// so this path is written to the documented request/stream shapes but has NOT been exercised against the live API.
import type { Env } from './env'

export const RESPONSES_URL = 'https://api.openai.com/v1/responses'

export type OpenAIResult =
  | { kind: 'image'; image: string }
  | { kind: 'failed'; code?: string; message?: string }
  | { kind: 'incomplete'; reason?: string }
  | { kind: 'interrupted' }
  | { kind: 'empty' }

/** Nearest supported canvas for the aspect ratios the pipeline asks for ('2:3', '3:4', '1:1', '4:3', '16:9', '9:16'). */
export function openaiSize(aspectRatio: string): '1024x1024' | '1536x1024' | '1024x1536' {
  const [w, h] = aspectRatio.split(':').map(Number)
  const r = w / h
  if (!Number.isFinite(r)) return '1024x1024'
  return r > 1.15 ? '1536x1024' : r < 0.87 ? '1024x1536' : '1024x1024'
}

export function buildResponsesBody(model: string, text: string, imageB64: string | undefined, aspectRatio: string) {
  const content: unknown[] = [{ type: 'input_text', text }]
  if (imageB64) content.push({ type: 'input_image', image_url: `data:image/png;base64,${imageB64}` })
  return {
    model,
    // No system-role items and no unsupported parameters (max_output_tokens, temperature, …): the plan route rejects them.
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', size: openaiSize(aspectRatio), output_format: 'png' }],
    tool_choice: { type: 'image_generation' },
    store: false,
    stream: true,
  }
}

const imageOf = (item: any): string | null =>
  item?.type === 'image_generation_call' && typeof item.result === 'string' && item.result ? `data:image/png;base64,${item.result}` : null

/** Reads an SSE stream until a terminal event. Success only counts after `response.completed`. */
export async function readResponsesStream(body: ReadableStream<Uint8Array>): Promise<OpenAIResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let image: string | null = null
  const handle = (raw: string): OpenAIResult | null => {
    const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return null
    let ev: any
    try { ev = JSON.parse(data) } catch { return null }
    switch (ev?.type) {
      case 'response.output_item.done': image ??= imageOf(ev.item); return null
      case 'response.completed': {
        for (const item of ev.response?.output ?? []) image ??= imageOf(item)
        return image ? { kind: 'image', image } : { kind: 'empty' }
      }
      case 'response.failed': return { kind: 'failed', code: ev.response?.error?.code, message: ev.response?.error?.message }
      case 'response.incomplete': return { kind: 'incomplete', reason: ev.response?.incomplete_details?.reason }
      case 'error': return { kind: 'failed', code: ev.code ?? ev.error?.code, message: ev.message ?? ev.error?.message }
      default: return null
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const done_ = handle(buf.slice(0, i)); buf = buf.slice(i + 2)
        if (done_) return done_
      }
      if (done) { const last = buf.trim() ? handle(buf) : null; return last ?? { kind: 'interrupted' } }
    }
  } finally { reader.cancel().catch(() => {}) }
}

export type OpenAICall =
  | { ok: true; result: OpenAIResult }
  | { ok: false; status: number; code?: string }

export async function callOpenAI(env: Env, accessToken: string, text: string, imageB64: string | undefined, aspectRatio: string): Promise<OpenAICall> {
  if (!env.OPENAI_IMAGE_MODEL) return { ok: false, status: 501, code: 'no_model' }
  const res = await fetch(RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' },
    body: JSON.stringify(buildResponsesBody(env.OPENAI_IMAGE_MODEL, text, imageB64, aspectRatio)),
  })
  if (!res.ok || !res.body) {
    const err: any = await res.json().catch(() => null)
    return { ok: false, status: res.status, code: err?.error?.code }
  }
  return { ok: true, result: await readResponsesStream(res.body) }
}

/** Failure codes OpenAI documents for exhausted plan usage (arrive as `response.failed` after streaming starts). */
export const isUsageLimit = (code?: string) =>
  code === 'subscription_sharing_usage_limit_exceeded' || code === 'subscription_sharing_usage_unavailable'
