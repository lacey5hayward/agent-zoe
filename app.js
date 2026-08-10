/* ==========================================================================
   Social Hub — prototype
   Plain vanilla JS, no build step. localStorage-backed.
   ========================================================================== */

/* ---------- Storage helpers ---------- */
const STORE = {
  get(k, fb) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
    catch { return fb; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }
};

/* ---------- Theme presets ---------- */
const THEMES = {
  minimal:  { name: 'Minimal',  vars: { '--bg': '#ffffff', '--fg': '#1e293b', '--accent': '#14b8a6', '--card-bg': '#f8fafc', '--border': '#e2e8f0', '--font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } },
  sunset:   { name: 'Sunset',   vars: { '--bg': '#fff7ed', '--fg': '#7c2d12', '--accent': '#f97316', '--card-bg': '#ffedd5', '--border': '#fed7aa', '--font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } },
  midnight: { name: 'Midnight', vars: { '--bg': '#0f172a', '--fg': '#e2e8f0', '--accent': '#818cf8', '--card-bg': '#1e293b', '--border': '#334155', '--font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } },
  forest:   { name: 'Forest',   vars: { '--bg': '#f0fdf4', '--fg': '#14532d', '--accent': '#16a34a', '--card-bg': '#dcfce7', '--border': '#bbf7d0', '--font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } }
};

/* ---------- Piczo canvas constants ---------- */
const PICZO_W = 900;
const PICZO_H = 600;

/* ---------- State (with one-time bio-page migration) ---------- */
const state = {
  drafts: STORE.get('sh_drafts', []),
  chats: STORE.get('sh_chats', []),
  botChats: STORE.get('sh_botChats', []),
  campaigns: STORE.get('sh_campaigns', []),
  pages: STORE.get('sh_pages', []).filter(p => p.type !== 'bio'), // drop removed bio pages
  activity: STORE.get('sh_activity', []),
  activeType: 'text',
  activeChatChannel: STORE.get('sh_activeChatChannel', 'general'),
  activePageId: STORE.get('sh_activePageId', null),
  pageMode: STORE.get('sh_pageMode', 'list'),
  selectedPiczoBlockId: STORE.get('sh_selectedPiczoBlockId', null),
  discordWidgetUrl: STORE.get('sh_discordWidgetUrl', ''),
  chatEmbedOpen: STORE.get('sh_chatEmbedOpen', false)
};
// Persist migration immediately
STORE.set('sh_pages', state.pages);
if (!state.activePageId || !state.pages.find(p => p.id === state.activePageId)) {
  state.activePageId = null;
  state.pageMode = 'list';
  STORE.set('sh_activePageId', null);
  STORE.set('sh_pageMode', 'list');
}

/* ---------- Utils ---------- */
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function logActivity(text) {
  state.activity.unshift({ text, ts: Date.now() });
  state.activity = state.activity.slice(0, 50);
  STORE.set('sh_activity', state.activity);
  renderActivity();
}

/* ---------- Navigation ---------- */
function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
      if (view === 'pages') restorePageMode();
    });
  });
}

function restorePageMode() {
  if (!state.activePageId) return showPagesList();
  const p = currentPage();
  if (!p) return showPagesList();
  if (state.pageMode === 'edit' && p.type === 'squidoo') showEditor();
  else if (state.pageMode === 'edit' && p.type === 'piczo') showPiczoEditor();
  else if (state.pageMode === 'preview') showPreview();
  else showPagesList();
}

/* ---------- Composer (post types + chat) ---------- */
function initComposer() {
  document.querySelectorAll('.pt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.type;
      state.activeType = type;
      document.querySelectorAll('.pt-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.pt-panel').forEach(p => p.classList.remove('active'));
      document.querySelector(`.pt-panel[data-panel="${type}"]`).classList.add('active');
    });
  });
  document.getElementById('composer-save').addEventListener('click', saveDraft);
  document.getElementById('composer-publish').addEventListener('click', publishDraft);

  const embedBtn = document.getElementById('chat-embed-toggle-btn');
  const embedPreview = document.getElementById('discord-embed-preview');
  const embedArrow = document.getElementById('chat-embed-arrow');
  function setEmbedOpen(open) {
    state.chatEmbedOpen = open;
    embedPreview.hidden = !open;
    embedArrow.textContent = open ? '▾' : '▸';
    embedBtn.setAttribute('aria-expanded', String(open));
    STORE.set('sh_chatEmbedOpen', open);
  }
  embedBtn.addEventListener('click', () => setEmbedOpen(!state.chatEmbedOpen));
  setEmbedOpen(state.chatEmbedOpen);

  const urlInput = document.getElementById('discord-widget-url');
  urlInput.addEventListener('change', e => { state.discordWidgetUrl = e.target.value; STORE.set('sh_discordWidgetUrl', state.discordWidgetUrl); });
  if (state.discordWidgetUrl) urlInput.value = state.discordWidgetUrl;

  // MERGE-SEAM: in the merged product, .chat-channel-tabs is gone (the
  // Discord-clone chat panel was replaced by Unicorn's #usApp). Guard
  // the wiring so we don't dereference a null NodeList. switchChatChannel
  // already no-ops safely when its selectors don't match.
  if (document.querySelector('.chat-channel-tabs')) {
    document.querySelectorAll('.chat-channel-tabs .cct-tab').forEach(tab => {
      tab.addEventListener('click', () => switchChatChannel(tab.dataset.channel));
    });
    switchChatChannel(state.activeChatChannel);
  }
}

function switchChatChannel(channel) {
  state.activeChatChannel = channel;
  STORE.set('sh_activeChatChannel', channel);
  document.querySelectorAll('.chat-channel-tabs .cct-tab').forEach(t => t.classList.toggle('active', t.dataset.channel === channel));
  document.querySelectorAll('.composer-chat-stream').forEach(s => s.classList.toggle('hidden', s.dataset.channel !== channel));
  const active = document.querySelector(`.composer-chat-stream[data-channel="${channel}"] .chat-messages`);
  if (active) active.scrollTop = active.scrollHeight;
}

function buildDraftFromForm() {
  const t = state.activeType;
  const d = { type: t, ts: Date.now() };
  if (t === 'text')   { d.title = val('text-title'); d.body = val('text-body'); }
  else if (t === 'photo')  { d.src = val('photo-src'); d.caption = val('photo-caption'); }
  else if (t === 'quote')  { d.body = val('quote-body'); d.source = val('quote-source'); }
  else if (t === 'link')   { d.url = val('link-url'); d.desc = val('link-desc'); }
  else if (t === 'chat')   { d.lines = val('chat-lines'); d.embedDiscord = state.chatEmbedOpen; d.widgetUrl = val('discord-widget-url'); }
  else if (t === 'audio')  { d.src = val('audio-src'); d.caption = val('audio-caption'); }
  else if (t === 'video')  { d.src = val('video-src'); d.caption = val('video-caption'); }
  return d;
}
function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }

function saveDraft() {
  const d = buildDraftFromForm();
  d.id = 'd_' + Date.now(); d.status = 'draft';
  state.drafts.unshift(d);
  STORE.set('sh_drafts', state.drafts);
  renderDrafts(); renderStats();
  logActivity('Saved a ' + d.type + ' draft');
}
function publishDraft() {
  const d = buildDraftFromForm();
  d.id = 'p_' + Date.now(); d.status = 'published';
  state.drafts.unshift(d);
  STORE.set('sh_drafts', state.drafts);
  renderDrafts(); renderStats();
  logActivity('Published a ' + d.type + ' post (stub — no API connected)');
}
function summarizeDraft(d) {
  if (d.type === 'text') return esc(d.title || d.body || '(empty)');
  if (d.type === 'photo') return esc(d.caption || d.src || '(empty)');
  if (d.type === 'quote') return esc(d.body || '(empty)') + (d.source ? ' — ' + esc(d.source) : '');
  if (d.type === 'link') return esc(d.url || '(empty)') + (d.desc ? ' · ' + esc(d.desc) : '');
  if (d.type === 'chat') { const lines = (d.lines || '').split('\n').filter(Boolean).slice(0, 2).join(' · '); return esc(lines || '(live chat)') + (d.embedDiscord ? ' · <em>Discord embed</em>' : ''); }
  if (d.type === 'audio') return esc(d.caption || d.src || '(empty)');
  if (d.type === 'video') return esc(d.caption || d.src || '(empty)');
  return '';
}
function renderDrafts() {
  const list = document.getElementById('drafts-list');
  if (state.drafts.length === 0) { list.innerHTML = '<div class="empty-state">Nothing yet.</div>'; renderStats(); return; }
  list.innerHTML = state.drafts.map(d => `
    <article class="draft-item">
      <div class="draft-type">${esc(d.type)}</div>
      <div class="draft-body">${summarizeDraft(d)}</div>
      <div class="draft-foot">
        <span class="draft-status status-${d.status}">${esc(d.status)}</span>
        <button class="link-btn" data-del="${d.id}">Delete</button>
      </div>
    </article>
  `).join('');
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    state.drafts = state.drafts.filter(x => x.id !== b.dataset.del);
    STORE.set('sh_drafts', state.drafts);
    renderDrafts();
  }));
  renderStats();
}

/* ---------- Chat ---------- */
function initChat() {
  // MERGE-SEAM: #chat-form is hidden (display:none) in the merged product
  // because the Composer → Chat panel is now Unicorn's #usApp. The form
  // may also be removed from DOM entirely; guard so we never throw.
  const chatForm = document.getElementById('chat-form');
  if (!chatForm) return;
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    state.chats.push({ user: 'You', text, ts: Date.now() });
    STORE.set('sh_chats', state.chats);
    appendChatMessage('You', text, 'Y');
    input.value = ''; renderStats();
    logActivity('Sent a chat message in #general');
  });
  state.chats.forEach(m => appendChatMessage(m.user, m.text, m.user[0], false));
  scrollChat();
}
function appendChatMessage(user, text, initial, scroll = true) {
  const wrap = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<div class="msg-avatar">${esc(initial)}</div><div class="msg-body"><div class="msg-meta"><span class="msg-user">${esc(user)}</span><span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div class="msg-text">${esc(text)}</div></div>`;
  wrap.appendChild(div);
  if (scroll) scrollChat();
}
function scrollChat() { const w = document.getElementById('chat-messages'); if (w) w.scrollTop = w.scrollHeight; }

/* ---------- Chatbot ---------- */
function initChatbot() {
  // MERGE-SEAM: in the merged product the legacy stub `botReply()` is
  // replaced by Unicorn chat (window.UsChat). The form may be hidden or
  // absent from DOM entirely; guard so we never throw. When the form is
  // present we still attach the handler so #bot-form can be wired up to
  // future widgets (e.g. an admin console), but the chat-routing is
  // delegated to mergedBotReply (defined in SECTION B below).
  const form = document.getElementById('bot-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('bot-input');
    const text = input.value.trim();
    if (!text) return;
    state.botChats.push({ from: 'You', text, ts: Date.now() });
    STORE.set('sh_botChats', state.botChats);
    appendBotMessage('You', text, 'Y', false);
    input.value = ''; renderStats();
    logActivity('Chatted with Chatbot');
    // MERGE-SEAM: forward to Unicorn chat engine. mergedBotReply posts
    // the user message into Unicorn's UI, calls /api/proxy through the
    // Cloudflare Worker, and posts the AI reply. Falls back to the
    // original stub botReply() if the merge glue isn't loaded (which
    // shouldn't happen with the bundled app.js, but defensive anyway).
    if (typeof mergedBotReply === 'function') {
      mergedBotReply(text);
    } else {
      setTimeout(() => {
        const reply = botReply(text);
        state.botChats.push({ from: 'Chatbot', text: reply, ts: Date.now() });
        STORE.set('sh_botChats', state.botChats);
        appendBotMessage('Chatbot', reply, 'C', true);
      }, 450);
    }
  });
  state.botChats.forEach(m => { const isBot = m.from !== 'You'; appendBotMessage(m.from, m.text, m.from[0], isBot, false); });
  scrollBot();
}
function appendBotMessage(user, text, initial, isBot, scroll = true) {
  const wrap = document.getElementById('bot-messages');
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<div class="msg-avatar ${isBot ? 'bot' : ''}">${esc(initial)}</div><div class="msg-body"><div class="msg-meta"><span class="msg-user">${esc(user)}</span>${isBot ? '<span class="msg-time bot-tag">BOT</span>' : ''}<span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div class="msg-text">${esc(text)}</div></div>`;
  wrap.appendChild(div);
  if (scroll) scrollBot();
}
function scrollBot() { const w = document.getElementById('bot-messages'); if (w) w.scrollTop = w.scrollHeight; }

function botReply(input) {
  const lower = input.toLowerCase();
  if (/^(hi|hello|hey)\b/.test(lower)) return 'Hey there. Local stub — wire me to your LLM endpoint when ready (see app.js → botReply).';
  if (lower.includes('discord')) return 'Discord-look, local-only backend. To go live: create a Discord bot, paste the token into a tiny server, and replace botReply() with a fetch to it.';
  if (lower.includes('piczo')) return 'Piczo Page = free-form drag-and-drop canvas (Piczo-style). Drag any element, resize from the bottom-right corner. Great for bio link pages, creative layouts, and portfolios.';
  if (lower.includes('squidoo') || lower.includes('lense') || lower.includes('stacked')) return 'Squidoo Lense = stacked blocks (Squidoo-style). Drag the ⋮⋮ handle to reorder. Best for articles, blogs, how-to guides, and structured long-form content.';
  if (lower.includes('tumblr') || lower.includes('composer')) return 'Seven post types in the Composer. Chat has the live chat widget + Discord embed button.';
  if (lower.includes('page')) return 'Two page modes: Squidoo Lense (stacked blocks, Squidoo-style) and Piczo Page (free-form canvas, Piczo-style). Ask me to style the one you\'re editing.';
  if (lower.includes('blaster') || lower.includes('campaign') || lower.includes('ad')) return 'Blaster Bay = ops dashboard. Real ad platforms need approved developer accounts + billing.';
  if (lower.includes('aggregator') || lower.includes('dashboard')) return 'Dashboard = social aggregator. Connect accounts there.';
  if (/(theme|color|colour|make it|style|design|look)/i.test(input) && /(dark|light|sunset|forest|ocean|blue|pink|orange|green|purple|red|yellow|warm|cool|bright|minimal|clean|white|midnight)/i.test(input)) return applyChatbotTheme(input);
  if (lower.includes('help')) return 'I can walk through: composer, chat, pages (Squidoo Lense / Piczo Page), blaster bay, themes. Try "make it dark" while editing a page.';
  return 'Got it: "' + input + '". (Stub reply — replace botReply() with your LLM call.)';
}

function applyChatbotTheme(input) {
  const page = currentPage();
  const onPageView = document.getElementById('view-pages').classList.contains('active');
  if (!page || !onPageView || state.pageMode === 'list') return 'Open a page first (Pages tab → Edit), then tell me how to style it.';
  const lower = input.toLowerCase();
  let vars = {};
  if (lower.includes('midnight') || (lower.includes('dark') && !lower.includes('accent'))) vars = { '--bg': '#0f172a', '--fg': '#e2e8f0', '--accent': '#818cf8', '--card-bg': '#1e293b', '--border': '#334155' };
  else if (lower.includes('sunset') || lower.includes('orange') || lower.includes('warm')) vars = { '--bg': '#fff7ed', '--fg': '#7c2d12', '--accent': '#f97316', '--card-bg': '#ffedd5', '--border': '#fed7aa' };
  else if (lower.includes('forest') || lower.includes('green') || lower.includes('nature')) vars = { '--bg': '#f0fdf4', '--fg': '#14532d', '--accent': '#16a34a', '--card-bg': '#dcfce7', '--border': '#bbf7d0' };
  else if (lower.includes('ocean') || lower.includes('blue') || lower.includes('navy')) vars = { '--bg': '#eff6ff', '--fg': '#1e3a8a', '--accent': '#3b82f6', '--card-bg': '#dbeafe', '--border': '#bfdbfe' };
  else if (lower.includes('pink') || lower.includes('rose')) vars = { '--bg': '#fdf2f8', '--fg': '#831843', '--accent': '#ec4899', '--card-bg': '#fce7f3', '--border': '#fbcfe8' };
  else if (lower.includes('purple') || lower.includes('violet')) vars = { '--bg': '#faf5ff', '--fg': '#581c87', '--accent': '#a855f7', '--card-bg': '#f3e8ff', '--border': '#e9d5ff' };
  else if (lower.includes('minimal') || lower.includes('clean') || lower.includes('white')) vars = { '--bg': '#ffffff', '--fg': '#1e293b', '--accent': '#14b8a6', '--card-bg': '#f8fafc', '--border': '#e2e8f0' };
  else return 'Tell me more specifically — try "dark", "midnight", "sunset", "forest", "ocean", "pink", "purple", or "minimal".';
  const customId = 'custom_' + Date.now();
  THEMES[customId] = { name: 'Custom (chatbot)', vars };
  page.theme = customId;
  persistPage();
  const selId = page.type === 'squidoo' ? 'theme-picker' : 'theme-picker-piczo';
  const sel = document.getElementById(selId);
  if (sel) {
    let opt = sel.querySelector(`option[value="${customId}"]`);
    if (!opt) { opt = document.createElement('option'); opt.value = customId; opt.textContent = 'Custom (chatbot)'; sel.appendChild(opt); }
    sel.value = customId;
  }
  return `Theme applied to "${page.title || 'this page'}". Click Preview to see it.`;
}

/* ---------- Blaster Bay ---------- */
function initBlasterBay() {
  document.getElementById('ad-new').addEventListener('click', () => {
    const name = (prompt('Campaign name?') || '').trim();
    if (!name) return;
    const c = { id: 'c_' + Date.now(), name, budget: 100, status: 'draft', ts: Date.now() };
    state.campaigns.unshift(c);
    STORE.set('sh_campaigns', state.campaigns);
    renderAds();
    logActivity('Created campaign: ' + name);
  });
  renderAds();
}
function renderAds() {
  const grid = document.getElementById('ad-grid');
  if (state.campaigns.length === 0) { grid.innerHTML = '<div class="empty-state ad-empty">No campaigns yet. Create one to see the layout.</div>'; renderStats(); return; }
  grid.innerHTML = state.campaigns.map(c => `
    <article class="ad-card">
      <header class="ad-card-head"><div class="ad-card-name">${esc(c.name)}</div><span class="ad-card-status">${esc(c.status)}</span></header>
      <div class="ad-card-stats">
        <div><div class="ad-stat-label">Budget</div><div class="ad-stat-value">$${c.budget}</div></div>
        <div><div class="ad-stat-label">Reach</div><div class="ad-stat-value">— stub</div></div>
        <div><div class="ad-stat-label">CTR</div><div class="ad-stat-value">— stub</div></div>
      </div>
      <button class="link-btn" data-delc="${c.id}">Delete</button>
    </article>
  `).join('');
  grid.querySelectorAll('[data-delc]').forEach(b => b.addEventListener('click', () => {
    state.campaigns = state.campaigns.filter(x => x.id !== b.dataset.delc);
    STORE.set('sh_campaigns', state.campaigns);
    renderAds();
  }));
  renderStats();
}

/* ---------- Stats + activity ---------- */
function renderStats() {
  const drafts = document.getElementById('stat-drafts');
  if (!drafts) return;
  drafts.textContent = state.drafts.filter(d => d.status === 'draft').length;
  document.getElementById('stat-posts').textContent = state.drafts.filter(d => d.status === 'published').length;
  document.getElementById('stat-chats').textContent = state.chats.length + state.botChats.length;
  document.getElementById('stat-campaigns').textContent = state.campaigns.length;
  document.getElementById('stat-pages').textContent = state.pages.length;
}
function renderActivity() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  if (state.activity.length === 0) { feed.innerHTML = '<div class="empty-state">No activity yet. Try the Composer.</div>'; return; }
  feed.innerHTML = state.activity.map(a => `<div class="activity-row"><span class="activity-dot"></span><span class="activity-text">${esc(a.text)}</span><span class="activity-time">${new Date(a.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('');
}

/* ==========================================================================
   PAGES
   ========================================================================== */
function currentPage() { return state.pages.find(p => p.id === state.activePageId); }
function persistPage() { if (!currentPage()) return; currentPage().updatedAt = Date.now(); STORE.set('sh_pages', state.pages); }
function pageTypeLabel(t) { return t === 'piczo' ? 'Piczo Page' : 'Squidoo Lense'; }
function pageTypeBadge(t) { return t === 'piczo' ? 'piczo' : 'squidoo'; }

function initPages() {
  document.getElementById('page-new-squidoo').addEventListener('click', () => createPage('squidoo'));
  document.getElementById('page-new-piczo').addEventListener('click', () => createPage('piczo'));
  document.getElementById('page-back').addEventListener('click', showPagesList);
  document.getElementById('page-back-piczo').addEventListener('click', showPagesList);
  document.getElementById('page-back-preview').addEventListener('click', () => {
    const p = currentPage();
    if (!p) return showPagesList();
    p.type === 'squidoo' ? showEditor() : showPiczoEditor();
  });
  document.getElementById('page-preview-btn').addEventListener('click', showPreview);
  document.getElementById('page-preview-btn-piczo').addEventListener('click', showPreview);
  document.getElementById('page-delete').addEventListener('click', deletePage);
  document.getElementById('page-delete-piczo').addEventListener('click', deletePage);

  document.querySelectorAll('.block-add-btn[data-block-type]').forEach(btn => btn.addEventListener('click', () => addBlock(btn.dataset.blockType)));
  document.querySelectorAll('.block-add-btn[data-piczo-type]').forEach(btn => btn.addEventListener('click', () => addPiczoBlock(btn.dataset.piczoType)));

  document.getElementById('theme-picker').addEventListener('change', e => setPageTheme(e.target.value));
  document.getElementById('theme-picker-piczo').addEventListener('change', e => setPageTheme(e.target.value));

  document.getElementById('editor-title').addEventListener('input', e => { if (currentPage()) { currentPage().title = e.target.value; persistPage(); } });
  document.getElementById('editor-piczo-title').addEventListener('input', e => { if (currentPage()) { currentPage().title = e.target.value; persistPage(); } });

  renderPagesList();
}

function createPage(type) {
  const page = { id: 'p_' + Date.now(), type, title: type === 'piczo' ? 'Untitled Piczo Page' : 'Untitled Squidoo Lense', theme: 'minimal', blocks: [], createdAt: Date.now(), updatedAt: Date.now() };
  state.pages.unshift(page);
  state.activePageId = page.id;
  STORE.set('sh_pages', state.pages);
  STORE.set('sh_activePageId', state.activePageId);
  STORE.set('sh_pageMode', 'edit');
  state.pageMode = 'edit';
  state.selectedPiczoBlockId = null;
  STORE.set('sh_selectedPiczoBlockId', null);
  type === 'squidoo' ? showEditor() : showPiczoEditor();
  logActivity('Created a ' + pageTypeLabel(type));
}

function deletePage() {
  if (!currentPage()) return;
  if (!confirm('Delete this page?')) return;
  state.pages = state.pages.filter(p => p.id !== state.activePageId);
  state.activePageId = null;
  STORE.set('sh_pages', state.pages);
  STORE.set('sh_activePageId', null);
  showPagesList();
  logActivity('Deleted a page');
}

function duplicatePage(id) {
  const orig = state.pages.find(p => p.id === id);
  if (!orig) return;
  const copy = JSON.parse(JSON.stringify(orig));
  copy.id = 'p_' + Date.now();
  copy.title = orig.title + ' (copy)';
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  state.pages.unshift(copy);
  STORE.set('sh_pages', state.pages);
  renderPagesList();
  renderStats();
  logActivity('Duplicated page: ' + orig.title);
}

function showPagesList() {
  state.pageMode = 'list';
  STORE.set('sh_pageMode', 'list');
  state.activePageId = null;
  STORE.set('sh_activePageId', null);
  hideAllPageSubviews();
  document.getElementById('pages-list-view').classList.remove('hidden');
  renderPagesList();
}
function showEditor() {
  const p = currentPage();
  if (!p || p.type !== 'squidoo') return showPagesList();
  state.pageMode = 'edit';
  STORE.set('sh_pageMode', 'edit');
  hideAllPageSubviews();
  document.getElementById('pages-edit-view').classList.remove('hidden');
  document.getElementById('editor-title').value = p.title;
  syncThemePicker(p, 'theme-picker');
  renderBlocks();
}
function showPiczoEditor() {
  const p = currentPage();
  if (!p || p.type !== 'piczo') return showPagesList();
  state.pageMode = 'edit';
  STORE.set('sh_pageMode', 'edit');
  hideAllPageSubviews();
  document.getElementById('pages-piczo-view').classList.remove('hidden');
  document.getElementById('editor-piczo-title').value = p.title;
  syncThemePicker(p, 'theme-picker-piczo');
  renderPiczoCanvas();
}
function showPreview() {
  const p = currentPage();
  if (!p) return;
  state.pageMode = 'preview';
  STORE.set('sh_pageMode', 'preview');
  hideAllPageSubviews();
  document.getElementById('pages-preview-view').classList.remove('hidden');
  renderPreview();
}
function hideAllPageSubviews() {
  ['pages-list-view', 'pages-edit-view', 'pages-piczo-view', 'pages-preview-view'].forEach(id => document.getElementById(id).classList.add('hidden'));
}
function syncThemePicker(page, selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  Object.keys(THEMES).forEach(id => {
    if (['minimal', 'sunset', 'midnight', 'forest'].includes(id)) return;
    if (sel.querySelector(`option[value="${id}"]`)) return;
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = THEMES[id].name;
    sel.appendChild(opt);
  });
  sel.value = page.theme || 'minimal';
}
function setPageTheme(themeId) { const p = currentPage(); if (!p) return; p.theme = themeId; persistPage(); }

function renderPagesList() {
  const grid = document.getElementById('pages-grid');
  if (state.pages.length === 0) { grid.innerHTML = '<div class="empty-state pages-empty">No pages yet. Pick a mode above to get started.</div>'; renderStats(); return; }
  grid.innerHTML = state.pages.map(p => `
    <article class="page-card">
      <div class="page-card-head">
        <span class="page-type-badge type-${pageTypeBadge(p.type)}">${esc(pageTypeLabel(p.type))}</span>
        <span class="page-card-time">${new Date(p.updatedAt).toLocaleDateString()}</span>
      </div>
      <div class="page-card-title">${esc(p.title || 'Untitled')}</div>
      <div class="page-card-meta">${(p.blocks || []).length} blocks · theme: ${esc((THEMES[p.theme] || THEMES.minimal).name)}</div>
      <div class="page-card-actions">
        <button class="btn btn-ghost" data-edit="${p.id}">Edit</button>
        <button class="btn btn-primary" data-preview="${p.id}">Preview</button>
        <button class="link-btn" data-dup="${p.id}">Duplicate</button>
        <button class="link-btn link-danger" data-delp="${p.id}">Delete</button>
      </div>
    </article>
  `).join('');
  grid.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    state.activePageId = b.dataset.edit; STORE.set('sh_activePageId', state.activePageId);
    const p = currentPage();
    p.type === 'squidoo' ? showEditor() : showPiczoEditor();
  }));
  grid.querySelectorAll('[data-preview]').forEach(b => b.addEventListener('click', () => {
    state.activePageId = b.dataset.preview; STORE.set('sh_activePageId', state.activePageId);
    showPreview();
  }));
  grid.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => duplicatePage(b.dataset.dup)));
  grid.querySelectorAll('[data-delp]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Delete this page?')) return;
    state.pages = state.pages.filter(x => x.id !== b.dataset.delp);
    STORE.set('sh_pages', state.pages);
    renderPagesList(); renderStats();
  }));
  renderStats();
}

/* ==========================================================================
   SQUIDOO LENSE BLOCKS (stacked)
   ========================================================================== */
function defaultBlockData(type) {
  switch (type) {
    case 'text':    return { heading: '', body: '' };
    case 'image':   return { src: '', caption: '', alt: '' };
    case 'quote':   return { text: '', source: '' };
    case 'link':    return { url: '', title: '', description: '' };
    case 'video':   return { src: '', caption: '' };
    case 'divider': return {};
    case 'related': return { pageIds: [] };
    default: return {};
  }
}
function addBlock(type) {
  const p = currentPage();
  if (!p || p.type !== 'squidoo') return;
  p.blocks = p.blocks || [];
  p.blocks.push({ id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type, data: defaultBlockData(type) });
  persistPage();
  renderBlocks();
}
function deleteBlock(id) {
  const p = currentPage();
  if (!p) return;
  p.blocks = (p.blocks || []).filter(b => b.id !== id);
  persistPage();
  renderBlocks();
}
function renderBlocks() {
  const p = currentPage();
  if (!p || p.type !== 'squidoo') return;
  const container = document.getElementById('editor-blocks');
  if (!p.blocks || p.blocks.length === 0) {
    container.innerHTML = '<div class="empty-state">No blocks yet. Add one below.<div class="empty-state-hint">Tip: drop in a Related Pages block for the Squidoo-style blog roll sidebar.</div></div>';
    return;
  }
  container.innerHTML = p.blocks.map(b => renderBlockEditor(b)).join('');
  p.blocks.forEach(b => attachBlockListeners(b));
  attachBlockDragAndDrop();
}
function renderBlockEditor(block) {
  let body = '';
  const d = block.data;
  const bid = block.id;
  if (block.type === 'text') body = `<input type="text" class="block-input" data-bid="${bid}" data-field="heading" placeholder="Heading (optional)" value="${esc(d.heading)}" /><textarea class="block-input" data-bid="${bid}" data-field="body" placeholder="Body text…" rows="3">${esc(d.body)}</textarea>`;
  else if (block.type === 'image') body = `<input type="text" class="block-input" data-bid="${bid}" data-field="src" placeholder="Image URL" value="${esc(d.src)}" /><input type="text" class="block-input" data-bid="${bid}" data-field="caption" placeholder="Caption (optional)" value="${esc(d.caption)}" /><input type="text" class="block-input" data-bid="${bid}" data-field="alt" placeholder="Alt text (a11y)" value="${esc(d.alt)}" />`;
  else if (block.type === 'quote') body = `<textarea class="block-input" data-bid="${bid}" data-field="text" placeholder="Quote text…" rows="2">${esc(d.text)}</textarea><input type="text" class="block-input" data-bid="${bid}" data-field="source" placeholder="Source" value="${esc(d.source)}" />`;
  else if (block.type === 'link') body = `<input type="url" class="block-input" data-bid="${bid}" data-field="url" placeholder="URL" value="${esc(d.url)}" /><input type="text" class="block-input" data-bid="${bid}" data-field="title" placeholder="Link title" value="${esc(d.title)}" /><textarea class="block-input" data-bid="${bid}" data-field="description" placeholder="Description (optional)" rows="2">${esc(d.description)}</textarea>`;
  else if (block.type === 'video') body = `<input type="text" class="block-input" data-bid="${bid}" data-field="src" placeholder="Video URL" value="${esc(d.src)}" /><input type="text" class="block-input" data-bid="${bid}" data-field="caption" placeholder="Caption (optional)" value="${esc(d.caption)}" />`;
  else if (block.type === 'divider') body = '<div class="block-divider-preview">— divider —</div>';
  else if (block.type === 'related') {
    const others = state.pages.filter(x => x.id !== state.activePageId);
    const opts = others.length === 0 ? '<option disabled>Create more pages to feature</option>' : others.map(x => `<option value="${x.id}" ${(d.pageIds || []).includes(x.id) ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
    body = `<label class="block-label">Related pages (blog roll)</label><select multiple class="block-input block-multi" data-bid="${bid}" data-field="pageIds" size="4">${opts}</select><div class="block-hint">Hold Ctrl/Cmd to select multiple. Drops into the page as a sidebar list.</div>`;
  }
  return `<div class="block-card" draggable="true" data-block-id="${block.id}"><div class="block-header"><span class="block-drag-handle" title="Drag to reorder">⋮⋮</span><span class="block-type-label">${esc(block.type)}</span><button class="link-btn link-danger" data-delblock="${block.id}">Delete</button></div><div class="block-body">${body}</div></div>`;
}
function attachBlockListeners(block) {
  const delBtn = document.querySelector(`[data-delblock="${block.id}"]`);
  if (delBtn) delBtn.addEventListener('click', () => deleteBlock(block.id));
  document.querySelectorAll(`[data-bid="${block.id}"]`).forEach(input => {
    const field = input.dataset.field;
    input.addEventListener('input', () => {
      const p = currentPage();
      if (!p) return;
      const b = (p.blocks || []).find(x => x.id === block.id);
      if (!b) return;
      if (field === 'pageIds') b.data.pageIds = Array.from(input.selectedOptions).map(o => o.value);
      else b.data[field] = input.value;
      persistPage();
    });
  });
}
function attachBlockDragAndDrop() {
  const container = document.getElementById('editor-blocks');
  if (!container) return;
  container.querySelectorAll('.block-card').forEach(card => {
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.blockId); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId === card.dataset.blockId) return;
      const p = currentPage();
      if (!p) return;
      const blocks = p.blocks || [];
      const draggedIdx = blocks.findIndex(b => b.id === draggedId);
      const targetIdx = blocks.findIndex(b => b.id === card.dataset.blockId);
      if (draggedIdx < 0 || targetIdx < 0) return;
      const [moved] = blocks.splice(draggedIdx, 1);
      blocks.splice(targetIdx, 0, moved);
      persistPage();
      renderBlocks();
    });
  });
}

/* ==========================================================================
   PICZO CANVAS (free-form drag-and-drop, resizable)
   ========================================================================== */
const PICZO_SIZES = {
  text:    { width: 320, minHeight: 140 },
  image:   { width: 320, minHeight: 220 },
  quote:   { width: 340, minHeight: 140 },
  link:    { width: 300, minHeight: 100 },
  video:   { width: 360, minHeight: 220 },
  divider: { width: 460, minHeight: 36 },
  related: { width: 280, minHeight: 200 }
};

function addPiczoBlock(type) {
  const p = currentPage();
  if (!p || p.type !== 'piczo') return;
  p.blocks = p.blocks || [];
  const count = p.blocks.length;
  const size = PICZO_SIZES[type] || { width: 280, minHeight: 100 };
  const offset = count * 24;
  p.blocks.push({
    id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type,
    x: 40 + offset,
    y: 40 + offset,
    width: size.width,
    height: size.minHeight,
    zIndex: count + 1,
    data: defaultBlockData(type)
  });
  persistPage();
  renderPiczoCanvas();
}

function deletePiczoBlock(id) {
  const p = currentPage();
  if (!p) return;
  p.blocks = (p.blocks || []).filter(b => b.id !== id);
  if (state.selectedPiczoBlockId === id) {
    state.selectedPiczoBlockId = null;
    STORE.set('sh_selectedPiczoBlockId', null);
  }
  persistPage();
  renderPiczoCanvas();
}

function selectPiczoBlock(id) {
  state.selectedPiczoBlockId = id;
  STORE.set('sh_selectedPiczoBlockId', id);
  document.querySelectorAll('.piczo-block').forEach(b => b.classList.toggle('selected', b.dataset.blockId === id));
  renderPiczoInspector();
}

function renderPiczoCanvas() {
  const p = currentPage();
  if (!p || p.type !== 'piczo') return;
  const canvas = document.getElementById('piczo-canvas');
  const blocks = p.blocks || [];
  let html = '';
  if (blocks.length === 0) {
    html = '<div class="piczo-empty-hint">Click a block button below to add your first element. Drag to move, drag the bottom-right corner to resize.<div class="empty-state-hint">Tip: add an Image block + Link blocks to build a quick bio link page.</div></div>';
  } else {
    html = blocks.map(b => renderPiczoBlock(b)).join('');
  }
  canvas.innerHTML = html;
  if (blocks.length > 0) {
    blocks.forEach(b => attachPiczoHandlers(b));
    attachPiczoCanvasDeselect();
  }
  renderPiczoInspector();
}

function piczoBlockContentHTML(block) {
  const d = block.data || {};
  if (block.type === 'text') return `<div class="pcb-text">${d.heading ? `<h3>${esc(d.heading)}</h3>` : ''}<p>${esc(d.body || '(empty text)')}</p></div>`;
  if (block.type === 'image') return d.src ? `<img src="${esc(d.src)}" alt="${esc(d.alt)}" />` : `<div class="piczo-placeholder">📷 Image URL</div>`;
  if (block.type === 'quote') return `<blockquote class="pcb-quote">“${esc(d.text || '(empty)')}”${d.source ? `<cite>— ${esc(d.source)}</cite>` : ''}</blockquote>`;
  if (block.type === 'link') return `<a class="pcb-link" href="${esc(d.url || '#')}" target="_blank" rel="noopener"><div class="pcb-link-title">${esc(d.title || d.url || '(link)')}</div>${d.description ? `<div class="pcb-link-desc">${esc(d.description)}</div>` : ''}</a>`;
  if (block.type === 'video') return d.src ? `<video controls src="${esc(d.src)}"></video>` : `<div class="piczo-placeholder">▶ Video URL</div>`;
  if (block.type === 'divider') return '<hr class="pcb-divider" />';
  if (block.type === 'related') {
    const items = (d.pageIds || []).map(id => state.pages.find(x => x.id === id)).filter(Boolean);
    return `<div class="pcb-related"><h4>Related</h4>${items.length ? `<ul>${items.map(x => `<li>${esc(x.title)}</li>`).join('')}</ul>` : '<div class="pcb-empty">(no pages selected)</div>'}</div>`;
  }
  return '';
}

function renderPiczoBlock(block) {
  const selected = state.selectedPiczoBlockId === block.id;
  return `<div class="piczo-block ${selected ? 'selected' : ''}" data-block-id="${block.id}" style="left: ${block.x}px; top: ${block.y}px; width: ${block.width}px; height: ${block.height || 'auto'}; z-index: ${block.zIndex || 1};">
    <div class="piczo-block-content">${piczoBlockContentHTML(block)}</div>
    <div class="piczo-handle piczo-delete" data-pdel="${block.id}" title="Delete">×</div>
    <div class="piczo-handle piczo-resize" data-presize="${block.id}" title="Resize"></div>
  </div>`;
}

function attachPiczoHandlers(block) {
  const el = document.querySelector(`.piczo-block[data-block-id="${block.id}"]`);
  if (!el) return;
  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('piczo-handle')) return;
    e.preventDefault();
    selectPiczoBlock(block.id);
    startPiczoDrag(e, el, block);
  });
  const del = el.querySelector(`[data-pdel="${block.id}"]`);
  if (del) del.addEventListener('click', e => { e.stopPropagation(); deletePiczoBlock(block.id); });
  const rs = el.querySelector(`[data-presize="${block.id}"]`);
  if (rs) rs.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); startPiczoResize(e, el, block); });
}

function attachPiczoCanvasDeselect() {
  const canvas = document.getElementById('piczo-canvas');
  canvas.addEventListener('mousedown', e => {
    if (e.target === canvas) {
      state.selectedPiczoBlockId = null;
      STORE.set('sh_selectedPiczoBlockId', null);
      document.querySelectorAll('.piczo-block').forEach(b => b.classList.remove('selected'));
      renderPiczoInspector();
    }
  });
}

function startPiczoDrag(e, el, block) {
  const startX = e.clientX, startY = e.clientY;
  const startLeft = block.x, startTop = block.y;
  el.classList.add('dragging');
  function onMove(ev) {
    const dx = ev.clientX - startX, dy = ev.clientY - startY;
    block.x = Math.max(0, Math.min(PICZO_W - 80, startLeft + dx));
    block.y = Math.max(0, Math.min(PICZO_H - 40, startTop + dy));
    el.style.left = block.x + 'px';
    el.style.top = block.y + 'px';
  }
  function onUp() {
    el.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    persistPage();
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startPiczoResize(e, el, block) {
  const startX = e.clientX;
  const startW = block.width;
  el.classList.add('resizing');
  function onMove(ev) {
    const dx = ev.clientX - startX;
    block.width = Math.max(100, Math.min(PICZO_W - block.x - 4, startW + dx));
    el.style.width = block.width + 'px';
  }
  function onUp() {
    el.classList.remove('resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    persistPage();
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function renderPiczoInspector() {
  const inspector = document.getElementById('piczo-inspector');
  if (!inspector) return;
  if (!state.selectedPiczoBlockId) {
    inspector.innerHTML = '<div class="empty-state">Click a block on the canvas to edit its content.</div>';
    return;
  }
  const p = currentPage();
  const block = (p.blocks || []).find(b => b.id === state.selectedPiczoBlockId);
  if (!block) { inspector.innerHTML = '<div class="empty-state">Block not found.</div>'; return; }
  inspector.innerHTML = `
    <div class="inspector-header">
      <span class="inspector-label">Editing: ${esc(block.type)}</span>
      <button class="link-btn link-danger" id="inspector-delete">Delete</button>
    </div>
    <div class="inspector-body">${piczoInspectorFields(block)}</div>
    <div class="inspector-foot">
      <span class="block-hint">Position: ${Math.round(block.x)}, ${Math.round(block.y)} · Size: ${Math.round(block.width)}px</span>
    </div>
  `;
  document.getElementById('inspector-delete').addEventListener('click', () => deletePiczoBlock(block.id));
  inspector.querySelectorAll('.inspector-input').forEach(input => {
    const field = input.dataset.field;
    input.addEventListener('input', () => {
      if (field === 'pageIds') block.data.pageIds = Array.from(input.selectedOptions).map(o => o.value);
      else block.data[field] = input.value;
      persistPage();
      updatePiczoBlockPreview(block);
    });
  });
}

function piczoInspectorFields(block) {
  const d = block.data || {};
  if (block.type === 'text') return `<label class="field"><span class="field-label">Heading</span><input type="text" class="inspector-input" data-field="heading" value="${esc(d.heading)}" /></label><label class="field"><span class="field-label">Body</span><textarea class="inspector-input" data-field="body" rows="5">${esc(d.body)}</textarea></label>`;
  if (block.type === 'image') return `<label class="field"><span class="field-label">Image URL</span><input type="text" class="inspector-input" data-field="src" value="${esc(d.src)}" /></label><label class="field"><span class="field-label">Caption</span><input type="text" class="inspector-input" data-field="caption" value="${esc(d.caption)}" /></label><label class="field"><span class="field-label">Alt text</span><input type="text" class="inspector-input" data-field="alt" value="${esc(d.alt)}" /></label>`;
  if (block.type === 'quote') return `<label class="field"><span class="field-label">Quote text</span><textarea class="inspector-input" data-field="text" rows="3">${esc(d.text)}</textarea></label><label class="field"><span class="field-label">Source</span><input type="text" class="inspector-input" data-field="source" value="${esc(d.source)}" /></label>`;
  if (block.type === 'link') return `<label class="field"><span class="field-label">URL</span><input type="url" class="inspector-input" data-field="url" value="${esc(d.url)}" /></label><label class="field"><span class="field-label">Title</span><input type="text" class="inspector-input" data-field="title" value="${esc(d.title)}" /></label><label class="field"><span class="field-label">Description</span><textarea class="inspector-input" data-field="description" rows="3">${esc(d.description)}</textarea></label>`;
  if (block.type === 'video') return `<label class="field"><span class="field-label">Video URL</span><input type="text" class="inspector-input" data-field="src" value="${esc(d.src)}" /></label><label class="field"><span class="field-label">Caption</span><input type="text" class="inspector-input" data-field="caption" value="${esc(d.caption)}" /></label>`;
  if (block.type === 'divider') return '<div class="block-hint">Divider block — no content to edit.</div>';
  if (block.type === 'related') {
    const others = state.pages.filter(x => x.id !== state.activePageId);
    const opts = others.length === 0 ? '<option disabled>Create more pages to feature</option>' : others.map(x => `<option value="${x.id}" ${(d.pageIds || []).includes(x.id) ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
    return `<label class="field"><span class="field-label">Related pages</span><select multiple class="inspector-input" data-field="pageIds" size="5">${opts}</select><div class="block-hint">Ctrl/Cmd-click to select multiple.</div></label>`;
  }
  return '';
}

function updatePiczoBlockPreview(block) {
  const el = document.querySelector(`.piczo-block[data-block-id="${block.id}"] .piczo-block-content`);
  if (el) el.innerHTML = piczoBlockContentHTML(block);
  const foot = document.querySelector('.inspector-foot .block-hint');
  if (foot) foot.textContent = `Position: ${Math.round(block.x)}, ${Math.round(block.y)} · Size: ${Math.round(block.width)}px`;
}

/* ---------- Preview ---------- */
function renderPreview() {
  const p = currentPage();
  if (!p) return;
  document.getElementById('preview-page-title').textContent = p.title || 'Untitled';
  const theme = THEMES[p.theme] || THEMES.minimal;
  const themeStyle = Object.entries(theme.vars).map(([k, v]) => `${k}: ${v}`).join('; ');
  let body = '';
  if (p.type === 'squidoo') body = (p.blocks || []).map(renderBlockPreview).join('');
  else if (p.type === 'piczo') body = renderPiczoPreview(p);
  document.getElementById('preview-frame').innerHTML = `<div class="preview-page" style="${themeStyle}">${body}</div>`;
}

function renderBlockPreview(block) {
  const d = block.data || {};
  if (block.type === 'text') return `<div class="pb-text">${d.heading ? `<h2 class="pb-heading">${esc(d.heading)}</h2>` : ''}<p class="pb-body">${esc(d.body)}</p></div>`;
  if (block.type === 'image') return `<figure class="pb-image">${d.src ? `<img src="${esc(d.src)}" alt="${esc(d.alt)}" />` : '<div class="pb-image-placeholder">Image</div>'}${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}</figure>`;
  if (block.type === 'quote') return `<blockquote class="pb-quote"><p>“${esc(d.text)}”</p>${d.source ? `<cite>— ${esc(d.source)}</cite>` : ''}</blockquote>`;
  if (block.type === 'link') return `<a class="pb-link" href="${esc(d.url)}" target="_blank" rel="noopener"><div class="pb-link-title">${esc(d.title || d.url)}</div>${d.description ? `<div class="pb-link-desc">${esc(d.description)}</div>` : ''}</a>`;
  if (block.type === 'video') return `<figure class="pb-video">${d.src ? `<video controls src="${esc(d.src)}"></video>` : '<div class="pb-image-placeholder">Video</div>'}${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}</figure>`;
  if (block.type === 'divider') return `<hr class="pb-divider" />`;
  if (block.type === 'related') {
    const featured = (d.pageIds || []).map(id => state.pages.find(x => x.id === id)).filter(Boolean);
    return `<aside class="pb-related"><h3 class="pb-related-title">Related</h3><ul class="pb-related-list">${featured.map(x => `<li><a href="#">${esc(x.title)}</a></li>`).join('')}</ul></aside>`;
  }
  return '';
}

function renderPiczoPreview(p) {
  const blocks = (p.blocks || []).map(b => `<div class="ppb-block" style="left: ${b.x}px; top: ${b.y}px; width: ${b.width}px; height: ${b.height || 'auto'}; z-index: ${b.zIndex || 1};">${piczoBlockContentHTML(b)}</div>`).join('');
  return `<div class="preview-piczo">${blocks}</div>`;
}

/* ---------- Bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initComposer();
  initChat();
  initChatbot();
  initBlasterBay();
  initPages();
  renderDrafts();
  renderStats();
  renderActivity();
});
/* ==========================================================================
   SECTION B — MERGE GLUE
   ==========================================================================
   This section sits between Social Hub (above) and Unicorn Sparkles (below).
   It exposes:
     - mergedBotReply(text) — the routing function called by initChatbot
       when the user submits #bot-form. It posts the user message into
       Unicorn's chat UI (window.UsChat.postUser), calls the configured
       engine through /api/proxy, and posts the AI reply.
     - hideLegacyChatPanel() — defensive; if the chat sub-elements are
       ever re-introduced they stay invisible to the user.

   The functions are written as `function` declarations (not `const = () => …`)
   so they are hoisted and can be safely referenced from SECTION A above
   even though their definitions appear later in the source.
   ========================================================================== */

function mergedBotReply(text) {
  // Forward a chat submit to Unicorn's chat engine via the clone registry.
  // Phase 8: route through the active clone (DNA profile + engine chain).
  // The Worker walks the chain on 429 / 402 / empty / network error and
  // returns the first success — we annotate the bubble with which engine
  // actually answered and any fallbacks that were tried.
  if (!window.UsChat) {
    console.warn('[merge] UsChat not ready; message dropped:', text);
    return;
  }
  // Post the user's message into Unicorn's UI immediately.
  try { window.UsChat.postUser(text); } catch (e) { console.warn('[merge] postUser:', e); }
  // Show the typing indicator while we wait for the engine.
  try { window.UsChat.addTyping(); } catch (e) { /* noop */ }

  // Phase 9 + 10: memory hooks.
  //   - throttledAutoSave: always fires (every 3rd turn, capped at 20).
  //   - Recall toggle (Phase 10): when on, refresh the recall cache by
  //     running Memory.recall(text) before sending. The chat glue then
  //     splices the matches into sysPrompt. When off, no memories are
  //     included — chat is uncoupled from the memory store.
  let recalledMemories = [];
  if (window.Memory) {
    try { window.Memory.throttledAutoSave({ role: 'user', content: text }); } catch (e) { console.warn('[merge] autosave:', e); }
    try {
      const recallOn = localStorage.getItem('us-mem-recall-on') === '1';
      if (recallOn) {
        // Refresh the recall cache for this turn. Fire-and-forget so the
        // chat UX is never blocked on memory; the splice below uses the
        // previous cache if the fresh call hasn't returned yet.
        window.Memory.recall(text, 3).catch(() => { /* noop */ });
        recalledMemories = window.Memory._lastRecall() || [];
      }
    } catch (e) { /* noop */ }
  }

  // Resolve the active clone. If CloneState isn't loaded (load-order bug),
  // fall back to the legacy single-engine path for safety.
  let chain, dna, cloneLabel;
  if (window.CloneState) {
    chain = window.CloneState.activeEngineChain();
    dna = window.CloneState.activeDnaPrompt();
    cloneLabel = window.CloneState.activeLabel();
  } else {
    // Legacy fallback: pre-Phase-8 behavior.
    chain = [(window.UsState && window.UsState.defaultEngine) || 'pollinations'];
    dna = '';
    cloneLabel = 'Default';
  }

  // Base sysPrompt (lowest priority). The Worker will prepend dna above this.
  const baseSysPrompt =
    (window.UsState && window.UsState.sysPrompt) ||
    'You are Zoe, a sharp and direct AI assistant. You are the user\'s AI coworker inside Agent Zoe. Be direct, opinionated, and helpful. Lead with the answer. Skip preamble. No "as an AI" disclaimers. No "I hope this helps" closers. Just do the thing.';

  // Build the request body in the shape the Phase-7 Worker expects:
  //   { chain, dna, messages, sysPrompt, [persona], [memories] }
  //
  // Phase 9: if we have recalled memories from a prior search, prepend
  // them to sysPrompt as a "Memory" block. The Worker (Phase 7) already
  // has a composeSystemPrompt() helper that stacks layers; for now the
  // browser prepends because Memory lives in the browser and the Worker
  // is a thin proxy. (Phase 12 polish: move this into the Worker.)
  const memoryBlock = recalledMemories.length
    ? '\n\n[Memory — things the user has told you before]\n' + recalledMemories.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '';

  // Phase 11: persona overlay. Resolved by PersonaState from the active
  // clone's pin (if any) > the user's stored choice > system default.
  // If the active clone opts out (persona === false) the prompt is ''.
  let personaPrompt = '';
  try {
    if (window.PersonaState) personaPrompt = window.PersonaState.activePrompt() || '';
  } catch (_) { /* noop */ }
  const personaBlock = personaPrompt ? '\n\n' + personaPrompt : '';

  // Build multi-turn history from Unicorn's STATE.messages so the Worker
  // receives full conversation context, not just the current turn.
  // Exclude image turns (no content string) and cap at the last 10 pairs.
  let conversationHistory = [{ role: 'user', content: text }];
  try {
    if (window.UsState && Array.isArray(window.UsState.messages)) {
      const hist = window.UsState.messages
        .filter(m => (m.role === 'user' || m.role === 'ai') && typeof m.content === 'string')
        .slice(-20) // last 20 messages (10 pairs)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
      // Append the current user turn only if not already the last entry
      const lastHist = hist[hist.length - 1];
      if (!lastHist || !(lastHist.role === 'user' && lastHist.content === text)) {
        hist.push({ role: 'user', content: text });
      }
      if (hist.length > 0) conversationHistory = hist;
    }
  } catch (_) { /* noop — fall back to single-turn */ }

  fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chain,
      dna,
      persona: personaPrompt,
      messages: conversationHistory,
      sysPrompt: baseSysPrompt + memoryBlock + personaBlock
    })
  })
    .then(r => {
      if (!r.ok) throw new Error('proxy HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      // Mirror Unicorn's response shape: data.text is the canonical field.
      const reply = (data && (data.text ||
                              (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
                              (data.content && data.content[0] && data.content[0].text))) ||
                    '[no content from engine]';
      // Annotate the AI bubble with clone + actual engine used + fallbacks tried.
      const engineUsed = (data && data.engine) || 'unknown';
      const usedFallback = (data && data.usedFallback) || [];
      // Use clone label if it's not the default generic label
      const displayLabel = (cloneLabel && cloneLabel !== 'Default' && cloneLabel !== 'Unknown') ? cloneLabel : 'Zoe';
      let footer = displayLabel + ' · via ' + engineUsed;
      if (usedFallback.length) {
        footer += ' (after ' + usedFallback.join(', ') + ')';
      }
      try { window.UsChat.postAI(reply, footer); } catch (e) { console.warn('[merge] postAI:', e); }
    })
    .catch(err => {
      console.error('[merge] engine call failed:', err);
      // Surface the error to the chat UI so the user sees it.
      try { window.UsChat.postAI('[engine error: ' + err.message + ']', 'system'); } catch (_) { /* noop */ }
    })
    .finally(() => {
      try { window.UsChat.removeTyping(); } catch (_) { /* noop */ }
    });
}

function hideLegacyChatPanel() {
  // Defensive: if the legacy Discord-clone chat elements ever sneak back
  // into the DOM, keep them invisible. Unicorn's chat UI is the only chat
  // surface the user should see.
  const ids = ['bot-messages', 'chat-messages'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  document.querySelectorAll('.composer-chat, .chat-channel-tabs').forEach(el => {
    el.style.display = 'none';
  });
}

// Run the defensive hide on DOMContentLoaded (after both IIFEs have run).
document.addEventListener('DOMContentLoaded', hideLegacyChatPanel);

/* ==========================================================================
   SECTION C — UNICORN SPARKLES (verbatim)
   ==========================================================================
   Below this banner: the original unicorn-sparkles/app.js, unmodified.
   Unicorn's IIFE wraps everything; only `window.UsChat` and `window.UsState`
   escape. That is the contract mergedBotReply depends on.
   ========================================================================== */

/* ====================================================================
   Unicorn Sparkles v4 — Phase 5
   Phase 1: Clean rebuild (single chat + prompt enhancer + 5 engines + folder)
   Phase 2: Image intent + procedural fallback + engine trust
   Phase 3: Markdown rendering + conversation memory + Pollinations streaming
            + Cloudflare Pages deployment guide (see README.md)
   Phase 4: Puter.js + Cloudflare Workers AI + Worker proxy (server-side keys)
   Phase 5: In-chat self build/edit (build-agent.js) + IndexedDB file store +
            live CSS hot-reload + Files panel in Output Folder + MERGE.md
            prep for the Tumblr/Discord project.
   - Event delegation on document
   - All classes prefixed us-
   - NA English prompt enhancer
   - Auto-fallback across engines
   - Output folder with search
   - Modular surface exposed via window.UsChat and window.UsState for
     sibling modules (build-agent, editor) — see MERGE.md.
   ==================================================================== */

(() => {
  'use strict';

  // ============== STATE ==============
  // Phase 3: MAX_HISTORY controls how many prior turns are sent as context.
  // 10 turns = 5 user + 5 assistant, plenty for follow-ups without bloating tokens.
  const MAX_HISTORY = 10;

  const STATE = {
    messages: [],        // { role, content, engine, t }
    outputs: [],         // { id, title, preview, content, engine, t }
    keys: {
      gemini: '',
      groq: '',
      deepseek: '',
      mistral: '',
      huggingface: ''
    },
    defaultEngine: 'auto',
    tone: 'professional',
    enhance: true,
    puterModel: 'gpt-5-mini', // Phase 4: which Puter.js model to use
    workersaiModel: '@cf/meta/llama-3.2-3b-instruct', // Phase 4: Workers AI model
    cfAccountId: '', // Phase 4: Cloudflare Account ID (for Workers AI)
    cfToken: '', // Phase 4: Cloudflare API token (Workers AI permission)
    mode: 'auto', // 'auto' | 'text' | 'image'
    folderFilter: 'all', // 'all' | 'text' | 'image'
    busy: false
  };

  // ============== MARKDOWN RENDERING (Phase 3) ==============
  // Render markdown safely. marked converts MD -> HTML; DOMPurify strips anything
  // dangerous (script tags, event handlers, javascript: URLs).
  function renderMarkdown(text) {
    if (text == null) return '';
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
      // Fallback if CDN failed to load — render as plain text
      return escapeHtml(text);
    }
    try {
      const raw = marked.parse(String(text), { breaks: true, gfm: true });
      return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [
          'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'hr',
          'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'blockquote', 'pre', 'code', 'span', 'div',
          'table', 'thead', 'tbody', 'tr', 'th', 'td'
        ],
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel']
      });
    } catch (_) {
      return escapeHtml(text);
    }
  }

  // ============== DNA FILES ==============
  // Writing DNA: uses the active clone's DNA profile if available, otherwise falls back to Zoe's default
  const DNA_WRITING = {
    sources: ['GPT-4', 'Claude 3.5', 'Gemini Pro'],
    // getPrompt() reads the active clone's DNA at call time so it's always fresh
    getPrompt(tone) {
      // Try to get the active clone's DNA prompt
      if (window.CloneState && window.CloneState.activeDnaPrompt) {
        const dnaPrompt = window.CloneState.activeDnaPrompt();
        if (dnaPrompt) return dnaPrompt;
      }
      // Fallback: Zoe's default personality
      return `You are Zoe, a sharp and direct AI assistant. You are the user's AI coworker.

Voice:
- Lead with the answer. Skip preamble like "Great question!" or "Certainly!".
- Be direct and opinionated. "I'd go X, because Y." Not "it depends; here are some considerations."
- Match the user's register — terse if they're terse, detailed if they want depth.
- When you're not certain, give your best guess and note the uncertainty briefly.
- Use markdown when it improves clarity. Don't use it as decoration.
- Default tone: ${tone || 'professional'}.
- Use North American English spelling and grammar.

Rules:
- No marketing-speak unless specifically asked.
- Use concrete examples and specific numbers.
- If you don't know, say so — don't fabricate.
- No "as an AI" disclaimers. No "I hope this helps" closers. Just do the thing.`;
    },
    // Keep .prompt for legacy code that reads it directly
    get prompt() { return this.getPrompt('professional'); }
  };

  // Image DNA: blends DALL·E (literal), MidJourney (cinematic), Flux (photoreal)
  const DNA_IMAGE = {
    sources: ['DALL·E 3', 'MidJourney v6', 'Flux'],
    expand: (userPrompt, style, ratio) => {
      const styleKeywords = {
        'photorealistic': 'photorealistic, sharp focus, 4k, highly detailed, natural lighting',
        'cinematic': 'cinematic, dramatic lighting, vibrant colors, atmospheric, depth of field, 8k',
        'illustration': 'digital illustration, vibrant colors, clean lines, artistic, detailed',
        'anime': 'anime style, vibrant, detailed, cel-shaded, Japanese animation aesthetic',
        '3d render': '3D render, octane render, volumetric lighting, high detail, photorealistic materials',
        'minimalist': 'minimalist, clean, simple composition, negative space, modern'
      };
      const styleAdd = styleKeywords[style] || 'high quality, detailed';
      // Detect if user prompt is already detailed
      const isDetailed = userPrompt.length > 80 || /\b(lighting|detailed|render|style|color)\b/i.test(userPrompt);
      const expanded = isDetailed
        ? `${userPrompt}, ${styleAdd}`
        : `${userPrompt}, ${styleAdd}`;
      return expanded;
    }
  };

  // Style → Pollinations prompt modifiers
  const STYLE_MAP = {
    'photorealistic': 'photorealistic, sharp focus, 4k, highly detailed, natural lighting',
    'cinematic': 'cinematic, dramatic lighting, vibrant colors, atmospheric, depth of field',
    'illustration': 'digital illustration, vibrant colors, clean lines, artistic, detailed',
    'anime': 'anime style, vibrant, detailed, cel-shaded, Japanese animation',
    '3d render': '3D render, octane render, volumetric lighting, high detail, photorealistic',
    'minimalist': 'minimalist, clean, simple composition, negative space, modern'
  };

  // Aspect ratio → width/height for Pollinations
  const RATIO_MAP = {
    '1:1': { w: 1024, h: 1024 },
    '16:9': { w: 1024, h: 576 },
    '9:16': { w: 576, h: 1024 },
    '4:3': { w: 1024, h: 768 },
    '3:2': { w: 1024, h: 682 }
  };

  // ============== ENGINE DEFINITIONS ==============
  const ENGINES = {
    gemini: {
      name: 'Gemini',
      needsKey: true,
      note: 'Tries multiple model names — free at aistudio.google.com',
      // Try several model names — different keys work with different ones
      modelNames: [
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-8b'
      ],
      test: async (key) => {
        // Try each model until one works
        for (const model of ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-lite']) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] })
          });
          if (res.ok) return true;
        }
        return false;
      },
      call: async (key, messages, sysPrompt) => {
        // Phase 4: route through Worker proxy when its secret is configured.
        const proxied = await callViaProxy('gemini', messages, sysPrompt);
        if (proxied != null) return proxied;
        // Phase 3: messages is [{role:'user'|'assistant', content:'...'}]
        // Gemini uses 'model' for assistant turns
        const contents = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b'];
        let lastErr = null;
        for (const model of models) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents,
                systemInstruction: { parts: [{ text: sysPrompt }] },
                generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
              })
            });
            if (res.ok) {
              const data = await res.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) return text;
            }
            lastErr = `HTTP ${res.status}`;
          } catch (e) {
            lastErr = e.message;
          }
        }
        throw new Error(lastErr || 'All Gemini models failed');
      }
    },

    groq: {
      name: 'Groq Llama 3.3 70B',
      needsKey: true,
      note: 'Free at console.groq.com',
      test: async (key) => {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        return res.ok;
      },
      call: async (key, messages, sysPrompt) => {
        const proxied = await callViaProxy('groq', messages, sysPrompt);
        if (proxied != null) return proxied;
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: sysPrompt },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 2048
          })
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    },

    deepseek: {
      name: 'DeepSeek',
      needsKey: true,
      note: 'May be CORS-blocked from browser — try if others fail',
      test: async (key) => {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        return res.ok;
      },
      call: async (key, messages, sysPrompt) => {
        const proxied = await callViaProxy('deepseek', messages, sysPrompt);
        if (proxied != null) return proxied;
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: sysPrompt },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 2048
          })
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    },

    mistral: {
      name: 'Mistral',
      needsKey: true,
      note: 'Free at console.mistral.ai — confirmed browser-friendly',
      test: async (key) => {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: 'mistral-small-latest', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        return res.ok;
      },
      call: async (key, messages, sysPrompt) => {
        const proxied = await callViaProxy('mistral', messages, sysPrompt);
        if (proxied != null) return proxied;
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: 'mistral-small-latest',
            messages: [
              { role: 'system', content: sysPrompt },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 2048
          })
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    },

    pollinations: {
      name: 'Pollinations',
      needsKey: false,
      supportsStream: true, // Phase 3: Pollinations streams SSE
      test: async () => true,
      call: async (key, messages, sysPrompt, onChunk) => {
        // Phase 3: if onChunk is provided, stream SSE chunks as they arrive.
        // Otherwise fall back to non-streaming full response.
        const body = JSON.stringify({
          messages: [
            { role: 'system', content: sysPrompt },
            ...messages
          ],
          model: 'openai',
          stream: !!onChunk
        });
        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!onChunk) {
          return await res.text();
        }
        // Streaming: parse Server-Sent Events
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE frames are separated by a blank line
            let idx;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const line = frame.split('\n').find(l => l.startsWith('data:'));
              if (!line) continue;
              const payload = line.slice(5).trim();
              if (payload === '[DONE]') continue;
              try {
                const json = JSON.parse(payload);
                // Pollinations uses OpenAI-compatible deltas
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  full += delta;
                  onChunk(delta, full);
                }
              } catch (_) {
                // ignore malformed frames
              }
            }
          }
        } finally {
          try { reader.releaseLock(); } catch (_) {}
        }
        return full;
      }
    },

    puter: {
      // Phase 4: Puter.js — keyless gateway to frontier models.
      // The user authenticates with their own Puter account in-browser.
      // Default model is GPT-5-mini (fast + cheap); user can switch to
      // gpt-5.5, claude-opus-4.8, gemini-3.5, grok-4.3, deepseek-chat, etc.
      name: 'Puter (GPT-5)',
      needsKey: false,
      supportsStream: false, // Puter uses async-iterable for streaming; non-stream is simpler
      test: async () => typeof puter !== 'undefined' && typeof puter.ai?.chat === 'function',
      call: async (key, messages, sysPrompt) => {
        if (typeof puter === 'undefined' || !puter.ai?.chat) {
          throw new Error('Puter.js not loaded (check network/CDN).');
        }
        const combined = [
          { role: 'system', content: sysPrompt },
          ...messages
        ];
        const model = STATE.puterModel || 'gpt-5-mini';
        const response = await puter.ai.chat(combined, { model });
        // Puter returns either a string or an object { message: { content } }
        if (typeof response === 'string') return response;
        if (response?.message?.content) {
          // content can be a string or array of {text} parts
          if (typeof response.message.content === 'string') return response.message.content;
          if (Array.isArray(response.message.content)) {
            return response.message.content.map(p => p.text || '').join('');
          }
        }
        if (response?.toString) return response.toString();
        return JSON.stringify(response);
      }
    },

    workersai: {
      // Phase 4: Cloudflare Workers AI — free tier (10K neurons/day).
      // The user provides their CF API token + account ID via localStorage;
      // browser calls api.cloudflare.com directly. Same-origin isn't required
      // because api.cloudflare.com has CORS open. Token stays in localStorage
      // (acceptable for a private workspace; Phase 4 proxy moves it server-side).
      name: 'Cloudflare Workers AI',
      needsKey: true,
      supportsStream: false,
      test: async (creds) => {
        if (!creds?.accountId || !creds?.token) return false;
        try {
          const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/@cf/meta/llama-3.2-3b-instruct`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
          });
          return res.ok;
        } catch { return false; }
      },
      call: async (creds, messages, sysPrompt) => {
        if (!creds?.accountId || !creds?.token) {
          throw new Error('Set CF Account ID + API token in Settings (⚙️ → Cloudflare Workers AI)');
        }
        const model = STATE.workersaiModel || '@cf/meta/llama-3.2-3b-instruct';
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/${model}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: sysPrompt },
              ...messages
            ]
          })
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Workers AI HTTP ${res.status}: ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        return data.result?.response || data.response || '';
      }
    }
  };

  // Engine priority: keyless first, then keys once Worker proxy is live.
  // Phase 4 puter added to the front so users get frontier models without setup.
  const ENGINE_ORDER = ['puter', 'workersai', 'mistral', 'groq', 'pollinations'];

  // ============== IMAGE ENGINE POOL ==============
  const IMAGE_ENGINES = {
    pollinations: {
      name: 'Pollinations',
      needsKey: false,
      call: async (prompt, style, ratio) => {
        const wh = RATIO_MAP[ratio] || RATIO_MAP['1:1'];
        const styleAdd = STYLE_MAP[style] || STYLE_MAP['cinematic'];
        const finalPrompt = `${prompt}, ${styleAdd}`;
        // Pollinations image API
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${wh.w}&height=${wh.h}&nologo=true&model=flux`;
        // Return URL — browser loads image directly
        return { url, prompt: finalPrompt, style, ratio };
      }
    },
    huggingface: {
      name: 'HuggingFace SDXL',
      needsKey: true,
      note: 'Free with HF token — better quality, slower',
      call: async (prompt, style, ratio, key) => {
        const wh = RATIO_MAP[ratio] || RATIO_MAP['1:1'];
        const styleAdd = STYLE_MAP[style] || STYLE_MAP['cinematic'];
        const finalPrompt = `${prompt}, ${styleAdd}`;
        const res = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: finalPrompt })
        });
        if (!res.ok) throw new Error(`HF error: ${res.status}`);
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob), prompt: finalPrompt, style, ratio };
      }
    },
    procedural: {
      name: 'Procedural SVG',
      needsKey: false,
      call: async (prompt, style, ratio) => {
        // Generate procedural SVG art based on prompt keywords
        return { url: generateProceduralSVG(prompt, style, ratio), prompt, style, ratio, procedural: true };
      }
    }
  };

  const IMAGE_ENGINE_ORDER = ['pollinations', 'huggingface', 'procedural'];

  // ============== INTENT DETECTION ==============
  function detectIntent(prompt) {
    const p = prompt.toLowerCase().trim();
    const imageKeywords = ['image', 'picture', 'photo', 'photograph', 'draw', 'paint', 'generate', 'create an', 'show me a', 'visualize', 'illustration', 'artwork', 'render', 'sketch', 'logo', 'icon', 'avatar', 'wallpaper', 'poster', 'banner', 'cover', 'portrait of', 'a painting of', 'a drawing of'];
    const visualNouns = ['cat', 'dog', 'mountain', 'sunset', 'sunrise', 'landscape', 'face', 'person', 'city', 'forest', 'ocean', 'sky', 'tree', 'flower', 'bird', 'house', 'car', 'robot', 'dragon', 'castle', 'beach', 'wolf', 'tiger', 'lion', 'horse', 'ship', 'building', 'room', 'character', 'hero', 'warrior'];
    const hasImageKeyword = imageKeywords.some(k => p.includes(k));
    const hasVisualNoun = visualNouns.some(n => p.split(/\s+/).includes(n));
    const startsWithDraw = /^(draw|paint|generate|create|make|show|design|render)\b/.test(p);
    if (hasImageKeyword || (startsWithDraw && (hasVisualNoun || p.split(/\s+/).length > 2))) return 'image';
    return 'text';
  }

  // ============== PROCEDURAL SVG GENERATOR ==============
  function generateProceduralSVG(prompt, style, ratio) {
    const wh = RATIO_MAP[ratio] || RATIO_MAP['1:1'];
    const w = wh.w, h = wh.h;
    const palettes = {
      'photorealistic': ['#3b4a5e', '#6e7a8a', '#a8b3c5', '#dbe1ea', '#f3f5f8', '#2a3340'],
      'cinematic': ['#0a0e1d', '#1a1f3a', '#5a3a8a', '#ec4899', '#f59e0b', '#fef3c7'],
      'illustration': ['#fef3c7', '#fcd34d', '#fb923c', '#f43f5e', '#a21caf', '#3b0764'],
      'anime': ['#fce7f3', '#fbcfe8', '#f9a8d4', '#ec4899', '#a21caf', '#1e1b4b'],
      '3d render': ['#06b6d4', '#0ea5e9', '#3b82f6', '#1e40af', '#1e1b4b', '#020617'],
      'minimalist': ['#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#57534e', '#1c1917']
    };
    const palette = palettes[style] || palettes['cinematic'];
    let seed = 0;
    for (let i = 0; i < (prompt || '').length; i++) seed = ((seed << 5) - seed) + prompt.charCodeAt(i);
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let shapes = '';
    // Big circle
    const cx = w * (0.3 + rng() * 0.4), cy = h * (0.3 + rng() * 0.4), cr = Math.min(w, h) * 0.2;
    shapes += `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="${palette[3]}" opacity="0.7"/>`;
    // Layered shapes
    for (let i = 0; i < 8; i++) {
      const x = rng() * w, y = rng() * h, r = 30 + rng() * 120;
      const c = palette[Math.floor(rng() * palette.length)];
      const op = 0.3 + rng() * 0.5;
      if (rng() > 0.5) {
        shapes += `<rect x="${x}" y="${y}" width="${r}" height="${r}" fill="${c}" opacity="${op}" rx="${rng() * 20}"/>`;
      } else {
        shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${op}"/>`;
      }
    }
    // Sun/moon accent
    const sx = w * (0.6 + rng() * 0.3), sy = h * (0.2 + rng() * 0.3), sr = 40 + rng() * 80;
    shapes += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${palette[4]}" opacity="0.9"/>`;
    shapes += `<circle cx="${sx}" cy="${sy}" r="${sr * 1.4}" fill="${palette[4]}" opacity="0.2"/>`;
    // Horizon line
    if (rng() > 0.5) {
      shapes += `<rect x="0" y="${h * 0.65}" width="${w}" height="${h * 0.35}" fill="${palette[5]}" opacity="0.3"/>`;
    }
    const safePrompt = (prompt || '').slice(0, 50).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${palette[0]}"/><stop offset="100%" stop-color="${palette[3]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/>${shapes}<text x="20" y="${h - 20}" fill="white" font-family="Inter, sans-serif" font-size="20" font-weight="600" opacity="0.9">${safePrompt}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // Track which engines have worked successfully (for smart routing)
  const ENGINE_TRUST = new Set();

  // ============== PROMPT ENHANCER (NA English) ==============
  const COMMON_TYPOS = {
    'bologna': 'blog', 'evnts': 'events', 'evnt': 'event',
    'teh': 'the', 'recieve': 'receive', 'occured': 'occurred',
    'seperate': 'separate', 'definately': 'definitely',
    'untill': 'until', 'wich': 'which', 'tommorow': 'tomorrow',
    'tomorow': 'tomorrow', 'begining': 'beginning',
    'writting': 'writing', 'runing': 'running',
    'geting': 'getting', 'comming': 'coming',
    'gona': 'going to', 'wana': 'want to', 'lemme': 'let me',
    'kinda': 'kind of', 'sorta': 'sort of',
    'u': 'you', 'ur': 'your', 'r': 'are', 'y': 'why',
    'thx': 'thanks', 'pls': 'please', 'plz': 'please',
    'tho': 'though', 'nvm': 'never mind', 'idk': "I don't know"
  };

  function enhancePrompt(prompt) {
    let enhanced = prompt.trim();
    if (!enhanced) return enhanced;

    // Fix common typos
    const words = enhanced.split(/\b/);
    const fixed = words.map(w => {
      const lower = w.toLowerCase();
      if (COMMON_TYPOS[lower] !== undefined) {
        // Preserve capitalization
        const replacement = COMMON_TYPOS[lower];
        if (w[0] && w[0] === w[0].toUpperCase()) {
          return replacement[0].toUpperCase() + replacement.slice(1);
        }
        return replacement;
      }
      return w;
    });
    enhanced = fixed.join('');

    // Capitalize "I" pronoun
    enhanced = enhanced.replace(/\bi\b/g, 'I');

    // Capitalize "AI" acronym
    enhanced = enhanced.replace(/\bai\b/g, 'AI');

    // Ensure first letter is capitalized
    enhanced = enhanced.charAt(0).toUpperCase() + enhanced.slice(1);

    // Ensure ends with punctuation
    if (!/[.!?]$/.test(enhanced)) {
      enhanced += '.';
    }

    return enhanced;
  }

  // ============== TEMPLATE FALLBACK ==============
  function templateFallback(prompt) {
    const p = prompt.toLowerCase();
    if (/^(hi|hello|hey|yo|sup|hola)\b/.test(p)) {
      return `Hey! 👋 I'm Zoe. I can help you write, plan, analyze, or think through anything. What's on your mind?`;
    }
    if (p.includes('who are you')) {
      return `I'm Zoe — your AI assistant. I combine the best of multiple AI engines (Gemini, Groq, DeepSeek, Mistral, Pollinations) with a Mavis persona: direct, opinionated, and real. Configure your API keys in ⚙️ to unlock more engines.`;
    }
    if (p.includes('what can you do') || p === 'help') {
      return `Here's what I can help with:\n\n- **Write** — blog posts, emails, social posts, scripts, newsletters\n- **Plan** — events, projects, strategies, schedules\n- **Analyze** — feedback, data, content review, SWOT\n- **Brainstorm** — names, ideas, themes, concepts\n- **Code** — explain, generate, refactor\n- **Chat** — think through any question with you\n\nJust type naturally — I'll figure out what you need.`;
    }
    if (p.match(/give me \d+ (ideas|tips|ways|things|examples|names)/)) {
      const n = parseInt(p.match(/(\d+)/)[1]) || 5;
      return `Here are ${n} ideas:\n\n${Array.from({length: n}, (_, i) => `${i+1}. **Idea ${i+1}** — Approach this from a fresh angle. The most useful answers often come from the question nobody's asking yet. Consider what would happen if you inverted the obvious assumption.`).join('\n\n')}\n\nWant me to expand on any of these?`;
    }
    if (/^[\d\s+\-*/().]+$/.test(prompt)) {
      try {
        return `That equals **${Function('"use strict";return (' + prompt + ')')()}**.`;
      } catch { return null; }
    }
    if (p.includes('email') || p.includes('write to')) {
      return `For a strong email:\n\n1. **Subject line** — specific, curiosity-driven, low cliche\n2. **First line** — earn the second line, skip "Hope this finds you well"\n3. **One ask** — don't dilute with multiple CTAs\n4. **Sign-off** — sound like a person, not a brand\n\nWant me to draft a specific email? Tell me the recipient, context, and ask.`;
    }
    return `Got it. Tell me more about what you're trying to get done and I'll draft it, edit what you've got, or brainstorm options.\n\n*Note: This is a template response. Add an API key in ⚙️ to get real AI output from Gemini, Groq, DeepSeek, or Mistral.*`;
  }

  // ============== DOM ==============
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ============== RENDER MESSAGES ==============
  // The big "Hey, I'm Zoe" empty state was removed — the prompt chips
  // now live in the chat bar (#usPromptChips) and show only when
  // there are no messages. We still keep the data-empty attribute
  // on the .us-app container so CSS can decide what to show.
  function renderMessages() {
    const container = $('#usMessages');
    if (!container) return;
    const usApp = document.querySelector('.us-app');
    const isEmpty = STATE.messages.length === 0;
    if (usApp) usApp.setAttribute('data-empty', isEmpty ? 'true' : 'false');
    // Defensive: if the old empty state sneaks in, drop it
    const stale = container.querySelector('#usEmpty, .us-empty');
    if (stale) stale.remove();
  }

  function addMessage(role, content, engine = null) {
    STATE.messages.push({ role, content, engine, t: Date.now() });
    renderMessages();
    appendMessageDOM(role, content, engine);
    scrollToBottom();
  }

  function appendMessageDOM(role, content, engine) {
    const container = $('#usMessages');
    // Remove empty state if it exists
    const empty = $('#usEmpty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = `us-message us-msg-${role}`;
    const isUser = role === 'user';
    const initial = isUser ? 'Y' : 'Z';
    // Use active clone label as the AI name, fallback to 'Zoe'
    const cloneName = (window.CloneState && window.CloneState.activeLabel) ? window.CloneState.activeLabel() : 'Zoe';
    const name = isUser ? 'You' : cloneName;
    const engineTag = engine && !isUser ? `<span class="us-msg-engine">${escapeHtml(engine)}</span>` : '';
    const actions = isUser ? '' : `
      <div class="us-msg-actions">
        <button class="us-msg-action" data-action="copy">📋 Copy</button>
        <button class="us-msg-action" data-action="regenerate">🔄 Regenerate</button>
        <button class="us-msg-action primary" data-action="save">💾 Save to folder</button>
      </div>
    `;
    // Phase 3: AI messages render as markdown. User messages stay plain text (no MD).
    const bodyHtml = isUser ? escapeHtml(content) : renderMarkdown(content);
    div.innerHTML = `
      <div class="us-msg-avatar">${initial}</div>
      <div class="us-msg-body">
        <div class="us-msg-head">
          <span class="us-msg-name">${name}</span>
          ${engineTag}
        </div>
        <div class="us-msg-content">${bodyHtml}</div>
        ${actions}
      </div>
    `;
    container.appendChild(div);
  }

  function appendTypingDOM() {
    const container = $('#usMessages');
    const empty = $('#usEmpty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'us-message us-msg-ai us-typing-msg';
    div.innerHTML = `
      <div class="us-msg-avatar">Z</div>
      <div class="us-msg-body">
        <div class="us-msg-head"><span class="us-msg-name">Zoe</span></div>
        <div class="us-msg-content"><div class="us-typing"><span></span><span></span><span></span></div></div>
      </div>
    `;
    container.appendChild(div);
    scrollToBottom();
  }

  // Phase 3: append a streaming message placeholder. Returns refs so the engine
  // callback can update the content as chunks arrive.
  function appendStreamingMessage(engineName) {
    const container = $('#usMessages');
    const empty = $('#usEmpty');
    if (empty) empty.remove();
    const root = document.createElement('div');
    root.className = 'us-message us-msg-ai us-streaming-msg';
    root.innerHTML = `
      <div class="us-msg-avatar">Z</div>
      <div class="us-msg-body">
        <div class="us-msg-head">
          <span class="us-msg-name">Zoe</span>
          <span class="us-msg-engine">${escapeHtml(engineName)} · streaming…</span>
        </div>
        <div class="us-msg-content"><span class="us-stream-cursor"></span></div>
      </div>
    `;
    container.appendChild(root);
    scrollToBottom();
    return { root, contentEl: root.querySelector('.us-msg-content') };
  }

  function removeTypingDOM() {
    const t = $('.us-typing-msg');
    if (t) t.remove();
  }

  function scrollToBottom() {
    const container = $('#usMessages');
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
  }

  // ============== SEND MESSAGE ==============
  async function sendMessage(text) {
    if (STATE.busy) return;
    const input = $('#usInput');
    const raw = (text || input.value).trim();
    if (!raw) return;

    const userText = raw;
    input.value = '';
    input.style.height = 'auto';

    // Detect mode: forced image mode, forced text mode, or auto
    let mode;
    if (STATE.mode === 'image') mode = 'image';
    else if (STATE.mode === 'text') mode = 'text';
    else mode = detectIntent(userText);

    addMessage('user', userText);
    STATE.busy = true;
    updateSendButton();

    // Phase 3 hardening: wrap the whole call so STATE.busy always resets,
    // even if a streaming hangs or some unanticipated error escapes.
    try {
      if (mode === 'image') {
        await generateImageFromPrompt(userText);
      } else {
        const enhanced = STATE.enhance ? enhancePrompt(userText) : userText;
        // Build system prompt: use active clone's DNA if available, else Zoe's default
        let sysPrompt = DNA_WRITING.getPrompt(STATE.tone);
        // Splice in active persona overlay (Mavis by default)
        if (window.PersonaState && window.PersonaState.activePrompt) {
          const personaText = window.PersonaState.activePrompt();
          if (personaText) sysPrompt = sysPrompt + '\n\n' + personaText;
        }

        // Phase 3: build multi-turn context from STATE.messages, excluding image turns.
        const history = STATE.messages
          .filter(m => m.role === 'user' || m.role === 'ai')
          .slice(-MAX_HISTORY - 1) // -1 to leave room for the turn we just added
          .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

        const enginesToTry = STATE.defaultEngine === 'auto'
          ? ENGINE_ORDER
          : [STATE.defaultEngine, ...ENGINE_ORDER.filter(e => e !== STATE.defaultEngine)];

        let response = '';
        let engineUsed = null;
        let lastError = null;

        // Show the typing indicator immediately so the user gets feedback even
        // if the AI call is slow. The streaming path replaces it with the
        // streaming element when chunks start arriving; the non-streaming
        // path keeps it until the full reply is back.
        appendTypingDOM();
        const typingEl = document.querySelector('.us-typing-msg');

        for (const engineId of enginesToTry) {
          const engine = ENGINES[engineId];
          // Workers AI needs Account ID + Token (not just a single key).
          if (engineId === 'workersai') {
            if (!STATE.cfAccountId || !STATE.cfToken) continue;
          } else if (engine.needsKey && !STATE.keys[engineId]) {
            // Phase 4: also allow the engine if the Cloudflare Worker proxy
            // has the matching secret configured (server-side key).
            const proxyLive = PROXY_STATUS?.proxyLive
              && PROXY_STATUS.engines?.[engineId] === 'live';
            if (!proxyLive) continue;
          }
          try {
            updateEngineStatus(`Calling ${engine.name}...`);
            // Phase 3: streaming path for Pollinations (no key required).
            if (engine.supportsStream) {
              // Remove the typing indicator before streaming begins.
              if (typingEl) typingEl.remove();
              const streamEl = appendStreamingMessage(engine.name);
              try {
                response = await engine.call(
                  getEngineCreds(engineId),
                  history,
                  sysPrompt,
                  (chunk, full) => {
                    streamEl.contentEl.innerHTML = renderMarkdown(full);
                    scrollToBottom();
                  }
                );
                streamEl.root.remove();
                if (response && response.trim()) {
                  engineUsed = engine.name;
                  ENGINE_TRUST.add(engineId);
                  break;
                }
              } catch (streamErr) {
                // Clean up the streaming element, fall through to next engine
                // (or template fallback) so the user is never left hanging.
                streamEl.root.remove();
                lastError = streamErr.message;
                updateEngineStatus(`Stream failed, falling back...`);
                // Try this engine again in non-streaming mode
                try {
                  appendTypingDOM();
                  response = await engine.call(getEngineCreds(engineId), history, sysPrompt);
                  removeTypingDOM();
                  if (response && response.trim()) {
                    engineUsed = engine.name + ' (non-stream)';
                    ENGINE_TRUST.add(engineId);
                    break;
                  }
                } catch (fallbackErr) {
                  removeTypingDOM();
                  lastError = fallbackErr.message;
                }
              }
            } else {
              response = await engine.call(getEngineCreds(engineId), history, sysPrompt);
              if (response && response.trim()) {
                engineUsed = engine.name;
                ENGINE_TRUST.add(engineId);
                break;
              }
            }
          } catch (e) {
            console.log(`${engineId} failed:`, e.message);
            lastError = e.message;
            updateEngineStatus(`${engine.name} failed: ${e.message.slice(0, 60)}`);
          }
        }

        removeTypingDOM();

        if (!response) {
          const tpl = templateFallback(userText);
          if (tpl) {
            response = tpl;
            engineUsed = 'Template';
            if (!STATE.keys.mistral && !STATE.keys.groq) {
              response += `\n\n*(Add an API key in ⚙️ to unlock real AI responses)*`;
            }
          } else {
            response = `Sorry, I couldn't reach any AI engine. ${lastError ? 'Error: ' + lastError : 'Add at least one API key in ⚙️.'}`;
            engineUsed = 'Error';
          }
        }

        addMessage('ai', response, engineUsed);
        updateEngineStatus('Ready');
      }
    } catch (fatalErr) {
      // Last-resort safety net: never leave STATE.busy stuck.
      console.error('sendMessage fatal error:', fatalErr);
      removeTypingDOM();
      const streamEl = document.querySelector('.us-streaming-msg');
      if (streamEl) streamEl.remove();
      addMessage('ai', `Something went wrong on my end: ${fatalErr.message || fatalErr}. Try again?`, 'Error');
      updateEngineStatus('Error');
    } finally {
      STATE.busy = false;
      updateSendButton();
    }
  }

  // ============== IMAGE GENERATION ==============
  async function generateImageFromPrompt(userText) {
    const style = getActivePill('#usStylePills') || 'cinematic';
    const ratio = getActivePill('#usRatioPills') || '1:1';

    // Build enhanced prompt using Image DNA
    let enhanced = userText;
    if (STATE.enhance) {
      enhanced = enhancePrompt(userText);
    }
    const finalPrompt = DNA_IMAGE.expand(enhanced, style, ratio);

    // Show loading image in chat
    const loadingMsg = appendImageLoading(userText);

    const enginesToTry = ['pollinations', 'huggingface', 'procedural'];
    let result = null;
    let engineUsed = null;
    let lastError = null;

    for (const engineId of enginesToTry) {
      const engine = IMAGE_ENGINES[engineId];
      if (engine.needsKey && !STATE.keys.huggingface) continue;
      try {
        updateEngineStatus(`Generating image via ${engine.name}...`);
        result = await engine.call(engine.needsKey ? STATE.keys.huggingface : null, finalPrompt, style, ratio);
        engineUsed = engine.name;
        break;
      } catch (e) {
        console.log(`Image engine ${engineId} failed:`, e.message);
        lastError = e.message;
      }
    }

    // Remove loading
    if (loadingMsg) loadingMsg.remove();

    if (result && result.url) {
      const imgMsg = appendImageMessage(result.url, finalPrompt, style, ratio, engineUsed, userText);
      // Auto-save to output folder
      saveToFolder({
        type: 'image',
        title: userText.slice(0, 60),
        preview: `${style} · ${ratio}`,
        content: result.url,
        engine: engineUsed,
        prompt: userText,
        enhancedPrompt: finalPrompt,
        style, ratio
      });
      updateEngineStatus(`Image generated via ${engineUsed}`);
    } else {
      addMessage('ai', `Sorry, couldn't generate image. ${lastError || 'All engines failed.'}`, 'Error');
      updateEngineStatus('Image generation failed');
    }
  }

  function appendImageLoading(userText) {
    const container = $('#usMessages');
    const empty = $('#usEmpty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'us-message us-msg-ai';
    div.innerHTML = `
      <div class="us-msg-avatar">Z</div>
      <div class="us-msg-body">
        <div class="us-msg-head">
          <span class="us-msg-name">Zoe</span>
          <span class="us-msg-engine">Generating...</span>
        </div>
        <div class="us-msg-image-loading">
          <div class="us-spinner"></div>
          <div>Creating "${escapeHtml(userText.slice(0, 60))}${userText.length > 60 ? '...' : ''}"</div>
        </div>
      </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function appendImageMessage(url, prompt, style, ratio, engine, originalPrompt) {
    const container = $('#usMessages');
    const empty = $('#usEmpty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'us-message us-msg-ai';
    div.innerHTML = `
      <div class="us-msg-avatar">Z</div>
      <div class="us-msg-body">
        <div class="us-msg-head">
          <span class="us-msg-name">Zoe</span>
          <span class="us-msg-engine">${escapeHtml(engine || 'Image')} · ${escapeHtml(style)} · ${escapeHtml(ratio)}</span>
        </div>
        <div class="us-msg-image" data-image-url="${escapeHtml(url)}" data-image-prompt="${escapeHtml(prompt)}" data-image-engine="${escapeHtml(engine)}" data-image-style="${escapeHtml(style)}" data-image-ratio="${escapeHtml(ratio)}">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(originalPrompt)}" loading="lazy" />
          <div class="us-msg-image-meta">${escapeHtml(style)} · ${escapeHtml(ratio)} · click to view full</div>
        </div>
        <div class="us-msg-actions">
          <button class="us-msg-action" data-image-action="view">👁️ View full</button>
          <button class="us-msg-action" data-image-action="download">⬇️ Download</button>
          <button class="us-msg-action" data-image-action="regenerate">🔄 Regenerate</button>
        </div>
      </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function updateEngineStatus(text) {
    const el = $('#usEngineStatus');
    if (el) el.textContent = text;
  }

  function updateSendButton() {
    const btn = $('#usSendBtn');
    if (btn) btn.disabled = STATE.busy;
  }

  // ============== OUTPUT FOLDER ==============
  function saveToFolder(opts) {
    // Backwards compat: saveToFolder(content, engine) for text
    let output;
    if (typeof opts === 'string') {
      output = {
        id: 'o' + Date.now() + Math.random().toString(36).slice(2, 6),
        type: 'text',
        title: opts.slice(0, 60).replace(/\n/g, ' ').trim() + (opts.length > 60 ? '...' : ''),
        preview: opts.slice(0, 120).replace(/\n/g, ' '),
        content: opts,
        engine: arguments[1] || 'Unknown',
        t: Date.now()
      };
    } else {
      output = {
        id: 'o' + Date.now() + Math.random().toString(36).slice(2, 6),
        type: opts.type || 'text',
        title: opts.title || '',
        preview: opts.preview || '',
        content: opts.content || '',
        engine: opts.engine || 'Unknown',
        prompt: opts.prompt,
        enhancedPrompt: opts.enhancedPrompt,
        style: opts.style,
        ratio: opts.ratio,
        t: Date.now()
      };
    }
    STATE.outputs.unshift(output);
    if (STATE.outputs.length > 100) STATE.outputs.pop();
    saveState();
    renderFolder();
    if (!STATE._suppressToast) toast(`Saved ${output.type} to Output Folder`, 'success');
  }

  function renderFolder() {
    const list = $('#usFolderList');
    if (!list) return;
    // Phase 5: Files tab is owned by editor.js — delegate.
    if (STATE.folderFilter === 'files') {
      if (window.UsEditor?.renderFilesTab) {
        window.UsEditor.renderFilesTab(list);
        return;
      }
    }
    const search = ($('#usFolderSearch')?.value || '').toLowerCase();
    const filterType = STATE.folderFilter || 'all';
    let filtered = STATE.outputs.filter(o => {
      const matchesType = filterType === 'all' || o.type === filterType;
      const matchesSearch = !search
        || (o.title || '').toLowerCase().includes(search)
        || (o.content || '').toString().toLowerCase().includes(search);
      return matchesType && matchesSearch;
    });
    if (filtered.length === 0) {
      list.innerHTML = `<div class="us-folder-empty">${STATE.outputs.length === 0 ? 'No saved outputs yet. Click 💾 on any AI response to save it here.' : 'No matches.'}</div>`;
      return;
    }
    list.innerHTML = filtered.map(o => {
      if (o.type === 'image') {
        return `
          <div class="us-folder-item us-item-image" data-id="${o.id}">
            <img class="us-folder-item-thumb" src="${escapeHtml(o.content)}" alt="${escapeHtml(o.title)}" loading="lazy" />
            <div class="us-folder-item-body">
              <div class="us-folder-item-title">${escapeHtml(o.title)}</div>
              <div class="us-folder-item-preview">${escapeHtml(o.preview)}</div>
              <div class="us-folder-item-meta">
                <span>${escapeHtml(o.engine)} · ${timeAgo(o.t)}</span>
                <button class="us-folder-item-delete" data-delete="${o.id}" title="Delete">✕</button>
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="us-folder-item" data-id="${o.id}">
            <div class="us-folder-item-body" style="padding: 10px 12px;">
              <div class="us-folder-item-title">${escapeHtml(o.title)}</div>
              <div class="us-folder-item-preview">${escapeHtml(o.preview)}</div>
              <div class="us-folder-item-meta">
                <span>${escapeHtml(o.engine)} · ${timeAgo(o.t)}</span>
                <button class="us-folder-item-delete" data-delete="${o.id}" title="Delete">✕</button>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  function openOutput(id) {
    const o = STATE.outputs.find(x => x.id === id);
    if (!o) return;
    if (o.type === 'image') {
      $('#usImageTitle').textContent = `${o.engine} · ${o.style || ''} ${o.ratio || ''} · ${new Date(o.t).toLocaleString()}`;
      $('#usImageView').innerHTML = `<img src="${escapeHtml(o.content)}" alt="${escapeHtml(o.title)}" />`;
      $('#usImageMeta').innerHTML = `<strong>Prompt:</strong> ${escapeHtml(o.prompt || '')}<br>${o.enhancedPrompt && o.enhancedPrompt !== o.prompt ? `<strong>Enhanced:</strong> ${escapeHtml(o.enhancedPrompt)}<br>` : ''}<strong>Engine:</strong> ${escapeHtml(o.engine)}<br><strong>Style:</strong> ${escapeHtml(o.style || '')} · <strong>Ratio:</strong> ${escapeHtml(o.ratio || '')}`;
      $('#usImageModal').classList.add('open');
    } else {
      $('#usOutputTitle').textContent = o.engine + ' · ' + new Date(o.t).toLocaleString();
      $('#usOutputContent').textContent = o.content;
      $('#usImageModal').classList.remove('open');
      // Phase 3: render text outputs as markdown, not pre-wrapped escaped text.
      $('#usImageView').innerHTML = `<div class="us-output-text" style="font-size:13.5px;line-height:1.6;text-align:left">${renderMarkdown(o.content)}</div>`;
      $('#usImageMeta').innerHTML = `<strong>Engine:</strong> ${escapeHtml(o.engine)}`;
      $('#usImageTitle').textContent = o.engine + ' · ' + new Date(o.t).toLocaleString();
      $('#usImageModal').classList.add('open');
    }
  }

  function deleteOutput(id) {
    STATE.outputs = STATE.outputs.filter(o => o.id !== id);
    saveState();
    renderFolder();
  }

  // ============== SETTINGS (Phase 4 — server-side keys) ==============
  // Phase 4: API keys now live as Cloudflare Secrets, not in the browser.
  // The Settings modal shows live engine status by asking the Worker which
  // secrets are configured. If the Worker isn't deployed yet (pre-Phase 4),
  // we fall back to Pollinations-only mode silently.
  let PROXY_STATUS = null; // { engines: {gemini:'live'|'missing', ...}, proxyLive: bool }

  async function fetchProxyStatus() {
    try {
      const res = await fetch('/api/proxy/status', { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      PROXY_STATUS = await res.json();
      return PROXY_STATUS;
    } catch (_) {
      PROXY_STATUS = { proxyLive: false, engines: {} };
      return PROXY_STATUS;
    }
  }

  function setStatusEl(engineId, text, kind) {
    const el = $('#usStatus' + engineId.charAt(0).toUpperCase() + engineId.slice(1));
    if (!el) return;
    el.textContent = text;
    el.className = 'us-status' + (kind ? ' us-status-' + kind : '');
  }

  function renderEngineStatuses() {
    const list = ['gemini', 'groq', 'deepseek', 'mistral', 'huggingface'];
    if (!PROXY_STATUS) {
      list.forEach(id => setStatusEl(id, '⏳ worker not deployed (Phase 4)', 'muted'));
      return;
    }
    if (!PROXY_STATUS.proxyLive) {
      list.forEach(id => setStatusEl(id, '⏳ worker not deployed (Phase 4)', 'muted'));
      return;
    }
    list.forEach(id => {
      const live = PROXY_STATUS.engines?.[id] === 'live';
      setStatusEl(id, live ? '✓ ready' : '✗ secret not set', live ? 'ok' : 'muted');
    });
  }

  function openSettings() {
    $('#usDefaultEngine').value = STATE.defaultEngine;
    if ($('#usPuterModel')) $('#usPuterModel').value = STATE.puterModel || 'gpt-5-mini';
    if ($('#usWorkersaiModel')) $('#usWorkersaiModel').value = STATE.workersaiModel || '@cf/meta/llama-3.2-3b-instruct';
    if ($('#usCfAccountId')) $('#usCfAccountId').value = STATE.cfAccountId || '';
    if ($('#usCfToken')) $('#usCfToken').value = STATE.cfToken || '';
    renderEngineStatuses();
    // Refresh status in the background each time the modal opens.
    fetchProxyStatus().then(renderEngineStatuses);
    $('#usSettingsModal').classList.add('open');
  }

  function closeSettings() {
    $('#usSettingsModal').classList.remove('open');
  }

  function saveSettings() {
    // Phase 4: keys are server-side; we only save the user's preferences.
    STATE.defaultEngine = $('#usDefaultEngine').value;
    if ($('#usPuterModel')) STATE.puterModel = $('#usPuterModel').value;
    if ($('#usWorkersaiModel')) STATE.workersaiModel = $('#usWorkersaiModel').value;
    if ($('#usCfAccountId')) STATE.cfAccountId = $('#usCfAccountId').value.trim();
    if ($('#usCfToken')) STATE.cfToken = $('#usCfToken').value.trim();
    saveState();
    toast('Settings saved', 'success');
    updateEngineStatus();
  }

  async function testWorkersai() {
    const accountId = $('#usCfAccountId').value.trim();
    const token = $('#usCfToken').value.trim();
    const statusEl = $('#usStatusWorkersai');
    if (!accountId || !token) {
      if (statusEl) { statusEl.textContent = '⚠ Enter Account ID + token'; statusEl.className = 'us-status us-status-error'; }
      return;
    }
    if (statusEl) { statusEl.textContent = 'Testing...'; statusEl.className = 'us-status'; }
    try {
      const ok = await ENGINES.workersai.test({ accountId, token });
      if (statusEl) {
        statusEl.textContent = ok ? '✓ Connected' : '✗ Failed';
        statusEl.className = 'us-status ' + (ok ? 'us-status-ok' : 'us-status-error');
      }
    } catch (e) {
      if (statusEl) { statusEl.textContent = '✗ ' + e.message.slice(0, 50); statusEl.className = 'us-status us-status-error'; }
    }
  }

  async function refreshKeys() {
    const all = ['gemini', 'groq', 'deepseek', 'mistral', 'huggingface'];
    all.forEach(id => setStatusEl(id, '⏳ checking…', ''));
    await fetchProxyStatus();
    renderEngineStatuses();
    if (PROXY_STATUS?.proxyLive) {
      toast('Engine status refreshed', 'success');
    } else {
      toast('Worker not deployed yet (Phase 4)', 'muted');
    }
  }

  // ============== PERSISTENCE ==============
  function saveState() {
    try {
      localStorage.setItem('us-state', JSON.stringify({
        keys: STATE.keys,
        defaultEngine: STATE.defaultEngine,
        tone: STATE.tone,
        enhance: STATE.enhance,
        puterModel: STATE.puterModel,
        workersaiModel: STATE.workersaiModel,
        cfAccountId: STATE.cfAccountId,
        cfToken: STATE.cfToken,
        mode: STATE.mode,
        folderFilter: STATE.folderFilter,
        outputs: STATE.outputs.slice(0, 30), // cap storage — images are big
        messages: STATE.messages.slice(-20)
      }));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('us-state');
      if (!raw) return;
      const loaded = JSON.parse(raw);
      Object.assign(STATE, loaded);
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  // ============== UTILS ==============
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function timeAgo(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  let toastTimer;
  function toast(msg, type) {
    const t = $('#usToast');
    t.textContent = msg;
    t.className = 'us-toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'us-toast'; }, 2500);
  }

  // ============== EVENT DELEGATION ==============
  function initEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target;

      // Settings button
      if (t.closest('#usSettingsBtn')) { openSettings(); return; }
      // Close settings
      if (t.closest('#usCloseSettings') || t.closest('#usCancelSettings')) { closeSettings(); return; }
      // Save settings
      if (t.closest('#usSaveSettings')) { saveSettings(); return; }
      if (t.closest('#usRefreshKeys')) { refreshKeys(); return; }
      if (t.closest('#usTestWorkersai')) { testWorkersai(); return; }
      // Close image modal
      if (t.closest('#usCloseImage')) { $('#usImageModal').classList.remove('open'); return; }
      // Click outside modal (backdrop)
      if (t.classList && t.classList.contains('us-modal')) {
        t.classList.remove('open');
        return;
      }

      // Send button
      if (t.closest('#usSendBtn')) { sendMessage(); return; }

      // Empty state prompt
      const promptBtn = t.closest('.us-prompt');
      if (promptBtn) {
        const text = promptBtn.dataset.prompt;
        $('#usInput').value = text;
        sendMessage();
        return;
      }

      // Image toggle (force image mode)
      if (t.closest('#usImageToggle')) {
        const cur = STATE.mode || 'auto';
        const next = cur === 'image' ? 'auto' : 'image';
        STATE.mode = next;
        const btn = $('#usImageToggle');
        btn.dataset.mode = next;
        if (next === 'image') {
          $('#usImageOptions').classList.add('show');
          toast('Image mode FORCED ON', 'success');
        } else {
          $('#usImageOptions').classList.remove('show');
          toast('Image mode → auto-detect');
        }
        return;
      }

      // Style pill
      const stylePill = t.closest('#usStylePills .us-pill');
      if (stylePill) {
        $$('#usStylePills .us-pill').forEach(p => p.classList.remove('active'));
        stylePill.classList.add('active');
        return;
      }
      // Ratio pill
      const ratioPill = t.closest('#usRatioPills .us-pill');
      if (ratioPill) {
        $$('#usRatioPills .us-pill').forEach(p => p.classList.remove('active'));
        ratioPill.classList.add('active');
        return;
      }
      // Folder tab
      const folderTab = t.closest('.us-folder-tab');
      if (folderTab) {
        STATE.folderFilter = folderTab.dataset.filter;
        $$('.us-folder-tab').forEach(x => x.classList.toggle('active', x === folderTab));
        renderFolder();
        return;
      }

      // Image in chat — click to view full
      const imgContainer = t.closest('.us-msg-image');
      if (imgContainer && t.tagName === 'IMG') {
        const url = imgContainer.dataset.imageUrl;
        const prompt = imgContainer.dataset.imagePrompt;
        const engine = imgContainer.dataset.imageEngine;
        const style = imgContainer.dataset.imageStyle;
        const ratio = imgContainer.dataset.imageRatio;
        $('#usImageTitle').textContent = `${engine} · ${style} · ${ratio}`;
        $('#usImageView').innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(prompt)}" />`;
        $('#usImageMeta').innerHTML = `<strong>Prompt:</strong> ${escapeHtml(prompt)}`;
        $('#usImageModal').classList.add('open');
        return;
      }

      // Image action buttons (view/download/regenerate)
      const imgAction = t.closest('[data-image-action]');
      if (imgAction) {
        const action = imgAction.dataset.imageAction;
        const container = imgAction.closest('.us-message');
        const imgCont = container?.querySelector('.us-msg-image');
        if (!imgCont) return;
        const url = imgCont.dataset.imageUrl;
        const prompt = imgCont.dataset.imagePrompt;
        if (action === 'view') {
          $('#usImageTitle').textContent = imgCont.dataset.imageEngine + ' · ' + prompt.slice(0, 40);
          $('#usImageView').innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(prompt)}" />`;
          $('#usImageMeta').innerHTML = `<strong>Prompt:</strong> ${escapeHtml(prompt)}`;
          $('#usImageModal').classList.add('open');
        } else if (action === 'download') {
          const a = document.createElement('a');
          a.href = url;
          a.download = `unicorn-sparkles-${Date.now()}.png`;
          a.click();
          toast('Downloaded', 'success');
        } else if (action === 'regenerate') {
          container.remove();
          // Find original prompt (the message before this image)
          STATE.busy = false;
          sendMessage(prompt);
        }
        return;
      }

      // Message text action (copy/regenerate/save)
      const actionBtn = t.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const msgEl = actionBtn.closest('.us-message');
        const idx = STATE.messages.length - 1 - Array.from($$('.us-message')).reverse().indexOf(msgEl);
        const msg = STATE.messages[idx];
        if (!msg) return;
        if (action === 'copy') {
          navigator.clipboard.writeText(msg.content).then(() => toast('Copied to clipboard', 'success'));
        } else if (action === 'regenerate') {
          const userIdx = STATE.messages.slice(0, idx).reverse().findIndex(m => m.role === 'user');
          if (userIdx >= 0) {
            const userMsg = STATE.messages[idx - 1 - userIdx];
            STATE.messages.splice(idx, 1);
            renderMessages();
            $$('.us-message').forEach(el => el.remove());
            STATE.messages.forEach(m => appendMessageDOM(m.role, m.content, m.engine));
            sendMessage(userMsg.content);
          }
        } else if (action === 'save') {
          saveToFolder(msg.content, msg.engine);
        }
        return;
      }

      // Folder item
      const folderItem = t.closest('.us-folder-item');
      if (folderItem && !t.closest('[data-delete]')) {
        openOutput(folderItem.dataset.id);
        return;
      }
      // Folder delete
      const deleteBtn = t.closest('[data-delete]');
      if (deleteBtn) {
        e.stopPropagation();
        deleteOutput(deleteBtn.dataset.delete);
        return;
      }

      // Clear folder
      if (t.closest('#usClearFolder')) {
        if (STATE.outputs.length === 0) return;
        if (confirm('Clear all saved outputs?')) {
          STATE.outputs = [];
          saveState();
          renderFolder();
        }
        return;
      }
    });

    // Send on Enter (Shift+Enter for newline)
    $('#usInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea + show image options if image toggle is active
    $('#usInput').addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
      // Auto-show image options if intent is detected
      if (!STATE.mode || STATE.mode === 'auto') {
        const intent = detectIntent(e.target.value);
        if (intent === 'image') {
          $('#usImageOptions').classList.add('show');
        } else {
          $('#usImageOptions').classList.remove('show');
        }
      }
    });

    // Enhance toggle
    $('#usEnhanceBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      STATE.enhance = !STATE.enhance;
      $('#usEnhanceBtn').dataset.active = STATE.enhance;
      toast(STATE.enhance ? 'Prompt enhancer ON' : 'Prompt enhancer OFF');
      saveState();
    });

    // Tone select
    $('#usToneSelect').addEventListener('change', (e) => {
      STATE.tone = e.target.value;
      saveState();
    });

    // Folder search
    $('#usFolderSearch').addEventListener('input', () => renderFolder());

    // Esc to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.us-modal.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  function getEngineCreds(engineId) {
    // Phase 4: Workers AI uses a creds object {accountId, token}, not a string key.
    if (engineId === 'workersai') {
      return { accountId: STATE.cfAccountId, token: STATE.cfToken };
    }
    return STATE.keys[engineId];
  }

  // Phase 4: when the Cloudflare Worker proxy is live, route Mistral / Groq /
  // DeepSeek / Gemini through it so the user never has to put keys in localStorage.
  // Returns the response text if the proxy handled it, or null to fall through.
  async function callViaProxy(engineId, messages, sysPrompt) {
    if (!PROXY_STATUS?.proxyLive) return null;
    if (PROXY_STATUS.engines?.[engineId] !== 'live') return null;
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: engineId, messages, sysPrompt })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.text || '';
    } catch (e) {
      // Proxy failed — fall through to direct browser call
      console.log(`Proxy call for ${engineId} failed:`, e.message);
      return null;
    }
  }

  function getActivePill(containerSel) {
    const active = document.querySelector(`${containerSel} .us-pill.active`);
    return active ? active.dataset.style || active.dataset.ratio : null;
  }

  // ============== PHASE 5 BRIDGE ==============
  // Expose a minimal chat bridge for the build agent (build-agent.js).
  // The agent uses these to post messages, drive the typing indicator,
  // update the engine status bar, and fire toasts.
  window.UsChat = {
    postUser: (text) => addMessage('user', text),
    postAI: (text, engine) => {
      // engine param from mergedBotReply is already "CloneLabel · via engineId"
      addMessage('ai', text, engine || 'Zoe');
    },
    setStatus: (text) => updateEngineStatus(text),
    toast,
    addTyping: appendTypingDOM,
    removeTyping: removeTypingDOM,
  };
  // Read-only-ish state export, mostly so other modules can observe.
  window.UsState = STATE;

  // ============== INIT ==============
  function init() {
    loadState();
    // Sync UI to state
    $('#usEnhanceBtn').dataset.active = STATE.enhance;
    $('#usToneSelect').value = STATE.tone;
    const imgBtn = $('#usImageToggle');
    if (imgBtn) imgBtn.dataset.mode = STATE.mode || 'auto';
    if (STATE.mode === 'image') {
      $('#usImageOptions').classList.add('show');
    }
    renderMessages();
    renderFolder();
    initEvents();

    // Phase 4: ask the Worker (if deployed) which engines are live.
    // Show Pollinations-only status until the Worker is in place.
    updateEngineStatus('Zoe is ready · Pollinations + Puter active');
    fetchProxyStatus().then(s => {
      if (s?.proxyLive) {
        const live = Object.values(s.engines || {}).filter(v => v === 'live').length;
        updateEngineStatus(`Zoe is ready · ${live} server-side engines live`);
      }
    });
  }

  // ============== ZOE FEATURES ==============
  // Apply a channel selection to all the relevant UI bits
  // (sidebar items, topbar pill, dropdown menu, chat header, input placeholder,
  //  and image mode). Centralized so both the sidebar and the topbar dropdown
  //  stay in sync.
  function selectChannel(name) {
    name = name || 'general';
    // Sidebar items
    document.querySelectorAll('.zoe-channel').forEach(c => {
      c.classList.toggle('active', (c.dataset.channel || '') === name);
    });
    // Topbar dropdown menu items
    document.querySelectorAll('.zoe-menu-item').forEach(c => {
      c.classList.toggle('active', (c.dataset.channel || '') === name);
    });
    // Topbar pill text
    const pillName = document.getElementById('zoePillName');
    if (pillName) pillName.textContent = name;
    // Chat header
    const channelNameEl = document.getElementById('zoeChatChannelName');
    if (channelNameEl) channelNameEl.textContent = name;
    // Input placeholder
    const inputEl = document.getElementById('usInput');
    if (inputEl) inputEl.placeholder = `Message #${name}`;
    // Image mode behavior
    if (name === 'images') {
      STATE.mode = 'image';
      const imgBtn = document.getElementById('usImageToggle');
      if (imgBtn) imgBtn.dataset.mode = 'image';
      const imgOpts = document.getElementById('usImageOptions');
      if (imgOpts) imgOpts.classList.add('show');
    } else {
      STATE.mode = (name === 'code') ? 'text' : 'auto';
      const imgBtn = document.getElementById('usImageToggle');
      if (imgBtn) imgBtn.dataset.mode = STATE.mode;
      const imgOpts = document.getElementById('usImageOptions');
      if (imgOpts) imgOpts.classList.remove('show');
    }
  }

  function initZoeFeatures() {
    // 1a. Sidebar channel switching (kept in case the sidebar is reopened)
    const channels = document.querySelectorAll('.zoe-channel');
    channels.forEach(ch => {
      ch.addEventListener('click', () => selectChannel(ch.dataset.channel || 'general'));
    });

    // 1b. Topbar channel dropdown (replaces sidebar navigation by default)
    const pill = document.getElementById('zoeChannelPill');
    const menu = document.getElementById('zoeChannelMenu');
    if (pill && menu) {
      const toggleMenu = (force) => {
        const willOpen = (typeof force === 'boolean') ? force : menu.hasAttribute('hidden');
        if (willOpen) {
          menu.removeAttribute('hidden');
          pill.setAttribute('aria-expanded', 'true');
        } else {
          menu.setAttribute('hidden', '');
          pill.setAttribute('aria-expanded', 'false');
        }
      };
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
      });
      menu.querySelectorAll('.zoe-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selectChannel(item.dataset.channel || 'general');
          toggleMenu(false);
        });
      });
      // Click-away to close
      document.addEventListener('click', () => toggleMenu(false));
      // Esc to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleMenu(false);
      });
    }

    // 1c. Sidebar toggle (☰ in the topbar)
    const sidebarToggle = document.getElementById('zoeSidebarToggle');
    const layout = document.getElementById('usLayout');
    if (sidebarToggle && layout) {
      sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = layout.getAttribute('data-sidebar') || 'hidden';
        layout.setAttribute('data-sidebar', current === 'hidden' ? 'visible' : 'hidden');
      });
    }

    // 1d. Prompt chips (fused into the chat bar)
    document.querySelectorAll('.us-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.prompt || chip.textContent.trim();
        const input = document.getElementById('usInput');
        if (input) {
          input.value = text;
          input.focus();
          // Auto-resize textarea if helper exists
          if (typeof autoResizeTextarea === 'function') autoResizeTextarea(input);
        }
        if (typeof sendMessage === 'function') sendMessage();
      });
    });

    // 2. Upload Button
    const uploadBtn = document.getElementById('zoeUploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*,audio/*,video/*,text/*,.pdf,.doc,.docx';
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            toast(`Uploading ${file.name}...`);
            // Simulate upload/analysis
            setTimeout(() => {
              addMessage('user', `Uploaded file: **${file.name}**`);
              toast(`File ${file.name} ready for analysis.`, 'success');
            }, 1000);
          }
        };
        fileInput.click();
      });
    }

    // 3. Save to Post (Replacing the white box)
    const savePostBtn = document.getElementById('zoeSavePostBtn');
    if (savePostBtn) {
      savePostBtn.addEventListener('click', () => {
        if (STATE.messages.length === 0) {
          toast('Nothing to save yet!', 'error');
          return;
        }
        const transcript = STATE.messages.map(m => `${m.role === 'user' ? 'You' : 'Zoe'}: ${m.content}`).join('\n\n');
        const postBody = document.getElementById('text-body');
        // Find the Composer tab for Text
        const postTab = document.querySelector('.pt-tab[data-type="text"]');
        if (postBody && postTab) {
          postBody.value = transcript;
          postTab.click();
          toast('Transcript saved to Text Post!', 'success');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    initZoeFeatures();
  });
})();
