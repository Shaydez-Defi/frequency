// Playful GP reactions, tiered exactly on CLASS_BANDS minimums so the top
// tier always matches First Class (currently 4.50). Edit messages here only;
// components call getGpMessage and never hardcode thresholds.
export interface GpMessage {
  min: number;
  stamp: string;
  message: string;
}

export const GP_MESSAGES: GpMessage[] = [
  { min: 4.5, stamp: 'BGS', message: 'Best Graduating Student energy. Frame this GP.' },
  { min: 3.5, stamp: '2:1', message: 'First Class is calling your name. Pick up.' },
  { min: 2.4, stamp: '2:2', message: 'Second Class Lower loading… it still loads.' },
  { min: 1.5, stamp: '3RD', message: 'Third Class things. Your bed is jealous of all that rest.' },
  { min: 1.0, stamp: 'PASS', message: 'A Pass is a Pass. The degree is doing push-ups to carry itself.' },
  { min: 0, stamp: 'F', message: 'Even this GP went on carryover. We move — to the library.' }
];

export function getGpMessage(gp: number | null | undefined): GpMessage {
  if (gp === null || gp === undefined || Number.isNaN(gp)) {
    return { min: 0, stamp: '—', message: 'Save a semester and this space starts talking.' };
  }
  return GP_MESSAGES.find((m) => gp >= m.min) ?? GP_MESSAGES[GP_MESSAGES.length - 1];
}
