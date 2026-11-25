'use strict';
/*
 * Desa Sambangan 3D — Server (Tahap 1)
 * HTTP statis + API register/login + WebSocket multiplayer + simulasi warga NPC.
 * Hanya memakai node:http/crypto bawaan dan paket `ws`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3210;
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const USERS_FILE = path.join(ROOT, 'users.json');
const VILLAGE_FILE = path.join(ROOT, 'village.json');

// ---------------------------------------------------------------- pengguna
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
const users = loadUsers();
const sessions = new Map(); // token -> username

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// ---------------------------------------------------------------- data desa
let village = { roads: [], landmarks: [] };
try {
  village = JSON.parse(fs.readFileSync(VILLAGE_FILE, 'utf8'));
} catch (e) {
  console.error('Gagal membaca village.json:', e.message);
}
// Titik-titik jalan untuk navigasi NPC
const roadPoints = [];
for (const r of village.roads || []) {
  for (const p of r.p || []) {
    // hanya titik di sekitar area inti desa
    if (p[0] > -420 && p[0] < 620 && p[1] > -420 && p[1] < 980) roadPoints.push(p);
  }
}
const landmarkPoints = (village.landmarks || []).map((l) => [l.x, l.z]);

// ---------------------------------------------------------------- HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) reject(new Error('body terlalu besar'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

async function handleApi(req, res, url) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metode tidak didukung' });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  const username = String(body.username || '');
  const password = String(body.password || '');

  if (url.pathname === '/api/register') {
    if (!USERNAME_RE.test(username)) {
      return sendJson(res, 400, { error: 'Nama pengguna harus 3–16 karakter (huruf, angka, atau _).' });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { error: 'Kata sandi minimal 6 karakter.' });
    }
    if (users[username]) {
      return sendJson(res, 409, { error: 'Nama pengguna sudah dipakai.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    users[username] = { salt, hash: hashPassword(password, salt), createdAt: Date.now() };
    saveUsers(users);
    return sendJson(res, 200, { ok: true, message: 'Pendaftaran berhasil, silakan masuk.' });
  }

  if (url.pathname === '/api/login') {
    const u = users[username];
    if (!u) return sendJson(res, 401, { error: 'Nama pengguna atau kata sandi salah.' });
    const candidate = Buffer.from(hashPassword(password, u.salt), 'hex');
    const stored = Buffer.from(u.hash, 'hex');
    if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) {
      return sendJson(res, 401, { error: 'Nama pengguna atau kata sandi salah.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, username);
    return sendJson(res, 200, { ok: true, token, username });
  }

  return sendJson(res, 404, { error: 'Endpoint tidak ditemukan' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => sendJson(res, 500, { error: e.message }));
    return;
  }
  if (url.pathname === '/village.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    fs.createReadStream(VILLAGE_FILE).pipe(res);
    return;
  }
  // berkas statis: hanya daftar putih yang boleh terlayani
  const STATIC_OK = ['/', '/index.html', '/style.css', '/game.js'];
  if (!STATIC_OK.includes(url.pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Tidak ditemukan');
  }
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  rel = rel.replace(/\.\.+/g, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Terlarang');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Tidak ditemukan');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- permainan
const WORLD = { minX: -380, maxX: 580, minZ: -380, maxZ: 930 };
const clampWorld = (v, a, b) => Math.max(a, Math.min(b, v));

const players = new Map(); // id -> {id,name,x,z,rot,anim,npc,ws}
let nextId = 1;

function spawnPos() {
  return { x: +(Math.random() * 10 - 5).toFixed(1), z: +(8 + Math.random() * 5).toFixed(1) };
}

// --- NPC warga ---
const NPC_NAMES = [
  'Pak Haji Rahman', 'Bu Siti', 'Andi', 'Bu Ratna', 'Pak Budi',
  'Dewi', 'Pak Slamet', 'Rina', 'Joko', 'Bu Aminah',
];
const npcs = [];
function npcPickTarget(npc) {
  if (Math.random() < 0.22 && landmarkPoints.length) {
    const lm = landmarkPoints[Math.floor(Math.random() * landmarkPoints.length)];
    // berhenti sedikit di depan landmark, bukan tepat di titiknya
    return { x: lm[0] + (Math.random() * 8 - 4), z: lm[1] + 8 + Math.random() * 5 };
  }
  if (roadPoints.length) {
    // pilih titik jalan dalam radius wajar dari posisi NPC sekarang
    for (let i = 0; i < 12; i++) {
      const p = roadPoints[Math.floor(Math.random() * roadPoints.length)];
      const dx = p[0] - npc.x, dz = p[1] - npc.z;
      if (dx * dx + dz * dz < 320 * 320) return { x: p[0], z: p[1] };
    }
    const p = roadPoints[Math.floor(Math.random() * roadPoints.length)];
    return { x: p[0], z: p[1] };
  }
  return { x: Math.random() * 100 - 50, z: Math.random() * 100 - 50 };
}
for (const name of NPC_NAMES) {
  const s = spawnPos();
  const npc = {
    id: 'npc' + nextId++, name, x: s.x + (Math.random() * 60 - 30), z: s.z + (Math.random() * 60 - 30),
    rot: 0, anim: 'idle', npc: true, target: null, pauseUntil: 0, speed: 1.1 + Math.random() * 0.6,
  };
  npc.target = npcPickTarget(npc);
  npcs.push(npc);
  players.set(npc.id, npc);
}
function tickNpcs(now) {
  for (const npc of npcs) {
    if (now < npc.pauseUntil) { npc.anim = 'idle'; continue; }
    const dx = npc.target.x - npc.x, dz = npc.target.z - npc.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      npc.anim = 'idle';
      npc.pauseUntil = now + 2000 + Math.random() * 5000;
      npc.target = npcPickTarget(npc);
      continue;
    }
    const step = npc.speed * 0.1; // tick 100 ms
    npc.x += (dx / dist) * Math.min(step, dist);
    npc.z += (dz / dist) * Math.min(step, dist);
    npc.rot = Math.atan2(dx, dz);
    npc.anim = 'walk';
  }
}

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server });

function broadcast(obj, exceptWs) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client !== exceptWs && client.readyState === 1 && client._joined) {
      client.send(msg);
    }
  }
}
function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client._joined) client.send(msg);
  }
}
function systemChat(text) {
  broadcastAll({ type: 'chat', from: '— sistem —', text, ts: Date.now(), system: true });
}

wss.on('connection', (ws) => {
  ws._joined = false;
  ws._playerId = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === 'join') {
      const username = sessions.get(String(m.token || ''));
      if (!username) {
        ws.send(JSON.stringify({ type: 'error', message: 'Sesi tidak valid, silakan masuk lagi.' }));
        ws.close();
        return;
      }
      const s = spawnPos();
      const p = {
        id: 'p' + nextId++, name: username,
        x: s.x, z: s.z, rot: 0, anim: 'idle', npc: false, ws,
      };
      players.set(p.id, p);
      ws._joined = true;
      ws._playerId = p.id;
      ws.send(JSON.stringify({ type: 'welcome', id: p.id, name: username }));
      systemChat(`${username} masuk ke desa.`);
      return;
    }

    if (!ws._joined) return;
    const p = players.get(ws._playerId);
    if (!p) return;

    if (m.type === 'move') {
      const x = Number(m.x), z = Number(m.z), rot = Number(m.rot);
      if (Number.isFinite(x) && Number.isFinite(z)) {
        p.x = clampWorld(x, WORLD.minX, WORLD.maxX);
        p.z = clampWorld(z, WORLD.minZ, WORLD.maxZ);
      }
      if (Number.isFinite(rot)) p.rot = rot;
      p.anim = m.anim === 'walk' || m.anim === 'run' ? m.anim : 'idle';
      return;
    }

    if (m.type === 'chat') {
      const text = String(m.text || '').trim().slice(0, 200);
      if (!text) return;
      broadcastAll({ type: 'chat', from: p.name, text, ts: Date.now() });
    }
  });

  ws.on('close', () => {
    if (ws._playerId) {
      const p = players.get(ws._playerId);
      players.delete(ws._playerId);
      if (p) systemChat(`${p.name} keluar dari desa.`);
    }
  });
});

// Siaran status berkala (pemain + NPC) 10x/detik
setInterval(() => {
  tickNpcs(Date.now());
  if (!players.size) return;
  const list = [];
  for (const p of players.values()) {
    list.push({ id: p.id, name: p.name, x: +p.x.toFixed(2), z: +p.z.toFixed(2), rot: +p.rot.toFixed(3), anim: p.anim, npc: !!p.npc });
  }
  broadcastAll({ type: 'state', players: list, ts: Date.now() });
}, 100);

server.listen(PORT, () => {
  console.log(`Desa Sambangan 3D berjalan di http://localhost:${PORT}`);
  console.log(`Pemain NPC aktif: ${npcs.length}, titik jalan untuk NPC: ${roadPoints.length}`);
});
