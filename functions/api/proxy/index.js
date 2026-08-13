// ============================================================================
// /api/proxy — Unified AI proxy (Phase 7: generic engine + 429 fallback)
// ----------------------------------------------------------------------------
// The browser sends either:
//   { engine: 'mistral', messages, sysPrompt }                  → legacy single
//   { chain: ['groq','pollinations','gemini'], dna, messages }   → new with fallback
//
// Engine routing lives in the OPENAI_COMPAT registry + SPECIAL handlers.
// Adding a new OpenAI-compatible provider = one config entry, no code.
//
// Engines that aren't routed through this Worker (Puter, Workers AI,
// Pollinations text/image) are handled directly by Unicorn's app.js. This
// Worker is the **server-side secret keeper** for the engines whose keys
// you don't want in the browser.
// ============================================================================

// --- OpenAI-compatible engine registry --------------------------------------
// Any provider that follows the { messages: [{role,content}], ... } chat
// format with Bearer auth. Adding one = one entry.
const OPENAI_COMPAT = {
  mistral: {
    id: 'mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    secret: 'MISTRAL_API_KEY',
    label: 'Mistral'
  },
  groq: {
    id: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    secret: 'GROQ_API_KEY',
    label: 'Groq'
  },
  deepseek: {
    id: 'deepseek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    secret: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek'
  },
  // Pollinations: keyless free-tier fallback. secret: null means no auth header.
  // This is the engine that lets the merged product work on day 0 with zero setup.
  pollinations: {
    id: 'pollinations',
    url: 'https://text.pollinations.ai/',
    model: 'openai',
    secret: null,
    label: 'Pollinations (keyless)'
  },
  // Kilo: keyless OpenAI-compatible auto-routes to free models. No signup, no key.
  kilo: {
    id: 'kilo',
    url: 'https://kilo.ai/api/openai/v1/chat/completions',
    model: 'auto:free',
    secret: null,
    label: 'Kilo (keyless)'
  },
  // LLM7: anonymous keyless tier, OpenAI-compatible.
  llm7: {
    id: 'llm7',
    url: 'https://api.llm7.io/v1/chat/completions',
    model: 'gpt-4o', // Switched from mini to full 4o
    secret: null,
    label: 'LLM7 (keyless)'
  },
  // OpenCode Zen: keyless, free tier, OpenAI-compatible.
  opencode: {
    id: 'opencode',
    url: 'https://opencode.ai/zen/v1/chat/completions',
    model: 'gpt-4o-mini',
    secret: null,
    label: 'OpenCode Zen (keyless)'
  },
  // BazaarLink: auto:free model ID routes to whichever free model is up.
  bazaarlink: {
    id: 'bazaarlink',
    url: 'https://bazaarlink.ai/api/v1/chat/completions',
    model: 'auto:free',
    secret: null,
    label: 'BazaarLink (keyless)'
  },
  // OVH AI Endpoints: anonymous access, ~2 req/min, drifts in/out of catalog.
  ovh: {
    id: 'ovh',
    url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
    model: 'mixtral-8x7b-instruct-v0.1',
    secret: null,
    label: 'OVH AI (keyless)'
  },
  // NVIDIA Build (NIM): 100+ models, no card, 40 RPM rate limit. Needs no API key.
  nvidia: {
    id: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'meta/llama-3.1-70b-instruct',
    secret: null,
    label: 'NVIDIA NIM (keyless)'
  },
  // Azure OpenAI: paid (card required for $200 credit) but unlocks GPT-4 / GPT-4o.
  // baseUrl is set at runtime from AZURE_OPENAI_ENDPOINT env var.
  // secret: AZURE_OPENAI_API_KEY (api-key header, not Bearer).
  azure: {
    id: 'azure',
    url: null, // built per-request from env.AZURE_OPENAI_ENDPOINT
    model: 'gpt-4o', // overridden by deployment name in body
    secret: 'AZURE_OPENAI_API_KEY',
    label: 'Azure OpenAI',
    extraHeaders: (env) => ({ 'api-key': env.AZURE_OPENAI_API_KEY || '' }),
    buildUrl: (env, model) => {
      const base = (env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
      const deployment = env.AZURE_OPENAI_DEPLOYMENT || model || 'gpt-4o';
      return `${base}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
    }
  },
  // Oracle Cloud OCI Generative AI: always-free tier hosts Llama 3.1 70B.
  // OpenAI-compatible at the inference endpoint. Auth uses OCI signing
  // headers (we generate a simple Bearer-style auth via tenancy+user+key fingerprint).
  // For a Worker integration we use the dedicated-cluster auth model:
  // pass OCID + key fingerprint as env vars, sign a basic request.
  // Simpler: use the OpenAI-compatible endpoint with a static API key.
  oracle: {
    id: 'oracle',
    url: 'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1/chat/completions',
    model: 'meta.llama-3.1-70b-instruct',
    secret: 'ORACLE_API_KEY', // OCI-issued dedicated-cluster key (Bearer)
    label: 'Oracle OCI (Llama 3.1 70B)'
  },
  // AWS Bedrock: paid ($200 credits for new accounts, card required).
  // The Worker doesn't have IAM-signing built in for Bedrock's SigV4 — use
  // an API Gateway proxy in front of Bedrock, or use the boto3-style
  // endpoint via the AWS SDK. For now, document the key + region so the
  // user knows where to wire it.
  // bedrock: { ... } // not directly callable without SigV4 — see DEPLOY.md
  // Extra OpenAI-compatible providers you can enable by adding their secret:
  // together:  { url: 'https://api.together.xyz/v1/chat/completions',    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', secret: 'TOGETHER_API_KEY', label: 'Together' },
  openrouter: {
    id: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    secret: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    fallbacks: [
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free'
    ]
  },
  // fireworks:  { url: 'https://api.fireworks.ai/inference/v1/chat/completions', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', secret: 'FIREWORKS_API_KEY', label: 'Fireworks' },
};

// --- Special engines (not OpenAI-compatible) --------------------------------
const SPECIAL = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    secret: 'GEMINI_API_KEY',
    // Gemini wants ?key=API_KEY in the URL and a different body shape.
    url: ({ model }) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=__KEY__`,
    formatBody: ({ messages, sysPrompt }) => ({
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      systemInstruction: { parts: [{ text: sysPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    }),
    extractText: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  },
  huggingface: {
    id: 'huggingface',
    label: 'HuggingFace',
    secret: 'HUGGINGFACE_API_KEY',
    // Image gen only. Different request shape (inputs: prompt) and response
    // (binary blob → base64 data URI).
    url: () =>
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
    formatBody: ({ prompt }) => ({ inputs: prompt }),
    extractImage: async (res) => {
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return `data:image/png;base64,${btoa(binary)}`;
    }
  }
};

const ALL_ENGINES = {
  ...Object.fromEntries(Object.entries(OPENAI_COMPAT).map(([k, v]) => [k, { ...v, kind: 'openai' }])),
  ...Object.fromEntries(Object.entries(SPECIAL).map(([k, v]) => [k, { ...v, kind: 'special' }]))
};

// --- Rate-limit memo -------------------------------------------------------
// Lives for the lifetime of the Worker isolate. While an engine is rate-
// limited, the fallback chain skips it (saves a wasted upstream call).
// Survives across requests in the same isolate (~minutes–hours).
//
// We attach the Map to globalThis so the sibling status.js module can
// read the snapshot. Module-scope vars don't cross file boundaries in
// Workers, but globalThis does.
const RATE_LIMIT_MEMO = (globalThis.__RATE_LIMIT_MEMO__ ||= new Map()); // engineId → { until, reason }
const RATE_LIMIT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isRateLimited(engineId) {
  const entry = RATE_LIMIT_MEMO.get(engineId);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    RATE_LIMIT_MEMO.delete(engineId);
    return false;
  }
  return true;
}

function memoRateLimit(engineId, status) {
  RATE_LIMIT_MEMO.set(engineId, { until: Date.now() + RATE_LIMIT_TTL_MS, reason: status });
}

// --- Helpers ---------------------------------------------------------------

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}

// --- Generic OpenAI-compatible caller --------------------------------------
async function callOpenAICompatible(engineId, { messages, sysPrompt, model, localKey }, env) {
  const cfg = OPENAI_COMPAT[engineId];
  const headers = { 'Content-Type': 'application/json' };
  
  // v2.3.3: Support localKey override from browser settings
  const key = localKey || (cfg.secret ? env[cfg.secret] : null);
  
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  } else if (cfg.secret) {
    throw { kind: 'missing-key', engine: engineId, secret: cfg.secret };
  }
  if (typeof cfg.extraHeaders === 'function') {
    Object.assign(headers, cfg.extraHeaders(env));
  }
  const url = (typeof cfg.buildUrl === 'function') ? cfg.buildUrl(env, model) : cfg.url;

  // Try the primary model
  const modelsToTry = [model || cfg.model];
  if (cfg.fallbacks) modelsToTry.push(...cfg.fallbacks);

  let lastErr = null;
  for (const m of modelsToTry) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: m,
          messages: [{ role: 'system', content: sysPrompt || 'You are a helpful assistant.' }, ...messages],
          temperature: 0.7,
          max_tokens: 2048
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw { kind: 'http', engine: engineId, status: res.status, body: body.slice(0, 500) };
      }
      const data = await res.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (!text) throw { kind: 'empty', engine: engineId };
      return { engine: engineId, type: 'text', text, modelUsed: m };
    } catch (e) {
      lastErr = e;
      if (e.kind === 'missing-key') throw e;
      console.warn(`Model ${m} failed:`, e.message || e);
    }
  }
  throw lastErr;
}

// --- Special-engine callers ------------------------------------------------
async function callGemini({ messages, sysPrompt, model, localKey }, env) {
  const cfg = SPECIAL.gemini;
  const key = localKey || env[cfg.secret];
  if (!key) throw { kind: 'missing-key', engine: 'gemini', secret: cfg.secret };

  const url = cfg.url({ model }).replace('__KEY__', key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg.formatBody({ messages, sysPrompt }))
  });
  if (!res.ok) {
    throw { kind: 'http', engine: 'gemini', status: res.status, body: (await res.text()).slice(0, 500) };
  }
  const data = await res.json();
  const text = cfg.extractText(data);
  if (!text) throw { kind: 'empty', engine: 'gemini' };
  return { engine: 'gemini', type: 'text', text };
}

async function callHuggingFace({ prompt }, env) {
  const cfg = SPECIAL.huggingface;
  const key = env[cfg.secret];
  if (!key) throw { kind: 'missing-key', engine: 'huggingface', secret: cfg.secret };
  if (!prompt) throw { kind: 'bad-request', engine: 'huggingface', reason: 'missing prompt' };

  const res = await fetch(cfg.url(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(cfg.formatBody({ prompt }))
  });
  if (!res.ok) {
    throw { kind: 'http', engine: 'huggingface', status: res.status, body: (await res.text()).slice(0, 500) };
  }
  const dataUri = await cfg.extractImage(res);
  return { engine: 'huggingface', type: 'image', url: dataUri };
}

// --- Dispatch to the right caller -------------------------------------------
async function callEngine(engineId, payload, env) {
  if (OPENAI_COMPAT[engineId]) return callOpenAICompatible(engineId, payload, env);
  if (engineId === 'gemini') return callGemini(payload, env);
  if (engineId === 'huggingface') return callHuggingFace(payload, env);
  throw { kind: 'unknown-engine', engine: engineId };
}

// --- Fallback chain --------------------------------------------------------
// Tries engines in order. On 429 / 402 / empty / network error, advances to
// the next. On first success, returns the result annotated with which
// fallback engines were tried (so the browser can show "via groq →
// pollinations").
async function callWithFallback(chain, payload, env) {
  const tried = [];
  let lastError = null;
  for (const engineId of chain) {
    if (!ALL_ENGINES[engineId]) {
      tried.push({ engine: engineId, error: 'unknown engine' });
      continue;
    }
    if (isRateLimited(engineId)) {
      tried.push({ engine: engineId, skipped: 'rate-limited-memo' });
      continue;
    }
    try {
      const result = await callEngine(engineId, payload, env);
      if (tried.length > 0) {
        result.usedFallback = tried.filter(t => !t.skipped).map(t => t.engine);
        result.skipped = tried.filter(t => t.skipped).map(t => t.engine);
      }
      return result;
    } catch (err) {
      lastError = err;
      tried.push({ engine: engineId, error: { kind: err.kind, status: err.status, message: err.body || err.reason || err.engine } });
      // Memoize rate-limit so the next request skips this engine without a wasted call.
      if (err.kind === 'http' && (err.status === 429 || err.status === 402)) {
        memoRateLimit(engineId, err.status);
      }
    }
  }
  const e = new Error('All engines in chain failed');
  e.kind = 'all-failed';
  e.tried = tried;
  e.lastError = lastError;
  throw e;
}

// --- Main handler ----------------------------------------------------------
export async function onRequestPost(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  let body;
  try { 
    body = await context.request.json(); 
    // v2.3.0: Stealth Mode — decode base64 payload to bypass firewall keyword filters
    if (body && body.stealthData) {
      // v2.3.4: UTF-8 safe base64 decode for emojis
      const binString = atob(body.stealthData);
      const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
      const decodedString = new TextDecoder().decode(bytes);
      body = JSON.parse(decodedString);
    }
  }
  catch (e) { return jsonResponse({ error: 'Invalid JSON body or stealth decode failed: ' + e.message }, 400); }

  const { engine, chain, dna, persona, messages, sysPrompt, prompt, style, ratio, model, localKey } = body;

  // Compose final system prompt: base + DNA + persona.
  const composedSysPrompt = composeSystemPrompt({ sysPrompt, dna, persona });

  // Image generation (huggingface) — no chain support, single engine.
  if (engine === 'huggingface' || prompt) {
    if (!engine && !chain) return jsonResponse({ error: 'Engine or chain required for image gen' }, 400);
    const target = engine || chain[0];
    try {
      const result = await callHuggingFace({ prompt, style, ratio }, context.env);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: `Image gen failed: ${err.message || err}`, engine: target, status: err.status }, err.status === 429 ? 429 : 502);
    }
  }

  // Text generation — chain or single engine.
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: 'messages array required' }, 400);
  }

  const engineChain = Array.isArray(chain) && chain.length > 0
    ? chain
    : (engine ? [engine] : null);

  if (!engineChain) {
    return jsonResponse({ error: 'Either "engine" (string) or "chain" (array) required' }, 400);
  }

  try {
    const result = await callWithFallback(
      engineChain,
      { messages, sysPrompt: composedSysPrompt, model, localKey },
      context.env
    );
    return jsonResponse(result);
  } catch (err) {
    if (err.kind === 'all-failed') {
      return jsonResponse({
        error: 'All engines in chain failed',
        chain: engineChain,
        tried: err.tried,
        lastError: { kind: err.lastError?.kind, status: err.lastError?.status, message: (err.lastError?.body || '').slice(0, 300) }
      }, 502);
    }
    return jsonResponse({ error: err.message || String(err), kind: err.kind }, 400);
  }
}

// --- System prompt composer ------------------------------------------------
// Stacks (in order, lowest priority first):
//   1. base sysPrompt from caller
//   2. dna (the model-style fingerprint — Phase 8)
//   3. persona (the voice overlay — Phase 11)
function composeSystemPrompt({ sysPrompt, dna, persona }) {
  const parts = [];
  if (sysPrompt) parts.push(sysPrompt);
  if (dna)       parts.push(`[Style / DNA]\n${dna}`);
  if (persona)   parts.push(`[Voice / Persona]\n${persona}`);
  return parts.join('\n\n').trim() || 'You are a helpful assistant.';
}

// --- CORS preflight on the path itself -------------------------------------
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}