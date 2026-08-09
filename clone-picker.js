/* ============================================================================
 * clone-picker.js — Settings-modal injection for the clone picker
 * ----------------------------------------------------------------------------
 * Unicorn's Settings modal (#usSettingsModal) is hardcoded in
 * unicorn-sparkles/index.html. We don't fork that file — we wait for the
 * modal to mount and inject our clone picker into the form area, just
 * above the existing "Default text engine" selector.
 *
 * Behavior:
 *   - On mount, populates a <select id="usCloneSelect"> from window.CLONES.
 *   - Pre-selects the user's saved clone (CloneState.getActive()).
 *   - On change, calls CloneState.setActive(id) and shows a toast.
 *   - Shows a hint line with description + engine chain + DNA profile key
 *     so the user can see what each clone does.
 *
 * The injection is idempotent — if called twice, it no-ops.
 * ============================================================================ */

(function injectClonePicker() {
  function makeTextNode(text) {
    return document.createTextNode(text);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function tryInject(attempt) {
    attempt = attempt || 0;
    if (attempt > 40) return; // give up after ~4s

    // Wait for both the Unicorn modal AND the registry globals.
    if (!document.getElementById('usDefaultEngine')) {
      setTimeout(() => tryInject(attempt + 1), 100);
      return;
    }
    if (!window.CLONES || !window.CloneState || !window.DNA_PROFILES) {
      setTimeout(() => tryInject(attempt + 1), 100);
      return;
    }

    // Idempotency: don't re-inject if already there.
    if (document.getElementById('usCloneSelect')) return;

    const active = window.CloneState.getActive();
    const target = document.getElementById('usDefaultEngine');

    // Build the picker group using createElement so we can attach event
    // listeners to real DOM nodes. (innerHTML strings aren't queryable
    // until parsed, and we want to attach listeners immediately.)
    const group = document.createElement('div');
    group.className = 'us-form-group us-clone-picker-group';

    const label = document.createElement('label');
    label.appendChild(makeTextNode('Conversation style (clone) '));
    const labelHint = document.createElement('span');
    labelHint.style.fontWeight = '400';
    labelHint.style.color = 'var(--us-text-muted)';
    labelHint.appendChild(makeTextNode('— DNA profile + free-tier engine chain'));
    label.appendChild(labelHint);
    group.appendChild(label);

    const picker = document.createElement('select');
    picker.id = 'usCloneSelect';
    for (const c of window.CLONES) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.appendChild(makeTextNode(c.label));
      if (c.id === active.id) opt.selected = true;
      picker.appendChild(opt);
    }
    group.appendChild(picker);

    const hint = document.createElement('p');
    hint.className = 'us-clone-hint';
    hint.id = 'usCloneHint';
    group.appendChild(hint);

    // Insert just before the "Default text engine" group.
    const defaultEngineGroup = target.closest('.us-form-group');
    if (defaultEngineGroup && defaultEngineGroup.parentNode) {
      defaultEngineGroup.parentNode.insertBefore(group, defaultEngineGroup);
    } else {
      // Fallback: append to modal body.
      const modalBody = document.querySelector('#usSettingsModal .us-modal-body');
      if (modalBody) modalBody.appendChild(group);
    }

    function setHTML(node, html) { node.innerHTML = html; }

    // Wire the picker.
    function updateHint() {
      const c = window.CLONES.find(x => x.id === picker.value);
      if (!c) { hint.textContent = ''; return; }
      const profile = window.DNA_PROFILES[c.dna];
      const styleHints = (profile && profile.styleHints) ? profile.styleHints.join(' · ') : '';
      setHTML(hint,
        `<strong>${esc(c.description)}</strong>` +
        `<br><span style="color:var(--us-text-muted)">DNA:</span> <code>${esc(c.dna)}</code>` +
        (styleHints ? ` · <span style="color:var(--us-text-muted)">style:</span> ${esc(styleHints)}` : '') +
        `<br><span style="color:var(--us-text-muted)">Engines (fallback order):</span> ` +
        c.engines.map(e => `<code>${esc(e)}</code>`).join(' → ')
      );
    }
    picker.addEventListener('change', () => {
      const ok = window.CloneState.setActive(picker.value);
      if (!ok) return;
      updateHint();
      const label = picker.options[picker.selectedIndex].text;
      try {
        if (window.UsChat && window.UsChat.toast) {
          window.UsChat.toast('Switched to: ' + label);
        }
      } catch (_) { /* noop */ }
    });
    updateHint();

    // If the active clone changes via another path (e.g. console call to
    // CloneState.setActive), keep the picker in sync.
    window.addEventListener('clonechange', (e) => {
      if (e && e.detail && e.detail.id && picker.value !== e.detail.id) {
        picker.value = e.detail.id;
        updateHint();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tryInject());
  } else {
    tryInject();
  }
})();