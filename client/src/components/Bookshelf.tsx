/**
 * SVG bookshelf hero, generated with a seeded PRNG so the illustration
 * is stable across renders. Palette mirrors the reference artwork:
 * teal / orange / mustard / maroon spines on dark wood.
 */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREENS = ['#2F7D68', '#1E5B4B', '#3E8E72', '#27614F', '#7FB5A4'];
const ORANGES = ['#E8912D', '#D97C1E', '#C9661F'];
const MUSTARDS = ['#D9A83E', '#C9942F', '#E0B85C'];
const MAROONS = ['#7A2E3F', '#8C3A4A', '#6B2634'];
const CREAMS = ['#EFE3C8', '#E6D6B4'];
const PALETTE = [...GREENS, ...GREENS, ...ORANGES, ...MUSTARDS, ...MAROONS, ...CREAMS];

export function Bookshelf({ seed = 42 }: { seed?: number }) {
  const rand = mulberry32(seed);
  const W = 420;
  const shelves: string[] = [];

  for (let s = 0; s < 5; s++) {
    const base = 78 + s * 88;
    const hMax = 72;
    let x = 8;
    while (x < W - 12) {
      const w = 14 + rand() * 20;
      const h = hMax * (0.72 + rand() * 0.28);
      const color = PALETTE[Math.floor(rand() * PALETTE.length)];
      const lean = rand() > 0.88;
      const top = base - h;
      if (lean) {
        const angle = (rand() * 10 - 5).toFixed(1);
        shelves.push(
          `<g transform="rotate(${angle} ${(x + w / 2).toFixed(1)} ${base})">` +
            `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}"/>` +
            `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="5" fill="rgba(0,0,0,.18)"/>` +
            `</g>`,
        );
      } else {
        shelves.push(
          `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}"/>`,
        );
        if (rand() > 0.55) {
          shelves.push(
            `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="5" fill="rgba(0,0,0,.18)"/>`,
          );
        }
        if (rand() > 0.8) {
          shelves.push(
            `<rect x="${(x + w / 2 - 1).toFixed(1)}" y="${(top + 12).toFixed(1)}" width="2.4" height="${(h - 22).toFixed(1)}" rx="1" fill="rgba(255,255,255,.28)"/>`,
          );
        }
      }
      x += w + 3 + rand() * 6;
    }
    shelves.push(
      `<rect x="0" y="${base}" width="${W}" height="13" rx="2" fill="#8A5A33"/>`,
      `<rect x="0" y="${base}" width="${W}" height="4" rx="2" fill="#A06B3E"/>`,
    );
  }

  return (
    <svg
      className="hero__shelf"
      viewBox={`0 0 ${W} 470`}
      preserveAspectRatio="xMidYMid slice"
      dangerouslySetInnerHTML={{ __html: `<rect width="${W}" height="470" fill="#4E382A"/>${shelves.join('')}` }}
    />
  );
}
