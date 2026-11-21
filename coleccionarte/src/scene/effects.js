import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SUN_DIR } from './room.js';

/** Glossy polished-floor reflection, blended over the lit floor. */
export function buildReflection(scene, room, grimeTex, quality) {
  const shader = {
    name: 'PolishedFloor',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      tGrime: { value: grimeTex }, strength: { value: 0.62 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv; varying vec3 vW;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform sampler2D tGrime; uniform float strength;
      varying vec4 vUv; varying vec3 vW;
      void main() {
        vec2 uv = vUv.xy / vUv.w;
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
        float g = texture2D(tGrime, vW.xz * 0.31).g;
        float g2 = texture2D(tGrime, vW.zx * 0.083 + 0.37).g;
        float rough = 0.0035 + 0.007 * smoothstep(0.35, 0.8, g2) + 0.004 * g;
        vec3 c = vec3(0.0);
        float ws = 0.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float r = sqrt((fi + 0.5) / 12.0);
          float a = fi * 2.39996;
          vec2 o = vec2(cos(a), sin(a) * 2.6) * r * rough;
          float w = 1.0 - 0.5 * r;
          c += texture2D(tDiffuse, uv + o).rgb * w;
          ws += w;
        }
        c /= ws;
        float a = strength * (0.2 + 0.8 * fres) * (0.72 + 0.5 * g);
        gl_FragColor = vec4(c, clamp(a, 0.0, 0.92));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const geo = new THREE.PlaneGeometry(room.floorSize[0], room.floorSize[1]);
  const refl = new Reflector(geo, { textureWidth: quality.reflection, textureHeight: quality.reflection, clipBias: 0.003, shader, multisample: 0 });
  refl.rotation.x = -Math.PI / 2;
  refl.position.set(0, 0.004, room.floorZ);
  refl.material.transparent = true;
  refl.material.depthWrite = false;
  refl.renderOrder = 0;
  scene.add(refl);
  return refl;
}

/** Soft volumetric shafts from the skylight along the sun direction. */
export function buildShafts(scene, room, d) {
  const { a, b, c } = room.skylight; // a→b along slope, a→c along z
  const slices = 7;
  const pos = [], uv = [];
  const lenTo = (p) => Math.min((d.zb - p.z) / SUN_DIR.z, (0 - p.y) / SUN_DIR.y);
  for (let i = 0; i < slices; i++) {
    const t = (i + 0.5) / slices;
    const p0 = a.clone().lerp(c, t), p1 = b.clone().lerp(room.skylight.d, t);
    const q0 = p0.clone().addScaledVector(SUN_DIR, lenTo(p0)), q1 = p1.clone().addScaledVector(SUN_DIR, lenTo(p1));
    pos.push(...p0.toArray(), ...p1.toArray(), ...q0.toArray(), ...p1.toArray(), ...q1.toArray(), ...q0.toArray());
    uv.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.72) }, uOpacity: { value: 0.085 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        // mullion gaps
        float bars = smoothstep(0.02, 0.06, abs(vUv.x - 0.5));
        float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - 0.75 * vUv.y);
        float streak = 0.55 + 0.45 * n(vec2(vUv.x * 9.0, vW.z * 0.6 + uTime * 0.03));
        float haze = 0.75 + 0.25 * n(vW.xy * 1.3 + vec2(uTime * 0.05, -uTime * 0.03));
        gl_FragColor = vec4(uColor * edge * bars * along * streak * haze * uOpacity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  return mat;
}

/** Dust motes: dense and bright inside the shaft, sparse elsewhere. */
export function buildDust(scene, room, d, count, pixelRatio) {
  const { a, b, c } = room.skylight;
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const inShaft = i < count * 0.6;
    if (inShaft) {
      p.copy(a).addScaledVector(b.clone().sub(a), Math.random()).addScaledVector(c.clone().sub(a), Math.random());
      const maxT = Math.min((d.zb - p.z) / SUN_DIR.z, -p.y / SUN_DIR.y);
      p.addScaledVector(SUN_DIR, Math.random() * maxT);
    } else {
      p.set((Math.random() - 0.5) * (d.W - 0.6), 0.2 + Math.random() * 3.6, d.zb + 0.3 + Math.random() * (d.L - 0.6));
    }
    p.toArray(pos, i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), inShaft ? 1 : 0.28], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uPR: { value: pixelRatio } },
    vertexShader: /* glsl */ `attribute vec4 aSeed; uniform float uTime; uniform float uScale; uniform float uPR; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.05 + aSeed.x * 0.06);
        p.x += sin(t * 1.7 + aSeed.y * 40.0) * 0.14 + sin(t * 0.6 + aSeed.z * 9.0) * 0.1;
        p.y += sin(t * 1.1 + aSeed.x * 50.0) * 0.12 - mod(uTime * 0.008 * (0.5 + aSeed.z), 0.3);
        p.z += cos(t * 1.3 + aSeed.z * 30.0) * 0.14;
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y) + aSeed.x * 60.0);
        float dist = -mv.z;
        vA = aSeed.w * tw * smoothstep(0.35, 1.2, dist) * smoothstep(16.0, 6.0, dist);
        gl_PointSize = (1.2 + aSeed.z * 2.2) * uScale * uPR * (3.2 / dist);
      }`,
    fragmentShader: /* glsl */ `varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, r) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.74) * a * 0.75, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  scene.add(pts);
  return mat;
}

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.46 }, uGrain: { value: 0.022 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // gentle filmic contrast + warm grade
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.34);
      c = pow(c, vec3(1.06));
      c *= vec3(1.03, 0.99, 0.93);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.06);
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 0.85)));
      c *= mix(1.0 - uVignette, 1.0, v);
      c += (h(vUv * 913.0 + fract(uTime) * 17.0) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function buildComposer(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.26, 0.8, 0.92);
  bloom.enabled = quality.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  return { composer, bloom, final };
}
