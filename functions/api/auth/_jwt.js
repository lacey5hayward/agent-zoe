// ============================================================================
// JWT (HS256) — minimal, dependency-free, Workers-compatible.
// ----------------------------------------------------------------------------
// sign(payload, secret, ttlSeconds) → token string
// verify(token, secret) → payload object (throws on invalid)
//
// Algorithm: HS256 only. Header + payload base64url-encoded, signature is
// HMAC-SHA256(secret) of "header.payload" using Web Crypto.
// ============================================================================

function b64url(input) {
  let str;
  if (typeof input === 'string') str = input;
  else str = String.fromCharCode(...new Uint8Array(input));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToString(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function hmacSha256(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

export async function sign(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256(secret, signingInput);
  const sigB64 = b64url(sig);
  return `${signingInput}.${sigB64}`;
}

export async function verify(token, secret) {
  if (typeof token !== 'string') throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = await hmacSha256(secret, signingInput);
  const expectedB64 = b64url(expectedSig);
  if (expectedB64 !== sigB64) throw new Error('Bad signature');
  let payload;
  try {
    payload = JSON.parse(b64urlToString(payloadB64));
  } catch {
    throw new Error('Malformed payload');
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token expired');
  }
  return payload;
}
