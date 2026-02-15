import { resolveBooleanFlag } from '@/common/utils/config.utils';

describe('resolveBooleanFlag', () => {
  it('returns value when boolean', () => {
    expect(resolveBooleanFlag(true, false)).toBe(true);
    expect(resolveBooleanFlag(false, true)).toBe(false);
  });

  it('returns fallback when undefined', () => {
    expect(resolveBooleanFlag(undefined, true)).toBe(true);
    expect(resolveBooleanFlag(undefined, false)).toBe(false);
  });

  it('parses true-like strings (case-insensitive)', () => {
    expect(resolveBooleanFlag('true', false)).toBe(true);
    expect(resolveBooleanFlag('TRUE', false)).toBe(true);
    expect(resolveBooleanFlag('1', false)).toBe(true);
    expect(resolveBooleanFlag('yes', false)).toBe(true);
    expect(resolveBooleanFlag('  true  ', false)).toBe(true);
  });

  it('parses false-like strings (case-insensitive)', () => {
    expect(resolveBooleanFlag('false', true)).toBe(false);
    expect(resolveBooleanFlag('0', true)).toBe(false);
    expect(resolveBooleanFlag('no', true)).toBe(false);
    expect(resolveBooleanFlag('  NO  ', true)).toBe(false);
  });

  it('returns fallback for unrecognized string', () => {
    expect(resolveBooleanFlag('maybe', true)).toBe(true);
    expect(resolveBooleanFlag('maybe', false)).toBe(false);
    expect(resolveBooleanFlag('', true)).toBe(true);
  });
});
