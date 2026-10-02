import { describe, expect, test } from 'vitest';
import { calcCgpa, calcSemester, formatGp } from '@frequency/shared/calc';

describe('calcSemester', () => {
  test('computes GP as quality points over units', () => {
    const r = calcSemester([
      { code: 'CSC 101', units: 3, grade: 'A' },
      { code: 'MTH 111', units: 3, grade: 'B' }
    ]);
    expect(r.totalUnits).toBe(6);
    expect(r.totalPoints).toBe(27);
    expect(r.gp).toBeCloseTo(4.5, 10);
  });

  test('accepts lowercase grades', () => {
    const r = calcSemester([{ code: 'PHY 101', units: 2, grade: 'c' }]);
    expect(r.gp).toBeCloseTo(3, 10);
  });

  test('returns null GP when there are no courses', () => {
    expect(calcSemester([])).toEqual({ totalUnits: 0, totalPoints: 0, gp: null });
  });

  test('rejects unknown grades instead of guessing', () => {
    expect(() => calcSemester([{ code: 'CSC 101', units: 3, grade: 'Z' }])).toThrow();
  });

  test('rejects invalid units instead of calculating', () => {
    expect(() => calcSemester([{ code: 'CSC 101', units: 0, grade: 'A' }])).toThrow();
    expect(() => calcSemester([{ code: 'CSC 101', units: 2.5, grade: 'A' }])).toThrow();
    expect(() => calcSemester([{ code: 'CSC 101', units: 21, grade: 'A' }])).toThrow();
  });

  test('handles a 20-unit course in GPA math', () => {
    const r = calcSemester([
      { code: 'PRJ 499', units: 20, grade: 'A' },
      { code: 'CSC 101', units: 3, grade: 'C' }
    ]);
    expect(r.totalUnits).toBe(23);
    expect(r.totalPoints).toBe(20 * 5 + 3 * 3);
    expect(r.gp).toBeCloseTo(109 / 23, 10);
  });
});

describe('calcCgpa', () => {
  test('weights semesters by units, not by count', () => {
    const r = calcCgpa([
      { totalUnits: 6, totalPoints: 27, gp: 4.5 },
      { totalUnits: 3, totalPoints: 15, gp: 5 }
    ]);
    expect(r.totalUnits).toBe(9);
    expect(r.gp).toBeCloseTo(42 / 9, 10);
  });

  test('returns null CGPA with no saved semesters', () => {
    expect(calcCgpa([]).gp).toBeNull();
  });
});

describe('formatGp', () => {
  test('rounds display to two decimals and guards null', () => {
    expect(formatGp(4.66666)).toBe('4.67');
    expect(formatGp(null)).toBe('-');
  });
});
