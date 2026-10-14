import { useEffect, useRef } from "react";
import { createStage, addStudioLights, createParticles, textSprite, THREE, glossy, metal, damp, rand } from "@/lib/three3d";
import { sfx } from "@/lib/sfx";

const LW = 2.2;
const ROAD_Z = 34;
const CAR_COLORS = [0xd8141f, 0xf59e0b, 0x2563eb, 0x9333ea, 0x10b981, 0xf97316];

function buildChicken() {
  const g = new THREE.Group();
  const white = glossy(0xf8f8f6, { rough: 0.55 });
  const red = glossy(0xe11d2a, { rough: 0.4 });
  const orange = glossy(0xf59e0b, { rough: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), white); body.scale.set(1.1, 0.9, 0.85); body.position.y = 0.6; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), white); head.position.set(0.32, 1.1, 0); g.add(head);
  [0, 1, 2].forEach((i) => { const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), red); c.position.set(0.22 + i * 0.1, 1.38 - Math.abs(i - 1) * 0.03, 0); g.add(c); });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12), orange); beak.rotation.z = -Math.PI / 2; beak.position.set(0.6, 1.08, 0); g.add(beak);
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), red); wattle.position.set(0.52, 0.96, 0); g.add(wattle);
  [-1, 1].forEach((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })); e.position.set(0.48, 1.16, s * 0.16); g.add(e); });
  const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), white); w.scale.set(1, 0.6, 0.25); w.position.set(-0.05, 0.65, s * 0.4); g.add(w); return w; });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 12), white); tail.rotation.z = Math.PI / 2.8; tail.position.set(-0.5, 0.85, 0); g.add(tail);
  [-1, 1].forEach((s) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 8), orange); l.position.set(0.05, 0.16, s * 0.15); g.add(l); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, wings };
}

function buildCar(color) {
  const g = new THREE.Group();
  const paint = glossy(color, { rough: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.45, 2.2), paint); body.position.y = 0.42; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.05, metalness: 0.6 })); cab.position.set(0, 0.82, -0.1); g.add(cab);
  [[-0.62, 0.7], [0.62, 0.7], [-0.62, -0.7], [0.62, -0.7]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 14), metal(0x111111, 0.7, 0.2)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.22, z); g.add(w); });
  [-0.4, 0.4].forEach((x) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff6c0 })); h.position.set(x, 0.45, 1.11); g.add(h); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function Chicken3D({ mults, step, status, hazardAt, hardcore }) {
  const mount = useRef(null);
  const props = useRef({});
  const api3 = useRef({});
  props.current = { mults, step, status, hazardAt, hardcore };

  useEffect(() => {
    const S = createStage(mount.current, { fov: 40, exposure: 1.1, envIntensity: 0.7 });
    const { scene, camera } = S;
    scene.fog = new THREE.Fog(0x0a0507, 16, 38);
    const { sun } = addStudioLights(scene, { keyI: 2.0, fillI: 25, ambient: 0.35, shadowSize: 10, keyPos: [4, 12, 6] });
    const world = new THREE.Group(); scene.add(world);
    const feathers = createParticles(scene, { count: 300, size: 0.22, color: 0xffffff, additive: false });
    const fire = createParticles(scene, { count: 400, size: 0.4, color: 0xff7a2a });
    const coins = createParticles(scene, { count: 200, size: 0.3, color: 0xffd34d });
    const { g: chicken, wings } = buildChicken(); scene.add(chicken);
    let lanes = []; let key = "";
    const ch = { x: 0, from: 0, to: 0, t: 1, dead: false, flat: 0, lastStep: 0, lastStatus: "idle" };
    let camX = 0;

    const build = () => {
      const P = props.current;
      const k = `${P.mults.length}|${P.hardcore}|${P.mults[0]}`;
      if (k === key) return; key = k;
      world.clear(); lanes = [];
      const N = P.mults.length;
      const side = new THREE.Mesh(new THREE.BoxGeometry(LW * 1.2, 0.3, ROAD_Z), new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.9 }));
      side.position.set(-0.1, -0.15, 0); side.receiveShadow = true; world.add(side);
      const asphalt = new THREE.MeshStandardMaterial({ color: P.hardcore ? 0x1e0b0c : 0x18181c, roughness: 0.85 });
      const dashGeo = new THREE.BoxGeometry(0.08, 0.02, 1.2); const dashMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
      const dashes = new THREE.InstancedMesh(dashGeo, dashMat, N * 12); let di = 0; const mtx = new THREE.Matrix4();
      for (let i = 1; i <= N; i++) {
        const x = i * LW;
        const road = new THREE.Mesh(new THREE.BoxGeometry(LW, 0.2, ROAD_Z), asphalt); road.position.set(x, -0.2, 0); road.receiveShadow = true; world.add(road);
        for (let d = 0; d < 12; d++) { mtx.makeTranslation(x + LW / 2, 0.01, -ROAD_Z / 2 + 1.5 + d * 2.8); dashes.setMatrixAt(di++, mtx); }
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 28), metal(0x6a6a70, 0.45)); hole.position.set(x, 0.0, 0); hole.receiveShadow = true; world.add(hole);
        const label = textSprite(`${P.mults[i - 1]}x`, { size: 54, color: "#ffffff", bg: "rgba(0,0,0,0.6)", scale: 0.6 }); label.position.set(x, 2.3, 0); world.add(label);
        const car = buildCar(CAR_COLORS[i % CAR_COLORS.length]); car.position.set(x, 0, rand(-ROAD_Z / 2, ROAD_Z / 2)); world.add(car);
        const barrier = new THREE.Group();
        [0, 1, 2, 3].forEach((b) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.25), glossy(b % 2 ? 0xffffff : 0xef4444, { rough: 0.4 })); m.position.set(-0.6 + b * 0.4, 0.5, 0); barrier.add(m); });
        barrier.position.set(x, 0, -2.6); barrier.visible = false; world.add(barrier);
        lanes.push({ x, car, label, hole, barrier, speed: rand(7, 13) * (P.hardcore ? 1.4 : 1), state: "future" });
      }
      world.add(dashes);
      const nestX = (N + 1) * LW;
      const nest = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.28, 12, 32), new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 1 })); nest.rotation.x = Math.PI / 2; nest.position.set(nestX, 0.2, 0); world.add(nest);
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 16), metal(0xffc23a, 0.15)); egg.scale.y = 1.3; egg.position.set(nestX, 0.7, 0); egg.castShadow = true; world.add(egg);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(LW * 1.4, 0.3, ROAD_Z), new THREE.MeshStandardMaterial({ color: 0x3a2a12, roughness: 0.9 })); pad.position.set(nestX, -0.15, 0); world.add(pad);
      api3.current.egg = egg;
    };
    build();
    api3.current.build = build;

    S.start((dt, now) => {
      const P = props.current; const t = now / 1000;
      // react to step / status changes
      if (P.status === "active" && ch.lastStatus !== "active") { ch.dead = false; ch.flat = 0; chicken.scale.set(1, 1, 1); chicken.rotation.set(0, 0, 0); ch.x = 0; ch.from = 0; ch.to = 0; ch.t = 1; ch.lastStep = 0; lanes.forEach((L) => { L.state = "future"; }); }
      if (P.step !== ch.lastStep && P.status !== "lost") { ch.from = ch.x; ch.to = P.step * LW; ch.t = 0; ch.lastStep = P.step; sfx.hop(); }
      if (P.status === "lost" && ch.lastStatus !== "lost" && P.hazardAt) {
        ch.from = ch.x; ch.to = P.hazardAt * LW; ch.t = 0; ch.dying = true;
        const lane = lanes[P.hazardAt - 1]; if (lane) { lane.state = "hit"; lane.car.position.z = -ROAD_Z / 2; }
      }
      if (P.status === "won" && ch.lastStatus === "active") {
        sfx.coin();
        for (let i = 0; i < 120; i++) coins.emit({ x: ch.x, y: 1.2, z: 0, vx: rand(-3, 3), vy: rand(3, 8), vz: rand(-3, 3), g: 12, life: rand(0.8, 1.5) });
      }
      ch.lastStatus = P.status;
      // hop animation
      if (ch.t < 1) {
        ch.t = Math.min(1, ch.t + dt / 0.38);
        ch.x = ch.from + (ch.to - ch.from) * ch.t;
        chicken.position.y = Math.sin(Math.PI * ch.t) * 1.1;
        wings.forEach((w, i) => { w.rotation.x = Math.sin(t * 40) * 0.8 * (i ? 1 : -1); });
      } else {
        chicken.position.y = ch.dead ? 0 : Math.abs(Math.sin(t * (P.status === "won" ? 8 : 2))) * (P.status === "won" ? 0.4 : 0.05);
        wings.forEach((w) => { w.rotation.x = damp(w.rotation.x, 0, 8, dt); });
      }
      chicken.position.x = ch.x;
      // lanes
      lanes.forEach((L, i) => {
        const n = i + 1;
        const passed = n <= P.step && P.status !== "idle";
        const isNext = P.status === "active" && n === P.step + 1;
        if (L.state !== "hit") L.state = passed ? "blocked" : "future";
        L.barrier.visible = L.state === "blocked";
        if (L.state === "blocked") L.car.position.z = damp(L.car.position.z, -4.6, 6, dt);
        else if (L.state === "hit") {
          L.car.position.z += dt * 42;
          if (!ch.dead && ch.t >= 1 && L.car.position.z > -1.2) {
            ch.dead = true; sfx.crash();
            for (let k = 0; k < 90; k++) feathers.emit({ x: ch.x, y: 0.8, z: 0, vx: rand(-4, 4), vy: rand(2, 7), vz: rand(-1, 6), g: 3, drag: 2, life: rand(1, 2), color: 0xffffff });
            for (let k = 0; k < 140; k++) fire.emit({ x: ch.x, y: 0.5, z: 0, vx: rand(-3, 3), vy: rand(1, 6), vz: rand(-3, 3), g: 2, drag: 1.5, life: rand(0.4, 1.1), color: [0xffdd55, 0xff7a2a, 0xff2a2a][k % 3] });
          }
          if (L.car.position.z > ROAD_Z / 2) L.car.position.z = ROAD_Z / 2;
        } else {
          L.car.position.z += dt * L.speed;
          if (L.car.position.z > ROAD_Z / 2) L.car.position.z = -ROAD_Z / 2;
        }
        L.label.material.opacity = passed ? 1 : isNext ? 1 : 0.55;
        L.label.position.y = 2.3 + (isNext ? Math.sin(t * 4) * 0.12 : 0);
        L.hole.material.emissive?.setHex(passed ? 0x6a4a00 : isNext ? 0x333333 : 0x000000);
        if (P.hardcore && L.state === "future" && Math.random() < 0.08) fire.emit({ x: L.x + rand(-0.8, 0.8), y: 0.1, z: rand(-6, 6), vx: 0, vy: rand(1.5, 3), vz: 0, life: rand(0.3, 0.6), color: Math.random() > 0.5 ? 0xff7a2a : 0xffd27a });
      });
      if (ch.dead) { ch.flat = Math.min(1, ch.flat + dt * 6); chicken.scale.set(1 + ch.flat * 0.4, 1 - ch.flat * 0.8, 1 + ch.flat * 0.4); chicken.rotation.z = -ch.flat * 0.3; }
      if (api3.current.egg) api3.current.egg.rotation.y += dt;
      feathers.update(dt); fire.update(dt); coins.update(dt);
      camX = damp(camX, ch.x, 3, dt);
      camera.position.set(camX - 2.8, 6.2, 8.6);
      camera.lookAt(camX + 2.6, 0.4, -0.5);
      sun.position.set(camX + 4, 12, 6); sun.target.position.set(camX, 0, 0);
    });
    return () => S.dispose();
  }, []);

  useEffect(() => { api3.current.build?.(); }, [mults, hardcore]);

  return <div ref={mount} className="absolute inset-0" data-testid="chicken-3d" />;
}
