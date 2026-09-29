// Configurable grade-to-point mapping. UI and API must import this.
// Never hardcode points inside components or routes.
export const GRADE_POINTS: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0
};

export const VALID_GRADES = Object.keys(GRADE_POINTS);
