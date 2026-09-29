// Degree classification bands for the 5.0 CGPA scale.
// Configurable here, never hardcoded in UI components.
export interface ClassBand {
  min: number;
  max: number;
  label: string;
}

export const CLASS_BANDS: ClassBand[] = [
  { min: 4.5, max: 5, label: 'First Class' },
  { min: 3.5, max: 4.49, label: 'Second Class Upper' },
  { min: 2.4, max: 3.49, label: 'Second Class Lower' },
  { min: 1.5, max: 2.39, label: 'Third Class' },
  { min: 1, max: 1.49, label: 'Pass' },
  { min: 0, max: 0.99, label: 'Fail' }
];

export function classifyCgpa(cgpa: number): string {
  const band = CLASS_BANDS.find((b) => cgpa >= b.min && cgpa <= b.max);
  return band ? band.label : 'Unclassified';
}
