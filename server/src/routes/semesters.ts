import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { calcCgpa, calcSemester } from '@frequency/shared/calc';
import { courseTotal, resolveCourse } from '@frequency/shared/scores';
import { createSemesterSchema } from '@frequency/shared/schemas';
import { queryAll, queryGet, queryRun, withTransaction } from '../db.js';
import type { Db } from '../db.js';
import { ah } from '../ah.js';
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
  ca_score: number | null;
  exam_score: number | null;
}

export const semestersRouter = Router();
semestersRouter.use(requireAuth);

function userId(req: unknown): string {
  return (req as { user: { id: string } }).user.id;
}

async function withCourses(s: SemesterRow, tx?: Db) {
  const get = tx ? tx.all<CourseRow> : queryAll<CourseRow>;
  const courses = await get('SELECT * FROM courses WHERE semester_id = ?', s.id);
  return {
    id: s.id,
    level: s.level,
    term: s.term,
    totalUnits: s.total_units,
    totalPoints: s.total_points,
    gp: s.gp,
    createdAt: s.created_at,
    courses: courses.map((c) => ({
      ...c,
      total_score: courseTotal(c.ca_score, c.exam_score)
    }))
  };
}

interface ResolvedInput {
  code: string;
  title?: string;
  units: number;
  grade: string;
  ca_score?: number;
  exam_score?: number;
}

// Grades, points, and totals are derived here. Client-supplied grade/points
// are ignored whenever both scores exist; grade-only rows keep working.
function resolveInputs(courses: ResolvedInput[]) {
  return courses.map((c) => {
    const r = resolveCourse({
      code: c.code,
      units: c.units,
      grade: c.grade,
      caScore: c.ca_score ?? null,
      examScore: c.exam_score ?? null
    });
    return { ...c, grade: r.grade };
  });
}

function insertCourses(tx: Db, semesterId: string, courses: ResolvedInput[]) {
  return Promise.all(
    courses.map((c) => {
      const r = resolveCourse({
        code: c.code,
        units: c.units,
        grade: c.grade,
        caScore: c.ca_score ?? null,
        examScore: c.exam_score ?? null
      });
      return tx.run(
        'INSERT INTO courses (id, semester_id, code, title, units, grade, quality_points, ca_score, exam_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        randomUUID(),
        semesterId,
        c.code.trim().toUpperCase(),
        c.title?.trim() || null,
        c.units,
        r.grade,
        c.units * r.points,
        c.ca_score ?? null,
        c.exam_score ?? null
      );
    })
  );
}

semestersRouter.get(
  '/',
  ah(async (req, res) => {
    const id = userId(req);
    const semesters = await queryAll<SemesterRow>(
      'SELECT * FROM semesters WHERE user_id = ? ORDER BY created_at ASC',
      id
    );
    const withCoursesList = await Promise.all(semesters.map((s) => withCourses(s)));
    const cgpa = calcCgpa(
      withCoursesList.map((s) => ({ totalUnits: s.totalUnits, totalPoints: s.totalPoints, gp: s.gp }))
    );
    res.json({
      semesters: withCoursesList,
      cgpa: cgpa.gp,
      totalUnits: cgpa.totalUnits,
      totalPoints: cgpa.totalPoints
    });
  })
);

semestersRouter.post(
  '/',
  ah(async (req, res) => {
    const parsed = createSemesterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check semester fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const id = userId(req);
    const { level, term, courses } = parsed.data;
    let totals;
    let resolved;
    try {
      resolved = resolveInputs(courses);
      totals = calcSemester(resolved);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid calculation.' });
      return;
    }
    if (totals.gp === null) {
      res.status(400).json({ error: 'Add at least one course with valid units.' });
      return;
    }
    const dupe = await queryGet<{ id: string }>(
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
    await withTransaction(async (tx) => {
      await tx.run(
        'INSERT INTO semesters (id, user_id, level, term, total_units, total_points, gp) VALUES (?, ?, ?, ?, ?, ?, ?)',
        semesterId,
        id,
        level.trim(),
        term.trim(),
        totals.totalUnits,
        totals.totalPoints,
        totals.gp as number
      );
      await insertCourses(tx, semesterId, courses);
    });
    res.status(201).json({ id: semesterId, gp: totals.gp, totalUnits: totals.totalUnits });
  })
);

async function ownedSemester(uid: string, sid: string): Promise<SemesterRow | undefined> {
  return queryGet<SemesterRow>('SELECT * FROM semesters WHERE id = ? AND user_id = ?', sid, uid);
}

semestersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const found = await ownedSemester(userId(req), req.params.id);
    if (!found) {
      res.status(404).json({ error: 'Semester not found.' });
      return;
    }
    res.json({ semester: await withCourses(found) });
  })
);

semestersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const uid = userId(req);
    const existing = await ownedSemester(uid, req.params.id);
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
      totals = calcSemester(resolveInputs(courses));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid calculation.' });
      return;
    }
    if (totals.gp === null) {
      res.status(400).json({ error: 'Add at least one course with valid units.' });
      return;
    }
    const dupe = await queryGet<{ id: string }>(
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
    await withTransaction(async (tx) => {
      await tx.run(
        'UPDATE semesters SET level = ?, term = ?, total_units = ?, total_points = ?, gp = ? WHERE id = ?',
        level.trim(),
        term.trim(),
        totals.totalUnits,
        totals.totalPoints,
        totals.gp as number,
        existing.id
      );
      await tx.run('DELETE FROM courses WHERE semester_id = ?', existing.id);
      await insertCourses(tx, existing.id, courses);
    });
    res.json({ id: existing.id, gp: totals.gp, totalUnits: totals.totalUnits });
  })
);

semestersRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = await ownedSemester(userId(req), req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Semester not found.' });
      return;
    }
    await queryRun('DELETE FROM semesters WHERE id = ?', existing.id);
    res.json({ ok: true });
  })
);
