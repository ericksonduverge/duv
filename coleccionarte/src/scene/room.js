import * as THREE from 'three';
import { uvMeters } from './textures.js';

export const SUN_DIR = new THREE.Vector3(-0.1, -0.75, -1).normalize();

export function roomDims(L) {
  const W = 6.3, H = 3.3, R = 4.55;
  return { W, hw: W / 2, H, R, L, zb: -L / 2, zf: L / 2, backDepth: 6, backHalf: 3.0, backH: 3.2, wallT: 0.4 };
}

export function buildRoom(scene, { mats, tex }, d, quality) {
  const { hw, H, R, L, zb, zf } = d;
  const zr = zb - d.wallT - d.backDepth; // far end of the back room
  const box = (w, h, dp, mat, x, y, z, parent = scene, cast = true) => {
    const m = new THREE.Mesh(uvMeters(new THREE.BoxGeometry(w, h, dp)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------- floor ----------
  const fl = L + d.backDepth + d.wallT + 0.6;
  const floorGeo = new THREE.PlaneGeometry(d.W + 0.4, fl);
  floorGeo.rotateX(-Math.PI / 2);
  uvMeters(floorGeo);
  const floor = new THREE.Mesh(floorGeo, mats.concrete);
  floor.position.set(0, 0, (zf + zr) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const fz = d.fz ?? zf - 4.4;
  const pqZ1 = Math.min(zf - 1.5, fz + 3.1), pqZ0 = Math.max(zb + 1.6, fz - 2.9);
  const pq = { w: Math.min(4.7, d.W - 1.5), l: pqZ1 - pqZ0, z: (pqZ0 + pqZ1) / 2 };
  const pGeo = new THREE.PlaneGeometry(pq.w, pq.l);
  pGeo.rotateX(-Math.PI / 2);
  uvMeters(pGeo);
  const parquet = new THREE.Mesh(pGeo, mats.parquet);
  parquet.position.set(0, 0.0015, pq.z);
  parquet.receiveShadow = true;
  scene.add(parquet);
  // brass inlay around the parquet
  for (const [w, l, x, z] of [
    [pq.w + 0.03, 0.015, 0, pq.z - pq.l / 2], [pq.w + 0.03, 0.015, 0, pq.z + pq.l / 2],
    [0.015, pq.l, -pq.w / 2, pq.z], [0.015, pq.l, pq.w / 2, pq.z],
  ]) box(w, 0.004, l, mats.brass, x, 0.002, z, scene, false);

  // ---------- walls ----------
  box(0.2, H + 0.3, L + 0.4, mats.plaster, -hw - 0.1, (H + 0.3) / 2, 0);
  box(0.2, H + 0.3, L + 0.4, mats.plaster, hw + 0.1, (H + 0.3) / 2, 0);
  // shadow gap at floor
  const gapMat = new THREE.MeshBasicMaterial({ color: 0x1a1612 });
  box(0.012, 0.035, L, gapMat, -hw + 0.006, 0.0175, 0, scene, false);
  box(0.012, 0.035, L, gapMat, hw - 0.006, 0.0175, 0, scene, false);
  const skirt = new THREE.MeshStandardMaterial({ color: 0xf1e6d4, roughness: 0.6 });
  box(0.018, 0.09, L, skirt, -hw + 0.009, 0.08, 0, scene, false);
  box(0.018, 0.09, L, skirt, hw - 0.009, 0.08, 0, scene, false);

  const gable = () => {
    const s = new THREE.Shape();
    s.moveTo(-hw - 0.2, 0); s.lineTo(hw + 0.2, 0); s.lineTo(hw + 0.2, H); s.lineTo(0, R + 0.08); s.lineTo(-hw - 0.2, H); s.closePath();
    return s;
  };
  // back wall with arch
  const arch = { hw: 1.45, spring: 1.4 };
  const backShape = gable();
  const hole = new THREE.Path();
  hole.moveTo(-arch.hw, 0); hole.lineTo(-arch.hw, arch.spring);
  hole.absarc(0, arch.spring, arch.hw, Math.PI, 0, true);
  hole.lineTo(arch.hw, 0); hole.closePath();
  backShape.holes.push(hole);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(backShape, { depth: d.wallT, bevelEnabled: false, curveSegments: 40 }), mats.plaster);
  back.position.z = zb - d.wallT;
  back.castShadow = back.receiveShadow = true;
  scene.add(back);
  const front = new THREE.Mesh(new THREE.ExtrudeGeometry(gable(), { depth: 0.2, bevelEnabled: false }), mats.plaster);
  front.position.z = zf;
  front.castShadow = front.receiveShadow = true;
  scene.add(front);

  // ---------- roof ----------
  const a = Math.atan2(R - H, hw);
  const s = Math.hypot(hw, R - H);
  const sl = s + 0.5; // slab length (overhang at eave)
  const roofLen = L + 0.6;
  const leftG = new THREE.Group();
  leftG.position.set(-hw / 2, (H + R) / 2, 0);
  leftG.rotation.z = a;
  const rightG = new THREE.Group();
  rightG.position.set(hw / 2, (H + R) / 2, 0);
  rightG.rotation.z = -a;
  scene.add(leftG, rightG);

  // skylight opening in left-slope local coords (x along slope, z = world z)
  const skZ1 = Math.max(zb + 4.6, zf - 4.7);
  const sk = { u0: -0.27 * s, u1: 0.34 * s, z0: Math.max(zb + 1.4, skZ1 - 3.3), z1: skZ1 };
  const T = 0.14, ty = T / 2;
  const zA = -roofLen / 2, zB = roofLen / 2;
  box(sl, T, sk.z0 - zA, mats.plaster, -0.25, ty, (zA + sk.z0) / 2, leftG);
  box(sl, T, zB - sk.z1, mats.plaster, -0.25, ty, (zB + sk.z1) / 2, leftG);
  const lowW = sk.u0 - (-s / 2 - 0.5);
  box(lowW, T, sk.z1 - sk.z0, mats.plaster, sk.u0 - lowW / 2, ty, (sk.z0 + sk.z1) / 2, leftG);
  const upW = s / 2 - sk.u1;
  box(upW, T, sk.z1 - sk.z0, mats.plaster, sk.u1 + upW / 2, ty, (sk.z0 + sk.z1) / 2, leftG);
  box(sl, T, roofLen, mats.plaster, 0.25, ty, 0, rightG);

  // skylight frame + mullions
  const skW = sk.u1 - sk.u0, skL = sk.z1 - sk.z0, skZ = (sk.z0 + sk.z1) / 2, skX = (sk.u0 + sk.u1) / 2;
  box(skW, 0.1, 0.06, mats.black, skX, ty, sk.z0 + 0.03, leftG);
  box(skW, 0.1, 0.06, mats.black, skX, ty, sk.z1 - 0.03, leftG);
  box(0.06, 0.1, skL, mats.black, sk.u0 + 0.03, ty, skZ, leftG);
  box(0.06, 0.1, skL, mats.black, sk.u1 - 0.03, ty, skZ, leftG);
  box(skW, 0.08, 0.06, mats.black, skX, ty, sk.z0 + skL / 3, leftG);
  box(skW, 0.08, 0.06, mats.black, skX, ty, sk.z0 + (2 * skL) / 3, leftG);
  box(0.05, 0.08, skL, mats.black, skX, ty, skZ, leftG);

  // sky seen through the skylight (cropped past the photo's frame border)
  const skyTex = tex.sky;
  skyTex.repeat.set(0.84, 0.8);
  skyTex.offset.set(0.08, 0.11);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(skW * 2.8, skL * 2.6), new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(1.5, 1.5, 1.55) }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(skX, 0.75, skZ);
  leftG.add(sky);

  // rafters
  const rz = [];
  const n = Math.max(4, Math.round(L / 2.5));
  for (let i = 0; i < n; i++) rz.push(zb + 0.55 + (i * (L - 1.1)) / (n - 1));
  for (const z of rz) box(s, 0.28, 0.19, mats.oak, 0, -0.14, z, rightG);
  for (const z of rz) if (z < sk.z0 - 0.5 || z > sk.z1 + 0.5) box(s, 0.28, 0.19, mats.oak, 0, -0.14, z, leftG);
  box(s, 0.28, 0.19, mats.oak, 0, -0.14, sk.z0 - 0.1, leftG);
  box(s, 0.28, 0.19, mats.oak, 0, -0.14, sk.z1 + 0.1, leftG);
  box(0.14, 0.2, skL + 0.02, mats.oak, sk.u0 - 0.08, -0.1, skZ, leftG);
  box(0.14, 0.2, skL + 0.02, mats.oak, sk.u1 + 0.08, -0.1, skZ, leftG);
  box(0.24, 0.34, L, mats.oak, 0, R - 0.25, 0);

  // ---------- back room ----------
  const bh = d.backHalf, bH = d.backH, bz = (zr + zb - d.wallT) / 2;
  box(0.2, bH, d.backDepth, mats.plaster, -bh - 0.1, bH / 2, bz);
  box(0.2, bH, d.backDepth, mats.plaster, bh + 0.1, bH / 2, bz);
  box(bh * 2 + 0.4, 0.2, d.backDepth + 0.2, mats.plaster, 0, bH + 0.1, bz);
  for (let i = 0; i < 4; i++) box(bh * 2, 0.2, 0.15, mats.oak, 0, bH - 0.1, zr + 0.8 + i * 1.5);
  const win = { hw: 2.2, y0: 0.35, y1: 2.8 };
  const bw = new THREE.Shape();
  bw.moveTo(-bh - 0.2, 0); bw.lineTo(bh + 0.2, 0); bw.lineTo(bh + 0.2, bH); bw.lineTo(-bh - 0.2, bH); bw.closePath();
  const wh = new THREE.Path();
  wh.moveTo(-win.hw, win.y0); wh.lineTo(-win.hw, win.y1); wh.lineTo(win.hw, win.y1); wh.lineTo(win.hw, win.y0); wh.closePath();
  bw.holes.push(wh);
  const bwm = new THREE.Mesh(new THREE.ExtrudeGeometry(bw, { depth: 0.25, bevelEnabled: false }), mats.plaster);
  bwm.position.z = zr - 0.25;
  bwm.castShadow = bwm.receiveShadow = true;
  scene.add(bwm);
  const garden = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.6), new THREE.MeshBasicMaterial({ map: tex.garden, color: new THREE.Color(1.45, 1.45, 1.4) }));
  garden.position.set(0, 1.9, zr - 1.8);
  scene.add(garden);
  for (let i = 0; i <= 4; i++) box(0.045, win.y1 - win.y0, 0.06, mats.black, -win.hw + (i * win.hw * 2) / 4, (win.y0 + win.y1) / 2, zr - 0.1, scene, false);
  for (const y of [win.y0, win.y0 + 0.8, win.y1]) box(win.hw * 2, 0.045, 0.06, mats.black, 0, y, zr - 0.1, scene, false);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xffe9cf, 0xc9ab8a, 0.95));

  const sun = new THREE.DirectionalLight(0xffe2bd, 4.4);
  const center = new THREE.Vector3(0, 2.5, (zf + zr) / 2);
  const rad = 0.5 * Math.hypot(d.W + 1.5, fl + 1, 6.5);
  sun.position.copy(center).addScaledVector(SUN_DIR, -(rad + 6));
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  Object.assign(sun.shadow.camera, { left: -rad, right: rad, top: rad, bottom: -rad, near: 1, far: rad * 2 + 12 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  // cool daylight bounce under the skylight
  const skyFill = new THREE.PointLight(0xf3f0ea, 12, 11, 2);
  skyFill.position.set(-hw * 0.45, H + 0.15, skZ);
  scene.add(skyFill);
  // window light in the back room
  const winFill = new THREE.PointLight(0xfff0d8, 30, 11, 2);
  winFill.position.set(0, 2.3, zr + 1.6);
  scene.add(winFill);

  // world-space skylight corners (underside of slab) for light shafts
  leftG.updateMatrixWorld(true);
  const corner = (u, z) => leftG.localToWorld(new THREE.Vector3(u, 0, z));
  const skylight = {
    a: corner(sk.u0 + 0.06, sk.z0 + 0.06), b: corner(sk.u1 - 0.06, sk.z0 + 0.06),
    c: corner(sk.u0 + 0.06, sk.z1 - 0.06), d: corner(sk.u1 - 0.06, sk.z1 - 0.06),
  };

  return { skylight, sun, floorSize: [d.W + 0.4, fl], floorZ: (zf + zr) / 2, zr, parquet: pq, arch };
}
