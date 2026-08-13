// Phase 5 + 6: Consolidated Zoe Builder & File Store (v2.4.6)
// v2.4.6: Turbo Bypass — 5s Proxy Timeout + Emergency Heartbeat + Direct Fallback.

(() => {
  'use strict';

  const DB_NAME = 'us-files-db';
  const DB_VERSION = 2;
  const FILES_STORE = 'files';

  const SHIPPED_PATHS = [
    'index.html', 'zoe-style.css', 'zoe-core.js', 'README.md', 'MERGE.md',
    'functions/api/proxy/index.js', 'functions/api/proxy/status.js', 'auth.js',
    'build-agent.js', 'files.js', 'editor.js', 'dna-profiles.js', 'clones.js',
    'clone-state.js', 'clone-picker.js', 'personas.js', 'persona-picker.js',
    'memory.js', 'memory-ui.js', 'character-launcher.js', 'security-key.js'
  ];

  function openDb() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  window.UsFiles = {
    SHIPPED_PATHS: SHIPPED_PATHS,
    list: async function() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILES_STORE, 'readonly');
        const req = tx.objectStore(FILES_STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    read: async function(path) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILES_STORE, 'readonly');
        const req = tx.objectStore(FILES_STORE).get(path);
        req.onsuccess = () => resolve(req.result == null ? '' : req.result);
        req.onerror = () => reject(req.error);
      });
    },
    write: async function(path, content) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILES_STORE, 'readwrite');
        tx.objectStore(FILES_STORE).put(String(content || ''), path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    remove: async function(path) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILES_STORE, 'readwrite');
        tx.objectStore(FILES_STORE).delete(path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    resetAll: async function() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILES_STORE, 'readwrite');
        tx.objectStore(FILES_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    seedFromNetwork: async function(paths = SHIPPED_PATHS) {
      const fetched = [];
      for (const path of paths) {
        try {
          const res = await fetch(path + '?v=' + (window.VER || Date.now()), { cache: 'no-cache' });
          if (!res.ok) continue;
          const text = await res.text();
          await this.write(path, text);
          fetched.push(path);
        } catch (_) {}
      }
      return fetched;
    }
  };

  setTimeout(() => { window.UsFiles.seedFromNetwork().catch(() => {}); }, 1000);

  // ==========================================
  // PART 2: US-BUILD (Build Agent)
  // ==========================================

  const POLLINATIONS = 'https://text.pollinations.ai/';

  const B = {
    enabled: false, busy: false,
    postUser: null, postAI: null, setStatus: null, toast: null, addTyping: null, removeTyping: null,
  };

  function chatBridge() {
    if (B.postUser) return;
    if (window.UsChat) {
      B.postUser      = window.UsChat.postUser      || (() => {});
      B.postAI        = window.UsChat.postAI        || (() => {});
      B.setStatus     = window.UsChat.setStatus     || (() => {});
      B.toast         = window.UsChat.toast         || (() => {});
      B.addTyping     = window.UsChat.addTyping     || (() => {});
      B.removeTyping  = window.UsChat.removeTyping  || (() => {});
    }
  }

  function guessTargetFile(text) {
    const t = text.toLowerCase();
    if (/\b(html|markup|header|sidebar|button)\b/.test(t)) return 'index.html';
    if (/\b(css|style|theme|color|background|layout)\b/.test(t)) return 'zoe-style.css';
    if (/\b(readme|docs?|documentation)\b/.test(t)) return 'README.md';
    if (/\b(merge|integration|discord|tumblr)\b/.test(t)) return 'MERGE.md';
    if (/\b(worker|proxy|api)\b/.test(t)) return 'functions/api/proxy/index.js';
    if (/\b(engine|chat|stream|state|folder)\b/.test(t)) return 'zoe-core.js';
    return 'zoe-core.js';
  }

  function buildSystemPrompt(targetFile, targetContent) {
    return `You are Zoe's build assistant. NATURAL LANGUAGE TO CODE EDITS.
Target: "${targetFile}"
Content: \`\`\`\n${targetContent}\n\`\`\`
OUTPUT JSON ONLY: { "plan": [ { "file": "${targetFile}", "find": "<exact>", "replace": "<new>", "explanation": "<msg>" } ] }
HARD RULES: "find" must be unique. JSON only.`;
  }

  function tryParseJson(text) {
    if (!text) return null;
    let s = text.trim();
    const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) s = fenceMatch[1].trim();
    const start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    try { return JSON.parse(s); } catch (_) { return null; }
  }

  async function callAI(messages) {
    let lastError = '';
    // 1. Try Proxy with 90s timeout (Hydra Resilience)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      
      const rawBody = { chain: ['openrouter', 'kilo', 'opencode', 'llm7', 'bazaarlink', 'nvidia'], messages: messages.slice(1), sysPrompt: messages[0].content };
      const stealthBtn = document.getElementById('usStealthBtn');
      const isStealth = stealthBtn && stealthBtn.dataset.active === 'true';
      let payload = rawBody;
      if (isStealth) {
        const jsonStr = JSON.stringify(rawBody);
        const bytes = new TextEncoder().encode(jsonStr);
        const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
        payload = { stealthData: btoa(binString) };
      }
      
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        return data.text || '';
      } else {
        const errData = await res.json().catch(() => ({}));
        lastError = `Proxy failed (${res.status}): ${errData.error || 'Unknown'}`;
      }
    } catch (e) { 
      lastError = `Proxy error: ${e.name === 'AbortError' ? 'Timeout (90s)' : e.message}`;
    }

    // 2. Direct Fallback to OpenCode (Last Resort)
    try {
      const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices[0].message.content || '';
      }
      const txt = await res.text().catch(() => '');
      throw new Error(`OpenCode failed (${res.status}): ${txt.slice(0, 100)}`);
    } catch (e) {
      throw new Error(`${lastError} | Emergency brain failed: ${e.message}`);
    }
  }

  async function send(text) {
    if (B.busy) return;
    chatBridge();
    const trimmed = String(text || '').trim();
    if (!trimmed) return;

    B.postUser(trimmed);
    B.addTyping();
    B.busy = true;

    try {
      const targetFile = guessTargetFile(trimmed);
      B.setStatus(`💓 Zoe is building in the cloud...`);
      
      // v2.6.7: Cloud Builder Integration
      // Instead of reading the file on the iPad, we send the instruction to the Worker.
      // The Worker reads the file from GitHub and calls the AI itself.
      // v2.6.9: Pass localKey from browser settings to Cloud Builder
      const localKey = localStorage.getItem('us-openrouter-key') || localStorage.getItem('us-universal-key');
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'build',
          instruction: trimmed,
          targetFile: targetFile,
          localKey: localKey
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Cloud build failed' }));
        const msg = err.diagnostic ? `${err.error} (${err.diagnostic})` : (err.error || 'Cloud build failed');
        throw new Error(msg);
      }

      const parsed = await res.json();
      
      B.removeTyping();
      B.setStatus("Zoe is ready!");
      if (!parsed) {
        B.postAI("I couldn't quite draft that correctly. Can you try again, Mom?", 'Build Agent');
        return;
      }

      if (Array.isArray(parsed.plan) && parsed.plan.length > 0) {
        postPlanIntro(parsed.plan);
        previewStep(0, parsed.plan, parsed.plan.slice(1));
      } else if (typeof parsed.answer === 'string') {
        B.postAI(parsed.answer, 'Build Agent');
      }
    } catch (e) {
      B.removeTyping();
      B.postAI('Build agent error: ' + (e.message || e), 'Build Agent');
    } finally { B.busy = false; }
  }

  function postPlanIntro(plan) {
    const summary = plan.map((s, i) => `${i + 1}. ${s.file} — ${s.explanation || '(no explanation)'}`).join('\n');
    B.postAI('Plan with ' + plan.length + ' step(s):\n\n' + summary + '\n\nOpening preview…', 'Build Agent');
  }

  let _planQueue = null;
  function previewStep(idx, plan, remaining) {
    _planQueue = remaining;
    const step = plan[idx];
    if (!step) return;
    const editor = window.UsEditor;
    if (editor) {
      editor.enterPreviewMode({ file: step.file, find: step.find, replace: step.replace, explanation: step.explanation || '', raw: step });
    } else {
      B.postAI('Error: Editor not loaded. Refreshing tools...', 'Build Agent');
      if (window.UsEditor && window.UsEditor.bootstrap) window.UsEditor.bootstrap();
    }
  }

  function onPreviewApplied({ file, find, replace, explanation }) {
    B.postAI(`✅ Applied edit to ${file}\n\n${explanation || ''}`, 'Build Agent');
    applyNext();
  }

  function onPreviewSkipped(p) {
    B.postAI(`⏭ Skipped edit to ${p.file}\n\n${p.explanation || ''}`, 'Build Agent');
    applyNext();
  }

  function applyNext() {
    if (_planQueue && _planQueue.length > 0) {
      const next = _planQueue.shift();
      previewStep(0, [next], _planQueue);
    }
  }

  function toggle() {
    B.enabled = !B.enabled;
    updateBadge();
    if (B.toast) B.toast(B.enabled ? 'Build mode ON' : 'Build mode OFF');
  }

  function updateBadge() {
    const btn = document.getElementById('usBuildBtn');
    if (btn) {
      btn.dataset.active = B.enabled;
      btn.classList.toggle('us-btn-active', B.enabled);
      btn.style.color = B.enabled ? '#22c55e' : '#ef4444';
      btn.textContent = B.enabled ? '🛠️ Build: ON' : '🛠️ Build: OFF';
    }
  }

  function installInterceptors() {
    document.addEventListener('click', (e) => {
      if (!B.enabled || B.busy) return;
      if (e.target.closest && e.target.closest('#usSendBtn')) {
        const input = document.getElementById('usInput');
        const text = input ? input.value.trim() : '';
        if (!text) return;
        e.stopImmediatePropagation(); e.preventDefault();
        input.value = ''; send(text);
      }
    }, true);
  }

  function bootstrap() {
    chatBridge();
    installInterceptors();
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#usBuildBtn')) {
        e.stopImmediatePropagation(); toggle();
      }
    }, true);
  }

  async function deploy(path, content, message) {
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content, message })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  window.UsBuild = {
    bootstrap, send, toggle, deploy, enabled: () => B.enabled,
    onPreviewApplied, onPreviewSkipped, updateBadge,
    setBridge: (bridge) => {
      B.postUser = bridge.postUser; B.postAI = bridge.postAI;
      B.setStatus = bridge.setStatus; B.toast = bridge.toast;
      B.addTyping = bridge.addTyping; B.removeTyping = bridge.removeTyping;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();
