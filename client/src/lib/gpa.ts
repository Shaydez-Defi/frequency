// UI adapter over the shared calculation modules.
// All math and mappings live in @frequency/shared; nothing is duplicated here.
import { MAX_COURSE_UNITS, calcCgpa, calcSemester } from '@frequency/shared/calc';
import { CA_MAX, EXAM_MAX, courseTotal, gradeForTotal } from '@frequency/shared/scores';
import { getGpMessage } from '@frequency/shared/gpMessages';
import type { GpMessage } from '@frequency/shared/gpMessages';
import { classifyCgpa } from '@frequency/shared/classification';
import type { Course, Semester } from '../types';

export { CA_MAX, EXAM_MAX, MAX_COURSE_UNITS, courseTotal, getGpMessage, gradeForTotal };
export type { GpMessage };

export interface Totals {
  units: number;
  qualityPoints: number;
  gpa: number;
}

export function totals(courses: Course[]): Totals {
  const r = calcSemester(courses);
  return { units: r.totalUnits, qualityPoints: r.totalPoints, gpa: r.gp ?? 0 };
}

/** Cumulative CGPA across every saved semester. */
export function cgpa(semesters: Semester[]): number {
  const r = calcCgpa(semesters.map((s) => calcSemester(s.courses)));
  return r.gp ?? 0;
}

export function classify(cgpaValue: number): string {
  return classifyCgpa(cgpaValue);
}

export const fmt = (n: number, digits = 2): string => n.toFixed(digits);
