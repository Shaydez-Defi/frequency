import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GRADES } from '../types.js';
import type { Grade } from '../types.js';
import { courseSchema } from '@frequency/shared/schemas';
import { useDraft } from '../semesters/draft.js';
import { BackBar } from '../components/ui.js';

export function CourseEntry() {
  const { level, term, courses, updateCourse, adjustUnits } = useDraft();
  const navigate = useNavigate();
  const [error, setError] = useState('');

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
      const c = courses[i];
      const r = courseSchema.safeParse({
        code: c.code,
        title: c.title,
        units: c.units.trim() === '' ? Number.NaN : Number(c.units),
        grade: c.grade
      });
      if (!r.success) {
        setError(`Course ${i + 1}: ${r.error.issues[0]?.message ?? 'check this row.'}`);
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
        subtitle={`${level} Level · ${term}`}
        onBack={() => navigate('/semesters/new')}
      />

      {courses.map((c, i) => (
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
            <select
              className="grade"
              value={c.grade}
              onChange={(e) => updateCourse(i, { grade: e.target.value })}
              aria-label={`Course ${i + 1} grade`}
            >
              <option value="">Grade</option>
              {GRADES.map((g: Grade) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

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
