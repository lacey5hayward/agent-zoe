// ============================================================================
// GET /api/auth/me
// ----------------------------------------------------------------------------
// Returns the currently-logged-in user, or 401 if not logged in.
// Used by the frontend to know if/who the user is on every page load.
// ============================================================================

import { verify } from './_jwt.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true'
};

function readCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const token = readCookie(context.request, 'zoe_session');
  if (!token) {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
  try {
    const payload = await verify(token, env.JWT_SECRET || 'dev-secret-change-me');
    return new Response(JSON.stringify({
      user: { id: payload.sub, username: payload.name, isAdmin: !!payload.isAdmin }
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (_) {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
