import { areStringArraysEqual } from '@/common/utils/array.utils';

describe('areStringArraysEqual', () => {
  it('returns true for equal arrays', () => {
    expect(areStringArraysEqual([], [])).toBe(true);
    expect(areStringArraysEqual(['a'], ['a'])).toBe(true);
    expect(areStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns false for different lengths', () => {
    expect(areStringArraysEqual(['a'], [])).toBe(false);
    expect(areStringArraysEqual([], ['a'])).toBe(false);
    expect(areStringArraysEqual(['a', 'b'], ['a'])).toBe(false);
  });

  it('returns false for same length, different elements', () => {
    expect(areStringArraysEqual(['a'], ['b'])).toBe(false);
    expect(areStringArraysEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});
