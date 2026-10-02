import { z } from 'zod';
import { VALID_GRADES } from './gradeScale.js';
import { CA_MAX, EXAM_MAX } from './scores.js';

export const normalizeRegNumber = (v: string): string =>
  v.trim().toUpperCase().replace(/\s+/g, '');

const academicIdentity = {
  fullName: z.string().trim().min(2, 'Enter your full name.').max(80),
  department: z.string().trim().min(2, 'Enter your department.').max(80),
  regNumber: z
    .string()
    .trim()
    .min(3, 'Enter your registration number.')
    .max(32)
    .transform(normalizeRegNumber)
};

const optionalScore = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.number({ invalid_type_error: `Enter a valid ${label} score.` }).min(0, `${label} cannot be negative.`).max(max, `${label} cannot exceed ${max}.`).optional()
  );

export const courseSchema = z
  .object({
    code: z.string().trim().min(1, 'Course code is required.').max(20),
    title: z.string().trim().max(120).optional().or(z.literal('')),
    units: z.number().int('Units must be a whole number.').min(1).max(12),
    grade: z
      .string()
      .trim()
      .toUpperCase()
      .refine((g) => VALID_GRADES.includes(g), 'Select a valid grade.'),
    ca_score: optionalScore(CA_MAX, 'CA'),
    exam_score: optionalScore(EXAM_MAX, 'Exam')
  })
  .refine((c) => (c.ca_score === undefined) === (c.exam_score === undefined), {
    message: 'Enter both CA and exam scores, or leave both blank.'
  });

export const createSemesterSchema = z.object({
  level: z.string().trim().min(1, 'Level is required.').max(20),
  term: z.string().trim().min(1, 'Semester is required.').max(20),
  courses: z.array(courseSchema).min(1, 'Add at least one course.').max(30)
});

// How many course rows the entry screen generates. Whole numbers only,
// 1 at minimum and 15 at most (a full semester load).
export const courseCountSchema = z
  .number({ invalid_type_error: 'Enter how many courses you are offering.' })
  .int('Course count must be a whole number.')
  .min(1, 'Add at least one course.')
  .max(15, 'A semester holds at most 15 courses.');

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(80).optional(),
    department: z.string().trim().min(2, 'Enter your department.').max(80).optional()
  })
  .refine((d) => d.fullName !== undefined || d.department !== undefined, {
    message: 'Nothing to update.'
  });

// First-time Google sign-in: academic identity only. The Google subject,
// email, and name come from the verified pending session, never the client.
// claimExisting lets the owner of a legacy (pre-Google) account deliberately
// attach their verified Google identity to its existing records.
export const completeGoogleProfileSchema = z.object({
  ...academicIdentity,
  claimExisting: z.boolean().optional()
});
