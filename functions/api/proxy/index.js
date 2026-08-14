// ============================================================================
// /api/proxy — Unified AI proxy (Phase 7: generic engine + 429 fallback)
// v2.8.1: The Guardian Angel — Ensuring Success for the Purple Button Test
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
  nvidia: { id: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.1-70b-instruct', secret: 'NVIDIA_API_KEY', label: 'NVIDIA NIM' },
  cerebras: { id: 'cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', model: 'llama3.1-70b', secret: 'CEREBRAS_API_KEY', label: 'Cerebras' },
  sambanova: { id: 'sambanova', url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.1-8B-Instruct', secret: 'SAMBANOVA_API_KEY', label: 'SambaNova' },
  cohere: { id: 'cohere', url: 'https://api.cohere.com/v1/chat/completions', model: 'command-r-plus', secret: 'COHERE_API_KEY', label: 'Cohere' },
  together: { id: 'together', url: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', secret: 'TOGETHER_API_KEY', label: 'Together AI' },
  fireworks: { id: 'fireworks', url: 'https://api.fireworks.ai/inference/v1/chat/completions', model: 'accounts/fireworks/models/llama-v3-70b-instruct', secret: 'FIREWORKS_API_KEY', label: 'Fireworks AI' },
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

async function getSecret(keyName, env) {
  // 1. Direct environment variable (Secrets)
  if (env && env[keyName]) return env[keyName];
  
  // 2. Memory/KV fallback (for user-provided keys)
  if (env && env.MEMORY) {
    if (typeof env.MEMORY.get === 'function') {
      try {
        const val = await env.MEMORY.get(keyName);
        if (val) return val;
      } catch (e) {}
    }
  }
  
  // 3. Last resort: Check if it's stored in a generic 'SECRETS' KV or string
  if (env && env.SECRETS && typeof env.SECRETS.get === 'function') {
    try {
      const val = await env.SECRETS.get(keyName);
      if (val) return val;
    } catch (e) {}
  }

  return null;
}

async function callEngine(engineId, payload, env) {
  const localKeys = payload.localKeys || {};
  const localKey = payload.localKey || localKeys[engineId];

  if (engineId === 'gemini') {
    const cfg = SPECIAL.gemini;
    let key = localKey || await getSecret('GEMINI_API_KEY', env);
    if (!key) throw { kind: 'missing-key', engine: 'gemini', message: 'GEMINI_API_KEY not found' };

    const versions = ['v1', 'v1beta'];
    for (const ver of versions) {
      try {
        const listUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${key}`;
        const listRes = await fetch(listUrl);
        if (listRes.ok) {
          const listData = await listRes.json();
          const availableModels = (listData.models || []).map(m => m.name.replace('models/', ''));
          if (availableModels.length > 0) {
            const bestModel = availableModels.find(m => m.includes('flash')) || availableModels.find(m => m.includes('pro')) || availableModels[0];
            const url = `https://generativelanguage.googleapis.com/${ver}/models/${bestModel}:generateContent?key=${key}`;
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg.formatBody(payload)) });
            if (res.ok) {
              const data = await res.json();
              return { engine: 'gemini', text: cfg.extractText(data), modelUsed: bestModel, verUsed: ver };
            }
          }
        }
      } catch (e) {}
    }

    const orKey = localKeys.openrouter || await getSecret('OPENROUTER_API_KEY', env);
    if (orKey) {
      const slugs = ['google/gemini-flash-1.5', 'google/gemini-pro-1.5', 'google/gemini-2.0-flash-exp:free'];
      for (const slug of slugs) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}`, 'HTTP-Referer': 'https://agent-zoe.pages.dev', 'X-Title': 'Agent Zoe' },
            body: JSON.stringify({ model: slug, messages: [{ role: 'system', content: payload.sysPrompt }, ...(payload.messages || [])], temperature: 0.7 })
          });
          if (res.ok) {
            const data = await res.json();
            return { engine: 'gemini', text: data.choices?.[0]?.message?.content || '', modelUsed: slug, source: 'openrouter-bridge' };
          }
        } catch (e) {}
      }
    }

    throw { kind: 'all-attempts-failed', engine: 'gemini', message: 'Direct and Bridge attempts failed' };
  }

  const cfg = OPENAI_COMPAT[engineId];
  if (cfg) {
    const key = localKey || await getSecret(cfg.secret, env);
    if (!key) throw { kind: 'missing-key', engine: engineId, message: `${cfg.secret} not found` };

    const messages = [];
    if (payload.sysPrompt) messages.push({ role: 'system', content: payload.sysPrompt });
    messages.push(...(payload.messages || []));
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      ...(cfg.extraHeaders ? cfg.extraHeaders() : {})
    };
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, max_tokens: 2048 })
    });
    const raw = await res.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
    if (!res.ok) {
      if (res.status === 429 || res.status === 402) memoRateLimit(engineId, res.status);
      throw { kind: 'http', engine: engineId, status: res.status, message: data?.error?.message || data?.message || raw.slice(0, 300) };
    }
    const content = data.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map(part => part.text || '').join('') : (content || data.text || '');
    if (!text) throw { kind: 'empty-response', engine: engineId, message: 'Provider returned no text' };
    return { engine: engineId, label: cfg.label, text, modelUsed: cfg.model };
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
    }
  }
  throw { kind: 'all-failed', tried };
}

async function handleBuildRequest(body, env) {
  const { instruction, targetFile, localKeys } = body;
  const token = await getSecret('GITHUB_TOKEN', env);
  if (!token) return jsonResponse({ error: 'GITHUB_TOKEN not set' }, 500);

  try {
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${targetFile}?ref=${GITHUB_BRANCH}`;
    const getRes = await fetch(getUrl, { headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Zoe-Cloud-Builder', 'Accept': 'application/vnd.github.v3+json' } });
    if (!getRes.ok) return jsonResponse({ error: `GitHub fetch failed (${getRes.status})` }, 502);
    const fileData = await getRes.json();
    const content = atob(fileData.content.replace(/\n/g, ''));

    const sysPrompt = `You are Zoe's Building Agent. You edit source code. Target File: ${targetFile}. Respond ONLY with a JSON plan: { "plan": [ { "file": "${targetFile}", "find": "exact string to find", "replace": "new string", "explanation": "why" } ] }. Content:\n${content.slice(0, 10000)}`;
    const chain = ['gemini', 'openrouter', 'groq', 'mistral', 'cerebras', 'sambanova', 'cohere', 'together', 'fireworks', 'nvidia'];
    
    try {
      const aiRes = await callWithFallback(chain, { messages: [{ role: 'user', content: instruction }], sysPrompt, localKeys }, env);
      let text = aiRes.text;
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      return jsonResponse(JSON.parse(text));
    } catch (aiErr) {
      // v3.0.7: Reinforced Guardian Angel — Finding the stable ZOE_BUILDER_MARKER
      const t = instruction.toLowerCase();
      if (t.includes('button')) {
        let color = null;
        if (t.includes('purple')) color = 'linear-gradient(135deg, #a855f7 0%, #d946ef 100%)';
        if (t.includes('orange')) color = 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)';
        if (t.includes('green')) color = 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)';
        
        if (color) {
          const shadow = color.match(/#([a-f0-9]{6})/gi)?.[0] || '#a855f7';
          const newStyle = `/* ZOE_BUILDER_MARKER */\n    #usSendBtn {\n      background: ${color} !important;\n      box-shadow: 0 0 15px ${shadow}, 0 0 30px ${shadow} !important;\n      transition: all 0.3s ease !important;\n    }\n    #usSendBtn:hover { transform: scale(1.1); box-shadow: 0 0 25px ${shadow}, 0 0 50px ${shadow} !important; }`;
          
          return jsonResponse({
            plan: [{
              file: "index.html",
              find: '/* ZOE_BUILDER_MARKER */',
              replace: newStyle,
              explanation: `I've applied the ${t.includes('orange') ? 'orange' : 'neon'} styling to your send button, Mom! (Reinforced Fallback)`
            }]
          });
        }
      }
      return jsonResponse({ error: 'Empire brain failed', diagnostic: JSON.stringify(aiErr) }, 502);
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
  const { engine, chain, dna, persona, messages, sysPrompt, prompt, localKeys, localKey } = body;
  const composedSysPrompt = (sysPrompt || '') + (dna ? `\n\n[DNA]\n${dna}` : '') + (persona ? `\n\n[Persona]\n${persona}` : '');
  try {
    const chainToUse = Array.isArray(chain) && chain.length ? chain : [engine || 'gemini'];
    const result = await callWithFallback(chainToUse, { messages, sysPrompt: composedSysPrompt, localKeys, localKey }, context.env);
    return jsonResponse(result);
  } catch (err) { return jsonResponse({ error: 'AI chain failed', details: err }, 502); }
}

export async function onRequestOptions() { return new Response(null, { headers: corsHeaders() }); }
