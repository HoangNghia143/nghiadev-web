const PLAYER_COUNT = 50;

const NAMES = [
  "Mai", "Huy", "Linh", "An", "Bảo", "Chi", "Dũng", "Em", "Phúc", "Giang",
  "Hà", "Khoa", "Lan", "Minh", "Nam", "Oanh", "Phương", "Quân", "My", "Sơn",
  "Tâm", "Uyên", "Vỹ", "Yến", "Ánh", "Bình", "Cường", "Đạt", "Hạnh", "Khánh",
  "Long", "Ngọc", "Phát", "Quỳnh", "Trang", "Tuấn", "Vy", "Xuân", "Hùng", "Thảo",
  "Kiên", "Nhung", "Phong", "Trâm", "Vinh", "Hoa", "Lộc", "Nhi", "Thành", "Diễm",
];

const PALETTE = [
  ["#ffb4d9", "#6ecbff"],
  ["#ffe07a", "#7ad38a"],
  ["#c9a7ff", "#ff8a4a"],
  ["#9be7ff", "#f46aa0"],
  ["#ffd0a8", "#5ad0c6"],
  ["#f8a5ff", "#7aa2ff"],
  ["#ff9e9e", "#7cffb2"],
  ["#d4ff8a", "#8ab4ff"],
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const form = document.getElementById("add-form");
const nameInput = document.getElementById("name-input");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const hint = document.getElementById("hint");
const statusEl = document.getElementById("status");
const rosterEl = document.getElementById("roster");
const result = document.getElementById("result");
const resultName = document.getElementById("result-name");
const resultText = document.getElementById("result-text");
const againBtn = document.getElementById("again-btn");

const world = { w: 100, d: 100 };
let players = [];
let boss;
let selectedId = 1;
let phase = "idle";
let huntTimer = 0;
let scanIndex = 0;
let victimId = null;
let shake = 0;
let particles = [];
let lastTime = 0;
let runningHunt = false;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function hashName(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function project(x, z) {
  const padX = 70;
  const top = 118;
  const groundH = canvas.height - top - 36;
  const depth = z / world.d;
  const scaleX = 0.42 + depth * 0.52;
  const sx = canvas.width / 2 + ((x - world.w / 2) / world.w) * (canvas.width - padX * 2) * scaleX;
  const sy = top + depth * groundH;
  const scale = 0.38 + depth * 0.9;
  return { sx, sy, scale, depth };
}

function spawnPlayer(i) {
  const name = NAMES[i];
  const colors = PALETTE[hashName(name) % PALETTE.length];
  const col = i % 10;
  const row = Math.floor(i / 10);
  return {
    id: i + 1,
    name,
    hair: colors[0],
    shirt: colors[1],
    x: 12 + col * 6.2 + rand(-1.2, 1.2),
    z: 28 + row * 12 + rand(-2, 2),
    tx: 0,
    tz: 0,
    facing: 1,
    walk: rand(0, Math.PI * 2),
    speed: rand(6.5, 10.5),
    hit: 0,
    flee: 0,
    marked: 0,
  };
}

function spawnBoss() {
  return {
    x: 82,
    z: 62,
    tx: 82,
    tz: 55,
    facing: -1,
    walk: 0,
    speed: 9,
    charge: 0,
  };
}

function clampUnit(unit) {
  unit.x = Math.max(6, Math.min(94, unit.x));
  unit.z = Math.max(16, Math.min(96, unit.z));
}

function newWanderTarget(unit, zone) {
  unit.tx = rand(zone.x0, zone.x1);
  unit.tz = rand(zone.z0, zone.z1);
}

function resetField() {
  players = Array.from({ length: PLAYER_COUNT }, (_, i) => spawnPlayer(i));
  boss = spawnBoss();
  players.forEach((p) => newWanderTarget(p, { x0: 8, x1: 68, z0: 22, z1: 94 }));
  newWanderTarget(boss, { x0: 70, x1: 92, z0: 30, z1: 88 });
  selectedId = 1;
  phase = "idle";
  huntTimer = 0;
  scanIndex = 0;
  victimId = null;
  runningHunt = false;
  particles = [];
  startBtn.disabled = false;
  renderRoster();
  statusEl.textContent = "50 chiến binh đang tuần tra. Boss đang dạo quanh.";
}

function playerById(id) {
  return players.find((p) => p.id === id);
}

function renderRoster() {
  rosterEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = String(p.id);
    btn.className = p.id === selectedId ? "selected" : "";
    btn.innerHTML = `<span class="idx">#${String(p.id).padStart(2, "0")}</span>${escapeHtml(p.name)}`;
    btn.addEventListener("click", () => {
      selectedId = p.id;
      renderRoster();
      hint.textContent = `Đang chọn ${p.name}. Nhập tên mới rồi bấm Đặt tên.`;
      nameInput.focus();
    });
    li.appendChild(btn);
    rosterEl.appendChild(li);
  }
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function moveToward(unit, dt, speedMul) {
  const dx = unit.tx - unit.x;
  const dz = unit.tz - unit.z;
  const dist = Math.hypot(dx, dz) || 1;
  const step = unit.speed * speedMul * dt;
  if (dist < 1.2) return false;
  unit.x += (dx / dist) * step;
  unit.z += (dz / dist) * step;
  unit.facing = dx >= 0 ? 1 : -1;
  unit.walk += dt * (8 + speedMul * 6);
  clampUnit(unit);
  return true;
}

function addBurst(x, z, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      z,
      vx: rand(-18, 18),
      vz: rand(-10, 10),
      life: rand(0.25, 0.7),
      max: 0.7,
      color,
      size: rand(1.5, 4),
    });
  }
}

function startHunt() {
  if (runningHunt) return;
  runningHunt = true;
  phase = "scan";
  huntTimer = 0;
  scanIndex = 0;
  victimId = players[Math.floor(Math.random() * players.length)].id;
  players.forEach((p) => {
    p.hit = 0;
    p.flee = 0;
    p.marked = 0;
  });
  startBtn.disabled = true;
  result.classList.add("hidden");
  statusEl.textContent = "Boss đang dòm ngó đám đông...";
}

function update(dt) {
  shake = Math.max(0, shake - dt * 18);

  if (phase === "idle") {
    for (const p of players) {
      if (!moveToward(p, dt, 1)) {
        newWanderTarget(p, { x0: 8, x1: 68, z0: 22, z1: 94 });
      }
    }
    if (!moveToward(boss, dt, 1.15)) {
      newWanderTarget(boss, { x0: 70, x1: 92, z0: 28, z1: 90 });
    }
  }

  if (phase === "scan") {
    huntTimer += dt;
    for (const p of players) {
      if (!moveToward(p, dt, 0.55)) {
        newWanderTarget(p, { x0: 10, x1: 66, z0: 24, z1: 92 });
      }
      p.marked = 0;
    }
    const pulse = Math.floor(huntTimer * 9) % PLAYER_COUNT;
    scanIndex = pulse;
    players[pulse].marked = 1;
    if (!moveToward(boss, dt, 1.4)) {
      newWanderTarget(boss, { x0: 60, x1: 90, z0: 30, z1: 88 });
    }
    if (huntTimer > 2.4) {
      phase = "lock";
      huntTimer = 0;
      const v = playerById(victimId);
      statusEl.textContent = `Mục tiêu: ${v.name}! Boss lao tới.`;
      v.marked = 2;
    }
  }

  if (phase === "lock" || phase === "charge") {
    const v = playerById(victimId);
    huntTimer += dt;
    if (phase === "lock" && huntTimer > 0.45) {
      phase = "charge";
      boss.speed = 38;
    }
    boss.tx = v.x + 3.2;
    boss.tz = v.z + 1.4;
    moveToward(boss, dt, phase === "charge" ? 1.8 : 1.1);
    for (const p of players) {
      if (p.id === victimId) {
        p.marked = 2;
        continue;
      }
      const dx = p.x - boss.x;
      const dz = p.z - boss.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist < 22) {
        p.tx = p.x + (dx / dist) * 18;
        p.tz = p.z + (dz / dist) * 12;
        moveToward(p, dt, 2.4);
      } else if (!moveToward(p, dt, 1.3)) {
        newWanderTarget(p, { x0: 6, x1: 72, z0: 18, z1: 96 });
      }
    }
    if (phase === "charge" && Math.hypot(boss.x - v.x, boss.z - v.z) < 7) {
      phase = "hit";
      huntTimer = 0;
      v.hit = 1;
      v.tx = v.x - 10;
      v.tz = v.z - 4;
      shake = 7;
      addBurst(v.x, v.z, "#fff3a0", 18);
      addBurst(v.x, v.z, "#ff5a3a", 10);
      statusEl.textContent = `${v.name} bị quái vật tấn công!`;
      boss.speed = 9;
    }
  }

  if (phase === "hit") {
    huntTimer += dt;
    const v = playerById(victimId);
    moveToward(v, dt, 2.8);
    v.walk += dt * 20;
    for (const p of players) {
      if (p.id === victimId) continue;
      if (!moveToward(p, dt, 1.8)) {
        newWanderTarget(p, { x0: 6, x1: 70, z0: 18, z1: 96 });
      }
    }
    if (huntTimer > 1.05 && result.classList.contains("hidden")) {
      resultName.textContent = v.name;
      resultText.textContent = `${v.name} (#${String(v.id).padStart(2, "0")}) đã bị Boss chọn giữa 50 người.`;
      result.classList.remove("hidden");
      runningHunt = false;
      startBtn.disabled = false;
      phase = "idle";
      boss.speed = 9;
    }
  }

  for (const pt of particles) {
    pt.x += pt.vx * dt;
    pt.z += pt.vz * dt;
    pt.life -= dt;
  }
  particles = particles.filter((pt) => pt.life > 0);
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

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#1a1033");
  g.addColorStop(0.42, "#2a1844");
  g.addColorStop(1, "#1b1018");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % canvas.width;
    const y = 12 + (i * 37) % 90;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.beginPath();
  ctx.arc(canvas.width - 160, 58, 26, 0, Math.PI * 2);
  ctx.fillStyle = "#f7e7b0";
  ctx.fill();
  ctx.shadowColor = "#f7e7b0";
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;

  const top = 118;
  const bottom = canvas.height - 28;
  ctx.beginPath();
  ctx.moveTo(90, top);
  ctx.lineTo(canvas.width - 90, top);
  ctx.lineTo(canvas.width - 18, bottom);
  ctx.lineTo(18, bottom);
  ctx.closePath();
  const dirt = ctx.createLinearGradient(0, top, 0, bottom);
  dirt.addColorStop(0, "#3a2450");
  dirt.addColorStop(0.55, "#4a2e28");
  dirt.addColorStop(1, "#2a1812");
  ctx.fillStyle = dirt;
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 210, 140, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const y = top + (bottom - top) * t;
    const inset = 90 - 72 * t;
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.lineTo(canvas.width - inset, y);
    ctx.stroke();
  }
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    ctx.beginPath();
    ctx.moveTo(90 + (canvas.width - 180) * t, top);
    ctx.lineTo(18 + (canvas.width - 36) * t, bottom);
    ctx.stroke();
  }
}

function drawShadow(sx, sy, scale, w) {
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 11 * scale * w, 4.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(p) {
  const { sx, sy, scale } = project(p.x, p.z);
  const bob = Math.sin(p.walk) * 2.4 * scale;
  const leg = Math.sin(p.walk) * 3.2 * scale;
  ctx.save();
  ctx.translate(sx, sy);
  if (p.hit) ctx.rotate(-0.55);
  drawShadow(0, 0, scale, 1);
  ctx.scale(p.facing, 1);

  ctx.fillStyle = "#3d2a1f";
  ctx.fillRect(-6 * scale, -10 * scale + bob, 4 * scale, 11 * scale + leg);
  ctx.fillRect(1 * scale, -10 * scale + bob, 4 * scale, 11 * scale - leg);

  roundRect(-8 * scale, -28 * scale + bob, 16 * scale, 18 * scale, 3 * scale);
  ctx.fillStyle = p.shirt;
  ctx.fill();

  roundRect(-7 * scale, -42 * scale + bob, 14 * scale, 14 * scale, 4 * scale);
  ctx.fillStyle = "#ffd8b5";
  ctx.fill();

  roundRect(-8 * scale, -47 * scale + bob, 16 * scale, 8 * scale, 4 * scale);
  ctx.fillStyle = p.hair;
  ctx.fill();

  ctx.fillStyle = "#1a1020";
  ctx.fillRect(-3.5 * scale, -36 * scale + bob, 2.2 * scale, 2.2 * scale);
  ctx.fillRect(1.2 * scale, -36 * scale + bob, 2.2 * scale, 2.2 * scale);

  if (p.marked === 1) {
    ctx.strokeStyle = "#f4c45a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 14 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.marked === 2 || p.id === selectedId) {
    ctx.strokeStyle = p.marked === 2 ? "#ff4d4d" : "#9be7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 15 * scale, 5.4 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (p.id === selectedId || p.marked || p.hit) {
    ctx.scale(p.facing, 1);
    ctx.font = `700 ${Math.max(10, 11 * scale)}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe9b0";
    ctx.fillText(p.name, 0, -52 * scale + bob);
  }
  ctx.restore();
}

function drawBoss() {
  const { sx, sy, scale } = project(boss.x, boss.z);
  const s = scale * 1.55;
  const bob = Math.sin(boss.walk) * 3 * s;
  ctx.save();
  ctx.translate(sx, sy);
  drawShadow(0, 0, s, 1.35);
  ctx.scale(boss.facing, 1);

  ctx.fillStyle = "#e8d38a";
  ctx.beginPath();
  ctx.moveTo(-18 * s, -52 * s + bob);
  ctx.lineTo(-10 * s, -70 * s + bob);
  ctx.lineTo(-4 * s, -50 * s + bob);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4 * s, -50 * s + bob);
  ctx.lineTo(10 * s, -70 * s + bob);
  ctx.lineTo(18 * s, -52 * s + bob);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -32 * s + bob, 28 * s, 24 * s, 0, 0, Math.PI * 2);
  const slime = ctx.createRadialGradient(-8 * s, -42 * s + bob, 6 * s, 0, -30 * s, 30 * s);
  slime.addColorStop(0, "#9dff8a");
  slime.addColorStop(0.6, "#1f8a32");
  slime.addColorStop(1, "#0b3f16");
  ctx.fillStyle = slime;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#08210c";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-9 * s, -36 * s + bob, 6 * s, 0, Math.PI * 2);
  ctx.arc(9 * s, -36 * s + bob, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1020";
  ctx.beginPath();
  ctx.arc(-7 * s, -35 * s + bob, 3 * s, 0, Math.PI * 2);
  ctx.arc(11 * s, -35 * s + bob, 3 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#08210c";
  roundRect(-8 * s, -22 * s + bob, 16 * s, 8 * s, 4 * s);
  ctx.fill();

  ctx.scale(boss.facing, 1);
  ctx.font = `700 ${Math.max(11, 12 * s)}px Nunito, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#9dff9a";
  ctx.fillText("BOSS", 0, -78 * s + bob);
  ctx.restore();
}

function drawParticles() {
  for (const pt of particles) {
    const { sx, sy, scale } = project(pt.x, pt.z);
    ctx.globalAlpha = pt.life / pt.max;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(sx, sy - 20 * scale, pt.size * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawBackground();
  const sprites = [
    ...players.map((p) => ({ z: p.z, kind: "p", p })),
    { z: boss.z, kind: "b" },
  ].sort((a, b) => a.z - b.z);
  for (const s of sprites) {
    if (s.kind === "p") drawPlayer(s.p);
    else drawBoss();
  }
  drawParticles();
  ctx.restore();
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0.016);
  lastTime = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim().replace(/\s+/g, " ");
  if (!name) return;
  const taken = players.some(
    (p) => p.id !== selectedId && p.name.toLowerCase() === name.toLowerCase()
  );
  if (taken) {
    statusEl.textContent = `${name} đã có trên sân.`;
    return;
  }
  const p = playerById(selectedId);
  p.name = name;
  const colors = PALETTE[hashName(name) % PALETTE.length];
  p.hair = colors[0];
  p.shirt = colors[1];
  statusEl.textContent = `#${String(p.id).padStart(2, "0")} giờ là ${name}.`;
  nameInput.value = "";
  selectedId = Math.min(PLAYER_COUNT, selectedId + 1);
  renderRoster();
  const next = rosterEl.querySelector(`[data-id="${selectedId}"]`);
  if (next) next.scrollIntoView({ block: "nearest" });
});

startBtn.addEventListener("click", startHunt);
resetBtn.addEventListener("click", () => {
  if (runningHunt) return;
  const kept = players.map((p) => p.name);
  resetField();
  players.forEach((p, i) => {
    p.name = kept[i];
    const colors = PALETTE[hashName(p.name) % PALETTE.length];
    p.hair = colors[0];
    p.shirt = colors[1];
  });
  renderRoster();
  statusEl.textContent = "Đã xáo vị trí. Tên vẫn giữ nguyên.";
});

againBtn.addEventListener("click", () => {
  result.classList.add("hidden");
  const v = playerById(victimId);
  if (v) v.hit = 0;
  players.forEach((p) => {
    p.marked = 0;
  });
  statusEl.textContent = "Sẵn sàng cho lượt mới. 50 người vẫn đang đi trên sân.";
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  let best = null;
  let bestD = 28;
  for (const p of players) {
    const pr = project(p.x, p.z);
    const d = Math.hypot(pr.sx - x, pr.sy - 24 * pr.scale - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best) {
    selectedId = best.id;
    renderRoster();
    hint.textContent = `Đang chọn ${best.name}. Nhập tên mới rồi bấm Đặt tên.`;
  }
});

resetField();
requestAnimationFrame(loop);
