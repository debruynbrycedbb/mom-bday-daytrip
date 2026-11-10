// The map of the day, drawn in code at a consistent scale:
// the family is 34px tall (~1.7 m), so 1 m ≈ 20px. Buildings, trees, roads,
// the car and the dogs all follow that scale; long distances between places
// are shortened so the trip stays a few minutes long.
//
// The ground is painted pixel by pixel in 256px tiles, made on demand.
// Tall things the family can walk behind (trees, gates, lamps) are drawn
// every frame in depth order; everything else is baked into the tiles.
import { mulberry32, hash2, vnoise, bayer, hex, shade, disc, densify } from './pixel.js?v=4';

export const W = 1360;
export const H = 5500;
const CH = 256;      // tile size
const PAD = 100;     // mask margin around a tile (covers the tallest extrusion)

// ---------------------------------------------------------------- layout

// The route. m:'d' = this leg is driven. stop = stop number. sign = signpost offset.
const ROUTE = [
  { x: 590, y: 150, stop: 0 },
  { x: 590, y: 250 },
  { x: 590, y: 340 },
  { x: 566, y: 430 },
  { x: 506, y: 520 },
  { x: 470, y: 620, stop: 1, sign: [70, -4] },
  { x: 476, y: 716 },
  { x: 530, y: 800 },
  { x: 586, y: 890 },
  { x: 640, y: 1010, stop: 2, sign: [66, -4] },
  { x: 650, y: 1130 },
  { x: 640, y: 1240 },
  { x: 602, y: 1350 },
  { x: 590, y: 1450 },
  { x: 590, y: 1560 },
  { x: 590, y: 1640 },
  // the park
  { x: 588, y: 1730 },
  { x: 540, y: 1830 },
  { x: 504, y: 1930 },
  { x: 530, y: 2030, chase: true },
  { x: 606, y: 2130 },
  { x: 636, y: 2230 },
  { x: 620, y: 2330 },
  { x: 600, y: 2420, board: true },
  // the drive
  { x: 700, y: 2500, m: 'd' },
  { x: 860, y: 2580, m: 'd' },
  { x: 1000, y: 2700, m: 'd' },
  { x: 1060, y: 2860, m: 'd' },
  { x: 1000, y: 3000, m: 'd' },
  { x: 900, y: 3080, m: 'd' },
  { x: 700, y: 3170, m: 'd' },
  { x: 460, y: 3290, m: 'd' },
  { x: 300, y: 3460, m: 'd' },
  { x: 280, y: 3660, m: 'd' },
  { x: 420, y: 3830, m: 'd' },
  { x: 620, y: 3930, m: 'd' },
  { x: 840, y: 4020, m: 'd' },
  { x: 980, y: 4170, m: 'd' },
  { x: 1020, y: 4380, m: 'd' },
  { x: 1010, y: 4560, m: 'd' },
  { x: 1000, y: 4690, m: 'd', park: true },
  // Bagni di Lucca on foot
  { x: 960, y: 4780 },
  { x: 850, y: 4846 },
  { x: 705, y: 4860, stop: 3, sign: [-72, -2] },
  { x: 640, y: 4950 },
  { x: 580, y: 5060 },
  { x: 552, y: 5160 },
  { x: 545, y: 5215, stop: 4, sign: [-74, -2] },
];

const RIVER = [
  [1400, 2300], [1250, 2480], [1240, 2700], [1250, 2950], [1180, 3150], [1020, 3340],
  [840, 3470], [680, 3600], [580, 3780], [530, 3960], [440, 4170], [320, 4380],
  [250, 4620], [210, 4900], [170, 5200], [150, 5560],
].map(([x, y]) => ({ x, y }));

// Lucca's walls: a rounded rectangle 110px (≈5.5 m, shortened) deep and 56px high
const WALL = { cx: 590, cy: 910, hx: 470, hy: 650, r: 140 };
const BAND = 110;
const WALL_H = 56;
const BASTIONS = [[120, 560], [120, 1260], [1060, 560], [1060, 1260], [330, 260], [850, 260], [330, 1560], [850, 1560]];
const GATES = [{ x: 590, n: 260, s: 370 }, { x: 590, n: 1450, s: 1560 }];

// Piazza dell'Anfiteatro: an oval ring of 3-storey houses
const PIAZZA = { x: 640, y: 1010, ix: 170, iy: 115, ox: 255, oy: 185, h: 92 };
const TOWER = { x: 340, y: 1210, w: 50, d: 40, h: 196 }; // Torre Guinigi

// The park, south of the walls (hedge border)
const PARK = { x: 280, y: 1690, w: 660, h: 650, hedge: 12, hedgeH: 18 };
const FOUNTAIN = { x: 400, y: 1950, rx: 38, ry: 26 };
const BEDS = [
  { x: 604, y: 1992, rx: 36, ry: 18 },  // the lizard hides in this one
  { x: 720, y: 1820, rx: 44, ry: 20 },
  { x: 430, y: 2120, rx: 40, ry: 18 },
];
const PARK_LOOP = (() => {
  const pts = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) pts.push({ x: FOUNTAIN.x + Math.cos(a) * 82, y: FOUNTAIN.y + Math.sin(a) * 62 });
  return pts;
})();
const PARK_SIDE = [{ x: 560, y: 2190 }, { x: 470, y: 2250 }, { x: 380, y: 2260 }, { x: 330, y: 2200 }];

// Where the chase happens: the lizard's route around the lawn, and its tree
export const CHASE = {
  spawn: { x: 604, y: 1990 },
  path: [
    [604, 1990], [665, 1948], [745, 1902], [845, 1912], [895, 1958], [812, 1968],
    [725, 1990], [690, 2060], [742, 2124], [836, 2126],
  ].map(([x, y]) => ({ x, y })),
  tree: { x: 840, y: 2122, img: 'tree1-l' },
};

const CARPARKS = [
  { x: 470, y: 2378, w: 300, h: 110 },
  { x: 900, y: 4640, w: 230, h: 104 },
];
const SPA = { x: 550, y: 4660, w: 300, roofD: 70, floors: 2 };
const POOL = { x: 350, y: 4700, w: 180, h: 104 };
const HILL = { x: 556, y: 5230, r: 170 };
const PICNIC = { x: 596, y: 5168 };
const MADDALENA = { x: 1140, y: 2790, w: 210 }; // Ponte della Maddalena

export const LABELS = [
  { text: 'Lucca', x: 360, y: 168 },
  { text: 'Torre Guinigi', x: TOWER.x, y: TOWER.y - TOWER.h - TOWER.d - 46 },
  { text: "Piazza dell'Anfiteatro", x: PIAZZA.x, y: PIAZZA.y - PIAZZA.oy - PIAZZA.h - 6 },
  { text: 'Serchio valley', x: 1120, y: 2560 },
  { text: 'Ponte della Maddalena', x: MADDALENA.x + MADDALENA.w / 2, y: MADDALENA.y - 56 },
  { text: 'Bagni di Lucca', x: 1090, y: 4590 },
];
export const POOL_RECT = POOL;
export const HILL_SPOT = HILL;
export const FOUNTAIN_SPOT = FOUNTAIN;

// ---------------------------------------------------------------- shapes

const sdRR = (x, y) => {
  const qx = Math.abs(x - WALL.cx) - WALL.hx + WALL.r;
  const qy = Math.abs(y - WALL.cy) - WALL.hy + WALL.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - WALL.r;
};
const sdWall = (x, y) => {
  let d = sdRR(x, y);
  for (const [bx, by] of BASTIONS) {
    const dd = (Math.abs(x - bx) + Math.abs(y - by) - 70) / 1.4142;
    if (dd < d) d = dd;
  }
  return d;
};
const gateCut = (x, y) => GATES.some((g) => Math.abs(x - g.x) < 44 && y > g.n - 30 && y < g.s + 30);
const inWall = (x, y) => sdWall(x, y) < 0 && sdRR(x, y) > -BAND && !gateCut(x, y);
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;

// ---------------------------------------------------------------- palettes

const P = hex;
const C = {
  grass: ['#4f7d37', '#5b8a3c', '#679740', '#74a347'].map(P),
  woods: ['#2f5530', '#38603a', '#436c3b'].map(P),
  lawn: ['#79aa4e', '#83b456'].map(P),
  parkLawn: ['#7db552', '#74ac4b'].map(P),
  cobble: ['#c9b28c', '#b8a07a', '#d8c4a0', '#a68d69'].map(P),
  plaza: ['#5e6e79', '#687884', '#55646e'].map(P),
  gravel: ['#d9c7a2', '#c8b48d', '#e6d6b4'].map(P),
  dirt: ['#d3b688', '#c2a374', '#e0c79b'].map(P),
  asphalt: ['#6d6862', '#7a756e', '#625d58'].map(P),
  brick: ['#9a5838', '#8d4e32', '#a35f3c'].map(P),
  mortar: P('#6c3925'),
  stone: ['#cdb894', '#bba57f', '#ddc9a5'].map(P),
  water: ['#3b74a5', '#4683b4', '#2f6698'].map(P),
  shallow: ['#5c9dcb', '#6aa9d4'].map(P),
  bank: ['#cdb684', '#bba372', '#d9c493'].map(P),
  hedge: ['#2f6a34', '#3b7a3c', '#255a2b'].map(P),
  roof: ['#c4552f', '#b64a2a', '#cf6a3a', '#a9452b', '#bd5f37'].map(P),
  facade: ['#e9c48a', '#f0d9a8', '#e2a65a', '#f2c9a0', '#dcb67e', '#e7b98f'].map(P),
};
const pick = (arr, v) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(v * arr.length)))];

// ---------------------------------------------------------------- polylines

function polyIndex(pts, cell = 64) {
  const m = new Map();
  pts.forEach((p, i) => {
    if (i % 3) return;
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  });
  return (x, y, r) => {
    let best = Infinity;
    const n = Math.ceil(r / cell);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let j = cy - n; j <= cy + n; j++)
      for (let i = cx - n; i <= cx + n; i++) {
        const list = m.get(`${i},${j}`);
        if (!list) continue;
        for (const p of list) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < best) best = d;
        }
      }
    return best;
  };
}

// ---------------------------------------------------------------- sprites

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// A house in 3/4 view: roof seen from above, then the street-facing facade.
// Ground floor 48px, upper floors 32px; doors are 40px (2 m), taller than Dad.
function makeHouse(w, floors, roofD, seed, opts = {}) {
  const rand = mulberry32(Math.floor(seed * 1e6));
  const groundH = 48, upH = 32;
  const fh = groundH + upH * (floors - 1);
  const h = roofD + fh;
  const c = cv(w, h);
  const g = c.getContext('2d');
  const roof = opts.roof || pick(C.roof, rand());
  const wall = opts.wall || pick(C.facade, rand());
  const ridge = Math.round(roofD * 0.42);
  for (let y = 0; y < roofD; y++) {
    let col = roof;
    if (y < ridge) col = shade(roof, 0.88);
    if (y === ridge || y === ridge + 1) col = shade(roof, 1.22);
    else if ((y - ridge) % 4 === 0) col = shade(col, 0.84);
    if (y >= roofD - 2) col = shade(roof, 0.6);
    g.fillStyle = rgb(col);
    g.fillRect(0, y, w, 1);
    g.fillStyle = rgb(shade(col, 0.9));
    for (let x = (Math.floor(y / 4) % 2) * 4; x < w; x += 8) if ((y - ridge) % 4 !== 0) g.fillRect(x, y, 1, 1);
  }
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash2(x + seed * 999, y);
      g.fillStyle = rgb(n < 0.12 ? shade(wall, 0.94) : n > 0.94 ? shade(wall, 1.05) : wall);
      g.fillRect(x, roofD + y, 1, 1);
    }
  }
  g.fillStyle = rgb(shade(wall, 1.12)); g.fillRect(0, roofD, w, 2);
  g.fillStyle = rgb(shade(wall, 0.72)); g.fillRect(0, h - 5, w, 5);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, roofD + 2, w, 2);
  const shutter = opts.shutter || (rand() < 0.75 ? '#3e6b45' : '#7a4a2a');
  const cols = Math.max(1, Math.floor((w - 10) / 28));
  const step = (w - 4) / cols;
  for (let f = 1; f < floors; f++) {
    const wy = roofD + 6 + (floors - 1 - f) * upH;
    for (let k = 0; k < cols; k++) {
      const wx = Math.round(2 + step * k + step / 2 - 5);
      g.fillStyle = '#2f2622'; g.fillRect(wx, wy, 10, 16);
      g.fillStyle = '#4a5d66'; g.fillRect(wx + 1, wy + 1, 8, 7);
      g.fillStyle = shutter; g.fillRect(wx - 4, wy, 4, 16); g.fillRect(wx + 10, wy, 4, 16);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let s = 2; s < 16; s += 3) { g.fillRect(wx - 4, wy + s, 4, 1); g.fillRect(wx + 10, wy + s, 4, 1); }
      g.fillStyle = rgb(shade(wall, 1.15)); g.fillRect(wx - 4, wy + 16, 18, 2);
    }
  }
  const gy = h - groundH;
  const doorX = Math.round(w * (0.3 + rand() * 0.4)) - 9;
  g.fillStyle = '#2f2622'; g.fillRect(doorX - 1, gy + 6, 22, 42); g.fillRect(doorX + 1, gy + 4, 18, 2);
  g.fillStyle = '#6b4329'; g.fillRect(doorX, gy + 7, 20, 41);
  g.fillStyle = '#7d5234'; g.fillRect(doorX + 2, gy + 9, 7, 37); g.fillRect(doorX + 11, gy + 9, 7, 37);
  g.fillStyle = '#e8d7b0'; g.fillRect(doorX + 15, gy + 28, 2, 2);
  if (opts.shop ?? rand() < 0.45) {
    const sx = doorX > w / 2 ? 6 : doorX + 28;
    const sw = Math.min(40, w - sx - 6);
    if (sw > 18) {
      g.fillStyle = '#2f2622'; g.fillRect(sx, gy + 18, sw, 26);
      g.fillStyle = '#5e7984'; g.fillRect(sx + 2, gy + 20, sw - 4, 22);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(sx + 3, gy + 21, 3, 10);
      const aw = ['#c8423a', '#2e8f7a', '#3e6b9e', '#d6872c'][Math.floor(rand() * 4)];
      for (let x = sx - 3; x < sx + sw + 3; x++) {
        g.fillStyle = Math.floor((x - sx) / 5) % 2 ? '#fff3df' : aw;
        g.fillRect(x, gy + 8, 1, 8);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx - 3, gy + 16, sw + 6, 2);
    }
  }
  g.fillStyle = '#2a1a14';
  g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h); g.fillRect(0, h - 1, w, 1);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(w - 4, roofD, 3, fh - 1);
  return c;
}

function makeUmbrella() {
  const c = cv(56, 62);
  const g = c.getContext('2d');
  // table and chairs on the ground
  g.fillStyle = 'rgba(30,30,40,0.3)'; g.fillRect(10, 54, 36, 6);
  for (const [x, y] of [[8, 48], [40, 48]]) {
    g.fillStyle = '#7a4e33'; g.fillRect(x, y - 10, 8, 4); g.fillRect(x, y - 6, 2, 8); g.fillRect(x + 6, y - 6, 2, 8);
    g.fillStyle = '#5a3a2a'; g.fillRect(x, y - 14, 8, 4);
  }
  disc(g, 28, 46, 8, '#e9e2d4');
  g.fillStyle = '#b9b0a2'; g.fillRect(20, 47, 17, 2);
  g.fillStyle = '#5a5048'; g.fillRect(27, 48, 2, 8);
  // pole and canopy
  g.fillStyle = '#4a4038'; g.fillRect(27, 16, 2, 32);
  for (let y = 0; y < 18; y++) {
    const half = Math.round(27 * Math.sin(((y + 4) / 22) * Math.PI * 0.5));
    for (let x = -half; x <= half; x++) {
      const stripe = Math.floor((x + 40) / 7) % 2;
      g.fillStyle = Math.abs(x) === half || y === 17 ? '#2a1a14' : y > 13 ? '#d9cdb5' : stripe ? '#f6efe0' : '#efe5d0';
      g.fillRect(28 + x, y, 1, 1);
    }
  }
  return c;
}

function makeTower() {
  const { w, d, h } = TOWER;
  const total = d + h + 40;
  const c = cv(w + 30, total);
  const g = c.getContext('2d');
  const ox = 15, top = 40;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mortar = y % 6 === 0 || (x + (Math.floor(y / 6) % 2) * 6) % 12 === 0;
      g.fillStyle = mortar ? '#6c3925' : hash2(x, y) < 0.3 ? '#a35f3c' : '#9a5838';
      g.fillRect(ox + x, top + d + y, 1, 1);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(ox + w - 8, top + d, 8, h);
  g.fillStyle = '#2a1e1a';
  for (let k = 0; k < 4; k++) { g.fillRect(ox + 12, top + d + 24 + k * 42, 8, 16); g.fillRect(ox + 30, top + d + 24 + k * 42, 8, 16); }
  // the roof garden with its holm oaks
  g.fillStyle = '#7a4129'; g.fillRect(ox, top, w, d);
  g.fillStyle = '#5d8f3f'; g.fillRect(ox + 3, top + 3, w - 6, d - 6);
  disc(g, ox + w / 2, top + 6, 26, '#2f5a2c');
  disc(g, ox + w / 2 - 6, top + 0, 16, '#3f6f36');
  disc(g, ox + w / 2 - 10, top - 6, 7, '#5f9444');
  g.fillStyle = '#2a1a14';
  g.fillRect(ox - 1, top + d, 1, h); g.fillRect(ox + w, top, 1, d + h);
  return { canvas: c, x: TOWER.x - w / 2 - ox, y: TOWER.y - total };
}

function makeSpa() {
  const { w, roofD } = SPA;
  const fh = 84, h = roofD + fh + 8;
  const c = cv(w, h);
  const g = c.getContext('2d');
  const roof = C.roof[3];
  for (let y = 0; y < roofD; y++) {
    let col = y < 30 ? shade(roof, 0.88) : roof;
    if (y === 30 || y === 31) col = shade(roof, 1.25);
    else if (y % 4 === 0) col = shade(col, 0.84);
    g.fillStyle = rgb(col); g.fillRect(0, y, w, 1);
  }
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < w; x++) {
      const vein = Math.abs(Math.sin(x * 0.07 + y * 0.19 + Math.sin(y * 0.05) * 3)) < 0.04;
      g.fillStyle = vein ? '#d6cdbf' : hash2(x, y) < 0.08 ? '#ebe5da' : '#f5f0e7';
      g.fillRect(x, roofD + y, 1, 1);
    }
  g.fillStyle = '#e2dace'; g.fillRect(0, roofD, w, 4);
  g.fillStyle = '#b9b0a2'; g.fillRect(0, roofD + 4, w, 1);
  const mid = Math.round(w / 2);
  for (let j = 0; j < 22; j++) {
    g.fillStyle = j === 0 ? '#b9b0a2' : '#fbf8f2';
    g.fillRect(mid - 6 - j * 3, roofD - 22 + j, 12 + j * 6, 1);
  }
  g.fillStyle = '#d9d0c2'; g.fillRect(mid - 4, roofD - 14, 8, 8);
  for (const dx of [-60, -36, -12, 12, 36, 60]) {
    g.fillStyle = '#ffffff'; g.fillRect(mid + dx - 4, roofD + 6, 8, fh - 10);
    g.fillStyle = '#d4cbbd'; g.fillRect(mid + dx + 2, roofD + 6, 2, fh - 10);
    g.fillStyle = '#e7e0d4'; g.fillRect(mid + dx - 6, roofD + 6, 12, 3); g.fillRect(mid + dx - 6, roofD + fh - 6, 12, 3);
  }
  g.fillStyle = 'rgba(80,70,60,0.18)'; g.fillRect(mid - 70, roofD + 10, 140, fh - 14);
  for (const wx of [18, 48, 78, w - 98, w - 68, w - 38]) {
    g.fillStyle = '#2f2622'; g.fillRect(wx, roofD + 14, 18, 26); g.fillRect(wx + 2, roofD + 12, 14, 2);
    g.fillStyle = '#5f8792'; g.fillRect(wx + 2, roofD + 16, 14, 22);
    g.fillStyle = '#2f2622'; g.fillRect(wx, roofD + 52, 18, 22);
    g.fillStyle = '#5f8792'; g.fillRect(wx + 2, roofD + 54, 14, 18);
  }
  g.fillStyle = '#2f2622'; g.fillRect(mid - 13, roofD + fh - 44, 26, 44);
  g.fillStyle = '#6b4329'; g.fillRect(mid - 11, roofD + fh - 42, 22, 42);
  g.fillStyle = '#7d5234'; g.fillRect(mid - 9, roofD + fh - 40, 8, 38); g.fillRect(mid + 1, roofD + fh - 40, 8, 38);
  g.fillStyle = '#e6dfd3'; g.fillRect(mid - 40, roofD + fh, 80, 4);
  g.fillStyle = '#cfc6b7'; g.fillRect(mid - 46, roofD + fh + 4, 92, 4);
  g.fillStyle = '#2a1a14';
  g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, roofD + fh); g.fillRect(w - 1, 0, 1, roofD + fh);
  g.fillRect(0, roofD + fh - 1, mid - 46, 1); g.fillRect(mid + 46, roofD + fh - 1, w, 1);
  return { canvas: c, x: SPA.x, y: SPA.y, door: { x: SPA.x + mid, y: SPA.y + roofD + fh + 6 } };
}

function makePool() {
  const { w, h } = POOL;
  const c = cv(w + 12, h + 14);
  const g = c.getContext('2d');
  g.fillStyle = '#efe7d8'; g.fillRect(0, 0, w + 12, h + 12);
  g.fillStyle = '#c9c0b0'; g.fillRect(0, h + 10, w + 12, 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const tile = (Math.floor(x / 14) + Math.floor(y / 14)) % 2;
      g.fillStyle = y < 6 ? '#2f8085' : tile ? '#4aa9ae' : '#43a0a6';
      if (hash2(x, y) < 0.04) g.fillStyle = '#7bcfd0';
      g.fillRect(6 + x, 6 + y, 1, 1);
    }
  g.fillStyle = '#2a1a14';
  g.fillRect(0, 0, w + 12, 1); g.fillRect(0, 0, 1, h + 12); g.fillRect(w + 11, 0, 1, h + 12);
  return { canvas: c, x: POOL.x - 6, y: POOL.y - 6 };
}

function makeFountain() {
  const { rx, ry } = FOUNTAIN;
  const c = cv(rx * 2 + 8, ry * 2 + 50);
  const g = c.getContext('2d');
  const cx = rx + 4, cy = ry + 40;
  for (let y = -ry - 4; y <= ry + 6; y++)
    for (let x = -rx - 4; x <= rx + 4; x++) {
      const e = ell(x, y, 0, 0, rx, ry);
      const e2 = ell(x, y - 6, 0, 0, rx, ry);
      if (e2 < 1 && e >= 1) { g.fillStyle = '#b8ab95'; g.fillRect(cx + x, cy + y, 1, 1); }
      if (e < 1) {
        g.fillStyle = e > 0.78 ? '#e4dccb' : e > 0.7 ? '#2f6c80' : hash2(x, y) < 0.06 ? '#9fd6e6' : '#4f9fbd';
        g.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  g.fillStyle = '#d9d0bf'; g.fillRect(cx - 4, cy - 30, 8, 30);
  g.fillStyle = '#b8ab95'; g.fillRect(cx + 2, cy - 30, 2, 30);
  disc(g, cx, cy - 32, 10, '#e4dccb');
  disc(g, cx, cy - 33, 7, '#4f9fbd');
  g.fillStyle = '#e4dccb'; g.fillRect(cx - 2, cy - 42, 4, 9);
  return { canvas: c, x: FOUNTAIN.x - cx, y: FOUNTAIN.y - cy };
}

function makeBench() {
  const c = cv(40, 22);
  const g = c.getContext('2d');
  g.fillStyle = '#2a1a14'; g.fillRect(2, 8, 2, 13); g.fillRect(36, 8, 2, 13);
  g.fillStyle = '#8a5a35'; g.fillRect(0, 2, 40, 4); g.fillRect(0, 9, 40, 4); g.fillRect(0, 14, 40, 3);
  g.fillStyle = '#a5703f'; g.fillRect(0, 2, 40, 1); g.fillRect(0, 9, 40, 1); g.fillRect(0, 14, 40, 1);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(1, 20, 38, 2);
  return c;
}

function makePicnic() {
  const c = cv(80, 110);
  const g = c.getContext('2d');
  const bx = 8, by = 60;
  for (let j = 0; j < 40; j++)
    for (let i = 0; i < 64; i++) {
      g.fillStyle = (Math.floor(i / 8) + Math.floor(j / 8)) % 2 ? '#fff3df' : '#c8423a';
      g.fillRect(bx + i, by + j, 1, 1);
    }
  g.fillStyle = '#7a4e33'; g.fillRect(bx + 26, by + 18, 12, 2);
  g.fillStyle = '#f6d6e1'; g.fillRect(bx + 27, by + 11, 10, 3);
  g.fillStyle = '#e88aa8'; g.fillRect(bx + 27, by + 14, 10, 4);
  g.fillStyle = '#fff3df'; g.fillRect(bx + 29, by + 8, 1, 3); g.fillRect(bx + 32, by + 8, 1, 3); g.fillRect(bx + 35, by + 8, 1, 3);
  g.fillStyle = '#8a5a35'; g.fillRect(bx + 46, by + 12, 12, 8);
  g.fillStyle = '#a5703f'; g.fillRect(bx + 46, by + 12, 12, 2);
  for (const [x, y, col] of [[62, 10, '#d8423a'], [70, 4, '#f2c14b'], [76, 14, '#4f9bd9']]) {
    g.fillStyle = '#2a1a14'; g.fillRect(x, y + 6, 1, by + 4 - y - 6);
    disc(g, x, y, 5, col);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - 2, y - 2, 2, 2);
  }
  return { canvas: c, x: PICNIC.x - bx, y: PICNIC.y - by };
}

function makeMaddalena() {
  const { w } = MADDALENA;
  const c = cv(w + 4, 90);
  const g = c.getContext('2d');
  const base = 64;
  for (let i = 0; i <= w; i++) {
    const t = i / w;
    const hump = Math.round(Math.pow(Math.sin(Math.PI * t), 1.4) * 46);
    const top = base - hump;
    g.fillStyle = '#6b5a45'; g.fillRect(i + 2, top - 3, 1, 3);
    g.fillStyle = '#c3ad8a'; g.fillRect(i + 2, top, 1, 6);
    g.fillStyle = '#a99270'; g.fillRect(i + 2, top + 6, 1, 3);
    // stone under the deck, opening into the big arch
    const a = (t - 0.16) / 0.68;
    const archTop = a > 0 && a < 1 ? base + 20 - Math.round(Math.sin(Math.PI * a) * 52) : base + 20;
    if (archTop > top + 9) { g.fillStyle = '#b39c78'; g.fillRect(i + 2, top + 9, 1, archTop - top - 9); }
  }
  return { canvas: c, x: MADDALENA.x - 2, y: MADDALENA.y - base };
}

function makeCypress(seed) {
  const w = 26, h = 116;
  const c = cv(w, h);
  const g = c.getContext('2d');
  for (let y = 0; y < h - 4; y++) {
    const t = y / (h - 4);
    const half = Math.max(1, Math.round(11 * Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.55), 0.7) * (t > 0.9 ? 1 - (t - 0.9) * 3 : 1)));
    for (let x = -half; x <= half; x++) {
      const edge = Math.abs(x) === half;
      const light = x < -half * 0.3 && bayer(x + 50, y) < 0.6 + hash2(x + seed, y) * 0.3;
      g.fillStyle = edge ? '#132a18' : light ? '#33613a' : hash2(x, y + seed) < 0.15 ? '#1a3a22' : '#22472a';
      g.fillRect(13 + x, y, 1, 1);
    }
  }
  g.fillStyle = '#5a3e27'; g.fillRect(12, h - 5, 3, 5);
  return c;
}

function makeLamp() {
  const c = cv(14, 74);
  const g = c.getContext('2d');
  g.fillStyle = '#2a2622'; g.fillRect(5, 12, 3, 58); g.fillRect(3, 68, 7, 6);
  g.fillStyle = '#4a4540'; g.fillRect(6, 12, 1, 56);
  g.fillStyle = '#2a2622'; g.fillRect(1, 0, 11, 13);
  g.fillStyle = '#ffe7a0'; g.fillRect(3, 3, 7, 8);
  g.fillStyle = '#fff6d0'; g.fillRect(4, 4, 3, 4);
  return c;
}

// Lucca's gate: a tower over the passage, with an arch you can see through
function makeGate(gate) {
  const w = 150, depth = gate.s - gate.n, hgt = WALL_H + 36;
  const c = cv(w, depth + hgt);
  const g = c.getContext('2d');
  for (let y = 0; y < depth; y++) {
    let col = y < depth * 0.45 ? shade(C.roof[1], 0.88) : C.roof[1];
    if (Math.abs(y - Math.round(depth * 0.45)) < 2) col = shade(C.roof[1], 1.25);
    else if (y % 4 === 0) col = shade(col, 0.84);
    g.fillStyle = rgb(col); g.fillRect(0, y, w, 1);
  }
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const joint = y % 10 === 0 || (x + (Math.floor(y / 10) % 2) * 12) % 24 === 0;
      g.fillStyle = joint ? '#a8936f' : hash2(x, y) < 0.2 ? '#d6c19b' : '#c9b38d';
      g.fillRect(x, depth + y, 1, 1);
    }
  g.fillStyle = '#ddc9a5'; g.fillRect(0, depth, w, 4);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, depth + 4, w, 2);
  // cut the arch out so the family shows through it
  const ax = w / 2, archW = 34, archH = 64;
  const bottom = depth + hgt;
  for (let y = 0; y < archH; y++)
    for (let x = -archW; x <= archW; x++) {
      const above = y - (archH - archW); // height into the round top
      if (above <= 0 || x * x + above * above < archW * archW) g.clearRect(ax + x, bottom - 1 - y, 1, 1);
    }
  g.fillStyle = '#7d6a4f';
  for (let a = 0; a <= Math.PI; a += 0.02) {
    const x = Math.round(ax + Math.cos(a) * (archW + 1));
    const y = Math.round(bottom - 1 - (archH - archW) - Math.sin(a) * (archW + 1));
    g.fillRect(x - 1, y - 1, 3, 3);
  }
  g.fillRect(ax - archW - 3, bottom - (archH - archW), 3, archH - archW);
  g.fillRect(ax + archW + 1, bottom - (archH - archW), 3, archH - archW);
  g.fillStyle = '#2a1a14';
  g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, bottom); g.fillRect(w - 1, 0, 1, bottom);
  return { canvas: c, x: gate.x - w / 2, y: gate.s - bottom, sortY: gate.s };
}

// ---------------------------------------------------------------- world

export function buildWorld(assets) {
  const r = densify(ROUTE, 1);
  const pts = r.pts;
  for (const p of pts) p.mode = ROUTE[p.seg + 1].m === 'd' ? 'drive' : 'walk';
  const ctrl = (key) => r.ctrlD[ROUTE.findIndex((c) => c[key])];
  const stops = [];
  ROUTE.forEach((c, i) => {
    if (c.stop === undefined) return;
    const sign = c.sign || [0, 0];
    stops[c.stop] = { d: r.ctrlD[i], x: c.x, y: c.y, sx: c.x + sign[0], sy: c.y + sign[1] };
  });
  const boardD = ctrl('board'), parkD = ctrl('park'), chaseD = ctrl('chase');
  const boardPt = ROUTE.find((c) => c.board), parkPt = ROUTE.find((c) => c.park);
  const river = densify(RIVER, 2).pts;
  const loop = densify(PARK_LOOP, 2).pts;
  const side = densify(PARK_SIDE, 2).pts;
  const nearRoute = polyIndex(pts);
  const nearRiver = polyIndex(river);
  const isWalk = (p) => p.mode === 'walk' || Math.abs(p.d - boardD) < 3;
  const isDrive = (p) => p.mode === 'drive';

  const rand = mulberry32(2024);
  const baked = [];   // drawn into tiles
  const sprites = []; // drawn each frame, in depth order
  const rects = [];   // occupied areas, for placing things
  const occupied = (x, y, w, h) => rects.some((q) => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y);
  const occupy = (x, y, w, h) => rects.push({ x, y, w, h });

  // ---- Lucca: rows of houses facing the streets
  const houseOk = (x, y, w, h) => {
    for (let yy = y; yy <= y + h; yy += 10)
      for (let xx = x; xx <= x + w; xx += 10) {
        if (nearRoute(xx, yy, 60) < 46) return false;
        if (ell(xx, yy, PIAZZA.x, PIAZZA.y, PIAZZA.ox + 24, PIAZZA.oy + 24) < 1) return false;
        if (ell(xx, yy, PIAZZA.x, PIAZZA.y - PIAZZA.h, PIAZZA.ox + 24, PIAZZA.oy + 24) < 1) return false;
        if (xx > TOWER.x - 60 && xx < TOWER.x + 60 && yy > TOWER.y - 280 && yy < TOWER.y + 30) return false;
      }
    if (sdRR(x, y + h) > -BAND - 6 || sdRR(x + w, y + h) > -BAND - 6) return false;
    if (sdRR(x, y) > -BAND + WALL_H || sdRR(x + w, y) > -BAND + WALL_H) return false;
    return true;
  };
  for (let yb = 1440; yb >= 430; yb -= 200) {
    let x = 236 + Math.floor(rand() * 20);
    while (x < 940) {
      const w = 70 + Math.floor(rand() * 64);
      const floors = rand() < 0.55 ? 3 : 2;
      const roofD = 40 + Math.floor(rand() * 6);
      const h = roofD + 48 + 32 * (floors - 1);
      if (x + w <= 948 && houseOk(x, yb - h, w, h)) baked.push({ canvas: makeHouse(w, floors, roofD, rand()), x, y: yb - h, sortY: yb });
      x += w + (rand() < 0.15 ? 26 : 0);
    }
  }
  // café tables under umbrellas in the piazza (umbrellas ≈2.5 m across)
  const umbrella = makeUmbrella();
  for (const [x, y] of [[548, 1062], [600, 1104], [730, 1092], [786, 1034], [520, 990]]) sprites.push({ img: umbrella, x, y, kind: 'umbrella' });
  const tower = makeTower();
  baked.push({ ...tower, sortY: TOWER.y });

  // ---- Bagni di Lucca
  const spa = makeSpa();
  baked.push({ canvas: spa.canvas, x: spa.x, y: spa.y, sortY: spa.y + spa.canvas.height });
  occupy(SPA.x - 20, SPA.y - 20, SPA.w + 40, spa.canvas.height + 40);
  const pool = makePool();
  baked.push({ ...pool, sortY: POOL.y + POOL.h });
  occupy(POOL.x - 24, POOL.y - 24, POOL.w + 48, POOL.h + 48);
  CARPARKS.forEach((c) => occupy(c.x - 20, c.y - 20, c.w + 40, c.h + 40));
  occupy(HILL.x - HILL.r, HILL.y - HILL.r, HILL.r * 2, HILL.r * 2);
  occupy(PARK.x - 30, PARK.y - 30, PARK.w + 60, PARK.h + 60);
  occupy(MADDALENA.x - 20, MADDALENA.y - 80, MADDALENA.w + 40, 120);
  const clearOfPaths = (x, y, w, h, m = 50) => {
    for (let yy = y; yy <= y + h; yy += 12)
      for (let xx = x; xx <= x + w; xx += 12) {
        if (nearRoute(xx, yy, m + 60) < m + 40) return false;
        if (nearRiver(xx, yy, m + 100) < m + 76) return false;
      }
    return true;
  };
  for (let n = 0, made = 0; n < 900 && made < 18; n++) {
    const w = 76 + Math.floor(rand() * 50), floors = rand() < 0.5 ? 3 : 2, roofD = 40 + Math.floor(rand() * 6);
    const h = roofD + 48 + 32 * (floors - 1);
    const x = 300 + Math.floor(rand() * 1000), y = 4360 + Math.floor(rand() * 1000);
    if (x + w > W - 10 || occupied(x - 20, y - 20, w + 40, h + 40) || !clearOfPaths(x, y, w, h, 12)) continue;
    baked.push({ canvas: makeHouse(w, floors, roofD, rand()), x, y, sortY: y + h });
    occupy(x, y, w, h);
    made++;
  }
  baked.push({ ...makePicnic(), sortY: PICNIC.y + 40 });

  // ---- the park
  const fountain = makeFountain();
  baked.push({ ...fountain, sortY: FOUNTAIN.y + FOUNTAIN.ry });
  const bench = makeBench();
  for (const [x, y] of [[452, 1856], [694, 2232], [470, 1712]]) baked.push({ canvas: bench, x: x - 20, y: y - 20, sortY: y });
  const lamp = makeLamp();
  for (const [x, y] of [[546, 1760], [454, 1990], [584, 2200], [660, 1780]]) sprites.push({ img: lamp, x, y, kind: 'lamp' });
  const parkTrees = [
    ['tree2-l', 356, 1806], ['tree3-l', 330, 2128], ['tree2-m', 880, 1796], ['tree3-m', 450, 2290],
    ['tree1-m', 740, 2300], ['tree3-m', 900, 2240],
  ];
  for (const [img, x, y] of parkTrees) sprites.push({ img: assets[img], x, y, kind: 'tree' });
  const chaseTree = { img: assets[CHASE.tree.img], x: CHASE.tree.x, y: CHASE.tree.y, kind: 'tree', id: 'chase' };
  sprites.push(chaseTree);

  // ---- Lucca's gates, and the trees along the top of the walls
  for (const gate of GATES) sprites.push({ ...makeGate(gate), kind: 'gate' });
  {
    const { cx, cy, hx, hy } = WALL;
    const inset = BAND / 2, R = WALL.r - inset;
    const x0 = cx - hx + WALL.r, x1 = cx + hx - WALL.r, y0 = cy - hy + WALL.r, y1 = cy + hy - WALL.r;
    const ring = [];
    for (let x = x0; x <= x1; x += 74) { ring.push([x, cy - hy + inset]); ring.push([x, cy + hy - inset]); }
    for (let y = y0 + 74; y < y1; y += 74) { ring.push([cx - hx + inset, y]); ring.push([cx + hx - inset, y]); }
    for (const [ccx, ccy, a0] of [[x1, y0, -Math.PI / 2], [x1, y1, 0], [x0, y1, Math.PI / 2], [x0, y0, Math.PI]])
      for (let k = 1; k < 3; k++) { const a = a0 + (Math.PI / 2) * (k / 3); ring.push([ccx + Math.cos(a) * R, ccy + Math.sin(a) * R]); }
    ring.forEach(([x, y], i) => {
      if (GATES.some((g) => Math.abs(x - g.x) < 120 && y > g.n - 40 && y < g.s + 40)) return;
      sprites.push({ img: assets[`olive${1 + (i % 3)}`], x: Math.round(x), y: Math.round(y) - WALL_H + 4, sortY: Math.round(y) + 30, kind: 'tree' });
    });
  }

  // ---- countryside: fields, olive groves, woods, cypresses, farmhouses
  const fields = [];
  const countryOk = (x, y, w, h) =>
    x > 10 && y > 10 && x + w < W - 10 && y + h < H - 10 && !occupied(x - 16, y - 16, w + 32, h + 32) &&
    clearOfPaths(x, y, w, h, 40) && sdWall(x, y) > 150 && sdWall(x + w, y) > 150 && sdWall(x, y + h) > 150 && sdWall(x + w, y + h) > 150;
  for (let n = 0; n < 2500 && fields.length < 26; n++) {
    const w = 160 + Math.floor(rand() * 220), h = 110 + Math.floor(rand() * 130);
    const x = Math.floor(rand() * (W - w)), y = Math.floor(rand() * (H - h));
    if (!countryOk(x, y, w, h)) continue;
    const type = ['vines', 'wheat', 'lavender', 'olives', 'plough', 'vines'][Math.floor(rand() * 6)];
    fields.push({ x, y, w, h, type });
    occupy(x, y, w, h);
    if (type === 'olives') {
      for (let yy = y + 70; yy <= y + h; yy += 66)
        for (let xx = x + 44; xx <= x + w - 44; xx += 92) sprites.push({ img: assets[`olive${1 + Math.floor(rand() * 3)}`], x: xx + Math.floor(rand() * 10), y: yy, kind: 'tree' });
    }
  }
  for (let n = 0, made = 0; n < 1500 && made < 9; n++) {
    const w = 80 + Math.floor(rand() * 40), roofD = 40, floors = rand() < 0.5 ? 2 : 1;
    const h = roofD + 48 + 32 * (floors - 1);
    const x = Math.floor(rand() * (W - w)), y = 1700 + Math.floor(rand() * 2700);
    if (!countryOk(x, y, w, h)) continue;
    baked.push({ canvas: makeHouse(w, floors, roofD, rand(), { wall: P(['#d9c7a2', '#e2cfa8', '#cdb894'][made % 3]), shop: false }), x, y, sortY: y + h });
    occupy(x - 30, y - 30, w + 60, h + 60);
    made++;
  }
  // cypress alleys along the road
  const cypress = [makeCypress(1), makeCypress(7), makeCypress(13)];
  for (let i = 0; i < pts.length; i += 64) {
    const p = pts[i];
    if (p.mode !== 'drive' || p.y < 2560 || (p.y > 3150 && p.y < 3750) || p.y > 4450) continue;
    const t = pts[Math.min(pts.length - 1, i + 2)];
    const tx = t.x - p.x, ty = t.y - p.y, L = Math.hypot(tx, ty) || 1;
    for (const s of [-1, 1]) {
      const x = Math.round(p.x - (ty / L) * 70 * s), y = Math.round(p.y + (tx / L) * 70 * s);
      if (nearRiver(x, y, 140) < 100 || nearRoute(x, y, 80) < 60 || occupied(x - 12, y - 20, 24, 24)) continue;
      sprites.push({ img: cypress[Math.floor(i / 64) % 3], x, y, kind: 'tree' });
    }
  }
  // free-standing trees and woods
  const treeImgs = ['tree1-m', 'tree2-m', 'tree3-m', 'tree1-l', 'tree2-l', 'tree3-l'];
  const placed = [];
  for (let n = 0; n < 9000 && placed.length < 420; n++) {
    const x = 20 + Math.floor(rand() * (W - 40)), y = 60 + Math.floor(rand() * (H - 80));
    const forest = vnoise(x, y, 300, 9) > 0.6;
    if (!forest && rand() < 0.55) continue;
    if (occupied(x - 40, y - 20, 80, 40) || !clearOfPaths(x - 30, y - 10, 60, 20, 30)) continue;
    if (sdWall(x, y) < 160) continue;
    if (placed.some((q) => Math.abs(q.x - x) < (forest ? 96 : 140) && Math.abs(q.y - y) < (forest ? 56 : 90))) continue;
    const roll = rand();
    const img = roll < 0.18 ? cypress[Math.floor(rand() * 3)] : roll < 0.45 ? assets[`olive${1 + Math.floor(rand() * 3)}`] : assets[treeImgs[Math.floor(rand() * 6)]];
    placed.push({ x, y });
    sprites.push({ img, x, y, kind: 'tree' });
  }

  baked.sort((a, b) => a.sortY - b.sortY);
  for (const s of sprites) {
    const src = s.img || s.canvas;
    s.w = src.width; s.h = src.height;
    if (s.sortY === undefined) s.sortY = s.y;
  }
  const BUCKET = 200;
  const buckets = [];
  for (const s of sprites) {
    const b = Math.floor(s.sortY / BUCKET);
    (buckets[b] = buckets[b] || []).push(s);
  }

  // ---- tiles ---------------------------------------------------------
  const tiles = new Map();
  const S = CH + PAD * 2;
  const maskCanvas = cv(S, S);
  const mg = maskCanvas.getContext('2d', { willReadFrequently: true });
  const madd = makeMaddalena();

  function strokeLine(list, width, keep) {
    mg.lineWidth = width;
    mg.beginPath();
    let pen = false;
    for (const p of list) {
      if (keep && !keep(p)) { pen = false; continue; }
      if (!pen) { mg.moveTo(p.x, p.y); pen = true; } else mg.lineTo(p.x, p.y);
    }
    mg.stroke();
  }
  // Three passes; each colour channel holds one mask
  function masks(mx, my) {
    const out = [];
    const passes = [
      [['#ff0000', () => strokeLine(pts, 76, isWalk)], ['#00ff00', () => strokeLine(pts, 80, isDrive)], ['#0000ff', () => strokeLine(river, 140)]],
      [['#ff0000', () => strokeLine(pts, 70, isDrive)], ['#00ff00', () => strokeLine(pts, 90, isDrive)], ['#0000ff', () => strokeLine(river, 168)]],
      [['#ff0000', () => { strokeLine(loop, 44); strokeLine(side, 40); }], ['#00ff00', () => strokeLine(river, 84)], ['#0000ff', () => strokeLine(river, 152)]],
    ];
    for (const pass of passes) {
      mg.globalCompositeOperation = 'source-over';
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.fillStyle = '#000';
      mg.fillRect(0, 0, S, S);
      mg.globalCompositeOperation = 'lighter';
      mg.setTransform(1, 0, 0, 1, -mx, -my);
      mg.lineCap = 'round'; mg.lineJoin = 'round';
      for (const [col, draw] of pass) { mg.strokeStyle = col; draw(); }
      mg.setTransform(1, 0, 0, 1, 0, 0);
      out.push(mg.getImageData(0, 0, S, S).data);
    }
    mg.globalCompositeOperation = 'source-over';
    return out;
  }

  function paintTile(tx, ty) {
    const x0 = tx * CH, y0 = ty * CH;
    const mx = x0 - PAD, my = y0 - PAD;
    const [A, B, Cm] = masks(mx, my);
    const m = (arr, ch, X, Y) => {
      const i = ((Y - my) * S + (X - mx)) * 4 + ch;
      return i >= 0 && i < arr.length && arr[i] > 127;
    };
    const tileFields = fields.filter((f) => f.x < x0 + CH && f.x + f.w > x0 && f.y < y0 + CH && f.y + f.h > y0);
    const canvas = cv(CH, CH);
    const g = canvas.getContext('2d');
    const img = g.createImageData(CH, CH);
    const D = img.data;
    const nearWalls = sdWall(x0 + CH / 2, y0 + CH / 2) < CH + WALL_H + 20 && sdRR(x0 + CH / 2, y0 + CH / 2) > -BAND - WALL_H - CH;
    const nearRing = Math.abs(x0 + CH / 2 - PIAZZA.x) < PIAZZA.ox + CH && y0 + CH > PIAZZA.y - PIAZZA.oy - PIAZZA.h - 10 && y0 < PIAZZA.y + PIAZZA.oy + 10;
    const nearPark = x0 + CH > PARK.x - 4 && x0 < PARK.x + PARK.w + 4 && y0 + CH > PARK.y - PARK.hedgeH - 4 && y0 < PARK.y + PARK.h + 4;
    const ringF = (X, Y) =>
      ell(X, Y, PIAZZA.x, PIAZZA.y, PIAZZA.ox, PIAZZA.oy) < 1 && ell(X, Y, PIAZZA.x, PIAZZA.y, PIAZZA.ix, PIAZZA.iy) >= 1 && !m(A, 0, X, Y);
    const hedgeF = (X, Y) => {
      const inOuter = X >= PARK.x && X < PARK.x + PARK.w && Y >= PARK.y && Y < PARK.y + PARK.h;
      const inInner = X >= PARK.x + PARK.hedge && X < PARK.x + PARK.w - PARK.hedge && Y >= PARK.y + PARK.hedge && Y < PARK.y + PARK.h - PARK.hedge;
      return inOuter && !inInner && !m(A, 0, X, Y);
    };
    const inParkRect = (X, Y) => X >= PARK.x && X < PARK.x + PARK.w && Y >= PARK.y && Y < PARK.y + PARK.h;

    for (let y = 0; y < CH; y++) {
      const Y = y0 + y;
      for (let x = 0; x < CH; x++) {
        const X = x0 + x;
        const h1 = hash2(X, Y);
        const dith = bayer(X, Y) - 0.5;
        let c = null;

        // 1. Lucca's walls: the grassy top, and the brick faces
        if (nearWalls) {
          const d0 = sdWall(X, Y);
          if (d0 < WALL_H + 1 && sdRR(X, Y) > -BAND - WALL_H - 1) {
            if (inWall(X, Y + WALL_H)) {
              const gy = Y + WALL_H, sw = sdWall(X, gy), sr = sdRR(X, gy);
              if (sw > -4 || sr < -BAND + 4) c = pick(C.stone, h1);
              else if (Math.abs(sr + 55) < 9 && sr < -4) c = pick(C.gravel, h1);
              else c = C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
            } else {
              for (let t = WALL_H - 1; t >= 0;) {
                const yy = Y + t;
                if (inWall(X, yy)) {
                  if (t >= WALL_H - 4) c = pick(C.stone, h1);
                  else if (t < 2) c = shade(C.brick[1], 0.7);
                  else {
                    const mortar = t % 6 === 0 || (X + (Math.floor(t / 6) % 2) * 6) % 12 === 0;
                    c = mortar ? C.mortar : pick(C.brick, h1);
                  }
                  break;
                }
                const dist = gateCut(X, yy) ? 1 : Math.max(sdWall(X, yy), -BAND - sdRR(X, yy));
                t -= Math.max(1, Math.floor(dist));
              }
            }
          }
        }

        // 2. the oval ring of houses around the piazza
        if (!c && nearRing && Math.abs(X - PIAZZA.x) < PIAZZA.ox + 2 && Y > PIAZZA.y - PIAZZA.oy - PIAZZA.h - 2 && Y < PIAZZA.y + PIAZZA.oy + 2) {
          const PH = PIAZZA.h;
          const seg = Math.floor(((Math.atan2(Y - PIAZZA.y, X - PIAZZA.x) + Math.PI) / (Math.PI * 2)) * 18);
          if (ringF(X, Y + PH)) {
            const em = ell(X, Y + PH, PIAZZA.x, PIAZZA.y, (PIAZZA.ix + PIAZZA.ox) / 2, (PIAZZA.iy + PIAZZA.oy) / 2);
            const roof = shade(C.roof[0], 0.96 + hash2(seg, 4) * 0.08);
            c = Math.abs(em - 1) < 0.035 ? shade(roof, 1.25) : Y % 4 === 0 ? shade(roof, 0.85) : em < 1 ? shade(roof, 0.92) : roof;
          } else {
            for (let t = PH - 1; t >= 0; t--) {
              if (!ringF(X, Y + t)) continue;
              const wall = C.facade[(seg * 7) % C.facade.length];
              const ax = (X + seg * 7) % 36;
              if (t >= PH - 4) c = shade(wall, 1.12);
              else if (t < 2) c = shade(wall, 0.65);
              else if (t < 34) {
                // arcade of shop arches on the ground floor
                const archTop = 26 + Math.round(Math.sqrt(Math.max(0, 81 - (ax - 18) ** 2)) * 0.6);
                c = ax > 8 && ax < 28 && t < archTop - 2 ? (t < 3 ? P('#4a3a2e') : P('#3b2a20')) : wall;
              } else {
                const wx = (X + seg * 5) % 26;
                const row = (t > 44 && t < 60) || (t > 70 && t < 86);
                if (row && wx > 6 && wx < 19) c = wx < 9 || wx > 16 ? P('#3e6b45') : P('#2f2622');
                else c = h1 < 0.1 ? shade(wall, 0.95) : wall;
              }
              break;
            }
          }
        }

        // 3. the park hedge (1 m tall)
        if (!c && nearPark) {
          if (hedgeF(X, Y + PARK.hedgeH)) c = pick(C.hedge, vnoise(X, Y, 4) + dith * 0.3);
          else for (let t = PARK.hedgeH - 1; t >= 0; t--) if (hedgeF(X, Y + t)) { c = t < 3 ? P('#1d4a22') : shade(pick(C.hedge, h1), 0.8); break; }
        }

        if (!c) {
          const dr = sdRR(X, Y);
          if (dr < -BAND) {
            if (ell(X, Y, PIAZZA.x, PIAZZA.y, PIAZZA.ix, PIAZZA.iy) < 1) {
              const e = ell(X, Y, PIAZZA.x, PIAZZA.y, PIAZZA.ix, PIAZZA.iy);
              c = e > 0.9 ? C.plaza[2] : X % 12 === 0 || Y % 12 === 0 ? shade(C.plaza[0], 0.92) : pick(C.plaza, h1 * 0.7);
            } else {
              const pave = (X + (Math.floor(Y / 6) % 2) * 5) % 10 === 0 || Y % 6 === 0;
              c = pave ? C.cobble[1] : h1 < 0.08 ? C.cobble[3] : h1 > 0.92 ? C.cobble[2] : C.cobble[0];
            }
          } else if (gateCut(X, Y) && sdWall(X, Y) < 0) {
            c = shade(C.cobble[(X + Y) % 6 === 0 ? 1 : 0], 0.55); // under the gate
          } else if (m(A, 1, X, Y) || m(B, 1, X, Y)) {
            const overWater = m(B, 2, X, Y);
            const inner = m(B, 0, X, Y), lane = m(A, 1, X, Y);
            if (overWater) c = !lane ? P('#7a664d') : !inner ? P('#a8936f') : (X + Y) % 9 === 0 ? P('#b39c78') : P('#c4af8c');
            else c = !lane ? P('#46413d') : !inner ? P('#e8e2d0') : pick(C.asphalt, h1);
          } else if (CARPARKS.some((p) => X >= p.x && X < p.x + p.w && Y >= p.y && Y < p.y + p.h)) {
            const p = CARPARKS.find((q) => X >= q.x && X < q.x + q.w && Y >= q.y && Y < q.y + q.h);
            const line = (X - p.x) % 60 < 2 && Y - p.y > 8 && Y - p.y < 40;
            c = line ? P('#f4efe2') : pick(C.gravel, h1 * 0.9);
          } else if (m(A, 0, X, Y)) {
            c = nearPark && inParkRect(X, Y) ? pick(C.gravel, h1) : pick(C.dirt, h1);
          } else if (nearPark && m(Cm, 0, X, Y) && inParkRect(X, Y)) {
            c = pick(C.gravel, h1);
          } else if (m(A, 2, X, Y)) {
            c = m(Cm, 1, X, Y) ? pick(C.water, 0.7 + h1 * 0.3) : vnoise(X, Y, 10, 2) + dith * 0.3 > 0.58 ? C.water[1] : C.water[0];
          } else if (m(Cm, 2, X, Y)) {
            c = C.shallow[h1 < 0.5 ? 0 : 1];
          } else if (m(B, 2, X, Y)) {
            c = h1 < 0.03 ? P('#5f8a3c') : pick(C.bank, h1);
          } else if (sdWall(X, Y) < 120) {
            c = C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
          } else if (nearPark && inParkRect(X, Y)) {
            const bed = BEDS.find((b) => ell(X, Y, b.x, b.y, b.rx, b.ry) < 1);
            if (bed) {
              const e = ell(X, Y, bed.x, bed.y, bed.rx, bed.ry);
              c = e > 0.8 ? P('#c9c0b0') : h1 < 0.18 ? P(['#f29bb7', '#f6d55c', '#fff7e8', '#e0533f'][Math.floor(hash2(Y, X) * 4)]) : h1 < 0.55 ? P('#3f7a35') : P('#6b4a2f');
            } else {
              c = C.parkLawn[Math.floor((X - PARK.x) / 30) % 2]; // mown stripes
              if (h1 < 0.05) c = shade(c, 0.88);
            }
          } else if (Math.hypot(X - HILL.x, Y - HILL.y) < HILL.r) {
            const dd = Math.hypot(X - HILL.x, Y - HILL.y) / HILL.r;
            c = P(dd + dith * 0.2 > 0.82 ? '#79a84b' : '#87b656');
            if (h1 < 0.03) c = P(['#f29bb7', '#f6d55c', '#fff7e8'][Math.floor(hash2(Y, X) * 3)]);
          } else {
            const f = tileFields.find((q) => X >= q.x && X < q.x + q.w && Y >= q.y && Y < q.y + q.h);
            if (f) c = fieldPixel(f, X, Y, h1, dith);
            else if (vnoise(X, Y, 300, 9) + dith * 0.06 > 0.6) c = pick(C.woods, vnoise(X, Y, 14, 3) + dith * 0.5);
            else {
              const n = vnoise(X, Y, 60) * 0.65 + vnoise(X, Y, 12, 5) * 0.35;
              c = pick(C.grass, n + dith * 0.25);
              if (h1 < 0.012) c = shade(c, 0.82);
              else if (h1 > 0.997) c = P(['#f6d55c', '#fff7e8', '#c9a2e0'][Math.floor(hash2(Y, X) * 3)]);
            }
          }
        }
        const p = (y * CH + x) * 4;
        D[p] = c[0]; D[p + 1] = c[1]; D[p + 2] = c[2]; D[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    for (const b of baked) {
      if (b.x > x0 + CH || b.x + b.canvas.width < x0 || b.y > y0 + CH || b.y + b.canvas.height < y0) continue;
      g.drawImage(b.canvas, b.x - x0, b.y - y0);
    }
    if (madd.x < x0 + CH && madd.x + madd.canvas.width > x0 && madd.y < y0 + CH && madd.y + madd.canvas.height > y0) {
      g.drawImage(madd.canvas, madd.x - x0, madd.y - y0);
    }
    return canvas;
  }

  const TW = Math.ceil(W / CH), TH = Math.ceil(H / CH);
  const key = (tx, ty) => tx + ty * 1000;
  function tile(tx, ty) {
    let t = tiles.get(key(tx, ty));
    if (!t) { t = paintTile(tx, ty); tiles.set(key(tx, ty), t); }
    return t;
  }

  // Draw the ground for a view; paints at most `budget` missing tiles
  function drawGround(g, cx, cy, vw, vh, budget = 6) {
    const tx0 = Math.max(0, Math.floor(cx / CH)), tx1 = Math.min(TW - 1, Math.floor((cx + vw) / CH));
    const ty0 = Math.max(0, Math.floor(cy / CH)), ty1 = Math.min(TH - 1, Math.floor((cy + vh) / CH));
    let missing = 0;
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!tiles.has(key(tx, ty))) {
          if (budget <= 0) { g.fillStyle = '#5b8a3c'; g.fillRect(tx * CH - cx, ty * CH - cy, CH, CH); missing++; continue; }
          budget--;
        }
        g.drawImage(tile(tx, ty), tx * CH - cx, ty * CH - cy);
      }
    return missing;
  }
  // Paint one tile ahead of time around a point (call when there's spare time)
  function prefetch(x, y, rad = 420) {
    const tx0 = Math.max(0, Math.floor((x - rad) / CH)), tx1 = Math.min(TW - 1, Math.floor((x + rad) / CH));
    const ty0 = Math.max(0, Math.floor((y - rad) / CH)), ty1 = Math.min(TH - 1, Math.floor((y + rad) / CH));
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) if (!tiles.has(key(tx, ty))) { tile(tx, ty); return true; }
    return false;
  }

  function visibleSprites(cx, cy, vw, vh) {
    const out = [];
    const b0 = Math.floor((cy - 60) / BUCKET), b1 = Math.floor((cy + vh + 300) / BUCKET);
    for (let b = Math.max(0, b0); b <= b1; b++) {
      for (const s of buckets[b] || []) {
        const left = s.img ? s.x - s.w / 2 : s.x, top = s.img ? s.y - s.h : s.y;
        if (left > cx + vw || left + s.w < cx || top > cy + vh || top + s.h < cy) continue;
        out.push(s);
      }
    }
    return out;
  }

  // ---- route helpers
  const L = r.length;
  const tangent = (d) => {
    const c = Math.max(3, Math.min(pts.length - 4, Math.round(d)));
    const a = pts[c - 3], b = pts[c + 3];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  };
  const at = (d) => {
    if (d < 0) { const t = tangent(0); return { x: pts[0].x + t.x * d, y: pts[0].y + t.y * d }; }
    if (d > L - 1) { const t = tangent(L); const e = pts[pts.length - 1]; return { x: e.x + t.x * (d - L), y: e.y + t.y * (d - L) }; }
    const i = Math.floor(d), f = d - i;
    const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const modeAt = (d) => (d > boardD && d < parkD ? 'drive' : 'walk');

  return {
    pts, length: L, stops, boardD, parkD, chaseD, boardPt, parkPt, at, tangent, modeAt,
    river, drawGround, prefetch, visibleSprites, chaseTree, tilesMade: () => tiles.size,
  };
}

function fieldPixel(f, X, Y, h1, dith) {
  const lx = X - f.x, ly = Y - f.y;
  if (lx < 3 || ly < 3 || lx >= f.w - 3 || ly >= f.h - 3) return P(lx < 1 || ly < 1 || lx >= f.w - 1 || ly >= f.h - 1 ? '#3c6630' : '#4f7d37');
  switch (f.type) {
    case 'vines': {
      // rows of vines on posts, about 1.4 m apart
      const r = ly % 28;
      if (r < 10) return r === 0 ? P('#7fb04f') : h1 < 0.18 ? P('#3f6f30') : r > 7 ? P('#3a5f2a') : P('#5b8f3d');
      if (r < 13) return P('#6e5236');
      if (lx % 44 === 0 && r < 20) return P('#5a4030');
      return h1 < 0.3 ? P('#9b7a52') : P('#a8865c');
    }
    case 'wheat':
      return lx % 6 === 0 ? P('#b8933f') : h1 < 0.2 ? P('#e8c871') : bayer(X, Y) < 0.3 ? P('#cfac52') : P('#dbba5f');
    case 'lavender': {
      const r = ly % 22;
      if (r < 9) return r === 0 ? P('#a996d0') : h1 < 0.25 ? P('#6f5f9c') : P('#8b78b8');
      if (r < 11) return P('#4f4470');
      return P('#7a8a4a');
    }
    case 'olives':
      return h1 < 0.4 + dith * 0.3 ? P('#9aa65a') : P('#a8b366');
    default: // ploughed earth
      return ly % 8 < 3 ? P('#7a5838') : h1 < 0.2 ? P('#a07650') : P('#8f6844');
  }
}
