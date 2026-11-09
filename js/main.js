// Mom's birthday day trip: the map, the travelling family, the HUD and the stop cards.
import { buildWorld, W, H, LABELS, POOL_RECT } from './world.js?v=1';
import { drawCar, drawSign, drawArrow } from './sprites.js?v=1';
import { STOPS } from './stops.js?v=1';
import { createScene } from './scenes.js?v=1';
import { createTitle } from './title.js?v=1';
import * as sound from './sound.js?v=1';
import { hash2, pline } from './pixel.js?v=1';

const $ = (s) => document.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAST = STOPS.length; // 5

const el = {
  map: $('#map'), overlay: $('#overlay'), go: $('#go'), status: $('#status'), pips: $('#pips'),
  sound: $('#sound'), recenter: $('#recenter'),
  card: $('#card'), cardKicker: $('#card-kicker'), cardTitle: $('#card-title'), cardBody: $('#card-body'),
  cardDetails: $('#card-details'), cardClose: $('#card-close'), cardReplay: $('#card-replay'), scene: $('#scene'),
  title: $('#title'), titleBg: $('#title-bg'), start: $('#start'),
};

const assets = {};
const IMAGES = ['mom-map', 'dad-map', 'dog1-map', 'dog2-map', 'scene-street', 'scene-square', 'scene-drive', 'scene-baths'];

const mctx = el.map.getContext('2d');
const title = createTitle(el.titleBg);
let world = null;
let scale = 2, viewW = 0, viewH = 0;
const cam = { x: 0, y: 0 };
const state = {
  started: false, d: 0, targetD: 0, travelling: false, reached: 0, boost: 1,
  manual: null, cardOpen: 0, stepAcc: 0, steps: 0, mode: 'walk', facing: { dog1: 1, dog2: -1 },
};
let scene = null;
let t = 0;
let last = performance.now();
let stopBtns = [], labelEls = [];
const sparks = [];
let nextBurst = 0;
let lastFocus = null;

// ---------------------------------------------------------------- setup

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve((assets[name] = img));
    img.onerror = () => reject(new Error(`Could not load ${name}`));
    img.src = `assets/img/${name}.png`;
  });
}

function computeScale() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let s = vw < 700 || vh < 640 ? 2 : 3;
  if (vw / s > W) s = Math.ceil(vw / W);
  return s;
}

function resize() {
  scale = computeScale();
  viewW = Math.ceil(window.innerWidth / scale);
  viewH = Math.ceil(window.innerHeight / scale);
  el.map.width = viewW;
  el.map.height = viewH;
  el.map.style.width = `${viewW * scale}px`;
  el.map.style.height = `${viewH * scale}px`;
  mctx.imageSmoothingEnabled = false;
  title.build(window.innerWidth, window.innerHeight, scale);
  if (reduced) title.frame(0);
  document.documentElement.style.setProperty('--map-scale', scale);
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
  if (n === 4) sound.splash();
  if (n === LAST) sound.birthday();
  updateHud();
  window.setTimeout(() => openCard(n), reduced ? 80 : 550);
}

function replay() {
  closeCard(false);
  state.d = 0;
  state.reached = 0;
  state.travelling = false;
  state.mode = 'walk';
  state.manual = null;
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
  if (state.travelling) {
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

// ---------------------------------------------------------------- update

function update(dt) {
  if (state.travelling) {
    const mode = world.modeAt(state.d + 0.5);
    if (mode !== state.mode) {
      state.mode = mode;
      sound.engineOn(mode === 'drive');
      updateHud();
    }
    const base = mode === 'drive' ? 92 : 34;
    const remain = state.targetD - state.d;
    const ease = Math.max(0.35, Math.min(1, remain / 22));
    const v = base * ease * state.boost * (reduced ? 3 : 1);
    state.d = Math.min(state.targetD, state.d + v * dt);
    if (mode === 'walk') {
      state.stepAcc += v * dt;
      if (state.stepAcc > 9) { state.stepAcc = 0; state.steps++; sound.step(state.steps); }
    }
    if (state.d >= state.targetD) arrive();
  }

  // camera
  const f = world.at(state.d);
  let tx = f.x - viewW / 2;
  let ty = f.y - viewH * 0.46;
  if (state.cardOpen && window.innerWidth >= 900) {
    tx += el.card.getBoundingClientRect().width / 2 / scale;
  }
  if (state.manual) { tx = state.manual.x; ty = state.manual.y; }
  [tx, ty] = clampCam(tx, ty);
  if (state.manual) { state.manual.x = tx; state.manual.y = ty; }
  const k = reduced ? 1 : Math.min(1, dt * (state.manual ? 18 : 3.5));
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

function clampCam(x, y) {
  const cx = viewW >= W ? (W - viewW) / 2 : Math.max(0, Math.min(W - viewW, x));
  const top = world ? world.top : 0;
  const cy = viewH >= H + top ? (H - top - viewH) / 2 : Math.max(-top, Math.min(H - viewH, y));
  return [cx, cy];
}

function snapCamera() {
  const f = world.at(state.d);
  [cam.x, cam.y] = clampCam(f.x - viewW / 2, f.y - viewH * 0.46);
}

// ---------------------------------------------------------------- drawing

function drawMap() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const g = mctx;
  g.fillStyle = '#4b7836';
  g.fillRect(0, 0, viewW, viewH);
  g.drawImage(world.canvas, -cx, -cy - world.top);
  g.save();
  g.translate(-cx, -cy);
  const inView = (x, y, m = 24) => x > cx - m && x < cx + viewW + m && y > cy - m && y < cy + viewH + m;

  // river sparkles
  const rp = world.riverPx;
  g.fillStyle = '#d4ebf8';
  for (let k = 0; k < 260; k++) {
    const ph = t * 1.4 + k * 0.37;
    const slot = Math.floor(ph);
    if (!reduced && ph - slot > 0.45) continue;
    const i = rp[Math.floor(hash2(k, slot) * rp.length)];
    const x = i % W, y = (i / W) | 0;
    if (inView(x, y, 2)) g.fillRect(x, y, 2, 1);
  }

  // steam off the spa pool
  if (inView(POOL_RECT.x, POOL_RECT.y, 40)) {
    for (let k = 0; k < 9; k++) {
      const life = (t * 0.45 + k / 9) % 1;
      const x = POOL_RECT.x + 3 + hash2(k, 3) * (POOL_RECT.w - 6) + Math.sin(t * 2 + k) * 1.5;
      const y = POOL_RECT.y + POOL_RECT.h - 5 - life * 24;
      g.fillStyle = `rgba(255,255,255,${0.5 * (1 - life)})`;
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }

  // the winding path: gold where we've been, marching dashes to the next stop
  const pts = world.pts;
  const nextD = state.reached < LAST ? world.stops[state.reached + 1].d : -1;
  const march = reduced ? 0 : Math.floor(t * 10);
  let style = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!inView(p.x, p.y, 4)) continue;
    let col = null;
    if (i <= state.d) { if (i % 7 < 2) col = '#f3c64b'; }
    else if (i <= nextD) { if ((((i - march) % 8) + 8) % 8 < 3) col = '#fff4dc'; }
    else if (i % 9 < 2) col = 'rgba(255,244,220,0.55)';
    if (!col) continue;
    if (col !== style) { g.fillStyle = col; style = col; }
    g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
  }

  // things that stand up, sorted by y
  const things = [];
  world.stops.forEach((s, n) => {
    if (n === 0) return;
    const st = n <= state.reached ? 'done' : n === state.reached + 1 ? 'next' : 'locked';
    things.push({ y: s.sy, draw: () => {
      drawSign(g, s.sx, s.sy, st, t);
      if (st === 'next' && !state.travelling) drawArrow(g, s.sx, s.sy - 23, reduced ? 0 : t);
    } });
  });
  partyThings(things);
  things.sort((a, b) => a.y - b.y).forEach((th) => th.draw());

  // swallows overhead
  for (let k = 0; k < 3; k++) {
    const x = ((t * (16 + k * 5) + k * 170) % (W + 80)) - 40;
    const y = cy + 16 + k * 22 + Math.sin(t * 2 + k) * 3;
    const fl = Math.floor(t * 6 + k) % 2;
    g.fillStyle = '#2a1a14';
    if (fl) { g.fillRect(x | 0, y | 0, 2, 1); g.fillRect((x | 0) + 3, y | 0, 2, 1); g.fillRect((x | 0) + 2, (y | 0) + 1, 1, 1); }
    else { g.fillRect(x | 0, (y | 0) - 1, 1, 1); g.fillRect((x | 0) + 1, y | 0, 1, 1); g.fillRect((x | 0) + 2, (y | 0) + 1, 1, 1); g.fillRect((x | 0) + 3, y | 0, 1, 1); g.fillRect((x | 0) + 4, (y | 0) - 1, 1, 1); }
  }

  // fireworks over the birthday hill once we arrive
  if (state.reached === LAST && !reduced) drawFireworks(g);

  g.restore();
}

function partyThings(things) {
  const g = mctx;
  const d = state.d;
  const mode = world.modeAt(d);

  if (mode === 'drive') {
    const p = world.at(d);
    const tg = world.tangent(d);
    things.push({ y: p.y, draw: () => {
      if (state.travelling && !reduced) {
        for (let k = 0; k < 3; k++) {
          const age = (t * 2.2 + k / 3) % 1;
          const back = 32 + age * 10;
          g.fillStyle = `rgba(235,230,220,${0.55 * (1 - age)})`;
          g.fillRect(Math.round(p.x - tg.x * back), Math.round(p.y - 3 - tg.y * back - age * 3), 2, 2);
        }
      }
      const bump = state.travelling && Math.floor(t * 9) % 3 === 0 ? 1 : 0;
      drawCar(g, p.x, p.y, tg.x < 0, bump, assets);
    } });
    return;
  }

  // the parked car
  if (d <= world.boardD) things.push({ y: world.boardPt.y + 6, draw: () => drawCar(g, world.boardPt.x + 4, world.boardPt.y + 6, false, 0, {}) });
  else if (d >= world.parkD) things.push({ y: world.parkPt.y - 4, draw: () => drawCar(g, world.parkPt.x + 6, world.parkPt.y - 4, true, 0, {}) });

  const lo = d >= world.parkD ? world.parkD : -Infinity;
  const hi = d <= world.boardD ? world.boardD : Infinity;
  const clampD = (v) => Math.max(lo, Math.min(hi, v));
  const pos = (dd, off) => {
    const c = clampD(dd);
    const p = world.at(c);
    const tt = world.tangent(c);
    return { x: p.x - tt.y * off, y: p.y + tt.x * off, tx: tt.x };
  };
  const walking = state.travelling;
  const bobAt = (ph, dog) => {
    if (reduced) return 0;
    if (walking) return Math.floor(state.d / 4 + ph * 2) % 2;
    return dog && Math.floor(t * 2 + ph * 3) % 5 === 0 ? 1 : 0;
  };

  const mom = pos(d - 4, 11), dad = pos(d - 4, -11);
  const dog1 = pos(d + 11, 14), dog2 = pos(d + 11, -13);
  if (dog1.tx > 0.2) state.facing.dog1 = 1; else if (dog1.tx < -0.2) state.facing.dog1 = -1;
  if (dog2.tx > 0.2) state.facing.dog2 = 1; else if (dog2.tx < -0.2) state.facing.dog2 = -1;

  const sprite = (img, p, bob, flip) => () => {
    const x = Math.round(p.x - img.width / 2), y = Math.round(p.y - img.height + 1 - bob);
    g.fillStyle = 'rgba(25,20,15,0.32)';
    g.fillRect(x + 2, Math.round(p.y), img.width - 4, 2);
    if (flip) {
      g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore();
    } else g.drawImage(img, x, y);
  };

  // leads, drawn first so the sprites sit on top of them
  things.push({ y: -1e9, draw: () => {
    const d1 = state.facing.dog1, d2 = state.facing.dog2;
    pline(g, mom.x - 8, mom.y - 12, dog1.x + d1 * 5, dog1.y - 10, '#c8302c');
    pline(g, dad.x + 9, dad.y - 12, dog2.x + d2 * 4, dog2.y - 10, '#2e8f7a');
  } });
  things.push({ y: mom.y, draw: sprite(assets['mom-map'], mom, bobAt(0), false) });
  things.push({ y: dad.y, draw: sprite(assets['dad-map'], dad, bobAt(0.5), false) });
  // dog 1 faces right in the art, dog 2 faces left
  things.push({ y: dog1.y, draw: sprite(assets['dog1-map'], dog1, bobAt(0.25, true), state.facing.dog1 < 0) });
  things.push({ y: dog2.y, draw: sprite(assets['dog2-map'], dog2, bobAt(0.75, true), state.facing.dog2 > 0) });
}

function drawFireworks(g) {
  nextBurst -= 1 / 60;
  if (nextBurst <= 0) {
    nextBurst = 0.9;
    const cols = ['#ffd34d', '#ff7a8a', '#8fe3ff', '#ffffff', '#b4ff8a'];
    const x = 130 + Math.random() * 120, y = 1196 + Math.random() * 40;
    const c = cols[Math.floor(Math.random() * cols.length)];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      sparks.push({ x, y, vx: Math.cos(a) * 26, vy: Math.sin(a) * 26, age: 0, c });
    }
  }
  for (const p of sparks) {
    p.age += 1 / 60;
    p.vy += 0.4;
    p.x += p.vx / 60; p.y += p.vy / 60;
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age > 1.3) sparks.splice(i, 1);
}

let lastCam = '';
function placeOverlay() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const key = `${cx},${cy},${scale}`;
  if (key === lastCam) return;
  lastCam = key;
  world.stops.forEach((s, n) => {
    if (n === 0) return;
    // the chip sits beside its signpost, on the side away from the path
    const right = s.sx >= s.x;
    const x = (s.sx - cx + (right ? 10 : -10)) * scale, y = (s.sy - cy - 16) * scale;
    stopBtns[n - 1].style.transform = `translate(${x}px, ${y}px) translate(${right ? 0 : -100}%, -50%)`;
  });
  LABELS.forEach((l, k) => {
    const x = (l.x - cx) * scale, y = (l.y - cy) * scale;
    labelEls[k].style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  });
}

// ---------------------------------------------------------------- loop

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  if (!el.title.hidden && !reduced) title.frame(t);
  if (world && state.started) {
    update(dt);
    drawMap();
    placeOverlay();
  }
  if (scene) scene.frame(t, dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- input

function bindInput() {
  el.go.addEventListener('click', onGo);
  el.cardClose.addEventListener('click', () => closeCard());
  el.cardReplay.addEventListener('click', replay);
  el.card.addEventListener('keydown', trapFocus);
  el.recenter.addEventListener('click', () => { state.manual = null; el.recenter.hidden = true; });

  let soundPref = false;
  try { soundPref = localStorage.getItem('momtrip:sound') === 'on'; } catch { /* storage unavailable */ }
  const showSound = () => {
    el.sound.setAttribute('aria-pressed', String(sound.isOn()));
    el.sound.querySelector('.label').textContent = sound.isOn() ? 'Sound on' : 'Sound off';
  };
  // Browsers only allow audio after a tap, so a saved "on" waits for the first click
  if (soundPref) {
    const arm = (e) => {
      window.removeEventListener('pointerdown', arm);
      if (e.target.closest('#sound')) return; // the toggle handles itself
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
  world = buildWorld();
  buildOverlay();
  updateHud();
  snapCamera();
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
        state.reached = n;
        state.d = world.stops[n].d;
        state.mode = world.modeAt(state.d);
        updateHud();
        snapCamera();
        if (n > 0) openCard(n);
      },
    };
  }
}

init();
