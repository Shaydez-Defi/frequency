import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { calcCgpa, calcSemester } from '@cgpa-app/shared/calc';
import { GRADE_POINTS } from '@cgpa-app/shared/gradeScale';
import { createSemesterSchema } from '@cgpa-app/shared/schemas';
import { db, queryAll, queryGet, queryRun } from '../db.js';
import { requireAuth } from '../auth.js';

interface SemesterRow {
  id: string;
  user_id: string;
  level: string;
  term: string;
  total_units: number;
  total_points: number;
  gp: number;
  created_at: string;
}

interface CourseRow {
  id: string;
  semester_id: string;
  code: string;
  title: string | null;
  units: number;
  grade: string;
  quality_points: number;
}

export const semestersRouter = Router();
semestersRouter.use(requireAuth);

function userId(req: unknown): string {
  return (req as { user: { id: string } }).user.id;
}

function withCourses(s: SemesterRow) {
  return {
    id: s.id,
    level: s.level,
    term: s.term,
    totalUnits: s.total_units,
    totalPoints: s.total_points,
    gp: s.gp,
    createdAt: s.created_at,
    courses: queryAll<CourseRow>('SELECT * FROM courses WHERE semester_id = ?', s.id)
  };
}

semestersRouter.get('/', (req, res) => {
  const id = userId(req);
  const semesters = queryAll<SemesterRow>('SELECT * FROM semesters WHERE user_id = ? ORDER BY created_at ASC', id);
  const withCoursesList = semesters.map(withCourses);
  const cgpa = calcCgpa(withCoursesList.map((s) => ({ totalUnits: s.totalUnits, totalPoints: s.totalPoints, gp: s.gp })));
  res.json({
    semesters: withCoursesList,
    cgpa: cgpa.gp,
    totalUnits: cgpa.totalUnits,
    totalPoints: cgpa.totalPoints
  });
});

semestersRouter.post('/', (req, res) => {
  const parsed = createSemesterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check semester fields.', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const id = userId(req);
  const { level, term, courses } = parsed.data;
  let totals;
  try {
    totals = calcSemester(courses);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid calculation.' });
    return;
  }
  if (totals.gp === null) {
    res.status(400).json({ error: 'Add at least one course with valid units.' });
    return;
  }
  const dupe = queryGet<{ id: string }>(
    'SELECT id FROM semesters WHERE user_id = ? AND level = ? AND term = ?',
    id,
    level.trim(),
    term.trim()
  );
  if (dupe) {
    res.status(409).json({ error: 'This level and semester is already recorded. Open it to edit instead.' });
    return;
  }
  const semesterId = randomUUID();
  queryRun(
    'INSERT INTO semesters (id, user_id, level, term, total_units, total_points, gp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    semesterId,
    id,
    level.trim(),
    term.trim(),
    totals.totalUnits,
    totals.totalPoints,
    totals.gp
  );
  for (const c of courses) {
    const grade = c.grade.toUpperCase();
    queryRun(
      'INSERT INTO courses (id, semester_id, code, title, units, grade, quality_points) VALUES (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      semesterId,
      c.code.trim().toUpperCase(),
      c.title?.trim() || null,
      c.units,
      grade,
      c.units * GRADE_POINTS[grade]
    );
  }
  res.status(201).json({ id: semesterId, gp: totals.gp, totalUnits: totals.totalUnits });
});

function ownedSemester(uid: string, sid: string): SemesterRow | undefined {
  return queryGet<SemesterRow>('SELECT * FROM semesters WHERE id = ? AND user_id = ?', sid, uid);
}

semestersRouter.get('/:id', (req, res) => {
  const found = ownedSemester(userId(req), req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Semester not found.' });
    return;
  }
  res.json({ semester: withCourses(found) });
});

semestersRouter.put('/:id', (req, res) => {
  const uid = userId(req);
  const existing = ownedSemester(uid, req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Semester not found.' });
    return;
  }
  const parsed = createSemesterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check semester fields.', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { level, term, courses } = parsed.data;
  let totals;
  try {
    totals = calcSemester(courses);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid calculation.' });
    return;
  }
  if (totals.gp === null) {
    res.status(400).json({ error: 'Add at least one course with valid units.' });
    return;
  }
  const dupe = queryGet<{ id: string }>(
    'SELECT id FROM semesters WHERE user_id = ? AND level = ? AND term = ? AND id != ?',
    uid,
    level.trim(),
    term.trim(),
    existing.id
  );
  if (dupe) {
    res.status(409).json({ error: 'Another saved semester already uses this level and semester.' });
    return;
  }
  // Client-supplied GP/totals are ignored: everything below is derived server-side.
  db.exec('BEGIN');
  try {
    queryRun(
      'UPDATE semesters SET level = ?, term = ?, total_units = ?, total_points = ?, gp = ? WHERE id = ?',
      level.trim(),
      term.trim(),
      totals.totalUnits,
      totals.totalPoints,
      totals.gp,
      existing.id
    );
    queryRun('DELETE FROM courses WHERE semester_id = ?', existing.id);
    for (const c of courses) {
      const grade = c.grade.toUpperCase();
      queryRun(
        'INSERT INTO courses (id, semester_id, code, title, units, grade, quality_points) VALUES (?, ?, ?, ?, ?, ?, ?)',
        randomUUID(),
        existing.id,
        c.code.trim().toUpperCase(),
        c.title?.trim() || null,
        c.units,
        grade,
        c.units * GRADE_POINTS[grade]
      );
    }
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    throw new Error('Could not save the edited semester.');
  }
  res.json({ id: existing.id, gp: totals.gp, totalUnits: totals.totalUnits });
});

semestersRouter.delete('/:id', (req, res) => {
  const existing = ownedSemester(userId(req), req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Semester not found.' });
    return;
  }
  queryRun('DELETE FROM semesters WHERE id = ?', existing.id);
  res.json({ ok: true });
});
