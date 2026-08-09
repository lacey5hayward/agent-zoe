// ============================================================================
// POST /api/memory/search — naive recall
// ----------------------------------------------------------------------------
// Scoring: keyword overlap (case-insensitive) + recency boost.
//   score(memory, queryWords) = matchedWords + 0.5 * recencyFactor
//   recencyFactor = max(0, 1 - daysOld / 30)   // linear decay over 30 days
//
// Returns top-K memories sorted by score, descending.
//
// Body: { userId, query, topK }
// ============================================================================

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_TOPK = 3;
const MAX_TOPK = 20;
const MAX_QUERY_LEN = 500;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the',
  'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your', 'i',
  'me', 'my', 'we', 'our', 'they', 'their', 'he', 'she', 'his', 'her'
]);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function tokenize(text) {
  if (!text) return [];
  return String(text).toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

function scoreMemory(memory, queryWords) {
  if (!queryWords || queryWords.length === 0) {
    // No query — just rank by recency.
    const daysOld = (Date.now() - memory.ts) / (1000 * 60 * 60 * 24);
    return 0.5 * Math.max(0, 1 - daysOld / 30);
  }
  const haystack = (memory.content + ' ' + (memory.tags || []).join(' ')).toLowerCase();
  let matched = 0;
  for (const w of queryWords) {
    if (haystack.includes(w)) matched++;
  }
  const daysOld = (Date.now() - memory.ts) / (1000 * 60 * 60 * 24);
  const recency = 0.5 * Math.max(0, 1 - daysOld / 30);
  return matched + recency;
}

export async function onRequestPost(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  if (!context.env.MEMORY) {
    return jsonResponse({ error: 'KV binding MEMORY not configured' }, 503);
  }

  let body;
  try { body = await context.request.json(); }
  catch (_) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const { userId, query, topK } = body || {};
  if (!userId || !USER_ID_RE.test(userId)) {
    return jsonResponse({ error: 'Invalid or missing userId' }, 400);
  }
  if (typeof query !== 'string' || query.length > MAX_QUERY_LEN) {
    return jsonResponse({ error: `query must be a string up to ${MAX_QUERY_LEN} chars` }, 400);
  }
  const k = Math.min(MAX_TOPK, Math.max(1, parseInt(topK, 10) || DEFAULT_TOPK));

  const queryWords = tokenize(query);

  try {
    const raw = await context.env.MEMORY.get('user:' + userId);
    if (!raw) return jsonResponse({ userId, query, matches: [] });
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.memories)) return jsonResponse({ userId, query, matches: [] });

    const hasQuery = queryWords && queryWords.length > 0;
    const scored = parsed.memories
      .map(m => ({ memory: m, score: scoreMemory(m, queryWords) }))
      // If the query has words, require at least one keyword match.
      // (Recency boost alone shouldn't surface unrelated memories.)
      .filter(s => hasQuery ? s.score >= 1 : s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return jsonResponse({
      userId,
      query,
      topK: k,
      matches: scored.map(s => ({
        memory: s.memory,
        score: Math.round(s.score * 100) / 100
      }))
    });
  } catch (e) {
    return jsonResponse({ error: `KV read failed: ${e.message || e}` }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}