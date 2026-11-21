import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { softShadowTexture, wickerTexture } from './textures.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const V2 = (x, y) => new THREE.Vector2(x, y);
const shadowed = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

function armchair(mats) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0.03), V2(0.44, 0.03), V2(0.5, 0.08), V2(0.51, 0.3), V2(0.47, 0.4), V2(0.38, 0.43), V2(0, 0.43)], 40), mats.boucle);
  g.add(shadowed(base));
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.43, 32, 16), mats.boucle);
  seat.scale.set(1, 0.24, 1);
  seat.position.set(0, 0.43, 0.04);
  g.add(shadowed(seat));
  // wrap-around back
  const prof = [V2(0.5, 0.06), V2(0.4, 0.1), V2(0.37, 0.3), V2(0.36, 0.62), V2(0.39, 0.72), V2(0.47, 0.77), V2(0.56, 0.73), V2(0.61, 0.6), V2(0.62, 0.2), V2(0.58, 0.07), V2(0.5, 0.06)];
  const span = Math.PI * 1.22;
  const back = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(28), 44, Math.PI - span / 2, span), mats.boucle);
  g.add(shadowed(back));
  for (const sgn of [-1, 1]) {
    const phi = Math.PI + (sgn * span) / 2;
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.45, 8, 16), mats.boucle);
    cap.position.set(0.49 * Math.sin(phi), 0.41, 0.49 * Math.cos(phi));
    g.add(shadowed(cap));
  }
  return g;
}

function bench(mats) {
  const g = new THREE.Group();
  for (const x of [-0.475, 0.475]) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.94, 0.15, 0.6, 5, 0.045), mats.leather);
    c.position.set(x, 0.43, 0);
    g.add(shadowed(c));
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.05, 0.56), mats.leather);
  frame.position.y = 0.335;
  g.add(shadowed(frame));
  for (const x of [-0.85, 0.85]) for (const z of [-0.23, 0.23]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.31, 8), mats.black);
    leg.position.set(x, 0.155, z);
    g.add(shadowed(leg));
  }
  return g;
}

function branches(mats, { n = 6, height = 0.6, spread = 0.3, seed = 1, leafSize = 0.03 }) {
  const r = rng(seed);
  const g = new THREE.Group();
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2, lean = spread * (0.4 + r() * 0.8), h = height * (0.7 + r() * 0.4);
    const pts = [0, 0.35, 0.7, 1].map((t) => new THREE.Vector3(
      Math.cos(ang) * lean * t * t + (r() - 0.5) * 0.04 * t, h * t, Math.sin(ang) * lean * t * t + (r() - 0.5) * 0.04 * t));
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0045 + height * 0.002, 5), mats.twig)));
    const nl = 10 + Math.floor(r() * 8);
    for (let k = 0; k < nl; k++) {
      const t = 0.35 + (0.65 * k) / nl;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      leaves.push({ p, tan, a: r() * Math.PI * 2, s: leafSize * (0.7 + r() * 0.7) });
    }
  }
  const geo = new THREE.SphereGeometry(1, 6, 4);
  geo.scale(0.33, 1, 0.08);
  geo.translate(0, 1, 0);
  const inst = new THREE.InstancedMesh(geo, mats.leaf, leaves.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  leaves.forEach((l, i) => {
    const out = new THREE.Vector3(Math.cos(l.a), 0.5, Math.sin(l.a)).addScaledVector(l.tan, 0.8).normalize();
    q.setFromUnitVectors(up, out);
    q2.setFromAxisAngle(out, l.a);
    m.compose(l.p, q2.multiply(q), new THREE.Vector3(l.s, l.s, l.s));
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  g.add(inst);
  return g;
}

function coffeeTable(mats) {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x17120e, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2, transparent: true, opacity: 0.9 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.028, 72), glass);
  top.position.y = 0.4;
  g.add(shadowed(top));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 0.385, 48), mats.bronze);
  base.position.y = 0.1925;
  g.add(shadowed(base));
  // books
  const cover = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.7 });
  const cover2 = new THREE.MeshStandardMaterial({ color: 0x8c8375, roughness: 0.7 });
  [[0.34, 0.03, 0.25, 0.415 + 0.015, 0.12, cover2], [0.31, 0.028, 0.23, 0.415 + 0.044, -0.08, cover]].forEach(([w, h, dz, y, rot, mat]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), mat);
    b.position.set(-0.22, y, 0.22);
    b.rotation.y = rot;
    g.add(shadowed(b));
  });
  // brass bowl
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0.0), V2(0.06, 0.0), V2(0.11, 0.03), V2(0.135, 0.075), V2(0.128, 0.075), V2(0.105, 0.035), V2(0.055, 0.012), V2(0, 0.012)], 32), mats.brass);
  bowl.position.set(0.36, 0.415, 0.2);
  g.add(shadowed(bowl));
  // smoked glass vase + branches
  const vaseMat = new THREE.MeshPhysicalMaterial({ color: 0x4a3a2c, roughness: 0.06, transparent: true, opacity: 0.62, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false });
  const vase = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve([V2(0.05, 0), V2(0.1, 0.03), V2(0.12, 0.12), V2(0.08, 0.22), V2(0.04, 0.27), V2(0.045, 0.31)]).getPoints(20), 32), vaseMat);
  vase.position.set(0.05, 0.415, -0.12);
  vase.castShadow = true;
  g.add(vase);
  const br = branches(mats, { n: 7, height: 0.6, spread: 0.3, seed: 7, leafSize: 0.028 });
  br.position.set(0.05, 0.6, -0.12);
  g.add(br);
  return g;
}

function pendant(mats, ridgeY) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * (Math.PI / 2);
    pts.push(V2(0.07 + 0.57 * Math.cos(t), 0.5 * Math.sin(t)));
  }
  const wick = wickerTexture();
  wick.repeat.set(2, 1);
  const shade = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), new THREE.MeshBasicMaterial({ map: wick, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(1.2, 0.98, 0.74) }));
  g.add(shade);
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20), mats.twig);
  capM.position.y = 0.5;
  g.add(capM);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.4) }));
  bulb.position.y = 0.13;
  g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softShadowTexture(true), color: new THREE.Color(1.0, 0.62, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.scale.setScalar(1.25);
  glow.position.y = 0.16;
  g.add(glow);
  const cordLen = ridgeY - 0.4;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), mats.black);
  g.userData.setHeight = (y) => {
    g.position.y = y;
    const len = ridgeY - 0.4 - (y + 0.5);
    cord.scale.y = len;
    cord.position.y = 0.5 + len / 2;
  };
  g.add(cord);
  const light = new THREE.PointLight(0xffb46e, 17, 11, 2);
  light.position.y = 0.05;
  g.add(light);
  void cordLen;
  return g;
}

function diningSet(mats) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 1.0), mats.oak);
  top.position.y = 0.75;
  g.add(shadowed(top));
  for (const x of [-1.05, 1.05]) for (const z of [-0.38, 0.38]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.73, 0.07), mats.oak);
    leg.position.set(x, 0.365, z);
    g.add(leg);
  }
  for (const x of [-0.75, 0, 0.75]) for (const s of [-1, 1]) {
    const c = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), mats.oakLight);
    seat.position.y = 0.46;
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.035), mats.oakLight);
    bk.position.set(0, 0.72, 0.2);
    c.add(seat, bk);
    for (const lx of [-0.19, 0.19]) for (const lz of [-0.19, 0.19]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.03), mats.oakLight);
      l.position.set(lx, 0.225, lz);
      c.add(l);
    }
    c.position.set(x, 0, s * 0.72);
    c.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(c);
  }
  return g;
}

export function buildFurniture(scene, { mats }, d, room) {
  const blobTex = softShadowTexture(true), rectTex = softShadowTexture(false);
  const contact = (tex, w, l, x, z, rot = 0, op = 0.5) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: tex, color: 0x120a04, transparent: true, opacity: op, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set(x, 0.007, z);
    m.renderOrder = 3;
    scene.add(m);
  };
  const cz = d.fz - 0.25;

  const table = coffeeTable(mats);
  table.position.set(0.2, 0, cz + 0.25);
  scene.add(table);
  contact(blobTex, 1.9, 1.9, 0.2, cz + 0.25, 0, 0.55);

  const b = bench(mats);
  b.position.set(-1.55, 0, cz + 0.55);
  b.rotation.y = Math.PI / 2 - 0.5;
  scene.add(b);
  contact(rectTex, 2.2, 0.95, -1.55, cz + 0.55, Math.PI / 2 - 0.5, 0.42);

  const chairs = [[1.75, cz - 0.55, -1.05], [2.0, cz + 1.75, -2.1]];
  for (const [x, z, rot] of chairs) {
    const c = armchair(mats);
    c.scale.setScalar(1.02);
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    scene.add(c);
    contact(blobTex, 1.75, 1.75, x, z, 0, 0.6);
  }

  const lamp = pendant(mats, d.R);
  lamp.position.set(0.2, 0, cz + 0.25);
  lamp.userData.setHeight(2.62);
  scene.add(lamp);

  // tall vase with olive branches beside the arch
  const urn = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve([V2(0.1, 0), V2(0.2, 0.06), V2(0.25, 0.3), V2(0.19, 0.52), V2(0.09, 0.62), V2(0.1, 0.68)]).getPoints(24), 32), mats.ceramic);
  urn.position.set(2.75, 0, d.zb + 0.75);
  scene.add(shadowed(urn));
  const tall = branches(mats, { n: 9, height: 1.45, spread: 0.55, seed: 21, leafSize: 0.05 });
  tall.position.set(2.75, 0.55, d.zb + 0.75);
  scene.add(tall);
  contact(blobTex, 1.0, 1.0, 2.75, d.zb + 0.75, 0, 0.5);

  // back room: sculpture on a plinth + dining table
  const zr = room.zr;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.0, 0.42), mats.plaster);
  plinth.position.set(-2.1, 0.5, d.zb - 2.0);
  scene.add(shadowed(plinth));
  const sculpt = new THREE.Mesh(new THREE.TorusKnotGeometry(0.15, 0.065, 96, 16, 2, 3), mats.bronze);
  sculpt.scale.set(1, 1.5, 1);
  sculpt.position.set(-2.1, 1.36, d.zb - 2.0);
  scene.add(shadowed(sculpt));
  const dining = diningSet(mats);
  dining.position.set(0.5, 0, zr + 2.0);
  scene.add(dining);
  contact(rectTex, 3.2, 2.6, 0.5, zr + 2.0, 0, 0.4);
}
