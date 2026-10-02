import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { toSavedSemester, newestFirst } from '../lib/semesters.js';
import type { SavedSemester } from '../lib/semesters.js';
import { classify, fmt } from '../lib/gpa.js';
import { useAuth } from '../auth/AuthContext.js';
import { Icon } from '../components/Icons.js';
import { EmptyState } from '../components/ui.js';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [semesters, setSemesters] = useState<SavedSemester[]>([]);
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .semesters()
      .then((r) => {
        // Most recent first, ordered by save time, never hardcoded.
        setSemesters(newestFirst(r.semesters.map(toSavedSemester)));
        setCgpa(r.cgpa);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load records.'))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;
  const firstName = user.fullName.trim().split(/\s+/)[0];
  const hasRecords = semesters.length > 0;

  return (
    <section className="scr">
      <div className="dashhead">
        <div>
          <div className="dashhead__hi">Welcome, {firstName}</div>
          <div className="dashhead__sub">{user.department}</div>
        </div>
        <button className="avatar" onClick={() => navigate('/profile')} aria-label="Profile">
          {user.fullName.charAt(0).toUpperCase()}
        </button>
      </div>

      {loading ? (
        <div className="card"><EmptyState title="Loading…">Fetching your academic records.</EmptyState></div>
      ) : error ? (
        <p className="form-error" role="alert">{error}</p>
      ) : hasRecords && cgpa !== null ? (
        <div className="card cgpacard">
          <span className="cgpacard__bgs">BGS</span>
          <div className="cgpacard__lbl">Cumulative CGPA</div>
          <div className="cgpacard__big num">{fmt(cgpa)}</div>
          <span className="cgpacard__cls">{classify(cgpa)}</span>
        </div>
      ) : (
        <div className="card">
          <EmptyState title="No records yet">
            Your CGPA appears here after you save your first semester. Tap “Calculate your GPA” below to get started.
          </EmptyState>
        </div>
      )}

      <Link className="card calc-card mt16" to="/semesters/new" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="calc-ic">
          <Icon name="formula" size={24} />
        </span>
        <span>
          <span className="calc-card__t">Calculate your GPA</span>
          <span className="calc-card__s">Add a new semester</span>
        </span>
        <span className="plusbtn">
          <Icon name="plus" size={20} />
        </span>
      </Link>

      <div className="sect">Academic history</div>
      <div>
        {hasRecords ? (
          semesters.map((s) => (
            <button
              key={s.id}
              className="card semrow mt8"
              onClick={() => navigate(`/semesters/${s.id}`)}
            >
              <span>
                <span className="semrow__t">
                  {s.level} · {s.semester.replace(' Semester', '')}
                </span>
                <span className="semrow__s num">
                  {s.totalUnits} credit units · {s.courses.length} courses · {s.entryMode === 'scores' ? 'Scores' : 'Grades'}
                </span>
              </span>
              <span className="semrow__gpa num">{fmt(s.gp)}</span>
              <Icon name="chevronDown" size={16} className="semrow__ch" />
            </button>
          ))
        ) : (
          !loading && <EmptyState title="Nothing calculated yet">Your saved semesters will show up here, newest first.</EmptyState>
        )}
      </div>
    </section>
  );
}
