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

/** Upholstered wrap-around back/arm pad of a tub chair, with rounded arm ends. */
function tubBack({ rMid = 0.5, thick = 0.24, span = Math.PI * 1.36, hBack = 0.76, hArm = 0.6, y0 = 0.05, NU = 72, NV = 28 } = {}) {
  const pos = [], uv = [], idx = [];
  const arc = span * rMid;
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const phi = Math.PI - span / 2 + span * u;
    // rounded ends: the pad narrows along a quarter circle
    const e = Math.min(1, (Math.min(u, 1 - u) * arc) / (thick * 0.5));
    const k = Math.max(0.02, Math.sqrt(1 - (1 - e) * (1 - e)));
    const c = Math.cos((u - 0.5) * Math.PI); // 1 at the back, 0 at the arm tips
    const top = hArm + (hBack - hArm) * Math.pow(Math.max(0, c), 1.4) - (1 - k) * 0.05;
    const yMid = (top + y0) / 2, hh = (top - y0) / 2;
    for (let j = 0; j <= NV; j++) {
      const th = -Math.PI / 2 + (j / NV) * Math.PI * 2; // seam at the bottom
      const cs = Math.cos(th), sn = Math.sin(th);
      const px = Math.sign(cs) * Math.pow(Math.abs(cs), 0.55), py = Math.sign(sn) * Math.pow(Math.abs(sn), 0.45);
      // lean the pad slightly outwards towards the top
      const r = rMid + (thick / 2) * k * px + 0.035 * (py + 1) * 0.5;
      const y = yMid + hh * py;
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
      uv.push(u * 1.6, j / NV);
    }
  }
  const row = NV + 1;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function armchair(mats) {
  const g = new THREE.Group();
  // recessed swivel plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32), mats.bronze);
  plinth.position.y = 0.025;
  g.add(shadowed(plinth));
  const base = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve([V2(0, 0.045), V2(0.4, 0.045), V2(0.47, 0.07), V2(0.5, 0.16), V2(0.5, 0.24), V2(0.47, 0.3), V2(0.4, 0.32), V2(0, 0.32)]).getPoints(30), 48), mats.boucle);
  g.add(shadowed(base));
  // plump seat cushion
  const seat = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve([V2(0, 0.0), V2(0.3, 0.0), V2(0.4, 0.02), V2(0.435, 0.07), V2(0.4, 0.125), V2(0.28, 0.15), V2(0, 0.155)]).getPoints(26), 48), mats.boucle);
  seat.position.set(0, 0.3, 0.05);
  g.add(shadowed(seat));
  const back = new THREE.Mesh(tubBack(), mats.boucle);
  back.material.side = THREE.DoubleSide;
  g.add(shadowed(back));
  return g;
}

/** Deep-buttoned leather cushion. */
function tuftedCushion(w, h, dp, nx, nz) {
  const geo = new THREE.BoxGeometry(w, h, dp, Math.round(w * 44), 4, Math.round(dp * 44));
  const p = geo.attributes.position;
  const cx = w / nx, cz = dp / nz;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // rounded shoulders
    const ex = Math.min(1, (w / 2 - Math.abs(x)) / 0.05), ez = Math.min(1, (dp / 2 - Math.abs(z)) / 0.05);
    const edge = Math.sqrt(Math.max(0, 1 - (1 - ex) * (1 - ex))) * Math.sqrt(Math.max(0, 1 - (1 - ez) * (1 - ez)));
    const t = (y + h / 2) / h; // 0 bottom → 1 top
    if (t > 0.5) {
      // buttons sit on the cell corners; cushions swell in between
      const u = (x + w / 2) / cx, v = (z + dp / 2) / cz;
      const fu = Math.abs(u - Math.round(u)), fv = Math.abs(v - Math.round(v));
      const dist = Math.hypot(fu * cx, fv * cz);
      const inner = Math.round(u) > 0 && Math.round(u) < nx && Math.round(v) > 0 && Math.round(v) < nz;
      const dimple = inner ? Math.exp(-(dist * dist) / 0.0011) : 0;
      const seam = Math.min(fu * cx, fv * cz); // pleats run along the grid lines
      const pleat = Math.exp(-(seam * seam) / 0.0004) * 0.35;
      const yy = h / 2 - 0.045 * (1 - edge) - 0.03 * dimple - 0.01 * pleat * edge;
      p.setY(i, y + (yy - h / 2) * ((t - 0.5) * 2));
    }
    // slight bulge of the sides
    const s = 1 + 0.012 * Math.sin(t * Math.PI);
    p.setX(i, x * s); p.setZ(i, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function bench(mats) {
  const g = new THREE.Group();
  const L = 1.95, D = 0.62;
  const cushion = new THREE.Mesh(tuftedCushion(L, 0.17, D, 7, 3), mats.leather);
  cushion.position.y = 0.4;
  g.add(shadowed(cushion));
  const btnGeo = new THREE.SphereGeometry(0.011, 10, 8);
  for (let i = 1; i < 7; i++) for (let j = 1; j < 3; j++) {
    const btn = new THREE.Mesh(btnGeo, mats.leather);
    btn.scale.y = 0.5;
    btn.position.set(-L / 2 + (i * L) / 7, 0.4 + 0.085 - 0.029, -D / 2 + (j * D) / 3);
    g.add(btn);
  }
  const frame = new THREE.Mesh(new RoundedBoxGeometry(L - 0.02, 0.07, D - 0.02, 3, 0.012), mats.leather);
  frame.position.y = 0.285;
  g.add(shadowed(frame));
  const rail = new THREE.Mesh(new THREE.BoxGeometry(L - 0.14, 0.022, D - 0.14), mats.black);
  rail.position.y = 0.24;
  g.add(shadowed(rail));
  for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) for (const z of [-D / 2 + 0.09, D / 2 - 0.09]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.24, 10), mats.black);
    leg.position.set(x, 0.12, z);
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
  const RAD = 0.72, HT = 0.6;
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * (Math.PI / 2);
    pts.push(V2(0.08 + (RAD - 0.08) * Math.pow(Math.cos(t), 0.85), HT * Math.pow(Math.sin(t), 0.9)));
  }
  const wick = wickerTexture();
  wick.repeat.set(2, 1);
  const geo = new THREE.LatheGeometry(pts, 72);
  // the weave seen from outside (lit by the room) and from inside (lit by the bulb)
  const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: wick, alphaTest: 0.5, side: THREE.FrontSide, color: new THREE.Color(0.92, 0.68, 0.43) }));
  const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: wick, alphaTest: 0.5, side: THREE.BackSide, color: new THREE.Color(1.55, 1.08, 0.6) }));
  g.add(inner, outer);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RAD, 0.012, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.42, 0.24) }));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 20), mats.twig);
  capM.position.y = HT;
  g.add(capM);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.4) }));
  bulb.position.y = 0.16;
  g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softShadowTexture(true), color: new THREE.Color(1.0, 0.62, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
  glow.scale.setScalar(1.5);
  glow.position.y = 0.2;
  g.add(glow);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), mats.black);
  g.userData.setHeight = (y) => {
    g.position.y = y;
    const len = Math.max(0.05, ridgeY - 0.4 - (y + HT));
    cord.scale.y = len;
    cord.position.y = HT + len / 2;
  };
  g.add(cord);
  const light = new THREE.PointLight(0xffb46e, 20, 11, 2);
  light.position.y = 0.02;
  g.add(light);
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
  table.position.set(0.5, 0, cz + 0.25);
  scene.add(table);
  contact(blobTex, 1.9, 1.9, 0.5, cz + 0.25, 0, 0.55);

  const b = bench(mats);
  b.position.set(-1.45, 0, cz + 0.45);
  b.rotation.y = 0.42;
  scene.add(b);
  contact(rectTex, 2.3, 1.0, -1.45, cz + 0.45, 0.42, 0.45);

  const chairs = [[1.95, cz - 0.6, -1.0], [2.05, cz + 1.55, -2.0]];
  for (const [x, z, rot] of chairs) {
    const c = armchair(mats);
    c.scale.setScalar(1.0);
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    scene.add(c);
    contact(blobTex, 1.75, 1.75, x, z, 0, 0.6);
  }

  const lamp = pendant(mats, d.R);
  lamp.position.set(0.5, 0, cz + 0.25);
  lamp.userData.setHeight(Math.min(2.5, d.R - 1.9));
  scene.add(lamp);

  // tall vase with olive branches beside the arch
  const ux = d.hw - 0.75;
  const urn = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve([V2(0.1, 0), V2(0.2, 0.06), V2(0.25, 0.3), V2(0.19, 0.52), V2(0.09, 0.62), V2(0.1, 0.68)]).getPoints(24), 32), mats.ceramic);
  urn.position.set(ux, 0, d.zb + 0.7);
  scene.add(shadowed(urn));
  const tall = branches(mats, { n: 9, height: 1.45, spread: 0.55, seed: 21, leafSize: 0.05 });
  tall.position.set(ux, 0.55, d.zb + 0.7);
  scene.add(tall);
  contact(blobTex, 1.0, 1.0, ux, d.zb + 0.7, 0, 0.5);

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
