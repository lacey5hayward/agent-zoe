/* ============================================================================
 * memory.js — Browser-side memory module
 * ----------------------------------------------------------------------------
 * Stable browser-keyed userId (no sign-in needed). Memories are stored
 * server-side in Cloudflare KV at `user:<userId>`. This module is the
 * only thing in the browser that knows the API shape.
 *
 * Public surface:
 *   window.Memory = {
 *     userId()                     // stable id, lazily minted + persisted
 *     list()                       // → GET /api/memory/<userId>
 *     save(content, type, tags?)   // → POST. Returns the saved memory.
 *     remove(memoryId)             // → DELETE
 *     recall(query, topK=3)        // → POST /api/memory/search
 *     throttledAutoSave(message)   // saves every Nth user turn (default 3)
 *     _lastRecall(query)           // convenience: returns just the content[]
 *   }
 *
 * Storage layout in localStorage:
 *   us-mem-user-id        — the stable per-browser user id (16 hex chars)
 *   us-mem-autosave-cnt   — auto-save throttle counter
 *   us-mem-recall-cache   — last recall result (so the chat can read it
 *                            without re-fetching every turn)
 * ============================================================================ */

(function initMemory() {
  const USER_ID_KEY = 'us-mem-user-id';
  const AUTOSAVE_CNT_KEY = 'us-mem-autosave-cnt';
  const AUTOSAVE_INTERVAL = 3;       // save every Nth user turn
  const AUTOSAVE_MAX_PER_SESSION = 20; // hard cap

  // ── userId management ───────────────────────────────────────────────────
  function mintUserId() {
    // 16 hex chars = 64 bits of entropy. Plenty for per-browser uniqueness.
    const bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function userId() {
    let id;
    try { id = localStorage.getItem(USER_ID_KEY); } catch (_) { id = null; }
    if (!id || !/^[a-f0-9]{16}$/.test(id)) {
      id = mintUserId();
      try { localStorage.setItem(USER_ID_KEY, id); } catch (_) { /* noop */ }
    }
    return id;
  }

  // ── network helpers ────────────────────────────────────────────────────
  async function fetchJSON(url, opts) {
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts || {}));
    if (res.status === 204) return null;
    let data;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  function api(path) { return '/api/memory/' + path; }

  // ── public surface ─────────────────────────────────────────────────────
  async function list() {
    try {
      const data = await fetchJSON(api(userId()));
      const arr = (data && Array.isArray(data.memories)) ? data.memories : [];
      // Sort by ts desc so callers always get newest-first.
      return arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    } catch (e) {
      console.warn('[memory] list failed:', e.message);
      return [];
    }
  }

  async function save(content, type = 'note', tags = []) {
    if (!content || typeof content !== 'string') {
      throw new Error('Memory.save: content must be a non-empty string');
    }
    if (content.length > 2000) {
      // Truncate rather than reject — the user can always edit the saved copy.
      content = content.slice(0, 2000);
    }
    const body = { content, type, tags, ts: Date.now() };
    const data = await fetchJSON(api(userId()), {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return data && data.memory;
  }

  async function remove(memoryId) {
    if (!memoryId) return false;
    try {
      await fetchJSON(api(userId() + '/' + encodeURIComponent(memoryId)), {
        method: 'DELETE'
      });
      return true;
    } catch (e) {
      // 404 = already gone. Anything else = log and treat as failure.
      if (e && e.status === 404) return true;
      console.warn('[memory] remove failed:', e.message);
      return false;
    }
  }

  async function recall(query, topK = 3) {
    try {
      const data = await fetchJSON('/api/memory/search', {
        method: 'POST',
        body: JSON.stringify({ userId: userId(), query: query || '', topK })
      });
      const matches = (data && Array.isArray(data.matches)) ? data.matches : [];
      // Cache the last recall so chat glue can read it without re-fetching.
      try {
        localStorage.setItem('us-mem-recall-cache', JSON.stringify({
          ts: Date.now(), query, matches
        }));
      } catch (_) { /* noop */ }
      return matches;
    } catch (e) {
      console.warn('[memory] recall failed:', e.message);
      return [];
    }
  }

  // Returns just the content strings, for the chat glue to splice into sysPrompt.
  function _lastRecall() {
    try {
      const raw = localStorage.getItem('us-mem-recall-cache');
      if (!raw) return [];
      const cached = JSON.parse(raw);
      if (!cached || !Array.isArray(cached.matches)) return [];
      return cached.matches.map(m => m.memory.content);
    } catch (_) { return []; }
  }

  // ── throttled auto-save ────────────────────────────────────────────────
  // Saves user messages to memory every Nth turn, up to a per-session cap.
  // Chat glue calls this on every user message. Errors are silent — the
  // chat UX should never break because memory is down.
  let sessionSavedCount = 0;
  async function throttledAutoSave(message) {
    if (!message || !message.content) return false;
    if (sessionSavedCount >= AUTOSAVE_MAX_PER_SESSION) return false;

    let cnt = 0;
    try { cnt = parseInt(localStorage.getItem(AUTOSAVE_CNT_KEY) || '0', 10) || 0; } catch (_) {}
    cnt += 1;
    if (cnt < AUTOSAVE_INTERVAL) {
      try { localStorage.setItem(AUTOSAVE_CNT_KEY, String(cnt)); } catch (_) {}
      return false;
    }
    // Save this one and reset counter.
    try { localStorage.setItem(AUTOSAVE_CNT_KEY, '0'); } catch (_) {}
    try {
      const type = message.role === 'user' ? 'chat' : 'note';
      // Tag the memory with the source chat turn so the user can find it later.
      const tags = ['auto-save'];
      if (message.engine) tags.push('engine:' + message.engine);
      await save(message.content, type, tags);
      sessionSavedCount += 1;
      return true;
    } catch (e) {
      console.warn('[memory] throttledAutoSave failed:', e.message);
      return false;
    }
  }

  // ── export ─────────────────────────────────────────────────────────────
  window.Memory = {
    userId,
    list,
    save,
    remove,
    recall,
    throttledAutoSave,
    _lastRecall
  };
})();