import { z } from 'zod';
import { VALID_GRADES } from './gradeScale.js';

export const normalizeRegNumber = (v: string): string =>
  v.trim().toUpperCase().replace(/\s+/g, '');

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(80),
    department: z.string().trim().min(2, 'Enter your department.').max(80),
    regNumber: z
      .string()
      .trim()
      .min(3, 'Enter your registration number.')
      .max(32)
      .transform(normalizeRegNumber),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
    confirmPassword: z.string()
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword']
  });

export const loginSchema = z.object({
  regNumber: z
    .string()
    .trim()
    .min(1, 'Enter your registration number.')
    .max(32)
    .transform(normalizeRegNumber),
  password: z.string().min(1, 'Enter your password.')
});

export const courseSchema = z.object({
  code: z.string().trim().min(1, 'Course code is required.').max(20),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  units: z.number().int('Units must be a whole number.').min(1).max(12),
  grade: z
    .string()
    .trim()
    .toUpperCase()
    .refine((g) => VALID_GRADES.includes(g), 'Select a valid grade.')
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

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128),
    confirmPassword: z.string()
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword']
  });

// First-time Google sign-in: academic identity only. The Google subject,
// email, and name come from the verified pending session, never the client.
export const completeGoogleProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(80),
  department: z.string().trim().min(2, 'Enter your department.').max(80),
  regNumber: z
    .string()
    .trim()
    .min(3, 'Enter your registration number.')
    .max(32)
    .transform(normalizeRegNumber)
});

// Establishing a first password for accounts created via Google sign-in.
export const setupPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128),
    confirmPassword: z.string()
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword']
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
