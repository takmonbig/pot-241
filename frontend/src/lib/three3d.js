// Shared realistic three.js stage: PBR + environment reflections + ACES tone mapping + soft shadows
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export { THREE };

export function createStage(mount, { fov = 45, near = 0.1, far = 400, ortho = null, exposure = 1.1, shadows = true, envIntensity = 1, bg = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5 && !mobile, alpha: !bg, powerPreference: "high-performance", stencil: false });
  let pr = Math.min(mobile ? 1.25 : 1.5, dpr);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const tier = gpuTier(renderer, mobile); // 0 = low (software / weak), 1 = medium (phones), 2 = high
  if (tier === 0) pr = Math.min(pr, 1);
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = shadows && tier === 2;
  const scene = new THREE.Scene();
  if (bg) scene.background = new THREE.Color(bg);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // hemisphere fill replaces image-based lighting when reflections are off
  const hemi = new THREE.HemisphereLight(0xffffff, 0x302028, 0);
  scene.add(hemi);
  const setEnv = (on) => {
    scene.environment = on ? envTex : null;
    hemi.intensity = on ? 0 : 1.6 * envIntensity;
    // pure metals look black without reflections -> soften them while env is off
    scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        if (m.metalness === undefined) return;
        if (m.userData.baseMetal === undefined) m.userData.baseMetal = m.metalness;
        m.metalness = on ? m.userData.baseMetal : Math.min(m.userData.baseMetal, 0.35);
      });
    });
  };
  setEnv(tier > 0);
  let envFixed = false;
  scene.environmentIntensity = envIntensity;

  const camera = ortho
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, near, far)
    : new THREE.PerspectiveCamera(fov, 1, near, far);

  const resize = () => {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    const a = w / h;
    if (ortho) Object.assign(camera, { left: (-ortho * a) / 2, right: (ortho * a) / 2, top: ortho / 2, bottom: -ortho / 2 });
    else camera.aspect = a;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  let raf = 0;
  let last = performance.now();
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(mount);
  // adaptive resolution: drop pixel ratio (then shadows) when frames get slow
  let acc = 0; let frames = 0;
  const adapt = (dt) => {
    acc += dt; frames++;
    if (acc < 1.2) return;
    const avg = acc / frames; acc = 0; frames = 0;
    if (!scene.environment) setEnv(false); // soften metals on meshes added since last check
    const refresh = () => scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    if (avg > 0.024 && renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; refresh(); }
    else if (avg > 0.024 && scene.environment) { setEnv(false); refresh(); }
    else if (avg > 0.024 && pr > 0.75) { pr = Math.max(0.75, pr - 0.25); renderer.setPixelRatio(pr); resize(); }
    else if (avg < 0.0135 && pr < Math.min(1.5, dpr)) { pr = Math.min(Math.min(1.5, dpr), pr + 0.25); renderer.setPixelRatio(pr); resize(); }
  };
  const start = (fn) => {
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        if (!envFixed) { envFixed = true; if (!scene.environment) setEnv(false); }
        fn?.(dt, now);
        renderer.render(scene, camera);
        adapt(dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };

  const dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => { mm.map?.dispose?.(); mm.dispose?.(); });
    });
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  };
  return { renderer, scene, camera, start, dispose, resize, tier };
}

let cachedTier = null;
function gpuTier(renderer, mobile) {
  if (cachedTier !== null) return cachedTier;
  let name = "";
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  } catch { /* ignore */ }
  const weak = /swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [1-5]\d\d|powervr|intel\(r\) hd graphics [2-5]/.test(name);
  cachedTier = weak ? 0 : mobile ? 1 : 2;
  return cachedTier;
}

export function addStudioLights(scene, { key = 0xffffff, keyI = 2.2, fill = 0xff3355, fillI = 30, ambient = 0.35, shadowSize = 12, keyPos = [6, 12, 6] } = {}) {
  scene.add(new THREE.AmbientLight(0xffffff, ambient));
  const sun = new THREE.DirectionalLight(key, keyI);
  sun.position.set(...keyPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 0.5, far: 80 });
  scene.add(sun, sun.target);
  const rim = new THREE.PointLight(fill, fillI, 40, 2);
  rim.position.set(-6, 5, -5);
  scene.add(rim);
  return { sun, rim };
}

/** Canvas-texture text sprite (always faces camera). */
export function textSprite(text, { size = 64, color = "#ffffff", bg = null, font = "800 {s}px 'JetBrains Mono', monospace", scale = 1, pad = 18 } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const f = font.replace("{s}", size);
  ctx.font = f;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = size + pad * 2;
  c.width = w; c.height = h;
  ctx.font = f;
  if (bg) { ctx.fillStyle = bg; const r = h / 2; ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill(); }
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set((w / h) * scale, scale, 1);
  return spr;
}

/** Simple GPU-cheap particle burst / emitter based on THREE.Points */
export function createParticles(scene, { count = 300, size = 0.12, color = 0xffaa33, additive = true, texture = true } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  let map = null;
  if (texture) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    map = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const P = Array.from({ length: count }, () => ({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, c: new THREE.Color(color) }));
  let cursor = 0;
  const emit = (o) => {
    const p = P[cursor]; cursor = (cursor + 1) % count;
    Object.assign(p, { life: o.life ?? 1, max: o.life ?? 1, x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, g: o.g ?? 0, drag: o.drag ?? 0 });
    p.c.set(o.color ?? color);
  };
  const update = (dt) => {
    for (let i = 0; i < count; i++) {
      const p = P[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.g * dt;
        const k = 1 - p.drag * dt;
        p.vx *= k; p.vy *= k; p.vz *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      const a = Math.max(0, p.life / p.max);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.life > 0 ? p.y : -9999; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.c.r * a; col[i * 3 + 1] = p.c.g * a; col[i * 3 + 2] = p.c.b * a;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { emit, update, points: pts };
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function metal(color, rough = 0.25, metalness = 1) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness });
}
// MeshStandard + environment reflections: near-identical look to clearcoat, far cheaper shader
export function glossy(color, { rough = 0.18, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: Math.max(0.12, rough), metalness: 0.12, emissive, emissiveIntensity, envMapIntensity: 1.2 });
}
