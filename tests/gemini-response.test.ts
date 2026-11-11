import { describe, expect, test } from 'bun:test'
import { classifyGeminiResponse } from '../worker/gemini'
import { buildAnimationPrompt, buildSpritePrompt, chooseKeyColor, chooseKeyForPalette } from '../shared/prompts'

const img = { inlineData: { mimeType: 'image/png', data: 'AAAA' } }

describe('classifyGeminiResponse', () => {
  test('image', () => {
    expect(classifyGeminiResponse({ candidates: [{ content: { parts: [{ text: 'x' }, img] } }] }))
      .toEqual({ kind: 'image', image: 'data:image/png;base64,AAAA' })
  })
  test('snake_case inline_data', () => {
    const r = classifyGeminiResponse({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'BB' } }] } }] })
    expect(r).toEqual({ kind: 'image', image: 'data:image/jpeg;base64,BB' })
  })
  test('blocked via finishReason', () => {
    expect(classifyGeminiResponse({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] })).toEqual({ kind: 'blocked', reason: 'PROHIBITED_CONTENT' })
  })
  test('blocked via promptFeedback', () => {
    expect(classifyGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }).kind).toBe('blocked')
  })
  test('empty', () => {
    expect(classifyGeminiResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hi' }] } }] })).toEqual({ kind: 'empty' })
    expect(classifyGeminiResponse({})).toEqual({ kind: 'empty' })
  })
})

describe('key colors', () => {
  test('chooseKeyColor', () => {
    expect(chooseKeyColor('girl with pink hair')).toBe('green')
    expect(chooseKeyColor('brown-haired knight')).toBe('magenta')
  })
  test('chooseKeyForPalette', () => {
    expect(chooseKeyForPalette([null, '#000000', '#ff69b4', '#5a3a22'])).toBe('green')
    expect(chooseKeyForPalette([null, '#008080', '#5a3a22'])).toBe('magenta')
    expect(chooseKeyForPalette([null, '#33cc33', '#228b22'])).toBe('magenta')
  })
})

describe('prompts', () => {
  test('sprite prompt', () => {
    const p = buildSpritePrompt('knight', 'green')
    expect(p).not.toContain('3x3')
    expect(p).toContain('GREEN')
    expect(p).toContain('NO SHADOWS')
  })
  test('animation prompt includes key', () => {
    const a = { name: 'walk', prompt: 'walks', frameCount: 4, columns: 2, rows: 2 }
    expect(buildAnimationPrompt(a, 'green')).toContain('GREEN')
    expect(buildAnimationPrompt(a)).toContain('MAGENTA')
  })
})

import { geminiUsage } from '../worker/gemini'
describe('geminiUsage', () => {
  test('cost from usageMetadata', () => {
    const u = geminiUsage({ usageMetadata: { promptTokenCount: 294, candidatesTokenCount: 1629, thoughtsTokenCount: 1059,
      candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }] } })
    expect(u.imageTokens).toBe(1120); expect(u.textTokens).toBe(509)
    expect(u.costUsd).toBeCloseTo(0.0458, 3)
  })
  test('missing metadata is zero', () => { expect(geminiUsage({}).costUsd).toBe(0) })
})
