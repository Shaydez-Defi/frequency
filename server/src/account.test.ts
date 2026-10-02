import { describe, expect, test } from 'vitest';
import { completeGoogleProfileSchema, updateProfileSchema } from '@frequency/shared/schemas';

describe('updateProfileSchema', () => {
  test('accepts name and/or department edits, never a registration number', () => {
    expect(updateProfileSchema.safeParse({ fullName: 'New Name' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ department: 'New Dept' }).success).toBe(true);
    const r = updateProfileSchema.safeParse({ fullName: 'New Name', regNumber: 'X' });
    expect(r.success).toBe(true);
    if (r.success) expect('regNumber' in r.data).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ fullName: 'A' }).success).toBe(false);
  });
});

describe('completeGoogleProfileSchema', () => {
  test('accepts academic identity with an optional explicit claim flag', () => {
    const r = completeGoogleProfileSchema.safeParse({
      fullName: 'Ada Eze',
      department: 'Agric Economics',
      regNumber: 'fehnd/2024/0001'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.regNumber).toBe('FEHND/2024/0001');
    expect(
      completeGoogleProfileSchema.safeParse({
        fullName: 'Ada Eze',
        department: 'Agric Economics',
        regNumber: 'FEHND/2024/0001',
        claimExisting: true
      }).success
    ).toBe(true);
  });

  test('never trusts client-supplied Google identity material', () => {
    const r = completeGoogleProfileSchema.safeParse({
      fullName: 'Ada Eze',
      department: 'Agric Economics',
      regNumber: 'FEHND/2024/0001',
      sub: 'hacker-sub',
      email: 'hacker@example.com'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect('sub' in r.data).toBe(false);
      expect('email' in r.data).toBe(false);
    }
  });

  test('rejects short names and short registration numbers', () => {
    expect(
      completeGoogleProfileSchema.safeParse({ fullName: 'A', department: 'Agric', regNumber: 'FEHND/2024/0001' }).success
    ).toBe(false);
    expect(completeGoogleProfileSchema.safeParse({ fullName: 'Ada Eze', department: 'A', regNumber: 'FEHND/2024/0001' }).success).toBe(
      false
    );
    expect(completeGoogleProfileSchema.safeParse({ fullName: 'Ada Eze', department: 'Agric', regNumber: 'X' }).success).toBe(false);
  });
});
