/* ============================================================================
 * persona-picker.js — Settings-modal injection for the persona picker
 * ----------------------------------------------------------------------------
 * Same pattern as clone-picker.js: wait for the Unicorn Settings modal
 * to mount, then inject a <select id="usPersonaSelect"> just above the
 * clone picker. Shows the active persona's description below the select.
 *
 * - Idempotent.
 * - Listens for 'personachange' / 'clonechange' to keep itself in sync.
 * - "Default" option is whatever the user last picked (or the system
 *   default); cloning-pin shows a hint that the active clone is overriding.
 * ============================================================================ */

(function injectPersonaPicker() {
  function makeTextNode(t) { return document.createTextNode(t); }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function setHTML(node, html) { node.innerHTML = html; }

  function tryInject(attempt) {
    attempt = attempt || 0;
    if (attempt > 40) return;
    // Need the Unicorn modal and our globals.
    if (!document.getElementById('usDefaultEngine')) {
      setTimeout(() => tryInject(attempt + 1), 100);
      return;
    }
    if (!window.PERSONAS || !window.PersonaState) {
      setTimeout(() => tryInject(attempt + 1), 100);
      return;
    }
    if (document.getElementById('usPersonaSelect')) return; // idempotent

    const target = document.getElementById('usDefaultEngine');
    const active = window.PersonaState.getActive();

    const group = document.createElement('div');
    group.className = 'us-form-group us-persona-picker-group';

    const label = document.createElement('label');
    label.appendChild(makeTextNode('Persona (tone of voice) '));
    const labelHint = document.createElement('span');
    labelHint.style.fontWeight = '400';
    labelHint.style.color = 'var(--us-text-muted)';
    labelHint.appendChild(makeTextNode('— overlays the clone DNA'));
    label.appendChild(labelHint);
    group.appendChild(label);

    const picker = document.createElement('select');
    picker.id = 'usPersonaSelect';
    for (const p of Object.values(window.PERSONAS)) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.appendChild(makeTextNode(p.label));
      if (active && active.id === p.id) opt.selected = true;
      picker.appendChild(opt);
    }
    group.appendChild(picker);

    const hint = document.createElement('p');
    hint.className = 'us-persona-hint';
    hint.id = 'usPersonaHint';
    group.appendChild(hint);

    // Insert just before the clone picker group, or before the default engine
    // group if clone-picker hasn't injected yet.
    const cloneGroup = document.querySelector('.us-clone-picker-group');
    const defaultGroup = target.closest('.us-form-group');
    const insertTarget = cloneGroup || defaultGroup;
    if (insertTarget && insertTarget.parentNode) {
      insertTarget.parentNode.insertBefore(group, insertTarget);
    } else {
      const modalBody = document.querySelector('#usSettingsModal .us-modal-body');
      if (modalBody) modalBody.appendChild(group);
    }

    function updateHint() {
      const a = window.PersonaState.getActive();
      if (!a) {
        setHTML(hint,
          '<em style="color:var(--us-text-muted)">Active clone opts out of personas — no tone overlay applied.</em>');
        return;
      }
      setHTML(hint,
        `<strong>${esc(a.description)}</strong>` +
        `<br><span style="color:var(--us-text-muted)">Applied on top of DNA:</span> <code>${esc(a.id)}</code>`);
    }
    picker.addEventListener('change', () => {
      const ok = window.PersonaState.setActive(picker.value);
      if (!ok) return;
      updateHint();
      const labelTxt = picker.options[picker.selectedIndex].text;
      try {
        if (window.UsChat && window.UsChat.toast) {
          window.UsChat.toast('Persona: ' + labelTxt);
        }
      } catch (_) { /* noop */ }
    });
    updateHint();

    // Keep in sync if the user changes clone (the active persona may differ).
    function syncFromState() {
      const a = window.PersonaState.getActive();
      const want = a ? a.id : '';
      if (picker.value !== want) picker.value = want;
      updateHint();
    }
    window.addEventListener('clonechange', syncFromState);
    window.addEventListener('personachange', syncFromState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tryInject());
  } else {
    tryInject();
  }
})();
