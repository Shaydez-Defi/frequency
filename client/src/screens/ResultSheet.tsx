import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import type { PublicUser } from '../lib/api.js';
import { toSavedSemester } from '../lib/semesters.js';
import { modeLabel } from '../lib/semesters.js';
import type { SavedSemester } from '../lib/semesters.js';
import { fmt } from '../lib/gpa.js';
import { BackBar, EmptyState } from '../components/ui.js';

const dash = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : String(v));

export function ResultSheet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [semester, setSemester] = useState<SavedSemester | null>(null);
  const [student, setStudent] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.semester(id ?? ''), api.me()])
      .then(([s, m]) => {
        setSemester(toSavedSemester(s.semester));
        setStudent(m.user);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this result sheet.'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <section className="scr">
      <div className="noprint">
        <BackBar title="Result Sheet" onBack={() => navigate(`/semesters/${id}`)} />
      </div>
      {loading ? (
        <EmptyState title="Loading…">Preparing this semester’s result sheet.</EmptyState>
      ) : error || !semester || !student ? (
        <p className="form-error" role="alert">{error || 'Result sheet not found.'}</p>
      ) : (
        <>
          <div className="sheet">
            <h1 className="sheet__title">Result Sheet</h1>
            <dl className="sheet__who">
              <div><dt>Name</dt><dd>{student.fullName}</dd></div>
              <div><dt>Registration Number</dt><dd className="num">{student.regNumber}</dd></div>
              <div><dt>Department</dt><dd>{student.department}</dd></div>
              <div><dt>Level</dt><dd>{semester.level}</dd></div>
              <div><dt>Semester</dt><dd>{semester.semester}</dd></div>
              <div><dt>Entry Mode</dt><dd>{modeLabel(semester.entryMode)}</dd></div>
            </dl>
            <table className="sheet__table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Title</th>
                  <th className="num">Units</th>
                  <th className="num">CA</th>
                  <th className="num">Exam</th>
                  <th className="num">Total</th>
                  <th>Grade</th>
                  <th className="num">GP</th>
                </tr>
              </thead>
              <tbody>
                {semester.courses.map((c) => (
                  <tr key={c.code}>
                    <td>{c.code}</td>
                    <td>{c.title || '—'}</td>
                    <td className="num">{c.units}</td>
                    <td className="num">{dash(c.caScore)}</td>
                    <td className="num">{dash(c.examScore)}</td>
                    <td className="num">{dash(c.totalScore)}</td>
                    <td>{c.grade}</td>
                    <td className="num">{c.qualityPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="sheet__sums">
              <div><dt>Total Credit Units</dt><dd className="num">{semester.totalUnits}</dd></div>
              <div><dt>Total Quality Points</dt><dd className="num">{semester.totalPoints}</dd></div>
              <div><dt>Semester GPA</dt><dd className="num">{fmt(semester.gp)}</dd></div>
            </dl>
            <p className="sheet__note">Generated from student-entered academic records.</p>
          </div>
          <div className="twobtn noprint">
            <button className="btn btn--dark" style={{ flex: 1 }} onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
        </>
      )}
    </section>
  );
}
