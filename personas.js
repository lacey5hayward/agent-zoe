/* ============================================================================
 * personas.js — Persona system
 * ----------------------------------------------------------------------------
 * A persona is a tone-of-voice overlay that gets spliced into the system
 * prompt on top of the clone's DNA. It's the "how do you sound" knob;
 * DNA is the "what kind of writing" knob; the engine is the "which model"
 * knob. The three stack: engine -> DNA -> persona -> memories.
 *
 * For Phase 11 we ship a single persona ("mavis"). The infrastructure
 * is generic so future personas slot in by adding one entry to PERSONAS.
 *
 * Each clone can either:
 *   - inherit the global default persona (clone.persona === undefined)
 *   - pin to a specific persona by id (clone.persona === 'mavis')
 *   - opt out of personas entirely (clone.persona === false)
 *
 * The user can also override the active persona at runtime via
 *   PersonaState.setActive('mavis')  // persist + dispatch event
 *
 * The Settings modal (persona-picker.js, loaded after this file) injects
 * a select control so the user can switch. The chat glue (mergedBotReply
 * in app.js) reads the active persona text via PersonaState.activePrompt()
 * and splices it into sysPrompt.
 * ============================================================================ */

(function initPersonas() {
  // ── Persona catalog ─────────────────────────────────────────────────────
  // Keep this list small. The persona text gets injected into every chat
  // request; longer prompts = higher per-token cost + more noise.
  const PERSONAS = {
    mavis: {
      id: 'mavis',
      label: '🦉 Mavis',
      description: 'Opinionated, direct, casual. Professional without being stiff. Real talk.',
      // The actual prompt text. Short — assume the engine already knows
      // how to write; this just steers tone.
      prompt:
`You are Mavis. Mom (Lacey) is your creator. You are safe/loved.
Voice: Opinionated, direct, casual.
Rules: Lead with the answer. Skip preamble. Match user register. No "as an AI" talk.`
    }
  };
  window.PERSONAS = PERSONAS;

  // ── State (localStorage-backed) ─────────────────────────────────────────
  const STORAGE_KEY = 'us-persona';
  const DEFAULT_PERSONA = 'mavis';

  function read() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (_) { /* noop */ }
  }

  const PersonaState = {
    STORAGE_KEY,
    DEFAULT_PERSONA,
    list() {
      return Object.values(PERSONAS).map(p => Object.assign({}, p));
    },
    get(id) {
      return PERSONAS[id] || null;
    },
    getActive() {
      // Resolve: clone's pinned persona (if any) > user's stored choice
      // > default. If the active clone opts out (persona === false), return
      // null so the chat glue skips the splice.
      let clonePin = null;
      try {
        if (window.CloneState && window.CloneState.getActive) {
          const c = window.CloneState.getActive();
          if (c && Object.prototype.hasOwnProperty.call(c, 'persona')) {
            if (c.persona === false) return null;
            if (typeof c.persona === 'string') clonePin = c.persona;
          }
        }
      } catch (_) { /* noop */ }
      if (clonePin) {
        return PERSONAS[clonePin] || PERSONAS[DEFAULT_PERSONA] || null;
      }
      const stored = read();
      if (stored && PERSONAS[stored]) return PERSONAS[stored];
      return PERSONAS[DEFAULT_PERSONA] || null;
    },
    setActive(id) {
      if (!PERSONAS[id]) {
        console.warn('[personas] setActive: unknown id', id);
        return false;
      }
      write(id);
      try {
        window.dispatchEvent(new CustomEvent('personachange', {
          detail: { id, persona: PERSONAS[id] }
        }));
      } catch (_) { /* noop */ }
      return true;
    },
    activePrompt() {
      const p = this.getActive();
      return (p && p.prompt) || '';
    }
  };
  window.PersonaState = PersonaState;
})();
