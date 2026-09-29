import { describe, expect, test } from 'vitest';
import { changePasswordSchema, updateProfileSchema } from '@frequency/shared/schemas';

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

describe('changePasswordSchema', () => {
  test('requires the current password, a long-enough match, and confirmation', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old12345', newPassword: 'new12345', confirmPassword: 'new12345' }).success
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'new12345', confirmPassword: 'new12345' }).success
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old12345', newPassword: 'short', confirmPassword: 'short' }).success
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old12345', newPassword: 'new12345', confirmPassword: 'other123' }).success
    ).toBe(false);
  });
});
