// Title screen backdrop: a Tuscan morning with Lucca's towers on the horizon.
import { bayer, disc, mulberry32, hash2 } from './pixel.js?v=10';

export function createTitle(canvas) {
  const ctx = canvas.getContext('2d');
  let bg = null, w = 0, h = 0, clouds = [];

  function build(vw, vh, scale) {
    w = Math.ceil(vw / scale); h = Math.ceil(vh / scale);
    if (!w || !h) return;
    canvas.width = w; canvas.height = h;
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
    ctx.imageSmoothingEnabled = false;
    bg = document.createElement('canvas');
    bg.width = w; bg.height = h;
    const g = bg.getContext('2d');
    const horizon = Math.round(h * 0.76);

    // dawn sky, dithered between bands
    const bands = ['#5fa9e0', '#7cc0ea', '#a6d4ee', '#d6e6e6', '#ffe2b8', '#ffd09a'];
    for (let y = 0; y < horizon; y++) {
      const p = (y / horizon) * (bands.length - 1);
      const i = Math.floor(p), f = p - i;
      for (let x = 0; x < w; x++) {
        g.fillStyle = f > bayer(x, y) ? bands[Math.min(bands.length - 1, i + 1)] : bands[i];
        g.fillRect(x, y, 1, 1);
      }
    }
    // sun
    disc(g, Math.round(w * 0.8), horizon - 30, 16, '#ffe9b0');
    disc(g, Math.round(w * 0.8), horizon - 30, 12, '#fff6d8');

    const ridge = (base, amp, freq, seed, color) => {
      g.fillStyle = color;
      for (let x = 0; x < w; x++) {
        const y = Math.round(base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed) * Math.cos(x * freq * 0.43 + seed)));
        g.fillRect(x, y, 1, h - y);
      }
    };
    ridge(horizon - 4, 26, 0.03, 2, '#a9bfb3');
    ridge(horizon + 4, 16, 0.045, 5, '#86a487');

    // Lucca on the horizon: walls with trees, towers and roofs
    const cx = Math.round(w * 0.42);
    const span = Math.min(170, Math.round(w * 0.7));
    const left = cx - Math.round(span / 2);
    const rand = mulberry32(5);
    for (let x = left; x < left + span; x += 7 + Math.floor(rand() * 4)) {
      const bw = 6 + Math.floor(rand() * 6), bh = 6 + Math.floor(rand() * 8);
      g.fillStyle = ['#e9c48a', '#f0d9a8', '#e2a65a'][Math.floor(rand() * 3)];
      g.fillRect(x, horizon - 4 - bh, bw, bh);
      g.fillStyle = ['#c4552f', '#b64a2a', '#cf6a3a'][Math.floor(rand() * 3)];
      g.fillRect(x - 1, horizon - 6 - bh, bw + 2, 3);
    }
    tower(g, left + Math.round(span * 0.22), horizon - 4, 34, true); // Torre Guinigi with its trees
    tower(g, left + Math.round(span * 0.5), horizon - 4, 30, false);
    tower(g, left + Math.round(span * 0.74), horizon - 4, 26, false);
    // the walls
    g.fillStyle = '#8d4e32'; g.fillRect(left - 10, horizon - 5, span + 20, 6);
    g.fillStyle = '#6c3925'; g.fillRect(left - 10, horizon - 5, span + 20, 1);
    for (let x = left - 8; x < left + span + 10; x += 6) {
      disc(g, x, horizon - 8, 3, '#3a6831');
      disc(g, x - 1, horizon - 9, 1.2, '#5c8b40');
    }

    // meadow and cypresses
    ridge(horizon + 18, 10, 0.02, 9, '#6f9a4a');
    for (let y = horizon + 8; y < h; y++)
      for (let x = 0; x < w; x++) {
        const r = hash2(x, y);
        if (r < 0.022) {
          g.fillStyle = ['#f29bb7', '#f6d55c', '#fff7e8', '#86b556', '#86b556'][Math.floor(hash2(y, x) * 5)];
          g.fillRect(x, y, 1, 1);
        }
      }
    const cyp = [0.06, 0.1, 0.9, 0.95];
    for (const fx of cyp) cypress(g, Math.round(w * fx), horizon + 22 + Math.round(fx * 10), 30);

    clouds = [0, 1, 2, 3].map((k) => ({ x: rand() * w, y: 8 + k * Math.round(horizon / 6), v: 2 + k, size: 10 + k * 3 }));
  }

  function frame(t) {
    if (!bg || !w || !h) return;
    ctx.drawImage(bg, 0, 0);
    for (const c of clouds) {
      const cw = c.size * 3;
      const x = ((c.x + t * c.v) % (w + cw)) - cw;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x), c.y, cw, 4);
      ctx.fillRect(Math.round(x) + 4, c.y - 3, cw - 10, 3);
      ctx.fillRect(Math.round(x) + 9, c.y - 6, Math.round(cw / 3), 3);
      ctx.fillStyle = '#dce8f3';
      ctx.fillRect(Math.round(x) + 2, c.y + 4, cw - 4, 2);
    }
    for (let k = 0; k < 3; k++) {
      const x = ((t * (12 + k * 4) + k * 90) % (w + 40)) - 20;
      const y = 30 + k * 12 + Math.sin(t * 2 + k) * 3;
      const f = Math.floor(t * 6 + k) % 2;
      ctx.fillStyle = '#3a2a26';
      if (f) { ctx.fillRect(Math.round(x), Math.round(y), 2, 1); ctx.fillRect(Math.round(x) + 3, Math.round(y), 2, 1); ctx.fillRect(Math.round(x) + 2, Math.round(y) + 1, 1, 1); }
      else { ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 1); ctx.fillRect(Math.round(x) + 1, Math.round(y), 1, 1); ctx.fillRect(Math.round(x) + 2, Math.round(y) + 1, 1, 1); ctx.fillRect(Math.round(x) + 3, Math.round(y), 1, 1); ctx.fillRect(Math.round(x) + 4, Math.round(y) - 1, 1, 1); }
    }
  }

  return { build, frame };
}

function tower(g, x, base, hgt, trees) {
  for (let y = base - hgt; y < base; y++) {
    g.fillStyle = y % 3 === 0 ? '#7a4129' : '#9b5536';
    g.fillRect(x - 3, y, 7, 1);
  }
  g.fillStyle = '#2f2420';
  g.fillRect(x - 1, base - hgt + 5, 2, 3);
  if (trees) {
    disc(g, x, base - hgt - 4, 5, '#2f5a2c');
    disc(g, x - 1, base - hgt - 6, 2.4, '#477838');
  } else {
    g.fillStyle = '#b64a2a';
    g.fillRect(x - 4, base - hgt - 2, 9, 2);
    g.fillRect(x - 2, base - hgt - 4, 5, 2);
  }
}

function cypress(g, x, base, hgt) {
  for (let j = 0; j < hgt; j++) {
    const k = j / hgt;
    const wd = Math.max(1, Math.round(Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * 4));
    g.fillStyle = '#1f4029';
    g.fillRect(x - wd, base - hgt + j, wd * 2, 1);
    g.fillStyle = '#33603a';
    g.fillRect(x - wd, base - hgt + j, 1, 1);
  }
}
