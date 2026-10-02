import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import type { CoursePayload } from '../lib/api.js';
import { courseSchema } from '@frequency/shared/schemas';
import { CA_MAX, EXAM_MAX, courseTotal, gradeForTotal } from '../lib/gpa.js';
import { BackBar, EmptyState } from '../components/ui.js';

interface ScoreRow {
  code: string;
  title: string;
  units: number;
  grade: string;
  ca: string;
  exam: string;
}

function scoreOrUndefined(raw: string): number | undefined {
  const t = raw.trim();
  if (t === '') return undefined;
  return Number(t);
}

// Converts a GRADE ONLY semester to SCORES + GRADE. Every course needs both
// scores before saving; the semester stays grade_only until this succeeds.
export function AddScores() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState('');
  const [isGradeOnly, setIsGradeOnly] = useState(false);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    api
      .semester(id ?? '')
      .then((r) => {
        if (r.semester.entryMode !== 'scores') setIsGradeOnly(true);
        setLevel(r.semester.level);
        setTerm(r.semester.term);
        setRows(
          r.semester.courses.map((c) => ({
            code: c.code,
            title: c.title ?? '',
            units: c.units,
            grade: c.grade,
            ca: c.ca_score === null || c.ca_score === undefined ? '' : String(c.ca_score),
            exam: c.exam_score === null || c.exam_score === undefined ? '' : String(c.exam_score)
          }))
        );
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Could not load this semester.'))
      .finally(() => setLoading(false));
  }, [id]);

  const rowErrors = useMemo(
    () =>
      rows.map((row) => {
        const ca = scoreOrUndefined(row.ca);
        const exam = scoreOrUndefined(row.exam);
        if (ca === undefined || exam === undefined) {
          return ['Enter both CA and exam scores for this course.'];
        }
        const r = courseSchema.safeParse({
          code: row.code,
          title: row.title,
          units: row.units,
          grade: gradeForTotal(ca + exam),
          ca_score: ca,
          exam_score: exam
        });
        return r.success ? [] : r.error.issues.map((i) => i.message);
      }),
    [rows]
  );
  const invalidCount = rowErrors.filter((e) => e.length > 0).length;

  function update(index: number, patch: Partial<ScoreRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    setTried(true);
    if (invalidCount > 0) {
      setError('Enter valid CA and exam scores for every course before saving. Nothing was changed.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const payload: CoursePayload[] = rows.map((c) => {
        const ca = scoreOrUndefined(c.ca) as number;
        const exam = scoreOrUndefined(c.exam) as number;
        return { code: c.code, title: c.title, units: c.units, grade: gradeForTotal(ca + exam), ca_score: ca, exam_score: exam };
      });
      await api.updateSemester(id ?? '', { level, term, entryMode: 'scores', courses: payload });
      navigate(`/semesters/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save scores. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scr">
      <BackBar
        title="Add Scores"
        subtitle={level && term ? `${level} Level · ${term}` : undefined}
        onBack={() => navigate(`/semesters/${id}`)}
      />
      {loading ? (
        <EmptyState title="Loading…">Fetching this semester’s courses.</EmptyState>
      ) : loadError ? (
        <p className="form-error" role="alert">{loadError}</p>
      ) : !isGradeOnly ? (
        <p className="muted">This semester already uses scores. Edit it normally to change them.</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Enter CA and exam scores for every course. Saving converts this semester to Scores + Grade and
            recalculates grades, GPA, and CGPA from your scores.
          </p>
          {rows.map((row, i) => {
            const ca = scoreOrUndefined(row.ca);
            const exam = scoreOrUndefined(row.exam);
            const total = ca !== undefined && exam !== undefined ? courseTotal(ca, exam) : null;
            return (
              <div className="card ccard" key={row.code}>
                <div className="ccard__head">
                  <b>{row.code}</b>
                  <span>
                    {row.units} {row.units === 1 ? 'Unit' : 'Units'} · now {row.grade}
                  </span>
                </div>
                {row.title && <p className="muted" style={{ margin: '0 0 10px' }}>{row.title}</p>}
                <div className="units-row">
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label htmlFor={`a-ca-${i}`}>CA (/{CA_MAX})</label>
                    <input
                      id={`a-ca-${i}`}
                      className="ccard__input"
                      style={{ marginBottom: 0 }}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`${row.code} CA score`}
                      value={row.ca}
                      onChange={(e) => update(i, { ca: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label htmlFor={`a-ex-${i}`}>Exam (/{EXAM_MAX})</label>
                    <input
                      id={`a-ex-${i}`}
                      className="ccard__input"
                      style={{ marginBottom: 0 }}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`${row.code} exam score`}
                      value={row.exam}
                      onChange={(e) => update(i, { exam: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                </div>
                {total !== null && (
                  <p className="muted" style={{ margin: '8px 0 0' }}>
                    Total <strong className="num">{total}</strong> → grade <strong>{gradeForTotal(total)}</strong>
                    {gradeForTotal(total) !== row.grade && (
                      <span> (was {row.grade}, will update on save)</span>
                    )}
                  </p>
                )}
                {tried && rowErrors[i].length > 0 && (
                  <ul className="form-error" style={{ paddingLeft: 18, marginBottom: 0 }}>
                    {rowErrors[i].map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="coursefoot coursefoot--sticky">
            <div>
              <div className="coursefoot__tt">Courses scored</div>
              <div className="coursefoot__n num">
                {rows.length - invalidCount}/{rows.length}
              </div>
            </div>
            <button className="btn btn--dark btn--sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save Scores'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
