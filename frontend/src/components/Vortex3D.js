import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createStage, createParticles, textSprite, THREE, glossy, metal, damp, rand } from "@/lib/three3d";
import { sfx } from "@/lib/sfx";

export const THEME3D = {
  earth: { safe: [0x3d7a2a, 0x6a9c3a], accent: 0x8bd36b, core: 0x9bff6a, light: 0x9bff6a, bg: 0x0b1206 },
  water: { safe: [0x0e5a8a, 0x1a8fd0], accent: 0x38bdf8, core: 0x7fdcff, light: 0x38bdf8, bg: 0x03101c },
  fire: { safe: [0xb3361a, 0xe8601f], accent: 0xff6a2a, core: 0xffc06a, light: 0xff5a1f, bg: 0x1a0603 },
};
const R_IN = 0.75;
const R_OUT = 3.0;
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

function wedge(a0, a1) {
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * R_IN, Math.sin(a0) * R_IN);
  s.absarc(0, 0, R_OUT, a0, a1, false);
  s.lineTo(Math.cos(a1) * R_IN, Math.sin(a1) * R_IN);
  s.absarc(0, 0, R_IN, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.14);
  return g;
}

export const Vortex3D = forwardRef(function Vortex3D({ segments, loseSlots, theme }, ref) {
  const mount = useRef(null);
  const api3 = useRef({});
  const props = useRef({});
  props.current = { segments, loseSlots, theme };

  useImperativeHandle(ref, () => ({
    spinTo: (landing, ms) => api3.current.spinTo?.(landing, ms),
    lose: () => api3.current.lose?.(),
    win: () => api3.current.win?.(),
  }), []);

  useEffect(() => {
    const S = createStage(mount.current, { fov: 38, exposure: 1.15, envIntensity: 0.9 });
    const { scene, camera } = S;
    camera.position.set(0, -0.6, 11);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 9); key.castShadow = true; scene.add(key);
    const glow = new THREE.PointLight(0xffffff, 60, 20, 2); glow.position.set(0, 0, 3); scene.add(glow);
    const flash = new THREE.PointLight(0xff2020, 0, 25, 2); flash.position.set(0, 0, 4); scene.add(flash);
    const backRing = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.05, 12, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    backRing.position.z = -1; scene.add(backRing);

    const rig = new THREE.Group(); scene.add(rig);
    const wheel = new THREE.Group(); rig.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R_OUT + 0.12, 0.16, 24, 160), metal(0xd8c48a, 0.18));
    rig.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R_IN + 0.02, R_IN + 0.02, 0.5, 48), metal(0x2a2a2e, 0.25));
    hub.rotation.x = Math.PI / 2; rig.add(hub);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 }));
    core.position.z = 0.25; core.scale.z = 0.5; rig.add(core);
    const pointer = new THREE.Group(); pointer.position.set(0, R_OUT + 0.45, 0.35); rig.add(pointer);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 32), metal(0xf2d98a, 0.15));
    cone.rotation.z = Math.PI; pointer.add(cone);
    const pball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 12), metal(0xf2d98a, 0.15)); pball.position.y = 0.35; pointer.add(pball);

    const fx = createParticles(scene, { count: 400, size: 0.24 });
    const burst = createParticles(scene, { count: 400, size: 0.3 });
    const rocks = [];
    const rings = [];
    let layoutKey = "";
    let wedges = [];

    const buildWheel = () => {
      const P = props.current; const th = THEME3D[P.theme];
      const k = `${P.segments}|${P.loseSlots.join(",")}|${P.theme}`;
      if (k === layoutKey) return; layoutKey = k;
      wheel.clear(); wedges = [];
      const step = (Math.PI * 2) / P.segments;
      for (let j = 0; j < P.segments; j++) {
        const lose = P.loseSlots.includes(j);
        const c0 = j * step; const c1 = (j + 1) * step;
        const a0 = Math.PI / 2 - c1; const a1 = Math.PI / 2 - c0;
        const mat = lose ? glossy(0x0b0b0d, { rough: 0.25, emissive: 0x500008, emissiveIntensity: 0.6 }) : glossy(th.safe[j % 2], { rough: 0.22 });
        const m = new THREE.Mesh(wedge(a0, a1), mat); m.castShadow = true; m.receiveShadow = true;
        wheel.add(m); wedges.push(m);
        const mid = Math.PI / 2 - (j + 0.5) * step;
        if (lose) {
          const x = textSprite("✕", { size: 90, color: "#ff3b3b", font: "900 {s}px sans-serif", scale: 0.75, pad: 6 });
          x.position.set(Math.cos(mid) * 2.15, Math.sin(mid) * 2.15, 0.3); wheel.add(x);
        } else {
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glossy(0xffffff, { rough: 0.05, emissive: th.accent, emissiveIntensity: 0.35 }));
          gem.position.set(Math.cos(mid) * 2.15, Math.sin(mid) * 2.15, 0.32); gem.userData.spin = true; wheel.add(gem);
        }
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), metal(0xf2d98a, 0.2));
        const sa = Math.PI / 2 - c0; stud.position.set(Math.cos(sa) * (R_OUT + 0.12), Math.sin(sa) * (R_OUT + 0.12), 0.16); wheel.add(stud);
      }
      // theme dressing
      rocks.forEach((r) => scene.remove(r)); rocks.length = 0;
      rings.forEach((r) => scene.remove(r)); rings.length = 0;
      if (P.theme === "earth") {
        for (let i = 0; i < 16; i++) {
          const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.15, 0.38), 0), new THREE.MeshStandardMaterial({ color: [0x7a5a32, 0x5a4222, 0x8a6a3a][i % 3], roughness: 0.95, flatShading: true }));
          r.userData = { a: rand(0, 6.28), rad: rand(3.9, 5.2), sp: rand(0.15, 0.4), y: rand(-0.6, 0.6), rot: rand(0.5, 2) };
          r.castShadow = true; scene.add(r); rocks.push(r);
        }
      }
      if (P.theme === "water") {
        [0.4, -0.5].forEach((tilt, i) => {
          const r = new THREE.Mesh(new THREE.TorusGeometry(4.3 + i * 0.5, 0.06, 12, 160), new THREE.MeshStandardMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.45, roughness: 0.1, emissive: 0x0a5a8a, emissiveIntensity: 0.6 }));
          r.rotation.x = tilt; r.userData.sp = i ? -0.3 : 0.4; scene.add(r); rings.push(r);
        });
      }
      backRing.material.color.setHex(th.accent); glow.color.setHex(th.light); core.material.emissive.setHex(th.core);
      scene.fog = new THREE.Fog(th.bg, 12, 24);
    };
    buildWheel();
    api3.current.rebuild = buildWheel;

    let spin = null; let shake = 0; let lastSeg = -1;
    api3.current.spinTo = (landing, ms = 2800) => {
      const P = props.current; const step = (Math.PI * 2) / P.segments;
      const c = (landing + 0.5) * step; const r0 = wheel.rotation.z;
      const delta = (((c - r0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      spin = { r0, r1: r0 + Math.PI * 2 * 6 + delta, t: 0, d: ms / 1000 };
      sfx.whoosh();
    };
    api3.current.lose = () => {
      shake = 0.7; flash.intensity = 500; sfx.explode();
      for (let i = 0; i < 260; i++) { const a = rand(0, 6.28); const v = rand(2, 9); burst.emit({ x: Math.cos(a) * 1.2, y: Math.sin(a) * 1.2, z: 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(0, 4), g: 3, drag: 1.2, life: rand(0.6, 1.4), color: [0xf5a300, 0x330000, 0xff7a2a][i % 3] }); }
    };
    api3.current.win = () => {
      const th = THEME3D[props.current.theme];
      for (let i = 0; i < 220; i++) { const a = rand(0, 6.28); const v = rand(2, 8); burst.emit({ x: 0, y: 0, z: 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(1, 5), g: 2, drag: 1, life: rand(0.8, 1.6), color: [0xffd34d, th.accent, 0xffffff][i % 3] }); }
      ({ fire: sfx.fire, water: sfx.splash, earth: sfx.rumble })[props.current.theme]?.();
    };

    S.start((dt, now) => {
      const P = props.current; const t = now / 1000;
      if (spin) {
        spin.t += dt; const k = Math.min(1, spin.t / spin.d);
        wheel.rotation.z = spin.r0 + (spin.r1 - spin.r0) * easeOut(k);
        const step = (Math.PI * 2) / P.segments; const seg = Math.floor(wheel.rotation.z / step);
        if (seg !== lastSeg) { lastSeg = seg; pointer.rotation.z = 0.35; if (k < 0.97) sfx.tick(0.8 + (1 - k) * 0.4); }
        if (k >= 1) spin = null;
      } else wheel.rotation.z += Math.sin(t * 0.7) * 0.0006;
      pointer.rotation.z = damp(pointer.rotation.z, 0, 10, dt);
      wheel.children.forEach((o) => { if (o.userData.spin) o.rotation.y += dt * 2; });
      shake = Math.max(0, shake - dt);
      rig.position.set(shake ? rand(-1, 1) * shake * 0.25 : 0, shake ? rand(-1, 1) * shake * 0.25 : Math.sin(t * 1.2) * 0.05, 0);
      rig.rotation.x = Math.sin(t * 0.5) * 0.06 - 0.12; rig.rotation.y = Math.sin(t * 0.37) * 0.08;
      flash.intensity = Math.max(0, flash.intensity - dt * 700);
      glow.intensity = 50 + Math.sin(t * 3) * 12 + (spin ? 40 : 0);
      core.scale.setScalar(1 + Math.sin(t * 4) * 0.05); core.scale.z = 0.5;
      backRing.rotation.z -= dt * 0.2; backRing.scale.setScalar(1 + Math.sin(t * 2) * 0.01);
      // element vortex particles
      const n = spin ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        if (P.theme === "fire") {
          const r = rand(3.3, 4.2);
          fx.emit({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rand(-0.5, 0.8), vx: -Math.sin(a) * 2.5 + rand(-0.3, 0.3), vy: Math.cos(a) * 2.5 + 1.4, vz: rand(-0.2, 0.2), life: rand(0.4, 0.9), color: [0xff7a2a, 0xffd27a, 0xff3a1a][i % 3], drag: 0.6 });
        } else if (P.theme === "water") {
          const r = rand(4.2, 5);
          fx.emit({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rand(-0.5, 0.5), vx: -Math.sin(a) * 1.8 - Math.cos(a) * 1.4, vy: Math.cos(a) * 1.8 - Math.sin(a) * 1.4, vz: 0, life: rand(1, 1.8), color: [0x7fdcff, 0x38bdf8, 0xffffff][i % 3], drag: 0.3 });
        } else if (Math.random() < 0.5) {
          const r = rand(3.4, 4.5);
          fx.emit({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rand(-0.3, 0.6), vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.1), vz: 0, life: rand(0.8, 1.5), color: [0xc08a3e, 0x8bd36b, 0x6a4a22][i % 3], g: 0.5 });
        }
      }
      rocks.forEach((r) => { const u = r.userData; u.a += u.sp * dt * (spin ? 3 : 1); r.position.set(Math.cos(u.a) * u.rad, Math.sin(u.a) * u.rad, u.y + Math.sin(t + u.a) * 0.2); r.rotation.x += u.rot * dt; r.rotation.y += u.rot * dt * 0.7; });
      rings.forEach((r) => { r.rotation.z += r.userData.sp * dt * (spin ? 3 : 1); });
      fx.update(dt); burst.update(dt);
    });
    return () => S.dispose();
  }, []);

  useEffect(() => { api3.current.rebuild?.(); }, [segments, loseSlots, theme]);

  return <div ref={mount} className="absolute inset-0" data-testid="vortex-wheel" />;
});
