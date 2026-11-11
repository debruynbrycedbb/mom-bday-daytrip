// The drive cutscene: the full-size car picture, cut into layers so the
// countryside can stream past, the car can bump along the road, Mom and Dad
// can bob, and the dogs can bounce about the back seat, turn to look out of
// each side and bark at the view. The dogs always stay inside the car.
import { bayer, hash2, disc, drawArt } from './pixel.js?v=9';

export const CUT_LENGTH = 7; // seconds

const W = 480, H = 270;
// where each cut-out layer sits in the picture (from tools/prepare_images.py)
const POS = {
  mom: [64, 76], dad: [295, 74],
  dog1: [191, 103], dog2: [239, 105],
};
const SEAT_EDGE = 151; // the dogs disappear behind the back seat below this line

// The head-and-chest part of each dog's side view (the head is turned, as if
// looking out). Dog 1's side view looks right in the art, dog 2's looks left.
const HEAD = {
  dog1: { sx: 56, sy: 14, w: 52, h: 50, looksRight: true },
  dog2: { sx: 14, sy: 16, w: 50, h: 50, looksRight: false },
};

// Each dog's routine. pose: 'front' (as in the picture), 'left' or 'right'
// (head turned to look out of that side, stretching up). dx/dy are pixel
// offsets from the dog's place in the picture; the back seat runs from about
// dx -50 to +50, so the dogs never leave the car.
const ROUTINE = {
  dog1: [
    { t: 0, pose: 'front', dx: 0, dy: 0 },
    { t: 1.2, pose: 'front', dx: 0, dy: 0 },
    { t: 1.3, pose: 'left', dx: -6, dy: -6 },
    { t: 2.9, pose: 'left', dx: -8, dy: -9 },
    { t: 3.05, pose: 'front', dx: 0, dy: 0 },
    { t: 3.55, pose: 'front', dx: 46, dy: 0 },  // hops across the seat
    { t: 4.4, pose: 'front', dx: 46, dy: 0 },
    { t: 4.5, pose: 'right', dx: 48, dy: -6 },
    { t: 5.6, pose: 'right', dx: 50, dy: -9 },
    { t: 5.75, pose: 'front', dx: 46, dy: 0 },
    { t: 6.25, pose: 'front', dx: 0, dy: 0 },
    { t: 99, pose: 'front', dx: 0, dy: 0 },
  ],
  dog2: [
    { t: 0, pose: 'front', dx: 0, dy: 0 },
    { t: 1.6, pose: 'front', dx: 0, dy: -4 },
    { t: 1.9, pose: 'front', dx: 0, dy: 0 },
    { t: 2.2, pose: 'front', dx: 0, dy: 0 },
    { t: 2.3, pose: 'right', dx: 6, dy: -6 },
    { t: 3.0, pose: 'right', dx: 8, dy: -9 },
    { t: 3.1, pose: 'front', dx: 0, dy: 0 },
    { t: 3.6, pose: 'front', dx: -46, dy: 0 }, // and swaps sides too
    { t: 4.55, pose: 'front', dx: -46, dy: 0 },
    { t: 4.65, pose: 'left', dx: -48, dy: -6 },
    { t: 5.65, pose: 'left', dx: -50, dy: -9 },
    { t: 5.8, pose: 'front', dx: -46, dy: 0 },
    { t: 6.3, pose: 'front', dx: 0, dy: 0 },
    { t: 99, pose: 'front', dx: 0, dy: 0 },
  ],
};
// Barks out of the window: [time, dog]
const BARKS = [[1.45, 'dog1'], [1.95, 'dog1'], [2.4, 'dog2'], [2.75, 'dog2'], [4.6, 'dog1'], [4.75, 'dog2'], [5.2, 'dog1'], [5.35, 'dog2']];
const BUBBLE_TIME = 0.4;

function dogAt(list, t) {
  let i = 0;
  while (i < list.length - 2 && list[i + 1].t <= t) i++;
  const a = list[i], b = list[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  // turning the head happens in one quick move
  if (a.pose !== b.pose) return { pose: u < 0.5 ? a.pose : b.pose, dx: u < 0.5 ? a.dx : b.dx, dy: u < 0.5 ? a.dy : b.dy, moving: false };
  const moving = a.dx !== b.dx;
  return {
    pose: a.pose,
    dx: a.dx + (b.dx - a.dx) * u,
    dy: a.dy + (b.dy - a.dy) * u - (moving ? Math.sin(Math.PI * u) * 8 : 0), // a little hop
    moving: moving && u > 0 && u < 1,
  };
}

// A tiny pixel font for the barks
const GLYPHS = {
  W: ['X.X', 'X.X', 'XXX', 'XXX', 'X.X'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
  I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  '!': ['X', 'X', 'X', '.', 'X'],
};
function bubble(g, text, x, y, pointLeft) {
  const glyphs = [...text].map((ch) => GLYPHS[ch]);
  const tw = glyphs.reduce((s, gl) => s + gl[0].length + 1, -1);
  const bw = tw + 6, bh = 11;
  const bx = Math.round(pointLeft ? x - bw : x), by = Math.round(y - bh);
  g.fillStyle = '#2a1a14';
  g.fillRect(bx, by - 1, bw, bh + 2); g.fillRect(bx - 1, by, bw + 2, bh);
  g.fillStyle = '#fffaf0';
  g.fillRect(bx, by, bw, bh);
  // tail towards the dog
  const tx = pointLeft ? bx + bw - 4 : bx + 2;
  g.fillStyle = '#2a1a14'; g.fillRect(tx - 1, by + bh, 4, 3);
  g.fillStyle = '#fffaf0'; g.fillRect(tx, by + bh, 2, 2);
  let cx = bx + 3;
  for (const gl of glyphs) {
    drawArt(g, gl, { X: '#2a1a14' }, cx, by + 3);
    cx += gl[0].length + 1;
  }
}

function cloud(rand) {
  const cols = 14 + Math.floor(rand() * 10), rows = 6;
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const g = c.getContext('2d');
  const blobs = [[cols * 0.3, 3.4, 2.6], [cols * 0.55, 2.6, 3.2], [cols * 0.78, 3.6, 2.4]];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (blobs.some(([bx, by, br]) => (x - bx) ** 2 + ((y - by) * 1.4) ** 2 < br * br)) {
        g.fillStyle = y > 3 ? '#d9e9f5' : '#ffffff';
        g.fillRect(x, y, 1, 1);
      }
  return c;
}

// sea: the drive over the Apuan Alps, with marble peaks and the sea coming into view
export function createCutscene(canvas, assets, { reduced = false, sea = false, onBark = () => {} } = {}) {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // sky, drawn once
  const sky = document.createElement('canvas');
  sky.width = W; sky.height = H;
  const sg = sky.getContext('2d');
  const bands = ['#5fa7e6', '#6db2ea', '#82bfee', '#9dccef', '#bcdcf0'];
  for (let y = 0; y < 110; y++) {
    const p = (y / 110) * (bands.length - 1), i = Math.floor(p), f = p - i;
    for (let x = 0; x < W; x++) {
      sg.fillStyle = f > bayer(x, y) ? bands[Math.min(bands.length - 1, i + 1)] : bands[i];
      sg.fillRect(x, y, 1, 1);
    }
  }
  sg.fillStyle = '#93b24c';
  sg.fillRect(0, 110, W, H - 110);

  const clouds = [0, 1, 2, 3].map((k) => ({ c: cloud(rand), x: k * 140 + rand() * 60, y: 4 + k * 11, v: 5 + k * 2 }));
  // things racing past, nearest fastest
  const passing = [];
  for (let k = 0; k < 7; k++) passing.push({ x: k * 90 + rand() * 40, kind: rand() < 0.55 ? 'cypress' : 'tree', s: 0.8 + rand() * 0.4 });
  const streaks = [0, 1, 2, 3, 4, 5].map(() => ({ x: rand() * W, y: 10 + rand() * 150, len: 10 + rand() * 18, v: 260 + rand() * 160 }));
  let bark = 0;

  // ridge height for the rolling hills (whole pixels, so nothing shimmers)
  const ridge = (x, base, amp, freq, seed2) =>
    Math.round(base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed2) * Math.cos(x * freq * 0.41 + seed2 * 1.7)));
  const wrap = (v, span) => ((v % span) + span) % span;

  function background(t) {
    g.drawImage(sky, 0, 0);
    for (const c of clouds) {
      const cw = c.c.width * 3;
      const x = wrap(c.x - Math.round(t * c.v), W + cw) - cw;
      g.drawImage(c.c, x, c.y, cw, c.c.height * 3);
    }
    // far hills (slow), then furrowed fields following the slope (faster)
    const far = Math.round(t * 12), mid = Math.round(t * 46);
    // over the mountains: the sea rises into view on the horizon
    const seaTop = sea ? 112 - Math.min(16, Math.max(0, Math.round((t - 2) * 5))) : 112;
    for (let x = 0; x < W; x++) {
      const y1 = sea ? ridge(x + far, 100, 40, 0.026, 3) : ridge(x + far, 104, 22, 0.018, 1);
      if (sea) {
        g.fillStyle = '#9aa3ad'; g.fillRect(x, y1, 1, 112 - y1);
        g.fillStyle = '#eef0f0'; g.fillRect(x, y1, 1, Math.max(1, Math.round((104 - y1) * 0.35))); // marble and snow on the peaks
        if (seaTop < 112 && y1 < seaTop) {
          g.fillStyle = '#4f9fd0'; g.fillRect(x, seaTop, 1, 112 - seaTop);
          if ((x * 7 + Math.floor(t * 6)) % 23 === 0) { g.fillStyle = '#e8f6ff'; g.fillRect(x, seaTop + 2 + (x % 5), 2, 1); }
        }
      } else {
        g.fillStyle = '#8fb3a2'; g.fillRect(x, y1, 1, 112 - y1);
        g.fillStyle = '#7fa494'; g.fillRect(x, y1, 1, 1);
      }
      const y2 = ridge(x + mid, 122, 18, 0.024, 4);
      g.fillStyle = '#c6d77a'; g.fillRect(x, y2, 1, 1);
      for (let y = y2 + 1, k = 0; y < 200; y += 6, k++) {
        g.fillStyle = k % 2 ? '#a7c25a' : '#93b24c';
        g.fillRect(x, y, 1, 6);
      }
    }
    // olive trees dotted along the fields
    for (let k = 0; k < 9; k++) {
      const x = wrap(k * 70 - Math.round(mid * 1.1), W + 80) - 40;
      const y = ridge(x + mid, 122, 18, 0.024, 4) + 10;
      disc(g, x, y, 6, '#7d8f55');
      disc(g, x - 2, y - 2, 3, '#a2b06d');
    }
    // near trees and cypresses flashing past
    for (const p of passing) {
      const x = wrap(p.x - Math.round(t * 190 * p.s), W + 160) - 80;
      const base = 172;
      if (p.kind === 'cypress') {
        for (let j = 0; j < 90; j++) {
          const half = Math.max(1, Math.round(11 * Math.sin(Math.min(1, (j / 90) * 1.1) * Math.PI * 0.55)));
          g.fillStyle = '#22472a'; g.fillRect(x - half, base - 90 + j, half * 2, 1);
          g.fillStyle = '#33613a'; g.fillRect(x - half, base - 90 + j, 2, 1);
        }
      } else {
        g.fillStyle = '#5a3e27'; g.fillRect(x - 2, base - 26, 5, 26);
        disc(g, x, base - 40, 22, '#3c6a32');
        disc(g, x - 6, base - 46, 12, '#5a8a3e');
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (const s of streaks) g.fillRect(wrap(s.x - Math.round(t * s.v), W + 60) - 30, s.y, Math.round(s.len), 1);
  }

  // where each dog's head is, for the bark bubbles
  const heads = {};

  function drawDog(name, t, bump) {
    const st = dogAt(ROUTINE[name], t);
    const idle = reduced ? 0 : Math.floor(t * 4 + (name === 'dog1' ? 0 : 1.5)) % 2;
    const [hx, hy] = POS[name];
    if (st.pose === 'front') {
      const img = assets[`cut-${name}`];
      const x = Math.round(hx + st.dx), y = Math.round(hy + st.dy + bump + (st.moving ? 0 : idle));
      g.drawImage(img, x, y);
      heads[name] = { x: x + img.width / 2, y, side: 0 };
    } else {
      // head turned to look out of one side, stretching up over the seat
      const h = HEAD[name];
      const lookRight = st.pose === 'right';
      const flip = lookRight !== h.looksRight;
      const ears = reduced ? 0 : Math.floor(t * 9) % 2; // ears flapping in the wind
      const x = Math.round(hx + st.dx), y = Math.round(hy + st.dy + bump + ears);
      g.save();
      g.translate(x + (flip ? h.w : 0), y);
      if (flip) g.scale(-1, 1);
      g.drawImage(assets[`cut-${name}-side`], h.sx, h.sy, h.w, h.h, 0, 0, h.w, h.h);
      g.restore();
      heads[name] = { x: lookRight ? x + h.w - 4 : x + 4, y, side: lookRight ? 1 : -1 };
    }
  }

  function frame(t) {
    const tt = reduced ? 0 : t;
    background(tt);
    const bump = reduced ? 0 : (Math.floor(t * 7) % 5 === 0 || Math.floor(t * 11) % 9 === 0 ? 1 : 0);
    g.drawImage(assets['cut-car'], 0, bump);
    // the dogs sit between the back seat and everything in front of them
    g.save();
    g.beginPath();
    g.rect(0, 0, W, SEAT_EDGE + bump);
    g.clip();
    drawDog('dog2', tt, bump);
    drawDog('dog1', tt, bump);
    g.restore();
    g.drawImage(assets['cut-front'], 0, bump);
    // Mom and Dad nod along to the road
    const momBob = reduced ? 0 : Math.floor(t * 2.6) % 3 === 0 ? 1 : 0;
    const dadBob = reduced ? 0 : Math.floor(t * 2.2 + 1) % 4 === 0 ? 1 : 0;
    g.drawImage(assets['cut-mom'], POS.mom[0], POS.mom[1] + bump + momBob);
    g.drawImage(assets['cut-dad'], POS.dad[0], POS.dad[1] + bump + dadBob);
    // the shadow of a roadside tree sweeping over the car
    if (!reduced) {
      const sx = W + 120 - ((t * 190) % 900);
      g.fillStyle = 'rgba(20,30,20,0.13)';
      for (let y = 112; y < H; y++) g.fillRect(Math.round(sx + (y - 112) * 0.35), y, 70, 1); // car and ground, not sky
    }
    // barking out of the window, with a bubble by the dog's head
    while (bark < BARKS.length && t >= BARKS[bark][0]) { onBark(BARKS[bark][1]); bark++; }
    for (const [bt, name] of BARKS) {
      if (t < bt || t > bt + BUBBLE_TIME || !heads[name]) continue;
      const hd = heads[name];
      const pointLeft = hd.side < 0 || (hd.side === 0 && name === 'dog1');
      bubble(g, name === 'dog1' ? 'YIP!' : 'WOOF!', hd.x + (pointLeft ? -2 : 2), hd.y - 2, pointLeft);
    }
    // pixel dissolve in and out
    const fade = t < 0.45 ? 1 - t / 0.45 : t > CUT_LENGTH - 0.45 ? (t - (CUT_LENGTH - 0.45)) / 0.45 : 0;
    if (fade > 0) {
      g.fillStyle = '#2a1a14';
      for (let by = 0; by < H; by += 10)
        for (let bx = 0; bx < W; bx += 10) if (hash2(bx, by) < fade) g.fillRect(bx, by, 10, 10);
    }
  }

  frame(0);
  return { frame };
}
