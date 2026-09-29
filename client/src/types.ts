export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Course {
  code: string;
  title: string;
  units: number;
  grade: Grade;
}

export interface Semester {
  level: string;
  semester: string;
  courses: Course[];
}

export const LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level'] as const;
export const SEMESTERS = ['First Semester', 'Second Semester'] as const;
export const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'];
