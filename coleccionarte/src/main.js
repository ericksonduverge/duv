import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { manager, loadMaterials } from './scene/textures.js';
import { roomDims, buildRoom } from './scene/room.js';
import { computeLayout, buildArtworks } from './scene/artworks.js';
import { buildFurniture } from './scene/furniture.js';
import { buildReflection, buildShafts, buildDust, buildComposer } from './scene/effects.js';
import { createUI, isSheet } from './ui.js';

const api = { ready: false, count: 0, focus() {}, close() {} };
window.__gallery = api;

const coarse = window.matchMedia('(pointer: coarse)').matches;
const small = Math.min(window.innerWidth, window.innerHeight) < 700;
const mobile = coarse || small;
const quality = mobile
  ? { shadow: 2048, reflection: 512, msaa: 2, bloom: true, dust: 320, maxPR: 1.5, minPR: 0.85 }
  : { shadow: 4096, reflection: 1024, msaa: 4, bloom: true, dust: 700, maxPR: 2, minPR: 1 };

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function init() {
  const canvas = document.getElementById('scene');
  const res = await fetch('/data/artworks.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('No se pudo cargar la colección');
  const json = await res.json();
  const gallery = json.gallery || {};
  const artworks = Array.isArray(json.artworks) ? json.artworks.filter((a) => a && a.image) : [];
  const N = artworks.length;
  api.count = N;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPR);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9e8f6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 80);

  // ---------- build ----------
  const ui = createUI({ gallery, artworks, actions: { focus: (i) => focus(i), close: () => close(), next: () => step(1), prev: () => step(-1) } });
  let loaded = 0, total = 1;
  manager.onProgress = (_u, l, t) => { loaded = l; total = t; ui.setProgress(l / Math.max(t, 16)); };

  const assets = await loadMaterials();
  const layout = computeLayout(artworks);
  const d = roomDims(layout.L);
  d.fz = d.zf - 5.3; // centre of the seating group, in front of the visitor
  const room = buildRoom(scene, assets, d, quality);
  buildFurniture(scene, assets, d, room);
  const { items, hit } = await buildArtworks(scene, assets, d, artworks, layout.slots);
  buildReflection(scene, room, assets.tex.concrete, quality);
  const shaftMat = buildShafts(scene, room, d);
  const dustMat = buildDust(scene, room, d, quality.dust, pixelRatio);
  const { composer, bloom, final } = buildComposer(renderer, scene, camera, quality);
  ui.setProgress(1);

  // ---------- camera rig ----------
  const view = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 60 };
  const from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 60 };
  const to = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 60 };
  let flyT = 1, flyDur = 1, lift = 0;
  let focused = -1, lastIndex = -1, hovered = -1;

  const overviewPose = () => {
    const portrait = camera.aspect < 0.9;
    return {
      pos: new THREE.Vector3(0.12, 1.62, d.zf - 0.5),
      tgt: new THREE.Vector3(0.05, portrait ? 1.7 : 1.92, d.zb),
      fov: portrait ? 84 : camera.aspect < 1.4 ? 70 : 63,
    };
  };

  const focusPose = (i) => {
    const it = items[i];
    const vw = window.innerWidth, vh = window.innerHeight;
    const sheet = isSheet();
    const fov = sheet ? 58 : 44;
    const area = ui.freeArea();
    const fw = Math.max(0.3, (area.x1 - area.x0) / vw), fh = Math.max(0.25, (area.y1 - area.y0) / vh);
    const cx = ((area.x0 + area.x1) / vw) - 1; // NDC centre of free area
    const cy = 1 - ((area.y0 + area.y1) / vh);
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tanH = tanV * (vw / vh);
    const margin = sheet ? 1.1 : 1.16;
    let dist = Math.max((it.w * margin) / (2 * tanH * fw), (it.h * margin) / (2 * tanV * fh), 1.15);
    dist = Math.min(dist, d.W - 0.7);
    const right = new THREE.Vector3().crossVectors(it.normal.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    const angle = sheet ? 0 : 0.22; // slight three-quarter view on desktop
    const k = 1 / (1 - angle);
    const sx = -cx * dist * tanH * k, sy = -cy * dist * tanV;
    const pos = it.center.clone().addScaledVector(it.normal, dist).addScaledVector(right, sx);
    pos.y += sy;
    pos.y = THREE.MathUtils.clamp(pos.y, 0.9, 2.6);
    pos.z = THREE.MathUtils.clamp(pos.z, d.zb + 0.5, d.zf - 0.4);
    const perp = pos.clone().addScaledVector(it.normal, -dist);
    const tgt = perp.lerp(it.center, angle);
    tgt.y = pos.y; // keep verticals straight
    if (sheet) {
      // bottom sheet: stay at eye level and tilt down so the work sits in the free upper area
      pos.y = THREE.MathUtils.clamp(it.center.y - 0.1, 1.2, 2.2);
      tgt.y = pos.y - dist * cy * tanV + (it.center.y - pos.y);
    }
    return { pos, tgt, fov };
  };

  const fly = (pose, dur) => {
    from.pos.copy(view.pos); from.tgt.copy(view.tgt); from.fov = view.fov;
    to.pos.copy(pose.pos); to.tgt.copy(pose.tgt); to.fov = pose.fov;
    const dist = from.pos.distanceTo(to.pos);
    flyDur = dur ?? THREE.MathUtils.clamp(1.5 + dist * 0.14, 1.6, 2.9);
    lift = Math.min(0.12, dist * 0.012);
    flyT = 0;
  };
  const snap = (pose) => { view.pos.copy(pose.pos); view.tgt.copy(pose.tgt); view.fov = pose.fov; to.pos.copy(pose.pos); to.tgt.copy(pose.tgt); to.fov = pose.fov; flyT = 1; };

  function focus(i, instant = false) {
    if (!N) return;
    i = ((Math.round(Number(i)) % N) + N) % N;
    focused = lastIndex = i;
    drag.yaw = 0;
    ui.showDetail(i);
    const pose = focusPose(i);
    instant ? snap(pose) : fly(pose);
    const a = artworks[i];
    history.replaceState(null, '', `#/obra/${a.id ?? i + 1}${a.slug ? '-' + a.slug : ''}`);
  }
  function close(instant = false) {
    if (focused < 0 && flyT >= 1) return;
    focused = -1;
    ui.hideDetail();
    instant ? snap(overviewPose()) : fly(overviewPose());
    history.replaceState(null, '', location.pathname + location.search);
  }
  function step(dir) {
    if (!N) return;
    focus(lastIndex < 0 ? (dir > 0 ? 0 : N - 1) : lastIndex + dir);
  }
  api.focus = (i) => focus(i);
  api.close = () => close();

  snap(overviewPose());

  // ---------- pointer ----------
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, ndc: new THREE.Vector2(), dirty: false, inside: false };
  const drag = { active: false, id: -1, x0: 0, y0: 0, t0: 0, moved: 0, yaw: 0, yawS: 0, lastX: 0 };
  const ray = new THREE.Raycaster();
  const pick = (cx, cy) => {
    pointer.ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(pointer.ndc, camera);
    const h = ray.intersectObjects(hit, false)[0];
    return h ? h.object.userData.index : -1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    drag.active = true; drag.id = e.pointerId; drag.x0 = drag.lastX = e.clientX; drag.y0 = e.clientY; drag.t0 = performance.now(); drag.moved = 0;
  });
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    if (e.pointerType === 'mouse') { pointer.cx = e.clientX; pointer.cy = e.clientY; pointer.dirty = true; pointer.inside = e.target === canvas; }
    if (drag.active && e.pointerId === drag.id) {
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
      if (e.pointerType !== 'mouse' && focused < 0) {
        drag.yaw = THREE.MathUtils.clamp(drag.yaw + ((e.clientX - drag.lastX) / window.innerWidth) * 1.4, -0.75, 0.75);
      }
      drag.lastX = e.clientX;
    }
  });
  const endDrag = (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    if (e.type === 'pointerup' && e.target === canvas && drag.moved < 9 && performance.now() - drag.t0 < 600) {
      const i = pick(e.clientX, e.clientY);
      if (i >= 0 && i !== focused) focus(i);
    }
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---------- resize ----------
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    dustMat.uniforms.uPR.value = pixelRatio;
    dustMat.uniforms.uScale.value = h / 900;
    if (flyT >= 1) snap(focused >= 0 ? focusPose(focused) : overviewPose());
    else { const p = focused >= 0 ? focusPose(focused) : overviewPose(); to.pos.copy(p.pos); to.tgt.copy(p.tgt); to.fov = p.fov; }
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ---------- loop ----------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3(), rightV = new THREE.Vector3();
  let time = 0, frames = 0, slowAcc = 0, slowN = 0, settled = false;
  renderer.shadowMap.needsUpdate = true;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    if (flyT < 1) {
      flyT = Math.min(1, flyT + dt / flyDur);
      const k = easeInOut(flyT);
      view.pos.lerpVectors(from.pos, to.pos, k);
      view.pos.y += Math.sin(k * Math.PI) * lift;
      view.tgt.lerpVectors(from.tgt, to.tgt, easeInOut(Math.min(1, flyT * 1.12)));
      view.fov = THREE.MathUtils.lerp(from.fov, to.fov, k);
    }
    const detail = focused >= 0;
    const sm = 1 - Math.exp(-dt * 2.6);
    pointer.sx += (pointer.x - pointer.sx) * sm;
    pointer.sy += (pointer.y - pointer.sy) * sm;
    drag.yawS += (drag.yaw - drag.yawS) * (1 - Math.exp(-dt * 7));
    const amp = coarse ? 0 : detail ? 0.018 : 0.07;
    const breathe = detail ? 0.45 : 1;

    camera.position.copy(view.pos);
    camera.lookAt(view.tgt);
    rightV.setFromMatrixColumn(camera.matrixWorld, 0);
    camera.position.addScaledVector(rightV, (Math.sin(time * 0.31) * 0.018 + pointer.sx * (detail ? 0.03 : 0.1)) * breathe);
    camera.position.y += Math.sin(time * 0.52) * 0.011 * breathe;
    camera.lookAt(tmp.copy(view.tgt));
    camera.rotateY(-pointer.sx * amp + drag.yawS + Math.sin(time * 0.23) * 0.004);
    camera.rotateX(-pointer.sy * amp * 0.5);
    if (camera.fov !== view.fov) { camera.fov = view.fov; }
    camera.updateProjectionMatrix();

    // hover
    if (pointer.dirty && !coarse) {
      pointer.dirty = false;
      camera.updateMatrixWorld();
      const h = pointer.inside ? pick(pointer.cx, pointer.cy) : -1;
      hovered = h === focused ? -1 : h;
      ui.setCursor(hovered >= 0);
    }
    for (let i = 0; i < items.length; i++) {
      const target = i === focused ? 0.52 : i === hovered ? 0.6 : 0.4;
      const m = items[i].material;
      m.emissiveIntensity += (target - m.emissiveIntensity) * (1 - Math.exp(-dt * 6));
    }

    shaftMat.uniforms.uTime.value = time;
    dustMat.uniforms.uTime.value = time;
    final.uniforms.uTime.value = time;
    composer.render(dt);

    // first frames → ready
    frames++;
    if (!api.ready && frames >= 3) {
      api.ready = true;
      ui.setLoaded();
      const m = location.hash.match(/^#\/obra\/([^/]+)/);
      if (m) {
        const key = decodeURIComponent(m[1]);
        const idx = artworks.findIndex((a, i) => key === `${a.id ?? i + 1}${a.slug ? '-' + a.slug : ''}` || key === String(a.id) || key === a.slug);
        if (idx >= 0) setTimeout(() => focus(idx), 500);
      }
      setTimeout(() => { settled = true; }, 2500);
    }
    // adaptive resolution: keep the tour fluid on weaker GPUs
    if (settled && !document.hidden) {
      slowAcc += dt; slowN++;
      if (slowN >= 50) {
        const avg = slowAcc / slowN;
        slowAcc = 0; slowN = 0;
        if (avg > 1 / 44) {
          if (pixelRatio > quality.minPR + 0.01) { pixelRatio = Math.max(quality.minPR, pixelRatio - 0.25); resize(); }
          else if (bloom.enabled) bloom.enabled = false;
        }
      }
    }
  };
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => { clock.getDelta(); slowAcc = 0; slowN = 0; });
}

init().catch((err) => {
  console.error(err);
  const msg = document.getElementById('loaderMsg');
  if (msg) msg.textContent = 'No se pudo cargar la galería. Intente de nuevo.';
});
