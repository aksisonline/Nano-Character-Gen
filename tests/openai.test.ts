import { describe, expect, test } from 'bun:test'
import { buildResponsesBody, isUsageLimit, openaiSize, readResponsesStream } from '../worker/openai'
import { openaiAvailable } from '../worker/account'
import type { Env, LinkedAccount } from '../worker/env'

const stream = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(x)); c.close() } })
const sse = (o: object) => `data: ${JSON.stringify(o)}\n\n`
const img = { type: 'image_generation_call', result: 'QUJD' }

describe('readResponsesStream', () => {
  test('returns the image only after response.completed', async () => {
    const r = await readResponsesStream(stream(sse({ type: 'response.output_item.done', item: img }), sse({ type: 'response.completed', response: { output: [img] } })))
    expect(r).toEqual({ kind: 'image', image: 'data:image/png;base64,QUJD' })
  })
  test('an image seen but never completed is an interrupted stream, not a success', async () => {
    expect((await readResponsesStream(stream(sse({ type: 'response.output_item.done', item: img })))).kind).toBe('interrupted')
  })
  test('handles events split across chunks and CRLF', async () => {
    const full = sse({ type: 'response.completed', response: { output: [img] } }).replace(/\n/g, '\r\n')
    const r = await readResponsesStream(stream(full.slice(0, 17), full.slice(17)))
    expect(r.kind).toBe('image')
  })
  test('response.failed carries the documented usage-limit code', async () => {
    const r = await readResponsesStream(stream(sse({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'x' } } })))
    expect(r).toMatchObject({ kind: 'failed', code: 'subscription_sharing_usage_limit_exceeded' })
    expect(isUsageLimit((r as any).code)).toBe(true)
    expect(isUsageLimit('server_error')).toBe(false)
  })
  test('incomplete and empty completions', async () => {
    expect((await readResponsesStream(stream(sse({ type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } })))))
      .toEqual({ kind: 'incomplete', reason: 'content_filter' })
    expect((await readResponsesStream(stream(sse({ type: 'response.completed', response: { output: [] } })))).kind).toBe('empty')
  })
  test('ignores malformed data lines', async () => {
    const r = await readResponsesStream(stream('data: {nope\n\n', 'data: [DONE]\n\n', sse({ type: 'response.completed', response: { output: [img] } })))
    expect(r.kind).toBe('image')
  })
})

describe('request shape', () => {
  test('uses only parameters the plan route accepts', () => {
    const b = buildResponsesBody('m', 'draw', 'AAAA', '2:3') as any
    expect(b.store).toBe(false)
    expect(b.stream).toBe(true)
    expect(b.input.some((i: any) => i.role === 'system')).toBe(false)
    for (const k of ['max_output_tokens', 'temperature', 'previous_response_id', 'background', 'metadata', 'user']) expect(k in b).toBe(false)
    expect(b.input[0].content[1].image_url).toBe('data:image/png;base64,AAAA')
    expect(buildResponsesBody('m', 'draw', undefined, '2:3').input[0].content).toHaveLength(1)
  })
  test('maps pipeline aspect ratios to a supported canvas', () => {
    expect(openaiSize('2:3')).toBe('1024x1536')
    expect(openaiSize('3:4')).toBe('1024x1536')
    expect(openaiSize('1:1')).toBe('1024x1024')
    expect(openaiSize('4:3')).toBe('1536x1024')
    expect(openaiSize('16:9')).toBe('1536x1024')
    expect(openaiSize('9:16')).toBe('1024x1536')
    expect(openaiSize('junk')).toBe('1024x1024')
  })
})

describe('openaiAvailable', () => {
  const link = (over: Partial<LinkedAccount['capabilities']> = {}, status: LinkedAccount['status'] = 'active'): LinkedAccount =>
    ({ provider: 'openai', label: 'a@b.c', linkedAt: '2026-11-11T00:00:00Z', status, capabilities: { identity: true, planUsage: true, imageGeneration: true, ...over } })
  const env = (model?: string) => ({ OPENAI_IMAGE_MODEL: model }) as Env
  test('needs a model, a link, active status and image capability', () => {
    expect(openaiAvailable(env('m'), [link()])).toBe(true)
    expect(openaiAvailable(env(undefined), [link()])).toBe(false)
    expect(openaiAvailable(env('m'), null)).toBe(false)
    expect(openaiAvailable(env('m'), [])).toBe(false)
    expect(openaiAvailable(env('m'), [link({ imageGeneration: false })])).toBe(false)
    expect(openaiAvailable(env('m'), [link({}, 'reauth_required')])).toBe(false)
  })
})
