import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { toSavedSemester } from '../lib/semesters.js';
import type { SavedSemester } from '../lib/semesters.js';
import { fmt } from '../lib/gpa.js';
import { BackBar, CourseRow, EmptyState, Stat } from '../components/ui.js';
import { modeLabel } from '../lib/semesters.js';
import type { SavedCourse } from '../lib/semesters.js';

const dash = (v: number | null): string => (v === null || v === undefined ? '—' : String(v));

function scoreMeta(c: SavedCourse): string {
  const base = `${c.units} ${c.units === 1 ? 'Unit' : 'Units'}`;
  const points = `${c.qualityPoints} ${c.qualityPoints === 1 ? 'Point' : 'Points'}`;
  if (c.caScore === null && c.examScore === null) {
    return `${base} · CA: — · Exam: — · ${c.grade} · ${points}`;
  }
  return `${base} · CA: ${dash(c.caScore)} · Exam: ${dash(c.examScore)} · Total: ${dash(c.totalScore)} · ${c.grade} · ${points}`;
}

export function SemesterDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [semester, setSemester] = useState<SavedSemester | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api
      .semester(id ?? '')
      .then((r) => setSemester(toSavedSemester(r.semester)))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this semester.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function onDelete() {
    if (!id) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await api.deleteSemester(id);
      navigate('/dashboard');
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : 'Could not delete. Try again.');
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <section className="scr">
      <BackBar
        title={semester ? `${semester.level} · ${semester.semester}` : 'Semester'}
        subtitle={semester ? modeLabel(semester.entryMode) : undefined}
        onBack={() => navigate('/dashboard')}
      />
      {loading ? (
        <EmptyState title="Loading…">Fetching this semester’s courses.</EmptyState>
      ) : error || !semester ? (
        <p className="form-error" role="alert">{error || 'Semester not found.'}</p>
      ) : (
        <>
          <div className="statgrid">
            <Stat label="GPA" value={fmt(semester.gp)} />
            <Stat label="Credit Units" value={semester.totalUnits} />
            <Stat label="Quality Points" value={semester.totalPoints} />
            <Stat label="Courses" value={semester.courses.length} numeric={false} />
          </div>
          <div className="sect" style={{ marginTop: 4 }}>
            Courses
          </div>
          <div className="card">
            {semester.courses.map((c) => (
              <CourseRow
                key={c.code}
                code={c.code}
                title={c.title}
                meta={scoreMeta(c)}
                grade={c.grade}
              />
            ))}
          </div>

          <div className="twobtn">
            <button className="btn btn--primary" style={{ width: 'auto', flex: 1 }} onClick={() => navigate(`/semesters/${semester.id}/edit`)}>
              Edit Semester
            </button>
            <button className="btn btn--ghost" style={{ width: 'auto', flex: 1 }} onClick={() => { setDeleteError(''); setConfirming(true); }}>
              Delete
            </button>
          </div>
          <button className="btn btn--dark mt16" onClick={() => navigate(`/semesters/${semester.id}/result`)}>
            Print Result Sheet
          </button>
          {semester.entryMode === 'grade_only' && (
            <button className="btn btn--ghost mt8" onClick={() => navigate(`/semesters/${semester.id}/add-scores`)}>
              Add Scores
            </button>
          )}
        </>
      )}

      {confirming && semester && (
        <div className="dlg-backdrop" onClick={() => !deleting && setConfirming(false)}>
          <div className="dlg" role="alertdialog" aria-modal="true" aria-label="Delete this semester?" onClick={(e) => e.stopPropagation()}>
            <div className="dlg__t">Delete this semester?</div>
            <p className="dlg__p">
              {semester.level} · {semester.semester} and its {semester.courses.length}{' '}
              {semester.courses.length === 1 ? 'course' : 'courses'} will be removed, and your CGPA
              will be recalculated.
            </p>
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="twobtn" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" disabled={deleting} onClick={() => setConfirming(false)} autoFocus>
                Cancel
              </button>
              <button className="btn btn--danger" style={{ width: 'auto', flex: 1 }} disabled={deleting} onClick={onDelete}>
                {deleting ? 'Deleting…' : 'Delete Semester'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
