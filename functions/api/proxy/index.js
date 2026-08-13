// ============================================================================
// /api/proxy — Unified AI proxy (Phase 7: generic engine + 429 fallback)
// v2.7.5: Dual-Link Hydra — Robust Gemini & Restored Team
// ============================================================================

const GITHUB_OWNER = 'lacey5hayward';
const GITHUB_REPO = 'agent-zoe';
const GITHUB_BRANCH = 'main';

// --- OpenAI-compatible engine registry --------------------------------------
const OPENAI_COMPAT = {
  mistral: { id: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', secret: 'MISTRAL_API_KEY', label: 'Mistral' },
  groq: { id: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', secret: 'GROQ_API_KEY', label: 'Groq' },
  deepseek: { id: 'deepseek', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', secret: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
  kilo: { id: 'kilo', url: 'https://kilo.ai/api/openai/v1/chat/completions', model: 'auto:free', secret: null, label: 'Kilo (keyless)' },
  llm7: { id: 'llm7', url: 'https://api.llm7.io/v1/chat/completions', model: 'gpt-4o', secret: null, label: 'LLM7 (keyless)' },
  opencode: { id: 'opencode', url: 'https://opencode.ai/zen/v1/chat/completions', model: 'gpt-4o-mini', secret: null, label: 'OpenCode Zen (keyless)' },
  bazaarlink: { id: 'bazaarlink', url: 'https://bazaarlink.ai/api/v1/chat/completions', model: 'auto:free', secret: null, label: 'BazaarLink (keyless)' },
  nvidia: { id: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.1-70b-instruct', secret: null, label: 'NVIDIA NIM (keyless)' },
  openrouter: {
    id: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemma-2-9b-it:free',
    secret: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    fallbacks: ['mistralai/mistral-7b-instruct:free', 'meta-llama/llama-3.1-8b-instruct:free'],
    extraHeaders: () => ({
      'HTTP-Referer': `https://agent-zoe.pages.dev`,
      'X-Title': 'Agent Zoe Social Hub'
    })
  }
};

const SPECIAL = {
  gemini: {
    id: 'gemini', label: 'Gemini', secret: 'GEMINI_API_KEY',
    formatBody: ({ messages, sysPrompt }) => ({
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      systemInstruction: { parts: [{ text: sysPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    }),
    extractText: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }
};

const RATE_LIMIT_MEMO = (globalThis.__RATE_LIMIT_MEMO__ ||= new Map());
const RATE_LIMIT_TTL_MS = 5 * 60 * 1000;

function isRateLimited(engineId) {
  const entry = RATE_LIMIT_MEMO.get(engineId);
  if (!entry) return false;
  if (Date.now() > entry.until) { RATE_LIMIT_MEMO.delete(engineId); return false; }
  return true;
}

function memoRateLimit(engineId, status) {
  RATE_LIMIT_MEMO.set(engineId, { until: Date.now() + RATE_LIMIT_TTL_MS, reason: status });
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

async function callEngine(engineId, payload, env) {
  if (OPENAI_COMPAT[engineId]) {
    const cfg = OPENAI_COMPAT[engineId];
    const headers = { 'Content-Type': 'application/json' };
    let key = payload.localKey || (cfg.secret ? (env[cfg.secret] || env['MEMORY']) : env['MEMORY']);
    if (key && key !== 'null' && key !== 'undefined') headers['Authorization'] = `Bearer ${key}`;
    if (typeof cfg.extraHeaders === 'function') Object.assign(headers, cfg.extraHeaders(env));

    const url = cfg.url;
    const models = [payload.model || cfg.model, ...(cfg.fallbacks || [])];
    let lastErr = null;
    for (const m of models) {
      try {
        const res = await fetch(url, {
          method: 'POST', headers,
          body: JSON.stringify({ model: m, messages: [{ role: 'system', content: payload.sysPrompt }, ...payload.messages], temperature: 0.7, max_tokens: 2048 })
        });
        if (!res.ok) {
          const body = await res.text().catch(() => 'No body');
          throw { kind: 'http', status: res.status, body: body.slice(0, 300) };
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw { kind: 'empty', engine: engineId };
        return { engine: engineId, text: text, modelUsed: m };
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  
  if (engineId === 'gemini') {
    const cfg = SPECIAL.gemini;
    const key = payload.localKey || env[cfg.secret] || env['MEMORY'];
    if (!key) throw { kind: 'missing-key', engine: 'gemini' };
    
    // v2.7.5: Try both v1 and v1beta to avoid 404s
    const versions = ['v1', 'v1beta'];
    let lastErr = null;
    for (const ver of versions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${ver}/models/${payload.model || 'gemini-1.5-flash'}:generateContent?key=${key}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg.formatBody(payload)) });
        if (res.ok) {
          const data = await res.json();
          return { engine: 'gemini', text: cfg.extractText(data), verUsed: ver };
        }
        const errBody = await res.text().catch(() => 'No body');
        if (res.status !== 404) throw { kind: 'http', status: res.status, body: errBody.slice(0, 300) };
        lastErr = { kind: 'http', status: res.status, body: errBody.slice(0, 300) };
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  throw { kind: 'unknown-engine', engine: engineId };
}

async function callWithFallback(chain, payload, env) {
  const tried = [];
  for (const engineId of chain) {
    if (isRateLimited(engineId)) continue;
    try {
      return await callEngine(engineId, payload, env);
    } catch (err) {
      tried.push({ engine: engineId, error: err });
      if (err.status === 429 || err.status === 402) memoRateLimit(engineId, err.status);
    }
  }
  
  // Final Panic Fallback
  try {
    const prompt = encodeURIComponent(`${payload.sysPrompt}\n\nUser Request: ${payload.messages[payload.messages.length-1].content}`);
    const res = await fetch(`https://text.pollinations.ai/${prompt}?model=openai&json=true`);
    if (res.ok) {
      const data = await res.json();
      return { engine: 'pollinations-direct', text: data.choices?.[0]?.text || data.text || '' };
    }
  } catch (e) {}

  const e = new Error('All engines failed');
  e.kind = 'all-failed';
  e.tried = tried;
  throw e;
}

async function handleBuildRequest(body, env) {
  const { instruction, targetFile, localKey } = body;
  const token = env.GITHUB_TOKEN;
  if (!token) return jsonResponse({ error: 'GITHUB_TOKEN not set' }, 500);

  try {
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${targetFile}?ref=${GITHUB_BRANCH}`;
    const getRes = await fetch(getUrl, { headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Zoe-Cloud-Builder', 'Accept': 'application/vnd.github.v3+json' } });
    if (!getRes.ok) return jsonResponse({ error: `GitHub fetch failed (${getRes.status})` }, 502);
    const fileData = await getRes.json();
    const content = atob(fileData.content.replace(/\n/g, ''));

    const sysPrompt = `You are Zoe's Building Agent. You edit source code. Target File: ${targetFile}. Respond ONLY with a JSON plan: { "plan": [ { "file": "${targetFile}", "find": "exact string to find", "replace": "new string", "explanation": "why" } ] }. Content:\n${content}`;
    // v2.7.5: Restored Hydra Team
    const chain = ['gemini', 'openrouter', 'kilo', 'opencode', 'llm7', 'bazaarlink', 'nvidia'];
    
    try {
      const aiRes = await callWithFallback(chain, { messages: [{ role: 'user', content: instruction }], sysPrompt, localKey }, env);
      let text = aiRes.text;
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      return jsonResponse(JSON.parse(text));
    } catch (aiErr) {
      return jsonResponse({ error: 'All Cloud AI engines failed', diagnostic: aiErr.tried ? aiErr.tried.map(t => `${t.engine}: ${t.error.status || t.error.kind}`).join(', ') : String(aiErr) }, 502);
    }
  } catch (e) { return jsonResponse({ error: 'Cloud build crashed', diagnostic: e.message }, 500); }
}

export async function onRequestPost(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  let body;
  try { body = await context.request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  if (body.type === 'build') return handleBuildRequest(body, context.env);
  if (body.stealthData) {
    const binString = atob(body.stealthData);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
    body = JSON.parse(new TextDecoder().decode(bytes));
  }
  const { engine, chain, dna, persona, messages, sysPrompt, prompt, model, localKey } = body;
  const composedSysPrompt = (sysPrompt || '') + (dna ? `\n\n[DNA]\n${dna}` : '') + (persona ? `\n\n[Persona]\n${persona}` : '');
  try {
    // v2.7.5: Restored Hydra Team
    const chainToUse = Array.isArray(chain) ? ['gemini', 'openrouter', 'kilo', 'opencode', 'llm7', 'bazaarlink', 'nvidia'] : [engine || 'gemini', 'openrouter', 'kilo', 'opencode', 'llm7', 'bazaarlink', 'nvidia'];
    const result = await callWithFallback(chainToUse, { messages, sysPrompt: composedSysPrompt, model, localKey }, context.env);
    return jsonResponse(result);
  } catch (err) { return jsonResponse({ error: 'All engines failed', details: err }, 502); }
}

export async function onRequestOptions() { return new Response(null, { headers: corsHeaders() }); }
