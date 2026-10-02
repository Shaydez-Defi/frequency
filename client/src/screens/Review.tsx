import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import type { CoursePayload } from '../lib/api.js';
import { courseTotal, totals } from '../lib/gpa.js';
import type { Grade } from '../types.js';
import { useDraft } from '../semesters/draft.js';
import { modeLabel } from '../lib/semesters.js';
import { CourseRow, Stat } from '../components/ui.js';
import { fmt } from '../lib/gpa.js';
import { derivedGrade } from './CourseEntry.js';

export function Review() {
  const { level, term, entryMode, courses, reset } = useDraft();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scoresMode = entryMode === 'scores';

  const parsed: CoursePayload[] = useMemo(
    () =>
      courses.map((c) => {
        const body: CoursePayload = {
          code: c.code.trim(),
          title: c.title.trim(),
          units: Number(c.units),
          grade: (scoresMode ? derivedGrade(c) : c.grade.trim().toUpperCase()) ?? c.grade.trim().toUpperCase()
        };
        if (scoresMode) {
          const ca = c.ca.trim() === '' ? undefined : Number(c.ca);
          const exam = c.exam.trim() === '' ? undefined : Number(c.exam);
          if (ca !== undefined && exam !== undefined) {
            body.ca_score = ca;
            body.exam_score = exam;
          }
        }
        return body;
      }),
    [courses, scoresMode]
  );

  const t = useMemo(() => {
    try {
      return totals(
        parsed.map((c) => ({ code: c.code, title: c.title ?? '', units: c.units, grade: c.grade as Grade }))
      );
    } catch {
      return null;
    }
  }, [parsed]);

  async function save() {
    if (!t || !entryMode) {
      setError('These courses cannot be calculated. Go back and check each row.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.createSemester({ level, term, entryMode, courses: parsed });
      reset();
      navigate('/semesters/new/result', {
        state: { level: `${level} Level`, term, gp: t.gpa, units: t.units }
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scr">
      <div className="topbar">
        <button className="backbtn" onClick={() => navigate('/semesters/new/courses')} aria-label="Back">
          ←
        </button>
        <div>
          <div className="screentitle">Review your GPA</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {level} Level · {term} · {entryMode ? modeLabel(entryMode) : ''}
          </div>
        </div>
      </div>

      <div className="statgrid">
        <Stat label="Courses" value={parsed.length} />
        <Stat label="Credit Units" value={t?.units ?? '-'} />
        <Stat label="Quality Points" value={t ? t.qualityPoints : '-'} />
        <Stat label="GPA" value={t ? fmt(t.gpa) : '-'} highlighted />
      </div>

      <div className="sect" style={{ marginTop: 4 }}>
        Courses
      </div>
      <div className="card">
        {parsed.map((c, i) => {
          const total = c.ca_score !== undefined && c.exam_score !== undefined ? courseTotal(c.ca_score, c.exam_score) : null;
          const meta =
            total === null
              ? `${c.units} units`
              : `${c.units} units · CA ${c.ca_score} · Exam ${c.exam_score} · Total ${total}`;
          return <CourseRow key={`${c.code}-${i}`} code={c.code} title={c.title ?? ''} meta={meta} grade={c.grade as Grade} />;
        })}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="twobtn">
        <button className="btn btn--ghost" disabled={busy} onClick={() => navigate('/semesters/new/courses')}>
          Edit Courses
        </button>
        <button className="btn btn--primary" style={{ width: 'auto', flex: 1 }} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save GPA'}
        </button>
      </div>
    </section>
  );
}
