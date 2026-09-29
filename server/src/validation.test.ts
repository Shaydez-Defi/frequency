import { describe, expect, test } from 'vitest';
import { courseCountSchema, courseSchema, createSemesterSchema } from '@frequency/shared/schemas';

describe('courseSchema', () => {
  test('accepts a complete valid course', () => {
    const r = courseSchema.safeParse({ code: 'CSC 101', title: 'Intro', units: 3, grade: 'A' });
    expect(r.success).toBe(true);
  });

  test('accepts a course without title', () => {
    const r = courseSchema.safeParse({ code: 'CSC 101', units: 3, grade: 'b' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.grade).toBe('B');
  });

  test('rejects missing code, zero/negative/decimal units, unknown grade', () => {
    expect(courseSchema.safeParse({ code: '', units: 3, grade: 'A' }).success).toBe(false);
    expect(courseSchema.safeParse({ code: 'CSC 101', units: 0, grade: 'A' }).success).toBe(false);
    expect(courseSchema.safeParse({ code: 'CSC 101', units: -2, grade: 'A' }).success).toBe(false);
    expect(courseSchema.safeParse({ code: 'CSC 101', units: 2.5, grade: 'A' }).success).toBe(false);
    expect(courseSchema.safeParse({ code: 'CSC 101', units: 3, grade: 'Z' }).success).toBe(false);
    expect(courseSchema.safeParse({ code: 'CSC 101', units: 3, grade: '' }).success).toBe(false);
  });
});

describe('createSemesterSchema', () => {
  test('rejects empty course lists', () => {
    const r = createSemesterSchema.safeParse({ level: '100', term: 'First Semester', courses: [] });
    expect(r.success).toBe(false);
  });
});

describe('courseCountSchema', () => {
  test('accepts 1 to 15 whole courses', () => {
    expect(courseCountSchema.safeParse(1).success).toBe(true);
    expect(courseCountSchema.safeParse(8).success).toBe(true);
    expect(courseCountSchema.safeParse(15).success).toBe(true);
  });

  test('rejects zero, negatives, decimals, and unreasonable counts', () => {
    expect(courseCountSchema.safeParse(0).success).toBe(false);
    expect(courseCountSchema.safeParse(-3).success).toBe(false);
    expect(courseCountSchema.safeParse(2.5).success).toBe(false);
    expect(courseCountSchema.safeParse(16).success).toBe(false);
    expect(courseCountSchema.safeParse(Number.NaN).success).toBe(false);
  });
});
