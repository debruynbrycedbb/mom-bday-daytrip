// "Living" scenes: each stop's image with pixel effects drawn on top in code.
// Effects are clipped to masks found by colour (sky, water, plaza, hills), so
// they sit inside the artwork rather than floating over it.
import { mulberry32, bayer, disc, drawArt, hash2 } from './pixel.js?v=5';

// ---- helpers -----------------------------------------------------------

function makeMask(s, test) {
  const { w, h } = s;
  const d = s.base.data;
  const arr = new Uint8Array(w * h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  const id = cx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      if (test(d[p], d[p + 1], d[p + 2], x, y)) { arr[i] = 1; id.data[p + 3] = 255; }
    }
  cx.putImageData(id, 0, 0);
  return { arr, canvas: c };
}

function layer(s) {
  if (!s.layer) {
    s.layer = document.createElement('canvas');
    s.layer.width = s.w; s.layer.height = s.h;
    s.lctx = s.layer.getContext('2d');
    s.lctx.imageSmoothingEnabled = false;
  }
  s.lctx.globalCompositeOperation = 'source-over';
  s.lctx.clearRect(0, 0, s.w, s.h);
  return s.lctx;
}

function applyMask(s, mask) {
  const l = s.lctx;
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(mask.canvas, 0, 0);
  l.globalCompositeOperation = 'source-over';
  s.ctx.drawImage(s.layer, 0, 0);
}

// A pixel cloud made of overlapping circles; one cell = one block
function makeCloud(rand, cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const g = c.getContext('2d');
  const blobs = [];
  for (let k = 0; k < 4; k++) blobs.push([cols * (0.2 + 0.6 * rand()), rows * (0.45 + 0.3 * rand()), rows * (0.3 + 0.25 * rand())]);
  blobs.push([cols / 2, rows * 0.55, rows * 0.5]);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!blobs.some(([bx, by, br]) => (x - bx) ** 2 + ((y - by) * 1.3) ** 2 < br * br)) continue;
      g.fillStyle = y > rows * 0.62 ? '#dce8f3' : '#ffffff';
      g.fillRect(x, y, 1, 1);
    }
  return c;
}

const BIRD = [
  ['k   k', ' k k ', '  k  '],
  ['     ', 'kk kk', '  k  '],
];
function bird(ctx, x, y, t, color = '#3a2a26', speed = 6) {
  drawArt(ctx, BIRD[Math.floor(t * speed) % 2], { k: color }, Math.round(x), Math.round(y));
}

function blockDisc(ctx, cx, cy, r, color, B = 2) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y += B)
    for (let x = -r; x <= r; x += B)
      if (x * x + y * y <= r * r) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), B, B);
}

// ---- the scenes ---------------------------------------------------------

const SCENES = {
  // Stop 1: walking down a Lucca street
  street: {
    w: 320, h: 480, img: 'scene-street',
    setup(s) {
      s.sky = makeMask(s, (r, g, b, x, y) => y < 260 && x > 100 && x < 230 && ((b > 150 && b > r + 30) || (r > 205 && g > 215 && b > 225)));
      s.clouds = [0, 1, 2, 3].map((k) => ({ c: makeCloud(s.rand, 12 + k * 3, 6 + (k % 2)), x: s.rand() * 300, y: 10 + k * 50, v: 3 + k * 1.5 }));
      s.petals = [];
      s.spawn = 0;
    },
    draw(s, t, dt) {
      const { ctx } = s;
      ctx.drawImage(s.img, 0, 0);
      const l = layer(s);
      for (const c of s.clouds) {
        const cw = c.c.width * 3;
        const x = ((c.x + t * c.v) % (s.w + cw)) - cw;
        l.drawImage(c.c, Math.round(x), c.y, cw, c.c.height * 3);
      }
      applyMask(s, s.sky);
      // swallows over the rooftops
      for (let k = 0; k < 3; k++) {
        const x = ((t * (22 + k * 6) + k * 120) % 380) - 30;
        const y = 40 + k * 26 + Math.sin(t * 2 + k) * 6;
        bird(ctx, x, y, t + k * 0.3);
      }
      // street lamps glowing softly
      const glow = 0.12 + 0.05 * Math.sin(t * 3);
      for (const [x, y] of [[235, 187], [302, 183]]) {
        blockDisc(ctx, x, y, 12, `rgba(255,214,120,${glow * 0.6})`);
        blockDisc(ctx, x, y, 7, `rgba(255,224,150,${glow})`);
      }
      // petals drifting from the flower pots
      s.spawn -= dt;
      if (s.spawn <= 0) {
        s.spawn = 0.35;
        const [px, py] = s.rand() < 0.5 ? [255, 368] : [306, 404];
        s.petals.push({ x: px + s.rand() * 12, y: py, vx: -6 - s.rand() * 10, vy: -4 + s.rand() * 4, life: 0, c: s.rand() < 0.6 ? '#f39ab8' : '#fff1d6' });
      }
      for (const p of s.petals) {
        p.life += dt;
        p.vy += 6 * dt;
        p.x += (p.vx + Math.sin(p.life * 4) * 6) * dt;
        p.y += p.vy * dt;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, Math.floor(p.life * 5) % 2 ? 1 : 2);
      }
      s.petals = s.petals.filter((p) => p.life < 4 && p.y < s.h);
    },
  },

  // Stop 2: Piazza dell'Anfiteatro from above
  square: {
    w: 320, h: 400, img: 'scene-square',
    setup(s) {
      s.plaza = makeMask(s, (r, g, b, x, y) => ((x - 165) / 92) ** 2 + ((y - 208) / 66) ** 2 < 1 && r + g + b < 390 && r < 160);
      const cols = ['#c8423a', '#f2c14b', '#3e6b9e', '#fff3df', '#2e8f7a', '#e88aa8'];
      s.people = [];
      for (let n = 0; n < 200 && s.people.length < 14; n++) {
        const x = 80 + s.rand() * 170, y = 150 + s.rand() * 120;
        if (!s.plaza.arr[Math.round(y) * s.w + Math.round(x)]) continue;
        const a = s.rand() * Math.PI * 2;
        s.people.push({ x, y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 3.5, c: cols[n % cols.length], wait: 0 });
      }
    },
    draw(s, t, dt) {
      const { ctx, w } = s;
      ctx.drawImage(s.img, 0, 0);
      // little people strolling across the square
      for (const p of s.people) {
        if (p.wait > 0) p.wait -= dt;
        else {
          const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
          if (s.plaza.arr[Math.round(ny + 2) * w + Math.round(nx)]) { p.x = nx; p.y = ny; }
          else {
            const a = s.rand() * Math.PI * 2;
            p.vx = Math.cos(a) * 5; p.vy = Math.sin(a) * 3.5;
            if (s.rand() < 0.3) p.wait = 1 + s.rand() * 2;
          }
        }
        const x = Math.round(p.x), y = Math.round(p.y);
        const bob = p.wait > 0 ? 0 : Math.floor(t * 6 + x) % 2;
        ctx.fillStyle = 'rgba(20,25,35,0.4)'; ctx.fillRect(x, y + 3, 3, 1);
        ctx.fillStyle = p.c; ctx.fillRect(x, y - bob, 2, 3);
        ctx.fillStyle = '#e9b48a'; ctx.fillRect(x, y - 1 - bob, 2, 1);
      }
      // a cloud's shadow drifting over the rooftops
      const cx = ((t * 9) % (s.w + 220)) - 110;
      const cy = 90 + ((t * 5) % (s.h + 160)) - 80;
      ctx.fillStyle = 'rgba(25,15,45,0.16)';
      for (let y = -50; y < 50; y += 2)
        for (let x = -80; x < 80; x += 2) {
          if ((x / 80) ** 2 + (y / 50) ** 2 > 1) continue;
          if (((x + y) / 2) % 2 === 0) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 2, 2);
        }
      // pigeons circling
      for (let k = 0; k < 6; k++) {
        const a = t * 0.5 + k * 0.22;
        const x = 160 + Math.cos(a) * 120 + Math.sin(k * 3) * 6;
        const y = 190 + Math.sin(a) * 70 + Math.cos(k * 5) * 5;
        bird(ctx, x, y, t * 1.5 + k * 0.2, '#f4f0e8', 8);
      }
    },
  },

  // Stop 4: the marble baths
  baths: {
    w: 480, h: 360, img: 'scene-baths', readback: true,
    setup(s) {
      s.water = makeMask(s, (r, g, b, x, y) => y > 112 && y < 340 && x > 60 && b > r + 10 && g > r + 2 && r + g + b < 520);
      const idx = [];
      for (let i = 0; i < s.water.arr.length; i++) if (s.water.arr[i]) idx.push(i);
      s.waterIdx = Int32Array.from(idx);
      s.out = s.ctx.createImageData(s.w, s.h);
      s.rowOff = new Int8Array(s.h);
      s.colOff = new Int8Array(s.w);
      s.steam = [];
      s.sparks = [];
      s.ripples = [];
      s.nextRipple = 0;
    },
    draw(s, t, dt) {
      const { ctx, w, h } = s;
      // water wobble: shift water pixels sideways by a moving wave
      for (let y = 0; y < h; y++) s.rowOff[y] = Math.round(Math.sin(y * 0.42 + t * 2.4) * 1.3);
      for (let x = 0; x < w; x++) s.colOff[x] = Math.round(Math.sin(x * 0.07 - t * 1.3) * 0.7);
      const src = s.base.data, dst = s.out.data;
      dst.set(src);
      const wa = s.water.arr;
      for (let n = 0; n < s.waterIdx.length; n++) {
        const i = s.waterIdx[n];
        const y = (i / w) | 0, x = i - y * w;
        const sx = x + s.rowOff[y] + s.colOff[x];
        const j = y * w + sx;
        if (sx >= 0 && sx < w && wa[j]) {
          const p = i * 4, q = j * 4;
          dst[p] = src[q]; dst[p + 1] = src[q + 1]; dst[p + 2] = src[q + 2];
        }
      }
      ctx.putImageData(s.out, 0, 0);

      // ripples spreading out from Mom and Dad
      s.nextRipple -= dt;
      if (s.nextRipple <= 0) { s.ripples.push({ age: 0 }); s.nextRipple = 1.5; }
      for (const r of s.ripples) {
        r.age += dt;
        const rx = 34 + r.age * 26, ry = rx * 0.3;
        const a = Math.max(0, 0.55 - r.age * 0.2);
        ctx.fillStyle = `rgba(225,250,255,${a})`;
        const steps = Math.round(rx * 1.6);
        for (let k = 0; k < steps; k++) {
          const ang = (k / steps) * Math.PI * 2;
          const x = Math.round(292 + Math.cos(ang) * rx), y = Math.round(206 + Math.sin(ang) * ry);
          if (y < 206 - ry * 0.2) continue; // only the front of the ring
          if (wa[y * w + x]) ctx.fillRect(x, y, 2, 1);
        }
      }
      s.ripples = s.ripples.filter((r) => r.age < 2.8);

      // sparkles on the water
      if (s.rand() < 0.5) {
        const i = s.waterIdx[Math.floor(s.rand() * s.waterIdx.length)];
        s.sparks.push({ x: i % w, y: (i / w) | 0, age: 0 });
      }
      for (const p of s.sparks) {
        p.age += dt;
        ctx.fillStyle = p.age < 0.2 ? '#fff9e0' : '#ffe39a';
        ctx.fillRect(p.x, p.y, p.age < 0.15 ? 2 : 1, 1);
      }
      s.sparks = s.sparks.filter((p) => p.age < 0.4);

      // steam rising off the warm water
      if (s.rand() < 0.25) {
        const i = s.waterIdx[Math.floor(s.rand() * s.waterIdx.length)];
        const y = (i / w) | 0;
        if (y < 280) s.steam.push({ x: i % w, y, age: 0, life: 2 + s.rand() * 1.5 });
      }
      for (const p of s.steam) {
        p.age += dt;
        p.y -= 10 * dt;
        const k = p.age / p.life;
        const a = 0.22 * Math.sin(k * Math.PI);
        const size = 2 + Math.floor(k * 3) * 2;
        ctx.fillStyle = `rgba(255,250,240,${a})`;
        blockDisc(ctx, p.x + Math.sin(p.age * 2 + p.x) * 3, p.y, size, ctx.fillStyle, 2);
      }
      s.steam = s.steam.filter((p) => p.age < p.life);

      // candle glow flicker
      for (const [x, y] of [[142, 120], [463, 173]]) {
        const f = 0.7 + 0.3 * Math.sin(t * 13 + x) * Math.sin(t * 7.3 + y);
        blockDisc(ctx, x, y, Math.round(20 * f), 'rgba(255,190,90,0.10)');
        blockDisc(ctx, x, y, Math.round(11 * f), 'rgba(255,200,110,0.16)');
        ctx.fillStyle = '#fff1b8';
        ctx.fillRect(x - 1, y - 2 - Math.round(f), 2, 2);
      }
    },
  },

  // Stop 5: birthday celebration, drawn entirely in code
  birthday: {
    w: 256, h: 192,
    setup(s) {
      s.bg = buildSunset(s.w, s.h);
      s.fw = [];
      s.nextFw = 0.2;
      s.confetti = [];
      const cols = ['#f2c14b', '#e88aa8', '#7cc6e8', '#fff3df', '#c8423a', '#9be27a'];
      for (let k = 0; k < 46; k++) s.confetti.push({ x: s.rand() * s.w, y: s.rand() * s.h, v: 14 + s.rand() * 18, c: cols[k % cols.length], ph: s.rand() * 6 });
    },
    draw(s, t, dt) {
      const { ctx, w, h, assets } = s;
      ctx.drawImage(s.bg, 0, 0);
      // twinkling stars
      for (let k = 0; k < 18; k++) {
        if ((Math.floor(t * 2 + k * 0.7) + k) % 3 === 0) continue;
        ctx.fillStyle = '#fff6da';
        ctx.fillRect((k * 53) % w, 4 + ((k * 29) % 40), 1, 1);
      }
      // fireworks
      s.nextFw -= dt;
      if (s.nextFw <= 0) {
        s.nextFw = 0.8 + s.rand() * 0.6;
        const cols = ['#ffd34d', '#ff7a8a', '#8fe3ff', '#ffffff', '#b4ff8a', '#ffb070'];
        s.fw.push({ x: 30 + s.rand() * (w - 60), y: h - 70, ty: 30 + s.rand() * 40, c: cols[Math.floor(s.rand() * cols.length)], parts: null });
      }
      for (const f of s.fw) {
        if (!f.parts) {
          f.y -= 150 * dt;
          ctx.fillStyle = '#fff3df';
          ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 3);
          if (f.y <= f.ty) {
            f.parts = [];
            for (let k = 0; k < 26; k++) {
              const a = (k / 26) * Math.PI * 2, sp = 34 + (k % 3) * 12;
              f.parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0 });
            }
          }
        } else {
          for (const p of f.parts) {
            p.age += dt;
            p.vy += 26 * dt;
            p.vx *= 0.985; p.vy *= 0.985;
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.age > 0.9 && Math.floor(t * 20) % 2) continue;
            ctx.fillStyle = p.age < 0.15 ? '#ffffff' : f.c;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
          }
          f.done = f.parts[0].age > 1.5;
        }
      }
      s.fw = s.fw.filter((f) => !f.done);

      // bunting
      for (let k = 0; k < 14; k++) {
        const x = k * 20 - 6;
        const sag = 16 + Math.sin((x / w) * Math.PI) * 12 + Math.sin(t * 2 + k * 0.5);
        const c = ['#c4552f', '#f2b43c', '#fff3df', '#2e8f7a'][k % 4];
        ctx.fillStyle = '#2a1a14';
        ctx.fillRect(x - 2, Math.round(sag) - 1, 22, 1);
        for (let j = 0; j < 9; j++) {
          const wd = Math.max(1, 9 - j);
          ctx.fillStyle = c;
          ctx.fillRect(x + 9 - Math.floor(wd / 2), Math.round(sag) + j, wd, 1);
        }
      }

      // the family on the hill, at twice the map-sprite size
      const ground = h - 14;
      const crew = [
        ['dog1-map', 34, 0.3], ['mom-map', 84, 0], ['dad-map', 134, 0.5], ['dog2-map', 190, 0.8],
      ];
      for (const [name, x, ph] of crew) {
        const im = assets[name];
        const hop = Math.floor(t * 2.5 + ph * 4) % 2;
        ctx.fillStyle = 'rgba(30,20,30,0.35)';
        ctx.fillRect(x - im.width + 4, ground, im.width * 2 - 8, 3);
        ctx.drawImage(im, Math.round(x - im.width), ground - im.height * 2 + 2 - hop * 2, im.width * 2, im.height * 2);
      }
      drawCake(ctx, 232, ground, t);

      // confetti
      for (const c of s.confetti) {
        c.y += c.v * dt;
        c.x += Math.sin(t * 2 + c.ph) * 10 * dt;
        if (c.y > h) { c.y = -4; c.x = s.rand() * w; }
        ctx.fillStyle = c.c;
        const flip = Math.floor(t * 6 + c.ph) % 2;
        ctx.fillRect(Math.round(c.x), Math.round(c.y), flip ? 2 : 1, flip ? 1 : 2);
      }
    },
  },
};

function buildSunset(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bands = ['#2d2550', '#4b2e63', '#7a3a6b', '#b5506a', '#e2735e', '#f4a35d', '#ffd38a'];
  const horizon = Math.round(h * 0.62);
  for (let y = 0; y < horizon; y++) {
    const p = (y / horizon) * (bands.length - 1);
    const i = Math.floor(p), f = p - i;
    for (let x = 0; x < w; x++) {
      g.fillStyle = f > bayer(x, y) ? bands[Math.min(bands.length - 1, i + 1)] : bands[i];
      g.fillRect(x, y, 1, 1);
    }
  }
  disc(g, Math.round(w * 0.74), horizon - 4, 18, '#ffe7a3');
  disc(g, Math.round(w * 0.74), horizon - 4, 13, '#fff3c9');
  const ridge = (base, amp, freq, seed, color) => {
    g.fillStyle = color;
    for (let x = 0; x < w; x++) {
      const y = Math.round(base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed) * Math.cos(x * freq * 0.37 + seed * 2)));
      g.fillRect(x, y, 1, h - y);
    }
  };
  ridge(horizon, 20, 0.04, 1, '#6a4f7d');
  ridge(horizon + 18, 16, 0.055, 4, '#3c5546');
  // cypresses on the ridge
  g.fillStyle = '#22362b';
  for (const fx of [0.08, 0.11, 0.24, 0.6, 0.63, 0.9, 0.93]) {
    const x = Math.round(w * fx);
    const y = horizon + 10 + ((x * 7) % 6);
    for (let j = 0; j < 16; j++) {
      const wd = j < 3 ? 1 : j < 6 ? 2 : 3;
      g.fillRect(x - Math.floor(wd / 2), y - 16 + j, wd, 1);
    }
  }
  ridge(h - 30, 8, 0.03, 7, '#5f8a45');
  for (let y = h - 40; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (hash2(x, y) < 0.03) {
        g.fillStyle = ['#f29bb7', '#f6d55c', '#fff7e8'][Math.floor(hash2(y, x) * 3)];
        g.fillRect(x, y, 1, 1);
      }
    }
  return c;
}

function drawCake(ctx, cx, ground, t) {
  const x = cx - 12, top = ground - 22;
  ctx.fillStyle = 'rgba(30,20,30,0.35)'; ctx.fillRect(x - 2, ground, 28, 3);
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 2, ground - 2, 28, 2);
  ctx.fillStyle = '#fff3df'; ctx.fillRect(x - 1, ground - 3, 26, 1);
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(x, top, 24, ground - 3 - top);
  ctx.fillStyle = '#c47a4a'; ctx.fillRect(x + 1, top + 1, 22, ground - 5 - top);
  ctx.fillStyle = '#fff3df'; ctx.fillRect(x + 1, top + 9, 22, 2);
  ctx.fillStyle = '#f2a7bf'; ctx.fillRect(x + 1, top + 1, 22, 5);
  for (let i = 0; i < 22; i += 4) ctx.fillRect(x + 1 + i, top + 6, 2, 1 + (i % 8 ? 1 : 2));
  ctx.fillStyle = '#e04a5f';
  ctx.fillRect(x + 5, top + 2, 2, 2); ctx.fillRect(x + 11, top + 2, 2, 2); ctx.fillRect(x + 17, top + 2, 2, 2);
  for (let k = 0; k < 3; k++) {
    const cxk = x + 5 + k * 6;
    ctx.fillStyle = ['#7cc6e8', '#fff3df', '#f2c14b'][k];
    ctx.fillRect(cxk, top - 6, 2, 6);
    const fl = Math.floor(t * 9 + k) % 2;
    ctx.fillStyle = '#ffb03a'; ctx.fillRect(cxk, top - 9 - fl, 2, 3);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(cxk, top - 8 - fl, 1, 1);
  }
}

export function createScene(id, canvas, assets, reduced) {
  const def = SCENES[id];
  canvas.width = def.w;
  canvas.height = def.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: !!def.readback });
  ctx.imageSmoothingEnabled = false;
  const s = { ctx, w: def.w, h: def.h, img: def.img ? assets[def.img] : null, assets, rand: mulberry32(11) };
  if (s.img) {
    ctx.drawImage(s.img, 0, 0);
    s.base = ctx.getImageData(0, 0, s.w, s.h);
  }
  def.setup?.(s);
  // Reduced motion: draw one settled frame and stop
  def.draw(s, reduced ? 3 : 0, reduced ? 0 : 0.016);
  return {
    frame(t, dt) { if (!reduced) def.draw(s, t, dt); },
  };
}
