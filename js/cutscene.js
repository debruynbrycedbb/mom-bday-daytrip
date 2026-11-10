// The drive cutscene: the full-size car picture, cut into layers so the
// countryside can stream past, the car can bump along the road, Mom and Dad
// can bob, and the dogs can scamper about the back seat and look out the sides.
import { bayer, hash2, disc } from './pixel.js?v=3';

export const CUT_LENGTH = 7; // seconds

const W = 480, H = 270;
// where each cut-out layer sits in the picture (from tools/prepare_images.py)
const POS = {
  mom: [64, 76], dad: [295, 74],
  dog1: [191, 99], dog2: [239, 105],
};
const SEAT_EDGE = 151; // the dogs disappear behind the seat below this line

// Each dog's little routine. pose: 'front' (as in the picture) or 'side'
// (head out of the car, looking to that side). dx/dy are offsets in pixels.
// Side poses sit at the car's edges: dog 1 over the left side behind Mom,
// dog 2 over the right side behind Dad. To get there each dog first ducks
// behind Mom or Dad in its front pose, then pops up at the side.
const ROUTINE = {
  dog1: [
    { t: 0, pose: 'front', dx: 0, dy: 0 },
    { t: 1.2, pose: 'front', dx: 0, dy: 0 },
    { t: 1.5, pose: 'front', dx: -62, dy: 6 },  // ducks behind Mom
    { t: 1.6, pose: 'side', dx: 0, dy: 14 },    // ...and pops out of the left side
    { t: 1.9, pose: 'side', dx: 0, dy: 0 },
    { t: 3.2, pose: 'side', dx: 0, dy: -3 },
    { t: 3.4, pose: 'side', dx: 0, dy: 14 },
    { t: 3.5, pose: 'front', dx: -62, dy: 6 },
    { t: 3.9, pose: 'front', dx: 46, dy: 2 },   // scoots across the seat
    { t: 4.9, pose: 'front', dx: 46, dy: -2 },
    { t: 5.4, pose: 'front', dx: 0, dy: 0 },
    { t: 6.0, pose: 'front', dx: 0, dy: -7 },
    { t: 6.3, pose: 'front', dx: 0, dy: 0 },
    { t: 99, pose: 'front', dx: 0, dy: 0 },
  ],
  dog2: [
    { t: 0, pose: 'front', dx: 0, dy: 0 },
    { t: 1.0, pose: 'front', dx: 0, dy: -5 },
    { t: 1.3, pose: 'front', dx: 0, dy: 0 },
    { t: 3.2, pose: 'front', dx: 0, dy: 0 },
    { t: 3.5, pose: 'front', dx: 64, dy: 6 },   // ducks behind Dad
    { t: 3.6, pose: 'side', dx: 0, dy: 14 },    // ...and pops out of the right side
    { t: 3.9, pose: 'side', dx: 0, dy: 0 },
    { t: 5.0, pose: 'side', dx: 0, dy: -3 },
    { t: 5.2, pose: 'side', dx: 0, dy: 14 },
    { t: 5.3, pose: 'front', dx: 64, dy: 6 },
    { t: 5.75, pose: 'front', dx: -48, dy: 0 },
    { t: 6.3, pose: 'front', dx: -48, dy: -2 },
    { t: 6.7, pose: 'front', dx: 0, dy: 0 },
    { t: 99, pose: 'front', dx: 0, dy: 0 },
  ],
};
const YIPS = [1.7, 3.7, 6.0];

function dogAt(list, t) {
  let i = 0;
  while (i < list.length - 2 && list[i + 1].t <= t) i++;
  const a = list[i], b = list[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  // switching pose happens in one jump (hidden behind Mom or Dad)
  if (a.pose !== b.pose) return { pose: u < 1 ? a.pose : b.pose, dx: u < 1 ? a.dx : b.dx, dy: u < 1 ? a.dy : b.dy, moving: false };
  const moving = a.dx !== b.dx;
  return {
    pose: a.pose,
    dx: a.dx + (b.dx - a.dx) * u,
    dy: a.dy + (b.dy - a.dy) * u - (moving ? Math.sin(Math.PI * u) * 7 : 0), // a little hop
    moving: moving && u > 0 && u < 1,
  };
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

export function createCutscene(canvas, assets, { reduced = false, onYip = () => {} } = {}) {
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
  sg.fillStyle = '#6f9a4a';
  sg.fillRect(0, 110, W, H - 110);

  const clouds = [0, 1, 2, 3].map((k) => ({ c: cloud(rand), x: k * 140 + rand() * 60, y: 4 + k * 11, v: 5 + k * 2 }));
  // things racing past, nearest fastest
  const passing = [];
  for (let k = 0; k < 7; k++) passing.push({ x: k * 90 + rand() * 40, kind: rand() < 0.55 ? 'cypress' : 'tree', s: 0.8 + rand() * 0.4 });
  const streaks = [0, 1, 2, 3, 4, 5].map(() => ({ x: rand() * W, y: 10 + rand() * 150, len: 10 + rand() * 18, v: 260 + rand() * 160 }));
  let yip = 0;

  // ridge height helper for the rolling hills
  const ridge = (x, base, amp, freq, seed2) =>
    Math.round(base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed2) * Math.cos(x * freq * 0.41 + seed2 * 1.7)));

  function background(t) {
    g.drawImage(sky, 0, 0);
    for (const c of clouds) {
      const cw = c.c.width * 3;
      const x = ((c.x - t * c.v) % (W + cw) + W + cw) % (W + cw) - cw;
      g.drawImage(c.c, Math.round(x), c.y, cw, c.c.height * 3);
    }
    // far hills (slow), then fields and olive rows (faster)
    const far = t * 12, mid = t * 46;
    for (let x = 0; x < W; x++) {
      const y1 = ridge(x + far, 104, 22, 0.018, 1);
      g.fillStyle = '#8fb3a2'; g.fillRect(x, y1, 1, 112 - y1);
      const y2 = ridge(x + mid, 122, 18, 0.024, 4);
      g.fillStyle = '#c6d77a'; g.fillRect(x, y2, 1, 1);
      // furrows: 6px bands that slope gently as they stream past
      const shift = Math.floor((x + mid) * 0.02) % 2;
      for (let y = y2 + 1, k = shift; y < 200; y += 6, k++) {
        g.fillStyle = k % 2 ? '#a7c25a' : '#93b24c';
        g.fillRect(x, y, 1, 6);
      }
    }
    // olive trees along the mid field
    for (let k = 0; k < 9; k++) {
      const x = ((k * 70 - mid * 1.1) % (W + 80) + W + 80) % (W + 80) - 40;
      const y = ridge(x + mid, 122, 18, 0.024, 4) + 10;
      disc(g, Math.round(x), y, 6, '#7d8f55');
      disc(g, Math.round(x) - 2, y - 2, 3, '#a2b06d');
    }
    // near trees and cypresses flashing past
    for (const p of passing) {
      const span = W + 160;
      const x = ((p.x - t * 190 * p.s) % span + span) % span - 80;
      const base = 172;
      if (p.kind === 'cypress') {
        for (let j = 0; j < 90; j++) {
          const half = Math.max(1, Math.round(11 * Math.sin(Math.min(1, (j / 90) * 1.1) * Math.PI * 0.55)));
          g.fillStyle = '#22472a';
          g.fillRect(Math.round(x) - half, base - 90 + j, half * 2, 1);
          g.fillStyle = '#33613a';
          g.fillRect(Math.round(x) - half, base - 90 + j, 2, 1);
        }
      } else {
        g.fillStyle = '#5a3e27'; g.fillRect(Math.round(x) - 2, base - 26, 5, 26);
        disc(g, Math.round(x), base - 40, 22, '#3c6a32');
        disc(g, Math.round(x) - 6, base - 46, 12, '#5a8a3e');
      }
    }
    for (const s of streaks) {
      const x = ((s.x - t * s.v) % (W + 60) + W + 60) % (W + 60) - 30;
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(Math.round(x), s.y, Math.round(s.len), 1);
    }
  }

  function drawDog(name, t, bump) {
    const st = dogAt(ROUTINE[name], t);
    const idle = reduced ? 0 : Math.floor(t * 4 + (name === 'dog1' ? 0 : 1.5)) % 2;
    if (st.pose === 'front') {
      const img = assets[`cut-${name}`];
      const [x, y] = POS[name];
      g.drawImage(img, Math.round(x + st.dx), Math.round(y + st.dy + bump + (st.moving ? 0 : idle)));
    } else {
      // head out of the side, ears in the wind
      const img = assets[`cut-${name}-side`];
      const faceLeft = name === 'dog1';
      const nativeRight = name === 'dog1'; // dog 1's side view faces right, dog 2's faces left
      const flip = faceLeft === nativeRight;
      // head over the side of the car, body hidden behind Mom or Dad
      const x = name === 'dog1' ? 14 : 466 - img.width;
      const y = 98 + st.dy + bump + idle;
      g.save();
      g.translate(Math.round(x + st.dx) + (flip ? img.width : 0), Math.round(y));
      if (flip) g.scale(-1, 1);
      g.drawImage(img, 0, 0);
      g.restore();
    }
  }

  function frame(t) {
    const tt = reduced ? 0 : t;
    background(tt);
    const bump = reduced ? 0 : (Math.floor(t * 7) % 5 === 0 || Math.floor(t * 11) % 9 === 0 ? 1 : 0);
    g.drawImage(assets['cut-car'], 0, bump);
    // dogs sit between the back seat and everything in front of them
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
    // dappled shadows of roadside trees sweeping over the car
    if (!reduced) {
      const sx = W + 80 - ((t * 190) % 560);
      g.fillStyle = 'rgba(20,30,20,0.18)';
      for (let y = 60; y < H; y += 2)
        for (let x = 0; x < 52; x += 2) if ((x + y) % 4 === 0 && hash2(x, y) < 0.8) g.fillRect(Math.round(sx + x + (y - 60) * 0.35), y, 2, 2);
    }
    while (yip < YIPS.length && t >= YIPS[yip]) { yip++; onYip(); }
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
