// Small pixel-art helpers shared by the map, the scenes and the title screen.

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise, 0..1. s = feature size in pixels.
export function vnoise(x, y, s, seed = 0) {
  const gx = x / s, gy = y / s;
  const X = Math.floor(gx), Y = Math.floor(gy);
  const fx = gx - X, fy = gy - Y;
  const a = hash2(X + seed, Y), b = hash2(X + 1 + seed, Y);
  const c = hash2(X + seed, Y + 1), d = hash2(X + 1 + seed, Y + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// 4x4 ordered dither threshold, 0..1
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(rgb, f) {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
}

export const css = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

// Filled pixel circle (crisp, no anti-aliasing)
export function disc(ctx, cx, cy, r, color, block = 1) {
  ctx.fillStyle = color;
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) + 0.35);
    if (w < 0) continue;
    ctx.fillRect((cx - w * block) | 0, (cy + y * block) | 0, (w * 2 + 1) * block, block);
  }
}

// Draw a sprite written as strings. Space or '.' = transparent.
export function drawArt(ctx, rows, pal, x, y, flip = false) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + (flip ? w - 1 - i : i), y + j, 1, 1);
    }
  }
}

export const artWidth = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 0);

// Pixel line (Bresenham)
export function pline(ctx, x0, y0, x1, y1, color) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 400; n++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Catmull-Rom curve through the points, resampled every `step` pixels.
// Returns { pts: [{x,y,seg,d}], length, ctrlD: distance at each control point }
export function densify(points, step = 1) {
  const dense = [];
  const ctrlIdx = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i];
    const p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    ctrlIdx[i] = dense.length;
    const segs = 40;
    for (let k = 0; k < segs; k++) {
      const t = k / segs, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), seg: i });
    }
  }
  ctrlIdx[n - 1] = dense.length;
  dense.push({ x: points[n - 1].x, y: points[n - 1].y, seg: n - 2 });

  // cumulative length of the dense polyline
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
  }
  const length = cum[cum.length - 1];
  const ctrlD = ctrlIdx.map((i) => cum[i]);

  const pts = [];
  let j = 1;
  for (let d = 0; d <= length; d += step) {
    while (j < dense.length - 1 && cum[j] < d) j++;
    const a = dense[j - 1], b = dense[j];
    const L = cum[j] - cum[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j - 1]) / L));
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, seg: b.seg, d });
  }
  return { pts, length, ctrlD };
}
