/* ============================================================================
 * memory-ui.js — Memory panel + per-message Save button + Recall toggle
 * ----------------------------------------------------------------------------
 * Phase 10. Surfaces Phase 9's window.Memory with:
 *
 *   • Floating 🧠 button (FAB) inside #usApp, bottom-right corner. Visible
 *     only when the chat card is in view (because it lives in #usApp).
 *   • Slide-out panel from the right edge. Contains:
 *       - Recall toggle (saved to localStorage)
 *       - "Save current" textarea + button
 *       - Search input (filters the list)
 *       - Memory list (newest first, with delete + click-to-expand)
 *       - "Save last AI reply" button (saves the most recent AI bubble)
 *   • Per-AI-message 💾 icon, attached via MutationObserver to any new
 *     `.us-msg-ai` element added to #usMessages.
 *
 * The Recall toggle fires a 'recallchange' CustomEvent on window so the
 * chat glue (mergedBotReply) can re-read the state.
 * ============================================================================ */

(function initMemoryUI() {
  const RECALL_KEY = 'us-mem-recall-on';
  const PANEL_OPEN_KEY = 'us-mem-panel-open';

  // ── tiny DOM helpers ──────────────────────────────────────────────────
  function makeEl(tag) { return document.createElement(tag); }
  function makeText(t) { return document.createTextNode(t); }
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
  function relativeTime(ts) {
    const ms = Date.now() - ts;
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
    if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
    if (ms < 86400000 * 7) return Math.floor(ms / 86400000) + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  // ── state ────────────────────────────────────────────────────────────
  function getRecallOn() {
    try { return localStorage.getItem(RECALL_KEY) === '1'; } catch (_) { return false; }
  }
  function setRecallOn(on) {
    try { localStorage.setItem(RECALL_KEY, on ? '1' : '0'); } catch (_) { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent('recallchange', { detail: { on } }));
    } catch (_) { /* noop */ }
  }

  // ── DOM construction ─────────────────────────────────────────────────
  function buildFab() {
    const fab = makeEl('button');
    fab.className = 'us-mem-fab';
    fab.id = 'usMemFab';
    fab.type = 'button';
    fab.title = 'Memory (open / close)';
    fab.appendChild(makeText('🧠'));
    fab.addEventListener('click', () => togglePanel());
    return fab;
  }

  function buildPanel() {
    const panel = makeEl('aside');
    panel.className = 'us-mem-panel hidden';
    panel.id = 'usMemPanel';
    panel.setAttribute('aria-label', 'Memory panel');

    // Header
    const head = makeEl('header');
    head.className = 'us-mem-head';
    const h3 = makeEl('h3');
    h3.appendChild(makeText('🧠 Memory'));
    const close = makeEl('button');
    close.className = 'us-mem-close';
    close.type = 'button';
    close.id = 'usMemClose';
    close.appendChild(makeText('✕'));
    close.addEventListener('click', () => setPanelOpen(false));
    head.appendChild(h3);
    head.appendChild(close);
    panel.appendChild(head);

    // Recall toggle
    const controls = makeEl('div');
    controls.className = 'us-mem-controls';
    const label = makeEl('label');
    label.className = 'us-mem-recall-label';
    const cb = makeEl('input');
    cb.type = 'checkbox';
    cb.id = 'usMemRecallToggle';
    cb.checked = getRecallOn();
    cb.addEventListener('change', () => setRecallOn(cb.checked));
    label.appendChild(cb);
    label.appendChild(makeText(' Recall memories into chat'));
    controls.appendChild(label);
    panel.appendChild(controls);

    // Save current
    const saveBox = makeEl('div');
    saveBox.className = 'us-mem-save';
    const ta = makeEl('textarea');
    ta.id = 'usMemSaveInput';
    ta.rows = 2;
    ta.placeholder = 'Save a memory…';
    const saveBtn = makeEl('button');
    saveBtn.type = 'button';
    saveBtn.id = 'usMemSaveBtn';
    saveBtn.className = 'us-mem-save-btn';
    saveBtn.appendChild(makeText('Save'));
    saveBtn.addEventListener('click', () => onSaveClick(ta, saveBtn));
    saveBox.appendChild(ta);
    saveBox.appendChild(saveBtn);
    panel.appendChild(saveBox);

    // "Save last AI reply" (only useful if there are any)
    const saveLast = makeEl('button');
    saveLast.type = 'button';
    saveLast.id = 'usMemSaveLast';
    saveLast.className = 'us-mem-save-last';
    saveLast.appendChild(makeText('💾 Save last AI reply'));
    saveLast.addEventListener('click', () => onSaveLastAiClick(saveLast));
    panel.appendChild(saveLast);

    // Search
    const search = makeEl('input');
    search.type = 'search';
    search.id = 'usMemSearch';
    search.placeholder = 'Search memories…';
    search.addEventListener('input', debounce(() => onSearchChange(search), 250));
    panel.appendChild(search);

    // List
    const list = makeEl('div');
    list.className = 'us-mem-list';
    list.id = 'usMemList';
    panel.appendChild(list);

    // Footer (counts)
    const foot = makeEl('footer');
    foot.className = 'us-mem-foot';
    foot.id = 'usMemFoot';
    foot.appendChild(makeText('0 memories'));
    panel.appendChild(foot);

    return panel;
  }

  function buildBackdrop() {
    const bd = makeEl('div');
    bd.className = 'us-mem-backdrop hidden';
    bd.id = 'usMemBackdrop';
    bd.addEventListener('click', () => setPanelOpen(false));
    return bd;
  }

  // ── panel open/close ────────────────────────────────────────────────
  function setPanelOpen(open) {
    const panel = $('#usMemPanel');
    const bd = $('#usMemBackdrop');
    if (!panel || !bd) return;
    if (open) {
      panel.classList.remove('hidden');
      bd.classList.remove('hidden');
      try { localStorage.setItem(PANEL_OPEN_KEY, '1'); } catch (_) {}
      refreshList();
      // Focus the save textarea so the user can type immediately.
      setTimeout(() => {
        const ta = $('#usMemSaveInput');
        if (ta) ta.focus();
      }, 50);
    } else {
      panel.classList.add('hidden');
      bd.classList.add('hidden');
      try { localStorage.setItem(PANEL_OPEN_KEY, '0'); } catch (_) {}
    }
  }
  function togglePanel() { setPanelOpen($('#usMemPanel').classList.contains('hidden')); }

  // ── list rendering ──────────────────────────────────────────────────
  async function refreshList(filterQuery) {
    const list = $('#usMemList');
    const foot = $('#usMemFoot');
    if (!list) return;
    let memories;
    try {
      memories = filterQuery
        ? (await window.Memory.recall(filterQuery, 50)).map(m => m.memory)
        : await window.Memory.list();
    } catch (e) {
      list.innerHTML = '';
      const err = makeEl('div');
      err.className = 'us-mem-empty';
      err.appendChild(makeText('⚠️ ' + (e.message || 'list failed')));
      list.appendChild(err);
      return;
    }
    list.innerHTML = '';
    if (!memories || memories.length === 0) {
      const empty = makeEl('div');
      empty.className = 'us-mem-empty';
      empty.appendChild(makeText(filterQuery ? 'No matches.' : 'No memories yet. Save one above, or click 💾 on any AI reply.'));
      list.appendChild(empty);
      if (foot) foot.firstChild && (foot.textContent = '0 memories');
      return;
    }
    for (const m of memories) list.appendChild(buildMemoryRow(m));
    if (foot) foot.textContent = memories.length + (memories.length === 1 ? ' memory' : ' memories');
  }

  function buildMemoryRow(m) {
    const row = makeEl('div');
    row.className = 'us-mem-row';
    row.dataset.id = m.id;

    const head = makeEl('div');
    head.className = 'us-mem-row-head';
    const typeIcon = makeEl('span');
    typeIcon.className = 'us-mem-type us-mem-type-' + (m.type || 'note');
    typeIcon.appendChild(makeText(typeIconChar(m.type)));
    const ts = makeEl('span');
    ts.className = 'us-mem-ts';
    ts.appendChild(makeText(relativeTime(m.ts)));
    const del = makeEl('button');
    del.type = 'button';
    del.className = 'us-mem-del';
    del.title = 'Delete memory';
    del.appendChild(makeText('✕'));
    del.addEventListener('click', (e) => { e.stopPropagation(); onDeleteClick(m.id, row); });
    head.appendChild(typeIcon);
    head.appendChild(ts);
    head.appendChild(del);
    row.appendChild(head);

    const content = makeEl('div');
    content.className = 'us-mem-content';
    content.appendChild(makeText(m.content));
    row.appendChild(content);

    if (m.tags && m.tags.length) {
      const tags = makeEl('div');
      tags.className = 'us-mem-tags';
      for (const t of m.tags) {
        const chip = makeEl('span');
        chip.className = 'us-mem-tag';
        chip.appendChild(makeText(t));
        tags.appendChild(chip);
      }
      row.appendChild(tags);
    }

    // Click row to expand truncated content.
    row.addEventListener('click', () => row.classList.toggle('expanded'));

    return row;
  }

  function typeIconChar(t) {
    switch (t) {
      case 'chat': return '💬';
      case 'fact': return '🧠';
      case 'preference': return '⚙️';
      default: return '📝';
    }
  }

  // ── action handlers ──────────────────────────────────────────────────
  async function onSaveClick(ta, btn) {
    const content = (ta.value || '').trim();
    if (!content) return;
    btn.disabled = true;
    try {
      await window.Memory.save(content, 'note', ['manual']);
      ta.value = '';
      await refreshList();
      flashSaved(btn, 'Saved ✓');
    } catch (e) {
      flashSaved(btn, 'Failed');
      console.warn('[mem-ui] save failed:', e);
    } finally {
      btn.disabled = false;
    }
  }

  async function onSaveLastAiClick(btn) {
    btn.disabled = true;
    try {
      const last = getLastAiMessageText();
      if (!last) {
        flashSaved(btn, 'No AI reply yet');
        return;
      }
      await window.Memory.save(last, 'chat', ['manual', 'last-reply']);
      await refreshList();
      flashSaved(btn, 'Saved ✓');
    } catch (e) {
      flashSaved(btn, 'Failed');
      console.warn('[mem-ui] save last failed:', e);
    } finally {
      btn.disabled = false;
    }
  }

  async function onDeleteClick(id, rowEl) {
    try {
      await window.Memory.remove(id);
      rowEl.classList.add('us-mem-row-removing');
      setTimeout(() => { rowEl.remove(); updateFootCount(); }, 180);
    } catch (e) {
      console.warn('[mem-ui] delete failed:', e);
    }
  }

  function onSearchChange(input) {
    const q = input.value.trim();
    refreshList(q || null);
  }

  function flashSaved(btn, text) {
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = orig; }, 1100);
  }

  function updateFootCount() {
    const list = $('#usMemList');
    const foot = $('#usMemFoot');
    if (!list || !foot) return;
    const rows = list.querySelectorAll('.us-mem-row').length;
    foot.textContent = rows + (rows === 1 ? ' memory' : ' memories');
  }

  // ── per-AI-message 💾 icon via MutationObserver ─────────────────────
  // We watch #usMessages for new .us-msg-ai children and append a small
  // 💾 button to their footer. The button reads the message text from
  // the rendered DOM and calls Memory.save().
  function attachObserver() {
    const target = document.getElementById('usMessages');
    if (!target || !window.MutationObserver) return;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Either the new node IS an AI message, or it CONTAINS one.
          const candidates = [];
          if (isAiMessage(node)) candidates.push(node);
          node.querySelectorAll && node.querySelectorAll('.us-msg-ai').forEach(c => candidates.push(c));
          for (const el of candidates) attachSaveIcon(el);
        }
      }
    });
    obs.observe(target, { childList: true, subtree: true });
  }

  function isAiMessage(node) {
    if (!node || !node.classList) return false;
    return node.classList.contains('us-msg-ai') || node.classList.contains('us-msg-ai') || (node.dataset && node.dataset.role === 'ai');
  }

  function attachSaveIcon(aiMsgEl) {
    if (!aiMsgEl || aiMsgEl.dataset.usMemSaveAttached) return;
    aiMsgEl.dataset.usMemSaveAttached = '1';
    const btn = makeEl('button');
    btn.type = 'button';
    btn.className = 'us-mem-save-icon';
    btn.title = 'Save this reply to memory';
    btn.appendChild(makeText('💾'));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = extractText(aiMsgEl);
      if (!text) return;
      btn.disabled = true;
      window.Memory.save(text, 'chat', ['manual', 'from-bubble']).then(() => {
        flashSaved(btn, '✓');
      }).catch(err => {
        console.warn('[mem-ui] bubble save failed:', err);
        flashSaved(btn, '✕');
      }).finally(() => { btn.disabled = false; });
    });
    // Try to find a footer to append into; otherwise append as last child.
    const foot = aiMsgEl.querySelector('.us-msg-foot, .us-msg-meta, footer') || aiMsgEl;
    foot.appendChild(btn);
  }

  function extractText(aiMsgEl) {
    // Unicorn's AI messages wrap the rendered HTML in a content node.
    // We grab textContent which is safe and includes everything visible.
    const content = aiMsgEl.querySelector('.us-msg-content') || aiMsgEl;
    return (content.textContent || '').trim();
  }

  function getLastAiMessageText() {
    const msgs = $$('.us-msg-ai, [data-role="ai"]');
    if (!msgs.length) return null;
    return extractText(msgs[msgs.length - 1]);
  }

  // ── mount ────────────────────────────────────────────────────────────
  function mount() {
    if (!window.Memory) {
      // Memory module not loaded — defer.
      setTimeout(mount, 200);
      return;
    }
    const chatRoot = document.getElementById('usApp');
    if (!chatRoot) {
      setTimeout(mount, 200);
      return;
    }
    if (document.getElementById('usMemFab')) return; // idempotent

    // FAB lives inside the chat card.
    chatRoot.appendChild(buildFab());
    // Panel + backdrop live on body so they can overlay everything.
    document.body.appendChild(buildBackdrop());
    document.body.appendChild(buildPanel());

    // Per-AI-message 💾
    attachObserver();
    // Re-attach on any re-render — but MutationObserver covers that.
    // The list of existing AI messages on first load:
    $$('.us-msg-ai, [data-role="ai"]').forEach(attachSaveIcon);

    // Restore panel-open state from localStorage.
    let wasOpen = false;
    try { wasOpen = localStorage.getItem(PANEL_OPEN_KEY) === '1'; } catch (_) {}
    if (wasOpen) setPanelOpen(true);

    // Initial list render (in case the panel was already open).
    refreshList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();