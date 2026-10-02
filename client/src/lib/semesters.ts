import type { SemesterRecord } from './api.js';
import type { Course, Grade } from '../types.js';

const VALID_GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Database levels are stored bare ("100"); display always reads "100 Level". */
export function displayLevel(level: string): string {
  return `${level.replace(/\s*level\s*$/i, '').trim()} Level`;
}

export interface SavedCourse extends Course {
  qualityPoints: number;
  caScore: number | null;
  examScore: number | null;
  totalScore: number | null;
}

export interface SavedSemester {
  id: string;
  level: string;
  semester: string;
  courses: SavedCourse[];
  totalUnits: number;
  totalPoints: number;
  gp: number;
  createdAt: string;
}

export function toSavedSemester(r: SemesterRecord): SavedSemester {
  return {
    id: r.id,
    level: displayLevel(r.level),
    semester: r.term,
    courses: r.courses.map((c) => ({
      code: c.code,
      title: c.title ?? '',
      units: c.units,
      grade: (VALID_GRADES.includes(c.grade as Grade) ? c.grade : 'F') as Grade,
      qualityPoints: c.quality_points,
      caScore: c.ca_score,
      examScore: c.exam_score,
      totalScore: c.total_score
    })),
    totalUnits: r.totalUnits,
    totalPoints: r.totalPoints,
    gp: r.gp,
    createdAt: r.createdAt
  };
}

/** Most recent first, ordered by save time. */
export function newestFirst(semesters: SavedSemester[]): SavedSemester[] {
  return [...semesters].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
