import * as THREE from 'three';

/* ================================================================
   Desa Sambangan 3D — klien
   ================================================================ */
const $ = (id) => document.getElementById(id);
const layarMasuk = $('layar-masuk');
const hud = $('hud');
const pesanMasuk = $('pesan-masuk');

let ws = null;
let myId = null;
let myName = null;
let token = localStorage.getItem('desa_token') || '';
let desaReady = false;

// ------------------------------------------------------------ formulir masuk
function setPesan(teks, ok) {
  pesanMasuk.textContent = teks || '';
  pesanMasuk.className = 'pesan' + (ok ? ' ok' : '');
}
$('tab-login').onclick = () => {
  $('tab-login').classList.add('aktif'); $('tab-daftar').classList.remove('aktif');
  $('form-login').classList.remove('tersembunyi'); $('form-daftar').classList.add('tersembunyi');
  setPesan('');
};
$('tab-daftar').onclick = () => {
  $('tab-daftar').classList.add('aktif'); $('tab-login').classList.remove('aktif');
  $('form-daftar').classList.remove('tersembunyi'); $('form-login').classList.add('tersembunyi');
  setPesan('');
};

async function api(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

$('form-daftar').onsubmit = async (e) => {
  e.preventDefault();
  const username = $('daftar-username').value.trim();
  const password = $('daftar-password').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true; setPesan('Mendaftarkan…', true);
  try {
    await api('/api/register', { username, password });
    const d = await api('/api/login', { username, password });
    token = d.token; myName = d.username;
    localStorage.setItem('desa_token', token);
    localStorage.setItem('desa_username', myName);
    masukDunia();
  } catch (err) {
    setPesan(err.message);
  } finally { btn.disabled = false; }
};

$('form-login').onsubmit = async (e) => {
  e.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true; setPesan('Memeriksa…', true);
  try {
    const d = await api('/api/login', { username, password });
    token = d.token; myName = d.username;
    localStorage.setItem('desa_token', token);
    localStorage.setItem('desa_username', myName);
    masukDunia();
  } catch (err) {
    setPesan(err.message);
  } finally { btn.disabled = false; }
};

$('tombol-keluar').onclick = () => {
  localStorage.removeItem('desa_token');
  if (ws) { try { ws.close(); } catch {} }
  location.reload();
};

// ------------------------------------------------------------ WebSocket
function masukDunia() {
  layarMasuk.classList.add('tersembunyi');
  hud.classList.remove('tersembunyi');
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', token }));
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'welcome') {
      myId = m.id; myName = m.name;
      // ganti label avatar sendiri dengan nama asli
      const lama = avatarSaya;
      avatarSaya = buatAvatar(m.name, false);
      avatarSaya.position.copy(lama.position);
      avatarSaya.rotation.copy(lama.rotation);
      scene.remove(lama);
    } else if (m.type === 'error') {
      localStorage.removeItem('desa_token');
      alert(m.message || 'Sesi berakhir.');
      location.reload();
    } else if (m.type === 'state') {
      terimaStatus(m.players);
    } else if (m.type === 'chat') {
      tambahChat(m.from, m.text, m.system);
    }
  };
  ws.onclose = () => {
    if (!layarMasuk.classList.contains('tersembunyi')) return;
    $('status-muat').textContent = 'Koneksi terputus. Muat ulang halaman untuk masuk lagi.';
  };
}

function tambahChat(dari, teks, sistem) {
  const isi = $('isi-chat');
  const div = document.createElement('div');
  if (sistem) {
    div.innerHTML = '<span class="sistem"></span>';
    div.firstChild.textContent = teks;
  } else {
    const b = document.createElement('span');
    b.className = 'dari'; b.textContent = dari + ': ';
    div.appendChild(b);
    div.appendChild(document.createTextNode(teks));
  }
  isi.appendChild(div);
  while (isi.children.length > 60) isi.removeChild(isi.firstChild);
  isi.scrollTop = isi.scrollHeight;
}
$('form-chat').onsubmit = (e) => {
  e.preventDefault();
  const inp = $('input-chat');
  const teks = inp.value.trim();
  if (teks && ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'chat', text: teks }));
  }
  inp.value = '';
  inp.blur();
};

// ------------------------------------------------------------ Three.js dasar
const canvas = $('kanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9ee);
scene.fog = new THREE.Fog(0x8ec9ee, 220, 900);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 3000);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5d8a4a, 0.95);
scene.add(hemi);
const matahari = new THREE.DirectionalLight(0xfff2d8, 1.6);
matahari.position.set(180, 320, 120);
scene.add(matahari);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------ utilitas
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashNama(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function teksCanvas(teks, { font = 'bold 64px Arial', fg = '#ffffff', bg = null, pad = 24, stroke = null } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(teks).width) + pad * 2;
  c.width = w; c.height = 64 + pad * 2;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.shadowColor = stroke; g.shadowBlur = 18; }
  g.fillStyle = fg;
  g.fillText(teks, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return { tex, aspect: c.width / c.height };
}
function buatLabel(teks, skala = 7, warna = '#ffffff') {
  const { tex, aspect } = teksCanvas(teks, {
    font: 'bold 52px Arial', fg: warna,
    stroke: 'rgba(0,0,0,0.85)',
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(skala * aspect * 0.32, skala * 0.32, 1);
  return sp;
}
function papanNama(teks, lebar, tinggi, bg, fg) {
  const { tex } = teksCanvas(teks, { font: 'bold 58px Arial', fg, bg, pad: 18 });
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  return new THREE.Mesh(new THREE.PlaneGeometry(lebar, tinggi), mat);
}

// ------------------------------------------------------------ pembangunan dunia
const BATAS = { minX: -420, maxX: 620, minZ: -420, maxZ: 980 };
const diDalam = (x, z) => x > BATAS.minX && x < BATAS.maxX && z > BATAS.minZ && z < BATAS.maxZ;

function geometriPita(daftarJalur, lebarDefault, warnaAir) {
  const pos = [];
  for (const jalur of daftarJalur) {
    const pts = jalur.p;
    const w = (jalur.w || lebarDefault) / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      if (!diDalam(x1, z1) && !diDalam(x2, z2)) continue;
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * w, nz = (dx / len) * w;
      const ax = x1 + nx, az = z1 + nz, bx = x1 - nx, bz = z1 - nz;
      const cx = x2 + nx, cz = z2 + nz, dxp = x2 - nx, dzp = z2 - nz;
      pos.push(ax, 0, az, bx, 0, bz, cx, 0, cz, bx, 0, bz, dxp, 0, dzp, cx, 0, cz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const WARNA_DINDING = [0xf5e9c9, 0xf2d5b8, 0xdcebf5, 0xe6f2dc, 0xf7dede, 0xfff6e0, 0xe8e0f0, 0xd9efe8];
const WARNA_ATAP = [0xb5502f, 0x8a5a3b, 0x707a82, 0x9c4030, 0x6b7f59];
const matDinding = WARNA_DINDING.map((c) => new THREE.MeshLambertMaterial({ color: c }));
const matAtap = WARNA_ATAP.map((c) => new THREE.MeshLambertMaterial({ color: c }));

function geometriAtap() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, 0); shape.lineTo(0.55, 0); shape.lineTo(0, 0.5); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.06, bevelEnabled: false });
  g.translate(0, 0, -0.53);
  return g;
}

let titikJalan = [];
function bangunDunia(data) {
  // tanah
  const tanah = new THREE.Mesh(
    new THREE.PlaneGeometry(1900, 2100),
    new THREE.MeshLambertMaterial({ color: 0x79b657 })
  );
  tanah.rotation.x = -Math.PI / 2;
  tanah.position.set(100, -0.05, 280);
  scene.add(tanah);

  // jalan
  titikJalan = [];
  for (const r of data.roads) for (const p of r.p) if (diDalam(p[0], p[1])) titikJalan.push(p);
  const jalan = new THREE.Mesh(
    geometriPita(data.roads, 4),
    new THREE.MeshLambertMaterial({ color: 0x5c5c60 })
  );
  jalan.position.y = 0.03;
  scene.add(jalan);

  // air
  const airTerbuka = data.waters.filter((w) => !w.closed);
  const airTertutup = data.waters.filter((w) => w.closed);
  if (airTerbuka.length) {
    const air = new THREE.Mesh(geometriPita(airTerbuka, 7), new THREE.MeshLambertMaterial({ color: 0x3f8fd2 }));
    air.position.y = 0.02;
    scene.add(air);
  }
  for (const wtr of airTertutup) {
    if (wtr.p.length < 3) continue;
    const shape = new THREE.Shape();
    wtr.p.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: 0x3f8fd2 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    scene.add(mesh);
  }

  // landmark: bangunan generik terdekat diganti bangunan khusus
  const landmarkList = data.landmarks || [];
  const terpakai = new Set();
  for (const lm of landmarkList) {
    let best = -1, bd = 1e9;
    data.buildings.forEach((b, i) => {
      const d = Math.hypot(b.c[0] - lm.x, b.c[1] - lm.z);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0 && bd < 18) terpakai.add(best);
  }

  // pilih warung: bangunan dekat jalan, tersebar
  const kandidatWarung = [];
  data.buildings.forEach((b, i) => {
    if (terpakai.has(i)) return;
    let md = 1e9;
    for (const p of titikJalan) {
      const d = Math.hypot(b.c[0] - p[0], b.c[1] - p[1]);
      if (d < md) md = d;
    }
    if (md < 13) kandidatWarung.push({ i, dAsal: Math.hypot(b.c[0], b.c[1]) });
  });
  kandidatWarung.sort((a, b) => a.dAsal - b.dAsal);
  const warungSet = new Set();
  const titikWarung = [];
  for (const k of kandidatWarung) {
    if (warungSet.size >= 6) break;
    const b = data.buildings[k.i];
    if (titikWarung.some(([x, z]) => Math.hypot(x - b.c[0], z - b.c[1]) < 45)) continue;
    warungSet.add(k.i);
    titikWarung.push(b.c);
  }

  // bangunan generik
  const geoKotak = new THREE.BoxGeometry(1, 1, 1);
  geoKotak.translate(0, 0.5, 0);
  const geoAtap = geometriAtap();
  data.buildings.forEach((b, i) => {
    if (terpakai.has(i)) return;
    const h = hashNama('b' + i);
    const rumah = new THREE.Group();
    const badan = new THREE.Mesh(geoKotak, matDinding[h % matDinding.length]);
    badan.scale.set(b.w, b.h, b.d);
    rumah.add(badan);
    const atap = new THREE.Mesh(geoAtap, matAtap[h % matAtap.length]);
    const memanjang = b.w >= b.d;
    atap.scale.set(memanjang ? b.d : b.w, b.h * 0.55 + 1.2, memanjang ? b.w : b.d);
    if (memanjang) atap.rotation.y = Math.PI / 2;
    atap.position.y = b.h;
    rumah.add(atap);
    rumah.position.set(b.c[0], 0, b.c[1]);
    scene.add(rumah);

    if (warungSet.has(i)) {
      const kanopi = new THREE.Mesh(
        new THREE.BoxGeometry(b.w * 0.9, 0.12, 2.4),
        new THREE.MeshLambertMaterial({ color: 0xd84f35 })
      );
      kanopi.position.set(0, 2.6, b.d / 2 + 1.1);
      kanopi.rotation.x = -0.28;
      rumah.add(kanopi);
      const label = buatLabel('WARUNG', 4.6, '#ffd94d');
      label.position.set(0, b.h + 3.4, 0);
      rumah.add(label);
    }
  });

  // bangunan khusus landmark
  for (const lm of landmarkList) scene.add(bangunLandmark(lm));

  // pohon (instanced, acak deterministik)
  const rnd = mulberry32(20261125);
  const posisiPohon = [];
  let percobaan = 0;
  while (posisiPohon.length < 150 && percobaan < 900) {
    percobaan++;
    const x = -360 + rnd() * 940;
    const z = -360 + rnd() * 1290;
    let ok = true;
    for (const b of data.buildings) {
      if (Math.abs(x - b.c[0]) < b.w / 2 + 4 && Math.abs(z - b.c[1]) < b.d / 2 + 4) { ok = false; break; }
    }
    if (!ok) continue;
    for (const lm of landmarkList) {
      if (Math.hypot(x - lm.x, z - lm.z) < 13) { ok = false; break; }
    }
    if (!ok) continue;
    for (const p of titikJalan) {
      if (Math.abs(x - p[0]) < 4.5 && Math.abs(z - p[1]) < 4.5) { ok = false; break; }
    }
    if (ok) posisiPohon.push([x, z, 0.8 + rnd() * 0.8]);
  }
  const geoBatang = new THREE.CylinderGeometry(0.16, 0.24, 1.7, 6);
  const geoTajuk = new THREE.IcosahedronGeometry(1.5, 0);
  const batang = new THREE.InstancedMesh(geoBatang, new THREE.MeshLambertMaterial({ color: 0x7a5230 }), posisiPohon.length);
  const tajuk = new THREE.InstancedMesh(geoTajuk, new THREE.MeshLambertMaterial({ color: 0x3e8e3a }), posisiPohon.length);
  const m4 = new THREE.Matrix4();
  posisiPohon.forEach(([x, z, s], i) => {
    m4.makeScale(s, s, s).setPosition(x, 0.85 * s, z);
    batang.setMatrixAt(i, m4);
    m4.makeScale(s, s * 1.15, s).setPosition(x, (1.7 + 1.1) * s, z);
    tajuk.setMatrixAt(i, m4);
  });
  scene.add(batang, tajuk);
}

// ------------------------------------------------------------ bangunan landmark
function kotak(w, h, d, warna, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: warna }));
  m.position.set(x, y + h / 2, z);
  return m;
}
function bangunLandmark(lm) {
  const g = new THREE.Group();
  g.position.set(lm.x, 0, lm.z);

  if (lm.k === 'fizcell') {
    g.add(kotak(12, 5, 9, 0x0b5cad, 0, 0, -1));
    g.add(kotak(12.6, 0.5, 9.6, 0x33b5ff, 0, 5, -1)); // lis atas terang
    const papan = papanNama('FIZCELL', 10.5, 1.9, '#003a75', '#7fe3ff');
    papan.position.set(0, 3.9, 3.56);
    g.add(papan);
    const papan2 = papanNama('SERVIS HP • LCD • BATERAI', 8.5, 0.95, '#0b5cad', '#ffffff');
    papan2.position.set(0, 2.7, 3.56);
    g.add(papan2);
    const kanopi = kotak(11, 0.15, 2.6, 0x33b5ff, 0, 2.1, 4.6);
    kanopi.rotation.x = -0.22;
    g.add(kanopi);
    const label = buatLabel('FIZCELL — Servis HP', 8.5, '#7fe3ff');
    label.position.set(0, 9.6, 0);
    g.add(label);
  } else if (lm.k === 'mosque') {
    g.add(kotak(16, 6.5, 12, 0xf4f6ef, 0, 0, 0));
    g.add(kotak(16.6, 0.6, 12.6, 0x1f9d55, 0, 6.5, 0));
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.4, 20), new THREE.MeshLambertMaterial({ color: 0xe8eee4 }));
    drum.position.set(0, 7.8, 0);
    g.add(drum);
    const kubah = new THREE.Mesh(
      new THREE.SphereGeometry(4.3, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1f9d55 })
    );
    kubah.position.set(0, 8.5, 0);
    g.add(kubah);
    const puncak = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    puncak.position.set(0, 13.2, 0);
    g.add(puncak);
    // menara
    const menara = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 15, 10), new THREE.MeshLambertMaterial({ color: 0xf4f6ef }));
    menara.position.set(10.5, 7.5, -3);
    g.add(menara);
    const balkon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.8, 10), new THREE.MeshLambertMaterial({ color: 0x1f9d55 }));
    balkon.position.set(10.5, 11.6, -3);
    g.add(balkon);
    const atapMenara = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.8, 10), new THREE.MeshLambertMaterial({ color: 0x1f9d55 }));
    atapMenara.position.set(10.5, 16.4, -3);
    g.add(atapMenara);
    const label = buatLabel('Masjid Raudhatul Muttaqin', 9, '#b8ffce');
    label.position.set(0, 16.6, 0);
    g.add(label);
  } else if (lm.k === 'school') {
    g.add(kotak(20, 6, 10, 0xf7e8b0, 0, 0, 0));
    const atap = new THREE.Mesh(geometriAtap(), new THREE.MeshLambertMaterial({ color: 0x9c4030 }));
    atap.scale.set(10, 3.6, 20);
    atap.rotation.y = Math.PI / 2;
    atap.position.y = 6;
    g.add(atap);
    const papan = papanNama('SD NEGERI SAMBANGAN', 13, 1.5, '#7a4a21', '#ffffff');
    papan.position.set(0, 4.4, 5.06);
    g.add(papan);
    // tiang bendera + bendera merah putih
    const tiang = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 9, 6), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    tiang.position.set(-6, 4.5, 11);
    g.add(tiang);
    const { tex } = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 42;
      const x = c.getContext('2d');
      x.fillStyle = '#e70011'; x.fillRect(0, 0, 64, 21);
      x.fillStyle = '#ffffff'; x.fillRect(0, 21, 64, 21);
      return { tex: new THREE.CanvasTexture(c) };
    })();
    const bendera = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    bendera.position.set(-4.65, 8.1, 11);
    g.add(bendera);
    const label = buatLabel('SD Negeri Sambangan', 8.5, '#ffe9a8');
    label.position.set(0, 12.4, 0);
    g.add(label);
  } else if (lm.k === 'balai') {
    g.add(kotak(14, 5.5, 10, 0xffe9c9, 0, 0, 0));
    const atap = new THREE.Mesh(geometriAtap(), new THREE.MeshLambertMaterial({ color: 0x707a82 }));
    atap.scale.set(10, 3, 14);
    atap.rotation.y = Math.PI / 2;
    atap.position.y = 5.5;
    g.add(atap);
    const papan = papanNama('BALAI DESA SAMBANGAN', 11.5, 1.4, '#5a4632', '#ffffff');
    papan.position.set(0, 4.1, 5.06);
    g.add(papan);
    const halaman = new THREE.Mesh(new THREE.PlaneGeometry(17, 9), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    halaman.rotation.x = -Math.PI / 2;
    halaman.position.set(0, 0.04, 9.5);
    g.add(halaman);
    const label = buatLabel('Balai Desa Sambangan', 8.5, '#ffffff');
    label.position.set(0, 11.4, 0);
    g.add(label);
  } else if (lm.k === 'bengkel') {
    // bangunan terbuka di depan: tiang + atap, dinding belakang & samping
    g.add(kotak(12, 4.2, 0.4, 0xe07b39, 0, 0, -4));        // dinding belakang
    g.add(kotak(0.4, 4.2, 8, 0xe07b39, -6, 0, 0));        // dinding kiri
    g.add(kotak(0.4, 4.2, 8, 0xd96f2e, 6, 0, 0));         // dinding kanan
    const atap = kotak(13.4, 0.25, 9.6, 0x4a4a50, 0, 4.3, 0);
    atap.rotation.x = 0.06;
    g.add(atap);
    for (const [px, pz] of [[-5.6, 3.8], [5.6, 3.8]]) {
      const tiang = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.3, 8), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      tiang.position.set(px, 2.15, pz);
      g.add(tiang);
    }
    const papan = papanNama('BENGKEL JBR', 9.5, 1.5, '#20242a', '#ffb340');
    papan.position.set(0, 3.4, 4.06);
    g.add(papan);
    // meja kerja + dua motor sederhana
    g.add(kotak(3.4, 0.9, 1.1, 0x8a5a3b, -3.2, 0, -2.4));
    for (const mx of [1.8, 4.1]) {
      const motor = new THREE.Group();
      const bodi = kotak(1.7, 0.45, 0.4, 0xc23b2e, 0, 0.45, 0);
      motor.add(bodi);
      for (const wx of [-0.65, 0.65]) {
        const roda = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
        roda.rotation.x = Math.PI / 2;
        roda.position.set(wx, 0.3, 0);
        motor.add(roda);
      }
      motor.position.set(mx, 0, 0.8);
      motor.rotation.y = 0.4;
      g.add(motor);
    }
    const label = buatLabel('Bengkel JBR Motor', 8, '#ffc46b');
    label.position.set(0, 8.6, 0);
    g.add(label);
  } else {
    const label = buatLabel(lm.n, 7.5);
    label.position.set(0, 9, 0);
    g.add(label);
  }
  return g;
}

// ------------------------------------------------------------ avatar
const avatars = new Map(); // id -> {grup, target:{x,z,rot}, anim, nama}
const geoBadan = new THREE.CylinderGeometry(0.30, 0.38, 0.9, 10);
const geoKepala = new THREE.SphereGeometry(0.27, 14, 12);
const matKulit = new THREE.MeshLambertMaterial({ color: 0xf2c49b });

function buatAvatar(nama, npc) {
  const grup = new THREE.Group();
  const hue = (hashNama(nama) % 360) / 360;
  const matBaju = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, npc ? 0.35 : 0.65, npc ? 0.5 : 0.45) });
  const badan = new THREE.Mesh(geoBadan, matBaju);
  badan.position.y = 0.95;
  grup.add(badan);
  const kepala = new THREE.Mesh(geoKepala, matKulit);
  kepala.position.y = 1.68;
  grup.add(kepala);
  if (npc) {
    const topi = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xf0ead8 }));
    topi.position.y = 1.9;
    grup.add(topi);
  }
  const label = buatLabel(nama, 3.6, npc ? '#ffe9a8' : '#ffffff');
  label.position.y = 2.45;
  grup.add(label);
  scene.add(grup);
  return grup;
}

function terimaStatus(daftar) {
  const terlihat = new Set();
  for (const p of daftar) {
    terlihat.add(p.id);
    if (p.id === myId) {
      if (!sudahSinkron) {
        saya.x = p.x; saya.z = p.z;
        sudahSinkron = true;
      }
      continue;
    }
    let a = avatars.get(p.id);
    if (!a) {
      a = { grup: buatAvatar(p.name, p.npc), target: { x: p.x, z: p.z, rot: p.rot }, anim: 'idle', nama: p.name, npc: p.npc };
      a.grup.position.set(p.x, 0, p.z);
      avatars.set(p.id, a);
    }
    a.target.x = p.x; a.target.z = p.z; a.target.rot = p.rot;
    a.anim = p.anim;
  }
  for (const [id, a] of avatars) {
    if (!terlihat.has(id)) {
      scene.remove(a.grup);
      avatars.delete(id);
    }
  }
  // daftar pemain di HUD
  const pemainManusia = daftar.filter((p) => !p.npc);
  const tanda = daftar.map((p) => p.id + p.name).join('|');
  if (tanda !== tandaDaftarTerakhir) {
    tandaDaftarTerakhir = tanda;
    $('jumlah-pemain').textContent = pemainManusia.length + ' pemain, ' + (daftar.length - pemainManusia.length) + ' warga';
    const ul = $('daftar-pemain');
    ul.innerHTML = '';
    for (const p of daftar) {
      const li = document.createElement('li');
      li.textContent = (p.npc ? '🚶 ' : '🧑 ') + p.name + (p.id === myId ? ' (kamu)' : '');
      if (p.npc) li.className = 'npc';
      if (p.id === myId) li.className = 'saya';
      ul.appendChild(li);
    }
  }
}
let tandaDaftarTerakhir = '';

// ------------------------------------------------------------ pemain lokal & kontrol
const saya = { x: 0, z: 10, rot: 0, anim: 'idle' };
let sudahSinkron = false;
let avatarSaya = buatAvatar('Saya', false);
avatarSaya.position.set(saya.x, 0, saya.z);

const tombol = {};
let chatFokus = false;
$('input-chat').addEventListener('focus', () => (chatFokus = true));
$('input-chat').addEventListener('blur', () => (chatFokus = false));
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !chatFokus) {
    e.preventDefault();
    $('input-chat').focus();
    return;
  }
  if (chatFokus) return;
  tombol[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { tombol[e.code] = false; });

// kamera orbit
let camYaw = Math.PI, camPitch = 0.42, camJarak = 13;
let menyeret = false, px = 0, py = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.45) return; // area joystick
  menyeret = true; px = e.clientX; py = e.clientY;
});
addEventListener('pointermove', (e) => {
  if (!menyeret) return;
  camYaw -= (e.clientX - px) * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - py) * 0.004, 0.08, 1.25);
  px = e.clientX; py = e.clientY;
});
addEventListener('pointerup', () => (menyeret = false));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camJarak = THREE.MathUtils.clamp(camJarak + e.deltaY * 0.02, 5, 30);
}, { passive: false });

// joystick virtual
const joy = { aktif: false, dx: 0, dy: 0, id: null };
const elJoy = $('joystick'), elTombol = $('joystick-tombol');
elJoy.addEventListener('touchstart', (e) => {
  document.body.classList.add('sentuh');
  const t = e.changedTouches[0];
  joy.aktif = true; joy.id = t.identifier;
  e.preventDefault();
}, { passive: false });
addEventListener('touchstart', () => document.body.classList.add('sentuh'), { once: true });
addEventListener('touchmove', (e) => {
  if (!joy.aktif) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.id) continue;
    const r = elJoy.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2);
    let dy = t.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy), maks = 38;
    if (len > maks) { dx = (dx / len) * maks; dy = (dy / len) * maks; }
    joy.dx = dx / maks; joy.dy = dy / maks;
    elTombol.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}, { passive: true });
addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      joy.aktif = false; joy.dx = 0; joy.dy = 0;
      elTombol.style.transform = 'translate(-50%,-50%)';
    }
  }
});

// kirim posisi berkala
let kirimTerakhir = 0, posTerakhir = '';
setInterval(() => {
  if (!ws || ws.readyState !== 1 || !myId) return;
  const kunci = [saya.x.toFixed(1), saya.z.toFixed(1), saya.rot.toFixed(2), saya.anim].join(',');
  const now = performance.now();
  if (kunci !== posTerakhir || now - kirimTerakhir > 1200) {
    ws.send(JSON.stringify({ type: 'move', x: saya.x, z: saya.z, rot: saya.rot, anim: saya.anim }));
    posTerakhir = kunci; kirimTerakhir = now;
  }
}, 70);

// ------------------------------------------------------------ loop utama
const jam = new THREE.Clock();
const camTarget = new THREE.Vector3();

function langkah() {
  requestAnimationFrame(langkah);
  const dt = Math.min(jam.getDelta(), 0.05);
  const t = jam.elapsedTime;

  // --- gerak pemain lokal
  let ix = 0, iz = 0;
  if (!chatFokus) {
    if (tombol.KeyW || tombol.ArrowUp) iz -= 1;
    if (tombol.KeyS || tombol.ArrowDown) iz += 1;
    if (tombol.KeyA || tombol.ArrowLeft) ix -= 1;
    if (tombol.KeyD || tombol.ArrowRight) ix += 1;
  }
  if (joy.aktif) { ix += joy.dx; iz += joy.dy; }
  const besar = Math.hypot(ix, iz);
  const lari = tombol.ShiftLeft || tombol.ShiftRight;
  if (besar > 0.08) {
    ix /= Math.max(1, besar); iz /= Math.max(1, besar);
    const kecepatan = lari ? 13 : 7;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const mx = (ix * cos - iz * sin) * kecepatan * dt;
    const mz = (ix * sin + iz * cos) * kecepatan * dt;
    saya.x = THREE.MathUtils.clamp(saya.x + mx, -380, 580);
    saya.z = THREE.MathUtils.clamp(saya.z + mz, -380, 930);
    const targetRot = Math.atan2(mx, mz);
    let dr = targetRot - saya.rot;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    saya.rot += dr * Math.min(1, dt * 12);
    saya.anim = lari ? 'run' : 'walk';
  } else {
    saya.anim = 'idle';
  }
  avatarSaya.position.set(saya.x, saya.anim !== 'idle' ? Math.abs(Math.sin(t * 11)) * 0.07 : 0, saya.z);
  avatarSaya.rotation.y = saya.rot;

  // --- avatar lain: interpolasi halus
  const k = 1 - Math.exp(-9 * dt);
  for (const a of avatars.values()) {
    a.grup.position.x += (a.target.x - a.grup.position.x) * k;
    a.grup.position.z += (a.target.z - a.grup.position.z) * k;
    a.grup.position.y = a.anim !== 'idle' ? Math.abs(Math.sin(t * 10 + a.grup.position.x)) * 0.07 : 0;
    let dr = a.target.rot - a.grup.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    a.grup.rotation.y += dr * k;
  }

  // --- kamera orang ketiga
  const cx = saya.x - Math.sin(camYaw) * Math.cos(camPitch) * camJarak;
  const cz = saya.z - Math.cos(camYaw) * Math.cos(camPitch) * camJarak;
  const cy = 1.7 + Math.sin(camPitch) * camJarak;
  camTarget.set(cx, Math.max(cy, 1.2), cz);
  camera.position.lerp(camTarget, 1 - Math.exp(-8 * dt));
  camera.lookAt(saya.x, 1.6, saya.z);

  renderer.render(scene, camera);
  if (!desaReady) {
    desaReady = true;
    window.__desaReady = true;
    $('status-muat').textContent = 'Desa termuat ✔ Selamat jalan-jalan!';
    setTimeout(() => { $('status-muat').style.display = 'none'; }, 3500);
  }
}

// untuk pengujian otomatis
window.__desa = {
  get myPos() { return { x: saya.x, z: saya.z }; },
  get playerCount() { return avatars.size + (myId ? 1 : 0); },
  get ready() { return desaReady; },
};

// ------------------------------------------------------------ mulai
fetch('/village.json')
  .then((r) => r.json())
  .then((data) => {
    bangunDunia(data);
    langkah();
  })
  .catch((e) => {
    $('status-muat').textContent = 'Gagal memuat data desa: ' + e.message;
  });

if (token) {
  myName = localStorage.getItem('desa_username') || '';
  masukDunia();
}
