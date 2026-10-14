import { useEffect, useRef, useState } from "react";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createStage, createParticles, textSprite, THREE, glossy, metal, damp, rand } from "@/lib/three3d";
import { sfx } from "@/lib/sfx";

const ROW_H = 1.7;
const TILE = 1.25;
const GAP = 0.25;

function makeBomb() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 16), metal(0x141414, 0.35, 0.6));
  ball.castShadow = true; g.add(ball);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16), metal(0x777777, 0.3));
  cap.position.y = 0.36; g.add(cap);
  const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
  fuse.position.set(0.12, 0.42, 0); g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb04a })); spark.position.set(0.26, 0.45, 0); g.add(spark);
  return g;
}

function makeGem() {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0),
    new THREE.MeshStandardMaterial({ color: 0x2bff9a, emissive: 0x0b8f55, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.2 }));
  m.scale.set(1, 1.35, 1); m.castShadow = true;
  return m;
}

export function Tower3D({ rows, cols, mults, activeRow, picks, bombs, status, onPick }) {
  const mount = useRef(null);
  const api3 = useRef({});
  const [rects, setRects] = useState([]);
  const props = useRef({});
  props.current = { rows, cols, mults, activeRow, picks, bombs, status };

  useEffect(() => {
    const S = createStage(mount.current, { fov: 40, exposure: 1.1, envIntensity: 0.7 });
    const { scene, camera, renderer } = S;
    scene.fog = new THREE.Fog(0x0a0306, 12, 30);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const sun = new THREE.DirectionalLight(0xffe0c0, 1.8); sun.position.set(4, 12, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    scene.add(sun, sun.target);
    const torches = [-1, 1].map((s) => { const l = new THREE.PointLight(0xff6a1a, 25, 12, 2); scene.add(l); return { l, s }; });
    const flames = createParticles(scene, { count: 240, size: 0.35, color: 0xff7a2a });
    const boom = createParticles(scene, { count: 300, size: 0.4, color: 0xffaa33 });
    const sparkle = createParticles(scene, { count: 200, size: 0.18, color: 0x5bffb0 });
    const tower = new THREE.Group(); scene.add(tower);
    const stone = new THREE.MeshStandardMaterial({ color: 0x2a2226, roughness: 0.85, metalness: 0.05 });
    let tiles = []; let labels = []; let width = 4;
    let camY = 0; let shake = 0; const anims = [];
    const revealed = new Set();

    const build = (R, C) => {
      tower.clear(); tiles = []; labels = []; revealed.clear();
      width = C * TILE + (C - 1) * GAP;
      for (let r = 0; r < R; r++) {
        const y = r * ROW_H;
        const slab = new THREE.Mesh(new RoundedBoxGeometry(width + 0.7, 0.35, 2.0, 3, 0.08), stone);
        slab.position.y = y - 0.25; slab.receiveShadow = true; slab.castShadow = true; tower.add(slab);
        const row = [];
        for (let c = 0; c < C; c++) {
          const mat = glossy(0x3a2f2a, { rough: 0.3 });
          const t = new THREE.Mesh(new RoundedBoxGeometry(TILE, 0.32, TILE, 4, 0.1), mat);
          t.position.set(-width / 2 + TILE / 2 + c * (TILE + GAP), y + 0.08, 0);
          t.castShadow = true; t.receiveShadow = true; tower.add(t);
          row.push({ mesh: t, mat, item: null, state: "idle", flip: 0 });
        }
        tiles.push(row);
        const lb = textSprite(`${(props.current.mults[r] || 0).toFixed(2)}x`, { size: 56, color: "#ffffff", bg: "rgba(0,0,0,0.55)", scale: 0.55 });
        lb.position.set(-width / 2 - 1.15, y + 0.15, 0.4); tower.add(lb); labels.push(lb);
      }
      // pillars
      [-1, 1].forEach((s) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, R * ROW_H + 4, 16), stone);
        p.position.set(s * (width / 2 + 2.1), (R * ROW_H) / 2 - 1.5, -1.2); p.castShadow = true; tower.add(p);
      });
    };

    const setTile = (r, c, state) => {
      const t = tiles[r]?.[c]; if (!t || t.state === state) return;
      t.state = state;
      if (t.item) { tower.remove(t.item); t.item = null; }
      const p = t.mesh.position;
      if (state === "gem") {
        t.mat.color.setHex(0x0f6b45); t.mat.emissive.setHex(0x0a4a30); t.mat.emissiveIntensity = 0.6;
        t.item = makeGem(); t.item.position.set(p.x, p.y + 0.3, p.z); tower.add(t.item); t.flip = 1;
        anims.push({ k: "rise", o: t.item, y0: p.y + 0.3, t: 0 });
        for (let i = 0; i < 40; i++) sparkle.emit({ x: p.x, y: p.y + 0.4, z: p.z, vx: rand(-2, 2), vy: rand(1, 4), vz: rand(-2, 2), g: 4, life: rand(0.5, 1) });
      } else if (state === "bomb" || state === "ghost") {
        t.mat.color.setHex(state === "bomb" ? 0x7a0a12 : 0x2a1012); t.mat.emissive.setHex(0x550008); t.mat.emissiveIntensity = state === "bomb" ? 0.8 : 0.2;
        t.item = makeBomb(); t.item.position.set(p.x, p.y + 0.5, p.z); t.item.scale.setScalar(state === "bomb" ? 1 : 0.7); tower.add(t.item);
        if (state === "bomb") {
          t.flip = 1; shake = 0.6;
          for (let i = 0; i < 220; i++) { const a = rand(0, 6.28); const v = rand(2, 9); boom.emit({ x: p.x, y: p.y + 0.5, z: p.z, vx: Math.cos(a) * v, vy: rand(1, 8), vz: Math.sin(a) * v, g: 9, drag: 1.4, life: rand(0.5, 1.4), color: [0xffdd55, 0xff7a2a, 0xff2a2a, 0x444444][i % 4] }); }
        }
      } else {
        t.mat.color.setHex(0x3a2f2a); t.mat.emissive.setHex(0x000000); t.mat.emissiveIntensity = 0;
      }
    };

    api3.current.sync = () => {
      const P = props.current;
      if (!tiles.length || tiles.length !== P.rows || tiles[0].length !== P.cols) build(P.rows, P.cols);
      labels.forEach((lb, r) => {
        const passed = P.activeRow > r || (P.status !== "active" && P.picks?.[r] !== undefined && !(P.bombs?.[r]?.includes(P.picks[r])));
        lb.material.opacity = r === P.activeRow ? 1 : passed ? 0.9 : 0.45;
      });
      for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
        const picked = P.picks?.[r] === c; const isBomb = P.bombs?.[r]?.includes(c);
        const st = picked ? (isBomb ? "bomb" : "gem") : isBomb ? "ghost" : "idle";
        if (st !== "idle" && !revealed.has(`${r}-${c}`)) {
          revealed.add(`${r}-${c}`);
          if (st === "gem") sfx.gem(); else if (st === "bomb") sfx.explode();
        }
        if (st === "idle") revealed.delete(`${r}-${c}`);
        setTile(r, c, st);
      }
    };
    api3.current.sync();

    let lastKey = "";
    const corner = new THREE.Vector3();
    S.start((dt, now) => {
      const P = props.current;
      const focus = P.activeRow >= 0 ? P.activeRow : Math.max(0, Math.min(P.rows - 1, Object.keys(P.picks || {}).length - 1));
      camY = damp(camY, focus * ROW_H, 4, dt);
      shake = Math.max(0, shake - dt);
      const sx = shake ? rand(-1, 1) * shake * 0.3 : 0;
      const dist = 6.2 + width * 0.55;
      camera.position.set(sx + Math.sin(now / 4000) * 0.4, camY + 3.0, dist);
      camera.lookAt(0, camY + 0.1, 0);
      sun.position.set(4, camY + 12, 8); sun.target.position.set(0, camY, 0);
      torches.forEach(({ l, s }) => {
        l.position.set(s * (width / 2 + 2.1), camY + 1.6, -0.6);
        l.intensity = 22 + Math.sin(now / 70 + s * 3) * 5 + Math.random() * 4;
        if (Math.random() < 0.7) flames.emit({ x: l.position.x + rand(-0.1, 0.1), y: l.position.y - 0.2, z: -0.6, vx: rand(-0.2, 0.2), vy: rand(1, 2.2), vz: rand(-0.2, 0.2), life: rand(0.3, 0.6), color: Math.random() > 0.4 ? 0xff7a2a : 0xffd27a });
      });
      tiles.forEach((row, r) => row.forEach((t) => {
        if (r === P.activeRow && P.status === "active" && t.state === "idle") {
          t.mat.emissive.setHex(0xff7a1a); t.mat.emissiveIntensity = 0.25 + Math.sin(now / 250) * 0.15;
          t.mesh.position.y = r * ROW_H + 0.08 + Math.sin(now / 300 + t.mesh.position.x) * 0.03;
        } else if (t.state === "idle") { t.mat.emissiveIntensity = 0; t.mesh.position.y = r * ROW_H + 0.08; }
        if (t.flip > 0) { t.flip = Math.max(0, t.flip - dt * 2.4); t.mesh.rotation.x = (1 - t.flip) * Math.PI * 2; }
        if (t.item && t.state === "gem") t.item.rotation.y += dt * 2;
        if (t.item && (t.state === "bomb" || t.state === "ghost")) t.item.rotation.y += dt * 0.6;
      }));
      for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; a.o.position.y = a.y0 + Math.min(1, a.t * 2.5) * 0.45 + Math.sin(a.t * 3) * 0.05; if (a.t > 30) anims.splice(i, 1); }
      flames.update(dt); boom.update(dt); sparkle.update(dt);
      // project active-row tiles to screen for the click overlay
      const row = tiles[P.activeRow];
      let next = [];
      if (row && P.status === "active") {
        const rect = renderer.domElement.getBoundingClientRect();
        next = row.map((t, c) => {
          let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
            corner.set(t.mesh.position.x + (a * TILE) / 2, P.activeRow * ROW_H + 0.24, (b * TILE) / 2).project(camera);
            const px = ((corner.x + 1) / 2) * rect.width; const py = ((1 - corner.y) / 2) * rect.height;
            x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
          });
          return { c, x: Math.round(x0), y: Math.round(y0 - 8), w: Math.round(x1 - x0), h: Math.round(y1 - y0 + 16) };
        });
      }
      const key = JSON.stringify(next);
      if (key !== lastKey) { lastKey = key; setRects(next); }
    });
    return () => S.dispose();
  }, []);

  useEffect(() => { api3.current.sync?.(); }, [rows, cols, mults, activeRow, picks, bombs, status]);

  return (
    <div className="relative h-[440px] w-full" data-testid="tower-grid">
      <div ref={mount} className="absolute inset-0" data-testid="tower-3d" />
      {rects.map((r) => (
        <button key={r.c} onClick={() => onPick(r.c)} data-testid={`tower-tile-${activeRow}-${r.c}`} aria-label={`Tile ${r.c + 1}`}
          className="absolute rounded-xl hover:bg-orange-300/10 active:bg-orange-300/20 transition-colors"
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      ))}
      <div className="sr-only" data-testid={`tower-row-${activeRow}`} />
    </div>
  );
}
