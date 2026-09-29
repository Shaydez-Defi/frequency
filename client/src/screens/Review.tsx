import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import type { CoursePayload } from '../lib/api.js';
import { totals } from '../lib/gpa.js';
import type { Grade } from '../types.js';
import { useDraft } from '../semesters/draft.js';
import { CourseRow, Stat } from '../components/ui.js';
import { fmt } from '../lib/gpa.js';

export function Review() {
  const { level, term, courses, reset } = useDraft();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed: CoursePayload[] = useMemo(
    () =>
      courses.map((c) => ({
        code: c.code.trim(),
        title: c.title.trim(),
        units: Number(c.units),
        grade: c.grade.trim().toUpperCase()
      })),
    [courses]
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
    if (!t) {
      setError('These courses cannot be calculated. Go back and check each row.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.createSemester({ level, term, courses: parsed });
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
            {level} Level · {term}
          </div>
        </div>
      </div>

      <div className="statgrid">
        <Stat label="Courses" value={parsed.length} />
        <Stat label="Credit Units" value={t?.units ?? '—'} />
        <Stat label="Quality Points" value={t ? t.qualityPoints : '—'} />
        <Stat label="GPA" value={t ? fmt(t.gpa) : '—'} highlighted />
      </div>

      <div className="sect" style={{ marginTop: 4 }}>
        Courses
      </div>
      <div className="card">
        {parsed.map((c, i) => (
          <CourseRow key={`${c.code}-${i}`} code={c.code} title={c.title ?? ''} meta={`${c.units} units`} grade={c.grade as Grade} />
        ))}
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
