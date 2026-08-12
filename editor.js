// Phase 5: Files panel + in-app code editor.
// Lets the user open any project file, edit it inline, and apply live changes.
// Lives in the Output Folder sidebar as a "📁 Files" tab.
//
// The modal operates in two modes:
//   view    — manual edit. Buttons: Save / Revert / Close.
//   preview — AI-proposed edit (from build-agent). Buttons: Apply / Skip / Close.
//
// Files tab also offers a snapshot (zip download) and reset.

const FILES = window.UsFiles;
const LIVE_CSS = window.UsLiveCss;
const LIVE_JS = window.UsLiveJs;
const BUILD = () => window.UsBuild || null;

const E = {
  mode: 'view',         // 'view' | 'preview'
  currentPath: null,
  originalText: '',
  dirty: false,
  proposed: null        // { file, find, replace, explanation, raw }
};

// ---------- Mode transitions ----------

async function openFile(path) {
  const text = await FILES.read(path);
  enterViewMode(path, text);
}

function enterViewMode(path, text) {
  E.mode = 'view';
  E.currentPath = path;
  E.originalText = text;
  E.dirty = false;
  E.proposed = null;
  $('#usEditorPath').textContent = path;
  $('#usEditorTextarea').value = text;
  $('#usEditorPreviewMeta').classList.add('hidden');
  $('#usEditorSave').classList.remove('hidden');
  $('#usEditorRevert').classList.remove('hidden');
  $('#usEditorApply').classList.add('hidden');
  $('#usEditorSkip').classList.add('hidden');
  $('#usEditorReload').classList.add('hidden');
  $('#usEditorSave').disabled = true;
  $('#usEditorRevert').disabled = (text === '');
  setEditorButtonsState();
  $('#usEditorModal').classList.add('open');
  setTimeout(() => $('#usEditorTextarea').focus(), 50);
}

function enterPreviewMode({ file, find, replace, explanation, raw }) {
  // Show the proposed edit: original file content with the `find` substring
  // highlighted via a diff-like header. User can tweak `replace` in the
  // textarea before clicking Apply.
  E.mode = 'preview';
  E.currentPath = file;
  E.proposed = { find, replace, explanation, raw };
  $('#usEditorPath').textContent = '📝 Proposed edit → ' + file;
  $('#usEditorTextarea').value = replace; // textarea shows proposed `replace` for tweaking
  $('#usEditorTextarea').readOnly = false;
  $('#usEditorPreviewMeta').classList.remove('hidden');
  $('#usEditorPreviewMeta').innerHTML = `
    <div class="us-editor-preview-label">Will replace:</div>
    <pre class="us-editor-find">${escapeHtml(find)}</pre>
    <div class="us-editor-preview-label">With your edit:</div>
  `;
  $('#usEditorSave').classList.add('hidden');
  $('#usEditorRevert').classList.add('hidden');
  $('#usEditorApply').classList.remove('hidden');
  $('#usEditorSkip').classList.remove('hidden');
  $('#usEditorReload').classList.add('hidden');
  $('#usEditorApply').disabled = false;
  $('#usEditorSkip').disabled = false;
  $('#usEditorModal').classList.add('open');
  setTimeout(() => $('#usEditorTextarea').focus(), 50);
}

function closeFile() {
  if (E.mode === 'view' && E.dirty && !confirm('Unsaved changes will be lost. Close anyway?')) return;
  $('#usEditorModal').classList.remove('open');
  E.mode = 'view';
  E.currentPath = null;
  E.originalText = '';
  E.dirty = false;
  E.proposed = null;
}

function setEditorButtonsState() {
  // Helper kept around for hook symmetry; nothing to do right now.
}

// ---------- Save / revert ----------

async function saveCurrent() {
  const path = E.currentPath;
  if (!path) return;
  const text = $('#usEditorTextarea').value;
  await FILES.write(path, text);
  E.dirty = false;
  E.originalText = text;
  $('#usEditorSave').disabled = true;
  $('#usEditorRevert').disabled = false;
  toast('Saved ' + path, 'success');
  await applyLive(path, text);
  rerenderFilesTab();
  if (BUILD()) BUILD().onFileSaved?.(path, text);
}

async function revertCurrent() {
  const path = E.currentPath;
  if (!path) return;
  if (!confirm('Revert "' + path + '" to the shipped version? Local edits are lost.')) return;
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    await FILES.write(path, text);
    E.originalText = text;
    $('#usEditorTextarea').value = text;
    E.dirty = false;
    $('#usEditorSave').disabled = true;
    toast('Reverted ' + path, 'success');
    await applyLive(path, text);
    rerenderFilesTab();
  } catch (e) {
    toast('Revert failed: ' + (e.message || e), 'error');
  }
}

// ---------- Preview Apply / Skip ----------

async function applyPreview() {
  if (E.mode !== 'preview' || !E.proposed) return;
  const { find, file } = E.proposed;
  // The user may have tweaked the replacement in the textarea; honor it.
  const replace = $('#usEditorTextarea').value;
  const content = await FILES.read(file);
  // Find the first occurrence of `find` and replace it.
  const idx = content.indexOf(find);
  if (idx === -1) {
    toast('Find string no longer matches — opening file for manual edit', 'error');
    const text = await FILES.read(file);
    enterViewMode(file, text);
    return;
  }
  const updated = content.slice(0, idx) + replace + content.slice(idx + find.length);
  await FILES.write(file, updated);
  E.currentPath = file;
  E.originalText = updated;
  toast('Applied edit to ' + file, 'success');
  await applyLive(file, updated);
  $('#usEditorModal').classList.remove('open');
  rerenderFilesTab();
  if (BUILD()) BUILD().onPreviewApplied?.({ file, find, replace, explanation: E.proposed.explanation });
  E.mode = 'view';
  E.proposed = null;
}

function skipPreview() {
  if (E.mode !== 'preview' || !E.proposed) return;
  const explanation = E.proposed.explanation || '';
  $('#usEditorModal').classList.remove('open');
  if (BUILD()) BUILD().onPreviewSkipped?.(E.proposed);
  E.mode = 'view';
  E.proposed = null;
}

// ---------- Live apply ----------

async function applyLive(path, content) {
  const name = path.split('/').pop();
  if (name === 'style.css') {
    LIVE_CSS.apply(content);
    toast('CSS applied (no reload needed)', 'success');
    return;
  }
  if (name === 'app.js') {
    showReloadNeeded('app.js changed — reload to apply');
    return;
  }
  if (name === 'index.html') {
    showReloadNeeded('index.html changed — reload to apply');
    return;
  }
  if (['files.js', 'live-css.js', 'live-js.js', 'editor.js', 'build-agent.js'].includes(name)) {
    try {
      await LIVE_JS.rel('./' + name);
      toast(name + ' re-imported (live)', 'success');
      if (name === 'build-agent.js' && BUILD()) BUILD().onReimported?.();
      return;
    } catch (e) {
      showReloadNeeded(name + ' re-import failed — reload to apply');
      return;
    }
  }
  if (path.startsWith('functions/api/proxy/')) {
    showReloadNeeded('Worker code changed — deploy to apply (Cloudflare Pages)');
    return;
  }
  showReloadNeeded(path + ' changed — reload to apply');
}

function showReloadNeeded(msg) {
  const bar = $('#usEditorReload');
  bar.classList.remove('hidden');
  bar.querySelector('.us-editor-reload-msg').textContent = msg;
}

// ---------- Files-tab content render ----------

async function renderFilesTab(rootEl) {
  if (!rootEl) return;
  const files = FILES.SHIPPED_PATHS;
  const rows = await Promise.all(files.map(async (path) => {
    const content = await FILES.read(path);
    const lines = content === '' ? '—' : content.split('\n').length;
    const bytes = content === '' ? 0 : content.length;
    return `
      <div class="us-file-row" data-path="${escapeAttr(path)}">
        <div class="us-file-row-main">
          <div class="us-file-row-path">${escapeHtml(path)}</div>
          <div class="us-file-row-meta">${lines} lines · ${formatBytes(bytes)}</div>
        </div>
        <button class="us-btn us-btn-sm us-edit-file" data-edit-file="${escapeAttr(path)}">Edit</button>
      </div>
    `;
  }));
  rootEl.innerHTML = `
    <div class="us-files-toolbar">
      <button class="us-btn us-btn-sm" id="usFileSnapshot">📦 Snapshot</button>
      <button class="us-btn us-btn-sm" id="usFileResetAll">↻ Reset all</button>
      <button class="us-btn us-btn-sm" id="usFileSeed">↻ Re-seed</button>
    </div>
    <div class="us-files-list">${rows.join('')}</div>
  `;
}

function rerenderFilesTab() {
  const active = document.querySelector('.us-folder-tab.active');
  if (active && active.dataset.filter === 'files') {
    renderFilesTab(document.getElementById('usFolderList'));
  }
}

async function snapshot() {
  if (typeof JSZip === 'undefined') {
    toast('JSZip not loaded — check network', 'error');
    return;
  }
  const zip = new JSZip();
  for (const path of FILES.SHIPPED_PATHS) {
    const text = await FILES.read(path);
    zip.file(path, text == null ? '' : text);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `unicorn-sparkles-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Snapshot downloaded', 'success');
}

async function resetAll() {
  if (!confirm('Reset ALL files to the shipped versions? Local edits are lost.')) return;
  await FILES.resetAll();
  await FILES.seedFromNetwork();
  const css = await FILES.read('style.css');
  LIVE_CSS.apply(css);
  toast('All files reset to shipped versions', 'success');
  rerenderFilesTab();
}

async function reseed() {
  if (!confirm('Re-fetch all files from the network and overwrite local edits?')) return;
  await FILES.resetAll();
  await FILES.seedFromNetwork();
  const css = await FILES.read('style.css');
  LIVE_CSS.apply(css);
  toast('Re-seeded from network', 'success');
  rerenderFilesTab();
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ---------- Toast ----------

let toastTimer;
function toast(msg, type) {
  const t = document.getElementById('usToast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'us-toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'us-toast'; }, 2500);
}

// ---------- Bootstrap ----------

function bootstrap() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    const editBtn = t.closest('[data-edit-file]');
    if (editBtn) { e.stopPropagation(); openFile(editBtn.dataset.editFile); return; }
    if (t.closest('#usFileSnapshot')) { snapshot(); return; }
    if (t.closest('#usFileResetAll')) { resetAll(); return; }
    if (t.closest('#usFileSeed')) { reseed(); return; }
    if (t.closest('#usEditorClose')) { closeFile(); return; }
    if (t.closest('#usEditorCloseFoot')) { closeFile(); return; }
    if (t.closest('#usEditorSave')) { saveCurrent(); return; }
    if (t.closest('#usEditorRevert')) { revertCurrent(); return; }
    if (t.closest('#usEditorApply')) { applyPreview(); return; }
    if (t.closest('#usEditorSkip')) { skipPreview(); return; }
    if (t.closest('#usEditorReloadBtn')) { location.reload(); return; }
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'usEditorTextarea') {
      const ta = e.target;
      // In view mode, dirty tracks against originalText. In preview, never dirty.
      if (E.mode === 'view') {
        E.dirty = ta.value !== E.originalText;
        $('#usEditorSave').disabled = !E.dirty;
      } else {
        // preview: re-enable apply so user can re-submit a tweaked replace
        $('#usEditorApply').disabled = false;
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'usEditorTextarea' && e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (e.key === 'Escape' && document.getElementById('usEditorModal')?.classList.contains('open')) {
      closeFile();
    }
  });

  FILES.seedFromNetwork().then(seeded => {
    if (seeded.length > 0) {
      console.info('[Phase 5] Seeded', seeded.length, 'files into IndexedDB');
    }
    FILES.read('style.css').then(css => {
      if (css) LIVE_CSS.apply(css);
    });
  });
}

window.UsEditor = {
  bootstrap,
  openFile,
  enterPreviewMode,
  saveCurrent,
  revertCurrent,
  snapshot,
  resetAll,
  renderFilesTab,
  rerenderFilesTab,
  applyLive
};
