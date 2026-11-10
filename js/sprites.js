// Sprites drawn in code, at the map's scale (about 9px to the metre, so the
// family is 15-16px tall): Mom, Dad and the dogs, the convertible, the
// signposts, the arrow and the lizard.
import { drawArt, disc } from './pixel.js?v=7';

// ---------------------------------------------------------------- the family
// Hand-drawn at map size in the colours of the artwork (a shrunk copy of the
// artwork turns to mush this small). Each has a standing frame and steps.
const LEGS = {
  mom: {
    stand: ['.kjJkjJk.', '.kjjkjjk.', '.kjjkjjk.', '.kwwkwwk.'],
    left: ['.kjJkjJk.', '.kjjkjjk.', '.kwwkjjk.', '..kkkwwk.'],
    right: ['.kjJkjJk.', '.kjjkjjk.', '.kjjkwwk.', '.kwwkkk..'],
  },
  dad: {
    stand: ['.kjJjjJjk.', '.kjjkkjjk.', '.kjjkkjjk.', '.kjjkkjjk.', '.kwwkkwwk.'],
    left: ['.kjJjjJjk.', '.kjjkkjjk.', '.kjjkkjjk.', '.kwwkkjjk.', '..kk.kwwk.'],
    right: ['.kjJjjJjk.', '.kjjkkjjk.', '.kjjkkjjk.', '.kjjkkwwk.', '.kwwk.kk..'],
  },
};
const MOM_TOP = [
  '..kkkkk..',
  '.khHHhhk.',
  'khhssshhk',
  'khseseshk',
  'khhsssshk',
  'khhtsthhk',
  'khttttthk',
  'ktTtttTtk',
  'kstttttok',
  '.kttttork',
  '.kjjjjjk.',
];
const DAD_TOP = [
  '..kkkkkk..',
  '.kSSssssk.',
  '.kSsssssk.',
  '.ksessesk.',
  '.kssssssk.',
  '..kSsssk..',
  'kddnlnlddk',
  'kdDlnlnDdk',
  'kdDnlnlDdk',
  'ksddddddsk',
  '.kjjjjjjk.',
];
const DOG_BODY = [
  '......kk..',
  '.kk..kOOk.',
  'kOOkkOoOek',
  '.kOOoooook',
  '.kooooook.',
];
const DOG_LEGS = [['.kok..kok.', '.kk...kk..'], ['..kok.kok.', '..kk..kk..']];

const PAL = {
  mom: { k: '#2a1a14', h: '#7a3420', H: '#a8522a', s: '#ecb894', e: '#3a2a22', t: '#e2d9c8', T: '#b3a690', o: '#e07a2a', r: '#a8481c', j: '#3f5d92', J: '#2c4170', w: '#f4efe6' },
  dad: { k: '#2a1a14', S: '#f2c6a4', s: '#e3a985', e: '#3a2a22', d: '#2d2c36', D: '#4a4956', n: '#2f3d6e', l: '#b4b0dc', j: '#3f5d92', J: '#2c4170', w: '#f4efe6' },
  dog1: { k: '#2a1a14', o: '#c8592a', O: '#e8873f', e: '#1a0f0a' },
  dog2: { k: '#2a1a14', o: '#dca04c', O: '#f4cf88', e: '#1a0f0a' },
};

function paint(rows, pal) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = document.createElement('canvas');
  c.width = w; c.height = rows.length;
  drawArt(c.getContext('2d'), rows, pal, 0, 0);
  return c;
}

// { mom: [stand, left, right], dad: [...], dog1: [stand, step], dog2: [...] }
// (the dogs face right)
export function makeFamily() {
  const person = (top, legs, pal) => ['stand', 'left', 'right'].map((k) => paint([...top, ...legs[k]], pal));
  const dog = (pal) => DOG_LEGS.map((legs) => paint([...DOG_BODY, ...legs], pal));
  return {
    mom: person(MOM_TOP, LEGS.mom, PAL.mom),
    dad: person(DAD_TOP, LEGS.dad, PAL.dad),
    dog1: dog(PAL.dog1),
    dog2: dog(PAL.dog2),
  };
}

// ---------------------------------------------------------------- the car
// The convertible (≈4.4 m long), roof down, with the family's heads showing.
// x,y = bottom centre; drawn facing right, mirrored when driving left.
export function drawCar(g, x, y, faceLeft, bounce, fam) {
  x = Math.round(x); y = Math.round(y);
  g.save();
  g.translate(x, y - bounce);
  if (faceLeft) g.scale(-1, 1);

  g.fillStyle = 'rgba(25,20,15,0.35)';
  g.fillRect(-19, bounce - 1, 39, 2);

  // passengers: dogs in the back, Dad driving, Mom up front
  const seat = (im, cx, rows) => {
    if (!im) return;
    g.drawImage(im, 0, 0, im.width, rows, Math.round(cx - im.width / 2), -11 - rows, im.width, rows);
  };
  if (fam) {
    seat(fam.dog2[0], -12, 5);
    seat(fam.dog1[0], -4, 5);
    seat(fam.dad[0], 4, 8);
    seat(fam.mom[0], 12, 8);
  }

  // windscreen
  g.fillStyle = '#2a1a14';
  for (let j = 0; j < 6; j++) g.fillRect(15 + (j >> 1), -10 - j, 2, 1);
  g.fillStyle = '#bcd3dc'; g.fillRect(16, -13, 1, 3);

  // body
  g.fillStyle = '#1d1512'; g.fillRect(-20, -11, 40, 8); g.fillRect(-19, -12, 38, 1);
  g.fillStyle = '#454a53'; g.fillRect(-19, -10, 38, 6);
  g.fillStyle = '#6d737d'; g.fillRect(-19, -10, 38, 1);
  g.fillStyle = '#2f333a'; g.fillRect(-19, -5, 38, 1); g.fillRect(1, -9, 1, 4);
  g.fillStyle = '#ffe7a0'; g.fillRect(18, -9, 1, 2);
  g.fillStyle = '#d23a2f'; g.fillRect(-19, -9, 1, 2);

  for (const wx of [-12, 12]) {
    disc(g, wx, -3, 3, '#141414');
    g.fillStyle = '#a9adb3'; g.fillRect(wx - 1, -4, 2, 2);
  }
  g.restore();
}

// ---------------------------------------------------------------- signposts
// Signpost (≈2.5 m). state: 'next' | 'done' | 'locked'
export function drawSign(g, x, y, state, t) {
  x = Math.round(x); y = Math.round(y);
  const plate = state === 'next' ? '#f2b43c' : state === 'done' ? '#c4552f' : '#efe2c4';
  g.fillStyle = 'rgba(25,20,15,0.35)';
  g.fillRect(x - 3, y, 7, 2);
  g.fillStyle = '#2a1a14'; g.fillRect(x - 1, y - 11, 3, 12);
  g.fillStyle = '#8a5a35'; g.fillRect(x, y - 11, 1, 11);
  g.fillStyle = '#2a1a14'; g.fillRect(x - 7, y - 19, 15, 9);
  g.fillStyle = plate; g.fillRect(x - 6, y - 18, 13, 7);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x - 6, y - 18, 13, 1);
  if (state === 'done') {
    const f = Math.floor(t * 4) % 2;
    g.fillStyle = '#2a1a14'; g.fillRect(x + 7, y - 28, 1, 10);
    g.fillStyle = '#fff4dc';
    g.fillRect(x + 8, y - 28, 6, 2); g.fillRect(x + 8, y - 26, 5 - f, 2);
    // a tick
    g.fillRect(x - 3, y - 15, 1, 1); g.fillRect(x - 2, y - 14, 1, 1); g.fillRect(x - 1, y - 15, 1, 1);
    g.fillRect(x, y - 16, 1, 1); g.fillRect(x + 1, y - 17, 1, 1);
  } else {
    g.fillStyle = state === 'next' ? '#2a1a14' : '#9c8b6e';
    g.fillRect(x - 4, y - 16, 9, 1); g.fillRect(x - 4, y - 14, 6, 1);
  }
}

const ARROW = [
  'kkkkkkk',
  'kaaaaak',
  '.kaaak.',
  '..kak..',
  '...k...',
];
export function drawArrow(g, x, y, t) {
  const bob = (Math.floor(t * 3) % 2) * 2;
  drawArt(g, ARROW, { k: '#2a1a14', a: '#f2b43c' }, Math.round(x - 3), Math.round(y - 5 + bob));
}

// ---------------------------------------------------------------- the lizard
// A little larger than life (≈40 cm) so it can be seen, in the colours of the
// artwork. Two running frames, facing right.
const LIZ = [
  ['.....kk.', 'kkoogkek', '...k..k.'],
  ['.....kk.', 'kkoogkek', '....kk..'],
];
const LIZ_PAL = { k: '#2b3a12', g: '#7fb23a', o: '#e39a35', e: '#f0d79b' };
export const LIZ_W = 8;

// climbing turns it head-up
export function drawLizard(g, x, y, t, faceLeft, climbing) {
  const frame = LIZ[Math.floor(t * 14) % 2];
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (climbing) g.rotate(-Math.PI / 2);
  else if (faceLeft) g.scale(-1, 1);
  drawArt(g, frame, LIZ_PAL, -4, -2);
  g.restore();
}
