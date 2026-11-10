// The map of the day, drawn in code at one scale: about 9px to the metre, so
// Mom and Dad are 15-16px tall. Houses, trees, roads, the car and the dogs
// all follow that scale; long distances between places are shortened so the
// trip stays a few minutes long.
//
// The ground is painted pixel by pixel in 256px tiles, made on demand.
// Things the family can walk behind (trees, gates, lamps, café umbrellas)
// are drawn every frame in depth order; everything else is baked into tiles.
import { mulberry32, hash2, vnoise, bayer, hex, shade, disc, densify } from './pixel.js?v=6';

export const W = 1360;
export const H = 5500;
const CH = 256;      // tile size
const PAD = 100;     // mask margin around a tile

// ---------------------------------------------------------------- layout

// The route. m:'d' = this leg is driven. stop = stop number. sign = signpost offset.
const ROUTE = [
  { x: 590, y: 196, stop: 0 },
  { x: 590, y: 260 },
  { x: 590, y: 316 },
  // Lucca: down the gate street, west, south, then east along the lane to stop 1
  { x: 590, y: 420 },
  { x: 590, y: 500 },
  { x: 588, y: 524 },
  { x: 578, y: 534 },
  { x: 500, y: 534 },
  { x: 396, y: 534 },
  { x: 386, y: 542 },
  { x: 384, y: 560 },
  { x: 384, y: 636 },
  { x: 388, y: 650 },
  { x: 400, y: 654 },
  { x: 470, y: 654, stop: 1, sign: [22, -16] },
  // past the fountain square, then straight through the piazza's two passages
  { x: 600, y: 654 },
  { x: 700, y: 654 },
  { x: 782, y: 654 },
  { x: 793, y: 660 },
  { x: 796, y: 674 },
  { x: 796, y: 760 },
  { x: 796, y: 860, stop: 2, sign: [28, -4] },
  { x: 796, y: 960 },
  { x: 796, y: 1060 },
  { x: 796, y: 1236 },
  { x: 792, y: 1249 },
  { x: 780, y: 1254 },
  { x: 700, y: 1254 },
  { x: 606, y: 1254 },
  { x: 594, y: 1259 },
  { x: 590, y: 1272 },
  { x: 590, y: 1400 },
  { x: 590, y: 1504 },
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
  { x: 705, y: 4860, stop: 3, sign: [-30, -2] },
  { x: 640, y: 4950 },
  { x: 580, y: 5060 },
  { x: 552, y: 5160 },
  { x: 545, y: 5215, stop: 4, sign: [-30, -2] },
];

const RIVER = [
  [1400, 2300], [1250, 2480], [1240, 2700], [1250, 2950], [1180, 3150], [1020, 3340],
  [840, 3470], [680, 3600], [580, 3780], [530, 3960], [440, 4170], [320, 4380],
  [250, 4620], [210, 4900], [170, 5200], [150, 5560],
].map(([x, y]) => ({ x, y }));

// Lucca's walls: a rounded rectangle, a grassy top 56px across, 26px high
const WALL = { cx: 590, cy: 910, hx: 470, hy: 650, r: 140 };
const BAND = 56;
const WALL_H = 26;
const BASTIONS = [[120, 560], [120, 1260], [1060, 560], [1060, 1260], [330, 260], [850, 260], [330, 1560], [850, 1560]];
const GATES = [{ x: 590, n: 260, s: 316 }, { x: 590, n: 1504, s: 1560 }];

// The town inside, laid out like a little grid town: lanes 28px (≈3 m) wide
// with centre lines and zebra crossings, and blocks of houses and gardens.
const ROAD = 28;
const ROADS_V = [384, 590, 796];
const ROADS_H = [414, 534, 654, 774, 894, 1014, 1134, 1254, 1374];
const COLS = [[208, 370], [398, 576], [604, 782], [810, 972]];
const ROWS = [[320, 400], [428, 520], [548, 640], [668, 760], [788, 880], [908, 1000], [1028, 1120], [1148, 1240], [1268, 1360], [1388, 1446]];
const SQUARE = { x: 604, y: 428, w: 178, h: 212 };      // the fountain square
const FOUNT = { x: 693, y: 540 };
const RING_ZONE = { x: 604, y: 668, w: 368, h: 332 };   // paving round the piazza
const SQ_GREENS = [
  { x: 608, y: 432, w: 30, h: 30 }, { x: 748, y: 432, w: 30, h: 30 },
  { x: 608, y: 604, w: 30, h: 32 }, { x: 748, y: 604, w: 30, h: 32 },
];
const SQ_BEDS = [{ x: 660, y: 434, w: 66, h: 7 }];

// Piazza dell'Anfiteatro: an oval ring of 3-storey houses with two passages
// (north and south, 2*PASS wide) cut straight through it for the path
const PIAZZA = { x: 796, y: 860, ix: 120, iy: 78, ox: 168, oy: 125, h: 54 };
const PASS = 14;
const PLAZA_END = PIAZZA.y + Math.round(PIAZZA.iy * Math.sqrt(1 - (PASS / PIAZZA.ix) ** 2)) - PIAZZA.h; // where the south roofs start
const TOWER = { x: 292, y: 990, w: 24, d: 16, h: 92 }; // Torre Guinigi

// The park, south of the walls (hedge border)
const PARK = { x: 280, y: 1690, w: 660, h: 650, hedge: 6, hedgeH: 8 };
const FOUNTAIN = { x: 400, y: 1950, rx: 18, ry: 12 };
const BEDS = [
  { x: 604, y: 1992, rx: 18, ry: 9 },  // the lizard hides in this one
  { x: 720, y: 1820, rx: 22, ry: 10 },
  { x: 430, y: 2120, rx: 20, ry: 9 },
];
const PARK_LOOP = (() => {
  const pts = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) pts.push({ x: FOUNTAIN.x + Math.cos(a) * 40, y: FOUNTAIN.y + Math.sin(a) * 30 });
  return pts;
})();
const PARK_SIDE = [{ x: 560, y: 2190 }, { x: 470, y: 2250 }, { x: 380, y: 2260 }, { x: 330, y: 2200 }];

// Where the chase happens: the lizard's route round the lawn, and its tree
export const CHASE = {
  spawn: { x: 604, y: 1990 },
  path: [
    [604, 1990], [634, 1969], [674, 1946], [724, 1951], [749, 1974], [708, 1979],
    [664, 1990], [647, 2025], [673, 2057], [716, 2058],
  ].map(([x, y]) => ({ x, y })),
  tree: { x: 722, y: 2056, img: 'tree1-l' },
};

const CARPARKS = [
  { x: 545, y: 2404, w: 120, h: 40 },
  { x: 945, y: 4672, w: 110, h: 40 },
];
const SPA = { x: 625, y: 4749, w: 150, roofD: 30 };
const POOL = { x: 470, y: 4770, w: 100, h: 56 };
const HILL = { x: 556, y: 5226, r: 120 };
const PICNIC = { x: 596, y: 5168 };
const MADDALENA = { x: 1140, y: 2790, w: 160 }; // Ponte della Maddalena

export const LABELS = [
  { text: 'Lucca', x: 330, y: 196 },
  { text: 'Torre Guinigi', x: TOWER.x, y: TOWER.y - TOWER.h - TOWER.d - 20 },
  { text: "Piazza dell'Anfiteatro", x: PIAZZA.x + 96, y: PIAZZA.y - PIAZZA.oy - 12 },
  { text: 'Serchio valley', x: 1120, y: 2560 },
  { text: 'Ponte della Maddalena', x: MADDALENA.x + MADDALENA.w / 2, y: MADDALENA.y - 40 },
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
    const dd = (Math.abs(x - bx) + Math.abs(y - by) - 46) / 1.4142;
    if (dd < d) d = dd;
  }
  return d;
};
const gateCut = (x, y) => GATES.some((g) => Math.abs(x - g.x) < 20 && y > g.n - 16 && y < g.s + 16);
const inWall = (x, y) => sdWall(x, y) < 0 && sdRR(x, y) > -BAND && !gateCut(x, y);
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
const inRect = (X, Y, r) => X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h;
// inside the town (clear of the wall; below the corners, clear of the ring road too)
const townInner = (x, y) => sdRR(x, y) < -BAND - (y > 400 ? 30 : 1);

// The piazza's ring, worked out one column at a time. In a column the ring's
// footprint is one stretch [a, b) at the narrow ends of the oval, or two
// (south half, then north half) where the column crosses the square.
// Each stretch shows as a roof lifted PIAZZA.h above it, then its south-facing
// facade down to b. Part s: 1 south, -1 north, 0 a whole column at the ends.
const ringOuter = (dx) => PIAZZA.oy * Math.sqrt(Math.max(0, 1 - (dx / PIAZZA.ox) ** 2));
const ringInner = (dx) => PIAZZA.iy * Math.sqrt(Math.max(0, 1 - (dx / PIAZZA.ix) ** 2));
const ringCache = new Map();
function ringCols(X) {
  let v = ringCache.get(X);
  if (v !== undefined) return v;
  const dx = X + 0.5 - PIAZZA.x;
  v = null;
  if (Math.abs(dx) < PIAZZA.ox && Math.abs(dx) >= PASS) {
    const Ho = Math.round(ringOuter(dx));
    if (Math.abs(dx) < PIAZZA.ix - 1) {
      const Hi = Math.round(ringInner(dx));
      v = [{ a: PIAZZA.y + Hi, b: PIAZZA.y + Ho, s: 1 }, { a: PIAZZA.y - Ho, b: PIAZZA.y - Hi, s: -1 }];
    } else if (Ho > 0) v = [{ a: PIAZZA.y - Ho, b: PIAZZA.y + Ho, s: 0 }];
  }
  ringCache.set(X, v);
  return v;
}
function ringAt(X, Y) {
  const cols = ringCols(X);
  if (!cols) return null;
  for (const iv of cols) if (Y >= iv.a - PIAZZA.h && Y < iv.b) return iv;
  return null;
}

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
  asphalt: ['#6d6862', '#75706a', '#66615c'].map(P),
  brick: ['#9a5838', '#8d4e32', '#a35f3c'].map(P),
  mortar: P('#6c3925'),
  stone: ['#cdb894', '#bba57f', '#ddc9a5'].map(P),
  water: ['#3b74a5', '#4683b4', '#2f6698'].map(P),
  shallow: ['#5c9dcb', '#6aa9d4'].map(P),
  bank: ['#cdb684', '#bba372', '#d9c493'].map(P),
  hedge: ['#2f6a34', '#3b7a3c', '#255a2b'].map(P),
  roof: ['#c4552f', '#b64a2a', '#cf6a3a', '#a9452b', '#bd5f37'].map(P),
  facade: ['#e9c48a', '#f0d9a8', '#e2a65a', '#f2c9a0', '#dcb67e', '#e7b98f', '#f3e3c3'].map(P),
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
const INKS = '#2a1a14';

// A house in 3/4 view: the roof seen from above, then the street-facing
// facade. Ground floor 22px, upper floors 16px; doors 17px, a bit taller than
// Dad. gable: the roof's ridge runs back from a pointed gable end.
function makeHouse(w, floors, roofD, seed, opts = {}) {
  const rand = mulberry32(Math.floor(seed * 1e6) + 1);
  const groundH = 22, upH = 16;
  const fh = groundH + upH * (floors - 1);
  const h = roofD + fh;
  const c = cv(w, h);
  const g = c.getContext('2d');
  const roof = opts.roof || pick(C.roof, rand());
  const wall = opts.wall || pick(C.facade, rand());
  const gable = opts.gable && w >= 20 && w <= 44;
  const mid = w / 2;

  // the roof
  const ridge = Math.round(roofD * 0.42);
  for (let y = 0; y < roofD; y++) {
    for (let x = 0; x < w; x++) {
      let col;
      if (gable) {
        col = x + 0.5 < mid ? shade(roof, 0.86) : roof;
        if (Math.abs(x + 0.5 - mid) < 1) col = shade(roof, 1.2);
        else if (y % 3 === 0) col = shade(col, 0.88);
      } else {
        col = y < ridge ? shade(roof, 0.88) : roof;
        if (y === ridge) col = shade(roof, 1.22);
        else if ((y - ridge) % 3 === 0) col = shade(col, 0.84);
        else if ((x + (Math.floor(y / 3) % 2) * 3) % 6 === 0) col = shade(col, 0.93);
        if (y >= roofD - 1) col = shade(roof, 0.6);
      }
      g.fillStyle = rgb(col); g.fillRect(x, y, 1, 1);
    }
  }
  if (!gable && rand() < 0.4) {
    const cx0 = 3 + Math.floor(rand() * (w - 10));
    const cy0 = Math.max(0, ridge - 5);
    g.fillStyle = '#8d4e32'; g.fillRect(cx0, cy0, 4, 6);
    g.fillStyle = '#5a3a2a'; g.fillRect(cx0, cy0, 4, 1); g.fillRect(cx0 + 3, cy0 + 1, 1, 5);
  }

  // the facade
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < w; x++) {
      const n = hash2(x + seed * 999, y);
      g.fillStyle = rgb(n < 0.12 ? shade(wall, 0.94) : n > 0.94 ? shade(wall, 1.05) : wall);
      g.fillRect(x, roofD + y, 1, 1);
    }
  g.fillStyle = rgb(shade(wall, 1.12)); g.fillRect(0, roofD, w, 1);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, roofD + 1, w, 1);
  g.fillStyle = rgb(shade(wall, 0.72)); g.fillRect(0, h - 2, w, 2);

  if (gable) {
    // the pointed gable end rising into the roof, with a little round window
    const gh = Math.min(roofD - 2, Math.round(w * 0.34));
    for (let j = 1; j <= gh; j++) {
      const half = (w / 2) * (1 - j / (gh + 1));
      for (let x = Math.ceil(mid - half); x < mid + half; x++) {
        const edge = x < mid - half + 2 || x >= mid + half - 2;
        g.fillStyle = edge ? rgb(shade(roof, 0.7)) : rgb(wall);
        g.fillRect(x, roofD - j, 1, 1);
      }
    }
    g.fillStyle = '#2f2622'; g.fillRect(Math.round(mid) - 1, roofD - Math.round(gh / 2) - 1, 2, 2);
  }

  const shutter = opts.shutter || (rand() < 0.75 ? '#3e6b45' : '#7a4a2a');
  const win = (wx, wy, shut) => {
    g.fillStyle = '#2f2622'; g.fillRect(wx, wy, 5, 7);
    g.fillStyle = '#4a5d66'; g.fillRect(wx + 1, wy + 1, 3, 3);
    g.fillStyle = '#3c4c55'; g.fillRect(wx + 1, wy + 4, 3, 2);
    if (shut) { g.fillStyle = shutter; g.fillRect(wx - 2, wy, 2, 7); g.fillRect(wx + 5, wy, 2, 7); }
    g.fillStyle = rgb(shade(wall, 1.15)); g.fillRect(wx - (shut ? 2 : 1), wy + 7, shut ? 9 : 7, 1);
  };
  const cols = Math.max(1, Math.floor((w - 4) / 12));
  const step = (w - 2) / cols;
  for (let f = 1; f < floors; f++) {
    const wy = roofD + 4 + (floors - 1 - f) * upH;
    for (let k = 0; k < cols; k++) win(Math.round(1 + step * k + step / 2 - 2.5), wy, step >= 10);
  }
  const gy = h - groundH;
  const doorX = Math.max(2, Math.min(w - 10, Math.round(w * (0.3 + rand() * 0.4)) - 4));
  g.fillStyle = '#2f2622'; g.fillRect(doorX - 1, gy + 4, 10, 18);
  g.fillStyle = '#6b4329'; g.fillRect(doorX, gy + 5, 8, 17);
  g.fillStyle = '#7d5234'; g.fillRect(doorX + 1, gy + 6, 2, 14); g.fillRect(doorX + 5, gy + 6, 2, 14);
  g.fillStyle = '#e8d7b0'; g.fillRect(doorX + 6, gy + 13, 1, 1);
  const sx = doorX > w / 2 ? 3 : doorX + 12;
  const room = doorX > w / 2 ? doorX - 6 : w - sx - 3;
  if ((opts.shop ?? rand() < 0.4) && room >= 9) {
    const sw = Math.min(14, room);
    g.fillStyle = '#2f2622'; g.fillRect(sx, gy + 9, sw, 11);
    g.fillStyle = '#5e7984'; g.fillRect(sx + 1, gy + 10, sw - 2, 9);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(sx + 2, gy + 11, 1, 4);
    const aw = ['#c8423a', '#2e8f7a', '#3e6b9e', '#d6872c'][Math.floor(rand() * 4)];
    for (let x = sx - 1; x < sx + sw + 1; x++) {
      g.fillStyle = Math.floor((x - sx) / 2) % 2 ? '#fff3df' : aw;
      g.fillRect(x, gy + 5, 1, 4);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx - 1, gy + 9, sw + 2, 1);
  } else if (room >= 7) {
    win(doorX > w / 2 ? Math.max(3, Math.round(doorX / 2) - 2) : Math.round((doorX + 10 + w) / 2) - 2, gy + 6, false);
  }
  g.fillStyle = INKS;
  g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h); g.fillRect(0, h - 1, w, 1);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(w - 3, roofD, 2, fh - 1);
  c.door = doorX; // so gardens can keep the doorway clear
  return c;
}

// A low garden bush (≈0.8 m), sometimes in flower
function makeBush(seed) {
  const rand = mulberry32(seed);
  const w = 9 + Math.floor(rand() * 3), h = 7;
  const c = cv(w, h);
  const g = c.getContext('2d');
  const flower = rand() < 0.5 ? ['#f29bb7', '#f6d55c', '#fff7e8', '#e0533f'][Math.floor(rand() * 4)] : null;
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      const e = ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - (h - 1) / 2) / ((h - 1) / 2)) ** 2;
      if (e > 1) continue;
      const lit = x < w * 0.45 && y < h * 0.45;
      let col = e > 0.6 ? '#1d4a22' : lit ? '#5f9a48' : hash2(x + seed, y) < 0.25 ? '#2f6a34' : '#3b7a3c';
      if (flower && e < 0.6 && hash2(y + seed, x) < 0.3) col = flower;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = 'rgba(25,20,15,0.3)'; g.fillRect(1, h - 1, w - 2, 1);
  return c;
}

// A small round-headed garden tree (≈3 m)
function makeGardenTree(seed) {
  const rand = mulberry32(seed);
  const r = 6 + Math.floor(rand() * 3);
  const w = r * 2 + 4, h = r * 2 + 11;
  const c = cv(w, h);
  const g = c.getContext('2d');
  const cx = Math.floor(w / 2), cy = r + 2;
  g.fillStyle = 'rgba(25,20,15,0.3)'; g.fillRect(cx - 4, h - 2, 9, 2);
  g.fillStyle = INKS; g.fillRect(cx - 1, cy + r - 3, 3, h - (cy + r - 3) - 1);
  g.fillStyle = '#6b4a2f'; g.fillRect(cx, cy + r - 3, 1, h - (cy + r - 3) - 2);
  const pal = rand() < 0.5 ? ['#1d3a1e', '#2f5a2c', '#3f7a35', '#5f9a48', '#83b456'] : ['#1f3b24', '#2e5e3a', '#3c7444', '#5a9450', '#7cb05a'];
  for (let y = -r - 1; y <= r + 1; y++)
    for (let x = -r - 1; x <= r + 1; x++) {
      const a = Math.atan2(y, x);
      const R = r + Math.round(Math.sin(a * 5 + seed) * 0.8);
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R + 1) continue;
      let col;
      if (d > R) col = pal[0];
      else {
        const light = (-x - y) / (r * 1.5) + (bayer(x + 40, y + 40) - 0.5) * 0.5;
        col = light > 0.5 ? pal[4] : light > 0.1 ? pal[3] : light > -0.45 ? pal[2] : pal[1];
      }
      g.fillStyle = col; g.fillRect(cx + x, cy + y, 1, 1);
    }
  return c;
}

// A terracotta pot with a geranium, for doorsteps
function makePot(seed) {
  const c = cv(5, 7);
  const g = c.getContext('2d');
  g.fillStyle = INKS; g.fillRect(0, 3, 5, 4);
  g.fillStyle = '#c4552f'; g.fillRect(1, 4, 3, 2);
  g.fillStyle = '#3b7a3c'; g.fillRect(0, 1, 5, 2);
  g.fillStyle = ['#e0533f', '#f29bb7', '#fff7e8'][seed % 3]; g.fillRect(1, 0, 1, 1); g.fillRect(3, 0, 1, 2);
  return c;
}

// Café table, two chairs and an umbrella (≈2.5 m across)
function makeUmbrella() {
  const c = cv(26, 28);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(30,30,40,0.3)'; g.fillRect(5, 25, 16, 3);
  for (const x of [3, 19]) {
    g.fillStyle = '#5a3a2a'; g.fillRect(x, 17, 4, 3);
    g.fillStyle = '#7a4e33'; g.fillRect(x, 20, 4, 2); g.fillRect(x, 22, 1, 4); g.fillRect(x + 3, 22, 1, 4);
  }
  disc(g, 13, 22, 4, '#e9e2d4');
  g.fillStyle = '#b9b0a2'; g.fillRect(9, 23, 9, 1);
  g.fillStyle = '#4a4038'; g.fillRect(12, 7, 2, 18);
  for (let y = 0; y < 9; y++) {
    const half = Math.round(12 * Math.sin(((y + 2) / 11) * Math.PI * 0.5));
    for (let x = -half; x <= half; x++) {
      const stripe = Math.floor((x + 20) / 4) % 2;
      g.fillStyle = Math.abs(x) === half || y === 8 ? INKS : y > 6 ? '#d9cdb5' : stripe ? '#f6efe0' : '#efe5d0';
      g.fillRect(13 + x, y, 1, 1);
    }
  }
  return c;
}

function makeTower() {
  const { w, d, h } = TOWER;
  const total = d + h + 18;
  const c = cv(w + 14, total);
  const g = c.getContext('2d');
  const ox = 7, top = 18;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const mortar = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
      g.fillStyle = mortar ? '#6c3925' : hash2(x, y) < 0.3 ? '#a35f3c' : '#9a5838';
      g.fillRect(ox + x, top + d + y, 1, 1);
    }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(ox + w - 4, top + d, 4, h);
  g.fillStyle = '#2a1e1a';
  for (let k = 0; k < 4; k++) { g.fillRect(ox + 5, top + d + 10 + k * 20, 4, 8); g.fillRect(ox + 14, top + d + 10 + k * 20, 4, 8); }
  // the roof garden with its holm oaks
  g.fillStyle = '#7a4129'; g.fillRect(ox, top, w, d);
  g.fillStyle = '#5d8f3f'; g.fillRect(ox + 2, top + 2, w - 4, d - 4);
  disc(g, ox + w / 2, top + 3, 12, '#2f5a2c');
  disc(g, ox + w / 2 - 3, top, 7, '#3f6f36');
  disc(g, ox + w / 2 - 5, top - 3, 3, '#5f9444');
  g.fillStyle = INKS;
  g.fillRect(ox - 1, top + d, 1, h); g.fillRect(ox + w, top, 1, d + h);
  return { canvas: c, x: TOWER.x - w / 2 - ox, y: TOWER.y - total };
}

function makeSpa() {
  const { w, roofD } = SPA;
  const fh = 44, h = roofD + fh + 4;
  const c = cv(w, h);
  const g = c.getContext('2d');
  const roof = C.roof[3];
  for (let y = 0; y < roofD; y++) {
    let col = y < 13 ? shade(roof, 0.88) : roof;
    if (y === 13) col = shade(roof, 1.25);
    else if (y % 3 === 0) col = shade(col, 0.84);
    g.fillStyle = rgb(col); g.fillRect(0, y, w, 1);
  }
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < w; x++) {
      const vein = Math.abs(Math.sin(x * 0.14 + y * 0.38 + Math.sin(y * 0.1) * 3)) < 0.05;
      g.fillStyle = vein ? '#d6cdbf' : hash2(x, y) < 0.08 ? '#ebe5da' : '#f5f0e7';
      g.fillRect(x, roofD + y, 1, 1);
    }
  g.fillStyle = '#e2dace'; g.fillRect(0, roofD, w, 2);
  g.fillStyle = '#b9b0a2'; g.fillRect(0, roofD + 2, w, 1);
  const mid = Math.round(w / 2);
  for (let j = 0; j < 11; j++) {
    g.fillStyle = j === 0 ? '#b9b0a2' : '#fbf8f2';
    g.fillRect(mid - 3 - j * 3, roofD - 11 + j, 6 + j * 6, 1);
  }
  g.fillStyle = '#d9d0c2'; g.fillRect(mid - 2, roofD - 7, 4, 4);
  for (const dx of [-30, -18, -6, 6, 18, 30]) {
    g.fillStyle = '#ffffff'; g.fillRect(mid + dx - 2, roofD + 4, 4, fh - 6);
    g.fillStyle = '#d4cbbd'; g.fillRect(mid + dx + 1, roofD + 4, 1, fh - 6);
    g.fillStyle = '#e7e0d4'; g.fillRect(mid + dx - 3, roofD + 3, 6, 2); g.fillRect(mid + dx - 3, roofD + fh - 3, 6, 2);
  }
  g.fillStyle = 'rgba(80,70,60,0.18)'; g.fillRect(mid - 35, roofD + 6, 70, fh - 8);
  for (const wx of [6, 20, 34, w - 42, w - 28, w - 14]) {
    g.fillStyle = '#2f2622'; g.fillRect(wx, roofD + 7, 8, 13);
    g.fillStyle = '#5f8792'; g.fillRect(wx + 1, roofD + 8, 6, 11);
    g.fillStyle = '#2f2622'; g.fillRect(wx, roofD + 26, 8, 12);
    g.fillStyle = '#5f8792'; g.fillRect(wx + 1, roofD + 27, 6, 10);
  }
  g.fillStyle = '#2f2622'; g.fillRect(mid - 7, roofD + fh - 21, 14, 21);
  g.fillStyle = '#6b4329'; g.fillRect(mid - 6, roofD + fh - 20, 12, 20);
  g.fillStyle = '#7d5234'; g.fillRect(mid - 5, roofD + fh - 19, 4, 18); g.fillRect(mid + 1, roofD + fh - 19, 4, 18);
  g.fillStyle = '#e6dfd3'; g.fillRect(mid - 20, roofD + fh, 40, 2);
  g.fillStyle = '#cfc6b7'; g.fillRect(mid - 23, roofD + fh + 2, 46, 2);
  g.fillStyle = INKS;
  g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, roofD + fh); g.fillRect(w - 1, 0, 1, roofD + fh);
  g.fillRect(0, roofD + fh - 1, mid - 23, 1); g.fillRect(mid + 23, roofD + fh - 1, w, 1);
  return { canvas: c, x: SPA.x, y: SPA.y, door: { x: SPA.x + mid, y: SPA.y + roofD + fh + 3 } };
}

function makePool() {
  const { w, h } = POOL;
  const c = cv(w + 6, h + 8);
  const g = c.getContext('2d');
  g.fillStyle = '#efe7d8'; g.fillRect(0, 0, w + 6, h + 6);
  g.fillStyle = '#c9c0b0'; g.fillRect(0, h + 5, w + 6, 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const tile = (Math.floor(x / 7) + Math.floor(y / 7)) % 2;
      g.fillStyle = y < 3 ? '#2f8085' : tile ? '#4aa9ae' : '#43a0a6';
      if (hash2(x, y) < 0.04) g.fillStyle = '#7bcfd0';
      g.fillRect(3 + x, 3 + y, 1, 1);
    }
  g.fillStyle = INKS;
  g.fillRect(0, 0, w + 6, 1); g.fillRect(0, 0, 1, h + 6); g.fillRect(w + 5, 0, 1, h + 6);
  return { canvas: c, x: POOL.x - 3, y: POOL.y - 3 };
}

// The park's fountain: a round basin and a slim column
function makeFountain() {
  const { rx, ry } = FOUNTAIN;
  const c = cv(rx * 2 + 6, ry * 2 + 26);
  const g = c.getContext('2d');
  const cx = rx + 3, cy = ry + 20;
  for (let y = -ry - 3; y <= ry + 4; y++)
    for (let x = -rx - 3; x <= rx + 3; x++) {
      const e = ell(x, y, 0, 0, rx, ry);
      const e2 = ell(x, y - 3, 0, 0, rx, ry);
      if (e2 < 1 && e >= 1) { g.fillStyle = '#b8ab95'; g.fillRect(cx + x, cy + y, 1, 1); }
      if (e < 1) {
        g.fillStyle = e > 0.72 ? '#e4dccb' : e > 0.6 ? '#2f6c80' : hash2(x, y) < 0.06 ? '#9fd6e6' : '#4f9fbd';
        g.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  g.fillStyle = '#d9d0bf'; g.fillRect(cx - 2, cy - 14, 4, 14);
  g.fillStyle = '#b8ab95'; g.fillRect(cx + 1, cy - 14, 1, 14);
  disc(g, cx, cy - 15, 5, '#e4dccb');
  disc(g, cx, cy - 16, 3, '#4f9fbd');
  g.fillStyle = '#e4dccb'; g.fillRect(cx - 1, cy - 20, 2, 4);
  return { canvas: c, x: FOUNTAIN.x - cx, y: FOUNTAIN.y - cy };
}

// The fountain square's fountain: an eight-sided basin with two tiers
function makeTownFountain() {
  const rx = 22, ry = 13;
  const c = cv(rx * 2 + 6, ry * 2 + 34);
  const g = c.getContext('2d');
  const cx = rx + 3, cy = ry + 28;
  const oct = (x, y, a, b) => Math.max(Math.abs(x) / a, Math.abs(y) / b, (Math.abs(x) / a + Math.abs(y) / b) / 1.35);
  for (let y = -ry - 3; y <= ry + 5; y++)
    for (let x = -rx - 3; x <= rx + 3; x++) {
      const e = oct(x, y, rx, ry), e2 = oct(x, y - 4, rx, ry);
      if (e2 < 1 && e >= 1) { g.fillStyle = y > 0 ? '#b8ab95' : '#cfc4ae'; g.fillRect(cx + x, cy + y, 1, 1); }
      if (e < 1) {
        g.fillStyle = e > 0.84 ? (e > 0.95 ? '#9c8f78' : '#ece4d3') : hash2(x, y) < 0.07 ? '#a8dcec' : (x + y) % 7 === 0 ? '#5aa8c4' : '#4f9fbd';
        g.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  // lower bowl on its column, then the top bowl and spout
  g.fillStyle = '#d9d0bf'; g.fillRect(cx - 2, cy - 12, 5, 12);
  g.fillStyle = '#b8ab95'; g.fillRect(cx + 2, cy - 12, 1, 12);
  for (let y = -4; y <= 4; y++)
    for (let x = -10; x <= 10; x++) {
      const e = ell(x, y, 0, 0, 10, 4);
      if (e < 1) { g.fillStyle = e > 0.6 ? '#e8e0cf' : '#5aa8c4'; g.fillRect(cx + x, cy - 14 + y, 1, 1); }
    }
  g.fillStyle = '#b8ab95'; g.fillRect(cx - 9, cy - 10, 19, 1);
  g.fillStyle = '#d9d0bf'; g.fillRect(cx - 1, cy - 24, 3, 10);
  disc(g, cx, cy - 24, 4, '#e8e0cf');
  disc(g, cx, cy - 25, 2, '#5aa8c4');
  g.fillStyle = '#cfeaf5'; g.fillRect(cx, cy - 30, 1, 4);
  return { canvas: c, x: FOUNT.x - cx, y: FOUNT.y - cy, sortY: FOUNT.y + ry };
}

function makeBench() {
  const c = cv(18, 10);
  const g = c.getContext('2d');
  g.fillStyle = INKS; g.fillRect(1, 4, 1, 6); g.fillRect(16, 4, 1, 6);
  g.fillStyle = '#8a5a35'; g.fillRect(0, 1, 18, 2); g.fillRect(0, 4, 18, 2); g.fillRect(0, 7, 18, 1);
  g.fillStyle = '#a5703f'; g.fillRect(0, 1, 18, 1); g.fillRect(0, 4, 18, 1);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(1, 9, 16, 1);
  return c;
}

function makePicnic() {
  const c = cv(44, 52);
  const g = c.getContext('2d');
  const bx = 4, by = 32;
  for (let j = 0; j < 18; j++)
    for (let i = 0; i < 30; i++) {
      g.fillStyle = (Math.floor(i / 4) + Math.floor(j / 4)) % 2 ? '#fff3df' : '#c8423a';
      g.fillRect(bx + i, by + j, 1, 1);
    }
  g.fillStyle = '#7a4e33'; g.fillRect(bx + 11, by + 8, 7, 1);
  g.fillStyle = '#f6d6e1'; g.fillRect(bx + 12, by + 4, 5, 2);
  g.fillStyle = '#e88aa8'; g.fillRect(bx + 12, by + 6, 5, 2);
  g.fillStyle = '#fff3df'; g.fillRect(bx + 13, by + 2, 1, 2); g.fillRect(bx + 15, by + 2, 1, 2);
  g.fillStyle = '#8a5a35'; g.fillRect(bx + 21, by + 5, 6, 4);
  g.fillStyle = '#a5703f'; g.fillRect(bx + 21, by + 5, 6, 1);
  for (const [x, y, col] of [[32, 6, '#d8423a'], [37, 2, '#f2c14b'], [40, 9, '#4f9bd9']]) {
    g.fillStyle = INKS; g.fillRect(x, y + 3, 1, by + 2 - y - 3);
    disc(g, x, y, 3, col);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - 1, y - 1, 1, 1);
  }
  return { canvas: c, x: PICNIC.x - bx, y: PICNIC.y - by };
}

function makeMaddalena() {
  const { w } = MADDALENA;
  const c = cv(w + 4, 60);
  const g = c.getContext('2d');
  const base = 42;
  for (let i = 0; i <= w; i++) {
    const t = i / w;
    const hump = Math.round(Math.pow(Math.sin(Math.PI * t), 1.4) * 30);
    const top = base - hump;
    g.fillStyle = '#6b5a45'; g.fillRect(i + 2, top - 2, 1, 2);
    g.fillStyle = '#c3ad8a'; g.fillRect(i + 2, top, 1, 4);
    g.fillStyle = '#a99270'; g.fillRect(i + 2, top + 4, 1, 2);
    const a = (t - 0.16) / 0.68;
    const archTop = a > 0 && a < 1 ? base + 12 - Math.round(Math.sin(Math.PI * a) * 34) : base + 12;
    if (archTop > top + 6) { g.fillStyle = '#b39c78'; g.fillRect(i + 2, top + 6, 1, archTop - top - 6); }
  }
  return { canvas: c, x: MADDALENA.x - 2, y: MADDALENA.y - base };
}

function makeCypress(seed) {
  const w = 12, h = 52;
  const c = cv(w, h);
  const g = c.getContext('2d');
  for (let y = 0; y < h - 2; y++) {
    const t = y / (h - 2);
    const half = Math.max(1, Math.round(5 * Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.55), 0.7) * (t > 0.9 ? 1 - (t - 0.9) * 3 : 1)));
    for (let x = -half; x <= half; x++) {
      const edge = Math.abs(x) === half;
      const light = x < -half * 0.3 && bayer(x + 50, y) < 0.6 + hash2(x + seed, y) * 0.3;
      g.fillStyle = edge ? '#132a18' : light ? '#33613a' : hash2(x, y + seed) < 0.15 ? '#1a3a22' : '#22472a';
      g.fillRect(6 + x, y, 1, 1);
    }
  }
  g.fillStyle = '#5a3e27'; g.fillRect(5, h - 3, 2, 3);
  return c;
}

function makeLamp() {
  const c = cv(7, 34);
  const g = c.getContext('2d');
  g.fillStyle = '#2a2622'; g.fillRect(3, 6, 1, 26); g.fillRect(2, 31, 3, 3);
  g.fillStyle = '#2a2622'; g.fillRect(0, 0, 7, 7);
  g.fillStyle = '#ffe7a0'; g.fillRect(1, 2, 5, 4);
  g.fillStyle = '#fff6d0'; g.fillRect(2, 2, 2, 2);
  return c;
}

// Lucca's gate: a tower over the passage, with an arch you can see through
function makeGate(gate) {
  const w = 70, depth = gate.s - gate.n, hgt = WALL_H + 16;
  const c = cv(w, depth + hgt);
  const g = c.getContext('2d');
  for (let y = 0; y < depth; y++) {
    let col = y < depth * 0.45 ? shade(C.roof[1], 0.88) : C.roof[1];
    if (Math.abs(y - Math.round(depth * 0.45)) < 1) col = shade(C.roof[1], 1.25);
    else if (y % 3 === 0) col = shade(col, 0.84);
    g.fillStyle = rgb(col); g.fillRect(0, y, w, 1);
  }
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const joint = y % 5 === 0 || (x + (Math.floor(y / 5) % 2) * 5) % 10 === 0;
      g.fillStyle = joint ? '#a8936f' : hash2(x, y) < 0.2 ? '#d6c19b' : '#c9b38d';
      g.fillRect(x, depth + y, 1, 1);
    }
  g.fillStyle = '#ddc9a5'; g.fillRect(0, depth, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, depth + 2, w, 1);
  const ax = w / 2, archW = 16, archH = 30;
  const bottom = depth + hgt;
  for (let y = 0; y < archH; y++)
    for (let x = -archW; x <= archW; x++) {
      const above = y - (archH - archW);
      if (above <= 0 || x * x + above * above < archW * archW) g.clearRect(ax + x, bottom - 1 - y, 1, 1);
    }
  g.fillStyle = '#7d6a4f';
  for (let a = 0; a <= Math.PI; a += 0.03) {
    const x = Math.round(ax + Math.cos(a) * (archW + 1));
    const y = Math.round(bottom - 1 - (archH - archW) - Math.sin(a) * (archW + 1));
    g.fillRect(x - 1, y, 2, 2);
  }
  g.fillRect(ax - archW - 2, bottom - (archH - archW), 2, archH - archW);
  g.fillRect(ax + archW + 1, bottom - (archH - archW), 2, archH - archW);
  g.fillStyle = INKS;
  g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, bottom); g.fillRect(w - 1, 0, 1, bottom);
  return { canvas: c, x: gate.x - w / 2, y: gate.s - bottom, sortY: gate.s };
}

// ---------------------------------------------------------------- the town's blocks

// Blocks of the grid, minus the fountain square and the piazza's paving
function townBlocks() {
  const out = [];
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  ROWS.forEach(([y0, y1], r) => COLS.forEach(([x0, x1], c) => {
    let x = x0, w = x1 - x0;
    if (r === 0 && c === 0) { x = 178; w = x1 - 178; } // the top row runs right up to the wall
    if (r === 0 && c === 3) w = 1002 - x0;
    const b = { x, y: y0, w, h: y1 - y0, r, c };
    if (overlaps(b, SQUARE) || overlaps(b, RING_ZONE)) return;
    if (r === 5 && c === 0) b.pocket = [TOWER.x - 22, TOWER.x + 22];          // Torre Guinigi
    if (r === 2 && c === 1) b.pocketFront = [480, 506];                       // stop 1's signpost
    if ((r === 4 && c === 1) || (r === 7 && c === 2) || (r === 2 && c === 3)) b.park = true; // little public gardens
    out.push(b);
  }));
  // little gardens in the corners round the piazza
  out.push({ x: 606, y: 670, w: 50, h: 48, plot: true }, { x: 922, y: 670, w: 48, h: 48, plot: true });
  out.push({ x: 606, y: 940, w: 50, h: 56, plot: true }, { x: 922, y: 950, w: 48, h: 46, plot: true });
  return out;
}
const BLOCKS = townBlocks();

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
  const bake = (canvas, x, y, sortY) => baked.push({ canvas, x, y, sortY: sortY ?? y + canvas.height });
  // an image placed by its bottom centre
  const bakeAt = (img, x, y) => bake(img, Math.round(x - img.width / 2), Math.round(y) - img.height, Math.round(y));

  const lamp = makeLamp();
  const bench = makeBench();
  const bushes = Array.from({ length: 8 }, (_, k) => makeBush(11 + k * 17));
  const gardenTrees = Array.from({ length: 6 }, (_, k) => makeGardenTree(5 + k * 23));
  const pots = [makePot(0), makePot(1), makePot(2)];
  const anyOf = (arr) => arr[Math.floor(rand() * arr.length)];

  // ---- Lucca: the town's blocks
  const fits = (x0, y0, x1, y1) => townInner(x0, y0) && townInner(x1, y0) && townInner(x0, y1) && townInner(x1, y1);
  // a gap between houses: a small tree, with a bush in front
  const gap = (x0, x1, line, isBack, b) => {
    const gw = x1 - x0, mid = (x0 + x1) / 2;
    if (gw >= 12) {
      const tr = anyOf(gardenTrees);
      if (fits(mid - tr.width / 2, line - tr.height, mid + tr.width / 2, line)) bakeAt(tr, mid, line - 1);
    }
    if (!isBack && gw >= 10) bake(anyOf(bushes), Math.round(mid - 5), b.y + b.h - 9);
  };
  for (const b of BLOCKS) {
    b.beds = [];
    const bottom = b.y + b.h;
    if (b.plot) {
      bakeAt(gardenTrees[(b.x >> 3) % gardenTrees.length], b.x + b.w / 2, bottom - 8);
      bake(bushes[(b.x >> 2) % bushes.length], b.x + 3, bottom - 10);
      bake(bushes[(b.x >> 1) % bushes.length], b.x + b.w - 14, bottom - 10);
      continue;
    }
    if (b.park) {
      // a little public garden: flower beds, two trees, a bench and a lamp
      b.beds.push({ x: b.x + 8, y: b.y + 8, w: b.w - 16, h: 6 });
      b.paths = true;
      const big = [assets['tree2-m'], assets['tree3-m'], assets['olive2']];
      bakeAt(big[(b.r + b.c) % 3], b.x + b.w * 0.25, b.y + b.h * 0.62);
      bakeAt(anyOf(gardenTrees), b.x + b.w * 0.8, b.y + b.h * 0.55);
      bake(bench, Math.round(b.x + b.w / 2 - 22), bottom - 20);
      bake(anyOf(bushes), b.x + 6, bottom - 10);
      bake(anyOf(bushes), b.x + b.w - 16, bottom - 10);
      bakeAt(lamp, b.x + b.w / 2 + 14, bottom - 4);
      continue;
    }
    // Houses in two rows: the back row peeks over the front one, like a
    // cluster of houses round a courtyard. Gaps hold small trees and bushes.
    const front = bottom - 7;
    const backLine = b.y + Math.round(b.h * 0.62);
    const rows = b.h >= 80 ? [[backLine, true], [front, false]] : [[front, false]];
    for (const [line, isBack] of rows) {
      const minTop = b.y + 2;
      let x = b.x + 3;
      const end = b.x + b.w - 3;
      const free = [b.pocket, isBack ? null : b.pocketFront].filter(Boolean);
      let guard = 0;
      while (end - x >= 8 && guard++ < 200) {
        const p = free.find((q) => x < q[1] && x + 20 > q[0]);
        if (p) {
          if (p[0] > x + 8) gap(x, p[0], line, isBack, b);
          x = Math.max(x, p[1]);
          continue;
        }
        const room = end - x;
        if (room < 20 || rand() < (isBack ? 0.14 : 0.2)) {
          const gw = Math.min(room, 10 + Math.floor(rand() * 10));
          gap(x, x + gw, line, isBack, b);
          x += gw;
          continue;
        }
        let w = 22 + Math.floor(rand() * 20);
        if (room - w < 20) w = room > 44 ? Math.floor(room / 2) : room;
        const next = free.find((q) => q[0] > x);
        if (next && x + w > next[0]) w = next[0] - x;
        if (w < 18) { gap(x, x + w, line, isBack, b); x += w; continue; }
        let floors = isBack ? (rand() < 0.4 ? 3 : 2) : (rand() < 0.55 ? 2 : 1);
        let roofD = 10 + Math.floor(rand() * 6);
        const tall = (f, rd) => rd + 22 + 16 * (f - 1);
        while (floors > 1 && tall(floors, roofD) > line - minTop) floors--;
        if (tall(floors, roofD) > line - minTop) roofD = Math.max(8, line - minTop - tall(floors, 0));
        const hh = tall(floors, roofD);
        if (!fits(x, line - hh, x + w, line)) { x += 4; continue; }
        const house = makeHouse(w, floors, roofD, rand(), { gable: rand() < 0.3 });
        bake(house, x, line - hh, line);
        if (!isBack) {
          // a pot by the door, a bush along the kerb
          const door = x + house.door;
          const px = rand() < 0.5 ? door - 7 : door + 10;
          if (rand() < 0.6 && px > x + 1 && px + 5 < x + w - 1) bake(anyOf(pots), px, bottom - 9);
          if (w > 30 && rand() < 0.6) bake(anyOf(bushes), door > x + w / 2 ? x + 2 : x + w - 12, bottom - 9);
        }
        x += w;
      }
    }
    // lamps on some of the front corners
    if (hash2(b.x, b.y) < 0.6) bakeAt(lamp, b.x + 4, bottom - 2);
    if (hash2(b.y, b.x) < 0.45) bakeAt(lamp, b.x + b.w - 4, bottom - 2);
  }
  // Torre Guinigi stands in its block's gap
  const tower = makeTower();
  bake(tower.canvas, tower.x, tower.y, TOWER.y);

  // the fountain square: fountain, benches, two café tables, trees in the corners
  const townF = makeTownFountain();
  bake(townF.canvas, townF.x, townF.y, townF.sortY);
  for (const [bx, by] of [[662, 506], [724, 506], [662, 584], [724, 584]]) bakeAt(bench, bx, by);
  const umbrella = makeUmbrella();
  for (const [ux, uy] of [[630, 540], [756, 540]]) bakeAt(umbrella, ux, uy);
  for (const gq of SQ_GREENS) bakeAt(anyOf(gardenTrees), gq.x + gq.w / 2, gq.y + gq.h - 4);
  for (const [lx, ly] of [[646, 470], [740, 470], [646, 626], [740, 626]]) bakeAt(lamp, lx, ly);

  // café tables in the piazza, in the part of the square in view (the
  // family walks among these, so they're drawn in depth order)
  for (const [x, y] of [[740, 820], [852, 820], [746, 872], [858, 872]]) sprites.push({ img: umbrella, x, y, kind: 'umbrella' });

  // ---- Lucca's gates, and the olive trees along the top of the walls
  for (const gate of GATES) sprites.push({ ...makeGate(gate), kind: 'gate' });
  {
    const { cx, cy, hx, hy } = WALL;
    const inset = BAND / 2, R = WALL.r - inset;
    const x0 = cx - hx + WALL.r, x1 = cx + hx - WALL.r, y0 = cy - hy + WALL.r, y1 = cy + hy - WALL.r;
    const ring = [];
    for (let x = x0; x <= x1; x += 48) { ring.push([x, cy - hy + inset]); ring.push([x, cy + hy - inset]); }
    for (let y = y0 + 48; y < y1; y += 48) { ring.push([cx - hx + inset, y]); ring.push([cx + hx - inset, y]); }
    for (const [ccx, ccy, a0] of [[x1, y0, -Math.PI / 2], [x1, y1, 0], [x0, y1, Math.PI / 2], [x0, y0, Math.PI]])
      for (let k = 1; k < 4; k++) { const a = a0 + (Math.PI / 2) * (k / 4); ring.push([ccx + Math.cos(a) * R, ccy + Math.sin(a) * R]); }
    ring.forEach(([x, y], i) => {
      if (GATES.some((g) => Math.abs(x - g.x) < 60 && y > g.n - 30 && y < g.s + 30)) return;
      sprites.push({ img: assets[`olive${1 + (i % 3)}`], x: Math.round(x), y: Math.round(y) - WALL_H + 3, sortY: Math.round(y) + 14, kind: 'tree' });
    });
  }

  // ---- Bagni di Lucca
  const spa = makeSpa();
  baked.push({ canvas: spa.canvas, x: spa.x, y: spa.y, sortY: spa.y + spa.canvas.height });
  occupy(SPA.x - 12, SPA.y - 12, SPA.w + 24, spa.canvas.height + 24);
  const pool = makePool();
  baked.push({ ...pool, sortY: POOL.y + POOL.h });
  occupy(POOL.x - 14, POOL.y - 14, POOL.w + 28, POOL.h + 28);
  CARPARKS.forEach((c) => occupy(c.x - 12, c.y - 12, c.w + 24, c.h + 24));
  occupy(HILL.x - HILL.r, HILL.y - HILL.r, HILL.r * 2, HILL.r * 2);
  occupy(PARK.x - 20, PARK.y - 20, PARK.w + 40, PARK.h + 40);
  occupy(MADDALENA.x - 14, MADDALENA.y - 50, MADDALENA.w + 28, 80);
  const clearOfPaths = (x, y, w, h, m = 24) => {
    for (let yy = y; yy <= y + h; yy += 8)
      for (let xx = x; xx <= x + w; xx += 8) {
        if (nearRoute(xx, yy, m + 40) < m + 20) return false;
        if (nearRiver(xx, yy, m + 60) < m + 42) return false;
      }
    return true;
  };
  // the village: houses gathered along the walk to the baths
  for (let n = 0, made = 0; n < 5000 && made < 70; n++) {
    const w = 24 + Math.floor(rand() * 22), floors = rand() < 0.5 ? 3 : 2, roofD = 10 + Math.floor(rand() * 6);
    const h = roofD + 22 + 16 * (floors - 1);
    const x = 300 + Math.floor(rand() * 1000), y = 4400 + Math.floor(rand() * 900);
    if (nearRoute(x + w / 2, y + h, 260) > 220) continue;
    if (x + w > W - 10 || occupied(x - 8, y - 8, w + 16, h + 16) || !clearOfPaths(x, y, w, h, 6)) continue;
    baked.push({ canvas: makeHouse(w, floors, roofD, rand(), { gable: rand() < 0.3 }), x, y, sortY: y + h });
    occupy(x, y, w, h);
    made++;
  }
  baked.push({ ...makePicnic(), sortY: PICNIC.y + 18 });

  // ---- the park
  const fountain = makeFountain();
  baked.push({ ...fountain, sortY: FOUNTAIN.y + FOUNTAIN.ry });
  for (const [x, y] of [[452, 1856], [694, 2232], [470, 1712], [360, 2060]]) bakeAt(bench, x, y);
  for (const [x, y] of [[546, 1760], [454, 1990], [584, 2200], [660, 1780]]) sprites.push({ img: lamp, x, y, kind: 'lamp' });
  const chaseTree = { img: assets[CHASE.tree.img], x: CHASE.tree.x, y: CHASE.tree.y, kind: 'tree', id: 'chase' };
  sprites.push(chaseTree);
  {
    // trees round the lawns, clear of the paths, the beds and the chase
    const parkImgs = ['tree1-l', 'tree2-l', 'tree3-l', 'tree1-m', 'tree2-m', 'tree3-m'];
    const placedPark = [{ x: CHASE.tree.x, y: CHASE.tree.y }];
    for (let n = 0; n < 1200 && placedPark.length < 34; n++) {
      const x = PARK.x + 30 + Math.floor(rand() * (PARK.w - 60)), y = PARK.y + 70 + Math.floor(rand() * (PARK.h - 76));
      if (nearRoute(x, y, 80) < 46 || nearRoute(x, y - 30, 80) < 40) continue;
      if (ell(x, y, FOUNTAIN.x, FOUNTAIN.y, 70, 56) < 1) continue;
      if (BEDS.some((bd) => ell(x, y, bd.x, bd.y, bd.rx + 26, bd.ry + 40) < 1)) continue;
      if (CHASE.path.some((p) => Math.abs(p.x - x) < 40 && y - p.y > -8 && y - p.y < 60)) continue;
      if (placedPark.some((q) => Math.abs(q.x - x) < 52 && Math.abs(q.y - y) < 34)) continue;
      if (PARK_SIDE.some((p) => Math.hypot(p.x - x, p.y - y) < 30)) continue;
      placedPark.push({ x, y });
      sprites.push({ img: assets[anyOf(parkImgs)], x, y, kind: 'tree' });
    }
  }

  // ---- countryside: fields, olive groves, woods, cypresses, farmhouses
  const fields = [];
  const countryOk = (x, y, w, h) =>
    x > 10 && y > 10 && x + w < W - 10 && y + h < H - 10 && !occupied(x - 10, y - 10, w + 20, h + 20) &&
    clearOfPaths(x, y, w, h, 20) && sdWall(x, y) > 90 && sdWall(x + w, y) > 90 && sdWall(x, y + h) > 90 && sdWall(x + w, y + h) > 90;
  for (let n = 0; n < 2500 && fields.length < 30; n++) {
    const w = 140 + Math.floor(rand() * 200), h = 90 + Math.floor(rand() * 120);
    const x = Math.floor(rand() * (W - w)), y = Math.floor(rand() * (H - h));
    if (!countryOk(x, y, w, h)) continue;
    const type = ['vines', 'wheat', 'lavender', 'olives', 'plough', 'vines'][Math.floor(rand() * 6)];
    fields.push({ x, y, w, h, type });
    occupy(x, y, w, h);
    if (type === 'olives') {
      for (let yy = y + 34; yy <= y + h - 2; yy += 30)
        for (let xx = x + 22; xx <= x + w - 22; xx += 44) sprites.push({ img: assets[`olive${1 + Math.floor(rand() * 3)}`], x: xx + Math.floor(rand() * 6), y: yy, kind: 'tree' });
    }
  }
  for (let n = 0, made = 0; n < 1500 && made < 14; n++) {
    const w = 30 + Math.floor(rand() * 16), roofD = 12, floors = rand() < 0.5 ? 2 : 1;
    const h = roofD + 22 + 16 * (floors - 1);
    const x = Math.floor(rand() * (W - w)), y = 1700 + Math.floor(rand() * 2700);
    if (!countryOk(x, y, w, h)) continue;
    baked.push({ canvas: makeHouse(w, floors, roofD, rand(), { wall: P(['#d9c7a2', '#e2cfa8', '#cdb894'][made % 3]), shop: false }), x, y, sortY: y + h });
    occupy(x - 16, y - 16, w + 32, h + 32);
    made++;
  }
  // cypress alleys along the road
  const cypress = [makeCypress(1), makeCypress(7), makeCypress(13)];
  for (let i = 0; i < pts.length; i += 30) {
    const p = pts[i];
    if (p.mode !== 'drive' || p.y < 2560 || (p.y > 3150 && p.y < 3750) || p.y > 4450) continue;
    const tg = pts[Math.min(pts.length - 1, i + 2)];
    const tx = tg.x - p.x, ty = tg.y - p.y, L = Math.hypot(tx, ty) || 1;
    for (const s of [-1, 1]) {
      const x = Math.round(p.x - (ty / L) * 32 * s), y = Math.round(p.y + (tx / L) * 32 * s);
      if (nearRiver(x, y, 100) < 56 || nearRoute(x, y, 50) < 28 || occupied(x - 6, y - 10, 12, 12)) continue;
      sprites.push({ img: cypress[Math.floor(i / 30) % 3], x, y, kind: 'tree' });
    }
  }
  // free-standing trees and woods
  const treeImgs = ['tree1-m', 'tree2-m', 'tree3-m', 'tree1-l', 'tree2-l', 'tree3-l'];
  const placed = [];
  for (let n = 0; n < 16000 && placed.length < 1100; n++) {
    const x = 12 + Math.floor(rand() * (W - 24)), y = 40 + Math.floor(rand() * (H - 50));
    const forest = vnoise(x, y, 300, 9) > 0.6;
    if (!forest && rand() < 0.55) continue;
    if (occupied(x - 22, y - 58, 44, 68) || !clearOfPaths(x - 14, y - 5, 28, 10, 14)) continue; // keep the whole tree off buildings
    if (sdWall(x, y) < 96) continue;
    if (placed.some((q) => Math.abs(q.x - x) < (forest ? 44 : 64) && Math.abs(q.y - y) < (forest ? 26 : 40))) continue;
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
      [['#ff0000', () => strokeLine(pts, 30, isWalk)], ['#00ff00', () => strokeLine(pts, 38, isDrive)], ['#0000ff', () => strokeLine(river, 74)]],
      [['#ff0000', () => strokeLine(pts, 32, isDrive)], ['#00ff00', () => strokeLine(pts, 42, isDrive)], ['#0000ff', () => strokeLine(river, 92)]],
      [['#ff0000', () => { strokeLine(loop, 18); strokeLine(side, 16); }], ['#00ff00', () => strokeLine(river, 44)], ['#0000ff', () => strokeLine(river, 82)]],
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
    const tileBlocks = BLOCKS.filter((b) => b.x < x0 + CH && b.x + b.w > x0 && b.y < y0 + CH && b.y + b.h > y0);
    const canvas = cv(CH, CH);
    const g = canvas.getContext('2d');
    const img = g.createImageData(CH, CH);
    const D = img.data;
    const nearWalls = sdWall(x0 + CH / 2, y0 + CH / 2) < CH + WALL_H + 20 && sdRR(x0 + CH / 2, y0 + CH / 2) > -BAND - WALL_H - CH;
    const nearRing = Math.abs(x0 + CH / 2 - PIAZZA.x) < PIAZZA.ox + CH && y0 + CH > PIAZZA.y - PIAZZA.oy - PIAZZA.h - 10 && y0 < PIAZZA.y + PIAZZA.oy + 10;
    const nearPark = x0 + CH > PARK.x - 4 && x0 < PARK.x + PARK.w + 4 && y0 + CH > PARK.y - PARK.hedgeH - 4 && y0 < PARK.y + PARK.h + 4;
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
              if (sw > -3 || sr < -BAND + 3) c = pick(C.stone, h1);
              else if (Math.abs(sr + BAND / 2) < 4 && sr < -3) c = pick(C.gravel, h1);
              else c = C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
            } else {
              for (let t = WALL_H - 1; t >= 0;) {
                const yy = Y + t;
                if (inWall(X, yy)) {
                  if (t >= WALL_H - 2) c = pick(C.stone, h1);
                  else if (t < 1) c = shade(C.brick[1], 0.7);
                  else {
                    const mortar = t % 4 === 0 || (X + (Math.floor(t / 4) % 2) * 4) % 8 === 0;
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

        // 2. the oval ring of houses round the piazza
        if (!c && nearRing) c = ringPixel(X, Y, h1);

        // 3. the park hedge (≈0.9 m tall)
        if (!c && nearPark) {
          if (hedgeF(X, Y + PARK.hedgeH)) c = pick(C.hedge, vnoise(X, Y, 4) + dith * 0.3);
          else for (let t = PARK.hedgeH - 1; t >= 0; t--) if (hedgeF(X, Y + t)) { c = t < 2 ? P('#1d4a22') : shade(pick(C.hedge, h1), 0.8); break; }
        }

        if (!c) {
          const dr = sdRR(X, Y);
          if (dr < -BAND) {
            c = townPixel(X, Y, h1, dith, tileBlocks, m(A, 0, X, Y));
          } else if (gateCut(X, Y) && sdWall(X, Y) < 0) {
            c = shade(C.cobble[(X + Y) % 6 === 0 ? 1 : 0], 0.55); // under the gate
          } else if (m(A, 1, X, Y) || m(B, 1, X, Y)) {
            const overWater = m(B, 2, X, Y);
            const inner = m(B, 0, X, Y), lane = m(A, 1, X, Y);
            if (overWater) c = !lane ? P('#7a664d') : !inner ? P('#a8936f') : (X + Y) % 9 === 0 ? P('#b39c78') : P('#c4af8c');
            else c = !lane ? P('#46413d') : !inner ? P('#e8e2d0') : pick(C.asphalt, h1);
          } else if (CARPARKS.some((p) => X >= p.x && X < p.x + p.w && Y >= p.y && Y < p.y + p.h)) {
            const p = CARPARKS.find((q) => X >= q.x && X < q.x + q.w && Y >= q.y && Y < q.y + q.h);
            const line = (X - p.x) % 26 < 1 && Y - p.y > 3 && Y - p.y < 18;
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
          } else if (sdWall(X, Y) < 70) {
            c = C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
          } else if (nearPark && inParkRect(X, Y)) {
            const bed = BEDS.find((bd) => ell(X, Y, bd.x, bd.y, bd.rx, bd.ry) < 1);
            if (bed) {
              const e = ell(X, Y, bed.x, bed.y, bed.rx, bed.ry);
              c = e > 0.75 ? P('#c9c0b0') : h1 < 0.2 ? P(['#f29bb7', '#f6d55c', '#fff7e8', '#e0533f'][Math.floor(hash2(Y, X) * 4)]) : h1 < 0.55 ? P('#3f7a35') : P('#6b4a2f');
            } else {
              c = C.parkLawn[Math.floor((X - PARK.x) / 16) % 2]; // mown stripes
              if (h1 < 0.05) c = shade(c, 0.88);
            }
          } else if (Math.hypot(X - HILL.x, Y - HILL.y) < HILL.r) {
            const dd = Math.hypot(X - HILL.x, Y - HILL.y) / HILL.r;
            c = P(dd + dith * 0.2 > 0.82 ? '#79a84b' : '#87b656');
            if (h1 < 0.03) c = P(['#f29bb7', '#f6d55c', '#fff7e8'][Math.floor(hash2(Y, X) * 3)]);
          } else {
            const f = tileFields.find((q) => X >= q.x && X < q.x + q.w && Y >= q.y && Y < q.y + q.h);
            if (f) c = fieldPixel(f, X, Y, h1, dith);
            else if (vnoise(X, Y, 300, 9) + dith * 0.06 > 0.6) c = pick(C.woods, vnoise(X, Y, 10, 3) + dith * 0.5);
            else {
              const n = vnoise(X, Y, 60) * 0.65 + vnoise(X, Y, 10, 5) * 0.35;
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
    const b0 = Math.floor((cy - 60) / BUCKET), b1 = Math.floor((cy + vh + 200) / BUCKET);
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
  if (lx < 2 || ly < 2 || lx >= f.w - 2 || ly >= f.h - 2) return P(lx < 1 || ly < 1 || lx >= f.w - 1 || ly >= f.h - 1 ? '#3c6630' : '#4f7d37');
  switch (f.type) {
    case 'vines': {
      // rows of vines on posts, about 1.4 m apart
      const r = ly % 12;
      if (r < 5) return r === 0 ? P('#7fb04f') : h1 < 0.18 ? P('#3f6f30') : r > 3 ? P('#3a5f2a') : P('#5b8f3d');
      if (r < 6) return P('#6e5236');
      if (lx % 20 === 0 && r < 9) return P('#5a4030');
      return h1 < 0.3 ? P('#9b7a52') : P('#a8865c');
    }
    case 'wheat':
      return lx % 3 === 0 ? P('#b8933f') : h1 < 0.2 ? P('#e8c871') : bayer(X, Y) < 0.3 ? P('#cfac52') : P('#dbba5f');
    case 'lavender': {
      const r = ly % 10;
      if (r < 5) return r === 0 ? P('#a996d0') : h1 < 0.25 ? P('#6f5f9c') : P('#8b78b8');
      if (r < 6) return P('#4f4470');
      return P('#7a8a4a');
    }
    case 'olives':
      return h1 < 0.4 + dith * 0.3 ? P('#9aa65a') : P('#a8b366');
    default: // ploughed earth
      return ly % 4 < 2 ? P('#7a5838') : h1 < 0.2 ? P('#a07650') : P('#8f6844');
  }
}

// The town's ground: blocks, the fountain square, the piazza's paving and
// the lanes between them (with centre lines and zebra crossings)
function townPixel(X, Y, h1, dith, blocks, onRoute) {
  const inner = townInner(X, Y);
  if (inner) {
    for (const b of blocks) if (inRect(X, Y, b)) return blockPixel(b, X, Y, h1, dith);
    if (inRect(X, Y, SQUARE)) return squarePixel(X, Y, h1, dith);
    if (inRect(X, Y, RING_ZONE)) {
      if (ell(X, Y, PIAZZA.x, PIAZZA.y, PIAZZA.ix, PIAZZA.iy) < 1 && Y < PLAZA_END) {
        const e = ell(X, Y, PIAZZA.x, PIAZZA.y, PIAZZA.ix, PIAZZA.iy);
        return e > 0.9 ? C.plaza[2] : X % 8 === 0 || Y % 8 === 0 ? shade(C.plaza[0], 0.92) : pick(C.plaza, h1 * 0.7);
      }
      const pave = (X + (Math.floor(Y / 4) % 2) * 3) % 6 === 0 || Y % 4 === 0;
      return pave ? C.cobble[1] : h1 < 0.08 ? C.cobble[3] : h1 > 0.92 ? C.cobble[2] : C.cobble[0];
    }
  }
  const c = h1 < 0.1 ? C.asphalt[2] : h1 > 0.93 ? C.asphalt[1] : C.asphalt[0];
  if (!inner || onRoute) return c;
  const vi = ROADS_V.findIndex((v) => Math.abs(X + 0.5 - v) < ROAD / 2);
  const hi = ROADS_H.findIndex((v) => Math.abs(Y + 0.5 - v) < ROAD / 2);
  const LINE = P('#e8e2d0'), ZEBRA = P('#ece6d6');
  if (vi >= 0 && hi < 0) {
    const v = ROADS_V[vi];
    const hc = ROADS_H.reduce((a, b) => (Math.abs(b - Y) < Math.abs(a - Y) ? b : a));
    const d = Math.abs(Y + 0.5 - hc);
    if (d > 16 && d < 23 && hash2(v, hc) < 0.5) return (X - v + 40) % 4 < 2 && Math.abs(X + 0.5 - v) < 12 ? ZEBRA : c;
    if ((X === v - 1 || X === v) && Y % 10 < 6 && d > 24) return LINE;
  } else if (hi >= 0 && vi < 0) {
    const hc = ROADS_H[hi];
    const v = ROADS_V.reduce((a, b) => (Math.abs(b - X) < Math.abs(a - X) ? b : a));
    const d = Math.abs(X + 0.5 - v);
    if (d > 16 && d < 23 && hash2(hc, v) < 0.5) return (Y - hc + 40) % 4 < 2 && Math.abs(Y + 0.5 - hc) < 12 ? ZEBRA : c;
    if ((Y === hc - 1 || Y === hc) && X % 10 < 6 && d > 24) return LINE;
  }
  return c;
}

// A town block: a pale kerb (its front face catching shadow) round a lawn
function blockPixel(b, X, Y, h1, dith) {
  const lx = X - b.x, ly = Y - b.y, rx = b.x + b.w - 1 - X, ry = b.y + b.h - 1 - Y;
  if (ry === 0) return P('#7d6a4f');
  if (ry < 2) return h1 < 0.15 ? P('#a8936f') : P('#b8a07a');
  if (lx < 2 || rx < 2 || ly < 2 || ry < 3) return h1 < 0.12 ? P('#d6c6a2') : P('#e6d8b6');
  if (ry < 4 || lx < 3 || rx < 3) return shade(C.lawn[0], 0.86); // kerb shadow on the grass
  const bed = b.beds && b.beds.find((q) => inRect(X, Y, q));
  if (bed) {
    const e = X === bed.x || Y === bed.y || X === bed.x + bed.w - 1 || Y === bed.y + bed.h - 1;
    if (e) return P('#9c8664');
    return h1 < 0.32 ? P(['#f29bb7', '#f6d55c', '#fff7e8', '#e0533f', '#c9a2e0'][Math.floor(hash2(Y, X) * 5)]) : h1 < 0.62 ? P('#3f7a35') : P('#6b4a2f');
  }
  if (b.paths) {
    // gravel paths crossing a little public garden
    const mx = b.x + b.w / 2, my = b.y + b.h * 0.72;
    if ((Math.abs(X + 0.5 - mx) < 3 && Y > b.y + 16) || Math.abs(Y + 0.5 - my) < 3) return pick(C.gravel, h1);
  }
  if (h1 < 0.006) return P(['#f29bb7', '#f6d55c', '#fff7e8'][Math.floor(hash2(Y, X) * 3)]);
  return C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
}

// The fountain square: big pale paving slabs with a ring round the fountain,
// lawns with trees in the corners and a flower bed along the top
function squarePixel(X, Y, h1, dith) {
  const lx = X - SQUARE.x, ly = Y - SQUARE.y, rx = SQUARE.x + SQUARE.w - 1 - X, ry = SQUARE.y + SQUARE.h - 1 - Y;
  if (ry === 0) return P('#7d6a4f');
  if (ry < 2) return P('#b8a07a');
  if (lx < 2 || rx < 2 || ly < 2 || ry < 3) return h1 < 0.12 ? P('#d6c6a2') : P('#e6d8b6');
  const gq = SQ_GREENS.find((q) => inRect(X, Y, q));
  if (gq) {
    const e = X === gq.x || Y === gq.y || X === gq.x + gq.w - 1 || Y === gq.y + gq.h - 1;
    if (e) return P('#b8a07a');
    return C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
  }
  const bed = SQ_BEDS.find((q) => inRect(X, Y, q));
  if (bed) {
    const e = X === bed.x || Y === bed.y || X === bed.x + bed.w - 1 || Y === bed.y + bed.h - 1;
    if (e) return P('#9c8664');
    return h1 < 0.35 ? P(['#f29bb7', '#f6d55c', '#fff7e8', '#e0533f'][Math.floor(hash2(Y, X) * 4)]) : P('#3f7a35');
  }
  const r = Math.hypot(X + 0.5 - FOUNT.x, (Y + 0.5 - FOUNT.y) * 1.6);
  if (Math.abs(r - 46) < 1.2 || Math.abs(r - 50) < 0.8) return P('#b8a07a');
  if (r < 46) return (X + Y) % 2 === 0 && h1 < 0.5 ? P('#d2bf9a') : P('#dccaa6');
  const joint = lx % 10 === 0 || ly % 10 === 0;
  return joint ? P('#c9b28c') : h1 < 0.1 ? P('#e3d3b0') : P('#d8c4a0');
}

// One pixel of the piazza's ring of houses (or null where there is none).
// Roofs follow the ring with a ridge along its middle; facades are split into
// houses and 14px bays, and each bay's windows and arch sit level on that
// bay's own baseline, so they stay upright and evenly spaced round the curve.
const INK = P('#2a1a14');
const RING_BAY = 14;
const RING_MX = (PIAZZA.ix + PIAZZA.ox) / 2, RING_MY = (PIAZZA.iy + PIAZZA.oy) / 2;
const RING_ROOF = C.roof[0], RING_ROOF_IN = shade(C.roof[0], 0.9);
function ringPixel(X, Y, h1) {
  const iv = ringAt(X, Y);
  if (!iv) return null;
  const PH = PIAZZA.h, cx = PIAZZA.x, cy = PIAZZA.y;
  // outline where the ring meets the ground, and where the south half overlaps the north
  const edge = (o) => !o || (iv.s === 1 && o.s === -1);
  if (edge(ringAt(X - 1, Y)) || edge(ringAt(X + 1, Y)) || edge(ringAt(X, Y - 1))) return INK;

  const dx = X + 0.5 - cx;
  const bayK = Math.floor((X - cx + 1036) / RING_BAY);
  const house = bayK >> 1;
  const side = iv.s === -1 ? -1 : 1;

  if (Y < iv.b - PH) {
    // the roof, one colour all the way round: outer slope lit, inner slope a
    // shade darker, a light ridge along the middle, tile rows and dark eaves
    if (Y >= iv.b - PH - 1) return shade(RING_ROOF, 0.62);
    const fy = Y + PH;
    const out = (x, y) => ell(x + 0.5, y + 0.5, cx, cy, RING_MX, RING_MY) >= 1;
    const o = out(X, fy);
    const ridge = out(X, fy - 1) !== o || out(X, fy + 1) !== o || out(X - 1, fy) !== o || out(X + 1, fy) !== o;
    if (ridge) return shade(RING_ROOF, o ? 1.24 : 1.08);
    const col = o ? RING_ROOF : RING_ROOF_IN;
    return Y % 3 === 0 ? shade(col, 0.85) : col;
  }

  // the facade
  const h = iv.b - Y; // height above the ground, 1..PH
  let wall = C.facade[Math.floor(hash2(house, side + 9) * C.facade.length)];
  if (side === 1 ? dx > 0 : dx < 0) wall = shade(wall, 0.92); // the half turned away from the light
  if (h > PH - 2) return shade(wall, 1.12);
  if (h === PH - 2) return shade(wall, 0.8);
  if (h <= 1) return shade(wall, 0.62);
  if ((X - cx + 1036) % (RING_BAY * 2) === 0) return shade(wall, 0.84); // party wall between houses

  const x0 = cx - 1036 + bayK * RING_BAY;
  const wx = X - x0;
  const edgeAt = (x) => {
    const d = x + 0.5 - cx;
    if (Math.abs(d) < PASS + 1) return NaN;
    if (side === -1) return Math.abs(d) < PIAZZA.ix - 2 ? cy - Math.round(ringInner(d)) : NaN;
    return Math.abs(d) < PIAZZA.ox - 2 ? cy + Math.round(ringOuter(d)) : NaN;
  };
  // Bays close to level get a window with shutters over a shop arch; steeper
  // bays round the ends get a narrow window over a narrow arch. Either way
  // they sit level on the bay's own baseline, so nothing shears.
  const wide = Math.abs(edgeAt(x0 + 1) - edgeAt(x0 + 12)) <= 5;
  const narrow = !wide && Math.abs(edgeAt(x0 + 4) - edgeAt(x0 + 9)) <= 4;
  if (wide || narrow) {
    const hb = edgeAt(x0 + 7) - Y;
    const ar = wide ? 3 : 2;
    if (wx >= 7 - ar && wx < 7 + ar) {
      const top = 11 + Math.sqrt(Math.max(0, ar * ar - (wx + 0.5 - 7) ** 2));
      if (hb < top) return P(h <= 2 ? '#4a3a2e' : '#3b2a20');
      if (hb < top + 1) return shade(wall, 0.78);
    }
    const s0 = wide ? 2 : 5, w0 = wide ? 4 : 5, w1 = wide ? 10 : 9, s1 = wide ? 12 : 9;
    for (const rb of [25, 41]) {
      const rel = hb - rb;
      if (wx < s0 || wx >= s1) break;
      if (rel === -1) return shade(wall, 1.15);
      if (rel >= 0 && rel < 8) {
        if (wx < w0 || wx >= w1) return rel % 2 === 0 ? P('#2f5236') : P('#3e6b45');
        return rel >= 4 && rel < 7 && wx > w0 && wx < w1 - 1 ? P('#4a5d66') : P('#2f2622');
      }
    }
  }
  return h1 < 0.1 ? shade(wall, 0.95) : wall;
}
