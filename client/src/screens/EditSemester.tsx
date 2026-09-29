import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import type { CoursePayload } from '../lib/api.js';
import { GRADES } from '../types.js';
import { courseSchema } from '@frequency/shared/schemas';
import { Select } from '../components/Select.js';
import { BackBar, EmptyState } from '../components/ui.js';

interface Row {
  code: string;
  title: string;
  units: string;
  grade: string;
}

const blankRow = (): Row => ({ code: '', title: '', units: '2', grade: '' });

function validUnits(raw: string): number {
  const u = Number(raw);
  return Number.isInteger(u) && u >= 1 && u <= 12 ? u : Number.NaN;
}

export function EditSemester() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    api
      .semester(id ?? '')
      .then((r) => {
        setLevel(r.semester.level);
        setTerm(r.semester.term);
        setRows(
          r.semester.courses.map((c) => ({
            code: c.code,
            title: c.title ?? '',
            units: String(c.units),
            grade: c.grade
          }))
        );
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Could not load this semester.'))
      .finally(() => setLoading(false));
  }, [id]);

  const rowErrors = useMemo(
    () =>
      rows.map((row) => {
        const r = courseSchema.safeParse({
          code: row.code,
          title: row.title,
          units: row.units.trim() === '' ? Number.NaN : Number(row.units),
          grade: row.grade
        });
        return r.success ? [] : r.error.issues.map((i) => i.message);
      }),
    [rows]
  );
  const invalidCount = rowErrors.filter((e) => e.length > 0).length;

  const units = useMemo(() => rows.reduce((s, r) => s + (validUnits(r.units) || 0), 0), [rows]);

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function shiftUnits(index: number, delta: number) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const current = validUnits(r.units);
        return { ...r, units: String(Math.min(12, Math.max(1, (Number.isNaN(current) ? 1 : current) + delta))) };
      })
    );
  }

  async function save() {
    setTried(true);
    if (invalidCount > 0 || rows.length === 0) {
      setError(
        rows.length === 0
          ? 'A semester needs at least one course.'
          : 'Fix the highlighted courses before saving. Your entries are kept.'
      );
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload: CoursePayload[] = rows.map((c) => ({
        code: c.code.trim(),
        title: c.title.trim(),
        units: Number(c.units),
        grade: c.grade.trim().toUpperCase()
      }));
      await api.updateSemester(id ?? '', { level, term, courses: payload });
      navigate(`/semesters/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scr">
      <BackBar
        title="Edit Semester"
        subtitle={level && term ? `${level} Level · ${term}` : undefined}
        onBack={() => navigate(`/semesters/${id}`)}
      />
      {loading ? (
        <EmptyState title="Loading…">Fetching this semester’s courses.</EmptyState>
      ) : loadError || rows.length === 0 && !loading ? (
        <p className="form-error" role="alert">{loadError || 'Semester not found.'}</p>
      ) : (
        <>
          {rows.map((row, i) => (
            <div className="card ccard" key={i}>
              <div className="ccard__head">
                Course <b>{String(i + 1).padStart(2, '0')}</b>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="linklike"
                    style={{ color: 'var(--danger)', fontSize: 13 }}
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove course ${i + 1}`}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                className="ccard__input"
                placeholder="Course Code"
                aria-label={`Course ${i + 1} code`}
                value={row.code}
                onChange={(e) => update(i, { code: e.target.value })}
                autoComplete="off"
              />
              <input
                className="ccard__input"
                placeholder="Course Title"
                aria-label={`Course ${i + 1} title`}
                value={row.title}
                onChange={(e) => update(i, { title: e.target.value })}
                autoComplete="off"
              />
              <div className="units-row">
                <div className="mini-step">
                  <button type="button" onClick={() => shiftUnits(i, -1)} aria-label="Decrease credit units">
                    −
                  </button>
                  <span className="mini-step__v num">{row.units === '' ? '-' : row.units}</span>
                  <button type="button" onClick={() => shiftUnits(i, +1)} aria-label="Increase credit units">
                    +
                  </button>
                  <span className="mini-step__lbl">Credit Units</span>
                </div>
                <Select
                  compact
                  label={`Course ${i + 1} grade`}
                  labelHidden
                  placeholder="Grade"
                  value={row.grade}
                  options={GRADES}
                  onChange={(v) => update(i, { grade: v })}
                />
              </div>
              {tried && rowErrors[i].length > 0 && (
                <ul className="form-error" style={{ paddingLeft: 18, marginBottom: 0 }}>
                  {rowErrors[i].map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {rows.length < 15 && (
            <button type="button" className="btn btn--ghost mt16" onClick={() => setRows((prev) => [...prev, blankRow()])}>
              + Add Course
            </button>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="coursefoot coursefoot--sticky">
            <div>
              <div className="coursefoot__tt">Total Credit Units</div>
              <div className="coursefoot__n num">{units}</div>
            </div>
            <button className="btn btn--dark btn--sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
