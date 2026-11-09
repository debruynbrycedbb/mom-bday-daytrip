// Builds the pixel map of the day (drawn entirely in code) and the route the
// family follows. All coordinates are map pixels; the map is scaled up on screen.
import { mulberry32, hash2, vnoise, bayer, hex, shade, disc, densify } from './pixel.js?v=1';

export const W = 480;
export const H = 1340;
const TOP = 56; // countryside band drawn above y = 0

// The winding route. m: 'd' = this leg is driven, otherwise walked.
// stop: stop number (0 = start). sign: where the signpost stands, relative to the stop.
const ROUTE = [
  { x: 240, y: 40, stop: 0 },
  { x: 240, y: 60 },
  { x: 234, y: 96 },
  { x: 206, y: 122 },
  { x: 180, y: 150 },
  { x: 170, y: 184, stop: 1, sign: [24, -2] },
  { x: 184, y: 222 },
  { x: 222, y: 248 },
  { x: 262, y: 270 },
  { x: 290, y: 316, stop: 2, sign: [24, -4] },
  { x: 292, y: 352 },
  { x: 270, y: 392 },
  { x: 246, y: 424 },
  { x: 240, y: 452 },
  { x: 240, y: 478, board: true },
  { x: 274, y: 508, m: 'd' },
  { x: 334, y: 540, m: 'd' },
  { x: 370, y: 590, m: 'd' },
  { x: 358, y: 644, m: 'd' },
  { x: 300, y: 682, m: 'd', stop: 3, sign: [4, 30] },
  { x: 228, y: 714, m: 'd' },
  { x: 170, y: 758, m: 'd' },
  { x: 140, y: 820, m: 'd' },
  { x: 156, y: 880, m: 'd' },
  { x: 212, y: 920, m: 'd' },
  { x: 290, y: 954, m: 'd' },
  { x: 344, y: 1000, m: 'd' },
  { x: 352, y: 1052, m: 'd' },
  { x: 340, y: 1084, m: 'd', park: true },
  { x: 314, y: 1110 },
  { x: 288, y: 1132 },
  { x: 262, y: 1136, stop: 4, sign: [-26, -4] },
  { x: 232, y: 1168 },
  { x: 206, y: 1208 },
  { x: 190, y: 1248 },
  { x: 186, y: 1282, stop: 5, sign: [-28, -2] },
];

const RIVER = [
  { x: 496, y: 462 }, { x: 448, y: 516 }, { x: 430, y: 580 }, { x: 424, y: 650 },
  { x: 396, y: 716 }, { x: 340, y: 770 }, { x: 290, y: 826 }, { x: 262, y: 890 },
  { x: 248, y: 950 }, { x: 222, y: 1010 }, { x: 170, y: 1066 }, { x: 128, y: 1130 },
  { x: 104, y: 1210 }, { x: 84, y: 1290 }, { x: 70, y: 1360 },
];

// Lucca's walls: a rounded rectangle with bastions
const WALL = { cx: 244, cy: 255, hx: 148, hy: 197, r: 34 };
const BASTIONS = [[96, 160], [96, 350], [392, 160], [392, 350], [160, 58], [330, 58], [160, 452], [330, 452]];
const PIAZZA = { x: 290, y: 316 };
const TOWER = { x: 150, y: 300 }; // Torre Guinigi (base of the facade)
const SPA = { x: 214, y: 1084, w: 76, h: 36 };
const POOL = { x: 170, y: 1092, w: 36, h: 24 };
const HILL = { x: 186, y: 1288, r: 46 };
const BRIDGE = { x: 412, y: 616, w: 32 }; // Ponte della Maddalena

export const LABELS = [
  { text: 'Lucca', x: 150, y: 34 },
  { text: 'Torre Guinigi', x: 150, y: 252 },
  { text: "Piazza dell'Anfiteatro", x: 296, y: 266 },
  { text: 'Serchio valley', x: 404, y: 506 },
  { text: 'Ponte della Maddalena', x: 428, y: 592 },
  { text: 'Bagni di Lucca', x: 400, y: 1030 },
];

export const POOL_RECT = POOL;
export const HILL_SPOT = HILL;

const sdRR = (x, y) => {
  const qx = Math.abs(x - WALL.cx) - WALL.hx + WALL.r;
  const qy = Math.abs(y - WALL.cy) - WALL.hy + WALL.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - WALL.r;
};
const sdWall = (x, y) => {
  let d = sdRR(x, y);
  for (const [bx, by] of BASTIONS) {
    const dd = (Math.abs(x - bx) + Math.abs(y - by) - 20) / 1.4142;
    if (dd < d) d = dd;
  }
  return d;
};
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;

// Map "kinds"
const K = {
  GRASS: 0, STREET: 1, BUILD: 2, PLAZA: 3, BRICK: 4, RAMPART: 5, LAWN: 6, ROAD: 7, ROADEDGE: 8,
  RIVER: 9, RIVEREDGE: 10, BANK: 11, PATH: 12, GARDEN: 13, BRIDGE: 14, BRIDGEEDGE: 15,
  GRAVEL: 16, RAMPPATH: 17, HILL: 18,
};

const P = (h) => hex(h);
const GRASS = ['#4b7836', '#588739', '#669540', '#74a347'].map(P);
const WOODS = ['#2d5230', '#365e33', '#416a37'].map(P);
const ROOFS = ['#c4552f', '#b64a2a', '#cf6a3a', '#a9452b', '#bd5f37'].map(P);
const FACADES = ['#e9c48a', '#f0d9a8', '#e2a65a', '#f2c9a0', '#dcb67e'].map(P);

function maskFrom(draw) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#000'; g.fillStyle = '#000';
  draw(g);
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

function strokePts(g, pts, width, keep = () => true) {
  g.lineWidth = width;
  g.beginPath();
  let pen = false;
  for (const p of pts) {
    if (!keep(p)) { pen = false; continue; }
    if (!pen) { g.moveTo(p.x, p.y); pen = true; } else g.lineTo(p.x, p.y);
  }
  g.stroke();
}

export function buildWorld() {
  // ---- Route ---------------------------------------------------------
  const r = densify(ROUTE, 1);
  const pts = r.pts;
  for (const p of pts) p.mode = ROUTE[p.seg + 1].m === 'd' ? 'drive' : 'walk';
  const stops = [];
  ROUTE.forEach((c, i) => {
    if (c.stop !== undefined) {
      const sign = c.sign || [0, 0];
      stops[c.stop] = { d: r.ctrlD[i], x: c.x, y: c.y, sx: c.x + sign[0], sy: c.y + sign[1] };
    }
  });
  const boardD = r.ctrlD[ROUTE.findIndex((c) => c.board)];
  const parkD = r.ctrlD[ROUTE.findIndex((c) => c.park)];
  const boardPt = ROUTE.find((c) => c.board);
  const parkPt = ROUTE.find((c) => c.park);
  const river = densify(RIVER, 2).pts;

  const isWalk = (p) => p.mode === 'walk' || (p.d > boardD - 3 && p.d < boardD + 1);
  const isDrive = (p) => p.mode === 'drive';

  // ---- Masks ---------------------------------------------------------
  const walk = maskFrom((g) => strokePts(g, pts, 7, isWalk));
  const road = maskFrom((g) => strokePts(g, pts, 9, isDrive));
  const roadEdge = maskFrom((g) => strokePts(g, pts, 12, isDrive));
  const water = maskFrom((g) => strokePts(g, river, 10));
  const waterEdge = maskFrom((g) => strokePts(g, river, 13));
  const bank = maskFrom((g) => strokePts(g, river, 18));
  const blocked = maskFrom((g) => {
    strokePts(g, pts, 30);
    strokePts(g, river, 28);
    g.fillRect(SPA.x - 8, SPA.y - 8, SPA.w + 16, SPA.h + 18);
    g.fillRect(POOL.x - 6, POOL.y - 6, POOL.w + 12, POOL.h + 12);
    g.beginPath(); g.arc(HILL.x, HILL.y, HILL.r + 6, 0, Math.PI * 2); g.fill();
    g.fillRect(BRIDGE.x - 10, BRIDGE.y - 16, BRIDGE.w + 20, 26);
  });

  // ---- Kind pass -----------------------------------------------------
  const kind = new Uint8Array(W * H);
  const block = new Float32Array(W * H); // building colour seed
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dr = sdRR(x, y);
      const dw = sdWall(x, y);
      let k;
      if (dr < -9) {
        // Inside the walls: the old town
        const e1 = ell(x, y, PIAZZA.x, PIAZZA.y, 30, 22);
        const e2 = ell(x, y, PIAZZA.x, PIAZZA.y, 46, 36);
        const e3 = ell(x, y, PIAZZA.x, PIAZZA.y, 52, 42);
        if (walk[i]) k = K.STREET;
        else if (e1 < 1) k = K.PLAZA;
        else if (e2 < 1) {
          k = K.BUILD;
          block[i] = hash2(Math.floor(((Math.atan2(y - PIAZZA.y, x - PIAZZA.x) + Math.PI) / (Math.PI * 2)) * 13), 99);
        } else if (e3 < 1) k = K.STREET;
        else if (x > TOWER.x - 14 && x < TOWER.x + 14 && y > TOWER.y - 30 && y < TOWER.y + 6) k = K.GARDEN;
        else {
          // Irregular medieval blocks: rows of streets, with the cross streets
          // shifted per row so the grid never lines up
          const gy = y - 50;
          const row = Math.floor(gy / 22);
          const gx = x - 90 + Math.floor(hash2(row, 7) * 26);
          const col = Math.floor(gx / 26);
          const ly = gy - row * 22, lx = gx - col * 26;
          const vs = lx < 4 && hash2(col + 11, row) > 0.3;
          const hs = ly < 4 && hash2(Math.floor((x - 80) / 13), row + 37) > 0.12;
          if (vs || hs) k = K.STREET;
          else if (hash2(col * 3 + 1, row * 7 + 2) < 0.07) k = K.GARDEN;
          else {
            k = K.BUILD;
            // split each block into houses of different widths
            const hx = lx < 4 + 6 + Math.floor(hash2(col, row + 5) * 6) ? 0 : lx < 17 + Math.floor(hash2(col + 3, row) * 5) ? 1 : 2;
            block[i] = hash2(col * 5 + hx, row * 3 + 1);
          }
        }
      } else if (dw < 0) {
        // The walls (a tree-lined park on top)
        if (walk[i]) k = K.STREET;
        else if (dw > -2.5) k = K.BRICK;
        else if (Math.abs(dr + 5.5) < 1.2) k = K.RAMPPATH;
        else k = K.RAMPART;
      } else {
        const dBoard = Math.hypot((x - boardPt.x - 4) / 3, y - boardPt.y - 1);
        const dPark = Math.hypot((x - parkPt.x - 6) / 3, y - parkPt.y + 9);
        if (road[i]) k = bank[i] ? K.BRIDGE : K.ROAD;
        else if (roadEdge[i]) k = bank[i] ? K.BRIDGEEDGE : K.ROADEDGE;
        else if (dBoard < 11 || dPark < 11) k = K.GRAVEL;
        else if (walk[i]) k = K.PATH;
        else if (water[i]) k = K.RIVER;
        else if (waterEdge[i]) k = K.RIVEREDGE;
        else if (bank[i]) k = K.BANK;
        else if (dw < 4 && y > WALL.cy) k = K.BRICK;
        else if (dw < 16) k = K.LAWN;
        else if (Math.hypot(x - HILL.x, y - HILL.y) < HILL.r) k = K.HILL;
        else k = K.GRASS;
      }
      kind[i] = k;
    }
  }

  // ---- Colour pass ---------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const D = img.data;
  const riverPx = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = kind[i];
      const h1 = hash2(x, y);
      const dith = bayer(x, y) - 0.5;
      let c;
      switch (k) {
        case K.GRASS: {
          const big = vnoise(x, y, 90, 9);
          if (big + dith * 0.08 > 0.62) {
            const n = vnoise(x, y, 9, 3);
            c = WOODS[Math.max(0, Math.min(2, Math.floor(n * 3 + dith)))];
          } else {
            const n = vnoise(x, y, 28) * 0.7 + vnoise(x, y, 7, 5) * 0.3;
            c = GRASS[Math.max(0, Math.min(3, Math.floor(n * 4 + dith * 0.9)))];
          }
          break;
        }
        case K.HILL: {
          const dd = Math.hypot(x - HILL.x, y - HILL.y) / HILL.r;
          c = P(dd + dith * 0.25 > 0.8 ? '#79a84b' : '#87b656');
          if (h1 < 0.035) c = P(['#f29bb7', '#f6d55c', '#fff7e8'][Math.floor(hash2(y, x) * 3)]);
          break;
        }
        case K.LAWN: c = P(h1 < 0.5 + dith * 0.4 ? '#7aaa50' : '#84b358'); break;
        case K.RAMPART: c = P(h1 < 0.5 ? '#5d9343' : '#68a04a'); break;
        case K.RAMPPATH: c = P(h1 < 0.15 ? '#c9b38a' : '#d9c59d'); break;
        case K.GARDEN: c = P(h1 < 0.45 ? '#5f9442' : '#6ca24a'); break;
        case K.BRICK: {
          const mortar = y % 3 === 0 || (x + (Math.floor(y / 3) % 2) * 3) % 6 === 0;
          c = P(mortar ? '#6c3925' : h1 < 0.3 ? '#9a5838' : '#8d4e32');
          break;
        }
        case K.STREET:
          c = P((x * 3 + y * 5) % 7 === 0 || h1 < 0.08 ? '#b39b75' : h1 > 0.9 ? '#dac7a0' : '#cbb48d');
          break;
        case K.PATH: c = P(h1 < 0.16 ? '#c2a374' : h1 > 0.93 ? '#e4cc9e' : '#d6b98a'); break;
        case K.GRAVEL: c = P(h1 < 0.25 ? '#a8987e' : '#c0b096'); break;
        case K.ROAD: c = P(h1 < 0.12 ? '#7c766f' : h1 > 0.9 ? '#5f5a55' : '#6d6862'); break;
        case K.ROADEDGE: c = P('#46413d'); break;
        case K.BRIDGE: c = P(x % 5 === 0 ? '#a8936f' : '#c4af8c'); break;
        case K.BRIDGEEDGE: c = P('#7a664d'); break;
        case K.RIVER: c = P(vnoise(x, y, 6, 2) + dith * 0.3 > 0.55 ? '#4683b4' : '#3b74a5'); riverPx.push(i); break;
        case K.RIVEREDGE: c = P('#62a1cc'); break;
        case K.BANK: c = P(h1 < 0.2 ? '#bba372' : '#cdb684'); break;
        case K.PLAZA: {
          const e = ell(x, y, PIAZZA.x, PIAZZA.y, 30, 22);
          c = P(e > 0.78 && y < PIAZZA.y ? '#4d5a64' : h1 < 0.2 ? '#687884' : '#5e6e79');
          break;
        }
        case K.BUILD: {
          let below = 0;
          while (below < 5 && kind[i + W * (below + 1)] === K.BUILD) below++;
          const above = kind[i - W] === K.BUILD;
          const left = kind[i - 1] === K.BUILD, right = kind[i + 1] === K.BUILD;
          const seed = block[i];
          const si = Math.floor(seed * 97);
          if (below < 4) {
            c = FACADES[Math.floor(seed * FACADES.length)];
            if (below === 0) c = shade(c, 0.78);
            else if (below === 2 && (x + si) % 4 === 1) c = P('#3e6b45');
            else if (below === 1 && (x + si) % 9 === 4) c = P('#5a3a2a');
            if (!left || !right) c = shade(c, 0.9);
          } else {
            c = ROOFS[Math.floor(seed * ROOFS.length)];
            if (!above) c = shade(c, 1.2);
            else if ((y + si) % 3 === 0) c = shade(c, 0.86);
            if (!right) c = shade(c, 0.82);
            else if (!left) c = shade(c, 1.08);
            else if (block[i - 1] !== seed) c = shade(c, 0.72); // wall between two houses
            // ridge line along the middle of deeper roofs
            if (above && below === 5 && kind[i - 2 * W] === K.BUILD && (y + si) % 7 === 3) c = shade(c, 1.12);
          }
          break;
        }
        default: c = GRASS[1];
      }
      const p = i * 4;
      D[p] = c[0]; D[p + 1] = c[1]; D[p + 2] = c[2]; D[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // ---- Sprites on the map -------------------------------------------
  const rand = mulberry32(2024);
  const free = (x, y, w, h) => {
    for (let yy = y; yy <= y + h; yy += 3) {
      for (let xx = x; xx <= x + w; xx += 3) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
        const i = yy * W + xx;
        if (blocked[i] || sdWall(xx, yy) < 18) return false;
        const k = kind[i];
        if (k !== K.GRASS) return false;
      }
    }
    return true;
  };
  const occupy = (x, y, w, h) => {
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) blocked[yy * W + xx] = 1;
  };

  // Fields: vineyards, wheat and lavender
  for (let n = 0, placed = 0; n < 220 && placed < 14; n++) {
    const w = 24 + Math.floor(rand() * 22), h = 16 + Math.floor(rand() * 14);
    const x = Math.floor(rand() * (W - w)), y = 480 + Math.floor(rand() * (H - 520 - h));
    if (!free(x - 3, y - 3, w + 6, h + 6)) continue;
    drawField(g, x, y, w, h, Math.floor(rand() * 3));
    occupy(x - 4, y - 4, w + 8, h + 8);
    placed++;
  }
  // a few fields around Lucca too
  for (let n = 0, placed = 0; n < 120 && placed < 4; n++) {
    const w = 22 + Math.floor(rand() * 16), h = 14 + Math.floor(rand() * 10);
    const x = Math.floor(rand() * (W - w)), y = Math.floor(rand() * 470);
    if (!free(x - 3, y - 3, w + 6, h + 6)) continue;
    drawField(g, x, y, w, h, Math.floor(rand() * 3));
    occupy(x - 4, y - 4, w + 8, h + 8);
    placed++;
  }

  // Houses of Bagni di Lucca
  const houses = [];
  for (let n = 0; n < 260 && houses.length < 16; n++) {
    const w = 12 + Math.floor(rand() * 8), h = 13 + Math.floor(rand() * 4);
    const x = 120 + Math.floor(rand() * 320), y = 960 + Math.floor(rand() * 270);
    if (!free(x - 2, y - 2, w + 4, h + 4)) continue;
    houses.push({ x, y, w, h, seed: rand() });
    occupy(x - 3, y - 3, w + 6, h + 6);
  }

  // Farmhouses dotted along the valley
  for (let n = 0; n < 400 && houses.length < 26; n++) {
    const w = 11 + Math.floor(rand() * 7), h = 12 + Math.floor(rand() * 4);
    const x = 10 + Math.floor(rand() * (W - 30)), y = 490 + Math.floor(rand() * 460);
    if (!free(x - 6, y - 6, w + 12, h + 12)) continue;
    houses.push({ x, y, w, h, seed: rand() });
    occupy(x - 8, y - 8, w + 16, h + 16);
  }

  // Trees
  const trees = [];
  for (let n = 0; n < 9000 && trees.length < 760; n++) {
    const x = 4 + Math.floor(rand() * (W - 8)), y = 6 + Math.floor(rand() * (H - 8));
    if (!free(x - 3, y - 8, 6, 9)) continue;
    const forest = vnoise(x, y, 90, 9) > 0.6;
    const roll = rand();
    const type = forest ? (roll < 0.75 ? 'round' : 'cypress') : roll < 0.35 ? 'cypress' : roll < 0.75 ? 'olive' : 'round';
    trees.push({ x, y, type });
    occupy(x - 3, y - 6, 7, 8);
  }

  // Lucca: tree-lined ramparts
  const wallTrees = rampartPoints(7).filter(([x, y]) => {
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) if (walk[(y + dy) * W + x + dx]) return false;
    return true;
  });

  // Draw everything that stands up, sorted by y so nearer things overlap
  const things = [
    ...trees.map((t) => ({ y: t.y, draw: () => drawTree(g, t.x, t.y, t.type) })),
    ...houses.map((h) => ({ y: h.y + h.h, draw: () => drawHouse(g, h) })),
    ...wallTrees.map(([x, y]) => ({ y, draw: () => { disc(g, x, y - 1, 3, '#3a6831'); disc(g, x - 1, y - 2, 1.4, '#5c8b40'); } })),
    { y: 66, draw: () => drawGate(g, 240, 52) },
    { y: 454, draw: () => drawGate(g, 240, 440) },
    { y: TOWER.y, draw: () => drawTower(g, TOWER.x, TOWER.y) },
    { y: SPA.y + SPA.h, draw: () => drawSpa(g) },
    { y: POOL.y + POOL.h, draw: () => drawPool(g) },
    { y: BRIDGE.y + 4, draw: () => drawBridge(g) },
    { y: 1280, draw: () => drawPicnic(g) },
  ];
  drawUmbrellas(g);
  things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());

  // Extra countryside above the map so the camera can centre the start
  const full = document.createElement('canvas');
  full.width = W; full.height = H + TOP;
  const fg = full.getContext('2d');
  const band = fg.createImageData(W, TOP);
  for (let y = -TOP; y < 0; y++)
    for (let x = 0; x < W; x++) {
      const dith = bayer(x, y) - 0.5;
      let c;
      if (vnoise(x, y, 90, 9) + dith * 0.08 > 0.62) {
        c = WOODS[Math.max(0, Math.min(2, Math.floor(vnoise(x, y, 9, 3) * 3 + dith)))];
      } else {
        const n = vnoise(x, y, 28) * 0.7 + vnoise(x, y, 7, 5) * 0.3;
        c = GRASS[Math.max(0, Math.min(3, Math.floor(n * 4 + dith * 0.9)))];
      }
      const p = ((y + TOP) * W + x) * 4;
      band.data[p] = c[0]; band.data[p + 1] = c[1]; band.data[p + 2] = c[2]; band.data[p + 3] = 255;
    }
  fg.putImageData(band, 0, 0);
  fg.drawImage(canvas, 0, TOP);
  fg.translate(0, TOP);
  const topTrees = [];
  for (let n = 0; n < 300 && topTrees.length < 26; n++) {
    const x = 6 + Math.floor(rand() * (W - 12)), y = -TOP + 10 + Math.floor(rand() * (TOP - 4));
    if (Math.abs(x - 240) < 30) continue;
    topTrees.push({ x, y, type: rand() < 0.4 ? 'cypress' : rand() < 0.5 ? 'olive' : 'round' });
  }
  topTrees.sort((a, b) => a.y - b.y).forEach((tr) => drawTree(fg, tr.x, tr.y, tr.type));

  // ---- Route helpers -------------------------------------------------
  const L = r.length;
  const tangent = (d) => {
    const c = Math.max(3, Math.min(pts.length - 4, Math.round(d)));
    const a = pts[c - 3];
    const b = pts[c + 3];
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
    canvas: full, top: TOP, pts, length: L, stops, boardD, parkD, at, tangent, modeAt, riverPx,
    boardPt, parkPt,
  };
}

// ---- Map sprite painters ----------------------------------------------

function rampartPoints(step) {
  const inset = 5.5;
  const { cx, cy, hx, hy, r } = WALL;
  const R = r - inset;
  const out = [];
  const x0 = cx - hx + r, x1 = cx + hx - r, y0 = cy - hy + r, y1 = cy + hy - r;
  for (let x = x0; x <= x1; x += step) { out.push([Math.round(x), Math.round(cy - hy + inset)]); out.push([Math.round(x), Math.round(cy + hy - inset)]); }
  for (let y = y0 + step; y < y1; y += step) { out.push([Math.round(cx - hx + inset), Math.round(y)]); out.push([Math.round(cx + hx - inset), Math.round(y)]); }
  const corners = [[x1, y0, -Math.PI / 2, 0], [x1, y1, 0, Math.PI / 2], [x0, y1, Math.PI / 2, Math.PI], [x0, y0, Math.PI, Math.PI * 1.5]];
  for (const [ccx, ccy, a0, a1] of corners) {
    const n = Math.max(2, Math.round(((a1 - a0) * R) / step));
    for (let k = 1; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      out.push([Math.round(ccx + Math.cos(a) * R), Math.round(ccy + Math.sin(a) * R)]);
    }
  }
  return out;
}

function drawTree(g, x, y, type) {
  if (type === 'cypress') {
    const widths = [1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2];
    g.fillStyle = 'rgba(30,50,25,0.35)';
    g.fillRect(x - 1, y, 4, 1);
    widths.forEach((w, j) => {
      const yy = y - widths.length + j;
      const left = x - Math.floor((w - 1) / 2);
      g.fillStyle = '#1f4029';
      g.fillRect(left, yy, w, 1);
      if (w > 1) { g.fillStyle = '#33603a'; g.fillRect(left, yy, 1, 1); }
    });
  } else if (type === 'olive') {
    g.fillStyle = 'rgba(30,50,25,0.3)';
    g.fillRect(x - 3, y, 7, 1);
    g.fillStyle = '#6b4a2f';
    g.fillRect(x, y - 2, 1, 3);
    disc(g, x, y - 5, 3.4, '#7b8c52');
    disc(g, x - 1, y - 6, 1.6, '#a2b06d');
    g.fillStyle = '#62723f';
    g.fillRect(x + 1, y - 3, 2, 1);
  } else {
    g.fillStyle = 'rgba(30,50,25,0.32)';
    g.fillRect(x - 4, y, 9, 2);
    g.fillStyle = '#5a3e27';
    g.fillRect(x, y - 2, 1, 3);
    disc(g, x, y - 6, 4.6, '#356230');
    disc(g, x - 1, y - 7, 2.6, '#4c7c39');
    disc(g, x - 2, y - 8, 1.1, '#6a9a45');
  }
}

function drawField(g, x, y, w, h, type) {
  g.fillStyle = '#3c6630';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  if (type === 0) {
    // vineyard rows
    g.fillStyle = '#9b7148'; g.fillRect(x, y, w, h);
    for (let yy = y + 1; yy < y + h; yy += 3) {
      g.fillStyle = '#4c7a35'; g.fillRect(x + 1, yy, w - 2, 1);
      g.fillStyle = '#6c9b46';
      for (let xx = x + 1 + (yy % 2); xx < x + w - 1; xx += 3) g.fillRect(xx, yy, 1, 1);
    }
  } else if (type === 1) {
    // wheat, in furrows
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const furrow = (xx - x) % 4 === 0;
        g.fillStyle = furrow ? '#b8933f' : hash2(xx, yy) < 0.2 ? '#e8c871' : bayer(xx, yy) < 0.3 ? '#cfac52' : '#dbba5f';
        g.fillRect(xx, yy, 1, 1);
      }
  } else {
    // lavender rows
    g.fillStyle = '#7a8a4a'; g.fillRect(x, y, w, h);
    for (let yy = y + 1; yy < y + h - 1; yy += 3) {
      g.fillStyle = '#6f5f9c'; g.fillRect(x + 1, yy, w - 2, 2);
      g.fillStyle = '#9886c4';
      for (let xx = x + 1; xx < x + w - 1; xx += 2) g.fillRect(xx, yy, 1, 1);
    }
  }
}

function drawHouse(g, { x, y, w, h, seed }) {
  const roof = ROOFS[Math.floor(seed * ROOFS.length)];
  const fac = FACADES[Math.floor(((seed * 7) % 1) * FACADES.length)];
  const rh = h - 6;
  g.fillStyle = 'rgba(30,50,25,0.35)';
  g.fillRect(x + 1, y + h, w, 2);
  for (let j = 0; j < rh; j++) {
    let c = roof;
    if (j === 0) c = shade(roof, 1.2);
    else if (j % 3 === 0) c = shade(roof, 0.86);
    g.fillStyle = `rgb(${c})`;
    g.fillRect(x, y + j, w, 1);
    g.fillStyle = `rgb(${shade(c, 0.82)})`;
    g.fillRect(x + w - 1, y + j, 1, 1);
  }
  g.fillStyle = `rgb(${fac})`;
  g.fillRect(x, y + rh, w, 6);
  g.fillStyle = `rgb(${shade(fac, 0.78)})`;
  g.fillRect(x, y + h - 1, w, 1);
  g.fillStyle = '#3e6b45';
  for (let xx = x + 2; xx < x + w - 2; xx += 4) g.fillRect(xx, y + rh + 2, 2, 2);
  g.fillStyle = '#5a3a2a';
  g.fillRect(x + Math.floor(w / 2), y + rh + 3, 2, 3);
}

function drawGate(g, cx, top) {
  const x = cx - 11;
  g.fillStyle = '#b64a2a'; g.fillRect(x, top, 22, 6);
  g.fillStyle = '#d26b40'; g.fillRect(x, top, 22, 1);
  g.fillStyle = '#c9b18a'; g.fillRect(x, top + 6, 22, 9);
  g.fillStyle = '#a8916c'; g.fillRect(x, top + 14, 22, 1);
  g.fillStyle = '#3b2a20'; g.fillRect(cx - 4, top + 9, 8, 6); g.fillRect(cx - 3, top + 8, 6, 1);
  g.fillStyle = '#2a1a14'; g.fillRect(x, top - 1, 22, 1); g.fillRect(x - 1, top, 1, 15); g.fillRect(x + 22, top, 1, 15);
}

function drawTower(g, cx, base) {
  const x = cx - 6;
  g.fillStyle = 'rgba(30,40,20,0.35)'; g.fillRect(x + 2, base, 14, 3);
  // brick shaft
  for (let y = base - 24; y < base; y++) {
    g.fillStyle = y % 3 === 0 ? '#7a4129' : '#9b5536';
    g.fillRect(x, y, 12, 1);
  }
  g.fillStyle = '#6b3824'; g.fillRect(x + 11, base - 24, 1, 24);
  g.fillStyle = '#2f2420';
  g.fillRect(x + 3, base - 18, 2, 3); g.fillRect(x + 7, base - 18, 2, 3);
  g.fillRect(x + 3, base - 10, 2, 3); g.fillRect(x + 7, base - 10, 2, 3);
  // the famous oak trees on top
  g.fillStyle = '#7a4129'; g.fillRect(x, base - 27, 12, 3);
  disc(g, cx, base - 31, 6.5, '#2f5a2c');
  disc(g, cx - 2, base - 33, 3.4, '#477838');
  disc(g, cx - 3, base - 35, 1.3, '#6a9a45');
}

function drawUmbrellas(g) {
  const spots = [[-18, -10], [-6, -14], [8, -13], [-22, 4], [20, 6], [-12, 12], [12, 14], [22, -6]];
  for (const [dx, dy] of spots) {
    const x = PIAZZA.x + dx, y = PIAZZA.y + dy;
    g.fillStyle = '#7a4e33';
    g.fillRect(x - 4, y + 2, 1, 1); g.fillRect(x + 4, y + 2, 1, 1);
    disc(g, x + 1, y + 2, 3.2, 'rgba(40,50,60,0.45)');
    disc(g, x, y, 3.4, '#f4efe4');
    g.fillStyle = '#d8cfbf';
    g.fillRect(x - 3, y + 1, 7, 2);
    g.fillStyle = '#b9ad98'; g.fillRect(x, y, 1, 1);
  }
}

function drawSpa(g) {
  const { x, y, w, h } = SPA;
  const roofH = 17;
  const fy = y + roofH; // top of the facade
  g.fillStyle = 'rgba(30,50,25,0.35)'; g.fillRect(x + 2, y + h + 1, w, 3);
  // terracotta roof
  for (let j = 0; j < roofH; j++) {
    const base = ROOFS[3];
    const c = j === 0 ? shade(base, 1.25) : j % 3 === 0 ? shade(base, 0.85) : base;
    g.fillStyle = `rgb(${c})`;
    g.fillRect(x, y + j, w, 1);
  }
  g.fillStyle = `rgb(${shade(ROOFS[3], 0.7)})`; g.fillRect(x + w - 1, y, 1, roofH);
  // marble facade
  g.fillStyle = '#f4efe6'; g.fillRect(x, fy, w, h - roofH);
  g.fillStyle = '#d9d1c3';
  for (let k = 0; k < 10; k++) g.fillRect(x + ((k * 29) % (w - 4)) + 1, fy + 2 + ((k * 5) % (h - roofH - 4)), 3, 1); // veins
  // cornice
  g.fillStyle = '#e2dace'; g.fillRect(x - 1, fy, w + 2, 2);
  g.fillStyle = '#b9b0a2'; g.fillRect(x - 1, fy + 2, w + 2, 1);
  // pediment over the entrance
  const px = x + w / 2 + 6;
  for (let j = 0; j < 7; j++) {
    g.fillStyle = j === 0 ? '#b9b0a2' : '#fbf8f2';
    g.fillRect(Math.round(px - 2 - j * 2), fy - 7 + j, 4 + j * 4, 1);
  }
  g.fillStyle = '#b9b0a2'; g.fillRect(px - 16, fy, 32, 1);
  // columns
  for (const cx of [-14, -8, 7, 13]) {
    g.fillStyle = '#ffffff'; g.fillRect(px + cx, fy + 3, 2, h - roofH - 4);
    g.fillStyle = '#cfc6b7'; g.fillRect(px + cx + 2, fy + 3, 1, h - roofH - 4);
  }
  // arched windows along the wings
  g.fillStyle = '#5f8792';
  for (const wx of [x + 4, x + 12, x + 20, x + w - 7]) { g.fillRect(wx, fy + 6, 3, 6); g.fillRect(wx + 1, fy + 5, 1, 1); }
  // door
  g.fillStyle = '#5a4636'; g.fillRect(px - 4, y + h - 10, 8, 10); g.fillRect(px - 3, y + h - 11, 6, 1);
  g.fillStyle = '#7a614b'; g.fillRect(px - 3, y + h - 9, 2, 8);
  // steps
  g.fillStyle = '#e6dfd3'; g.fillRect(px - 7, y + h, 14, 1);
  g.fillStyle = '#cfc6b7'; g.fillRect(px - 8, y + h + 1, 16, 1);
  g.fillStyle = '#b9b0a2'; g.fillRect(x, y + h - 1, w, 1);
  // outline
  g.fillStyle = '#2a1a14';
  g.fillRect(x - 1, y, 1, h); g.fillRect(x + w, y, 1, h); g.fillRect(x, y - 1, w, 1);
}

function drawPool(g) {
  const { x, y, w, h } = POOL;
  g.fillStyle = '#efe7d8'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = '#c9c0b0'; g.fillRect(x - 2, y + h + 1, w + 4, 1);
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      g.fillStyle = yy === y ? '#2f8085' : (xx + yy * 2) % 9 === 0 ? '#73c7c9' : '#46a7ad';
      g.fillRect(xx, yy, 1, 1);
    }
}

function drawBridge(g) {
  const { x, y, w } = BRIDGE;
  for (let i = 0; i <= w; i++) {
    const hump = Math.round(Math.sin((Math.PI * i) / w) * 9);
    const top = y - hump;
    g.fillStyle = '#6b5a45'; g.fillRect(x + i, top - 1, 1, 1);
    g.fillStyle = '#c3ad8a'; g.fillRect(x + i, top, 1, 2);
    g.fillStyle = '#9c8667'; g.fillRect(x + i, top + 2, 1, 1);
  }
  // arch shadow
  for (let i = 4; i <= w - 4; i++) {
    const hump = Math.round(Math.sin((Math.PI * i) / w) * 9);
    g.fillStyle = 'rgba(20,30,50,0.35)';
    g.fillRect(x + i, y - hump + 3, 1, Math.max(1, hump - 3));
  }
}

function drawPicnic(g) {
  const x = 206, y = 1266;
  for (let j = 0; j < 14; j++)
    for (let i = 0; i < 22; i++) {
      g.fillStyle = (Math.floor(i / 3) + Math.floor(j / 3)) % 2 ? '#fff3df' : '#c8423a';
      g.fillRect(x + i, y + j, 1, 1);
    }
  // cake
  g.fillStyle = '#7a4e33'; g.fillRect(x + 7, y + 4, 9, 1);
  g.fillStyle = '#f6d6e1'; g.fillRect(x + 8, y - 1, 7, 2);
  g.fillStyle = '#e88aa8'; g.fillRect(x + 8, y + 1, 7, 3);
  g.fillStyle = '#fff3df'; g.fillRect(x + 9, y - 3, 1, 2); g.fillRect(x + 11, y - 3, 1, 2); g.fillRect(x + 13, y - 3, 1, 2);
  // balloons
  const balloons = [[30, -16, '#d8423a'], [35, -21, '#f2c14b'], [40, -15, '#4f9bd9']];
  for (const [bx, by, c] of balloons) {
    g.fillStyle = '#2a1a14'; g.fillRect(x + bx, y + by + 3, 1, 12 - (by + 16));
    disc(g, x + bx, y + by, 2.6, c);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + bx - 1, y + by - 1, 1, 1);
  }
}
