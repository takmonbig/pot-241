import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

const S = 3; // world units per engine unit
const BH = 0.7; // block height
const VIEW = 11; // ortho vertical view size

const colorFor = (level) => new THREE.Color().setHSL(((352 + level * 7) % 360) / 360, 0.78, 0.56);

/**
 * Imperative three.js stacking scene.
 * ref api: reset(), setMoving(box, level), hideMoving(), addPlaced(box, level), addFalling(box, level), perfectFx(box, level)
 * prop onFrame(now) is called every animation frame (used by the page to move the active block).
 */
export const StackScene = forwardRef(function StackScene({ onFrame, className }, ref) {
  const mountRef = useRef(null);
  const frameCb = useRef(onFrame);
  const c = useRef({});
  frameCb.current = onFrame;

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const camBase = new THREE.Vector3(10, 8, 10);
    camera.position.copy(camBase);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(6, 16, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 60 });
    scene.add(sun);
    scene.add(sun.target);
    const rim = new THREE.PointLight(0xff2a3a, 40, 30);
    rim.position.set(-6, 4, -4);
    scene.add(rim);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    scene.add(group);

    const mkMesh = (box, level, color) => {
      const m = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: color || colorFor(level), roughness: 0.35, metalness: 0.15 }));
      m.scale.set(box.w * S, BH, box.d * S);
      m.position.set(box.x * S, (level - 0.5) * BH, box.z * S);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    const state = { placed: [], falling: [], fx: [], moving: null, camY: 0, targetY: 0, last: performance.now() };

    const base = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: 0x3a1018, roughness: 0.5, emissive: 0x220308 }));
    base.scale.set(S, 14, S);
    base.position.set(0, -7, 0);
    base.receiveShadow = true;
    scene.add(base);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      const a = w / h;
      Object.assign(camera, { left: (-VIEW * a) / 2, right: (VIEW * a) / 2, top: VIEW / 2, bottom: -VIEW / 2 });
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - state.last) / 1000);
      state.last = now;
      frameCb.current?.(now);
      for (let i = state.falling.length - 1; i >= 0; i--) {
        const f = state.falling[i];
        f.v.y -= 22 * dt;
        f.m.position.addScaledVector(f.v, dt);
        f.m.rotation.x += f.r.x * dt;
        f.m.rotation.z += f.r.z * dt;
        if (f.m.position.y < state.camY - 25) { group.remove(f.m); f.m.material.dispose(); state.falling.splice(i, 1); }
      }
      for (let i = state.fx.length - 1; i >= 0; i--) {
        const f = state.fx[i];
        f.t += dt;
        const k = 1 + f.t * 1.6;
        f.m.scale.set(f.sx * k, 1, f.sz * k);
        f.m.material.opacity = Math.max(0, 1 - f.t * 2.2);
        if (f.t > 0.5) { group.remove(f.m); f.m.material.dispose(); state.fx.splice(i, 1); }
      }
      state.camY += (state.targetY - state.camY) * Math.min(1, dt * 4);
      camera.position.set(camBase.x, camBase.y + state.camY, camBase.z);
      camera.lookAt(0, state.camY, 0);
      sun.position.set(6, 16 + state.camY, 4);
      sun.target.position.set(0, state.camY, 0);
      rim.position.y = 4 + state.camY;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    c.current = {
      reset() {
        [...state.placed, ...state.falling.map((f) => f.m), ...state.fx.map((f) => f.m)].forEach((m) => { group.remove(m); m.material.dispose(); });
        if (state.moving) { group.remove(state.moving); state.moving.material.dispose(); state.moving = null; }
        state.placed = []; state.falling = []; state.fx = [];
        state.targetY = 0;
        const first = mkMesh({ x: 0, z: 0, w: 1, d: 1 }, 0, colorFor(0));
        first.position.y = -BH / 2;
        group.add(first); state.placed.push(first);
      },
      setMoving(box, level) {
        if (!state.moving) { state.moving = mkMesh(box, level); group.add(state.moving); }
        const m = state.moving;
        m.material.color.copy(colorFor(level));
        m.scale.set(box.w * S, BH, box.d * S);
        m.position.set(box.x * S, (level - 0.5) * BH, box.z * S);
        m.visible = true;
      },
      hideMoving() { if (state.moving) state.moving.visible = false; },
      addPlaced(box, level) {
        const m = mkMesh(box, level);
        group.add(m); state.placed.push(m);
        state.targetY = Math.max(0, level * BH - 1.0);
      },
      addFalling(box, level) {
        if (!box || box.w <= 0 || box.d <= 0) return;
        const m = mkMesh(box, level);
        group.add(m);
        state.falling.push({ m, v: new THREE.Vector3(box.x * 1.2, 1.5, box.z * 1.2), r: { x: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 } });
      },
      perfectFx(box, level) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
        m.position.set(box.x * S, (level - 1) * BH + 0.02, box.z * S);
        m.scale.set(box.w * S, 1, box.d * S);
        group.add(m);
        state.fx.push({ m, t: 0, sx: box.w * S, sz: box.d * S });
      },
    };
    c.current.reset();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      unit.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    reset: () => c.current.reset?.(),
    setMoving: (b, l) => c.current.setMoving?.(b, l),
    hideMoving: () => c.current.hideMoving?.(),
    addPlaced: (b, l) => c.current.addPlaced?.(b, l),
    addFalling: (b, l) => c.current.addFalling?.(b, l),
    perfectFx: (b, l) => c.current.perfectFx?.(b, l),
  }), []);

  return <div ref={mountRef} className={className} data-testid="stack-canvas" />;
});
