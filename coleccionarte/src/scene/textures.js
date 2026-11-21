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
 * Covers a wall area 3.2 m wide, from y = 3.5 down to y = 0.1.
 */
export const SCALLOP = { w: 3.2, top: 3.5, bottom: 0.1, lightY: 3.62, lightD: 0.72 };
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

/** Bump pattern for carved gilded frames. */
export function ornamentTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 32 + 16, y = j * 32 + 16;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 15);
      g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#999'); g.addColorStop(0.8, '#333'); g.addColorStop(1, '#777');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, 15, (i + j) % 2 ? 9 : 14, ((i + j) % 2) * 0.8, 0, 7); ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  return t;
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
    ...names.map((n) => loadTexture(`/tex/${n}.jpg`)),
    loadTexture('/tex/sky.jpg', { repeat: false }),
    loadTexture('/tex/garden.jpg', { repeat: false }),
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
  const m = {
    plaster: std({ map: tiled(plaster, 1 / 2.6), normalMap: tiled(nrm.plaster, 1 / 2.6), normalScale: new THREE.Vector2(0.35, 0.35), color: 0xf4ebdd, roughness: 0.93 }),
    concrete: std({ map: tiled(concrete, 1 / 3.2), normalMap: tiled(nrm.concrete, 1 / 3.2), normalScale: new THREE.Vector2(0.25, 0.25), color: 0xf3e3cf, roughness: 0.42, metalness: 0.0 }),
    parquet: std({ map: tiled(herringbone, 1 / 1.5), normalMap: tiled(nrm.herringbone, 1 / 1.5), normalScale: new THREE.Vector2(0.4, 0.4), color: 0xe9c9a2, roughness: 0.5 }),
    oak: std({ map: tiled(oak, 1 / 1.4), normalMap: tiled(nrm.oak, 1 / 1.4), normalScale: new THREE.Vector2(0.5, 0.5), color: 0xc9a17a, roughness: 0.72 }),
    oakLight: std({ map: tiled(oak, 1 / 0.9), color: 0xf0d2a8, roughness: 0.6 }),
    boucle: std({ map: tiled(boucle, 5, 2.5), normalMap: tiled(nrm.boucle, 5, 2.5), normalScale: new THREE.Vector2(0.9, 0.9), color: 0xfbf3e6, roughness: 1 }),
    leather: std({ map: tiled(leather, 1.6, 1.2), normalMap: tiled(nrm.leather, 1.6, 1.2), normalScale: new THREE.Vector2(0.5, 0.5), color: 0xd9a37e, roughness: 0.55 }),
    black: std({ color: 0x121110, roughness: 0.45, metalness: 0.65 }),
    brass: std({ color: 0xb8893c, roughness: 0.28, metalness: 1 }),
    bronze: std({ color: 0x2b2018, roughness: 0.38, metalness: 0.8 }),
    ceramic: std({ color: 0xe9e0d2, roughness: 0.6 }),
    leaf: std({ color: 0x6f7d4f, roughness: 0.8, side: THREE.DoubleSide }),
    twig: std({ color: 0x4a3a2a, roughness: 0.9 }),
  };
  return { mats: m, tex: { plaster, concrete, herringbone, oak, boucle, leather, sky, garden }, nrm };
}
