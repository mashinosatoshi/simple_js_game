import { describe, expect, it } from 'vitest';
import { formatClock, formatPlace } from './format';

describe('format', () => {
  it('formatClock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(125)).toBe('2:05');
  });

  it('formatPlace', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(formatPlace)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
  });
});
