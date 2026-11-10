// 8-bit sound effects made in code with the Web Audio API. Off by default.
let ac = null;
let out = null;
let on = false;
let engine = null;
let noiseBuf = null;

export const isOn = () => on;

export function setOn(v) {
  on = v;
  if (v) ensure();
  else { engineOn(false); windOn(false); }
}

function ensure() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    out = ac.createGain();
    out.gain.value = 0.16;
    out.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return true;
}

function ready() {
  return on && ensure();
}

function tone(f, start, dur, { type = 'square', vol = 0.4, slide = null } = {}) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.03);
}

function noise(start, dur, { vol = 0.3, freq = 1000, type = 'bandpass' } = {}) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(out);
  src.start(start);
  src.stop(start + dur + 0.02);
}

export function step(i) {
  if (!ready()) return;
  noise(ac.currentTime, 0.05, { vol: 0.35, freq: i % 2 ? 900 : 650 });
}

export function blip() {
  if (!ready()) return;
  const t = ac.currentTime;
  tone(784, t, 0.07, { vol: 0.3 });
  tone(1175, t + 0.06, 0.1, { vol: 0.3 });
}

export function locked() {
  if (!ready()) return;
  tone(220, ac.currentTime, 0.16, { vol: 0.35, slide: 150 });
}

export function arrive() {
  if (!ready()) return;
  const t = ac.currentTime;
  [523, 659, 784, 1047].forEach((f, k) => tone(f, t + k * 0.08, 0.16, { vol: 0.3 }));
}

export function start() {
  if (!ready()) return;
  const t = ac.currentTime;
  [392, 523, 659, 784, 659, 784, 1047].forEach((f, k) => tone(f, t + k * 0.07, 0.12, { vol: 0.28 }));
}

export function splash() {
  if (!ready()) return;
  const t = ac.currentTime;
  noise(t, 0.6, { vol: 0.5, freq: 700, type: 'lowpass' });
  tone(330, t + 0.05, 0.25, { type: 'triangle', vol: 0.2, slide: 660 });
}

// Barks. Dog 1 (the poodle) yips high and quick; dog 2 (the spaniel) gives a
// deeper "woof". Called with no name, it's dog 2's woof.
export function bark(name = 'dog2') {
  if (!ready()) return;
  const t = ac.currentTime;
  if (name === 'dog1') {
    tone(900, t, 0.06, { vol: 0.3, slide: 620 });
    noise(t, 0.05, { vol: 0.2, freq: 1800 });
    tone(860, t + 0.09, 0.05, { vol: 0.26, slide: 600 });
  } else {
    tone(420, t, 0.12, { vol: 0.34, slide: 230 });
    noise(t, 0.1, { vol: 0.26, freq: 700 });
    tone(380, t + 0.16, 0.1, { vol: 0.28, slide: 210 });
  }
}

// Wind rushing past an open-top car
let wind = null;
export function windOn(v) {
  if (v && on && ensure() && !wind) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.6;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.35;
    const lg = ac.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(f.frequency);
    const g = ac.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.22, ac.currentTime, 0.4);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    wind = { src, lfo, g };
  } else if (!v && wind) {
    const w = wind;
    wind = null;
    w.g.gain.setTargetAtTime(0, ac.currentTime, 0.2);
    setTimeout(() => { w.src.stop(); w.lfo.stop(); }, 900);
  }
}

export function engineOn(v) {
  if (v && on && ensure() && !engine) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 52;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 11;
    const lg = ac.createGain();
    lg.gain.value = 7;
    lfo.connect(lg).connect(o.frequency);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = ac.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.35, ac.currentTime, 0.2);
    o.connect(f).connect(g).connect(out);
    o.start();
    lfo.start();
    engine = { o, lfo, g };
  } else if (!v && engine) {
    const e = engine;
    engine = null;
    e.g.gain.setTargetAtTime(0, ac.currentTime, 0.12);
    setTimeout(() => { e.o.stop(); e.lfo.stop(); }, 700);
  }
}

// "Happy Birthday to You" (public domain), as a chiptune
export function birthday() {
  if (!ready()) return;
  const G4 = 392, A4 = 440, B4 = 494, C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784;
  const song = [
    [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [C5, 1], [B4, 2],
    [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [D5, 1], [C5, 2],
    [G4, 0.75], [G4, 0.25], [G5, 1], [E5, 1], [C5, 1], [B4, 1], [A4, 2],
    [F5, 0.75], [F5, 0.25], [E5, 1], [C5, 1], [D5, 1], [C5, 3],
  ];
  const beat = 0.34;
  let t = ac.currentTime + 0.1;
  for (const [f, b] of song) {
    tone(f, t, b * beat * 0.92, { vol: 0.28 });
    tone(f / 2, t, b * beat * 0.9, { type: 'triangle', vol: 0.18 });
    t += b * beat;
  }
}
