import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GRADES } from '../types.js';
import { describeCourseErrors } from '@frequency/shared/courseErrors';
import type { CourseError } from '@frequency/shared/courseErrors';
import { CA_MAX, EXAM_MAX, MAX_COURSE_UNITS, courseTotal, gradeForTotal } from '../lib/gpa.js';
import { useDraft } from '../semesters/draft.js';
import type { CourseDraft } from '../semesters/draft.js';
import { Select } from '../components/Select.js';
import { BackBar, ErrorSummary } from '../components/ui.js';
import { modeLabel } from '../lib/semesters.js';

function scoreOrUndefined(raw: string): number | undefined {
  const t = raw.trim();
  if (t === '') return undefined;
  return Number(t);
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
  const [errors, setErrors] = useState<CourseError[]>([]);
  const scoresMode = entryMode === 'scores';

  const units = useMemo(
    () =>
      courses.reduce((sum, c) => {
        const u = Number(c.units);
        return Number.isInteger(u) && u >= 1 && u <= MAX_COURSE_UNITS ? sum + u : sum;
      }, 0),
    [courses]
  );

  function focusCourse(index: number) {
    document.getElementById(`course-card-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function toInput(c: CourseDraft) {
    return {
      code: c.code,
      title: c.title,
      units: c.units.trim() === '' ? Number.NaN : Number(c.units),
      grade: scoresMode ? (derivedGrade(c) ?? c.grade) : c.grade,
      ca_score: scoreOrUndefined(c.ca),
      exam_score: scoreOrUndefined(c.exam)
    };
  }

  function review() {
    const found = describeCourseErrors(courses.map(toInput), scoresMode ? 'scores' : 'grade_only');
    setErrors(found);
    if (found.length > 0) {
      focusCourse(found[0].index);
      return;
    }
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
          <div className="card ccard" id={`course-card-${i}`} key={i}>
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

      <ErrorSummary errors={errors} onFocus={focusCourse} />

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
