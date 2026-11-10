// Sprites drawn in code, at the map's scale (1 m ≈ 20px):
// the convertible, the signposts, the arrow and the lizard.
import { drawArt, disc } from './pixel.js?v=4';

// The convertible (≈4.3 m long), roof down, with the family's own sprites inside.
// x,y = bottom centre; drawn facing right, mirrored when driving left.
export function drawCar(g, x, y, faceLeft, bounce, assets) {
  x = Math.round(x); y = Math.round(y);
  g.save();
  g.translate(x, y - bounce);
  if (faceLeft) g.scale(-1, 1);

  g.fillStyle = 'rgba(25,20,15,0.35)';
  g.fillRect(-42, bounce - 1, 86, 4);

  // passengers: dogs in the back, Dad driving, Mom up front
  const seat = (name, cx, rows) => {
    const im = assets[name];
    if (!im) return;
    g.drawImage(im, 0, 0, im.width, rows, Math.round(cx - im.width / 2), -22 - rows + 1, im.width, rows);
  };
  seat('dog2-map', -26, 9);
  seat('dog1-map', -12, 9);
  seat('dad-map', 6, 16);
  seat('mom-map', 22, 16);

  // windscreen
  g.fillStyle = '#2a1a14';
  for (let j = 0; j < 14; j++) g.fillRect(29 + Math.floor(j / 3), -22 - j, 3, 1);
  g.fillStyle = '#bcd3dc';
  for (let j = 1; j < 13; j++) g.fillRect(30 + Math.floor(j / 3), -22 - j, 1, 1);

  // body
  g.fillStyle = '#1d1512';
  g.fillRect(-43, -23, 86, 17);
  g.fillRect(-41, -24, 82, 1);
  g.fillRect(-44, -20, 1, 12); g.fillRect(43, -20, 1, 12);
  g.fillStyle = '#454a53'; g.fillRect(-42, -22, 84, 14);
  g.fillStyle = '#6d737d'; g.fillRect(-42, -22, 84, 2); g.fillRect(-41, -18, 82, 1);
  g.fillStyle = '#2f333a'; g.fillRect(-42, -10, 84, 2);
  g.fillStyle = '#2f333a'; g.fillRect(2, -20, 1, 10);
  g.fillStyle = '#c9ced4'; g.fillRect(6, -16, 5, 1);
  g.fillStyle = '#ffe7a0'; g.fillRect(40, -18, 3, 3);
  g.fillStyle = '#d23a2f'; g.fillRect(-43, -18, 3, 3);
  g.fillStyle = '#a9adb3'; g.fillRect(38, -9, 6, 2); g.fillRect(-44, -9, 6, 2);

  for (const wx of [-27, 27]) {
    disc(g, wx, -6, 7.2, '#141414');
    disc(g, wx, -6, 3.4, '#a9adb3');
    g.fillStyle = '#5b5f66'; g.fillRect(wx - 1, -7, 2, 2);
  }
  g.restore();
}

// Signpost (≈1.7 m). state: 'next' | 'done' | 'locked'
export function drawSign(g, x, y, state, t) {
  x = Math.round(x); y = Math.round(y);
  const plate = state === 'next' ? '#f2b43c' : state === 'done' ? '#c4552f' : '#efe2c4';
  g.fillStyle = 'rgba(25,20,15,0.35)';
  g.fillRect(x - 5, y, 11, 3);
  g.fillStyle = '#2a1a14'; g.fillRect(x - 2, y - 22, 5, 23);
  g.fillStyle = '#8a5a35'; g.fillRect(x - 1, y - 22, 2, 22);
  g.fillStyle = '#2a1a14'; g.fillRect(x - 13, y - 36, 27, 16);
  g.fillStyle = plate; g.fillRect(x - 12, y - 35, 25, 14);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 12, y - 23, 25, 2);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x - 12, y - 35, 25, 1);
  if (state === 'done') {
    const f = Math.floor(t * 4) % 2;
    g.fillStyle = '#2a1a14'; g.fillRect(x + 12, y - 54, 2, 19);
    g.fillStyle = '#fff4dc';
    g.fillRect(x + 14, y - 54, 10, 3); g.fillRect(x + 14, y - 51, 9 - f, 3); g.fillRect(x + 14, y - 48, 8 - f * 2, 2);
    g.fillRect(x - 6, y - 29, 2, 2); g.fillRect(x - 4, y - 27, 2, 2); g.fillRect(x - 2, y - 29, 2, 2);
    g.fillRect(x, y - 31, 2, 2); g.fillRect(x + 2, y - 33, 2, 2);
  } else {
    g.fillStyle = state === 'next' ? '#2a1a14' : '#9c8b6e';
    g.fillRect(x - 8, y - 31, 17, 2); g.fillRect(x - 8, y - 27, 11, 2);
  }
}

const ARROW = [
  'kkkkkkkkkkk',
  'kaaaaaaaaak',
  ' kaaaaaaak ',
  '  kaaaaak  ',
  '   kaaak   ',
  '    kak    ',
  '     k     ',
];
export function drawArrow(g, x, y, t) {
  const bob = (Math.floor(t * 3) % 2) * 2;
  drawArt(g, ARROW, { k: '#2a1a14', a: '#f2b43c' }, Math.round(x - 5), Math.round(y - 7 + bob));
}

// The lizard (≈20 cm with its tail), in the colours of the artwork.
// Two running frames, facing right.
const LIZ = [
  [
    '         kk  ',
    '  kk   kkggk ',
    'kkooggkgogyek',
    '   kkggggggk ',
    '     k   k   ',
  ],
  [
    '         kk  ',
    '   kk  kkggk ',
    'kkkoogkgogyek',
    '    kgggggk  ',
    '    k     k  ',
  ],
];
const LIZ_PAL = { k: '#2b3a12', g: '#7fb23a', o: '#e39a35', y: '#f0d79b', e: '#111111' };
export const LIZ_W = 13;

// angle: 0 = running right; climbing uses -90 (head up)
export function drawLizard(g, x, y, t, faceLeft, climbing) {
  const frame = LIZ[Math.floor(t * 14) % 2];
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (climbing) g.rotate(-Math.PI / 2);
  else if (faceLeft) g.scale(-1, 1);
  drawArt(g, frame, LIZ_PAL, -6, -4);
  g.restore();
}
