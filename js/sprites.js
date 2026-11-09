// Sprites drawn in code: the convertible, the signposts and the arrow.
import { drawArt, disc } from './pixel.js?v=1';

// The convertible, roof down, with the real family sprites sitting inside.
// x,y = bottom centre; drawn facing right, mirrored when driving left.
export function drawCar(g, x, y, faceLeft, bounce, assets) {
  x = Math.round(x); y = Math.round(y);
  g.save();
  g.translate(x, y - bounce);
  if (faceLeft) g.scale(-1, 1);

  // shadow (doesn't bounce)
  g.fillStyle = 'rgba(25,20,15,0.35)';
  g.fillRect(-28, bounce, 57, 3);

  // passengers: dogs in the back, Dad driving, Mom up front
  const seat = (name, cx, rows) => {
    const im = assets[name];
    if (!im) return;
    g.drawImage(im, 0, 0, im.width, rows, Math.round(cx - im.width / 2), -13 - rows + 1, im.width, rows);
  };
  seat('dog2-map', -20, 11);
  seat('dog1-map', -9, 12);
  seat('dad-map', 3, 15);
  seat('mom-map', 14, 15);

  // windscreen
  g.fillStyle = '#2a1a14';
  for (let j = 0; j < 9; j++) g.fillRect(19 + Math.floor(j / 3), -14 - j, 3, 1);
  g.fillStyle = '#bcd3dc';
  for (let j = 1; j < 8; j++) g.fillRect(20 + Math.floor(j / 3), -14 - j, 1, 1);

  // body outline, then paint
  g.fillStyle = '#1d1512';
  g.fillRect(-30, -14, 60, 11);
  g.fillRect(-29, -15, 58, 1);
  g.fillRect(-31, -12, 1, 7);
  g.fillRect(30, -12, 1, 7);
  g.fillStyle = '#454a53';
  g.fillRect(-29, -13, 58, 8);
  g.fillStyle = '#6d737d';
  g.fillRect(-29, -13, 58, 1);
  g.fillRect(-28, -11, 56, 1);
  g.fillStyle = '#2f333a';
  g.fillRect(-29, -6, 58, 1);
  // door line and handle
  g.fillStyle = '#2f333a'; g.fillRect(0, -12, 1, 6);
  g.fillStyle = '#c9ced4'; g.fillRect(3, -10, 3, 1);
  // lights
  g.fillStyle = '#ffe7a0'; g.fillRect(28, -11, 2, 2);
  g.fillStyle = '#d23a2f'; g.fillRect(-30, -11, 2, 2);
  // chrome bumpers
  g.fillStyle = '#a9adb3'; g.fillRect(27, -6, 4, 1); g.fillRect(-31, -6, 4, 1);

  // wheels
  for (const wx of [-17, 17]) {
    disc(g, wx, -3, 4.2, '#141414');
    disc(g, wx, -3, 2, '#a9adb3');
    g.fillStyle = '#5b5f66'; g.fillRect(wx, -3, 1, 1);
  }
  g.restore();
}

// Signpost. state: 'next' | 'done' | 'locked'
export function drawSign(g, x, y, state, t) {
  x = Math.round(x); y = Math.round(y);
  const plate = state === 'next' ? '#f2b43c' : state === 'done' ? '#c4552f' : '#efe2c4';
  g.fillStyle = 'rgba(25,20,15,0.35)';
  g.fillRect(x - 3, y, 7, 2);
  // pole
  g.fillStyle = '#2a1a14'; g.fillRect(x - 1, y - 12, 3, 13);
  g.fillStyle = '#8a5a35'; g.fillRect(x, y - 12, 1, 12);
  // plate
  g.fillStyle = '#2a1a14'; g.fillRect(x - 7, y - 20, 15, 9);
  g.fillStyle = plate; g.fillRect(x - 6, y - 19, 13, 7);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 6, y - 13, 13, 1);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x - 6, y - 19, 13, 1);
  if (state === 'done') {
    // a little flag that waves
    const f = Math.floor(t * 4) % 2;
    g.fillStyle = '#2a1a14'; g.fillRect(x + 6, y - 30, 1, 11);
    g.fillStyle = '#fff4dc';
    g.fillRect(x + 7, y - 30, 6, 2); g.fillRect(x + 7, y - 28, 5 - f, 2);
    // check mark
    g.fillRect(x - 3, y - 16, 1, 1); g.fillRect(x - 2, y - 15, 1, 1); g.fillRect(x - 1, y - 16, 1, 1);
    g.fillRect(x, y - 17, 1, 1); g.fillRect(x + 1, y - 18, 1, 1);
  } else {
    g.fillStyle = state === 'next' ? '#2a1a14' : '#9c8b6e';
    g.fillRect(x - 4, y - 17, 9, 1); g.fillRect(x - 4, y - 15, 6, 1);
  }
}

const ARROW = [
  'kkkkkkk',
  'kaaaaak',
  ' kaaak ',
  '  kak  ',
  '   k   ',
];
export function drawArrow(g, x, y, t) {
  const bob = Math.floor(t * 3) % 2;
  drawArt(g, ARROW, { k: '#2a1a14', a: '#f2b43c' }, Math.round(x - 3), Math.round(y - 5 + bob));
}
