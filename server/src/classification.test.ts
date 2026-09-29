import { describe, expect, test } from 'vitest';
import { classifyCgpa } from '@cgpa-app/shared/classification';

describe('classifyCgpa', () => {
  test('maps the 5.0 scale to degree classes', () => {
    expect(classifyCgpa(5)).toBe('First Class');
    expect(classifyCgpa(4.5)).toBe('First Class');
    expect(classifyCgpa(4.32)).toBe('Second Class Upper');
    expect(classifyCgpa(3.5)).toBe('Second Class Upper');
    expect(classifyCgpa(2.8)).toBe('Second Class Lower');
    expect(classifyCgpa(2.4)).toBe('Second Class Lower');
    expect(classifyCgpa(1.9)).toBe('Third Class');
    expect(classifyCgpa(1.2)).toBe('Pass');
    expect(classifyCgpa(0.7)).toBe('Fail');
  });

  test('flags out-of-range values instead of misclassifying', () => {
    expect(classifyCgpa(5.4)).toBe('Unclassified');
    expect(classifyCgpa(-0.5)).toBe('Unclassified');
  });
});
