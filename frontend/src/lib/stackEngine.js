// Tower Stack deterministic engine — exact mirror of backend games_extra.stack_replay
export const tri = (x) => {
  const u = x % 2;
  return u < 1 ? -1 + 2 * u : 3 - 2 * u;
};
export const speedAt = (eng, i) => Math.min(eng.max_speed, eng.base_speed + i * eng.speed_step);
export const offsetAt = (eng, i, t) => eng.range * tri((t / 1000) * speedAt(eng, i));

export const initialState = () => ({ top: { x: 0, z: 0, w: 1, d: 1 }, height: 0, perfects: 0, combo: 0, maxCombo: 0, elapsed: 0 });

/** Apply a tap `t` ms after the block spawned. Returns { ok, perfect, state, placed, cut, axis, off } */
export function placeBlock(eng, st, t) {
  const i = st.height;
  const axis = i % 2;
  const off = offsetAt(eng, i, t);
  const kc = axis === 0 ? "x" : "z";
  const ks = axis === 0 ? "w" : "d";
  const top = st.top;
  const size = top[ks];
  const next = { ...st, elapsed: st.elapsed + t };
  const nt = { ...top };
  let perfect = false;
  let cut = null;
  if (Math.abs(off) <= eng.perfect_tolerance) {
    perfect = true;
    next.combo = st.combo + 1;
    next.perfects = st.perfects + 1;
    if (next.combo >= eng.combo_growth_after) nt[ks] = Math.min(1, size + eng.combo_growth);
  } else {
    next.combo = 0;
    const overlap = size - Math.abs(off);
    if (overlap <= 0) {
      const moving = { ...top, [kc]: top[kc] + off };
      return { ok: false, perfect: false, state: st, placed: null, cut: moving, axis, off };
    }
    nt[kc] = top[kc] + off / 2;
    nt[ks] = overlap;
    const sign = off > 0 ? 1 : -1;
    cut = { ...top, [kc]: top[kc] + sign * (size / 2 + Math.abs(off) / 2), [ks]: Math.abs(off) };
  }
  next.maxCombo = Math.max(st.maxCombo, next.combo);
  next.height = st.height + 1;
  next.top = nt;
  return { ok: true, perfect, state: next, placed: nt, cut, axis, off };
}

export function endlessMultiplier(sc, height, perfects) {
  if (!sc || height < (sc.min_height ?? 5)) return 0;
  const m = height * (sc.per_level ?? 0.08) + perfects * (sc.per_perfect ?? 0.03);
  return Math.round(Math.min(sc.max_multiplier ?? 20, m) * 100) / 100;
}
