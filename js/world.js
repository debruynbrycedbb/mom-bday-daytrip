// The map of the day, drawn in code at one scale: about 9px to the metre, so
// Mom and Dad are 15-16px tall. Houses, trees, roads, the car and the dogs
// all follow that scale; long distances between places are shortened so the
// trip stays a few minutes long.
//
// The ground is painted pixel by pixel in 256px tiles, made on demand.
// Things the family can walk behind (trees, gates, lamps, café umbrellas)
// are drawn every frame in depth order; everything else is baked into tiles.
import { mulberry32, hash2, vnoise, bayer, hex, shade, disc, densify } from './pixel.js?v=8';

export const W = 2200;
export const H = 6800;
const CH = 256;      // tile size
const PAD = 100;     // mask margin around a tile

// ---------------------------------------------------------------- layout

// The Ponte del Diavolo: a tall, lopsided hump of a bridge over the Serchio.
// x,y = west end of the deck; the deck rises `hump` pixels, highest at `apex`.
const BRIDGE = { x: 1008, y: 3240, w: 200, hump: 52, apex: 0.38 };
function deckY(x) {
  const t = Math.max(0, Math.min(1, (x - BRIDGE.x) / BRIDGE.w));
  const u = t < BRIDGE.apex ? t / BRIDGE.apex : (1 - t) / (1 - BRIDGE.apex);
  return BRIDGE.y - Math.round(BRIDGE.hump * Math.pow(Math.sin(u * Math.PI / 2), 1.25));
}
// the walk up the deck to its top, and back down
function deckWalk() {
  const up = [0.03, 0.12, 0.22, 0.3].map((t) => BRIDGE.x + t * BRIDGE.w);
  const top = BRIDGE.x + BRIDGE.apex * BRIDGE.w;
  const pt = (x, extra = {}) => ({ x: Math.round(x), y: deckY(x) - 1, deck: true, ...extra });
  return [
    ...up.map((x) => pt(x)),
    pt(top, { stop: 3, sign: [26, -6] }),
    ...up.slice().reverse().map((x) => ({ ...pt(x), y: deckY(x) })),
  ];
}

// The route. m:'d' = this leg is driven; car = the car is parked here (where a
// drive starts or ends). stop = stop number. sign = signpost offset.
// deck = on the Ponte del Diavolo (no path is painted under these).
const ROUTE = [
  { x: 590, y: 196, stop: 0 },
  { x: 590, y: 260 },
  { x: 590, y: 316 },
  // Lucca: down the gate street past the fountain square, west, south, then east to stop 1
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
  // east to the gate street, then straight down it through the piazza's two
  // passages and on to the south gate
  { x: 560, y: 654 },
  { x: 578, y: 655 },
  { x: 588, y: 662 },
  { x: 590, y: 676 },
  { x: 590, y: 760 },
  { x: 590, y: 850 },
  { x: 590, y: 925, stop: 2, sign: [28, -4] },
  { x: 590, y: 1010 },
  { x: 590, y: 1120 },
  { x: 590, y: 1250 },
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
  { x: 600, y: 2420, car: true },
  // Day 1, drive 1 (with the cutscene): down the valley to Borgo a Mozzano
  { x: 700, y: 2500, m: 'd' },
  { x: 860, y: 2580, m: 'd' },
  { x: 1000, y: 2700, m: 'd' },
  { x: 1080, y: 2860, m: 'd' },
  { x: 1010, y: 2990, m: 'd' },
  { x: 880, y: 3040, m: 'd' },
  { x: 820, y: 3130, m: 'd' },
  { x: 870, y: 3210, m: 'd' },
  { x: 940, y: 3236, m: 'd', car: true },
  // up onto the Ponte del Diavolo, and back to the car
  { x: 978, y: 3240 },
  ...deckWalk(),
  { x: 978, y: 3241 },
  { x: 940, y: 3237, car: true },
  // drive 2: across the river to Bagni di Lucca
  { x: 900, y: 3330, m: 'd' },
  { x: 862, y: 3460, m: 'd' },
  { x: 900, y: 3650, m: 'd' },
  { x: 980, y: 3900, m: 'd' },
  { x: 1030, y: 4150, m: 'd' },
  { x: 1030, y: 4400, m: 'd' },
  { x: 990, y: 4620, m: 'd' },
  { x: 920, y: 4790, m: 'd' },
  { x: 870, y: 4826, m: 'd', car: true },
  { x: 800, y: 4846 },
  { x: 705, y: 4858, stop: 4, sign: [-30, -2] },
  { x: 800, y: 4847 },
  { x: 870, y: 4827, car: true },
  // drive 3: further up the valley to Barga, then up its streets to the Duomo
  { x: 940, y: 4920, m: 'd' },
  { x: 1030, y: 5080, m: 'd' },
  { x: 1070, y: 5280, m: 'd' },
  { x: 1020, y: 5480, m: 'd' },
  { x: 980, y: 5650, m: 'd' },
  { x: 960, y: 5740, m: 'd' },
  { x: 930, y: 5790, m: 'd', car: true },
  { x: 885, y: 5772 },
  { x: 845, y: 5738 },
  { x: 805, y: 5704 },
  { x: 772, y: 5666 },
  { x: 746, y: 5636 },
  { x: 704, y: 5618, stop: 5, sign: [24, -4] },
  { x: 746, y: 5637 },
  { x: 772, y: 5667 },
  { x: 805, y: 5705 },
  { x: 845, y: 5739 },
  { x: 885, y: 5773 },
  { x: 930, y: 5791, car: true },
  // Day 2, drive 4: on to Castiglione di Garfagnana, in through its gate
  { x: 990, y: 5880, m: 'd' },
  { x: 1020, y: 6020, m: 'd' },
  { x: 980, y: 6170, m: 'd' },
  { x: 910, y: 6290, m: 'd' },
  { x: 866, y: 6390, m: 'd' },
  { x: 850, y: 6436, m: 'd', car: true },
  { x: 800, y: 6440 },
  { x: 770, y: 6440 },
  { x: 740, y: 6442 },
  { x: 700, y: 6444 },
  { x: 662, y: 6446, stop: 6, sign: [-26, -4] },
  { x: 700, y: 6445 },
  { x: 740, y: 6443 },
  { x: 770, y: 6441 },
  { x: 800, y: 6441 },
  { x: 850, y: 6437, car: true },
  // drive 5 (with the cutscene): over the Apuan Alps to Pietrasanta
  { x: 950, y: 6500, m: 'd' },
  { x: 1120, y: 6560, m: 'd' },
  { x: 1300, y: 6480, m: 'd' },
  { x: 1400, y: 6300, m: 'd' },
  { x: 1330, y: 6120, m: 'd' },
  { x: 1460, y: 5950, m: 'd' },
  { x: 1400, y: 5780, m: 'd' },
  { x: 1540, y: 5620, m: 'd' },
  { x: 1520, y: 5420, m: 'd' },
  { x: 1640, y: 5250, m: 'd' },
  { x: 1700, y: 5000, m: 'd' },
  { x: 1740, y: 4750, m: 'd' },
  { x: 1760, y: 4560, m: 'd' },
  { x: 1762, y: 4486, m: 'd', car: true },
  { x: 1762, y: 4440 },
  { x: 1762, y: 4390 },
  { x: 1762, y: 4342, stop: 7, sign: [26, -4] },
  { x: 1762, y: 4391 },
  { x: 1762, y: 4441 },
  { x: 1762, y: 4487, car: true },
  // drive 6: home to Lucca, round the east side of its walls
  { x: 1840, y: 4470, m: 'd' },
  { x: 1900, y: 4300, m: 'd' },
  { x: 1900, y: 4000, m: 'd' },
  { x: 1820, y: 3600, m: 'd' },
  { x: 1720, y: 3200, m: 'd' },
  { x: 1620, y: 2800, m: 'd' },
  { x: 1540, y: 2400, m: 'd' },
  { x: 1460, y: 2050, m: 'd' },
  { x: 1340, y: 1700, m: 'd' },
  { x: 1250, y: 1400, m: 'd' },
  { x: 1200, y: 1150, m: 'd' },
  { x: 1190, y: 1060, m: 'd' },
  { x: 1180, y: 1024, m: 'd', car: true },
  // and up onto Lucca's walls for the last stop
  { x: 1130, y: 1016 },
  { x: 1090, y: 1004 },
  { x: 1062, y: 994 },
  { x: 1036, y: 982, stop: 8, sign: [-26, -4] },
];

// The drives, in order: the first and the mountain pass get the cutscene
export const DRIVES = [
  { cut: true, caption: 'On the road to the Ponte del Diavolo' },
  { caption: 'Driving to Bagni di Lucca' },
  { caption: 'Driving up the valley to Barga' },
  { caption: 'Driving to Castiglione di Garfagnana' },
  { cut: true, sea: true, caption: 'Over the mountains to the coast' },
  { caption: 'Driving home to Lucca' },
];

const RIVER = [
  [1400, 2300], [1250, 2480], [1240, 2700], [1250, 2950], [1180, 3150], [1020, 3340],
  [840, 3470], [680, 3600], [580, 3780], [530, 3960], [440, 4170], [320, 4380],
  [250, 4620], [210, 4900], [170, 5200], [150, 5560], [150, 6000], [200, 6400], [260, 6900],
].map(([x, y]) => ({ x, y }));
// downstream the Serchio runs out to the sea
RIVER.unshift(...[[2260, 1760], [2000, 1840], [1800, 1940], [1600, 2080]].map(([x, y]) => ({ x, y })));

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
const SQUARE = { x: 604, y: 428, w: 178, h: 92 };       // the fountain square, beside the gate street
const FOUNT = { x: 693, y: 478 };
const RING_ZONE = { x: 398, y: 668, w: 384, h: 452 };   // paving round the piazza, in the middle of town
const SQ_GREENS = [
  { x: 608, y: 432, w: 20, h: 18 }, { x: 758, y: 432, w: 20, h: 18 },
  { x: 608, y: 494, w: 20, h: 21 }, { x: 758, y: 494, w: 20, h: 21 },
];
const SQ_BEDS = [{ x: 650, y: 433, w: 86, h: 5 }];

// Piazza dell'Anfiteatro, in the middle of town: an oval ring of houses a
// storey taller than the streets round it, with two passages (north and
// south, 2*PASS wide) cut straight through it on the line of the gate street
const PIAZZA = { x: 590, y: 920, ix: 128, iy: 103, ox: 170, oy: 145, h: 46 };
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
  { x: 545, y: 2404, w: 120, h: 40 },   // by Lucca's park
  { x: 890, y: 3218, w: 100, h: 36 },   // by the Ponte del Diavolo
  { x: 820, y: 4808, w: 110, h: 40 },   // Bagni di Lucca
  { x: 880, y: 5772, w: 100, h: 36 },   // below Barga
  { x: 800, y: 6418, w: 100, h: 36 },   // outside Castiglione's gate
  { x: 1712, y: 4468, w: 100, h: 36 },  // Pietrasanta
  { x: 1130, y: 1006, w: 100, h: 36 },  // back outside Lucca's walls
];
const SPA = { x: 625, y: 4749, w: 150, roofD: 30 };   // Terme Bagno Bernabò
const POOL = { x: 470, y: 4770, w: 100, h: 56 };
// the birthday picnic, up on Lucca's walls (the wall top shows WALL_H above its footprint)
const PICNIC = { x: 1014, y: 930 };
const FINAL = { x: 1036, y: 960 };

// Barga: a hill town, its streets climbing to the Duomo
const BARGA = { x: 770, y: 5690, r: 220, duomo: { x: 694, y: 5600 } };
// the hill's edge, wobbly rather than a perfect circle
const bargaR = (x, y) => BARGA.r + 16 * Math.sin(Math.atan2(y - BARGA.y, x - BARGA.x) * 3 + 1) + 10 * Math.sin(Math.atan2(y - BARGA.y, x - BARGA.x) * 7);
// Castiglione di Garfagnana: a village inside its own small ring of walls
const CAST = { cx: 630, cy: 6440, hx: 130, hy: 92, r: 26, band: 10, h: 16, gate: { x: 760, y: 6440 } };
// Pietrasanta: streets round Piazza del Duomo
const PIETRA = { x: 1588, y: 4100, w: 290, h: 356 };
const PIAZZA_PS = { x: 1690, y: 4250, w: 146, h: 152 };
// the coast: sea to the right of this line, with a sandy beach
const coastX = (y) => 1990 + Math.round(14 * Math.sin(y / 260) + 8 * Math.sin(y / 90));
// the Apuan Alps, between the valley and the coast
const inAlps = (x, y) => y > 4720 && y < 6720 && x > 1110 + 50 * Math.sin(y / 300) && x < 1690 - 70 * Math.cos(y / 240);

export const LABELS = [
  { text: 'Lucca', x: 330, y: 196 },
  { text: 'Torre Guinigi', x: TOWER.x, y: TOWER.y - TOWER.h - TOWER.d - 20 },
  { text: "Piazza dell'Anfiteatro", x: PIAZZA.x + 96, y: PIAZZA.y - PIAZZA.oy - 12 },
  { text: 'Serchio valley', x: 1330, y: 2640 },
  { text: 'Ponte del Diavolo', x: BRIDGE.x + 168, y: BRIDGE.y - 26 },
  { text: 'Bagni di Lucca', x: 700, y: 4710 },
  { text: 'Barga', x: 740, y: 5500 },
  { text: 'Castiglione di Garfagnana', x: CAST.cx, y: CAST.cy - CAST.hy - 30 },
  { text: 'Apuan Alps', x: 1420, y: 5150 },
  { text: 'Pietrasanta', x: 1752, y: 4120 },
  { text: 'Versilia coast', x: 2090, y: 3700 },
];
export const POOL_RECT = POOL;
export const FINAL_SPOT = FINAL;
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
// Castiglione's walls: a small rounded rectangle, with a gate on the east side
const sdCast = (x, y) => {
  const qx = Math.abs(x - CAST.cx) - CAST.hx + CAST.r;
  const qy = Math.abs(y - CAST.cy) - CAST.hy + CAST.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CAST.r;
};
const castGate = (x, y) => Math.abs(y - CAST.gate.y) < 11 && x > CAST.gate.x - 16 && x < CAST.gate.x + 6;
const inCastWall = (x, y) => { const d = sdCast(x, y); return d < 0 && d > -CAST.band && !castGate(x, y); };
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
  const rx = 15, ry = 9;
  const c = cv(rx * 2 + 6, ry * 2 + 26);
  const g = c.getContext('2d');
  const cx = rx + 3, cy = ry + 20;
  const oct = (x, y, a, b) => Math.max(Math.abs(x) / a, Math.abs(y) / b, (Math.abs(x) / a + Math.abs(y) / b) / 1.35);
  for (let y = -ry - 3; y <= ry + 4; y++)
    for (let x = -rx - 3; x <= rx + 3; x++) {
      const e = oct(x, y, rx, ry), e2 = oct(x, y - 3, rx, ry);
      if (e2 < 1 && e >= 1) { g.fillStyle = y > 0 ? '#b8ab95' : '#cfc4ae'; g.fillRect(cx + x, cy + y, 1, 1); }
      if (e < 1) {
        g.fillStyle = e > 0.8 ? (e > 0.94 ? '#9c8f78' : '#ece4d3') : hash2(x, y) < 0.07 ? '#a8dcec' : (x + y) % 7 === 0 ? '#5aa8c4' : '#4f9fbd';
        g.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  // lower bowl on its column, then the top bowl and spout
  g.fillStyle = '#d9d0bf'; g.fillRect(cx - 1, cy - 9, 4, 9);
  g.fillStyle = '#b8ab95'; g.fillRect(cx + 2, cy - 9, 1, 9);
  for (let y = -3; y <= 3; y++)
    for (let x = -7; x <= 7; x++) {
      const e = ell(x, y, 0, 0, 7, 3);
      if (e < 1) { g.fillStyle = e > 0.55 ? '#e8e0cf' : '#5aa8c4'; g.fillRect(cx + x, cy - 10 + y, 1, 1); }
    }
  g.fillStyle = '#b8ab95'; g.fillRect(cx - 6, cy - 7, 13, 1);
  g.fillStyle = '#d9d0bf'; g.fillRect(cx - 1, cy - 17, 3, 7);
  disc(g, cx, cy - 17, 3, '#e8e0cf');
  disc(g, cx, cy - 18, 1, '#5aa8c4');
  g.fillStyle = '#cfeaf5'; g.fillRect(cx, cy - 22, 1, 3);
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

// The Ponte del Diavolo, seen from the south: the deck follows deckY(), with
// a great lopsided arch under its top and a small arch by the east bank
function makeBridge() {
  const { w, hump } = BRIDGE;
  const base = hump + 6;            // canvas row of BRIDGE.y
  const water = base + 20;          // where the piers meet the river
  const c = cv(w + 4, water + 4);
  const g = c.getContext('2d');
  const arch = (t, t0, t1, rise, foot) => {
    if (t <= t0 || t >= t1) return Infinity;
    const a = (t - t0) / (t1 - t0);
    return foot - Math.round(Math.sin(a * Math.PI) * rise);
  };
  for (let i = 0; i <= w; i++) {
    const t = i / w, x = i + 2;
    const top = deckY(BRIDGE.x + i) - BRIDGE.y + base;
    g.fillStyle = INKS; g.fillRect(x, top - 4, 1, 1);
    g.fillStyle = '#d9c7a2'; g.fillRect(x, top - 3, 1, 2);                     // parapet cap
    g.fillStyle = '#b9a27c'; g.fillRect(x, top - 1, 1, 1);
    g.fillStyle = '#cdb894'; g.fillRect(x, top, 1, 2);                         // the deck you walk on
    const under = Math.min(arch(t, 0.07, 0.72, hump + 16, water), arch(t, 0.77, 0.94, 12, water));
    const bottom = Math.min(water, under);
    for (let y = top + 2; y < bottom; y++) {
      const course = (y - top) % 4 === 0 || (x + Math.floor((y - top) / 4) * 3) % 9 === 0;
      g.fillStyle = course ? '#8f7b5c' : hash2(x, y) < 0.2 ? '#b39c78' : '#a99270';
      g.fillRect(x, y, 1, 1);
    }
    if (under < water) { g.fillStyle = '#6b5a45'; g.fillRect(x, under - 1, 1, 1); }  // shadowed arch edge
    if (bottom >= water) { g.fillStyle = 'rgba(30,40,60,0.35)'; g.fillRect(x, water, 1, 3); }
  }
  return { canvas: c, x: BRIDGE.x - 2, y: BRIDGE.y - base };
}

// Barga's Duomo di San Cristoforo: a pale stone church with a square,
// crenellated bell tower beside it
function makeDuomoBarga() {
  const c = cv(66, 78);
  const g = c.getContext('2d');
  const stone = (x0, y0, w, h, lit = 1) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const joint = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 3) % 7 === 0;
        const base = joint ? [176, 164, 140] : hash2(x0 + x, y0 + y) < 0.2 ? [224, 212, 186] : [214, 201, 174];
        g.fillStyle = rgb(shade(base, lit)); g.fillRect(x0 + x, y0 + y, 1, 1);
      }
  };
  // nave: roof seen from above, then the gabled front
  const roof = C.roof[3];
  for (let y = 0; y < 18; y++)
    for (let x = 1; x < 44; x++) {
      let col = x < 22 ? shade(roof, 0.86) : roof;
      if (x === 22) col = shade(roof, 1.2);
      else if (y % 3 === 0) col = shade(col, 0.88);
      g.fillStyle = rgb(col); g.fillRect(x, 18 + y, 1, 1);
    }
  stone(1, 36, 43, 40);
  for (let j = 1; j <= 14; j++) {            // gable
    const half = 21.5 * (1 - j / 15);
    for (let x = Math.ceil(22.5 - half); x < 22.5 + half; x++) {
      const edge = x < 22.5 - half + 2 || x >= 22.5 + half - 2;
      g.fillStyle = edge ? '#8f7b5c' : '#d6c9ad'; g.fillRect(x, 36 - j, 1, 1);
    }
  }
  g.fillStyle = '#2f2622'; disc(g, 22, 29, 2.5, '#2f2622');
  g.fillStyle = '#7d6a4f'; g.fillRect(4, 44, 37, 1);                          // arcade line
  for (const ax of [8, 16, 28, 36]) { g.fillStyle = '#9c8664'; g.fillRect(ax, 46, 2, 10); }
  g.fillStyle = '#2f2622'; g.fillRect(17, 58, 11, 18);                       // the door
  g.fillStyle = '#6b4329'; g.fillRect(18, 60, 9, 16);
  g.fillStyle = '#2f2622'; disc(g, 22, 59, 5, '#2f2622');
  g.fillStyle = '#6b4329'; disc(g, 22, 60, 3.5, '#6b4329');
  // bell tower
  stone(46, 6, 16, 70, 0.95);
  g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(58, 10, 4, 66);
  for (let k = 0; k < 4; k++) { g.fillStyle = '#cfc2a6'; g.fillRect(46 + k * 4, 2, 2, 4); }   // merlons
  g.fillStyle = '#2f2622'; g.fillRect(49, 14, 4, 9); g.fillRect(55, 14, 4, 9);              // belfry
  g.fillStyle = '#e8c35a'; g.fillRect(50, 19, 2, 2);
  g.fillStyle = INKS;
  g.fillRect(0, 18, 1, 58); g.fillRect(44, 18, 1, 58); g.fillRect(0, 76, 63, 1);
  g.fillRect(45, 2, 1, 74); g.fillRect(62, 2, 1, 74); g.fillRect(45, 6, 18, 1);
  return c;
}

// A square tower for Castiglione's walls (and its bigger Rocca)
function makeCastTower(w, h, d, seed) {
  const c = cv(w + 2, h + d + 6);
  const g = c.getContext('2d');
  const top = 6;
  for (let k = 0; k < w; k += 4) { g.fillStyle = '#c6c0b4'; g.fillRect(1 + k, top - 4, 2, 4); }   // merlons
  for (let y = 0; y < d; y++) { g.fillStyle = y === 0 ? '#d4cec3' : '#8b8478'; g.fillRect(1, top + y, w, 1); }  // walkway on top
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const joint = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
      g.fillStyle = joint ? '#7f7a70' : hash2(x + seed, y) < 0.25 ? '#bdb7ac' : '#aea89c';
      g.fillRect(1 + x, top + d + y, 1, 1);
    }
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(w - 3, top + d, 3, h);
  g.fillStyle = '#2f2622';
  for (let y = top + d + 6; y < top + d + h - 10; y += 14) g.fillRect(Math.round(w / 2), y, 2, 5);   // arrow slits
  g.fillStyle = INKS;
  g.fillRect(0, top - 4, 1, h + d + 4); g.fillRect(w + 1, top - 4, 1, h + d + 4); g.fillRect(0, top + d + h - 1, w + 2, 1);
  return c;
}

// Pietrasanta's Duomo di San Martino: a white marble front with three doors
// and a rose window, and its red brick bell tower
function makeSanMartino() {
  const c = cv(80, 96);
  const g = c.getContext('2d');
  const roof = C.roof[1];
  for (let y = 0; y < 22; y++)
    for (let x = 1; x < 59; x++) {
      let col = x < 30 ? shade(roof, 0.86) : roof;
      if (x === 30) col = shade(roof, 1.2);
      else if (y % 3 === 0) col = shade(col, 0.88);
      g.fillStyle = rgb(col); g.fillRect(x, 26 + y, 1, 1);
    }
  for (let y = 48; y < 94; y++)
    for (let x = 1; x < 59; x++) {
      const vein = Math.abs(Math.sin(x * 0.21 + y * 0.33)) < 0.05;
      g.fillStyle = vein ? '#d9d6cf' : hash2(x, y) < 0.06 ? '#e8e5de' : '#f3f1ec';
      g.fillRect(x, y, 1, 1);
    }
  for (let j = 1; j <= 16; j++) {
    const half = 29 * (1 - j / 17);
    for (let x = Math.ceil(30 - half); x < 30 + half; x++) {
      const edge = x < 30 - half + 2 || x >= 30 + half - 2;
      g.fillStyle = edge ? '#c9c4ba' : '#f3f1ec'; g.fillRect(x, 48 - j, 1, 1);
    }
  }
  g.fillStyle = '#c9c4ba'; g.fillRect(1, 48, 58, 1); g.fillRect(1, 64, 58, 1);
  disc(g, 30, 56, 6, '#8f8a80'); disc(g, 30, 56, 4.5, '#5b6f86'); disc(g, 30, 56, 1.5, '#e8c35a');
  for (const [dx, wd, ht] of [[10, 7, 14], [26, 9, 20], [44, 7, 14]]) {
    g.fillStyle = '#2f2622'; g.fillRect(dx, 94 - ht, wd, ht);
    g.fillStyle = '#7d5234'; g.fillRect(dx + 1, 95 - ht, wd - 2, ht - 1);
    g.fillStyle = '#d9d6cf'; g.fillRect(dx - 1, 93 - ht, wd + 2, 1);
  }
  // the bell tower, in plain red brick
  for (let y = 0; y < 94; y++)
    for (let x = 62; x < 78; x++) {
      const mortar = y % 3 === 0 || (x + (Math.floor(y / 3) % 2) * 3) % 6 === 0;
      g.fillStyle = mortar ? '#7a3f28' : hash2(x, y) < 0.3 ? '#b35d3a' : '#a65233';
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = '#2f2622'; g.fillRect(66, 8, 3, 8); g.fillRect(71, 8, 3, 8);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(74, 0, 4, 94);
  g.fillStyle = INKS;
  g.fillRect(0, 26, 1, 69); g.fillRect(59, 26, 1, 69); g.fillRect(0, 94, 60, 1);
  g.fillRect(61, 0, 1, 95); g.fillRect(78, 0, 1, 95); g.fillRect(61, 0, 18, 1); g.fillRect(61, 94, 18, 1);
  return c;
}

// A modern sculpture on a plinth: kind 0 standing figure, 1 a ring, 2 a
// reclining figure; marble or bronze
function makeStatue(kind, bronze) {
  const c = cv(16, 26);
  const g = c.getContext('2d');
  const m = bronze ? ['#5a3e27', '#7d5a36', '#a77c45'] : ['#bdb8ae', '#e3e0d9', '#ffffff'];
  g.fillStyle = 'rgba(25,20,15,0.3)'; g.fillRect(2, 24, 12, 2);
  g.fillStyle = '#8a857b'; g.fillRect(3, 18, 10, 7);
  g.fillStyle = '#b0aba1'; g.fillRect(3, 18, 10, 2);
  if (kind === 0) {
    disc(g, 8, 3, 2.5, m[1]);
    g.fillStyle = m[1]; g.fillRect(6, 6, 4, 8); g.fillRect(6, 14, 2, 4); g.fillRect(8, 14, 2, 4);
    g.fillStyle = m[2]; g.fillRect(6, 6, 1, 8);
    g.fillStyle = m[0]; g.fillRect(9, 6, 1, 8); g.fillRect(4, 7, 2, 5);
  } else if (kind === 1) {
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const x = Math.round(8 + Math.cos(a) * 6), y = Math.round(10 + Math.sin(a) * 7);
      g.fillStyle = Math.cos(a) < 0 ? m[2] : m[0]; g.fillRect(x - 1, y, 2, 2);
    }
  } else {
    g.fillStyle = m[1]; g.fillRect(2, 13, 12, 5); g.fillRect(10, 9, 4, 4);
    g.fillStyle = m[2]; g.fillRect(2, 13, 12, 1);
    g.fillStyle = m[0]; g.fillRect(2, 17, 12, 1);
  }
  return c;
}

// A striped beach umbrella (Versilia's beaches are lined with them)
function makeBeachUmbrella(col) {
  const c = cv(11, 12);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(25,20,15,0.25)'; g.fillRect(2, 10, 8, 2);
  g.fillStyle = '#4a4038'; g.fillRect(5, 4, 1, 7);
  for (let y = 0; y < 5; y++) {
    const half = [2, 4, 5, 5, 5][y];
    for (let x = -half; x <= half; x++) {
      g.fillStyle = y === 4 ? '#2a1a14' : Math.floor((x + 6) / 2) % 2 ? '#fff3df' : col;
      g.fillRect(5 + x, y, 1, 1);
    }
  }
  return c;
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
    if ((r === 5 && c === 3) || (r === 7 && c === 2) || (r === 2 && c === 3)) b.park = true; // little public gardens
    out.push(b);
  }));
  // little gardens in the corners round the piazza
  out.push({ x: 400, y: 670, w: 50, h: 48, plot: true }, { x: 730, y: 670, w: 50, h: 48, plot: true });
  out.push({ x: 400, y: 1062, w: 50, h: 54, plot: true }, { x: 730, y: 1062, w: 50, h: 54, plot: true });
  return out;
}
const BLOCKS = townBlocks();

// ---------------------------------------------------------------- world

export function buildWorld(assets) {
  const r = densify(ROUTE, 1);
  const pts = r.pts;
  for (const p of pts) {
    const c = ROUTE[p.seg + 1];
    p.mode = c.m === 'd' ? 'drive' : 'walk';
    p.deck = !!c.deck;
  }
  const ctrl = (key) => r.ctrlD[ROUTE.findIndex((c) => c[key])];
  // the drives: each runs from the parked car before its first 'd' point to its last
  const legs = [];
  ROUTE.forEach((c, i) => {
    if (c.m !== 'd' || ROUTE[i - 1].m === 'd') return;
    let j = i;
    while (ROUTE[j + 1] && ROUTE[j + 1].m === 'd') j++;
    legs.push({ i: legs.length, startD: r.ctrlD[i - 1], endD: r.ctrlD[j], start: ROUTE[i - 1], end: ROUTE[j], ...DRIVES[legs.length] });
  });
  const stops = [];
  ROUTE.forEach((c, i) => {
    if (c.stop === undefined) return;
    const sign = c.sign || [0, 0];
    stops[c.stop] = { d: r.ctrlD[i], x: c.x, y: c.y, sx: c.x + sign[0], sy: c.y + sign[1] };
  });
  const chaseD = ctrl('chase');
  const river = densify(RIVER, 2).pts;
  const loop = densify(PARK_LOOP, 2).pts;
  const side = densify(PARK_SIDE, 2).pts;
  const nearRoute = polyIndex(pts);
  const nearRiver = polyIndex(river);
  const isWalk = (p) => p.mode === 'walk' && !p.deck;
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
  for (const [bx, by] of [[656, 513], [730, 513]]) bakeAt(bench, bx, by);
  const umbrella = makeUmbrella();
  for (const [ux, uy] of [[640, 488], [746, 488]]) bakeAt(umbrella, ux, uy);
  SQ_GREENS.forEach((gq, k) => {
    if (k < 2) bake(anyOf(bushes), gq.x + 5, gq.y + gq.h - 9); // low at the back, so nothing hangs over the lane
    else bakeAt(anyOf(gardenTrees), gq.x + gq.w / 2, gq.y + gq.h - 3);
  });
  for (const [lx, ly] of [[646, 452], [740, 452]]) bakeAt(lamp, lx, ly);

  // café tables in the piazza, in the part of the square in view (the
  // family walks among these, so they're drawn in depth order)
  for (const [x, y] of [[530, 860], [650, 860], [500, 905], [680, 905], [536, 950], [646, 950]]) sprites.push({ img: umbrella, x, y, kind: 'umbrella' });

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
      if (Math.abs(x - FINAL.x) < 40 && Math.abs(y - WALL_H - FINAL.y) < 110) return; // the picnic spot
      sprites.push({ img: assets[`olive${1 + (i % 3)}`], x: Math.round(x), y: Math.round(y) - WALL_H + 3, sortY: Math.round(y) + 14, kind: 'tree' });
    });
  }

  // ---- the towns along the way
  const spa = makeSpa();
  baked.push({ canvas: spa.canvas, x: spa.x, y: spa.y, sortY: spa.y + spa.canvas.height });
  occupy(SPA.x - 12, SPA.y - 12, SPA.w + 24, spa.canvas.height + 24);
  const pool = makePool();
  baked.push({ ...pool, sortY: POOL.y + POOL.h });
  occupy(POOL.x - 14, POOL.y - 14, POOL.w + 28, POOL.h + 28);
  CARPARKS.forEach((c) => occupy(c.x - 12, c.y - 12, c.w + 24, c.h + 24));
  occupy(PARK.x - 20, PARK.y - 20, PARK.w + 40, PARK.h + 40);
  occupy(BRIDGE.x - 10, BRIDGE.y - BRIDGE.hump - 20, BRIDGE.w + 20, BRIDGE.hump + 50);
  const clearOfPaths = (x, y, w, h, m = 24) => {
    for (let yy = y; yy <= y + h; yy += 8)
      for (let xx = x; xx <= x + w; xx += 8) {
        if (nearRoute(xx, yy, m + 40) < m + 20) return false;
        if (nearRiver(xx, yy, m + 60) < m + 42) return false;
      }
    return true;
  };
  // a village: houses gathered in an area, clear of the route and each other
  const village = (x0, y0, x1, y1, count, opts = {}) => {
    for (let n = 0, made = 0; n < count * 60 && made < count; n++) {
      const w = 24 + Math.floor(rand() * 20), roofD = 10 + Math.floor(rand() * 6);
      const floors = opts.floors ? opts.floors[Math.floor(rand() * opts.floors.length)] : rand() < 0.45 ? 3 : 2;
      const h = roofD + 22 + 16 * (floors - 1);
      const x = x0 + Math.floor(rand() * (x1 - x0 - w)), y = y0 + Math.floor(rand() * (y1 - y0 - h));
      const gap = opts.gap ?? 4;
      if (occupied(x - gap, y - gap, w + gap * 2, h + gap * 2) || !clearOfPaths(x, y, w, h, opts.margin ?? 4)) continue;
      if (opts.ok && !opts.ok(x, y, w, h)) continue;
      const wall = opts.walls ? P(opts.walls[Math.floor(rand() * opts.walls.length)]) : undefined;
      baked.push({ canvas: makeHouse(w, floors, roofD, rand(), { gable: rand() < 0.3, wall }), x, y, sortY: y + h });
      occupy(x, y, w, h);
      made++;
    }
  };
  // Borgo a Mozzano, by the bridge
  village(760, 3080, 1000, 3330, 10);
  // Bagni di Lucca round the spa, in the woods
  village(440, 4620, 1080, 4980, 22);
  // Barga: stone houses on the hill below its Duomo
  const duomo = makeDuomoBarga();
  bakeAt(duomo, BARGA.duomo.x, BARGA.duomo.y);
  occupy(BARGA.duomo.x - 36, BARGA.duomo.y - 80, 72, 84);
  occupy(BARGA.duomo.x - 30, BARGA.duomo.y, 80, 24); // the terrace in front
  const stoneWalls = ['#d6c9ad', '#cdbf9f', '#e2cfa8', '#c9b28c', '#e9c48a'];
  village(BARGA.x - BARGA.r + 20, BARGA.y - BARGA.r + 40, BARGA.x + BARGA.r - 10, BARGA.y + BARGA.r - 40, 60,
    { walls: stoneWalls, gap: 1, margin: 2, ok: (x, y, w, h) => Math.hypot(x + w / 2 - BARGA.x, y + h - BARGA.y) < bargaR(x + w / 2, y + h) - 26 });
  occupy(BARGA.x - BARGA.r, BARGA.y - BARGA.r, BARGA.r * 2, BARGA.r * 2);
  // Castiglione: towers on its walls, the Rocca, houses inside, a gatehouse to walk through
  {
    const { cx, cy, hx, hy } = CAST;
    for (const [tx, ty] of [[cx - hx + 8, cy - hy + 8], [cx + hx - 8, cy - hy + 8], [cx - hx + 8, cy + hy - 4], [cx + hx - 8, cy + hy - 4]]) {
      bakeAt(makeCastTower(14, 30, 6, tx), tx, ty);
      occupy(tx - 10, ty - 40, 20, 44);
    }
    bakeAt(makeCastTower(26, 46, 12, 3), cx - hx + 34, cy + 10);                 // the Rocca
    const gate = makeCastTower(18, 30, 6, 9);
    sprites.push({ img: gate, x: CAST.gate.x - 4, y: CAST.gate.y + 13, kind: 'gate' }); // you walk through (and behind) it
    const inside = (x, y, w, h) => sdCast(x, y) < -CAST.band - 2 && sdCast(x + w, y) < -CAST.band - 2 &&
      sdCast(x, y + h) < -CAST.band - 2 && sdCast(x + w, y + h) < -CAST.band - 2;
    const square = (x, y, w, h) => !(x < CAST.cx + 70 && x + w > CAST.cx - 10 && y < CAST.cy + 30 && y + h > CAST.cy - 30);
    occupy(cx - hx + 20, cy - 40, 30, 60);
    village(cx - hx, cy - hy, cx + hx, cy + hy, 22, { walls: stoneWalls, margin: 2, gap: 1, floors: [1, 2, 2], ok: (x, y, w, h) => inside(x, y, w, h) && square(x, y, w, h) });
    occupy(cx - hx - 30, cy - hy - 40, hx * 2 + 60, hy * 2 + 70);
  }
  // Pietrasanta: the Duomo and its bell tower on the piazza, marble and
  // bronze sculptures, café tables, galleries all round
  {
    const sm = makeSanMartino();
    bakeAt(sm, PIAZZA_PS.x + 66, PIAZZA_PS.y + 2);
    occupy(PIAZZA_PS.x - 4, PIAZZA_PS.y - 100, PIAZZA_PS.w + 8, PIAZZA_PS.h + 100);
    for (const [k, sx, sy, bronze] of [[0, 1708, 4300, false], [1, 1820, 4296, false], [2, 1712, 4380, false], [0, 1818, 4378, true]]) {
      sprites.push({ img: makeStatue(k, bronze), x: sx, y: sy, kind: 'statue' });
    }
    for (const [ux, uy] of [[1730, 4404], [1800, 4404]]) sprites.push({ img: umbrella, x: ux, y: uy, kind: 'umbrella' });
    const shops = ['#f3e3c3', '#f2c9a0', '#e9c48a', '#f0d9a8', '#e7b98f'];
    village(PIETRA.x, PIETRA.y, PIETRA.x + PIETRA.w, PIETRA.y + PIETRA.h, 44, { walls: shops, margin: 2, gap: 1 });
    occupy(PIETRA.x - 10, PIETRA.y - 10, PIETRA.w + 20, PIETRA.h + 20);
  }
  // the beach: rows of striped umbrellas along the sand
  {
    const cols = ['#c8423a', '#2e8f7a', '#3e6b9e', '#d6872c', '#e88aa8'];
    const brollies = cols.map(makeBeachUmbrella);
    for (let y = 3600; y < 5000; y += 14)
      for (let k = 0; k < 2; k++) bakeAt(brollies[Math.floor(y / 14 + k * 2) % cols.length], coastX(y) - 8 - k * 12, y);
    occupy(1900, 0, W - 1900, H);
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
    clearOfPaths(x, y, w, h, 20) && sdWall(x, y) > 90 && sdWall(x + w, y) > 90 && sdWall(x, y + h) > 90 && sdWall(x + w, y + h) > 90 &&
    !inAlps(x, y) && !inAlps(x + w, y) && !inAlps(x, y + h) && !inAlps(x + w, y + h) && x + w < coastX(y) - 40;
  for (let n = 0; n < 6000 && fields.length < 60; n++) {
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
  for (let n = 0, made = 0; n < 3000 && made < 26; n++) {
    const w = 30 + Math.floor(rand() * 16), roofD = 12, floors = rand() < 0.5 ? 2 : 1;
    const h = roofD + 22 + 16 * (floors - 1);
    const x = Math.floor(rand() * (W - w)), y = 1700 + Math.floor(rand() * 4900);
    if (!countryOk(x, y, w, h)) continue;
    baked.push({ canvas: makeHouse(w, floors, roofD, rand(), { wall: P(['#d9c7a2', '#e2cfa8', '#cdb894'][made % 3]), shop: false }), x, y, sortY: y + h });
    occupy(x - 16, y - 16, w + 32, h + 32);
    made++;
  }
  // cypress alleys along the road
  const cypress = [makeCypress(1), makeCypress(7), makeCypress(13)];
  for (let i = 0; i < pts.length; i += 30) {
    const p = pts[i];
    if (p.mode !== 'drive' || inAlps(p.x, p.y) || hash2(i, 7) < 0.45) continue;
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
  // (a coarse grid keeps the spacing check quick over a big map)
  const grid = new Map();
  const cell = (x, y) => `${x >> 6},${y >> 6}`;
  const tooClose = (x, y, dx, dy) => {
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++)
        for (const q of grid.get(`${(x >> 6) + i},${(y >> 6) + j}`) || []) if (Math.abs(q.x - x) < dx && Math.abs(q.y - y) < dy) return true;
    return false;
  };
  let count = 0;
  for (let n = 0; n < 40000 && count < 2100; n++) {
    const x = 12 + Math.floor(rand() * (W - 24)), y = 40 + Math.floor(rand() * (H - 50));
    const forest = vnoise(x, y, 300, 9) > 0.6;
    if (!forest && rand() < 0.55) continue;
    if (inAlps(x, y) && (alpsH(x, y) > 0.44 || rand() < 0.6)) continue; // bare rock up in the mountains
    if (occupied(x - 22, y - 58, 44, 68) || !clearOfPaths(x - 14, y - 5, 28, 10, 14)) continue; // keep the whole tree off buildings
    if (sdWall(x, y) < 96 || x > coastX(y) - 50) continue;
    if (tooClose(x, y, forest ? 44 : 64, forest ? 26 : 40)) continue;
    const roll = rand();
    const img = roll < 0.18 ? cypress[Math.floor(rand() * 3)] : roll < 0.45 ? assets[`olive${1 + Math.floor(rand() * 3)}`] : assets[treeImgs[Math.floor(rand() * 6)]];
    const k = cell(x, y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ x, y });
    count++;
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
  const madd = makeBridge();

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
    const nearCast = Math.abs(x0 + CH / 2 - CAST.cx) < CAST.hx + CH && Math.abs(y0 + CH / 2 - CAST.cy) < CAST.hy + CH;
    const nearAlps = x0 + CH > 1050 && x0 < 1760 && y0 + CH > 4700 && y0 < 6740;
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

        // 2b. Castiglione's walls (stone, 1.8 m high)
        if (!c && nearCast && Math.abs(sdCast(X, Y)) < CAST.h + 2) {
          if (inCastWall(X, Y + CAST.h)) c = (X % 4 < 2 && sdCast(X, Y + CAST.h) > -2) ? P('#d4cec3') : P('#bdb7ac');
          else for (let t = CAST.h - 1; t >= 0; t--) {
            if (!inCastWall(X, Y + t)) continue;
            if (t >= CAST.h - 2) c = P('#c6c0b4');
            else if (t < 1) c = P('#6f6a61');
            else {
              const joint = t % 4 === 0 || (X + (Math.floor(t / 4) % 2) * 4) % 8 === 0;
              c = joint ? P('#7f7a70') : h1 < 0.25 ? P('#b3ada2') : P('#a39d92');
            }
            break;
          }
        }

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
            // paths: gravel in the park, cobbles in the old towns, dirt elsewhere
            const town = Math.hypot(X - BARGA.x, Y - BARGA.y) < bargaR(X, Y) || (nearCast && sdCast(X, Y) < 30) || inRect(X, Y, PIETRA);
            c = nearPark && inParkRect(X, Y) ? pick(C.gravel, h1) : town ? (X + Y) % 5 === 0 || Y % 4 === 0 ? C.cobble[1] : C.cobble[0] : pick(C.dirt, h1);
          } else if (nearPark && m(Cm, 0, X, Y) && inParkRect(X, Y)) {
            c = pick(C.gravel, h1);
          } else if (m(A, 2, X, Y)) {
            c = m(Cm, 1, X, Y) ? pick(C.water, 0.7 + h1 * 0.3) : vnoise(X, Y, 10, 2) + dith * 0.3 > 0.58 ? C.water[1] : C.water[0];
          } else if (m(Cm, 2, X, Y)) {
            c = C.shallow[h1 < 0.5 ? 0 : 1];
          } else if (m(B, 2, X, Y)) {
            c = h1 < 0.03 ? P('#5f8a3c') : pick(C.bank, h1);
          } else if (X >= coastX(Y) - 26) {
            c = seaPixel(X, Y, h1, dith);
          } else if (nearCast && sdCast(X, Y) < 0) {
            const pave = (X + (Math.floor(Y / 4) % 2) * 3) % 6 === 0 || Y % 4 === 0;
            c = pave ? P('#a8a092') : h1 < 0.1 ? P('#cfc6b4') : P('#c2b9a6');
          } else if (inRect(X, Y, PIETRA)) {
            if (inRect(X, Y, PIAZZA_PS)) c = (X - PIAZZA_PS.x) % 12 === 0 || (Y - PIAZZA_PS.y) % 12 === 0 ? P('#cfcac0') : h1 < 0.08 ? P('#e5e1d8') : P('#f0ede6');
            else c = (X % 6 === 0 || Y % 4 === 0) ? P('#c9b99a') : h1 < 0.1 ? P('#e6d8b6') : P('#ddcdab');
          } else if (Math.hypot(X - BARGA.x, Y - BARGA.y) < bargaR(X, Y)) {
            // Barga's hill: gardens and terraces between the houses, and a
            // stone terrace in front of the Duomo
            const dd = Math.hypot(X - BARGA.x, (Y - BARGA.y) * 1.2) + vnoise(X, Y, 40, 2) * 10;
            if (ell(X, Y, BARGA.duomo.x + 10, BARGA.duomo.y + 12, 46, 13) < 1) c = (X % 6 === 0 || Y % 4 === 0) ? P('#b8a07a') : P('#d8c4a0');
            else if (Math.round(dd) % 18 === 0) c = shade(C.lawn[0], 0.9);
            else c = C.lawn[h1 < 0.5 + dith * 0.4 ? 0 : 1];
          } else if (nearAlps && inAlps(X, Y)) {
            c = alpsPixel(X, Y, h1, dith);
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
  const legAt = (d) => legs.find((l) => d > l.startD && d < l.endD) || null;
  const modeAt = (d) => (legAt(d) ? 'drive' : 'walk');

  return {
    pts, length: L, stops, legs, legAt, chaseD, at, tangent, modeAt,
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
  if (Math.abs(r - 30) < 1.2 || Math.abs(r - 33) < 0.8) return P('#b8a07a');
  if (r < 30) return (X + Y) % 2 === 0 && h1 < 0.5 ? P('#d2bf9a') : P('#dccaa6');
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
    for (const rb of [23, 35]) {
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

// The coast: sand, a darker line of wet sand, then the sea getting deeper
function seaPixel(X, Y, h1, dith) {
  const d = X - coastX(Y);
  if (d < -3) return h1 < 0.08 ? P('#d9c493') : h1 > 0.95 ? P('#f3e6c4') : P('#e8d7a8');
  if (d < 0) return P('#c9b07d');
  if (d < 3) return (Y + Math.floor(X / 3)) % 7 < 4 ? P('#fbf7ee') : P('#9fd0e6'); // surf
  if (d < 26) return d + dith * 8 < 14 ? P('#6aa9d4') : P('#5c9dcb');
  const wave = (Y + Math.floor(X / 9) * 4) % 13 === 0 && h1 < 0.6;
  return wave ? P('#7fb6dc') : d + dith * 20 < 60 ? C.water[1] : C.water[0];
}

// The Apuan Alps: a height field of ridged rock, lit from the top left, with
// pale peaks, scrubby lower slopes and white marble quarries cut in steps
function alpsH(x, y) {
  const r = 1 - Math.abs(2 * vnoise(x, y, 70, 3) - 1);
  return r * 0.65 + vnoise(x, y, 22, 8) * 0.35;
}
function alpsPixel(X, Y, h1, dith) {
  const edge = Math.min(X - (1110 + 50 * Math.sin(Y / 300)), (1690 - 70 * Math.cos(Y / 240)) - X, Y - 4720, 6720 - Y);
  if (edge + dith * 30 < 24) return pick(C.woods, vnoise(X, Y, 10, 3) + dith * 0.5); // wooded lower slopes
  const h = alpsH(X, Y);
  if (h > 0.5 && vnoise(X, Y, 60, 5) > 0.8) return Y % 4 === 0 ? P('#c9ccce') : h1 < 0.1 ? P('#dfe2e3') : P('#eef0f0');
  const slope = h - alpsH(X - 2, Y - 3);
  const v = h + dith * 0.06;
  const base = v > 0.86 ? [236, 238, 238] : v > 0.64 ? [178, 184, 189] : v > 0.44 ? [143, 149, 155] : [104, 120, 100];
  return shade(base, 1 + Math.max(-0.22, Math.min(0.22, slope * 7)));
}
