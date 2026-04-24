const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const statusEl = document.querySelector("#status");

const W = canvas.width;
const H = canvas.height;
const TILE = 48;
const COLS = W / TILE;
const ROWS = H / TILE;
const BASE_SPEED_SCALE = 0.36;
const LEVEL_SPEED_GROWTH = 1.03;
const PLAYER_ACCEL = 0.18;
const PLAYER_MAX_SPEED = 5.8;
const PLAYER_RAMP_PULL = 0.025;
const ENEMY_ACCEL = 0.061;
const ENEMY_RAMP_PULL = 0.014;
const LEVEL_FILES = [
  "levels/level01.txt",
  "levels/level02.txt",
  "levels/level03.txt"
];
const keys = new Set();

const state = {
  score: 0,
  grade: 1,
  lives: 3,
  paused: false,
  gameOver: false,
  levelWon: false,
  loading: true,
  shake: 0,
  flash: 0,
  grid: [],
  beacons: [],
  enemies: [],
  player: makePlayer()
};

function makePlayer() {
  return {
    x: TILE * 1.5,
    y: TILE * 1.5,
    vx: 0,
    vy: 0,
    r: 13,
    invincible: 0
  };
}

const terrainColors = {
  south: "#d8efe4",
  east: "#9fd7bf",
  flat: "#5a9f82",
  west: "#3f7162",
  north: "#1f3833",
  northeast: "#c5e5d6",
  southeast: "#b6e0ca",
  southwest: "#4e8772",
  northwest: "#2b4a42"
};

const slopeAliases = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest"
};

const slopeVectors = {
  north: { x: 0, y: -1 },
  northeast: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  east: { x: 1, y: 0 },
  southeast: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  south: { x: 0, y: 1 },
  southwest: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  west: { x: -1, y: 0 },
  northwest: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
};

function speedScale() {
  return BASE_SPEED_SCALE * Math.pow(LEVEL_SPEED_GROWTH, state.grade - 1);
}

async function startLevel() {
  state.grid = buildGrid(state.grade);
  state.beacons = placeBeacons(state.grade);
  state.enemies = placeEnemies(state.grade);
  state.player = makePlayer();
  state.levelWon = false;
  state.paused = false;
  state.loading = false;
  statusEl.textContent = "Roll over every blinking beacon. Avoid the star cutters.";
  updateHud();
}

function buildGrid(grade) {
  const source = loadedMaps[(grade - 1) % loadedMaps.length];
  const grid = source.map((row) => row.map((tile) => ({ h: tile.h, block: tile.block, slope: tile.slope })));
  grid[1][1].block = false;
  grid[1][2].block = false;
  grid[2][1].block = false;
  return grid;
}

const loadedMaps = [];

async function loadMaps() {
  loadedMaps.length = 0;
  for (const path of LEVEL_FILES) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}: ${response.status}`);
    }
    const text = await response.text();
    loadedMaps.push(parseMap(text, path));
  }
}

function parseMap(text, path) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(";") && !line.startsWith("#"))
    .map((line) => tokenizeMapLine(line));

  if (rows.length !== ROWS) {
    throw new Error(`${path} must have exactly ${ROWS} map rows; got ${rows.length}.`);
  }

  return rows.map((tokens, y) => {
    if (tokens.length !== COLS) {
      throw new Error(`${path} row ${y + 1} must have exactly ${COLS} tiles; got ${tokens.length}.`);
    }

    return tokens.map((token, x) => {
      if (token === "X") return { h: 0, block: true, slope: null };
      if (token === ".") return { h: 0, block: false, slope: null };
      if (/^[0-3]$/.test(token)) return { h: Number(token), block: false, slope: null };
      const match = token.match(/^([1-3])([A-Z]{1,2})$/);
      if (match) {
        const direction = slopeAliases[match[2]];
        if (direction) {
          return { h: Number(match[1]), block: false, slope: direction };
        }
      }
      throw new Error(`${path} row ${y + 1}, col ${x + 1}: invalid tile '${token}'.`);
    });
  });
}

function tokenizeMapLine(line) {
  if (!/\s/.test(line)) {
    return [...line];
  }

  const parts = line.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const part of parts) {
    if (/^[0-3X.]+$/.test(part)) {
      tokens.push(...part);
    } else {
      tokens.push(part);
    }
  }
  return tokens;
}

function placeBeacons(grade) {
  const count = Math.min(18, 7 + grade * 2);
  const beacons = [];
  let guard = 0;
  while (beacons.length < count && guard < 600) {
    guard += 1;
    const x = 2 + Math.floor(Math.random() * (COLS - 4));
    const y = 2 + Math.floor(Math.random() * (ROWS - 4));
    if (state.grid[y][x].block) continue;
    if (beacons.some((b) => Math.hypot(b.tx - x, b.ty - y) < 3)) continue;
    beacons.push({ tx: x, ty: y, x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, on: true });
  }
  return beacons;
}

function placeEnemies(grade) {
  const count = Math.min(6, 1 + Math.floor(grade / 2));
  const enemies = [];
  for (let i = 0; i < count; i += 1) {
    enemies.push({
      x: W - TILE * (1.5 + i % 3),
      y: H - TILE * (1.5 + Math.floor(i / 3)),
      vx: 0,
      vy: 0,
      r: 14,
      spin: Math.random() * Math.PI * 2,
      speed: ENEMY_ACCEL
    });
  }
  return enemies;
}

function tileAt(x, y) {
  const tx = Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE)));
  const ty = Math.max(0, Math.min(ROWS - 1, Math.floor(y / TILE)));
  return state.grid[ty][tx];
}

function heightAt(x, y) {
  const tile = tileAt(x, y);
  if (!tile.slope) return tile.h;

  const tx = Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE)));
  const ty = Math.max(0, Math.min(ROWS - 1, Math.floor(y / TILE)));
  const localX = (x - tx * TILE) / TILE - 0.5;
  const localY = (y - ty * TILE) / TILE - 0.5;
  const vector = slopeVectors[tile.slope];
  const progress = Math.max(0, Math.min(1, 0.5 + localX * vector.x + localY * vector.y));
  return tile.h - 1 + progress;
}

function gridHeight(x, y) {
  const tx = Math.max(0, Math.min(COLS - 1, x));
  const ty = Math.max(0, Math.min(ROWS - 1, y));
  const tile = state.grid[ty][tx];
  if (!tile.slope) return tile.h;
  return tile.h - 0.5;
}

function slopeKindAt(tx, ty) {
  const tile = state.grid[ty][tx];
  if (tile.slope) return tile.slope;

  const left = gridHeight(tx - 1, ty);
  const right = gridHeight(tx + 1, ty);
  const up = gridHeight(tx, ty - 1);
  const down = gridHeight(tx, ty + 1);
  const dx = right - left;
  const dy = down - up;
  const threshold = 0.45;

  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
    return "flat";
  }
  if (Math.abs(dx) >= threshold && Math.abs(dy) >= threshold) {
    if (dx > 0 && dy > 0) return "southeast";
    if (dx > 0 && dy < 0) return "northeast";
    if (dx < 0 && dy > 0) return "southwest";
    return "northwest";
  }
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0 ? "south" : "north";
  }
  return dx > 0 ? "east" : "west";
}

function diagonalSplitAt(tx, ty) {
  const north = ty > 0 ? slopeKindAt(tx, ty - 1) : "flat";
  const south = ty < ROWS - 1 ? slopeKindAt(tx, ty + 1) : "flat";
  const west = tx > 0 ? slopeKindAt(tx - 1, ty) : "flat";
  const east = tx < COLS - 1 ? slopeKindAt(tx + 1, ty) : "flat";

  if (north === "east" && west === "south") return { a: "east", b: "south", axis: "nw-se" };
  if (north === "west" && east === "south") return { a: "west", b: "south", axis: "ne-sw" };
  if (south === "east" && west === "north") return { a: "north", b: "east", axis: "ne-sw" };
  if (south === "west" && east === "north") return { a: "north", b: "west", axis: "nw-se" };
  return null;
}

function drawSlopeTile(px, py, split, kind) {
  if (!split) {
    ctx.fillStyle = terrainColors[kind];
    ctx.fillRect(px, py, TILE, TILE);
    return;
  }

  if (split.axis === "nw-se") {
    ctx.fillStyle = terrainColors[split.a];
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE, py);
    ctx.lineTo(px, py + TILE);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = terrainColors[split.b];
    ctx.beginPath();
    ctx.moveTo(px + TILE, py);
    ctx.lineTo(px + TILE, py + TILE);
    ctx.lineTo(px, py + TILE);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = terrainColors[split.a];
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE, py);
    ctx.lineTo(px + TILE, py + TILE);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = terrainColors[split.b];
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE, py + TILE);
    ctx.lineTo(px, py + TILE);
    ctx.closePath();
    ctx.fill();
  }
}

function wallHit(entity) {
  let bounced = false;
  if (entity.x < entity.r) {
    entity.x = entity.r;
    entity.vx = Math.abs(entity.vx) * 0.72;
    bounced = true;
  }
  if (entity.x > W - entity.r) {
    entity.x = W - entity.r;
    entity.vx = -Math.abs(entity.vx) * 0.72;
    bounced = true;
  }
  if (entity.y < entity.r) {
    entity.y = entity.r;
    entity.vy = Math.abs(entity.vy) * 0.72;
    bounced = true;
  }
  if (entity.y > H - entity.r) {
    entity.y = H - entity.r;
    entity.vy = -Math.abs(entity.vy) * 0.72;
    bounced = true;
  }
  return bounced;
}

function blockCollide(entity, oldX, oldY) {
  const tile = tileAt(entity.x, entity.y);
  if (!tile.block) return;
  entity.x = oldX;
  entity.y = oldY;
  entity.vx *= -0.42;
  entity.vy *= -0.42;
}

function slopeForce(entity, amount) {
  const tile = tileAt(entity.x, entity.y);
  if (tile.slope) {
    const vector = slopeVectors[tile.slope];
    entity.vx -= vector.x * amount;
    entity.vy -= vector.y * amount;
    return;
  }
  const left = heightAt(entity.x - TILE * 0.46, entity.y);
  const right = heightAt(entity.x + TILE * 0.46, entity.y);
  const up = heightAt(entity.x, entity.y - TILE * 0.46);
  const down = heightAt(entity.x, entity.y + TILE * 0.46);
  entity.vx += (left - right) * amount;
  entity.vy += (up - down) * amount;
}

function updatePlayer() {
  const p = state.player;
  const oldX = p.x;
  const oldY = p.y;
  let ax = 0;
  let ay = 0;

  if (keys.has("arrowleft") || keys.has("a")) ax -= PLAYER_ACCEL;
  if (keys.has("arrowright") || keys.has("d")) ax += PLAYER_ACCEL;
  if (keys.has("arrowup") || keys.has("w")) ay -= PLAYER_ACCEL;
  if (keys.has("arrowdown") || keys.has("s")) ay += PLAYER_ACCEL;

  const scale = speedScale();
  ax *= scale;
  ay *= scale;
  slopeForce(p, PLAYER_RAMP_PULL * scale);
  p.vx = (p.vx + ax) * 0.982;
  p.vy = (p.vy + ay) * 0.982;
  const max = PLAYER_MAX_SPEED * scale;
  const mag = Math.hypot(p.vx, p.vy);
  if (mag > max) {
    p.vx = (p.vx / mag) * max;
    p.vy = (p.vy / mag) * max;
  }
  p.x += p.vx;
  p.y += p.vy;
  wallHit(p);
  blockCollide(p, oldX, oldY);
  p.invincible = Math.max(0, p.invincible - 1);
}

function updateEnemies() {
  const p = state.player;
  const scale = speedScale();
  for (const e of state.enemies) {
    const oldX = e.x;
    const oldY = e.y;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    slopeForce(e, ENEMY_RAMP_PULL * scale);
    e.vx = (e.vx + (dx / dist) * e.speed * scale) * 0.99;
    e.vy = (e.vy + (dy / dist) * e.speed * scale) * 0.99;
    e.x += e.vx;
    e.y += e.vy;
    e.spin += 0.12 + Math.hypot(e.vx, e.vy) * 0.03;
    if (wallHit(e)) e.spin += 0.7;
    blockCollide(e, oldX, oldY);
    if (p.invincible <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r - 3) {
      loseLife();
      break;
    }
  }
}

function collectBeacons() {
  let collected = false;
  for (const b of state.beacons) {
    if (!b.on) continue;
    if (Math.hypot(state.player.x - b.x, state.player.y - b.y) < state.player.r + 12) {
      b.on = false;
      state.score += 100 + state.grade * 10;
      state.flash = 8;
      collected = true;
    }
  }
  if (collected) updateHud();
  if (state.beacons.every((b) => !b.on) && !state.levelWon) {
    state.levelWon = true;
    state.score += 1000 + state.grade * 250;
    state.grade += 1;
    statusEl.textContent = "Grade clear. The next board is waking up.";
    updateHud();
    window.setTimeout(startLevel, 1100);
  }
}

function loseLife() {
  state.lives -= 1;
  state.shake = 16;
  updateHud();
  if (state.lives <= 0) {
    state.gameOver = true;
    statusEl.textContent = "Game over. Press Space to roll again.";
  } else {
    statusEl.textContent = "Watch the star cutters. Keep rolling.";
    state.player = makePlayer();
    state.player.invincible = 110;
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score).padStart(5, "0");
  levelEl.textContent = String(state.grade);
  livesEl.textContent = String(state.lives);
}

function update() {
  if (state.loading || state.paused || state.gameOver || state.levelWon) return;
  updatePlayer();
  updateEnemies();
  collectBeacons();
  state.flash = Math.max(0, state.flash - 1);
  state.shake = Math.max(0, state.shake - 1);
}

function drawGrid() {
  ctx.fillStyle = "#050708";
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const tile = state.grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (tile.block) {
        ctx.fillStyle = "#111";
        ctx.fillRect(px, py, TILE, TILE);
      } else {
        const kind = slopeKindAt(x, y);
        const split = kind === "flat" ? diagonalSplitAt(x, y) : null;
        drawSlopeTile(px, py, split, kind);
      }

      ctx.strokeStyle = "rgba(255,255,255,.09)";
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);

      if (tile.h > 0 && !tile.block) {
        ctx.fillStyle = "rgba(255,255,255,.08)";
        ctx.fillRect(px + 4, py + 4, TILE - 8, 3);
        ctx.fillStyle = "rgba(0,0,0,.20)";
        ctx.fillRect(px + 4, py + TILE - 7, TILE - 8, 3);
      }

      if (tile.block) {
        ctx.fillStyle = "#56636b";
        ctx.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
        ctx.fillStyle = "#20272d";
        ctx.fillRect(px + 14, py + 14, TILE - 28, TILE - 28);
      }
    }
  }
}

function drawBeacons(time) {
  for (const b of state.beacons) {
    if (!b.on) {
      ctx.fillStyle = "#161b1d";
      ctx.fillRect(b.x - 8, b.y - 8, 16, 16);
      continue;
    }
    const pulse = Math.sin(time / 95 + b.tx) > 0;
    ctx.fillStyle = pulse ? "#ff3348" : "#7a1520";
    ctx.beginPath();
    ctx.arc(b.x, b.y, pulse ? 12 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd0d5";
    ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
  }
}

function drawPlayer(time) {
  const p = state.player;
  if (p.invincible > 0 && Math.floor(time / 80) % 2 === 0) return;
  const shineX = -p.vx * 0.8 - 4;
  const shineY = -p.vy * 0.8 - 5;

  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(p.x + 4, p.y + 11, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(p.x + shineX, p.y + shineY, 2, p.x, p.y, p.r + 3);
  grad.addColorStop(0, "#f6fbff");
  grad.addColorStop(0.38, "#7fd7ff");
  grad.addColorStop(1, "#1e5cc9");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#dff7ff";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawStar(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.spin);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(4, 12, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? enemy.r + 6 : enemy.r * 0.55;
    const a = (Math.PI * 2 * i) / 10;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#7cff5f";
  ctx.fill();
  ctx.strokeStyle = "#163d1d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#d7ffd0";
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
}

function drawOverlay() {
  if (state.loading) {
    ctx.fillStyle = "rgba(0, 0, 0, .72)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f4d35e";
    ctx.font = "700 34px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("LOADING MAPS", W / 2, H / 2 - 8);
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "700 16px Courier New";
    ctx.fillText("USE A LOCAL SERVER", W / 2, H / 2 + 26);
    return;
  }

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${state.flash / 42})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state.paused || state.gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, .66)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f4d35e";
    ctx.font = "700 42px Courier New";
    ctx.textAlign = "center";
    ctx.fillText(state.gameOver ? "GAME OVER" : "PAUSED", W / 2, H / 2 - 12);
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "700 18px Courier New";
    ctx.fillText(state.gameOver ? "PRESS SPACE" : "PRESS P", W / 2, H / 2 + 28);
  }
}

function draw(time) {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawGrid();
  drawBeacons(time);
  for (const e of state.enemies) drawStar(e);
  drawPlayer(time);
  ctx.restore();
  drawOverlay();
}

function loop(time) {
  update();
  draw(time);
  requestAnimationFrame(loop);
}

function restartGame() {
  state.score = 0;
  state.grade = 1;
  state.lives = 3;
  state.gameOver = false;
  state.loading = true;
  startLevel().catch(handleLoadError);
}

function handleLoadError(error) {
  state.loading = true;
  state.paused = true;
  state.gameOver = true;
  const message = String(error && error.message ? error.message : error);
  if (/fetch|load/i.test(message)) {
    statusEl.textContent = "Map load error. Run serve.cmd, then open http://127.0.0.1:8123/";
  } else {
    statusEl.textContent = `Map load error: ${message}`;
  }
  console.error(error);
}

async function initGame() {
  try {
    await loadMaps();
    await startLevel();
  } catch (error) {
    handleLoadError(error);
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }
  if (key === "p") {
    state.paused = !state.paused;
    statusEl.textContent = state.paused ? "Paused." : "Roll over every blinking beacon. Avoid the star cutters.";
  } else if (key === " " && state.gameOver) {
    restartGame();
  } else {
    keys.add(key);
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  steerFromPointer(event);
});

canvas.addEventListener("pointermove", steerFromPointer);
canvas.addEventListener("pointerup", () => {
  keys.delete("arrowleft");
  keys.delete("arrowright");
  keys.delete("arrowup");
  keys.delete("arrowdown");
});

function setKey(key, active) {
  if (active) keys.add(key);
  else keys.delete(key);
}

function steerFromPointer(event) {
  if (event.buttons === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  const y = ((event.clientY - rect.top) / rect.height) * H;
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  setKey("arrowleft", dx < -12);
  setKey("arrowright", dx > 12);
  setKey("arrowup", dy < -12);
  setKey("arrowdown", dy > 12);
}

initGame();
requestAnimationFrame(loop);
