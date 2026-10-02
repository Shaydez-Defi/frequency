import { GRADE_POINTS, VALID_GRADES } from './gradeScale.js';

// Score model (single source of truth, shared by server and client).
// Assumption, stated once here: CA + Exam = 100 (CA capped at 30, Exam at 70).
export const CA_MAX = 30;
export const EXAM_MAX = 70;
export const TOTAL_MAX = 100;

// Standard 5-point score bands, the companion of GRADE_POINTS above:
// A=5 down to F=0. Bands, not inventions: 70+ is an A wherever A means 5.
const SCORE_BANDS: Array<{ min: number; grade: string }> = [
  { min: 70, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 45, grade: 'D' },
  { min: 40, grade: 'E' },
  { min: 0, grade: 'F' }
];

export function gradeForTotal(total: number): string {
  for (const band of SCORE_BANDS) {
    if (total >= band.min) return band.grade;
  }
  return 'F';
}

export interface ScoreInput {
  code: string;
  units: number;
  grade: string;
  caScore?: number | null;
  examScore?: number | null;
}

export interface ResolvedCourse {
  grade: string;
  points: number;
  total: number | null;
}

function validScore(value: number, max: number, label: string, code: string): void {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label} score for ${code} must be between 0 and ${max}.`);
  }
}

// Server-authoritative resolution. Both scores present: total, grade, and
// points are DERIVED and any client-supplied grade is ignored. Both absent:
// the manually entered grade stands (existing grade-only records keep working).
// Exactly one present: rejected, never silently completed.
export function resolveCourse(input: ScoreInput): ResolvedCourse {
  const ca = input.caScore ?? null;
  const exam = input.examScore ?? null;
  if (ca === null && exam === null) {
    const grade = input.grade.trim().toUpperCase();
    if (!VALID_GRADES.includes(grade)) throw new Error(`Select a valid grade for ${input.code}.`);
    return { grade, points: GRADE_POINTS[grade], total: null };
  }
  if (ca === null || exam === null) {
    throw new Error(`Enter both CA and exam scores for ${input.code}, or leave both blank.`);
  }
  validScore(ca, CA_MAX, 'CA', input.code);
  validScore(exam, EXAM_MAX, 'Exam', input.code);
  const total = ca + exam;
  if (total > TOTAL_MAX) throw new Error(`Total score for ${input.code} cannot exceed ${TOTAL_MAX}.`);
  const grade = gradeForTotal(total);
  return { grade, points: GRADE_POINTS[grade], total };
}

export function courseTotal(ca: number | null | undefined, exam: number | null | undefined): number | null {
  if (ca === null || ca === undefined || exam === null || exam === undefined) return null;
  return ca + exam;
}
