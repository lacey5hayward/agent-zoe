// ============================================================================
// GET /api/proxy/status — engine inventory + rate-limit memo snapshot
// ----------------------------------------------------------------------------
// Returns which AI engine secrets are configured, which are currently
// rate-limited (per the in-memory memo), and which are unavailable.
//
// Body:
//   {
//     proxyLive: true,
//     version: 'phase7-1',
//     engines: {
//       mistral: 'live' | 'missing' | 'rate-limited',
//       ...
//     },
//     rateLimited: { mistral: { until: msEpoch, reason: 429 }, ... },
//     timestamp: msEpoch
//   }
// ============================================================================

// Mirror the OPENAI_COMPAT and SPECIAL maps so this file is self-contained
// for the status response. (Keep in sync with index.js — easier than
// importing across module boundaries in Workers.)

// Engines that need a secret key (live = key present, missing = key absent)
const ENGINE_SECRETS = {
  mistral:     'MISTRAL_API_KEY',
  groq:        'GROQ_API_KEY',
  deepseek:    'DEEPSEEK_API_KEY',
  gemini:      'GEMINI_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
  azure:       'AZURE_OPENAI_API_KEY',
  oracle:      'ORACLE_API_KEY',
  openrouter:  'OPENROUTER_API_KEY',
};

// Engines that are always available (no secret required)
const KEYLESS_ENGINES = ['pollinations', 'kilo', 'llm7', 'opencode', 'bazaarlink', 'ovh', 'nvidia'];

// The same in-memory memo used by index.js. Workers module scope shares
// state across requests in the same isolate, so rate-limit info written by
// index.js is visible here. New isolates start with an empty memo.
function readMemoSnapshot() {
  // Re-import the memo by hitting the same module. Since we can't share
  // module-scope vars across files in Workers easily, we re-derive the
  // shape and let index.js write into the globalThis slot it uses.
  const memo = (globalThis.__RATE_LIMIT_MEMO__) || new Map();
  const now = Date.now();
  const snapshot = {};
  for (const [engineId, entry] of memo.entries()) {
    if (entry.until > now) {
      snapshot[engineId] = { until: entry.until, reason: entry.reason, ttlMs: entry.until - now };
    }
  }
  return snapshot;
}

export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const env = context.env || {};
  const memo = readMemoSnapshot();
  const engines = {};

  // Key-backed engines: live if secret is present, missing if not
  for (const [engineId, secretName] of Object.entries(ENGINE_SECRETS)) {
    if (!env[secretName]) {
      engines[engineId] = 'missing';
    } else if (memo[engineId]) {
      engines[engineId] = 'rate-limited';
    } else {
      engines[engineId] = 'live';
    }
  }

  // Keyless engines: always live unless currently rate-limited
  for (const engineId of KEYLESS_ENGINES) {
    engines[engineId] = memo[engineId] ? 'rate-limited' : 'live';
  }

  return new Response(JSON.stringify({
    proxyLive: true,
    version: 'phase7-2',
    engines,
    rateLimited: memo,
    timestamp: Date.now()
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}