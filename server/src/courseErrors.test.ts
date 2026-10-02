import { describe, expect, test } from 'vitest';
import { describeCourseErrors } from '@frequency/shared/courseErrors';

const good = { code: 'CSC 101', title: 'Intro', units: 3, grade: 'A' };

describe('describeCourseErrors', () => {
  test('returns nothing for complete courses', () => {
    expect(describeCourseErrors([good], 'grade_only')).toEqual([]);
    expect(describeCourseErrors([{ ...good, ca_score: 24, exam_score: 61 }], 'scores')).toEqual([]);
  });

  test('lists every incomplete course, never just the first', () => {
    const rows = [
      good,
      good,
      { code: 'CSC 102', title: '', units: Number.NaN, grade: 'B' },
      { code: 'CSC 103', title: '', units: Number.NaN, grade: 'C' }
    ];
    const found = describeCourseErrors(rows, 'grade_only');
    expect(found.map((e) => e.index)).toEqual([2, 3]);
    expect(found[0].problems.join(' ')).toMatch(/Credit Units missing/);
    expect(found[1].problems.join(' ')).toMatch(/Credit Units missing/);
  });

  test('names each missing field per course', () => {
    const rows = [
      { code: '', title: '', units: Number.NaN, grade: 'A' },
      { code: 'CSC 103', title: '', units: 3, grade: '' }
    ];
    const found = describeCourseErrors(rows, 'grade_only');
    expect(found).toHaveLength(2);
    expect(found[0].problems.join(' ')).toMatch(/Course Code/);
    expect(found[0].problems.join(' ')).toMatch(/Credit Units/);
    expect(found[1].problems.join(' ')).toMatch(/Grade missing/);
  });

  test('flags missing CA and Exam in scores mode', () => {
    const found = describeCourseErrors([{ ...good, ca_score: 24 }], 'scores');
    expect(found).toHaveLength(1);
    expect(found[0].problems.join(' ')).toMatch(/Exam missing/);
  });

  test('keeps range violations alongside missing fields', () => {
    const found = describeCourseErrors([{ code: 'CSC 101', title: '', units: 3, grade: 'A', ca_score: 99, exam_score: 10 }], 'scores');
    expect(found).toHaveLength(1);
    expect(found[0].problems.join(' ')).toMatch(/CA/);
  });

  test('never flags the optional title as missing', () => {
    const found = describeCourseErrors([{ ...good, title: '' }], 'grade_only');
    expect(found).toEqual([]);
  });
});
