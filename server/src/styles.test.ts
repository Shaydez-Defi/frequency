import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Guards the result-sheet contract that no API test can see: the preview
// component and its print stylesheet.
const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, '..', '..', 'client', 'src', 'screens', 'ResultSheet.tsx'), 'utf8');
const css = readFileSync(join(here, '..', '..', 'client', 'src', 'styles.css'), 'utf8');

describe('result sheet presentation contract', () => {
  test('entry mode never appears on the student document', () => {
    expect(sheet).not.toMatch(/Entry Mode/i);
    expect(sheet).not.toContain('entryMode');
    expect(sheet).not.toContain('modeLabel');
  });

  test('sheet still carries every academic field', () => {
    for (const field of [
      'student.fullName',
      'student.regNumber',
      'student.department',
      'semester.level',
      'semester.semester',
      'semester.totalUnits',
      'semester.totalPoints',
      'semester.gp',
      'c.code',
      'c.title',
      'c.units',
      'c.caScore',
      'c.examScore',
      'c.totalScore',
      'c.grade',
      'c.qualityPoints'
    ]) {
      expect(sheet).toContain(field);
    }
  });

  test('print path hides app chrome and stays A4', () => {
    expect(css).toContain('@page');
    expect(css).toContain('@media print');
    expect(css).toContain('.noprint');
    expect(sheet).toContain('window.print');
  });

  test('preview constrains overflow to the table scroller only', () => {
    expect(css).toContain('.sheet__scroll');
    expect(sheet).toContain('sheet__scroll');
    expect(css).toMatch(/\.sheet\s*\{[^}]*max-width:\s*100%/);
  });
});
