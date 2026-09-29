import { GRADE_POINTS } from './gradeScale.js';

export interface CourseInput {
  code: string;
  title?: string;
  units: number;
  grade: string;
}

export interface SemesterTotals {
  totalUnits: number;
  totalPoints: number;
  gp: number | null;
}

function pointsFor(grade: string): number | null {
  const key = grade.trim().toUpperCase();
  return key in GRADE_POINTS ? GRADE_POINTS[key] : null;
}

// GP = total quality points / total credit units. Null when no units.
export function calcSemester(courses: CourseInput[]): SemesterTotals {
  let totalUnits = 0;
  let totalPoints = 0;
  for (const c of courses) {
    const p = pointsFor(c.grade);
    if (p === null) throw new Error(`Unknown grade: ${c.grade}`);
    if (!Number.isInteger(c.units) || c.units < 1 || c.units > 12) {
      throw new Error(`Invalid units for ${c.code}`);
    }
    totalUnits += c.units;
    totalPoints += c.units * p;
  }
  if (totalUnits === 0) return { totalUnits: 0, totalPoints: 0, gp: null };
  return { totalUnits, totalPoints, gp: totalPoints / totalUnits };
}

// CGPA = total quality points across semesters / total units across semesters.
export function calcCgpa(semesters: SemesterTotals[]): SemesterTotals {
  let totalUnits = 0;
  let totalPoints = 0;
  for (const s of semesters) {
    totalUnits += s.totalUnits;
    totalPoints += s.totalPoints;
  }
  if (totalUnits === 0) return { totalUnits: 0, totalPoints: 0, gp: null };
  return { totalUnits, totalPoints, gp: totalPoints / totalUnits };
}

// Display-only rounding. Storage keeps full precision.
export function formatGp(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toFixed(2);
}
