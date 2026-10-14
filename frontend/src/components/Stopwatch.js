import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { createStage, addStudioLights, THREE, metal, glossy, damp } from "@/lib/three3d";
import { sfx } from "@/lib/sfx";

const fmt = (ms) => (Math.max(0, ms) / 1000).toFixed(2);
const LAP = 10; // seconds per revolution of the main hand

function buildWatch(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const front = new THREE.Group();
  g.add(front);
  // case
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.24, 48, 128), metal(0xe8e8ea, 0.12));
  ring.castShadow = true;
  front.add(ring);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(2.08, 0.06, 24, 128), metal(0xff2a3a, 0.25, 0.8));
  bezel.position.z = 0.12;
  front.add(bezel);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.32, 0.42, 96), metal(0x2a2a30, 0.35));
  back.rotation.x = Math.PI / 2;
  back.position.z = -0.2;
  front.add(back);
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.1, 96), glossy(0x0a0a0d, { rough: 0.35 }));
  face.position.z = 0.02;
  face.receiveShadow = true;
  front.add(face);
  // ticks
  const tickMat = metal(0x9a9aa2, 0.3);
  const bigMat = metal(0xffffff, 0.2);
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.07 : 0.035, big ? 0.32 : 0.16, 0.04), big ? bigMat : tickMat);
    const a = (i / 60) * Math.PI * 2;
    const r = big ? 1.78 : 1.86;
    m.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.06);
    m.rotation.z = -a;
    front.add(m);
  }
  // progress ring (lit to target)
  const segs = [];
  for (let i = 0; i < 60; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x220508, emissive: 0xff1e2e, emissiveIntensity: 0, roughness: 0.4 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.05), mat);
    const a = (i / 60) * Math.PI * 2;
    m.position.set(Math.sin(a) * 2.0, Math.cos(a) * 2.0, 0.08);
    m.rotation.z = -a + Math.PI / 2;
    front.add(m);
    segs.push(m);
  }
  // target marker
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa000, emissiveIntensity: 1.4 }));
  front.add(marker);
  // sub dial (laps)
  const sub = new THREE.Group();
  sub.position.set(0, 0.85, 0.05);
  front.add(sub);
  sub.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 12, 64), metal(0xbfbfc6, 0.2)));
  const subHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 }));
  subHand.geometry.translate(0, 0.16, 0);
  sub.add(subHand);
  // main hand
  const hand = new THREE.Group();
  hand.position.z = 0.16;
  front.add(hand);
  const handMat = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff1020, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.0, 0.03), handMat);
  blade.geometry.translate(0, 0.72, 0);
  blade.castShadow = true;
  hand.add(blade);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 24), handMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.y = -0.38;
  hand.add(tail);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 32), metal(0xe8e8ea, 0.1));
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.2;
  front.add(cap);
  // glass dome
  const glass = new THREE.Mesh(new THREE.SphereGeometry(2.12, 64, 24, 0, Math.PI * 2, 0, 0.55),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 1, envMapIntensity: 1.6 }));
  glass.rotation.x = Math.PI / 2;
  glass.scale.set(1, 0.35, 1);
  glass.position.z = -0.25;
  front.add(glass);
  // crown + pushers
  const crown = new THREE.Group();
  crown.position.y = 2.55;
  g.add(crown);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 24), metal(0xd0d0d4, 0.2));
  stem.position.y = 0.1;
  crown.add(stem);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 32), metal(0xf0f0f2, 0.15));
  knob.position.y = 0.38;
  crown.add(knob);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 16, 48), metal(0xe8e8ea, 0.15));
  loop.position.y = 0.95;
  crown.add(loop);
  [-1, 1].forEach((sgn) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 24), metal(0xd8d8dc, 0.2));
    const a = sgn * 0.62;
    p.position.set(Math.sin(a) * 2.5, Math.cos(a) * 2.5, 0);
    p.rotation.z = -a;
    g.add(p);
  });
  return { g, front, hand, subHand, segs, marker, crown };
}

const Stopwatch = forwardRef(function Stopwatch({ target, running, onTick }, ref) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const elRef = useRef(0);
  const targetRef = useRef(target);
  const pressRef = useRef(0);
  const lastSec = useRef(-1);
  const mount = useRef(null);
  const digits = useRef(null);
  targetRef.current = target;

  const loop = () => {
    if (!runningRef.current) return;
    const e = performance.now() - startRef.current;
    elRef.current = e;
    if (digits.current) digits.current.textContent = fmt(e);
    const sec = Math.floor(e / 1000);
    if (sec !== lastSec.current) { lastSec.current = sec; if (sec > 0) sfx.tick(1); }
    if (onTick) onTick(e / 1000);
    rafRef.current = requestAnimationFrame(loop);
  };

  useImperativeHandle(ref, () => ({
    start() {
      setElapsed(0); elRef.current = 0; lastSec.current = 0;
      startRef.current = performance.now();
      runningRef.current = true; pressRef.current = 1; sfx.start();
      rafRef.current = requestAnimationFrame(loop);
    },
    stop() {
      if (!runningRef.current) return elRef.current / 1000;
      runningRef.current = false; pressRef.current = 1; sfx.click();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const finalMs = performance.now() - startRef.current;
      elRef.current = finalMs;
      setElapsed(finalMs);
      return finalMs / 1000;
    },
    reset() {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setElapsed(0); elRef.current = 0;
    },
  }));

  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    const st = createStage(mount.current, { fov: 32, exposure: 1.15 });
    st.camera.position.set(0, 0.3, 11.5);
    st.camera.lookAt(0, 0.2, 0);
    const { rim } = addStudioLights(st.scene, { keyPos: [4, 6, 9], keyI: 2.4, fillI: 45 });
    rim.position.set(-4, 2, 4);
    const w = buildWatch(st.scene);
    let t = 0;
    let shownAngle = 0;
    st.start((dt) => {
      t += dt;
      const e = elRef.current / 1000;
      const live = runningRef.current;
      const targetAngle = -(e / LAP) * Math.PI * 2;
      shownAngle = live ? targetAngle : damp(shownAngle, targetAngle, 18, dt);
      w.hand.rotation.z = shownAngle;
      w.subHand.rotation.z = -(e / 60) * Math.PI * 2;
      const tg = targetRef.current || 0;
      const prog = tg ? Math.min(1, e / tg) : 0;
      const lit = Math.round(prog * 60);
      w.segs.forEach((s, i) => { s.material.emissiveIntensity = i < lit ? 2.2 : 0.05; });
      const ma = ((tg % LAP) / LAP) * Math.PI * 2;
      w.marker.position.set(Math.sin(ma) * 2.32, Math.cos(ma) * 2.32, 0.2);
      w.marker.rotation.z = -ma + Math.PI;
      w.marker.visible = !!tg;
      w.g.rotation.y = damp(w.g.rotation.y, live ? Math.sin(t * 0.8) * 0.05 : Math.sin(t * 0.6) * 0.28, 3, dt);
      w.g.rotation.x = damp(w.g.rotation.x, live ? -0.02 : Math.sin(t * 0.4) * 0.08 - 0.05, 3, dt);
      w.g.position.y = live ? Math.sin(t * 9) * 0.015 : Math.sin(t * 1.2) * 0.06;
      pressRef.current = Math.max(0, pressRef.current - dt * 5);
      w.crown.position.y = 2.55 - Math.sin(pressRef.current * Math.PI) * 0.18;
      rim.intensity = live ? 60 + Math.sin(t * 12) * 10 : 40;
    });
    return () => st.dispose();
  }, []);

  // digits are owned by the DOM ref (updated every frame without React re-renders)
  useEffect(() => { if (digits.current) digits.current.textContent = fmt(elapsed); }, [elapsed]);
  return (
    <div className="relative flex items-center justify-center pointer-events-none select-none"
      style={{ width: 320, height: 320, maxWidth: "88vw", maxHeight: "88vw" }}>
      <div ref={mount} className="absolute inset-0" data-testid="stopwatch-3d" />
      <div className="absolute left-1/2 top-[58%] -translate-x-1/2 flex flex-col items-center">
        <div className={`rounded-xl px-3 py-1 bg-black/70 border border-white/10 backdrop-blur font-mono-pz font-extrabold tracking-tighter tabular-nums ${running ? "text-pazer-red pz-glow" : "text-white"}`}
          style={{ fontSize: "clamp(1.9rem, 9vw, 2.6rem)", lineHeight: 1.1 }} data-testid="stopwatch-display" ref={digits} />
        {target ? <div className="mt-1 font-mono-pz text-[10px] text-white/70 uppercase tracking-widest">Target · {Number(target).toFixed(2)}s</div> : null}
      </div>
    </div>
  );
});

export default Stopwatch;
