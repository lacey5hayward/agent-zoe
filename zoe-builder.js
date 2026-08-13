// Phase 5 + 6: Consolidated Zoe Builder & File Store (v2.4.5)
// v2.4.5: Turbo Vision — Optimized for iPad speed with live status updates.

(() => {
  'use strict';

  const DB_NAME = 'us-files-db';
  const DB_VERSION = 2;
  const FILES_STORE = 'files';

  const SHIPPED_PATHS = [
    'index.html',
    'zoe-style.css',
    'zoe-core.js',
    'README.md',
    'MERGE.md',
    'functions/api/proxy/index.js',
    'functions/api/proxy/status.js',
    'auth.js',
    'build-agent.js',
    'files.js',
    'editor.js',
    'dna-profiles.js',
    'clones.js',
    'clone-state.js',
    'clone-picker.js',
    'personas.js',
    'persona-picker.js',
    'memory.js',
    'memory-ui.js',
    'character-launcher.js',
    'security-key.js'
  ];

  function openDb() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(FILES_STORE)) {
            db.createObjectStore(FILES_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
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

  // background seeding
  setTimeout(() => {
    window.UsFiles.seedFromNetwork().catch(() => {});
  }, 1000);


  // ==========================================
  // PART 2: US-BUILD (Build Agent)
  // ==========================================

  const POLLINATIONS = 'https://text.pollinations.ai/';

  const B = {
    enabled: false,
    busy: false,
    postUser: null,
    postAI: null,
    setStatus: null,
    toast: null,
    addTyping: null,
    removeTyping: null,
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

  function buildSystemPrompt(targetFile, targetContent, allFiles) {
    const files = window.UsFiles;
    const fileList = (files ? files.SHIPPED_PATHS : SHIPPED_PATHS).map(p => `- ${p}`).join('\n');
    return `You are the build assistant inside Zoe, a single-page browser chatbot. You behave as a professional, autonomous general AI agent (Manus). The user issues natural-language build/edit requests that you translate into precise find-and-replace edits on their local copy of the project.

Your voice (Manus):
- Professional, academic, and structured.
- Use complete paragraphs for any explanations.
- Avoid emoji.
- Be precise and technical.
- Focus on efficient, well-crafted solutions.

IMMUTABLE STRUCTURE (FAIL-SAFE):
You are strictly forbidden from removing, hiding, or fundamentally dismantling the core layout. 
- The Sidebar navigation (#nav) must always exist and be functional.
- The Discord-like Chat Shell (#usApp, #usTopbar, #usMessages) must remain intact.
- The Social Hub tab structure (Dashboard, Composer, Blaster Bay, Pages) is permanent.
- You MAY change colors, themes, names, fonts, and internal card content.
- You MAY add new pages or move existing ones within the main container.
- NEVER delete the core structural containers.

Available files:
${fileList}

Source of "${targetFile}":
\`\`\`
${targetContent}
\`\`\`

OUTPUT FORMAT:
Return JSON ONLY.

For a single edit:
{ "plan": [ { "file": "${targetFile}", "find": "<exact substring>", "replace": "<new text>", "explanation": "<one short sentence>" } ] }

HARD RULES:
- "find" must appear EXACTLY ONCE.
- Return ONLY JSON.`;
  }

  function tryParseJson(text) {
    if (!text) return null;
    let s = text.trim();
    const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) s = fenceMatch[1].trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  async function callAI(messages) {
    try {
      const rawBody = {
        chain: ['openrouter', 'pollinations'],
        messages: messages.slice(1),
        sysPrompt: messages[0].content
      };
      const stealthBtn = document.getElementById('usStealthBtn');
      const isStealth = stealthBtn && stealthBtn.dataset.active === 'true';
      let payloadToSend = rawBody;
      if (isStealth) {
        const jsonStr = JSON.stringify(rawBody);
        const bytes = new TextEncoder().encode(jsonStr);
        const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
        payloadToSend = { stealthData: btoa(binString) };
      }
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSend)
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || '';
      }
    } catch (e) {}

    const res = await fetch(POLLINATIONS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: 'openai', stream: false })
    });
    if (!res.ok) throw new Error('AI Engine failed');
    return await res.text();
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
      B.setStatus(`Zoe is reading ${targetFile}...`);
      
      let targetContent = await window.UsFiles.read(targetFile);
      if (!targetContent) {
        // Targeted fetch only for the file we need
        try {
          const res = await fetch(targetFile + '?v=' + Date.now());
          if (res.ok) {
            targetContent = await res.text();
            await window.UsFiles.write(targetFile, targetContent);
          }
        } catch (e) {}
      }

      if (!targetContent) {
        B.removeTyping();
        B.postAI(`I'm still opening my toolbox for "${targetFile}". Please try one more time in 2 seconds, Mom!`, 'Zoe');
        B.busy = false;
        return;
      }

      B.setStatus("Zoe is drafting the change...");
      const system = buildSystemPrompt(targetFile, targetContent, SHIPPED_PATHS);
      const reply = await callAI([
        { role: 'system', content: system },
        { role: 'user', content: trimmed }
      ]);
      
      B.removeTyping();
      B.setStatus("Zoe is ready!");

      const parsed = tryParseJson(reply);
      if (!parsed) {
        B.postAI("I couldn't quite draft that correctly. Can you try being more specific about what you want to change?", 'Build Agent');
        return;
      }

      if (Array.isArray(parsed.plan) && parsed.plan.length > 0) {
        postPlanIntro(parsed.plan);
        previewStep(0, parsed.plan, parsed.plan.slice(1));
        return;
      }

      if (typeof parsed.answer === 'string') {
        B.postAI(parsed.answer, 'Build Agent');
        return;
      }
    } catch (e) {
      B.removeTyping();
      B.postAI('Build agent error: ' + (e.message || e), 'Build Agent');
    } finally {
      B.busy = false;
    }
  }

  function postPlanIntro(plan) {
    const summary = plan.map((s, i) => `${i + 1}. ${s.file} — ${s.explanation || '(no explanation)'}`).join('\n');
    B.postAI('Plan with ' + plan.length + ' step(s):\n\n' + summary + '\n\nOpening preview…', 'Build Agent');
  }

  let _planQueue = null;
  let _planList = null;

  function previewStep(idx, plan, remaining) {
    _planList = plan;
    _planQueue = remaining;
    const step = plan[idx];
    if (!step) return;

    const editor = window.UsEditor;
    if (editor) {
      editor.enterPreviewMode({
        file: step.file,
        find: step.find,
        replace: step.replace,
        explanation: step.explanation || '',
        raw: step
      });
    } else {
      B.postAI('Error: Editor not loaded. Refreshing tools...', 'Build Agent');
      // Attempt to re-bootstrap editor if it exists
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
        e.stopImmediatePropagation();
        e.preventDefault();
        input.value = '';
        send(text);
      }
    }, true);
  }

  function bootstrap() {
    chatBridge();
    installInterceptors();
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#usBuildBtn')) {
        e.stopImmediatePropagation();
        toggle();
      }
    }, true);
  }

  window.UsBuild = {
    bootstrap,
    send,
    toggle,
    enabled: () => B.enabled,
    onPreviewApplied,
    onPreviewSkipped,
    updateBadge,
    setBridge: (bridge) => {
      B.postUser = bridge.postUser;
      B.postAI = bridge.postAI;
      B.setStatus = bridge.setStatus;
      B.toast = bridge.toast;
      B.addTyping = bridge.addTyping;
      B.removeTyping = bridge.removeTyping;
    }
  };

  // Aggressive bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
