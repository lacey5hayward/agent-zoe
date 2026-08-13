// ============================================================================
// /api/proxy — Unified AI proxy (Phase 7: generic engine + 429 fallback)
// v2.8.0: The ListModels Probe — Automating the Brain Hunt
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

async function getSecret(keyName, env) {
  if (env[keyName]) return env[keyName];
  if (env.MEMORY) {
    if (typeof env.MEMORY.get === 'function') {
      try {
        const val = await env.MEMORY.get(keyName);
        if (val) return val;
        const mem = await env.MEMORY.get('MEMORY');
        if (mem) return mem;
      } catch (e) {}
    }
    if (typeof env.MEMORY === 'string') return env.MEMORY;
  }
  return null;
}

async function callEngine(engineId, payload, env) {
  if (engineId === 'gemini') {
    const cfg = SPECIAL.gemini;
    let key = payload.localKey || await getSecret('GEMINI_API_KEY', env);
    if (!key) throw { kind: 'missing-key', engine: 'gemini', message: 'GEMINI_API_KEY not found' };
    
    // v2.8.0: The ListModels Probe — Discovering working model names
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const listRes = await fetch(listUrl);
      if (listRes.ok) {
        const listData = await listRes.json();
        const availableModels = (listData.models || []).map(m => m.name.replace('models/', ''));
        if (availableModels.length > 0) {
          // Filter for Flash or Pro models
          const flash = availableModels.find(m => m.includes('flash') && !m.includes('8b'));
          const flash8b = availableModels.find(m => m.includes('flash') && m.includes('8b'));
          const pro = availableModels.find(m => m.includes('pro'));
          const bestModel = flash || flash8b || pro || availableModels[0];
          
          // Call with discovered model
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${key}`;
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg.formatBody(payload)) });
          if (res.ok) {
            const data = await res.json();
            return { engine: 'gemini', text: cfg.extractText(data), modelUsed: bestModel, source: 'discovered' };
          }
        }
      }
    } catch (e) {}

    // Fallback: Try OpenRouter Gemini if direct Google fails
    const orKey = payload.localKey || await getSecret('OPENROUTER_API_KEY', env);
    if (orKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${orKey}`,
            'HTTP-Referer': 'https://agent-zoe.pages.dev',
            'X-Title': 'Agent Zoe Social Hub'
          },
          body: JSON.stringify({ 
            model: 'google/gemini-flash-1.5', 
            messages: [{ role: 'system', content: payload.sysPrompt }, ...payload.messages],
            temperature: 0.7 
          })
        });
        if (res.ok) {
          const data = await res.json();
          return { engine: 'gemini', text: data.choices[0].message.content, source: 'openrouter-bridge' };
        }
      } catch (e) {}
    }

    throw { kind: 'all-attempts-failed', engine: 'gemini', message: 'Direct and Bridge attempts failed' };
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
  const { instruction, targetFile, localKey } = body;
  const token = await getSecret('GITHUB_TOKEN', env);
  if (!token) return jsonResponse({ error: 'GITHUB_TOKEN not set' }, 500);

  try {
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${targetFile}?ref=${GITHUB_BRANCH}`;
    const getRes = await fetch(getUrl, { headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Zoe-Cloud-Builder', 'Accept': 'application/vnd.github.v3+json' } });
    if (!getRes.ok) return jsonResponse({ error: `GitHub fetch failed (${getRes.status})` }, 502);
    const fileData = await getRes.json();
    const content = atob(fileData.content.replace(/\n/g, ''));

    // Cloud Slimming
    let slimContent = content;
    if (content.length > 10000) {
      const keywords = instruction.toLowerCase().split(/\s+/).filter(k => k.length > 3);
      const lines = content.split('\n');
      const relevantLines = new Set();
      lines.forEach((line, i) => {
        if (keywords.some(k => line.toLowerCase().includes(k))) {
          for (let j = Math.max(0, i-40); j < Math.min(lines.length, i+40); j++) relevantLines.add(j);
        }
      });
      if (relevantLines.size > 0) {
        slimContent = Array.from(relevantLines).sort((a,b) => a-b).map(i => lines[i]).join('\n');
        slimContent = `[SLIMMED VIEW OF ${targetFile}]\n...\n${slimContent}\n...`;
      }
    }

    const sysPrompt = `You are Zoe's Building Agent. You edit source code. Target File: ${targetFile}. Respond ONLY with a JSON plan: { "plan": [ { "file": "${targetFile}", "find": "exact string to find", "replace": "new string", "explanation": "why" } ] }. Content:\n${slimContent}`;
    
    // v2.8.0: Gemini Only (Hydra Sleeping)
    const chain = ['gemini'];
    
    try {
      const aiRes = await callWithFallback(chain, { messages: [{ role: 'user', content: instruction }], sysPrompt, localKey }, env);
      let text = aiRes.text;
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      return jsonResponse(JSON.parse(text));
    } catch (aiErr) {
      const diag = aiErr.tried ? aiErr.tried.map(t => `${t.engine}: ${JSON.stringify(t.error)}`).join(' | ') : String(aiErr);
      return jsonResponse({ error: 'Gemini brain failed', diagnostic: diag }, 502);
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
  const { engine, chain, dna, persona, messages, sysPrompt, prompt, localKey } = body;
  const composedSysPrompt = (sysPrompt || '') + (dna ? `\n\n[DNA]\n${dna}` : '') + (persona ? `\n\n[Persona]\n${persona}` : '');
  try {
    const chainToUse = Array.isArray(chain) ? ['gemini'] : [engine || 'gemini'];
    const result = await callWithFallback(chainToUse, { messages, sysPrompt: composedSysPrompt, localKey }, context.env);
    return jsonResponse(result);
  } catch (err) { return jsonResponse({ error: 'Gemini brain failed', details: err }, 502); }
}

export async function onRequestOptions() { return new Response(null, { headers: corsHeaders() }); }
