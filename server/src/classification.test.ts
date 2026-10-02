import { describe, expect, test } from 'vitest';
import { CLASS_BANDS, classifyCgpa } from '@frequency/shared/classification';
import { GP_MESSAGES, getGpMessage } from '@frequency/shared/gpMessages';

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

describe('getGpMessage', () => {
  test('stays tiered on the classification minimums with BGS on top', () => {
    expect(GP_MESSAGES[0].min).toBe(CLASS_BANDS[0].min);
    expect(GP_MESSAGES[0].stamp).toBe('BGS');
    expect(getGpMessage(5).stamp).toBe('BGS');
    expect(getGpMessage(4.5).stamp).toBe('BGS');
  });

  test('steps praise down as GP falls through every boundary', () => {
    const stamps = [4.9, 4.0, 3.0, 2.0, 1.2, 0.4].map((gp) => getGpMessage(gp).stamp);
    expect(new Set(stamps).size).toBe(6);
    expect(getGpMessage(3.5).message).not.toBe(getGpMessage(3.49).message);
    expect(getGpMessage(2.4).message).not.toBe(getGpMessage(2.39).message);
    expect(getGpMessage(1.5).message).not.toBe(getGpMessage(1.49).message);
    expect(getGpMessage(1.0).message).not.toBe(getGpMessage(0.99).message);
  });

  test('handles missing GP without crashing', () => {
    expect(getGpMessage(null).message.length).toBeGreaterThan(0);
    expect(getGpMessage(Number.NaN).message.length).toBeGreaterThan(0);
  });
});
