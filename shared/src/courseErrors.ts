import { courseSchema } from './schemas.js';
import type { EntryMode } from './schemas.js';

// Collects EVERY invalid course before anything is displayed, so the student
// sees the complete fix list instead of one error at a time. Shared by course
// entry, semester edit, and Add Scores: one logic, one wording.
export interface CourseErrorInput {
  code: unknown;
  title?: unknown;
  units: unknown;
  grade: unknown;
  ca_score?: unknown;
  exam_score?: unknown;
}

export interface CourseError {
  index: number;
  problems: string[];
}

const LABELS: Record<string, string> = {
  code: 'Course Code',
  title: 'Course Title',
  units: 'Credit Units',
  grade: 'Grade',
  ca_score: 'CA',
  exam_score: 'Exam'
};

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && Number.isNaN(v));
}

export function describeCourseErrors(rows: CourseErrorInput[], mode: EntryMode): CourseError[] {
  const out: CourseError[] = [];
  rows.forEach((row, index) => {
    const problems: string[] = [];
    const missing: string[] = [];
    if (isBlank(row.code)) missing.push(LABELS.code);
    // Title stays optional: never flagged missing, only invalid when overlong.
    if (isBlank(row.units)) missing.push(LABELS.units);
    if (isBlank(row.grade)) missing.push(LABELS.grade);
    if (mode === 'scores') {
      if (isBlank(row.ca_score)) missing.push(LABELS.ca_score);
      if (isBlank(row.exam_score)) missing.push(LABELS.exam_score);
    }
    const parsed = courseSchema.safeParse({
      code: typeof row.code === 'string' ? row.code : '',
      title: typeof row.title === 'string' ? row.title : '',
      units: typeof row.units === 'number' ? row.units : Number.NaN,
      grade: typeof row.grade === 'string' ? row.grade : '',
      ca_score: mode === 'scores' ? toNumberOrUndefined(row.ca_score) : undefined,
      exam_score: mode === 'scores' ? toNumberOrUndefined(row.exam_score) : undefined
    });
    if (!parsed.success) {
      const seen = new Set(missing);
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        const label = LABELS[key] ?? key;
        // A blank field already explains itself; keep only the extra detail.
        if (seen.has(label)) continue;
        seen.add(label);
        problems.push(`${label}: ${issue.message}`);
      }
    }
    if (missing.length > 0) problems.unshift(`${missing.join(', ')} missing`);
    if (problems.length > 0) out.push({ index, problems });
  });
  return out;
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return undefined;
}
