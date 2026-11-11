// Pure classification of a Gemini generateContent response.
const BLOCKED_FINISH = new Set([
  'PROHIBITED_CONTENT', 'SAFETY', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION',
])

export type GeminiResult =
  | { kind: 'image'; image: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'empty' }

export function classifyGeminiResponse(data: any): GeminiResult {
  const cand = data?.candidates?.[0]
  for (const p of cand?.content?.parts ?? []) {
    const d = p?.inlineData ?? p?.inline_data
    if (d?.data) return { kind: 'image', image: `data:${d.mimeType ?? d.mime_type};base64,${d.data}` }
  }
  const finish = cand?.finishReason
  if (typeof finish === 'string' && BLOCKED_FINISH.has(finish)) return { kind: 'blocked', reason: finish }
  const block = data?.promptFeedback?.blockReason
  if (block) return { kind: 'blocked', reason: String(block) }
  return { kind: 'empty' }
}

// Token usage and estimated cost (USD) from usageMetadata, at Nano Banana 2.1 list rates per 1M tokens:
// input $1.50, text+thinking output $7.50, image output $30.
export interface GeminiUsage {
  promptTokens: number; imageTokens: number; textTokens: number; thinkingTokens: number; costUsd: number
}
export function geminiUsage(data: any): GeminiUsage {
  const u = data?.usageMetadata ?? {}
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const total = n(u.candidatesTokenCount)
  const imageTokens = (u.candidatesTokensDetails ?? []).filter((d: any) => d?.modality === 'IMAGE').reduce((a: number, d: any) => a + n(d?.tokenCount), 0)
  const thinkingTokens = n(u.thoughtsTokenCount)
  const textTokens = Math.max(0, total - imageTokens)
  const promptTokens = n(u.promptTokenCount)
  const costUsd = (promptTokens * 1.5 + (textTokens + thinkingTokens) * 7.5 + imageTokens * 30) / 1e6
  return { promptTokens, imageTokens, textTokens, thinkingTokens, costUsd: Math.round(costUsd * 1e6) / 1e6 }
}
