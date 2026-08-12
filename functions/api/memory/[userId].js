// ============================================================================
// /api/memory/<userId> — KV-backed per-user memory store
// ----------------------------------------------------------------------------
// Routes (file-routed by Cloudflare Pages Functions):
//   GET    /api/memory/<userId>                  → list all memories
//   POST   /api/memory/<userId>                  → add a memory
//   DELETE /api/memory/<userId>/<memoryId>       → remove a memory
//
// Storage: Cloudflare KV, bound as `MEMORY` in the Pages project settings.
//   Key:   user:<userId>
//   Value: JSON.stringify({ memories: [...] })
//
// Memory record shape:
//   {
//     id: 'm_<ts>_<rand>',
//     ts: <msEpoch>,
//     type: 'note' | 'chat' | 'fact' | 'preference',
//     content: <string, max 2000 chars>,
//     tags: [<string>, ...]   // max 10, each max 50 chars
//   }
//
// Validation: userId must match /^[A-Za-z0-9_:.-]{1,96}$/.
// (Phase 13: 'u:' prefix = auth user, 'b:' prefix = browser-fallback.)
// ============================================================================

const USER_ID_RE = /^[A-Za-z0-9_:.-]{1,96}$/;
const MAX_CONTENT = 2000;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 50;
const ALLOWED_TYPES = new Set(['note', 'chat', 'fact', 'preference']);
const MAX_MEMORIES_PER_USER = 200;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}

function isValidUserId(id) {
  return typeof id === 'string' && USER_ID_RE.test(id);
}

function isValidMemory(m) {
  if (!m || typeof m !== 'object') return false;
  if (typeof m.content !== 'string' || m.content.length === 0 || m.content.length > MAX_CONTENT) return false;
  if (typeof m.type !== 'string' || !ALLOWED_TYPES.has(m.type)) return false;
  if (!Array.isArray(m.tags)) return false;
  if (m.tags.length > MAX_TAGS) return false;
  for (const t of m.tags) {
    if (typeof t !== 'string' || t.length === 0 || t.length > MAX_TAG_LEN) return false;
  }
  return true;
}

function newMemoryId() {
  return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function kvKey(userId) { return 'user:' + userId; }

async function readUser(env, userId) {
  const key = kvKey(userId);
  const raw = await env.MEMORY.get(key);
  if (!raw) return { memories: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.memories)) return { memories: [] };
    return parsed;
  } catch (_) {
    // Corrupt entry — start fresh, but log it.
    console.warn('[memory] corrupt entry for', userId, '— resetting');
    return { memories: [] };
  }
}

async function writeUser(env, userId, data) {
  await env.MEMORY.put(kvKey(userId), JSON.stringify(data), {
    // 30-day expiration. Re-saved on every write, so an active user's
    // memories persist indefinitely. Idle users drop off after 30 days.
    expirationTtl: 60 * 60 * 24 * 30
  });
}

// ----------------------------------------------------------------------------
// Route handlers
// ----------------------------------------------------------------------------

export async function onRequestGet(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  const { userId } = context.params;
  if (!isValidUserId(userId)) {
    return jsonResponse({ error: 'Invalid userId' }, 400);
  }
  if (!context.env.MEMORY) {
    return jsonResponse({ error: 'KV binding MEMORY not configured' }, 503);
  }
  try {
    const data = await readUser(context.env, userId);
    return jsonResponse({ userId, ...data });
  } catch (e) {
    return jsonResponse({ error: `KV read failed: ${e.message || e}` }, 502);
  }
}

export async function onRequestPost(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  const { userId } = context.params;
  if (!isValidUserId(userId)) {
    return jsonResponse({ error: 'Invalid userId' }, 400);
  }
  if (!context.env.MEMORY) {
    return jsonResponse({ error: 'KV binding MEMORY not configured' }, 503);
  }

  let body;
  try { body = await context.request.json(); }
  catch (_) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  if (!isValidMemory(body)) {
    return jsonResponse({
      error: 'Invalid memory shape',
      expected: {
        content: '<string 1..2000>',
        type: [...ALLOWED_TYPES],
        tags: '<array of strings, max 10, each max 50 chars>'
      }
    }, 400);
  }

  const memory = {
    id: newMemoryId(),
    ts: body.ts || Date.now(),
    type: body.type,
    content: body.content,
    tags: body.tags
  };

  try {
    const data = await readUser(context.env, userId);
    // Cap to MAX_MEMORIES_PER_USER. Drop the oldest if over.
    data.memories.push(memory);
    if (data.memories.length > MAX_MEMORIES_PER_USER) {
      data.memories = data.memories
        .sort((a, b) => b.ts - a.ts)
        .slice(0, MAX_MEMORIES_PER_USER);
    }
    await writeUser(context.env, userId, data);
    return jsonResponse({ userId, memory, count: data.memories.length }, 201);
  } catch (e) {
    return jsonResponse({ error: `KV write failed: ${e.message || e}` }, 502);
  }
}

export async function onRequestDelete(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  // Two-level routing: /api/memory/<userId>/<memoryId>
  // Cloudflare Pages Functions supports [userId].js for one segment.
  // For two segments, we either need [userId]/[memoryId].js OR we
  // parse the URL in [userId].js. We use the URL-parse approach to
  // avoid duplicating the file structure.
  const { userId } = context.params;
  if (!isValidUserId(userId)) {
    return jsonResponse({ error: 'Invalid userId' }, 400);
  }
  if (!context.env.MEMORY) {
    return jsonResponse({ error: 'KV binding MEMORY not configured' }, 503);
  }

  // Parse /<memoryId> from the URL path.
  const url = new URL(context.request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // Expected: ['api', 'memory', userId, memoryId]
  const memoryId = parts[3];
  if (!memoryId || typeof memoryId !== 'string' || memoryId.length > 80) {
    return jsonResponse({ error: 'Missing or invalid memoryId in path' }, 400);
  }

  try {
    const data = await readUser(context.env, userId);
    const before = data.memories.length;
    data.memories = data.memories.filter(m => m.id !== memoryId);
    if (data.memories.length === before) {
      return jsonResponse({ error: 'memoryId not found' }, 404);
    }
    await writeUser(context.env, userId, data);
    return new Response(null, { status: 204, headers: corsHeaders() });
  } catch (e) {
    return jsonResponse({ error: `KV write failed: ${e.message || e}` }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}