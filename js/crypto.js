/* ============================================================
   crypto.js — SHA-256, PBKDF2 y utilidades criptográficas.
   Usa WebCrypto cuando está disponible (https / localhost) y
   un respaldo en JavaScript puro para poder abrir la app incluso
   desde un archivo local (file://).
   ============================================================ */

const encoder = new TextEncoder();
const HEX = '0123456789abcdef';

export const hasWebCrypto = (() => {
  try {
    return !!(globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.subtle.digest);
  } catch {
    return false;
  }
})();

export function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return out;
}

export function hexToBytes(hex) {
  const clean = String(hex).replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/* ---------------- SHA-256 puro (respaldo) ---------------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

export function sha256BytesFallback(bytes) {
  const l = bytes.length;
  const remainder = (l + 9) % 64;
  const pad = remainder === 0 ? 0 : 64 - remainder;
  const total = l + 9 + pad;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[l] = 0x80;
  const view = new DataView(m.buffer);
  const bits = l * 8;
  view.setUint32(total - 8, Math.floor(bits / 0x100000000));
  view.setUint32(total - 4, bits >>> 0);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v));
  return out;
}

/* ---------------- API de hash ---------------- */

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  if (hasWebCrypto) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return bytesToHex(new Uint8Array(digest));
    } catch { /* usa respaldo */ }
  }
  return bytesToHex(sha256BytesFallback(bytes));
}

/* ---------------- PBKDF2 ---------------- */

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function hmacFallback(key, msg) {
  let k = key.length > 64 ? sha256BytesFallback(key) : key;
  const block = new Uint8Array(64);
  block.set(k);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = block[i] ^ 0x36;
    opad[i] = block[i] ^ 0x5c;
  }
  return sha256BytesFallback(concatBytes(opad, sha256BytesFallback(concatBytes(ipad, msg))));
}

function pbkdf2Fallback(pinBytes, saltBytes, iterations) {
  // Un solo bloque de 32 bytes es suficiente para la contraseña.
  const block = concatBytes(saltBytes, new Uint8Array([0, 0, 0, 1]));
  let u = hmacFallback(pinBytes, block);
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = hmacFallback(pinBytes, u);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}

/**
 * Deriva el hash del PIN. Usa PBKDF2-SHA256 con WebCrypto si existe;
 * si no, una variante iterada de HMAC-SHA256 en JS puro.
 */
export async function derivePin(pin, saltHex, iterations) {
  const salt = hexToBytes(saltHex);
  const pinBytes = encoder.encode(String(pin));
  if (hasWebCrypto) {
    try {
      const key = await crypto.subtle.importKey('raw', pinBytes, 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
      );
      return bytesToHex(new Uint8Array(bits));
    } catch { /* usa respaldo */ }
  }
  return bytesToHex(pbkdf2Fallback(pinBytes, salt, iterations));
}

export function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function randomId() {
  try {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* respaldo */ }
  return randomHex(16);
}

export async function createCredential(pin) {
  const strong = hasWebCrypto;
  const iterations = strong ? 210000 : 30000;
  const salt = randomHex(16);
  const hash = await derivePin(pin, salt, iterations);
  return {
    algo: strong ? 'PBKDF2-SHA256' : 'HMAC-SHA256-iterado',
    iterations,
    salt,
    hash,
    createdAt: new Date().toISOString()
  };
}

/** Comparación en tiempo constante de dos cadenas hexadecimales. */
export function safeEqual(a = '', b = '') {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin, credential) {
  if (!credential || !credential.salt || !credential.hash) return false;
  const hash = await derivePin(pin, credential.salt, credential.iterations || 200000);
  return safeEqual(hash, credential.hash);
}
