/* ============================================================================
 * character-launcher.js — Character Launcher Interface (Phase 14)
 * ============================================================================
 * Provides a home screen where each clone appears as an independent "app"
 * tile. Clicking a clone launches it in a Tumblr-inspired interface.
 *
 * Features:
 * - Home screen grid of character tiles (one per clone)
 * - Tumblr-style aesthetic with dark mode + accent colors
 * - Each character has its own isolated chat session
 * - Memory and persona are scoped per character
 * - Quick-access launcher from any view
 *
 * Usage:
 *   CharacterLauncher.init()  // Mount on DOMContentLoaded
 *   CharacterLauncher.show()  // Show the launcher
 *   CharacterLauncher.hide()  // Hide the launcher
 * ============================================================================ */

(function initCharacterLauncher() {
  // ── Launcher state ──────────────────────────────────────────────────────
  const STORAGE_KEY = 'us-active-character';
  const DEFAULT_CHARACTER = 'speed-clone';

  function getActiveCharacter() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored || DEFAULT_CHARACTER;
    } catch (_) {
      return DEFAULT_CHARACTER;
    }
  }

  function setActiveCharacter(cloneId) {
    try {
      localStorage.setItem(STORAGE_KEY, cloneId);
    } catch (_) { /* noop */ }
  }

  // ── DOM injection ───────────────────────────────────────────────────────
  function createLauncherModal() {
    const modal = document.createElement('div');
    modal.id = 'character-launcher-modal';
    modal.className = 'character-launcher-modal';
    modal.innerHTML = `
      <div class="launcher-backdrop"></div>
      <div class="launcher-panel">
        <div class="launcher-header">
          <h2>Character Launcher</h2>
          <button class="launcher-close" aria-label="Close launcher">✕</button>
        </div>
        <div class="launcher-grid" id="launcher-grid">
          <!-- Character tiles will be injected here -->
        </div>
      </div>
    `;
    return modal;
  }

  function createCharacterTile(clone) {
    const tile = document.createElement('div');
    tile.className = 'character-tile';
    tile.dataset.cloneId = clone.id;

    // Determine color based on clone
    let colorClass = 'tile-neutral';
    if (clone.id === 'opus-clone') colorClass = 'tile-opus';
    else if (clone.id === 'gpt5-clone') colorClass = 'tile-gpt';
    else if (clone.id === 'reasoning-clone') colorClass = 'tile-reasoning';
    else if (clone.id === 'speed-clone') colorClass = 'tile-speed';
    else if (clone.id === 'polly-clone') colorClass = 'tile-polly';
    else if (clone.id === 'mavis-clone') colorClass = 'tile-mavis';

    tile.classList.add(colorClass);

    tile.innerHTML = `
      <div class="tile-avatar">${clone.label.charAt(0)}</div>
      <div class="tile-content">
        <h3 class="tile-label">${clone.label}</h3>
        <p class="tile-description">${clone.description}</p>
      </div>
      <div class="tile-footer">
        <span class="tile-engine">${clone.engines[0]}</span>
      </div>
    `;

    tile.addEventListener('click', () => {
      setActiveCharacter(clone.id);
      if (window.CloneState && window.CloneState.setActive) {
        window.CloneState.setActive(clone.id);
      }
      // Hide launcher and focus chat
      CharacterLauncher.hide();
      // Scroll to composer view if available
      const composerTab = document.querySelector('[data-view="composer"]');
      if (composerTab) composerTab.click();
    });

    return tile;
  }

  function createLauncherButton() {
    const fab = document.createElement('button');
    fab.id = 'character-launcher-fab';
    fab.className = 'character-launcher-fab';
    fab.title = 'Open Character Launcher';
    fab.innerHTML = '🚀';
    fab.addEventListener('click', () => CharacterLauncher.show());
    return fab;
  }

  // ── Public API ──────────────────────────────────────────────────────────
  const CharacterLauncher = {
    init() {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._mount());
      } else {
        this._mount();
      }
    },

    _mount() {
      // Create and inject modal
      const modal = createLauncherModal();
      document.body.appendChild(modal);

      // Create and inject FAB
      const fab = createLauncherButton();
      document.body.appendChild(fab);

      // Populate grid with clones
      const grid = document.getElementById('launcher-grid');
      if (window.CLONES && Array.isArray(window.CLONES)) {
        window.CLONES.forEach(clone => {
          const tile = createCharacterTile(clone);
          grid.appendChild(tile);
        });
      }

      // Wire up modal close
      const backdrop = modal.querySelector('.launcher-backdrop');
      const closeBtn = modal.querySelector('.launcher-close');
      backdrop.addEventListener('click', () => this.hide());
      closeBtn.addEventListener('click', () => this.hide());

      // Keyboard shortcut: Escape to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
          this.hide();
        }
      });
    },

    show() {
      const modal = document.getElementById('character-launcher-modal');
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    },

    hide() {
      const modal = document.getElementById('character-launcher-modal');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    },

    getActive() {
      return getActiveCharacter();
    },

    setActive(cloneId) {
      setActiveCharacter(cloneId);
      if (window.CloneState && window.CloneState.setActive) {
        window.CloneState.setActive(cloneId);
      }
    }
  };

  window.CharacterLauncher = CharacterLauncher;
})();
