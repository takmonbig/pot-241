// Synthesised game sound effects (Web Audio, no asset files). Global mute persisted in localStorage.
const KEY = "tu_muted";
let ctx = null;
let master = null;

export const isMuted = () => localStorage.getItem(KEY) === "1";
export function setMuted(m) {
  localStorage.setItem(KEY, m ? "1" : "0");
  if (master) master.gain.value = m ? 0 : 1;
  window.dispatchEvent(new CustomEvent("sfx:mute", { detail: m }));
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, { type = "sine", vol = 0.12, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const c = ac(); if (!c || isMuted()) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur = 0.4, { vol = 0.25, filter = 1200, type = "lowpass", delay = 0, sweep = 0 } = {}) {
  const c = ac(); if (!c || isMuted()) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filter, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter + sweep), t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  click: () => tone(660, 0.05, { type: "square", vol: 0.05 }),
  tick: (p = 1) => tone(1400 * p, 0.03, { type: "square", vol: 0.04 }),
  start: () => { tone(392, 0.1, { type: "triangle" }); tone(587, 0.16, { type: "triangle", delay: 0.09 }); },
  whoosh: () => noise(0.5, { vol: 0.18, filter: 400, type: "bandpass", sweep: 2400 }),
  hop: () => tone(300, 0.14, { type: "triangle", vol: 0.12, slide: 500 }),
  step: () => noise(0.08, { vol: 0.12, filter: 900 }),
  place: (combo = 0) => tone(320 + combo * 60, 0.09, { type: "triangle", vol: 0.1 }),
  perfect: (combo = 1) => { tone(660 + combo * 80, 0.14, { type: "sine", vol: 0.13 }); tone(990 + combo * 120, 0.18, { type: "sine", vol: 0.08, delay: 0.05 }); },
  gem: () => { tone(880, 0.1, { vol: 0.1 }); tone(1320, 0.18, { vol: 0.08, delay: 0.06 }); },
  coin: () => { tone(988, 0.08, { type: "square", vol: 0.06 }); tone(1319, 0.22, { type: "square", vol: 0.06, delay: 0.07 }); },
  explode: () => { noise(0.9, { vol: 0.5, filter: 900, sweep: -800 }); tone(90, 0.6, { type: "sawtooth", vol: 0.12, slide: -50 }); },
  crash: () => { noise(0.6, { vol: 0.35, filter: 2500, sweep: -2200 }); tone(140, 0.4, { type: "sawtooth", vol: 0.1, slide: -80 }); },
  lose: () => { tone(330, 0.2, { type: "sawtooth", vol: 0.07 }); tone(220, 0.35, { type: "sawtooth", vol: 0.07, delay: 0.18 }); },
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, { type: "triangle", vol: 0.1, delay: i * 0.09 })),
  takeoff: () => noise(1.2, { vol: 0.12, filter: 300, type: "bandpass", sweep: 1500 }),
  fire: () => noise(0.5, { vol: 0.25, filter: 3000, type: "highpass", sweep: -2000 }),
  splash: () => noise(0.5, { vol: 0.22, filter: 1800, type: "bandpass", sweep: -1200 }),
  rumble: () => { noise(0.6, { vol: 0.3, filter: 220 }); tone(70, 0.5, { type: "sine", vol: 0.15 }); },
};

/** Continuous engine/hum loop. returns { set(freq,vol), stop() } */
export function hum(base = 90) {
  const c = ac(); if (!c) return { set() {}, stop() {} };
  const o = c.createOscillator(); const o2 = c.createOscillator(); const g = c.createGain();
  o.type = "sawtooth"; o2.type = "square"; o.frequency.value = base; o2.frequency.value = base * 1.01;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
  g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o.start(); o2.start();
  return {
    set(freq, vol = 0.04) { const t = c.currentTime; o.frequency.setTargetAtTime(freq, t, 0.1); o2.frequency.setTargetAtTime(freq * 1.01, t, 0.1); g.gain.setTargetAtTime(isMuted() ? 0 : vol, t, 0.1); },
    stop() { const t = c.currentTime; g.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { try { o.stop(); o2.stop(); } catch { /* already stopped */ } }, 300); },
  };
}
