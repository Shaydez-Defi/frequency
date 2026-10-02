import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GRADES } from '../types.js';
import { courseSchema } from '@frequency/shared/schemas';
import { CA_MAX, EXAM_MAX, courseTotal, gradeForTotal } from '../lib/gpa.js';
import { useDraft } from '../semesters/draft.js';
import type { CourseDraft } from '../semesters/draft.js';
import { Select } from '../components/Select.js';
import { BackBar } from '../components/ui.js';
import { modeLabel } from '../lib/semesters.js';

function scoreOrUndefined(raw: string): number | undefined {
  const t = raw.trim();
  if (t === '') return undefined;
  return Number(t);
}

function validateRow(c: CourseDraft, scoresMode: boolean): string | null {
  if (!scoresMode) {
    const r = courseSchema.safeParse({
      code: c.code,
      title: c.title,
      units: c.units.trim() === '' ? Number.NaN : Number(c.units),
      grade: c.grade
    });
    return r.success ? null : (r.error.issues[0]?.message ?? 'Check this row.');
  }
  const ca = scoreOrUndefined(c.ca);
  const exam = scoreOrUndefined(c.exam);
  if (ca === undefined || exam === undefined) return 'Enter both CA and exam scores for this course.';
  const r = courseSchema.safeParse({
    code: c.code,
    title: c.title,
    units: c.units.trim() === '' ? Number.NaN : Number(c.units),
    grade: gradeForTotal(ca + exam),
    ca_score: ca,
    exam_score: exam
  });
  return r.success ? null : (r.error.issues[0]?.message ?? 'Check this row.');
}

export function derivedGrade(c: CourseDraft): string | null {
  const ca = scoreOrUndefined(c.ca);
  const exam = scoreOrUndefined(c.exam);
  if (ca === undefined || exam === undefined) return null;
  return gradeForTotal(ca + exam);
}

export function CourseEntry() {
  const { level, term, entryMode, courses, updateCourse, adjustUnits } = useDraft();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const scoresMode = entryMode === 'scores';

  const units = useMemo(
    () =>
      courses.reduce((sum, c) => {
        const u = Number(c.units);
        return Number.isInteger(u) && u >= 1 && u <= 12 ? sum + u : sum;
      }, 0),
    [courses]
  );

  function review() {
    for (let i = 0; i < courses.length; i++) {
      const problem = validateRow(courses[i], scoresMode);
      if (problem) {
        setError(`Course ${i + 1}: ${problem}`);
        return;
      }
    }
    setError('');
    navigate('/semesters/new/review');
  }

  return (
    <section className="scr">
      <BackBar
        title="Your Courses"
        subtitle={`${level} Level · ${term} · ${entryMode ? modeLabel(entryMode) : ''}`}
        onBack={() => navigate('/semesters/new')}
      />

      {courses.map((c, i) => {
        const ca = scoreOrUndefined(c.ca);
        const exam = scoreOrUndefined(c.exam);
        const total = scoresMode && ca !== undefined && exam !== undefined ? courseTotal(ca, exam) : null;
        return (
          <div className="card ccard" key={i}>
            <div className="ccard__head">
              Course <b>{String(i + 1).padStart(2, '0')}</b>
            </div>
            <input
              className="ccard__input"
              placeholder="Course Code"
              aria-label={`Course ${i + 1} code`}
              value={c.code}
              onChange={(e) => updateCourse(i, { code: e.target.value })}
              autoComplete="off"
            />
            <input
              className="ccard__input"
              placeholder="Course Title"
              aria-label={`Course ${i + 1} title`}
              value={c.title}
              onChange={(e) => updateCourse(i, { title: e.target.value })}
              autoComplete="off"
            />
            <div className="units-row">
              <div className="mini-step">
                <button type="button" onClick={() => adjustUnits(i, -1)} aria-label="Decrease credit units">
                  −
                </button>
                <span className="mini-step__v num">{c.units === '' ? '-' : c.units}</span>
                <button type="button" onClick={() => adjustUnits(i, +1)} aria-label="Increase credit units">
                  +
                </button>
                <span className="mini-step__lbl">Credit Units</span>
              </div>
              {!scoresMode ? (
                <Select
                  compact
                  label={`Course ${i + 1} grade`}
                  labelHidden
                  placeholder="Grade"
                  value={c.grade}
                  options={GRADES}
                  onChange={(v) => updateCourse(i, { grade: v })}
                />
              ) : (
                <span className="gpill" aria-label={`Course ${i + 1} derived grade`}>
                  {derivedGrade(c) ?? '—'}
                </span>
              )}
            </div>
            {scoresMode && (
              <>
                <div className="units-row" style={{ marginTop: 10 }}>
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label htmlFor={`n-ca-${i}`}>CA (/{CA_MAX})</label>
                    <input
                      id={`n-ca-${i}`}
                      className="ccard__input"
                      style={{ marginBottom: 0 }}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`Course ${i + 1} CA score`}
                      value={c.ca}
                      onChange={(e) => updateCourse(i, { ca: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label htmlFor={`n-ex-${i}`}>Exam (/{EXAM_MAX})</label>
                    <input
                      id={`n-ex-${i}`}
                      className="ccard__input"
                      style={{ marginBottom: 0 }}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`Course ${i + 1} exam score`}
                      value={c.exam}
                      onChange={(e) => updateCourse(i, { exam: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                </div>
                {total !== null && (
                  <p className="muted" style={{ margin: '8px 0 0' }}>
                    Total <strong className="num">{total}</strong> → grade <strong>{gradeForTotal(total)}</strong> (set on save).
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="coursefoot coursefoot--sticky">
        <div>
          <div className="coursefoot__tt">Total Credit Units</div>
          <div className="coursefoot__n num">{units}</div>
        </div>
        <button className="btn btn--dark btn--sm" style={{ marginLeft: 'auto' }} onClick={review}>
          Review GPA
        </button>
      </div>
    </section>
  );
}
