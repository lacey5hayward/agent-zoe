/* ============================================================================
 * clone-state.js — Active-clone registry, localStorage-backed
 * ----------------------------------------------------------------------------
 * Single source of truth for "which clone is the user on right now".
 * The chat glue (mergedBotReply in app.js) reads from here. The clone
 * picker UI in Settings writes to here.
 *
 * Storage: localStorage['us-clone'] holds the clone id. Default if missing
 * or unknown: 'speed-clone'.
 *
 * Public surface:
 *   CloneState.list()                    — all clones (from window.CLONES)
 *   CloneState.getActive()               — the currently active clone object
 *   CloneState.setActive(id)             — switch + persist + dispatch event
 *   CloneState.activeDnaPrompt()         — convenience: get the active DNA's
 *                                          systemPrompt text (or '' if none)
 *   CloneState.activeEngineChain()       — convenience: get the active engines
 *
 * Listens for the 'clonechange' CustomEvent on window if you want to react.
 * ============================================================================ */

(function initCloneState() {
  const STORAGE_KEY = 'us-clone';
  const DEFAULT_ID = 'speed-clone';

  function readId() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }
  function writeId(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (_) { /* noop */ }
  }

  const CloneState = {
    STORAGE_KEY,
    DEFAULT_ID,

    list() {
      return (window.CLONES || []).slice();
    },

    getActive() {
      const all = this.list();
      if (all.length === 0) {
        // No clones registered yet (load order bug). Return a sane default.
        return {
          id: 'unknown',
          label: 'Unknown',
          description: 'No clones registered — check script load order.',
          dna: 'DNA_NEUTRAL',
          engines: ['pollinations']
        };
      }
      const stored = readId();
      const found = all.find(c => c.id === stored);
      if (found) return found;
      // Stored id missing or unknown — fall back to default, then first.
      const def = all.find(c => c.id === DEFAULT_ID) || all[0];
      return def;
    },

    setActive(id) {
      const all = this.list();
      const exists = all.some(c => c.id === id);
      if (!exists) {
        console.warn('[clone-state] setActive: unknown clone id', id);
        return false;
      }
      writeId(id);
      // Custom event so UI / chat glue can react.
      try {
        window.dispatchEvent(new CustomEvent('clonechange', {
          detail: { id, clone: all.find(c => c.id === id) }
        }));
      } catch (_) { /* noop */ }
      return true;
    },

    activeDnaPrompt() {
      const active = this.getActive();
      if (!active || !active.dna) return '';
      const profiles = window.DNA_PROFILES || {};
      const profile = profiles[active.dna];
      return (profile && profile.systemPrompt) || '';
    },

    activeEngineChain() {
      const active = this.getActive();
      return (active && active.engines) ? active.engines.slice() : ['pollinations'];
    },

    activeLabel() {
      const active = this.getActive();
      return (active && active.label) || 'Default';
    }
  };

  window.CloneState = CloneState;
})();