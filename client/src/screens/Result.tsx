import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { fmt } from '../lib/gpa.js';
import { Icon } from '../components/Icons.js';

interface SavedState {
  level: string;
  term: string;
  gp: number;
  units: number;
}

export function Result() {
  const location = useLocation();
  const navigate = useNavigate();
  const passed = (location.state ?? null) as SavedState | null;
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .semesters()
      .then((r) => setCgpa(r.cgpa))
      .catch(() => setCgpa(null))
      .finally(() => setLoading(false));
  }, []);

  if (!passed) {
    return (
      <section className="scr">
        <p className="muted center">No just-saved semester to show.</p>
        <button className="btn btn--primary mt16" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </section>
    );
  }

  return (
    <section className="scr">
      <div className="resultwrap">
        <div className="rescheck">
          <Icon name="check" size={30} />
        </div>
        <div className="reslbl">YOUR SEMESTER GPA</div>
        <div className="resbig num">{fmt(passed.gp)}</div>
        <div className="resmeta">
          {passed.level} · {passed.term}
        </div>
        <div>
          <span className="resunits num">{passed.units} Credit Units</span>
        </div>
        <div className="resdiv" />
        <div className="rescg">
          <div className="rescg__k">Cumulative CGPA</div>
          <div className="rescg__v num">{loading ? '…' : cgpa !== null ? fmt(cgpa) : '—'}</div>
        </div>
        {cgpa === null && !loading && (
          <p className="form-error" role="alert">Could not load your cumulative CGPA.</p>
        )}
        <button className="btn btn--primary mt24" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    </section>
  );
}
