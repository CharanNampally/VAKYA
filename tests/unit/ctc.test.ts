import { describe, expect, it } from 'vitest';
import { decodeCtc } from '../../public/asr/ctc';

function scores(path: number[]) {
  const data = new Float32Array(path.length * 257).fill(-10);
  path.forEach((token, frame) => { data[frame * 257 + token] = 1; });
  return data;
}

describe('Sanskrit blank-first CTC', () => {
  const vocab = { 0: '<blank>', 1: '▁न', 2: 'म', 3: 'स्ते', 4: '<unk>' };
  it('collapses adjacent repeats but preserves repeats separated by blank', () => {
    const path = [0, 1, 1, 0, 1, 2, 2, 3, 0];
    expect(decodeCtc(scores(path), [1, path.length, 257], vocab)).toBe('न नमस्ते');
  });
  it('returns empty text for blank-only audio', () => {
    expect(decodeCtc(scores([0, 0]), [1, 2, 257], vocab)).toBe('');
  });
  it('rejects invalid dimensions and incomplete vocabulary', () => {
    expect(() => decodeCtc(scores([1]), [1, 1, 256], vocab)).toThrow('dimensions');
    expect(() => decodeCtc(scores([9]), [1, 1, 257], vocab)).toThrow('vocabulary');
  });
  it('does not silently remove unknown speech', () => {
    expect(() => decodeCtc(scores([4]), [1, 1, 257], vocab)).toThrow('could not recognize');
  });
});
