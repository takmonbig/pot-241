import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createStage, addStudioLights, createParticles, THREE, glossy, metal, damp, rand } from "@/lib/three3d";
import { sfx, hum } from "@/lib/sfx";

const SPEED = 3.2;
const altOf = (m) => Math.log(Math.max(1, m)) * 5;

function skyTexture() {
  const c = document.createElement("canvas"); c.width = 16; c.height = 512;
  const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#05010a"); gr.addColorStop(0.45, "#2a0614"); gr.addColorStop(0.62, "#8a1a1a"); gr.addColorStop(0.72, "#ff7a2a"); gr.addColorStop(0.8, "#2a0a08"); gr.addColorStop(1, "#050203");
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildPlane() {
  const p = new THREE.Group();
  const paint = glossy(0xd8141f, { rough: 0.22 });
  const white = glossy(0xf4f4f4, { rough: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 2.3, 10, 28), paint);
  body.rotation.z = Math.PI / 2; p.add(body);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.352, 0.25, 28), white);
  stripe.rotation.z = Math.PI / 2; stripe.position.x = -0.4; p.add(stripe);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 28), metal(0xdcdcdc, 0.15));
  nose.rotation.z = -Math.PI / 2; nose.position.x = 1.62; p.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 4.6), paint); wing.position.set(0.25, -0.05, 0); p.add(wing);
  [-1, 1].forEach((s) => { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.1, 0.35), white); tip.position.set(0.25, -0.05, s * 2.2); p.add(tip); });
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.5), paint); tailW.position.set(-1.35, 0.1, 0); p.add(tailW);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.07), paint); fin.position.set(-1.4, 0.45, 0); fin.rotation.z = -0.25; p.add(fin);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x6fc3ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75, clearcoat: 1 }));
  cockpit.scale.set(1.6, 1, 1); cockpit.position.set(0.55, 0.25, 0); p.add(cockpit);
  const prop = new THREE.Group(); prop.position.x = 1.9; p.add(prop);
  [0, Math.PI / 2].forEach((r) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.14), metal(0x222222, 0.4)); b.rotation.x = r; prop.add(b); });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
  disc.rotation.y = Math.PI / 2; prop.add(disc);
  const wheels = [-0.7, 0.7].map((z) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 20), metal(0x111111, 0.6, 0.2)); w.rotation.x = Math.PI / 2; w.position.set(0.5, -0.55, z); p.add(w); return w; });
  p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  p.scale.setScalar(0.9);
  return { p, prop, wheels };
}

function terrainChunk() {
  const geo = new THREE.PlaneGeometry(60, 50, 48, 24);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const z = pos.getZ(i);
    const far = Math.max(0, (-z - 4) / 20);
    const h = (Math.sin(x * 0.21) * 1.6 + Math.sin(x * 0.53 + z * 0.3) * 0.9 + Math.cos(z * 0.4 + x * 0.11) * 1.2) * (0.4 + far * 2.4) + far * far * 6;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x0e0406, roughness: 0.9, metalness: 0.1, flatShading: true }));
  m.receiveShadow = true;
  return m;
}

export const AviatorCanvas = forwardRef(function AviatorCanvas({ onTick, onCrash }, ref) {
  const mount = useRef(null);
  const st = useRef({ mode: "idle", k: 0.12, crash: 1, t0: 0, crashT: 0 });
  const cb = useRef({ onTick, onCrash });
  const api3 = useRef({});
  cb.current = { onTick, onCrash };

  useImperativeHandle(ref, () => ({
    fly(k, crash) { Object.assign(st.current, { mode: "fly", k, crash, t0: performance.now() }); api3.current.onFly?.(); },
    reset() { Object.assign(st.current, { mode: "idle" }); api3.current.onReset?.(); },
    setCrash(cp) { if (st.current.mode === "fly") st.current.crash = cp; },
  }));

  useEffect(() => {
    const S = createStage(mount.current, { fov: 42, exposure: 1.05, envIntensity: 0.6 });
    const { scene, camera } = S;
    scene.fog = new THREE.Fog(0x12030a, 25, 85);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    scene.add(sky);
    const { sun, rim } = addStudioLights(scene, { keyI: 1.6, key: 0xffd2a8, fill: 0xff5a2a, fillI: 60, ambient: 0.3, shadowSize: 14, keyPos: [10, 18, 8] });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false }));
    moon.position.set(40, 14, -110); scene.add(moon);
    // stars
    const sg = new THREE.BufferGeometry(); const sp = [];
    for (let i = 0; i < 700; i++) sp.push(rand(-140, 140), rand(10, 120), rand(-140, -60));
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8, fog: false }));
    scene.add(stars);
    const chunks = [0, 1, 2].map((i) => { const c = terrainChunk(); c.position.set(i * 60 - 30, -3, -14); scene.add(c); return c; });
    const runway = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 3), new THREE.MeshStandardMaterial({ color: 0x202024, roughness: 0.7 }));
    runway.position.set(0, -0.62, 0); runway.receiveShadow = true; scene.add(runway);
    const lights = [];
    for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xf5a300 : 0xffe08a })); l.position.set(-6 + i * 1.1, -0.52, 1.45); scene.add(l); lights.push(l); }
    const { p: plane, prop, wheels } = buildPlane();
    scene.add(plane);
    // preallocated ribbon trail (no per-frame geometry allocation)
    const MAXP = 320;
    const rPos = new Float32Array(MAXP * 2 * 3);
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
    const idx = [];
    for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    rGeo.setIndex(idx);
    rGeo.setDrawRange(0, 0);
    const trail = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ color: 0xff3348, side: THREE.DoubleSide, toneMapped: false }));
    trail.frustumCulled = false;
    scene.add(trail);
    let np = 0;
    const pushTrail = (x, y) => {
      if (np >= MAXP) { rPos.copyWithin(0, 6); np = MAXP - 1; }
      const o = np * 6;
      rPos[o] = x; rPos[o + 1] = y + 0.08; rPos[o + 2] = 0;
      rPos[o + 3] = x; rPos[o + 4] = y - 0.08; rPos[o + 5] = 0;
      np++;
      rGeo.setDrawRange(0, Math.max(0, (np - 1) * 6));
      rGeo.attributes.position.needsUpdate = true;
    };
    const clearTrail = () => { np = 0; rGeo.setDrawRange(0, 0); };
    const exhaust = createParticles(scene, { count: 500, size: 0.35, color: 0xff7a2a });
    const boom = createParticles(scene, { count: 400, size: 0.5, color: 0xffcc55 });
    const flash = new THREE.PointLight(0xffaa44, 0, 30, 2); scene.add(flash);
    let engine = null;
    let fall = { vy: 0, spin: 0 };
    let camX = 0; let camY = 1.5; let frame = 0;

    api3.current.onFly = () => { clearTrail(); fall = { vy: 0, spin: 0 }; plane.visible = true; sfx.takeoff(); engine?.stop(); engine = hum(80); };
    api3.current.onReset = () => { clearTrail(); plane.visible = true; plane.rotation.set(0, 0, 0); engine?.stop(); engine = null; };

    S.start((dt, now) => {
      const s = st.current;
      let t = 0; let m = 1;
      frame++;
      if (s.mode === "fly") {
        t = (now - s.t0) / 1000; m = Math.exp(s.k * t);
        if (m >= s.crash) {
          m = s.crash; s.mode = "crash"; s.crashT = Math.log(Math.max(1, s.crash)) / s.k;
          cb.current.onCrash?.(s.crash);
          sfx.explode(); engine?.stop(); engine = null;
          for (let i = 0; i < 260; i++) {
            const a = rand(0, Math.PI * 2); const b = rand(-1, 1); const v = rand(2, 11);
            boom.emit({ x: plane.position.x, y: plane.position.y, z: plane.position.z, vx: Math.cos(a) * v * Math.sqrt(1 - b * b), vy: b * v + 2, vz: Math.sin(a) * v * Math.sqrt(1 - b * b), g: 6, drag: 1.2, life: rand(0.6, 1.8), color: [0xffdd55, 0xff7a2a, 0xf5a300, 0xffffff][i % 4] });
          }
          flash.position.copy(plane.position); flash.intensity = 400;
          fall = { vy: 2, spin: rand(4, 8) };
        } else cb.current.onTick?.(m);
        engine?.set(80 + Math.min(260, m * 18), 0.035);
      }
      if (s.mode === "fly") {
        const x = t * SPEED; const y = altOf(m);
        const prev = plane.position.clone();
        plane.position.set(x, y + Math.sin(now / 180) * 0.05, 0);
        const d = plane.position.clone().sub(prev);
        plane.rotation.z = damp(plane.rotation.z, Math.atan2(d.y, Math.max(0.0001, d.x)) * 0.9, 6, dt);
        plane.rotation.x = Math.sin(now / 600) * 0.12;
        if (frame % 2 === 0) pushTrail(x - 1.4, y);
        for (let i = 0; i < 2; i++) exhaust.emit({ x: x - 1.6, y: y + rand(-0.1, 0.1), z: rand(-0.15, 0.15), vx: rand(-4, -2), vy: rand(-0.4, 0.4), vz: rand(-0.4, 0.4), life: rand(0.3, 0.7), color: Math.random() > 0.5 ? 0xff7a2a : 0xf5a300, drag: 2 });
        wheels.forEach((w) => { w.visible = y < 1.5; });
      } else if (s.mode === "crash") {
        fall.vy -= 14 * dt;
        plane.position.y += fall.vy * dt; plane.position.x += 2 * dt;
        plane.rotation.z -= fall.spin * dt; plane.rotation.x += fall.spin * 0.6 * dt;
        if (plane.position.y < -8) plane.visible = false;
        if (Math.random() < 0.6) exhaust.emit({ x: plane.position.x, y: plane.position.y, z: 0, vx: rand(-1, 1), vy: rand(0.5, 2), vz: rand(-1, 1), life: 1.2, color: 0x444444, drag: 1 });
      } else {
        plane.position.set(-2, -0.05 + Math.sin(now / 400) * 0.02, 0);
        plane.rotation.set(0, 0, 0.02);
        wheels.forEach((w) => { w.visible = true; });
      }
      prop.rotation.x += dt * (s.mode === "crash" ? 4 : 45);
      flash.intensity = Math.max(0, flash.intensity - dt * 600);
      exhaust.update(dt); boom.update(dt);
      const px = plane.position.x; const py = Math.max(0, s.mode === "crash" ? altOf(s.crash) : plane.position.y);
      camX = damp(camX, px - 3, 3, dt); camY = damp(camY, py + 1.6, 3, dt);
      camera.position.set(camX - 2, camY + 1.2, 12.5 + Math.min(10, py * 0.35));
      camera.lookAt(camX + 2.5, camY - 0.3, 0);
      sky.position.set(camX, 0, 0); stars.position.x = camX * 0.9; moon.position.x = camX + 40;
      sun.position.set(camX + 10, camY + 18, 8); sun.target.position.set(camX, camY, 0);
      rim.position.set(camX - 6, camY + 3, 4);
      const base = Math.floor((camX + 30) / 60);
      chunks.forEach((c, i) => { c.position.x = (base + i - 1) * 60; });
      lights.forEach((l, i) => { l.material.color.setHex(Math.floor(now / 300 + i) % 2 ? 0xf5a300 : 0xffe08a); });
    });
    return () => { engine?.stop(); S.dispose(); };
  }, []);

  return <div ref={mount} className="absolute inset-0 h-full w-full" data-testid="aviator-canvas" />;
});
