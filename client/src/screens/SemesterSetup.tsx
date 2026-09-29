import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEVELS, SEMESTERS } from '../types.js';
import { useDraft } from '../semesters/draft.js';
import { Select } from '../components/Select.js';
import { BackBar } from '../components/ui.js';

function baseLevel(label: string): string {
  return label.replace(/\s*level\s*$/i, '').trim();
}

export function SemesterSetup() {
  const { level, term, count, setSetup } = useDraft();
  const navigate = useNavigate();
  const [levelLabel, setLevelLabel] = useState<string>(level ? `${level} Level` : '300 Level');
  const [semester, setSemester] = useState<string>(term || 'First Semester');
  const [n, setN] = useState(count > 0 ? count : 8);

  function cont() {
    setSetup(baseLevel(levelLabel), semester, n);
    navigate('/semesters/new/courses');
  }

  return (
    <section className="scr">
      <BackBar title="Calculate your GPA" onBack={() => navigate('/dashboard')} />
      <span className="steppill">Step 1 of 3 · Setup</span>
      <div className="steplabel">
        How many courses
        <br />
        are you offering?
      </div>

      <div className="stepper">
        <button type="button" onClick={() => setN((v) => Math.max(1, v - 1))} aria-label="Fewer courses">
          −
        </button>
        <span className="stepper__val num" aria-live="polite">{n}</span>
        <button type="button" onClick={() => setN((v) => Math.min(15, v + 1))} aria-label="More courses">
          +
        </button>
      </div>

      <div className="field">
        <Select label="Level" value={levelLabel} options={LEVELS} onChange={setLevelLabel} />
      </div>
      <div className="field">
        <Select label="Semester" value={semester} options={SEMESTERS} onChange={setSemester} />
      </div>

      <div className="dots" aria-hidden>
        <i className="on" />
        <i />
        <i />
      </div>
      <button className="btn btn--primary" onClick={cont}>
        Continue
      </button>
    </section>
  );
}
