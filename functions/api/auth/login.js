// ============================================================================
// POST /api/auth/login
// ----------------------------------------------------------------------------
// Username + password login. On success, sets a JWT in an HttpOnly cookie.
// Username + password are stored as Cloudflare Pages environment variables:
//   ADMIN_USERNAME   — default 'admin'
//   ADMIN_PASSWORD   — default 'agentzoe' (CHANGE THIS IN PRODUCTION)
//   JWT_SECRET       — any random string (used to sign the JWT)
//
// Returns 200 { user: { username, isAdmin } } on success, 401 otherwise.
// ============================================================================

import { sign } from './_jwt.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true'
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

// Constant-time string compare to dodge timing attacks.
function safeStrEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  const env = context.env || {};
  const adminUser = (env.ADMIN_USERNAME || 'admin').trim();
  const adminPass = (env.ADMIN_PASSWORD || 'agentzoe').trim();
  const jwtSecret = (env.JWT_SECRET || 'dev-secret-change-me').trim();

  let body;
  try { body = await context.request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const { username, password } = body || {};
  if (!username || !password) {
    return jsonResponse({ error: 'username and password required' }, 400);
  }

  // Compare. If you want multiple users later, swap this for a D1 query.
  const userOk = safeStrEq(username, adminUser);
  const passOk = safeStrEq(password, adminPass);

  if (!userOk || !passOk) {
    // Constant-time: still hash to look the same to timing.
    await sha256(password);
    return jsonResponse({ error: 'Invalid username or password' }, 401);
  }

  const userId = 'admin';
  const isAdmin = true;
  const token = await sign({ sub: userId, name: adminUser, isAdmin, iat: Math.floor(Date.now() / 1000) }, jwtSecret, 60 * 60 * 24 * 30); // 30 days

  return new Response(JSON.stringify({ user: { id: userId, username: adminUser, isAdmin } }), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Set-Cookie': `zoe_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}; Secure`
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
