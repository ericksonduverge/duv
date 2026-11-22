import * as THREE from 'three';

export const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);

export function loadTexture(url, { srgb = true, repeat = true } = {}) {
  return loader.loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

/** Derive a tangent-space normal map from an image's luminance (seamless). */
export function normalFromImage(img, strength = 2, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const src = ctx.getImageData(0, 0, size, size);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) {
    h[i] = (src.data[i * 4] * 0.299 + src.data[i * 4 + 1] * 0.587 + src.data[i * 4 + 2] * 0.114) / 255;
  }
  const out = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      out.data[o] = (-dx * l * 0.5 + 0.5) * 255;
      out.data[o + 1] = (dy * l * 0.5 + 0.5) * 255;
      out.data[o + 2] = (l * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Desaturate / re-expose a photo texture (returns a new tiling texture). */
export function gradeTexture(tex, sat = 1, gain = 1, tint = [1, 1, 1]) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const l = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
    a[i] = Math.min(255, (l + (a[i] - l) * sat) * gain * tint[0]);
    a[i + 1] = Math.min(255, (l + (a[i + 1] - l) * sat) * gain * tint[1]);
    a[i + 2] = Math.min(255, (l + (a[i + 2] - l) * sat) * gain * tint[2]);
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Clone a texture with its own repeat (image is shared, no re-upload). */
export function tiled(tex, rx, ry = rx) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/** Rewrite UVs as box-projected metres so textures tile at real scale. */
export function uvMeters(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Physically shaped wall-wash "scallop" of a ceiling spot aimed at a painting.
  * Covers a wall area 3 m wide, from the eave down to y = 0.1.
 */
export const SCALLOP = { w: 3.0, top: 3.3, bottom: 0.1, lightY: 3.4, lightD: 0.7 };
export function scallopTexture(aimY = 1.6) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const { w, top, bottom, lightY, lightD } = SCALLOP;
  const aim = new THREE.Vector3(0, aimY - lightY, -lightD).normalize();
  const cosO = Math.cos(THREE.MathUtils.degToRad(36)), cosI = Math.cos(THREE.MathUtils.degToRad(10));
  const evalI = (x, y) => {
    const vx = x, vy = y - lightY, vz = -lightD;
    const d = Math.hypot(vx, vy, vz);
    const cs = (vx * aim.x + vy * aim.y + vz * aim.z) / d;
    let s = THREE.MathUtils.clamp((cs - cosO) / (cosI - cosO), 0, 1);
    s = s * s * (3 - 2 * s);
    return (s * (lightD / d)) / (d * d);
  };
  const norm = evalI(0, aimY + 0.5);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const u = px / (S - 1), v = py / (S - 1);
      const x = (u - 0.5) * w;
      const y = top - v * (top - bottom);
      let I = evalI(x, y) / norm;
      const edge = Math.min(1, u * 6, (1 - u) * 6, (1 - v) * 5, v * 30 + 0.2);
      I = Math.min(1, I) * edge;
      const val = Math.pow(I, 1 / 1.6) * 255 + (Math.random() - 0.5) * 1.6;
      const o = (py * S + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = val;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft blurred blob / rectangle used for contact shadows. */
export function softShadowTexture(round = false) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / (S - 1)) * 2 - 1, v = (y / (S - 1)) * 2 - 1;
      let a;
      if (round) a = 1 - Math.min(1, Math.hypot(u, v));
      else a = Math.min(1, (1 - Math.abs(u)) * 4.5) * Math.min(1, (1 - Math.abs(v)) * 4.5);
      a = a * a * (3 - 2 * a);
      const o = (y * S + x) * 4;
      img.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** Open rattan weave with alpha gaps for the pendant shade. */
export function wickerTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const cols = 64, rows = 22;
  const cw = W / cols, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const over = (i + r) % 2 === 0;
      const l = 52 + Math.random() * 14 + (r / rows) * 14;
      ctx.fillStyle = `hsl(${30 + Math.random() * 6}, 58%, ${l}%)`;
      if (over) ctx.fillRect(i * cw - 1, r * rh + rh * 0.14, cw + 2, rh * 0.72);
      else ctx.fillRect(i * cw + cw * 0.2, r * rh - 1, cw * 0.6, rh + 2);
      ctx.fillStyle = 'rgba(60,30,8,0.28)';
      if (over) ctx.fillRect(i * cw - 1, r * rh + rh * 0.72, cw + 2, rh * 0.14);
      else ctx.fillRect(i * cw + cw * 0.68, r * rh - 1, cw * 0.12, rh + 2);
    }
  }
  // solid rim bands
  ctx.fillStyle = 'hsl(30,55%,48%)';
  ctx.fillRect(0, 0, W, 7);
  ctx.fillRect(0, H - 9, W, 9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Carved gilded moulding: a height field (bump) and an antiqued gold colour map.
 * u runs along the frame side (one tile = 12 cm), v across the moulding (inner → outer).
 */
export function ornamentTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#6a6a6a';
  ctx.fillRect(0, 0, W, H);
  const blob = (x, y, rx, ry, rot, hi = '#ffffff') => {
    for (const ox of [-W, 0, W]) {
      ctx.save();
      ctx.translate(x + ox, y); ctx.rotate(rot); ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(-0.2, -0.2, 0.05, 0, 0, 1);
      g.addColorStop(0, hi); g.addColorStop(0.6, '#a0a0a0'); g.addColorStop(1, 'rgba(60,60,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };
  // canvas y = 0 is v = 1 (outer edge); the bottom of the canvas is the inner lip
  // inner bead row
  ctx.fillStyle = '#3c3c3c'; ctx.fillRect(0, H * 0.84, W, H * 0.1);
  for (let i = 0; i < 8; i++) blob(i * 32 + 16, H * 0.89, 13, 11, 0);
  // fillet lines
  ctx.fillStyle = '#b5b5b5'; ctx.fillRect(0, H * 0.77, W, 5);
  ctx.fillStyle = '#404040'; ctx.fillRect(0, H * 0.74, W, 5);
  // acanthus leaves on the main swell
  for (let i = 0; i < 2; i++) {
    const x = i * 128 + 64;
    blob(x, H * 0.4, 58, 30, 0, '#e8e8e8');
    blob(x - 30, H * 0.3, 40, 15, -0.6);
    blob(x + 30, H * 0.3, 40, 15, 0.6);
    blob(x - 34, H * 0.52, 36, 13, 0.55);
    blob(x + 34, H * 0.52, 36, 13, -0.55);
    blob(x, H * 0.26, 14, 30, 0);
    blob(x + 64, H * 0.42, 16, 16, 0);
    ctx.strokeStyle = 'rgba(40,40,40,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, H * 0.14); ctx.lineTo(x, H * 0.62); ctx.stroke();
  }
  // outer rope
  ctx.fillStyle = '#444'; ctx.fillRect(0, H * 0.03, W, H * 0.08);
  for (let i = 0; i < 16; i++) blob(i * 16 + 8, H * 0.07, 11, 6, -0.7);
  const src = ctx.getImageData(0, 0, W, H);
  const bump = new THREE.CanvasTexture(c);
  // colour: dark umber in the hollows, bright gold on the ridges
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const ctx2 = c2.getContext('2d');
  const out = ctx2.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const h = Math.min(1, Math.max(0, (src.data[i * 4] / 255 - 0.2) / 0.6));
    const k = h * h * (3 - 2 * h);
    out.data[i * 4] = 96 + (246 - 96) * k;
    out.data[i * 4 + 1] = 64 + (203 - 64) * k;
    out.data[i * 4 + 2] = 26 + (112 - 26) * k;
    out.data[i * 4 + 3] = 255;
  }
  ctx2.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(c2);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [bump, map]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.12, 1); t.anisotropy = 8; }
  return { bump, map };
}

export function placeholderArt(label = '') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#cdbfa8'); g.addColorStop(1, '#9c8a72');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '20px serif'; ctx.textAlign = 'center';
  ctx.fillText(label, 128, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadMaterials() {
  const names = ['plaster', 'concrete', 'herringbone', 'oak', 'boucle', 'leather'];
  const [plaster, concrete, herringbone, oak, boucle, leather, sky, garden] = await Promise.all([
    ...names.map((n) => loadTexture(`tex/${n}.jpg`)),
    loadTexture('tex/sky.jpg', { repeat: false }),
    loadTexture('tex/garden.jpg', { repeat: false }),
  ]);
  const nrm = {
    plaster: normalFromImage(plaster.image, 2.2),
    concrete: normalFromImage(concrete.image, 1.2),
    herringbone: normalFromImage(herringbone.image, 2.5),
    oak: normalFromImage(oak.image, 2.5),
    boucle: normalFromImage(boucle.image, 5),
    leather: normalFromImage(leather.image, 2.5),
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // the source photos are very saturated; grade them towards the warm, muted palette of the house
  const oakG = gradeTexture(oak, 0.62, 1.02);
  const oakL = gradeTexture(oak, 0.7, 1.4);
  const herrG = gradeTexture(herringbone, 0.78, 0.9);
  const leatherG = gradeTexture(leather, 0.74, 1.28);
  const v2 = (n) => new THREE.Vector2(n, n);
  const m = {
    plaster: std({ map: tiled(plaster, 1 / 2.6), normalMap: tiled(nrm.plaster, 1 / 2.6), normalScale: v2(0.4), color: 0xecdcc4, roughness: 0.94 }),
    concrete: std({ map: tiled(concrete, 1 / 3.2), normalMap: tiled(nrm.concrete, 1 / 3.2), normalScale: v2(0.25), color: 0xd6c5b0, roughness: 0.4 }),
    parquet: std({ map: tiled(herrG, 1 / 1.5), normalMap: tiled(nrm.herringbone, 1 / 1.5), normalScale: v2(0.45), color: 0xf0e2d0, roughness: 0.46 }),
    oak: std({ map: tiled(oakG, 1 / 1.4), normalMap: tiled(nrm.oak, 1 / 1.4), normalScale: v2(0.6), color: 0xffffff, roughness: 0.7 }),
    oakLight: std({ map: tiled(oakL, 1 / 0.9), normalMap: tiled(nrm.oak, 1 / 0.9), normalScale: v2(0.3), color: 0xffffff, roughness: 0.58 }),
    boucle: std({ map: tiled(boucle, 5, 2.5), normalMap: tiled(nrm.boucle, 5, 2.5), normalScale: v2(1.0), color: 0xf6ecdc, roughness: 1 }),
    leather: std({ map: tiled(leatherG, 1.6, 1.6), normalMap: tiled(nrm.leather, 1.6, 1.6), normalScale: v2(0.5), color: 0xffffff, roughness: 0.5 }),
    black: std({ color: 0x121110, roughness: 0.45, metalness: 0.65 }),
    brass: std({ color: 0xc0924a, roughness: 0.26, metalness: 1, envMapIntensity: 3 }),
    bronze: std({ color: 0x2b2018, roughness: 0.34, metalness: 0.8, envMapIntensity: 2.5 }),
    ceramic: std({ color: 0xe6dccb, roughness: 0.55 }),
    leaf: std({ color: 0x66744a, roughness: 0.8, side: THREE.DoubleSide }),
    twig: std({ color: 0x4a3a2a, roughness: 0.9 }),
  };
  return { mats: m, tex: { plaster, concrete, herringbone, oak, boucle, leather, sky, garden }, nrm };
}
