// Provably-fair helpers — exact mirror of backend/games_extra.py (pf_floats, vortex, chicken)
const enc = new TextEncoder();

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pfFloats(serverSeed, clientSeed, nonce, count) {
  const key = await crypto.subtle.importKey("raw", enc.encode(serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = [];
  let cursor = 0;
  while (out.length < count) {
    const dig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}:${cursor}`)));
    for (let j = 0; j < 32; j += 4) out.push(dig[j] / 256 + dig[j + 1] / 65536 + dig[j + 2] / 16777216 + dig[j + 3] / 4294967296);
    cursor += 1;
  }
  return out.slice(0, count);
}

export function vortexLoseSlots(segments, lose) {
  const l = Math.max(0, Math.min(segments - 1, lose));
  const s = new Set();
  for (let j = 0; j < l; j++) s.add(Math.floor((j * segments) / l));
  return [...s].sort((a, b) => a - b);
}

export async function verifyVortex({ serverSeed, clientSeed, nonce, segments, loseCounts }) {
  const floats = await pfFloats(serverSeed, clientSeed, nonce, loseCounts.length);
  return floats.map((f, k) => {
    const landing = Math.floor(f * segments);
    const slots = vortexLoseSlots(segments, loseCounts[k]);
    return { stage: k + 1, landing, safe: !slots.includes(landing), slots };
  });
}

export async function verifyChicken({ serverSeed, clientSeed, nonce, steps, hazard }) {
  const floats = await pfFloats(serverSeed, clientSeed, nonce, steps);
  const idx = floats.findIndex((f) => f < hazard);
  return { hazardStep: idx === -1 ? null : idx + 1, floats };
}

export const shortHash = (h = "") => (h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);
