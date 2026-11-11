import { describe, expect, test } from 'bun:test';
import { isMagentaLikeHex, isKeyLikeHex } from '../services/imageProcessingService';

describe('key-color display test', () => {
  test('hides near-pure magenta leftovers', () => {
    expect(isMagentaLikeHex('#ff00ff')).toBe(true);
    expect(isMagentaLikeHex('#f804f6')).toBe(true);
  });
  test('keeps pink hair, slime green and other real colors visible', () => {
    for (const hex of ['#f59ac4', '#e0408f', '#00ff00', '#2bd12b', '#5ac85a', '#1f9d8f', '#000000'])
      expect(isMagentaLikeHex(hex)).toBe(false);
    expect(isKeyLikeHex('#00ff00')).toBe(false);
  });
});
