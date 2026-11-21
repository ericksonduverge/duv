import * as THREE from 'three';
import { loadTexture, scallopTexture, softShadowTexture, ornamentTexture, placeholderArt, normalFromImage, SCALLOP } from './textures.js';

const FRAMES = {
  oak: { width: 0.03, depth: 0.06, bevel: 0 },
  black: { width: 0.028, depth: 0.05, bevel: 0 },
  gold: { width: 0.115, depth: 0.075, bevel: 0, carved: true },
  none: { width: 0.0, depth: 0.035, bevel: 0 },
};
const frameSpec = (a) => FRAMES[a.frame] || FRAMES.oak;

/** Real-world size in metres (cm from the data), clamped to something hangable. */
function sizeOf(a) {
  let w = THREE.MathUtils.clamp(Number(a.widthCm) || 100, 15, 500) / 100;
  let h = THREE.MathUtils.clamp(Number(a.heightCm) || 100, 15, 500) / 100;
  const k = Math.min(1, 2.5 / h, 4.2 / w);
  return { w: w * k, h: h * k };
}

/**
 * Split artworks between the two long walls and derive the room length.
 * Tour order runs down the left wall (front → back), then up the right wall.
 */
export function computeLayout(artworks) {
  const N = artworks.length;
  const nL = Math.ceil(N / 2);
  const sized = artworks.map((a) => {
    const s = sizeOf(a), f = frameSpec(a);
    return { ...s, outer: s.w + 2 * (f.width + f.bevel) };
  });
  const run = (arr) => arr.reduce((t, s) => t + s.outer, 0) + Math.max(0, arr.length - 1) * 0.6;
  const marginBack = 1.15, marginFront = 3.6;
  const L = THREE.MathUtils.clamp(Math.max(run(sized.slice(0, nL)), run(sized.slice(nL))) + marginBack + marginFront + 0.6, 11, 40);
  const zb = -L / 2, zf = L / 2;
  const place = (idx, side) => {
    const arr = idx.map((i) => sized[i]);
    const usable = L - marginBack - marginFront;
    const free = usable - arr.reduce((t, s) => t + s.outer, 0);
    const gap = free / Math.max(1, arr.length);
    // left wall: walk from front to back; right wall: back to front
    let cur = side < 0 ? zf - marginFront : zb + marginBack;
    const dir = side < 0 ? -1 : 1;
    idx.forEach((i) => {
      const s = sized[i];
      cur += dir * (gap / 2 + s.outer / 2);
      s.z = cur; s.side = side;
      s.y = Math.max(1.55, s.h / 2 + 0.6);
      cur += dir * (gap / 2 + s.outer / 2);
    });
  };
  const all = artworks.map((_, i) => i);
  place(all.slice(0, nL), -1);
  place(all.slice(nL), 1);
  return { L, slots: sized };
}

/** Mitred moulding swept around the canvas. profile: [across (0 = inner edge), height]. */
function mouldingGeometry(w, h, profile) {
  const pos = [], uv = [], idx = [];
  const n = profile.length;
  const width = profile[n - 1].x;
  // corners in order: BL, BR, TR, TL (counter-clockwise seen from the front)
  const sgn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let side = 0; side < 4; side++) {
    const a = sgn[side], b = sgn[(side + 1) % 4];
    const horizontal = side % 2 === 0;
    const base = pos.length / 3;
    for (let k = 0; k < n; k++) {
      const t = profile[k].x, z = profile[k].y;
      const ax = a[0] * (w / 2 + t), ay = a[1] * (h / 2 + t), bx = b[0] * (w / 2 + t), by = b[1] * (h / 2 + t);
      pos.push(ax, ay, z, bx, by, z);
      const ua = horizontal ? ax : ay, ub = horizontal ? bx : by;
      uv.push(ua, t / width, ub, t / width);
    }
    for (let k = 0; k < n - 1; k++) {
      const i0 = base + k * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
      idx.push(i0, i3, i1, i0, i2, i3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Canvas material: gallery spot from above reveals the brushwork relief. */
function canvasMaterial(tex, normalMap, wallNormal) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.58, emissive: 0xffe6c8, emissiveMap: tex, emissiveIntensity: 0.4,
    normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const spot = new THREE.Vector3(0, 0.8, 0).addScaledVector(wallNormal, 0.6).normalize();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSpotDir = { value: spot };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSpotDir;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 spotV = normalize((viewMatrix * vec4(uSpotDir, 0.0)).xyz);
          float relief = clamp(dot(normal, spotV) / 0.6, 0.0, 1.9);
          float pool = mix(0.84, 1.1, smoothstep(0.0, 1.0, vMapUv.y)) * (1.0 - 0.1 * abs(vMapUv.x - 0.5));
          totalEmissiveRadiance *= mix(1.0, relief, 0.6) * pool;
        }`);
  };
  mat.customProgramCacheKey = () => 'canvas-spot';
  return mat;
}

export async function buildArtworks(scene, { mats }, d, artworks, slots) {
  const scallop = scallopTexture(1.6);
  const shadowTex = softShadowTexture(false);
  const ornament = ornamentTexture();
  const frameMats = {
    oak: mats.oakLight,
    black: new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.5, metalness: 0.2 }),
    gold: new THREE.MeshStandardMaterial({ map: ornament.map, color: 0xffe9c0, roughness: 0.3, metalness: 1, bumpMap: ornament.bump, bumpScale: 3.5, envMapIntensity: 3.2, emissive: 0x6a4410, emissiveMap: ornament.map, emissiveIntensity: 0.55 }),
  };
  const backMat = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.9 });
  const washMat = new THREE.MeshBasicMaterial({ map: scallop, color: new THREE.Color(1.0, 0.68, 0.38).multiplyScalar(0.95), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x140c04, transparent: true, opacity: 0.55, depthWrite: false });
  const washGeo = new THREE.PlaneGeometry(SCALLOP.w, SCALLOP.top - SCALLOP.bottom);

  const textures = await Promise.all(artworks.map((a) =>
    loadTexture(a.image, { repeat: false }).catch(() => placeholderArt(a.title || ''))));

  // track rails
  const railX = d.hw - SCALLOP.lightD;
  const railY = d.H + (SCALLOP.lightD / d.hw) * (d.R - d.H) - 0.07;
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, d.L - 0.8), mats.black);
    rail.position.set(sx * railX, railY, 0);
    scene.add(rail);
  }
  const headGeo = new THREE.CylinderGeometry(0.042, 0.05, 0.15, 16);
  headGeo.rotateX(Math.PI / 2);
  const lensGeo = new THREE.CircleGeometry(0.036, 16);
  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.9) });

  const items = [];
  const hit = [];
  artworks.forEach((data, i) => {
    const s = slots[i];
    const spec = frameSpec(data);
    const tex = textures[i];
    tex.anisotropy = 16;
    const g = new THREE.Group();
    g.position.set(s.side * (d.hw - 0.004), s.y, s.z);
    g.rotation.y = s.side < 0 ? Math.PI / 2 : -Math.PI / 2;

    // spotlight wash on the wall (two heads for wide works)
    const offs = s.w > 1.55 ? [-s.w * 0.24, s.w * 0.24] : [0];
    for (const o of offs) {
      const wash = new THREE.Mesh(washGeo, washMat);
      wash.position.set(o, (SCALLOP.top + SCALLOP.bottom) / 2 - s.y, 0.002);
      wash.renderOrder = 1;
      g.add(wash);
      const head = new THREE.Mesh(headGeo, mats.black);
      head.position.set(o, railY - 0.11 - s.y, SCALLOP.lightD - 0.004);
      g.add(head);
      head.userData.aim = new THREE.Vector3(o, 0, 0);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09), mats.black);
      stem.position.set(o, railY - 0.05 - s.y, SCALLOP.lightD - 0.004);
      g.add(stem);
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.z = 0.0765;
      head.add(lens);
    }

    // soft shadow the frame throws on the wall
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(s.outer + 0.34, s.h + 0.4), shadowMat);
    sh.position.set(0, -0.07, 0.005);
    sh.renderOrder = 2;
    g.add(sh);

    // backing + canvas
    const canvasD = spec.carved ? 0.014 : spec.depth * 0.7;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, canvasD), backMat);
    backing.position.z = 0.008 + canvasD / 2;
    g.add(backing);
    let relief = null;
    try { if (tex.image && tex.image.width) relief = normalFromImage(tex.image, 1.7, 768); } catch { relief = null; }
    if (relief) { relief.wrapS = relief.wrapT = THREE.ClampToEdgeWrapping; relief.anisotropy = 8; }
    const mat = canvasMaterial(tex, relief, new THREE.Vector3(-s.side, 0, 0));
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    canvas.position.z = 0.008 + canvasD + 0.001;
    canvas.userData.index = i;
    g.add(canvas);
    hit.push(canvas);

    if (spec.carved) {
      const W = spec.width, D = spec.depth;
      const prof = new THREE.SplineCurve([
        [0, 0.3], [0.05, 0.42], [0.12, 0.46], [0.2, 0.36], [0.3, 0.3], [0.42, 0.4], [0.56, 0.7], [0.7, 0.95],
        [0.8, 1.0], [0.89, 0.9], [0.95, 0.66], [0.985, 0.3], [1, 0],
      ].map(([x, y]) => new THREE.Vector2(x * W, y * D))).getPoints(40);
      prof.unshift(new THREE.Vector2(0, 0.012));
      const frame = new THREE.Mesh(mouldingGeometry(s.w - 0.006, s.h - 0.006, prof), frameMats.gold);
      frame.position.z = 0.008;
      g.add(frame);
    } else if (spec.width > 0) {
      const fw = spec.width + spec.bevel;
      const ow = s.w / 2 + fw, oh = s.h / 2 + fw;
      const shape = new THREE.Shape();
      shape.moveTo(-ow, -oh); shape.lineTo(ow, -oh); shape.lineTo(ow, oh); shape.lineTo(-ow, oh); shape.closePath();
      const iw = s.w / 2 + spec.bevel - 0.002, ih = s.h / 2 + spec.bevel - 0.002;
      const hole = new THREE.Path();
      hole.moveTo(-iw, -ih); hole.lineTo(-iw, ih); hole.lineTo(iw, ih); hole.lineTo(iw, -ih); hole.closePath();
      shape.holes.push(hole);
      // inset the outline by the bevel so the outer size stays exact
      const geo = new THREE.ExtrudeGeometry(shape, spec.bevel
        ? { depth: spec.depth, bevelEnabled: true, bevelThickness: spec.bevel, bevelSize: spec.bevel, bevelOffset: -spec.bevel, bevelSegments: 4 }
        : { depth: spec.depth, bevelEnabled: false });
      const frame = new THREE.Mesh(geo, frameMats[data.frame] || frameMats.oak);
      frame.position.z = 0.008 + spec.bevel;
      g.add(frame);
    }

    scene.add(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => { if (o.userData.aim) o.lookAt(g.localToWorld(o.userData.aim.clone())); });

    const normal = new THREE.Vector3(-s.side, 0, 0);
    items.push({
      data, group: g, canvas, material: mat, normal,
      center: new THREE.Vector3(s.side * d.hw, s.y, s.z).addScaledVector(normal, 0.06),
      w: s.outer, h: s.h + (s.outer - s.w),
    });
  });
  return { items, hit };
}
