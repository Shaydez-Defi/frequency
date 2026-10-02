import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEVELS, SEMESTERS } from '../types.js';
import type { EntryMode } from '../lib/api.js';
import { useDraft } from '../semesters/draft.js';
import { Select } from '../components/Select.js';
import { BackBar } from '../components/ui.js';

function baseLevel(label: string): string {
  return label.replace(/\s*level\s*$/i, '').trim();
}

const MODES: Array<{ value: EntryMode; title: string; hint: string }> = [
  { value: 'grade_only', title: 'Grade Only', hint: 'I already have my grades.' },
  { value: 'scores', title: 'Scores + Grade', hint: 'I have my CA and exam scores.' }
];

export function SemesterSetup() {
  const { level, term, count, setSetup } = useDraft();
  const navigate = useNavigate();
  const [levelLabel, setLevelLabel] = useState<string>(level ? `${level} Level` : '300 Level');
  const [semester, setSemester] = useState<string>(term || 'First Semester');
  const [n, setN] = useState(count > 0 ? count : 8);
  const [mode, setMode] = useState<EntryMode | ''>('');
  const [modeError, setModeError] = useState(false);

  function cont() {
    if (!mode) {
      setModeError(true);
      return;
    }
    setSetup(baseLevel(levelLabel), semester, n, mode);
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

      <div className="steplabel" style={{ fontSize: 18, marginTop: 8 }}>
        How do you want to enter your results?
      </div>
      <div role="radiogroup" aria-label="Result entry mode" style={{ display: 'grid', gap: 10, marginBottom: 6 }}>
        {MODES.map((m) => {
          const on = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setMode(m.value);
                setModeError(false);
              }}
              className="card"
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                textAlign: 'left',
                width: '100%',
                cursor: 'pointer',
                borderColor: on ? 'var(--teal)' : undefined,
                borderWidth: on ? 2 : undefined
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  minWidth: 20,
                  borderRadius: '50%',
                  marginTop: 2,
                  border: on ? '6px solid var(--teal)' : '2px solid var(--line)',
                  background: '#fff'
                }}
              />
              <span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 16 }}>{m.title}</span>
                <span className="muted">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {modeError && (
        <p className="form-error" role="alert">
          Choose Grade Only or Scores + Grade to continue.
        </p>
      )}

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
