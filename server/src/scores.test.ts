import { describe, expect, test } from 'vitest';
import { CA_MAX, EXAM_MAX, courseTotal, gradeForTotal, resolveCourse } from '@frequency/shared/scores';

describe('gradeForTotal', () => {
  test('maps the standard 5-point bands', () => {
    expect(gradeForTotal(100)).toBe('A');
    expect(gradeForTotal(85)).toBe('A');
    expect(gradeForTotal(70)).toBe('A');
    expect(gradeForTotal(69)).toBe('B');
    expect(gradeForTotal(60)).toBe('B');
    expect(gradeForTotal(59)).toBe('C');
    expect(gradeForTotal(50)).toBe('C');
    expect(gradeForTotal(49)).toBe('D');
    expect(gradeForTotal(45)).toBe('D');
    expect(gradeForTotal(44)).toBe('E');
    expect(gradeForTotal(40)).toBe('E');
    expect(gradeForTotal(39)).toBe('F');
    expect(gradeForTotal(0)).toBe('F');
  });
});

describe('resolveCourse', () => {
  test('keeps grade-only records exactly as entered', () => {
    expect(resolveCourse({ code: 'HND315', units: 3, grade: 'A' })).toMatchObject({ grade: 'A', points: 5, total: null });
    expect(resolveCourse({ code: 'HND315', units: 3, grade: 'c' })).toMatchObject({ grade: 'C', points: 3, total: null });
  });

  test('derives total, grade, and points from both scores', () => {
    expect(resolveCourse({ code: 'HND315', units: 3, grade: 'F', caScore: 24, examScore: 61 })).toMatchObject({
      grade: 'A',
      points: 5,
      total: 85
    });
    expect(resolveCourse({ code: 'HND315', units: 3, grade: 'A', caScore: 10, examScore: 20 })).toMatchObject({
      grade: 'F',
      points: 0,
      total: 30
    });
  });

  test('accepts boundary scores 30 + 70 = 100', () => {
    expect(resolveCourse({ code: 'HND315', units: 3, grade: 'A', caScore: CA_MAX, examScore: EXAM_MAX })).toMatchObject({
      grade: 'A',
      total: 100
    });
  });

  test('rejects negative, over-maximum, and over-total scores', () => {
    expect(() => resolveCourse({ code: 'HND315', units: 3, grade: 'A', caScore: -1, examScore: 50 })).toThrow();
    expect(() => resolveCourse({ code: 'HND315', units: 3, grade: 'A', caScore: CA_MAX + 1, examScore: 50 })).toThrow();
    expect(() => resolveCourse({ code: 'HND315', units: 3, grade: 'A', caScore: 20, examScore: EXAM_MAX + 1 })).toThrow();
  });

  test('rejects exactly one score instead of guessing', () => {
    expect(() => resolveCourse({ code: 'HND315', units: 3, grade: 'A', caScore: 24 })).toThrow(/both/);
    expect(() => resolveCourse({ code: 'HND315', units: 3, grade: 'A', examScore: 61 })).toThrow(/both/);
  });

  test('rejects invalid manual grades', () => {
    expect(() => resolveCourse({ code: 'HND315', units: 3, grade: 'Z' })).toThrow();
  });
});

describe('courseTotal', () => {
  test('sums pairs and stays null when scores are missing', () => {
    expect(courseTotal(24, 61)).toBe(85);
    expect(courseTotal(null, 61)).toBeNull();
    expect(courseTotal(24, null)).toBeNull();
    expect(courseTotal(undefined, undefined)).toBeNull();
  });
});
