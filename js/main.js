// Mom's birthday day trip: the map, the travelling family, the park chase,
// the HUD and the stop cards.
import { buildWorld, W, H, LABELS, POOL_RECT, HILL_SPOT, FOUNTAIN_SPOT, CHASE } from './world.js?v=7';
import { drawCar, drawSign, drawArrow, drawLizard, makeFamily } from './sprites.js?v=7';
import { STOPS } from './stops.js?v=7';
import { createScene } from './scenes.js?v=7';
import { createTitle } from './title.js?v=7';
import * as sound from './sound.js?v=7';
import { hash2, pline } from './pixel.js?v=7';
import { createCutscene, CUT_LENGTH } from './cutscene.js?v=7';

const $ = (s) => document.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAST = STOPS.length; // 5

const el = {
  map: $('#map'), overlay: $('#overlay'), go: $('#go'), status: $('#status'), pips: $('#pips'),
  sound: $('#sound'), recenter: $('#recenter'),
  card: $('#card'), cardKicker: $('#card-kicker'), cardTitle: $('#card-title'), cardBody: $('#card-body'),
  cardDetails: $('#card-details'), cardClose: $('#card-close'), cardReplay: $('#card-replay'), scene: $('#scene'),
  title: $('#title'), titleBg: $('#title-bg'), start: $('#start'),
  cut: $('#cutscene'), cutCanvas: $('#cut-canvas'), cutSkip: $('#cut-skip'),
};

const assets = {};
let fam = null; // the family's map sprites, drawn in code (see sprites.js)
const IMAGES = [
  'mom-map', 'dad-map', 'dog1-map', 'dog2-map', 'scene-street', 'scene-square', 'scene-baths',
  'cut-car', 'cut-front', 'cut-mom', 'cut-dad', 'cut-dog1', 'cut-dog2', 'cut-dog1-side', 'cut-dog2-side',
  'tree1-l', 'tree2-l', 'tree3-l', 'tree1-m', 'tree2-m', 'tree3-m', 'olive1', 'olive2', 'olive3',
];

// Speeds in map pixels per second (1 m ≈ 9px): a brisk stroll, and a country-road drive
const WALK = 64;
const DRIVE = 320;
const DOG_RUN = 100;
// The drive: 3 s on the road, the 7 s cutscene, then the last 3 s to the baths
const DRIVE_BEFORE_CUT = 3;
const DRIVE_AFTER_CUT = 850; // map pixels: about 3 s at driving speed, easing into the car park

const mctx = el.map.getContext('2d');
const title = createTitle(el.titleBg);
let world = null;
let scale = 2, viewW = 0, viewH = 0;
const cam = { x: 0, y: 0 };
const chipFull = []; // stop chip widths with their names showing
const state = {
  started: false, d: 0, targetD: 0, travelling: false, reached: 0, boost: 1,
  manual: null, cardOpen: 0, stepAcc: 0, steps: 0, mode: 'walk', carLeft: false,
  facing: { dog1: 1, dog2: -1 }, chaseDone: false, event: null,
  driveT: 0, cut: null, cutDone: false,
};
let cutscene = null;
let scene = null;
let t = 0;
let last = performance.now();
let stopBtns = [], labelEls = [];
let bubble = null;
const sparks = [];
let nextBurst = 0;
let lastFocus = null;

// ---------------------------------------------------------------- setup

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve((assets[name] = img));
    img.onerror = () => reject(new Error(`Could not load ${name}`));
    img.src = `assets/img/${name}.png?v=7`;
  });
}

// Whole device pixels per map pixel keeps the pixel art crisp at any zoom
function mapScale() {
  const dpr = window.devicePixelRatio || 1;
  const target = window.innerWidth < 700 || window.innerHeight < 640 ? 1.5 : 2;
  const k = Math.max(1, Math.round(target * dpr));
  return { k, css: k / dpr, dpr };
}

function resize() {
  const { k, css, dpr } = mapScale();
  scale = css;
  viewW = Math.ceil((window.innerWidth * dpr) / k);
  viewH = Math.ceil((window.innerHeight * dpr) / k);
  el.map.width = viewW;
  el.map.height = viewH;
  el.map.style.width = `${viewW * css}px`;
  el.map.style.height = `${viewH * css}px`;
  mctx.imageSmoothingEnabled = false;
  const titleScale = window.innerWidth < 700 || window.innerHeight < 640 ? 2 : 3;
  title.build(window.innerWidth, window.innerHeight, titleScale);
  if (reduced) title.frame(0);
  if (world) snapCamera();
}

function buildOverlay() {
  stopBtns = STOPS.map((s, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stop-chip';
    b.innerHTML = `<span class="num" aria-hidden="true">${k + 1}</span><span class="chip-text">${s.chip}</span>`;
    b.addEventListener('click', () => onStopClick(k + 1));
    el.overlay.append(b);
    return b;
  });
  labelEls = LABELS.map((l) => {
    const s = document.createElement('span');
    s.className = 'place';
    s.textContent = l.text;
    el.overlay.append(s);
    return s;
  });
  bubble = document.createElement('span');
  bubble.className = 'bubble';
  bubble.setAttribute('aria-hidden', 'true');
  bubble.hidden = true;
  el.overlay.append(bubble);
  el.pips.innerHTML = STOPS.map((s, k) => `<li><span class="sr-only">Stop ${k + 1}: ${s.chip}</span></li>`).join('');
}

// ---------------------------------------------------------------- journey

function onStopClick(n) {
  if (state.travelling) return;
  if (n <= state.reached) openCard(n);
  else if (n === state.reached + 1) travelTo(n);
  else {
    sound.locked();
    setStatus(`Visit stop ${state.reached + 1} first: ${STOPS[state.reached].chip}.`);
    const b = stopBtns[n - 1];
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }
}

function travelTo(n) {
  if (state.cardOpen) closeCard(false);
  state.travelling = true;
  state.targetD = world.stops[n].d;
  state.boost = 1;
  state.manual = null;
  el.recenter.hidden = true;
  state.mode = world.modeAt(state.d + 1);
  if (state.mode === 'drive') sound.engineOn(true);
  sound.blip();
  updateHud();
}

function arrive() {
  state.travelling = false;
  state.boost = 1;
  sound.engineOn(false);
  state.reached += 1;
  const n = state.reached;
  sound.arrive();
  if (STOPS[n - 1].scene === 'baths') sound.splash();
  if (n === LAST) sound.birthday();
  updateHud();
  window.setTimeout(() => openCard(n), reduced ? 80 : 550);
}

function replay() {
  closeCard(false);
  Object.assign(state, { d: 0, reached: 0, travelling: false, mode: 'walk', manual: null, chaseDone: false, event: null, driveT: 0, cutDone: false });
  sparks.length = 0;
  updateHud();
  snapCamera();
  el.go.focus();
}

function onGo() {
  if (state.travelling) {
    state.boost = 3;
    updateHud();
    return;
  }
  if (state.reached >= LAST) return replay();
  travelTo(state.reached + 1);
}

function setStatus(text) {
  if (el.status.textContent !== text) el.status.textContent = text;
}

function updateHud() {
  [...el.pips.children].forEach((li, k) => {
    const n = k + 1;
    li.className = n <= state.reached ? 'is-done' : n === state.reached + 1 ? 'is-next' : '';
  });
  stopBtns.forEach((b, k) => {
    const n = k + 1;
    const st = n <= state.reached ? 'done' : n === state.reached + 1 ? 'next' : 'locked';
    b.dataset.state = st;
    const what = st === 'done' ? 'open again' : st === 'next' ? 'go here next' : 'not yet';
    b.setAttribute('aria-label', `Stop ${n}: ${STOPS[k].chip} (${what})`);
  });
  el.go.disabled = false;
  if (state.cut) {
    el.go.textContent = 'On the road…';
    el.go.disabled = true;
    setStatus('On the road to Bagni di Lucca');
  } else if (state.event) {
    el.go.textContent = 'Woof!';
    el.go.disabled = true;
    setStatus('[Dog 2’s name] has spotted a lizard!');
  } else if (state.travelling) {
    el.go.textContent = state.boost > 1 ? 'Hurrying…' : 'Speed up';
    el.go.disabled = state.boost > 1;
    setStatus(state.mode === 'drive' ? 'Driving…' : 'Walking…');
  } else if (state.reached < LAST) {
    el.go.textContent = STOPS[state.reached].go;
    setStatus(state.reached === 0 ? 'Tap the glowing signpost or the button to set off.' : `Next stop: ${STOPS[state.reached].chip}`);
  } else {
    el.go.textContent = 'Replay the day';
    setStatus('That’s the whole day. Happy birthday, Mom!');
  }
}

// ---------------------------------------------------------------- cards

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const withPlaceholders = (s) => escapeHtml(s).replace(/\[([^\]]+)\]/g, '<span class="ph">[$1]</span>');

function openCard(n) {
  const s = STOPS[n - 1];
  el.cardKicker.textContent = s.kicker;
  el.cardTitle.textContent = s.title;
  el.cardBody.innerHTML =
    s.body.map((p) => `<p>${withPlaceholders(p)}</p>`).join('') +
    (s.signoff ? `<p class="signoff">${withPlaceholders(s.signoff)}</p>` : '');
  el.cardDetails.innerHTML = s.details
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${withPlaceholders(v)}</dd></div>`)
    .join('');
  el.cardDetails.hidden = !s.details.length;
  el.scene.setAttribute('aria-label', s.alt);
  el.cardReplay.hidden = n !== LAST;
  el.card.classList.toggle('is-finale', n === LAST);
  el.card.classList.toggle('is-portrait', s.scene === 'street' || s.scene === 'square');
  scene = createScene(s.scene, el.scene, assets, reduced);
  if (!state.cardOpen) lastFocus = document.activeElement;
  state.cardOpen = n;
  el.card.hidden = false;
  document.body.classList.add('card-open');
  el.card.querySelector('.card-inner').scrollTop = 0;
  el.cardClose.focus({ preventScroll: true });
  sound.blip();
}

function closeCard(restoreFocus = true) {
  if (!state.cardOpen) return;
  el.card.hidden = true;
  document.body.classList.remove('card-open');
  scene = null;
  state.cardOpen = 0;
  if (restoreFocus) (lastFocus && document.contains(lastFocus) ? lastFocus : el.go).focus({ preventScroll: true });
}

function trapFocus(e) {
  if (e.key === 'Escape') { closeCard(); return; }
  if (e.key !== 'Tab') return;
  const items = [...el.card.querySelectorAll('button:not([hidden]), [href]')].filter((x) => !x.disabled);
  if (!items.length) return;
  const first = items[0], lastItem = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
  else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
}

// ---------------------------------------------------------------- the party

// Where everyone stands for a given distance along the path
function formation(d) {
  const lo = d >= world.parkD ? world.parkD : -Infinity;
  const hi = d <= world.boardD ? world.boardD : Infinity;
  const clampD = (v) => Math.max(lo, Math.min(hi, v));
  const pos = (dd, off) => {
    const c = clampD(dd);
    const p = world.at(c);
    const tt = world.tangent(c);
    return { x: p.x - tt.y * off, y: p.y + tt.x * off, tx: tt.x };
  };
  return { mom: pos(d - 3, 6), dad: pos(d - 3, -6), dog1: pos(d + 9, 8), dog2: pos(d + 9, -8) };
}

// ---------------------------------------------------------------- the lizard chase
// Timeline (seconds): 0 lizard pops out · 0.6–5.6 the chase · 5.6–6.5 up the
// tree · 6.5–7.9 barking at the tree · then dog 2 trots back and the walk resumes.
const EV = { chase: 0.6, chaseLen: 5, climb: 5.6, tree: 6.5, back: 7.9 };
const WOOFS = [0.8, 1.9, 3.0, 4.1, 5.2, 6.6, 7.3];
const chasePath = (() => {
  const p = CHASE.path;
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum[i] = cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return { p, cum, total: cum[cum.length - 1] };
})();
function alongChase(s) {
  const { p, cum } = chasePath;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const f = Math.max(0, Math.min(1, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
  return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f, dx: p[i].x - p[i - 1].x };
}

function startChase() {
  const f = formation(state.d);
  state.event = {
    t: 0, dog: { x: f.dog2.x, y: f.dog2.y, face: state.facing.dog2 }, liz: { ...CHASE.spawn, face: 1, climbing: false, hidden: false },
    woof: 0, leaves: [],
  };
  sound.blip();
  updateHud();
}

function updateChase(dt) {
  const ev = state.event;
  ev.t += dt;
  const E = ev.t;
  const tree = world.chaseTree;
  const home = formation(state.d).dog2;
  const dog = ev.dog, liz = ev.liz;

  // the lizard
  if (E < EV.chase) {
    Object.assign(liz, CHASE.spawn);
  } else if (E < EV.climb) {
    const u = (E - EV.chase) / EV.chaseLen;
    const N = 7, k = Math.floor(u * N), ph = u * N - k;
    const prog = Math.min(1, (k + Math.min(1, ph / 0.72)) / N); // dash, freeze, dash...
    const p = alongChase(prog * chasePath.total);
    if (Math.abs(p.dx) > 1) liz.face = p.dx < 0 ? -1 : 1;
    liz.x = p.x; liz.y = p.y;
  } else if (E < EV.tree) {
    const u = (E - EV.climb) / (EV.tree - EV.climb);
    liz.climbing = true;
    liz.x = tree.x;
    liz.y = tree.y - 4 - u * 30;
  } else {
    liz.hidden = true;
  }

  // dog 2
  let target;
  if (E < EV.chase) target = null;
  else if (E < EV.climb) target = liz;
  else if (E < EV.back) target = { x: tree.x - 12, y: tree.y + 5 };
  else target = home;
  if (target) {
    const dx = target.x - dog.x, dy = target.y - dog.y, dist = Math.hypot(dx, dy);
    const speed = E >= EV.back ? 60 : DOG_RUN;
    const stopAt = target === liz ? 7 : 1;
    if (dist > stopAt) {
      const step = Math.min(dist - stopAt, speed * dt);
      dog.x += (dx / dist) * step;
      dog.y += (dy / dist) * step;
      if (Math.abs(dx) > 2) dog.face = dx < 0 ? -1 : 1;
      dog.moving = true;
    } else dog.moving = false;
    if (E >= EV.back && dist < 2) {
      state.event = null;
      state.chaseDone = true;
      state.facing.dog2 = dog.face;
      tree.shake = 0;
      updateHud();
      return;
    }
  }

  // barks
  while (ev.woof < WOOFS.length && E >= WOOFS[ev.woof]) { ev.woof++; sound.bark(); }

  // the tree rustles as the lizard disappears into its leaves
  tree.shake = E > EV.tree - 0.1 && E < EV.tree + 0.6 ? Math.round(Math.sin(E * 60)) : 0;
  if (E > EV.tree - 0.1 && E < EV.tree + 0.4 && Math.random() < 0.5) {
    ev.leaves.push({ x: tree.x - 16 + Math.random() * 32, y: tree.y - 36 - Math.random() * 16, vy: 10 + Math.random() * 10, age: 0 });
  }
  for (const l of ev.leaves) { l.age += dt; l.y += l.vy * dt; l.x += Math.sin(l.age * 6) * 12 * dt; }
  ev.leaves = ev.leaves.filter((l) => l.age < 2);
}

function bubbleText() {
  const ev = state.event;
  if (!ev) return null;
  if (ev.t < 0.7) return '!';
  for (const w of WOOFS) if (ev.t >= w && ev.t < w + 0.5) return 'Woof!';
  return null;
}

// ---------------------------------------------------------------- the drive cutscene

function startCut() {
  state.cut = { t: 0 };
  cutscene = createCutscene(el.cutCanvas, assets, { reduced, onBark: (dog) => sound.bark(dog) });
  sound.windOn(true);
  el.cut.hidden = false;
  document.body.classList.add('cut-on');
  updateHud();
  el.cutSkip.focus({ preventScroll: true });
}

function endCut() {
  if (!state.cut) return;
  state.cut = null;
  cutscene = null;
  state.cutDone = true;
  sound.windOn(false);
  // time has passed on the road: pick the drive up near the end
  state.d = Math.max(state.d, world.parkD - DRIVE_AFTER_CUT);
  snapCamera();
  el.cut.hidden = true;
  document.body.classList.remove('cut-on');
  updateHud();
  el.go.focus({ preventScroll: true });
}

function updateCut(dt) {
  state.cut.t += dt;
  cutscene.frame(state.cut.t);
  // meanwhile, paint the map where the drive picks up again
  const p = world.at(world.parkD - DRIVE_AFTER_CUT);
  world.prefetch(p.x, p.y, Math.max(viewW, viewH));
  if (state.cut.t >= CUT_LENGTH) endCut();
}

// ---------------------------------------------------------------- update

function update(dt) {
  if (state.event) updateChase(dt);
  else if (state.travelling) {
    const mode = world.modeAt(state.d + 0.5);
    if (mode !== state.mode) {
      state.mode = mode;
      sound.engineOn(mode === 'drive');
      updateHud();
    }
    const base = mode === 'drive' ? DRIVE : WALK;
    const remain = state.targetD - state.d;
    const ease = Math.max(0.3, Math.min(1, remain / (mode === 'drive' ? 160 : 30)));
    const v = base * ease * state.boost * (reduced ? 3 : 1);
    const before = state.d;
    state.d = Math.min(state.targetD, state.d + v * dt);
    if (!state.chaseDone && before < world.chaseD && state.d >= world.chaseD) {
      state.d = world.chaseD;
      startChase();
    }
    if (mode === 'drive' && !state.cutDone) {
      state.driveT += dt;
      if (state.driveT >= DRIVE_BEFORE_CUT) startCut();
    }
    if (mode === 'walk') {
      state.stepAcc += state.d - before;
      if (state.stepAcc > 8) { state.stepAcc = 0; state.steps++; sound.step(state.steps); }
    }
    if (!state.event && state.d >= state.targetD) arrive();
  }

  // camera: follow the family (and the chase)
  const f = world.at(state.d);
  let fx = f.x, fy = f.y;
  if (state.event) {
    // lean toward the chase; on narrow phones follow the dog almost entirely
    const w = viewW < 420 ? 0.85 : 0.55;
    fx = f.x * (1 - w) + state.event.dog.x * w;
    fy = f.y * (1 - w) + state.event.dog.y * w;
  }
  let tx = fx - viewW / 2;
  let ty = fy - viewH * 0.5;
  if (state.cardOpen && window.innerWidth >= 900) tx += el.card.getBoundingClientRect().width / 2 / scale;
  if (state.manual) { tx = state.manual.x; ty = state.manual.y; }
  [tx, ty] = clampCam(tx, ty);
  if (state.manual) { state.manual.x = tx; state.manual.y = ty; }
  const k = reduced ? 1 : Math.min(1, dt * (state.manual ? 18 : 3.5));
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

function clampCam(x, y) {
  const cx = viewW >= W ? (W - viewW) / 2 : Math.max(0, Math.min(W - viewW, x));
  const cy = viewH >= H ? (H - viewH) / 2 : Math.max(0, Math.min(H - viewH, y));
  return [cx, cy];
}

function snapCamera() {
  const f = world.at(state.d);
  [cam.x, cam.y] = clampCam(f.x - viewW / 2, f.y - viewH * 0.5);
}

// ---------------------------------------------------------------- drawing

function drawMap() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const g = mctx;
  const missing = world.drawGround(g, cx, cy, viewW, viewH);
  g.save();
  g.translate(-cx, -cy);
  const inView = (x, y, m = 24) => x > cx - m && x < cx + viewW + m && y > cy - m && y < cy + viewH + m;

  // river sparkles
  const rv = world.river;
  g.fillStyle = '#d4ebf8';
  for (let k = 0; k < 420; k++) {
    const ph = t * 1.2 + k * 0.37;
    const slot = Math.floor(ph);
    if (!reduced && ph - slot > 0.5) continue;
    const i = 1 + Math.floor(hash2(k, slot) * (rv.length - 2));
    const p = rv[i], q = rv[i + 1];
    const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
    const off = (hash2(slot, k) - 0.5) * 60;
    const x = p.x + (nx / nl) * off, y = p.y + (ny / nl) * off;
    if (inView(x, y, 4)) g.fillRect(Math.round(x), Math.round(y), 4, 1);
  }

  // steam off the spa pool; spray from the park fountain
  if (inView(POOL_RECT.x + 90, POOL_RECT.y + 50, 200)) {
    for (let k = 0; k < 18; k++) {
      const life = (t * 0.35 + k / 18) % 1;
      const x = POOL_RECT.x + 8 + hash2(k, 3) * (POOL_RECT.w - 16) + Math.sin(t * 1.5 + k) * 4;
      const y = POOL_RECT.y + POOL_RECT.h - 6 - life * 34;
      g.fillStyle = `rgba(255,255,255,${0.42 * (1 - life)})`;
      g.fillRect(Math.round(x), Math.round(y), 2 + Math.floor(life * 3), 2 + Math.floor(life * 3));
    }
  }
  if (inView(FOUNTAIN_SPOT.x, FOUNTAIN_SPOT.y, 80)) {
    g.fillStyle = '#cfeaf5';
    for (let k = 0; k < 14; k++) {
      const life = (t * 1.3 + k / 14) % 1;
      const side = k % 2 ? 1 : -1;
      const x = FOUNTAIN_SPOT.x + side * life * (5 + (k % 3) * 2);
      const y = FOUNTAIN_SPOT.y - 20 - Math.sin(life * Math.PI) * 5 + life * 14;
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }

  // the winding path: gold where we've been, marching dashes to the next stop
  const pts = world.pts;
  const nextD = state.reached < LAST ? world.stops[state.reached + 1].d : -1;
  const march = reduced ? 0 : Math.floor(t * 30);
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i];
    if (!inView(p.x, p.y, 4)) continue;
    let col = null, sz = 4;
    if (i <= state.d) { if (i % 18 < 2) col = '#f3c64b'; }
    else if (i <= nextD) { if ((((i - march) % 20) + 20) % 20 < 6) col = '#fff4dc'; }
    else if (i % 22 < 2) { col = 'rgba(255,244,220,0.55)'; sz = 3; }
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, sz, sz);
  }

  // everything that stands up, in depth order
  const things = [];
  for (const s of world.visibleSprites(cx, cy, viewW, viewH)) {
    things.push({ y: s.sortY, draw: () => {
      if (s.img) g.drawImage(s.img, Math.round(s.x - s.w / 2 + (s.shake || 0)), Math.round(s.y - s.h));
      else g.drawImage(s.canvas, s.x, s.y);
    } });
  }
  world.stops.forEach((s, n) => {
    if (n === 0 || !inView(s.sx, s.sy, 80)) return;
    const st = n <= state.reached ? 'done' : n === state.reached + 1 ? 'next' : 'locked';
    things.push({ y: s.sy, draw: () => {
      drawSign(g, s.sx, s.sy, st, t);
      if (st === 'next' && !state.travelling) drawArrow(g, s.sx, s.sy - 24, reduced ? 0 : t);
    } });
  });
  partyThings(things);
  things.sort((a, b) => a.y - b.y).forEach((th) => th.draw());

  // falling leaves from the rustling tree
  if (state.event) {
    g.fillStyle = '#7fb23a';
    for (const l of state.event.leaves) g.fillRect(Math.round(l.x), Math.round(l.y), 2, 2);
  }

  // swallows overhead
  for (let k = 0; k < 4; k++) {
    const x = cx + ((t * (26 + k * 6) + k * 260) % (viewW + 120)) - 60;
    const y = cy + 24 + k * 30 + Math.sin(t * 2 + k) * 4;
    const fl = Math.floor(t * 6 + k) % 2;
    g.fillStyle = '#2a1a14';
    const X = x | 0, Y = y | 0;
    if (fl) { g.fillRect(X, Y, 3, 1); g.fillRect(X + 4, Y, 3, 1); g.fillRect(X + 3, Y + 1, 1, 1); }
    else { g.fillRect(X, Y - 2, 1, 1); g.fillRect(X + 1, Y - 1, 1, 1); g.fillRect(X + 2, Y, 1, 1); g.fillRect(X + 3, Y + 1, 1, 1); g.fillRect(X + 4, Y, 1, 1); g.fillRect(X + 5, Y - 1, 1, 1); g.fillRect(X + 6, Y - 2, 1, 1); }
  }

  if (state.reached === LAST && !reduced) drawFireworks(g, cx, cy);
  g.restore();

  // spare time this frame: paint a tile ahead of the family
  if (!missing) {
    const ahead = world.at(state.d + (state.travelling ? (state.mode === 'drive' ? 900 : 360) : 200));
    world.prefetch(ahead.x, ahead.y) || world.prefetch(cam.x + viewW / 2, cam.y + viewH / 2, 700);
  }
}

function partyThings(things) {
  const g = mctx;
  const d = state.d;
  const mode = world.modeAt(d);
  const carAt = (x, y, left, bump) => () => drawCar(g, x, y, left, bump, fam);

  if (mode === 'drive') {
    const p = world.at(d);
    const tg = world.tangent(d);
    if (tg.x < -0.25) state.carLeft = true; else if (tg.x > 0.25) state.carLeft = false;
    things.push({ y: p.y, draw: () => {
      if (state.travelling && !reduced) {
        for (let k = 0; k < 3; k++) {
          const age = (t * 2.2 + k / 3) % 1;
          const back = 22 + age * 8;
          g.fillStyle = `rgba(235,230,220,${0.55 * (1 - age)})`;
          g.fillRect(Math.round(p.x - tg.x * back), Math.round(p.y - 4 - tg.y * back - age * 3), 2, 2);
        }
      }
      carAt(p.x, p.y, state.carLeft, state.travelling && Math.floor(t * 9) % 3 === 0 ? 1 : 0)();
    } });
    return;
  }

  // the parked car
  if (d <= world.boardD) things.push({ y: world.boardPt.y, draw: () => drawCar(g, world.boardPt.x, world.boardPt.y, false, 0, null) });
  else if (d >= world.parkD) things.push({ y: world.parkPt.y, draw: () => drawCar(g, world.parkPt.x, world.parkPt.y, true, 0, null) });

  const f = formation(d);
  const ev = state.event;
  const { mom, dad, dog1 } = f;
  const dog2 = ev ? ev.dog : f.dog2;
  if (!ev) {
    if (dog1.tx > 0.2) state.facing.dog1 = 1; else if (dog1.tx < -0.2) state.facing.dog1 = -1;
    if (f.dog2.tx > 0.2) state.facing.dog2 = 1; else if (f.dog2.tx < -0.2) state.facing.dog2 = -1;
  } else {
    state.facing.dog1 = dog2.x < dog1.x ? -1 : 1; // dog 1 watches the chase
  }
  const face2 = ev ? ev.dog.face : state.facing.dog2;
  const walking = state.travelling && !ev;
  // walking: step through the frames as the family moves; standing: an
  // occasional hop from the dogs
  const stepOf = (ph, dog) => {
    if (reduced || !walking) return 0;
    return dog ? Math.floor(state.d / 3 + ph * 2) % 2 : [0, 1, 0, 2][Math.floor(state.d / 4 + ph * 2) % 4];
  };
  const hop = (ph) => (!reduced && !walking && Math.floor(t * 2 + ph * 3) % 5 === 0 ? 1 : 0);
  let dog2Frame = stepOf(0.75, true), dog2Bob = hop(0.75);
  if (ev) {
    dog2Frame = ev.dog.moving ? Math.floor(ev.t * 12) % 2 : 0;
    dog2Bob = ev.t < EV.chase ? Math.floor(ev.t * 8) % 2 : ev.dog.moving ? 0 : Math.floor(ev.t * 6) % 2;
  }

  const sprite = (img, p, bob, flip) => () => {
    const x = Math.round(p.x - img.width / 2), y = Math.round(p.y - img.height + 1 - bob);
    g.fillStyle = 'rgba(25,20,15,0.3)';
    g.fillRect(x + 1, Math.round(p.y) + 1, img.width - 2, 1);
    if (flip) { g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); }
    else g.drawImage(img, x, y);
  };

  // leads first, so the sprites sit on top of them
  things.push({ y: -1e9, draw: () => {
    pline(g, mom.x - 3, mom.y - 6, dog1.x + state.facing.dog1, dog1.y - 4, '#c8302c');
    if (ev) pline(g, dad.x + 3, dad.y - 6, dad.x + 4, dad.y - 1, '#2e8f7a'); // dog 2 slipped its lead
    else pline(g, dad.x + 3, dad.y - 6, dog2.x + face2, dog2.y - 4, '#2e8f7a');
  } });
  things.push({ y: mom.y, draw: sprite(fam.mom[stepOf(0)], mom, 0, false) });
  things.push({ y: dad.y, draw: sprite(fam.dad[stepOf(0.5)], dad, 0, false) });
  // the dogs face right in the art
  things.push({ y: dog1.y, draw: sprite(fam.dog1[stepOf(0.25, true)], dog1, hop(0.25), state.facing.dog1 < 0) });
  things.push({ y: dog2.y, draw: sprite(fam.dog2[dog2Frame], dog2, dog2Bob, face2 < 0) });

  // the lizard
  if (ev && !ev.liz.hidden) {
    const liz = ev.liz;
    const tree = world.chaseTree;
    const peek = ev.t < EV.chase ? Math.min(1, ev.t / 0.3) : 1;
    things.push({ y: liz.climbing ? tree.sortY + 1 : liz.y, draw: () => {
      if (peek < 1 && Math.floor(ev.t * 10) % 2) return; // blinking in the flower bed
      drawLizard(g, liz.x, liz.y, liz.climbing || (ev.t > EV.chase && ev.t < EV.climb) ? t : 0, liz.face < 0, liz.climbing);
    } });
  }
}

function drawFireworks(g, cx, cy) {
  nextBurst -= 1 / 60;
  if (nextBurst <= 0) {
    nextBurst = 0.8;
    const cols = ['#ffd34d', '#ff7a8a', '#8fe3ff', '#ffffff', '#b4ff8a'];
    const x = HILL_SPOT.x - 140 + Math.random() * 280, y = HILL_SPOT.y - 200 + Math.random() * 70;
    const c = cols[Math.floor(Math.random() * cols.length)];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      sparks.push({ x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, age: 0, c });
    }
  }
  for (const p of sparks) {
    p.age += 1 / 60;
    p.vy += 1;
    p.x += p.vx / 60; p.y += p.vy / 60;
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age > 1.3) sparks.splice(i, 1);
}

let lastCam = '';
function placeOverlay() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const key = `${cx},${cy},${scale}`;
  if (key !== lastCam) {
    lastCam = key;
    // full chip widths, measured while the names are showing (before any writes)
    const chipWs = stopBtns.map((b, k) => (b.classList.contains('compact') ? chipFull[k] : (chipFull[k] = b.offsetWidth)));
    const labelWs = labelEls.map((e) => e.offsetWidth);
    world.stops.forEach((s, n) => {
      if (n === 0) return;
      // the chip sits beside its signpost, on the side away from the path;
      // where the name won't fit on screen (small phones) it shows just the number
      const right = s.sx >= s.x;
      const sx = (s.sx - cx + (right ? 10 : -10)) * scale;
      const fits = right ? sx + chipWs[n - 1] <= window.innerWidth - 8 : sx - chipWs[n - 1] >= 8;
      stopBtns[n - 1].classList.toggle('compact', !fits);
      const y = (s.sy - cy - 15) * scale;
      stopBtns[n - 1].style.transform = `translate(${sx}px, ${y}px) translate(${right ? 0 : -100}%, -50%)`;
    });
    LABELS.forEach((l, k) => {
      // place names stay on screen when their spot is near the edge (phones)
      const half = labelWs[k] / 2 + 6;
      let x = (l.x - cx) * scale;
      if (x > -half && x < window.innerWidth + half) x = Math.max(half, Math.min(window.innerWidth - half, x));
      const y = (l.y - cy) * scale;
      labelEls[k].style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }
  // the bark bubble follows dog 2
  const text = bubbleText();
  if (text) {
    const dog = state.event.dog;
    bubble.hidden = false;
    if (bubble.textContent !== text) bubble.textContent = text;
    bubble.style.transform = `translate(${(dog.x - cx) * scale}px, ${(dog.y - 10 - cy) * scale}px) translate(-50%, -100%)`;
  } else if (!bubble.hidden) bubble.hidden = true;
}

// ---------------------------------------------------------------- loop

let frozen = false; // ?debug: hold time still to inspect a moment
function frame(now) {
  requestAnimationFrame(frame); // keep going even if a frame throws
  // up to 0.1 s per frame, so the chase keeps real time on slower phones
  const dt = frozen ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  if (!el.title.hidden && !reduced) title.frame(t);
  if (world && state.started) {
    if (state.cut) updateCut(dt);
    else {
      update(dt);
      drawMap();
      placeOverlay();
    }
  } else if (world) {
    world.prefetch(world.at(0).x, world.at(0).y, 700); // get the start ready behind the title
  }
  if (scene) scene.frame(t, dt);
}

// ---------------------------------------------------------------- input

function bindInput() {
  el.go.addEventListener('click', onGo);
  el.cardClose.addEventListener('click', () => closeCard());
  el.cardReplay.addEventListener('click', replay);
  el.card.addEventListener('keydown', trapFocus);
  el.recenter.addEventListener('click', () => { state.manual = null; el.recenter.hidden = true; });
  el.cutSkip.addEventListener('click', endCut);

  let soundPref = false;
  try { soundPref = localStorage.getItem('momtrip:sound') === 'on'; } catch { /* storage unavailable */ }
  const showSound = () => {
    el.sound.setAttribute('aria-pressed', String(sound.isOn()));
    el.sound.querySelector('.label').textContent = sound.isOn() ? 'Sound on' : 'Sound off';
  };
  // Browsers only allow audio after a tap, so a saved "on" waits for the first one
  if (soundPref) {
    const arm = (e) => {
      window.removeEventListener('pointerdown', arm);
      if (e.target.closest('#sound')) return;
      sound.setOn(true);
      showSound();
    };
    window.addEventListener('pointerdown', arm);
  }
  el.sound.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.setOn(!sound.isOn());
    if (sound.isOn()) sound.blip();
    try { localStorage.setItem('momtrip:sound', sound.isOn() ? 'on' : 'off'); } catch { /* ignore */ }
    showSound();
  });
  showSound();

  el.start.addEventListener('click', () => {
    state.started = true;
    sound.start();
    updateHud();
    snapCamera();
    el.title.classList.add('is-leaving');
    window.setTimeout(() => { el.title.hidden = true; }, reduced ? 0 : 420);
    el.go.focus({ preventScroll: true });
  });

  // drag or scroll to look around the map
  let drag = null;
  el.map.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    el.map.setPointerCapture(e.pointerId);
  });
  el.map.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    el.map.classList.add('is-dragging');
    state.manual = { x: drag.cx - dx / scale, y: drag.cy - dy / scale };
    el.recenter.hidden = false;
  });
  const endDrag = () => { drag = null; el.map.classList.remove('is-dragging'); };
  el.map.addEventListener('pointerup', endDrag);
  el.map.addEventListener('pointercancel', endDrag);
  el.map.addEventListener('wheel', (e) => {
    e.preventDefault();
    const base = state.manual || { x: cam.x, y: cam.y };
    state.manual = { x: base.x + e.deltaX / scale, y: base.y + e.deltaY / scale };
    el.recenter.hidden = false;
  }, { passive: false });

  window.addEventListener('resize', () => { resize(); lastCam = ''; });
}

// ---------------------------------------------------------------- start

async function init() {
  resize();
  bindInput();
  requestAnimationFrame(frame);
  try {
    await Promise.all(IMAGES.map(loadImage));
  } catch (err) {
    el.start.textContent = 'Couldn’t load the pictures. Reload the page';
    console.error(err);
    return;
  }
  fam = makeFamily();
  world = buildWorld(assets);
  buildOverlay();
  updateHud();
  snapCamera();
  // paint the opening view now so the map is ready when the title lifts
  world.drawGround(mctx, Math.round(cam.x), Math.round(cam.y), viewW, viewH, 12);
  el.start.disabled = false;
  el.start.textContent = 'Start the day';

  // ?debug: jump straight to a stop while testing, e.g. __trip.jump(3)
  if (new URLSearchParams(location.search).has('debug')) {
    window.__trip = {
      state, world,
      get scene() { return scene; },
      jump(n) {
        closeCard(false);
        state.travelling = false;
        state.event = null;
        state.reached = n;
        state.d = world.stops[n].d;
        state.chaseDone = state.d > world.chaseD;
        state.cutDone = state.d > world.boardD;
        state.driveT = 0;
        state.mode = world.modeAt(state.d);
        updateHud();
        snapCamera();
        if (n > 0) openCard(n);
      },
      freeze(on = true) { frozen = on; },
      // stand by the car and set off on the drive
      drive() {
        closeCard(false);
        Object.assign(state, { reached: 2, d: world.boardD - 40, chaseDone: true, cutDone: false, driveT: 0, event: null });
        snapCamera();
        travelTo(3);
      },
      // jump into the chase at a given moment (seconds), e.g. __trip.chase(6)
      chase(at = 0) {
        closeCard(false);
        Object.assign(state, { reached: 2, d: world.chaseD, travelling: true, targetD: world.stops[3].d, chaseDone: false, mode: 'walk' });
        startChase();
        state.event.t = at;
        state.event.woof = WOOFS.filter((w) => w < at).length;
        snapCamera();
      },
      // stand just before the park chase and walk on
      park() {
        closeCard(false);
        Object.assign(state, { reached: 2, d: world.chaseD - 120, chaseDone: false, event: null });
        snapCamera();
        travelTo(3);
      },
    };
  }
}

init();
