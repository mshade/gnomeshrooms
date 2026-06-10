'use strict';

// ---------------------------------------------------------------------------
// Gnome & the Black Cats — a relaxing forest mushroom-picking stroll.
// You: a gnome. Following you: Frankie (big, overbite) and Pickle (small).
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// Seeded RNG so the forest is the same lovely forest every time.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260609);

const WORLD = 3600;
const SPAWN = { x: WORLD / 2, y: WORLD / 2 };

// ---------------------------------------------------------------------------
// World generation
// ---------------------------------------------------------------------------

function placeAwayFromSpawn(minDist) {
  while (true) {
    const x = 80 + rand() * (WORLD - 160);
    const y = 80 + rand() * (WORLD - 160);
    const d = Math.hypot(x - SPAWN.x, y - SPAWN.y);
    if (d > minDist) return { x, y };
  }
}

const trees = [];
for (let i = 0; i < 420; i++) {
  const p = placeAwayFromSpawn(120);
  trees.push({
    x: p.x, y: p.y,
    size: 0.75 + rand() * 0.8,
    shade: rand(),
    phase: rand() * Math.PI * 2,
  });
}

const FLOWER_COLORS = ['#e8638c', '#f2f2f2', '#f5c542', '#9b6bd3', '#ff8c5a', '#7ec8e3', '#f06292'];
const flowers = [];
for (let i = 0; i < 1500; i++) {
  flowers.push({
    x: 40 + rand() * (WORLD - 80),
    y: 40 + rand() * (WORLD - 80),
    color: FLOWER_COLORS[(rand() * FLOWER_COLORS.length) | 0],
    size: 3 + rand() * 3.5,
    phase: rand() * Math.PI * 2,
  });
}

const grassTufts = [];
for (let i = 0; i < 2200; i++) {
  grassTufts.push({
    x: rand() * WORLD,
    y: rand() * WORLD,
    h: 5 + rand() * 7,
    phase: rand() * Math.PI * 2,
    shade: rand(),
  });
}

const rocks = [];
for (let i = 0; i < 90; i++) {
  const p = placeAwayFromSpawn(150);
  rocks.push({ x: p.x, y: p.y, size: 8 + rand() * 14, shade: rand() });
}

// Soft mottled ground patches so the floor isn't one flat green.
const groundPatches = [];
for (let i = 0; i < 260; i++) {
  groundPatches.push({
    x: rand() * WORLD,
    y: rand() * WORLD,
    r: 60 + rand() * 160,
    tone: rand(),
  });
}

const MUSHROOM_KINDS = [
  { name: 'Red Cap',     cap: '#d6453d', spots: true,  stem: '#f3ead8', weight: 0.38 },
  { name: 'Brown Bell',  cap: '#9c6b3f', spots: false, stem: '#e8dcc8', weight: 0.32 },
  { name: 'Chanterelle', cap: '#e8a33d', spots: false, stem: '#e8b964', weight: 0.22 },
  { name: 'Violet Whim', cap: '#8650b8', spots: true,  stem: '#ddd0ec', weight: 0.08 },
];

function pickKind() {
  let r = rand();
  for (const k of MUSHROOM_KINDS) {
    if (r < k.weight) return k;
    r -= k.weight;
  }
  return MUSHROOM_KINDS[0];
}

const mushrooms = [];
for (let i = 0; i < 130; i++) {
  const p = placeAwayFromSpawn(60);
  mushrooms.push({
    x: p.x, y: p.y,
    kind: pickKind(),
    size: 0.8 + rand() * 0.5,
    alive: true,
    respawnAt: 0,
  });
}

// Drifting pollen / firefly motes.
const motes = [];
for (let i = 0; i < 90; i++) {
  motes.push({
    x: rand() * WORLD,
    y: rand() * WORLD,
    vx: (rand() - 0.5) * 12,
    vy: (rand() - 0.5) * 8,
    phase: rand() * Math.PI * 2,
    r: 1 + rand() * 1.8,
  });
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

const gnome = {
  x: SPAWN.x, y: SPAWN.y,
  facing: 1,          // 1 = right, -1 = left
  walkTime: 0,
  moving: false,
  speed: 170,
};

// Breadcrumb trail of recent gnome positions; cats follow points along it.
const trail = [];
const TRAIL_SPACING = 6;

const cats = [
  { name: 'Frankie', scale: 1.28, overbite: true,  trailDist: 70,  x: SPAWN.x - 50, y: SPAWN.y + 16, facing: 1, walkTime: 0, moving: false, idleTime: 0, tailPhase: 0 },
  { name: 'Pickle',  scale: 1.0,  overbite: false, trailDist: 130, x: SPAWN.x - 90, y: SPAWN.y - 12, facing: 1, walkTime: 0, moving: false, idleTime: 0, tailPhase: 2.1 },
];

let basket = {};
for (const k of MUSHROOM_KINDS) basket[k.name] = 0;
let totalPicked = 0;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const keys = {};
let started = false;
let tapTarget = null;       // world-space destination set by click / touch
const tapRipples = [];      // visual feedback rings

function screenToWorld(clientX, clientY) {
  const cam = cameraPos();
  return { x: clientX + cam.x, y: clientY + cam.y };
}

function handlePointerDown(clientX, clientY) {
  if (!started) started = true;
  tapTarget = screenToWorld(clientX, clientY);
  tapRipples.push({ x: tapTarget.x, y: tapTarget.y, age: 0 });
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  tapTarget = null;
  if (!started) { started = true; }
  if (e.key.toLowerCase() === 'm') toggleAudio();
  if (e.key === ' ' || e.key.toLowerCase() === 'e') tryPick();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  handlePointerDown(e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', (e) => {
  if (!(e.buttons & 1)) return;
  tapTarget = screenToWorld(e.clientX, e.clientY);
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  handlePointerDown(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  tapTarget = screenToWorld(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchend', (e) => { e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------------------
// Ambient audio (procedural, starts only when toggled on with M)
// ---------------------------------------------------------------------------

let audioCtx = null;
let audioOn = false;
let birdTimer = 0;

function toggleAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Gentle wind: looped filtered noise.
    const len = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.045;
    noise.connect(filter).connect(gain).connect(audioCtx.destination);
    noise.start();
  }
  audioOn = !audioOn;
  if (audioOn) audioCtx.resume(); else audioCtx.suspend();
}

function chirp() {
  if (!audioCtx || !audioOn) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  const base = 2200 + Math.random() * 1400;
  osc.frequency.setValueAtTime(base, t);
  osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.16);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}

function pickPop() {
  if (!audioCtx || !audioOn) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(820, t + 0.09);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------

const PICK_RADIUS = 46;
let nearestMushroom = null;
const popups = []; // floating "+1 Red Cap" texts

function tryPick() {
  if (!nearestMushroom) return;
  const m = nearestMushroom;
  m.alive = false;
  m.respawnAt = now + 25 + rand() * 40;
  basket[m.kind.name]++;
  totalPicked++;
  popups.push({ x: m.x, y: m.y - 24, text: '+1 ' + m.kind.name, age: 0, color: m.kind.cap });
  pickPop();
}

function collide(x, y) {
  // Trees block movement (a small circle at the trunk base).
  for (const t of trees) {
    const r = 13 * t.size;
    if (Math.abs(x - t.x) < r + 60 && Math.abs(y - t.y) < r + 60) {
      if (Math.hypot(x - t.x, y - t.y) < r + 10) return true;
    }
  }
  return false;
}

let now = 0;

function update(dt) {
  now += dt;

  // --- gnome movement ---
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  // tap-to-move: steer toward touch/click target when no keys held
  if (dx === 0 && dy === 0 && tapTarget) {
    const tdx = tapTarget.x - gnome.x;
    const tdy = tapTarget.y - gnome.y;
    const td = Math.hypot(tdx, tdy);
    if (td > 8) {
      dx = tdx / td;
      dy = tdy / td;
    } else {
      tapTarget = null;
      tryPick();
    }
  }

  gnome.moving = (dx !== 0 || dy !== 0);
  if (gnome.moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    if (dx !== 0) gnome.facing = dx > 0 ? 1 : -1;
    const nx = Math.min(WORLD - 30, Math.max(30, gnome.x + dx * gnome.speed * dt));
    const ny = Math.min(WORLD - 30, Math.max(30, gnome.y + dy * gnome.speed * dt));
    if (!collide(nx, gnome.y)) gnome.x = nx;
    if (!collide(gnome.x, ny)) gnome.y = ny;
    gnome.walkTime += dt;
  }

  // age tap ripples
  for (let i = tapRipples.length - 1; i >= 0; i--) {
    tapRipples[i].age += dt;
    if (tapRipples[i].age > 0.6) tapRipples.splice(i, 1);
  }

  // --- breadcrumb trail for the cats ---
  const last = trail[0];
  if (!last || Math.hypot(gnome.x - last.x, gnome.y - last.y) > TRAIL_SPACING) {
    trail.unshift({ x: gnome.x, y: gnome.y });
    if (trail.length > 80) trail.pop();
  }

  // --- cats follow ---
  for (const cat of cats) {
    const idx = Math.min(trail.length - 1, Math.round(cat.trailDist / TRAIL_SPACING));
    const target = trail.length ? trail[idx] : { x: gnome.x, y: gnome.y };
    // Slight sideways offset so the two cats don't stack on each other.
    const side = cat === cats[0] ? 14 : -14;
    const tx = target.x + side * 0.6;
    const ty = target.y + side;
    const d = Math.hypot(tx - cat.x, ty - cat.y);
    if (d > 8) {
      const sp = Math.min(d * 4, 200) * dt;
      const mx = ((tx - cat.x) / d) * sp;
      cat.x += mx;
      cat.y += ((ty - cat.y) / d) * sp;
      if (Math.abs(mx) > 0.1) cat.facing = mx > 0 ? 1 : -1;
      cat.moving = true;
      cat.idleTime = 0;
      cat.walkTime += dt;
    } else {
      cat.moving = false;
      cat.idleTime += dt;
    }
    cat.tailPhase += dt * (cat.moving ? 6 : 2.2);
  }

  // --- mushrooms: nearest pickable + respawns ---
  nearestMushroom = null;
  let best = PICK_RADIUS;
  for (const m of mushrooms) {
    if (!m.alive) {
      if (m.respawnAt && now > m.respawnAt) {
        const p = placeAwayFromSpawn(0);
        if (!collide(p.x, p.y)) {
          m.x = p.x; m.y = p.y;
          m.kind = pickKind();
          m.alive = true;
          m.respawnAt = 0;
        }
      }
      continue;
    }
    const d = Math.hypot(m.x - gnome.x, m.y - gnome.y);
    if (d < best) { best = d; nearestMushroom = m; }
  }

  // --- motes drift ---
  for (const p of motes) {
    p.x += (p.vx + Math.sin(now * 0.7 + p.phase) * 8) * dt;
    p.y += (p.vy + Math.cos(now * 0.5 + p.phase) * 6) * dt;
    if (p.x < 0) p.x += WORLD; if (p.x > WORLD) p.x -= WORLD;
    if (p.y < 0) p.y += WORLD; if (p.y > WORLD) p.y -= WORLD;
  }

  // --- popups float and fade ---
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].age += dt;
    popups[i].y -= 28 * dt;
    if (popups[i].age > 1.4) popups.splice(i, 1);
  }

  // --- occasional bird chirp ---
  birdTimer -= dt;
  if (birdTimer <= 0) {
    chirp();
    birdTimer = 3 + Math.random() * 7;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function viewSize() {
  return { w: canvas.width / devicePixelRatio, h: canvas.height / devicePixelRatio };
}

function cameraPos() {
  const { w, h } = viewSize();
  return {
    x: Math.min(Math.max(gnome.x - w / 2, 0), WORLD - w),
    y: Math.min(Math.max(gnome.y - h / 2, 0), WORLD - h),
  };
}

function drawGround(cam) {
  const { w, h } = viewSize();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#4a7c43');
  grad.addColorStop(1, '#3f6f3b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (const g of groundPatches) {
    const sx = g.x - cam.x, sy = g.y - cam.y;
    if (sx < -g.r || sy < -g.r || sx > w + g.r || sy > h + g.r) continue;
    ctx.fillStyle = g.tone > 0.5 ? 'rgba(94,140,76,0.35)' : 'rgba(58,98,52,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, g.r, g.r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrass(cam) {
  const { w, h } = viewSize();
  ctx.lineWidth = 1.6;
  for (const g of grassTufts) {
    const sx = g.x - cam.x, sy = g.y - cam.y;
    if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
    const sway = Math.sin(now * 1.4 + g.phase) * 2.5;
    ctx.strokeStyle = g.shade > 0.5 ? '#5d9450' : '#54874a';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + sway * 0.5, sy - g.h * 0.6, sx + sway, sy - g.h);
    ctx.moveTo(sx + 3, sy);
    ctx.quadraticCurveTo(sx + 3 + sway * 0.4, sy - g.h * 0.5, sx + 3 + sway, sy - g.h * 0.8);
    ctx.stroke();
  }
}

function drawFlower(f, cam) {
  const sx = f.x - cam.x, sy = f.y - cam.y;
  const sway = Math.sin(now * 1.2 + f.phase) * 1.5;
  // stem
  ctx.strokeStyle = '#3e7038';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(sx + sway * 0.5, sy - 5, sx + sway, sy - 9);
  ctx.stroke();
  // petals
  const px = sx + sway, py = sy - 9;
  ctx.fillStyle = f.color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + f.phase;
    ctx.beginPath();
    ctx.ellipse(px + Math.cos(a) * f.size * 0.8, py + Math.sin(a) * f.size * 0.8,
                f.size * 0.62, f.size * 0.42, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f7d24a';
  ctx.beginPath();
  ctx.arc(px, py, f.size * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(t, cam) {
  const sx = t.x - cam.x, sy = t.y - cam.y;
  const s = t.size;
  const sway = Math.sin(now * 0.6 + t.phase) * 2 * s;
  // shadow
  ctx.fillStyle = 'rgba(20,40,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 4, 26 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // trunk
  ctx.fillStyle = t.shade > 0.5 ? '#6b4a2f' : '#5d3f27';
  ctx.beginPath();
  ctx.moveTo(sx - 7 * s, sy);
  ctx.quadraticCurveTo(sx - 4 * s, sy - 40 * s, sx - 3 * s + sway * 0.3, sy - 70 * s);
  ctx.lineTo(sx + 3 * s + sway * 0.3, sy - 70 * s);
  ctx.quadraticCurveTo(sx + 4 * s, sy - 40 * s, sx + 7 * s, sy);
  ctx.closePath();
  ctx.fill();
  // canopy: stacked blobs
  const greens = t.shade > 0.66 ? ['#2e5c33', '#3a7040', '#4a8650']
              : t.shade > 0.33 ? ['#28522e', '#346539', '#427a47']
                               : ['#234a2a', '#2e5c35', '#3b7042'];
  const layers = [
    { ox: 0, oy: -95 * s, r: 38 * s },
    { ox: -22 * s, oy: -75 * s, r: 28 * s },
    { ox: 22 * s, oy: -78 * s, r: 30 * s },
    { ox: 0, oy: -120 * s, r: 26 * s },
  ];
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    ctx.fillStyle = greens[i % greens.length];
    ctx.beginPath();
    ctx.arc(sx + L.ox + sway, sy + L.oy, L.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // highlight
  ctx.fillStyle = 'rgba(255,255,210,0.10)';
  ctx.beginPath();
  ctx.arc(sx - 10 * s + sway, sy - 112 * s, 18 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(r, cam) {
  const sx = r.x - cam.x, sy = r.y - cam.y;
  ctx.fillStyle = 'rgba(20,40,20,0.2)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 3, r.size * 1.1, r.size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = r.shade > 0.5 ? '#8d8d85' : '#7b7b74';
  ctx.beginPath();
  ctx.ellipse(sx, sy - r.size * 0.3, r.size, r.size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(sx - r.size * 0.3, sy - r.size * 0.5, r.size * 0.4, r.size * 0.25, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawMushroom(m, cam, highlight) {
  const sx = m.x - cam.x, sy = m.y - cam.y;
  const s = m.size;
  if (highlight) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 6, 18 + Math.sin(now * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(20,40,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // stem
  ctx.fillStyle = m.kind.stem;
  ctx.beginPath();
  ctx.moveTo(sx - 3.5 * s, sy);
  ctx.quadraticCurveTo(sx - 2.5 * s, sy - 9 * s, sx - 2.5 * s, sy - 11 * s);
  ctx.lineTo(sx + 2.5 * s, sy - 11 * s);
  ctx.quadraticCurveTo(sx + 2.5 * s, sy - 9 * s, sx + 3.5 * s, sy);
  ctx.closePath();
  ctx.fill();
  // cap
  ctx.fillStyle = m.kind.cap;
  ctx.beginPath();
  ctx.moveTo(sx - 10 * s, sy - 10 * s);
  ctx.quadraticCurveTo(sx, sy - 24 * s, sx + 10 * s, sy - 10 * s);
  ctx.quadraticCurveTo(sx, sy - 7 * s, sx - 10 * s, sy - 10 * s);
  ctx.fill();
  if (m.kind.spots) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [ox, oy, r] of [[-4, -14, 1.6], [3, -16, 1.3], [0, -11, 1.1]]) {
      ctx.beginPath();
      ctx.arc(sx + ox * s, sy + oy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGnome(cam) {
  const sx = gnome.x - cam.x, sy = gnome.y - cam.y;
  const bob = gnome.moving ? Math.abs(Math.sin(gnome.walkTime * 9)) * 3 : 0;
  const f = gnome.facing;
  const y = sy - bob;

  // shadow
  ctx.fillStyle = 'rgba(20,40,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 3, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs / boots
  const step = gnome.moving ? Math.sin(gnome.walkTime * 9) * 4 : 0;
  ctx.fillStyle = '#5a3a22';
  ctx.beginPath(); ctx.ellipse(sx - 4 + step * 0.5, sy, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + 4 - step * 0.5, sy, 4, 3, 0, 0, Math.PI * 2); ctx.fill();

  // tunic
  ctx.fillStyle = '#3f6bb5';
  ctx.beginPath();
  ctx.moveTo(sx - 9, y - 2);
  ctx.quadraticCurveTo(sx, y - 26, sx + 9, y - 2);
  ctx.closePath();
  ctx.fill();
  // belt
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(sx - 7, y - 9, 14, 3);
  ctx.fillStyle = '#d9a13b';
  ctx.fillRect(sx - 1.5, y - 9.5, 4, 4);

  // basket on his back side
  ctx.fillStyle = '#a9803f';
  ctx.beginPath();
  ctx.ellipse(sx - f * 10, y - 12, 5.5, 7, f * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7c5c2a';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(sx - f * 10 - 4, y - 12 + i * 3.5);
    ctx.lineTo(sx - f * 10 + 4, y - 12 + i * 3.5);
    ctx.stroke();
  }

  // head
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(sx + f * 2, y - 28, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // beard
  ctx.fillStyle = '#eeeeee';
  ctx.beginPath();
  ctx.moveTo(sx + f * 2 - 7, y - 28);
  ctx.quadraticCurveTo(sx + f * 2, y - 12, sx + f * 2 + 7, y - 28);
  ctx.closePath();
  ctx.fill();
  // nose
  ctx.fillStyle = '#e8a87c';
  ctx.beginPath();
  ctx.arc(sx + f * 7, y - 27, 2.8, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(sx + f * 4, y - 30.5, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // pointy red hat
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(sx + f * 2 - 9, y - 31);
  ctx.quadraticCurveTo(sx + f * 2 - 2, y - 52, sx + f * 8, y - 48);
  ctx.quadraticCurveTo(sx + f * 5, y - 36, sx + f * 2 + 9, y - 31);
  ctx.closePath();
  ctx.fill();
}

function drawCat(cat, cam) {
  const sx = cat.x - cam.x, sy = cat.y - cam.y;
  const s = cat.scale;
  const f = cat.facing;
  const bob = cat.moving ? Math.abs(Math.sin(cat.walkTime * 10)) * 2 * s : 0;
  const y = sy - bob;
  const sitting = !cat.moving && cat.idleTime > 1.2;

  // shadow
  ctx.fillStyle = 'rgba(20,40,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 12 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#161616';

  if (sitting) {
    // seated: upright pear-shaped body
    ctx.beginPath();
    ctx.ellipse(sx, y - 8 * s, 7.5 * s, 9.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // front paws
    ctx.beginPath();
    ctx.ellipse(sx + f * 3 * s, y - 1 * s, 4.5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // walking: horizontal body
    ctx.beginPath();
    ctx.ellipse(sx, y - 6 * s, 11 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    const step = cat.moving ? Math.sin(cat.walkTime * 10) * 3 * s : 0;
    ctx.fillRect(sx - 7 * s + step, y - 4 * s, 2.4 * s, 5 * s);
    ctx.fillRect(sx - 2 * s - step, y - 4 * s, 2.4 * s, 5 * s);
    ctx.fillRect(sx + 2 * s + step, y - 4 * s, 2.4 * s, 5 * s);
    ctx.fillRect(sx + 6 * s - step, y - 4 * s, 2.4 * s, 5 * s);
  }

  // tail: animated curve
  const tw = Math.sin(cat.tailPhase) * 5 * s;
  ctx.strokeStyle = '#161616';
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const tailBaseY = sitting ? y - 4 * s : y - 8 * s;
  ctx.moveTo(sx - f * 9 * s, tailBaseY);
  ctx.quadraticCurveTo(sx - f * 16 * s, tailBaseY - 8 * s + tw * 0.4,
                       sx - f * 14 * s + tw, tailBaseY - 16 * s);
  ctx.stroke();

  // head
  const hx = sx + f * (sitting ? 1 : 9) * s;
  const hy = y - (sitting ? 17 : 11) * s;
  ctx.fillStyle = '#161616';
  ctx.beginPath();
  ctx.arc(hx, hy, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(hx - 5 * s, hy - 3 * s);
  ctx.lineTo(hx - 6.5 * s, hy - 9.5 * s);
  ctx.lineTo(hx - 1 * s, hy - 5.5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 5 * s, hy - 3 * s);
  ctx.lineTo(hx + 6.5 * s, hy - 9.5 * s);
  ctx.lineTo(hx + 1 * s, hy - 5.5 * s);
  ctx.closePath();
  ctx.fill();
  // inner ears
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.moveTo(hx - 4.4 * s, hy - 4 * s);
  ctx.lineTo(hx - 5.4 * s, hy - 8 * s);
  ctx.lineTo(hx - 2 * s, hy - 5.4 * s);
  ctx.closePath();
  ctx.fill();
  // eyes: green, blink occasionally
  const blink = Math.sin(now * 0.9 + cat.tailPhase * 3) > 0.985;
  if (!blink) {
    ctx.fillStyle = '#9fd65a';
    ctx.beginPath(); ctx.ellipse(hx - 2.4 * s + f * 1.2 * s, hy - 0.8 * s, 1.5 * s, 1.9 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 2.4 * s + f * 1.2 * s, hy - 0.8 * s, 1.5 * s, 1.9 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(hx - 2.4 * s + f * 1.2 * s, hy - 0.8 * s, 0.6 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 2.4 * s + f * 1.2 * s, hy - 0.8 * s, 0.6 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#9fd65a';
    ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.moveTo(hx - 3.6 * s, hy - 0.8 * s); ctx.lineTo(hx - 1.2 * s, hy - 0.8 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 1.2 * s, hy - 0.8 * s); ctx.lineTo(hx + 3.6 * s, hy - 0.8 * s); ctx.stroke();
  }
  // muzzle: tiny pink nose
  ctx.fillStyle = '#d98a9c';
  ctx.beginPath();
  ctx.moveTo(hx + f * 1.2 * s - 1 * s, hy + 2 * s);
  ctx.lineTo(hx + f * 1.2 * s + 1 * s, hy + 2 * s);
  ctx.lineTo(hx + f * 1.2 * s, hy + 3.2 * s);
  ctx.closePath();
  ctx.fill();

  // Frankie's overbite: two little white fangs peeking below the chin.
  if (cat.overbite) {
    ctx.fillStyle = '#f5f5f0';
    for (const ox of [-1.6, 1.6]) {
      ctx.beginPath();
      ctx.moveTo(hx + f * 1.2 * s + (ox - 0.8) * s, hy + 3.6 * s);
      ctx.lineTo(hx + f * 1.2 * s + (ox + 0.8) * s, hy + 3.6 * s);
      ctx.lineTo(hx + f * 1.2 * s + ox * s, hy + 6 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  // whiskers
  ctx.strokeStyle = 'rgba(230,230,230,0.7)';
  ctx.lineWidth = 0.7;
  for (const wy of [1.5, 2.8]) {
    ctx.beginPath();
    ctx.moveTo(hx + f * 3 * s, hy + wy * s);
    ctx.lineTo(hx + f * 10 * s, hy + (wy - 1) * s);
    ctx.stroke();
  }
}

function drawTapRipples(cam) {
  for (const r of tapRipples) {
    const sx = r.x - cam.x, sy = r.y - cam.y;
    const t = r.age / 0.6;
    const radius = 6 + t * 22;
    const alpha = (1 - t) * 0.65;
    ctx.strokeStyle = `rgba(255,245,200,${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMotes(cam) {
  const { w, h } = viewSize();
  for (const p of motes) {
    const sx = p.x - cam.x, sy = p.y - cam.y;
    if (sx < -5 || sy < -5 || sx > w + 5 || sy > h + 5) continue;
    const a = 0.35 + Math.sin(now * 2 + p.phase) * 0.25;
    ctx.fillStyle = `rgba(255,250,200,${a})`;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLightShafts(cam) {
  // Soft diagonal light shafts, fixed in world space.
  const { w, h } = viewSize();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const wx = ((i * 700 + 200) - cam.x * 0.9) % (w + 600) - 300;
    const grad = ctx.createLinearGradient(wx, 0, wx + 200, h);
    grad.addColorStop(0, 'rgba(255,245,180,0.05)');
    grad.addColorStop(0.5, 'rgba(255,245,180,0.025)');
    grad.addColorStop(1, 'rgba(255,245,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(wx, 0);
    ctx.lineTo(wx + 120, 0);
    ctx.lineTo(wx + 320, h);
    ctx.lineTo(wx + 140, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawUI() {
  const { w, h } = viewSize();

  // basket panel
  ctx.save();
  ctx.fillStyle = 'rgba(30,40,28,0.75)';
  roundRect(14, 14, 218, 30 + MUSHROOM_KINDS.length * 26, 10);
  ctx.fill();
  ctx.fillStyle = '#f3ead8';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText(`🧺 Basket — ${totalPicked} picked`, 28, 36);
  ctx.font = '13px Georgia, serif';
  let yy = 60;
  for (const k of MUSHROOM_KINDS) {
    ctx.fillStyle = k.cap;
    ctx.beginPath();
    ctx.moveTo(24, yy - 2);
    ctx.quadraticCurveTo(32, yy - 12, 40, yy - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f3ead8';
    ctx.fillText(`${k.name}: ${basket[k.name]}`, 50, yy);
    yy += 26;
  }
  ctx.restore();

  // pick prompt
  if (nearestMushroom) {
    const cam = cameraPos();
    const sx = nearestMushroom.x - cam.x;
    const sy = nearestMushroom.y - cam.y - 38;
    ctx.font = 'bold 13px Georgia, serif';
    const label = 'Tap or Space — pick ' + nearestMushroom.kind.name;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(30,40,28,0.8)';
    roundRect(sx - tw / 2 - 8, sy - 16, tw + 16, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, sx - tw / 2, sy);
  }

  // popups
  ctx.font = 'bold 14px Georgia, serif';
  const cam = cameraPos();
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 1.4);
    ctx.fillStyle = '#fff';
    ctx.fillText(p.text, p.x - cam.x - 20, p.y - cam.y);
    ctx.globalAlpha = 1;
  }

  // intro / help
  if (!started) {
    ctx.fillStyle = 'rgba(20,30,20,0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3ead8';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText('Gnome & the Black Cats', w / 2, h / 2 - 60);
    ctx.font = '17px Georgia, serif';
    ctx.fillText('A quiet walk through the forest, picking mushrooms.', w / 2, h / 2 - 24);
    ctx.fillText('Frankie and Pickle will keep you company.', w / 2, h / 2);
    ctx.font = '15px Georgia, serif';
    ctx.fillText('Tap / click to walk & pick        WASD / arrows — walk        Space — pick        M — sound', w / 2, h / 2 + 44);
    ctx.font = 'italic 14px Georgia, serif';
    ctx.fillText('Tap anywhere or press any key to begin', w / 2, h / 2 + 80);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = 'rgba(243,234,216,0.55)';
    ctx.font = '12px Georgia, serif';
    ctx.fillText('Tap/click to walk & pick · WASD walk · Space pick · M sound' + (audioOn ? ' (on)' : ''), 16, h - 14);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render() {
  const cam = cameraPos();
  const { w, h } = viewSize();

  drawGround(cam);
  drawGrass(cam);

  // flowers behind entities
  for (const f of flowers) {
    const sx = f.x - cam.x, sy = f.y - cam.y;
    if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
    drawFlower(f, cam);
  }

  // y-sorted world objects + characters
  const drawables = [];
  for (const t of trees) {
    if (t.x - cam.x > -120 && t.x - cam.x < w + 120 && t.y - cam.y > -60 && t.y - cam.y < h + 220) {
      drawables.push({ y: t.y, draw: () => drawTree(t, cam) });
    }
  }
  for (const r of rocks) {
    if (r.x - cam.x > -40 && r.x - cam.x < w + 40 && r.y - cam.y > -40 && r.y - cam.y < h + 40) {
      drawables.push({ y: r.y, draw: () => drawRock(r, cam) });
    }
  }
  for (const m of mushrooms) {
    if (!m.alive) continue;
    if (m.x - cam.x > -40 && m.x - cam.x < w + 40 && m.y - cam.y > -40 && m.y - cam.y < h + 40) {
      drawables.push({ y: m.y, draw: () => drawMushroom(m, cam, m === nearestMushroom) });
    }
  }
  drawables.push({ y: gnome.y, draw: () => drawGnome(cam) });
  for (const cat of cats) {
    drawables.push({ y: cat.y, draw: () => drawCat(cat, cam) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  drawTapRipples(cam);
  drawMotes(cam);
  drawLightShafts(cam);
  drawUI();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let lastTime = performance.now();
function frame(t) {
  const dt = Math.min((t - lastTime) / 1000, 0.05);
  lastTime = t;
  if (started) update(dt);
  else now += dt;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
