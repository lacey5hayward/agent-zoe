// Phase 5: Files panel + in-app code editor.
// v2.4.4: Fixed syntax errors and updated filenames for consolidated builder.

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
  if ($('#usEditorPreviewMeta')) $('#usEditorPreviewMeta').classList.add('hidden');
  if ($('#usEditorSave')) $('#usEditorSave').classList.remove('hidden');
  if ($('#usEditorRevert')) $('#usEditorRevert').classList.remove('hidden');
  if ($('#usEditorApply')) $('#usEditorApply').classList.add('hidden');
  if ($('#usEditorDeploy')) $('#usEditorDeploy').style.display = 'none';
  if ($('#usEditorSkip')) $('#usEditorSkip').classList.add('hidden');
  if ($('#usEditorReload')) $('#usEditorReload').classList.add('hidden');
  $('#usEditorSave').disabled = true;
  $('#usEditorRevert').disabled = (text === '');
  setEditorButtonsState();
  $('#usEditorModal').classList.add('open');
  document.body.classList.add('us-editor-open');
  setTimeout(() => $('#usEditorTextarea').focus(), 50);
}

function enterPreviewMode({ file, find, replace, explanation, raw }) {
  E.mode = 'preview';
  E.currentPath = file;
  E.proposed = { find, replace, explanation, raw };
  $('#usEditorPath').textContent = '📝 Proposed edit → ' + file;
  $('#usEditorTextarea').value = replace;
  $('#usEditorTextarea').readOnly = false;
  $('#usEditorPreviewMeta').classList.remove('hidden');
  $('#usEditorPreviewMeta').innerHTML = `
    <div class="us-editor-preview-label">Will replace:</div>
    <pre class="us-editor-find">${escapeHtml(find)}</pre>
    <div class="us-editor-preview-label">With your edit:</div>
  `;
  if ($('#usEditorSave')) $('#usEditorSave').classList.add('hidden');
  if ($('#usEditorRevert')) $('#usEditorRevert').classList.add('hidden');
  if ($('#usEditorApply')) $('#usEditorApply').classList.remove('hidden');
  const deployBtn = $('#usEditorDeploy');
  if (deployBtn) {
    deployBtn.style.display = 'block';
    // v2.8.5 Patch D: Physically move the button to the body to bypass any parent touch-blocking
    document.body.appendChild(deployBtn);
    
    // Remove old listeners to prevent stacking
    const newBtn = deployBtn.cloneNode(true);
    deployBtn.parentNode.replaceChild(newBtn, deployBtn);
    
    // Add multi-event listeners for iPad Safari
    const triggerDeploy = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toast('Deploying to GitHub...', 'success');
      deployToGitHub();
    };
    
    newBtn.addEventListener('click', triggerDeploy);
    newBtn.addEventListener('touchstart', triggerDeploy, { passive: false });
    newBtn.addEventListener('touchend', triggerDeploy, { passive: false });
  }
  if ($('#usEditorSkip')) $('#usEditorSkip').classList.remove('hidden');
  if ($('#usEditorReload')) $('#usEditorReload').classList.add('hidden');
  $('#usEditorApply').disabled = false;
  if (deployBtn) deployBtn.disabled = false;
  $('#usEditorSkip').disabled = false;
  $('#usEditorModal').classList.add('open');
  document.body.classList.add('us-editor-open');
  setTimeout(() => $('#usEditorTextarea').focus(), 50);
}

function closeFile() {
  if (E.mode === 'view' && E.dirty && !confirm('Unsaved changes will be lost. Close anyway?')) return;
  
  // v2.8.5: Put the deploy button back where it belongs when closing
  const deployBtn = $('#usEditorDeploy');
  const foot = $('#usEditorModal .us-modal-foot');
  if (deployBtn && foot) {
    deployBtn.style.display = 'none';
    foot.appendChild(deployBtn);
  }

  $('#usEditorModal').classList.remove('open');
  document.body.classList.remove('us-editor-open');
  E.mode = 'view';
  E.currentPath = null;
  E.originalText = '';
  E.dirty = false;
  E.proposed = null;
}

function setEditorButtonsState() {}

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
  if (BUILD() && BUILD().onFileSaved) BUILD().onFileSaved(path, text);
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
  const replace = $('#usEditorTextarea').value;
  const content = await FILES.read(file);
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
  if (BUILD() && BUILD().onPreviewApplied) BUILD().onPreviewApplied({ file, find, replace, explanation: E.proposed.explanation });
  E.mode = 'view';
  E.proposed = null;
}

async function deployToGitHub() {
  const path = E.currentPath;
  if (!path) return;
  
  let content;
  if (E.mode === 'preview' && E.proposed) {
    const { find } = E.proposed;
    const replace = $('#usEditorTextarea').value;
    const original = await FILES.read(path);
    const idx = original.indexOf(find);
    if (idx === -1) {
      toast('Cannot deploy: Find string no longer matches', 'error');
      return;
    }
    content = original.slice(0, idx) + replace + original.slice(idx + find.length);
  } else {
    content = $('#usEditorTextarea').value;
  }

  const btn = $('#usEditorDeploy');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '🚀 Deploying...';
  
  try {
    const build = BUILD();
    if (!build || !build.deploy) throw new Error('Build agent deploy tool not loaded');
    
    const res = await build.deploy(path, content);
    if (res.success) {
      toast('Successfully deployed to GitHub!', 'success');
      // If we were in preview, close modal and finish the plan
      if (E.mode === 'preview') {
        await applyPreview(); // This will update local files too
      } else {
        E.dirty = false;
        E.originalText = content;
        $('#usEditorSave').disabled = true;
        await applyLive(path, content);
      }
    } else {
      throw new Error(res.error || 'Deployment failed');
    }
  } catch (e) {
    toast('Deploy failed: ' + e.message, 'error');
    console.error('[Deploy]', e);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function skipPreview() {
  if (E.mode !== 'preview' || !E.proposed) return;
  const explanation = E.proposed.explanation || '';
  $('#usEditorModal').classList.remove('open');
  if (BUILD() && BUILD().onPreviewSkipped) BUILD().onPreviewSkipped(E.proposed);
  E.mode = 'view';
  E.proposed = null;
}

// ---------- Live apply ----------

async function applyLive(path, content) {
  const name = path.split('/').pop();
  if (name === 'zoe-style.css') {
    if (LIVE_CSS) LIVE_CSS.apply(content);
    toast('CSS applied (no reload needed)', 'success');
    return;
  }
  if (name === 'zoe-core.js' || name === 'index.html') {
    showReloadNeeded(name + ' changed — reload to apply');
    return;
  }
  if (['zoe-builder.js', 'live-css.js', 'live-js.js', 'editor.js'].includes(name)) {
    try {
      if (LIVE_JS) await LIVE_JS.rel('./' + name);
      toast(name + ' re-imported (live)', 'success');
      if (name === 'zoe-builder.js' && BUILD() && BUILD().onReimported) BUILD().onReimported();
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
  if (bar) {
    bar.classList.remove('hidden');
    const msgEl = bar.querySelector('.us-editor-reload-msg');
    if (msgEl) msgEl.textContent = msg;
  }
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
  a.download = `agent-zoe-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
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
  const css = await FILES.read('zoe-style.css');
  if (LIVE_CSS) LIVE_CSS.apply(css);
  toast('All files reset to shipped versions', 'success');
  rerenderFilesTab();
}

async function reseed() {
  if (!confirm('Re-fetch all files from the network and overwrite local edits?')) return;
  await FILES.resetAll();
  await FILES.seedFromNetwork();
  const css = await FILES.read('zoe-style.css');
  if (LIVE_CSS) LIVE_CSS.apply(css);
  toast('Re-seeded from network', 'success');
  rerenderFilesTab();
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
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
    if (t.closest('#usEditorDeploy')) { deployToGitHub(); return; }
    if (t.closest('#usEditorSkip')) { skipPreview(); return; }
    if (t.closest('#usEditorReloadBtn')) { location.reload(); return; }
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'usEditorTextarea') {
      const ta = e.target;
      if (E.mode === 'view') {
        E.dirty = ta.value !== E.originalText;
        const saveBtn = $('#usEditorSave');
        if (saveBtn) saveBtn.disabled = !E.dirty;
      } else {
        const applyBtn = $('#usEditorApply');
        if (applyBtn) applyBtn.disabled = false;
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
    const modal = document.getElementById("usEditorModal");
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
      closeFile();
    }
  });

  if (FILES) {
    FILES.seedFromNetwork().then(seeded => {
      if (seeded.length > 0) {
        console.info('[Phase 5] Seeded', seeded.length, 'files into IndexedDB');
      }
      FILES.read('zoe-style.css').then(css => {
        if (css && LIVE_CSS) LIVE_CSS.apply(css);
      });
    });
  }
}

// Global helper for simple selection
function $(sel) { return document.querySelector(sel); }

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
