// ============================================================================
// POST /api/auth/logout
// ----------------------------------------------------------------------------
// Clears the session cookie. Returns 200 always.
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true'
};

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Set-Cookie': 'zoe_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
