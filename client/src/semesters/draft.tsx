import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EntryMode } from '../lib/api.js';

export interface CourseDraft {
  code: string;
  title: string;
  units: string;
  grade: string;
  ca: string;
  exam: string;
}

interface DraftState {
  started: boolean;
  level: string;
  term: string;
  count: number;
  entryMode: EntryMode | '';
  courses: CourseDraft[];
  setSetup: (level: string, term: string, count: number, entryMode: EntryMode) => void;
  setCourses: (courses: CourseDraft[]) => void;
  updateCourse: (index: number, patch: Partial<CourseDraft>) => void;
  adjustUnits: (index: number, delta: number) => void;
  reset: () => void;
}

const DraftContext = createContext<DraftState | null>(null);

const blankRow = (): CourseDraft => ({ code: '', title: '', units: '', grade: '', ca: '', exam: '' });

export function DraftProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState('');
  const [count, setCount] = useState(0);
  const [entryMode, setEntryMode] = useState<EntryMode | ''>('');
  const [courses, setCoursesState] = useState<CourseDraft[]>([]);
  const [started, setStarted] = useState(false);

  const setSetup = useCallback(
    (nextLevel: string, nextTerm: string, nextCount: number, nextMode: EntryMode) => {
      setLevel(nextLevel);
      setTerm(nextTerm);
      setCount(nextCount);
      setEntryMode(nextMode);
      setStarted(true);
      // Resize rows but keep anything the student already typed.
      setCoursesState((prev) => {
        if (prev.length === nextCount) return prev;
        const next = Array.from({ length: nextCount }, (_, i) => prev[i] ?? blankRow());
        return next;
      });
    },
    []
  );

  const setCourses = useCallback((next: CourseDraft[]) => setCoursesState(next), []);
  const updateCourse = useCallback((index: number, patch: Partial<CourseDraft>) => {
    setCoursesState((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);
  const adjustUnits = useCallback((index: number, delta: number) => {
    setCoursesState((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const current = Number.parseInt(c.units, 10);
        const next = Math.min(12, Math.max(1, (Number.isInteger(current) ? current : 1) + delta));
        return { ...c, units: String(next) };
      })
    );
  }, []);
  const reset = useCallback(() => {
    setLevel('');
    setTerm('');
    setCount(0);
    setEntryMode('');
    setCoursesState([]);
    setStarted(false);
  }, []);

  const value = useMemo(
    () => ({ started, level, term, count, entryMode, courses, setSetup, setCourses, updateCourse, adjustUnits, reset }),
    [started, level, term, count, entryMode, courses, setSetup, setCourses, updateCourse, adjustUnits, reset]
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftState {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft must be used inside DraftProvider');
  return ctx;
}
