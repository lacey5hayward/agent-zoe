// ============================================================================
// auth.js — Phase 13: login gate, user menu, admin route
// ----------------------------------------------------------------------------
// Flow on every page load:
//   1. GET /api/auth/me → if user, show app + user menu, hide login gate
//   2. If no user, hide app, show login gate
//   3. Login form POSTs /api/auth/login → on success, reload state
//   4. Logout button POSTs /api/auth/logout → on success, hide app, show gate
//   5. /admin route: if logged-in user is admin, fetch /api/auth/me and show panel
// ============================================================================

(function () {
  'use strict';

  const Auth = {
    user: null,

    async init() {
      // Bind login form
      const form = document.getElementById('zoe-login-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.login();
        });
      }

      // Bind user menu
      const menuBtn = document.getElementById('zoe-user-menu-btn');
      const menuPopup = document.getElementById('zoe-user-menu-popup');
      if (menuBtn && menuPopup) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          menuPopup.hidden = !menuPopup.hidden;
        });
        document.addEventListener('click', () => { menuPopup.hidden = true; });
      }

      // Bind logout
      const logoutBtn = document.getElementById('zoe-user-menu-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => this.logout());
      }

      // Admin route
      if (location.pathname === '/admin' || location.pathname === '/admin/') {
        this.handleAdminRoute();
      }

      // Probe session
      await this.refresh();
    },

    async refresh() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        this.user = data.user || null;
      } catch (e) {
        console.warn('auth probe failed:', e);
        this.user = null;
      }
      this.render();
      return this.user;
    },

    render() {
      const gate = document.getElementById('zoe-login-gate');
      const menu = document.getElementById('zoe-user-menu');
      const app = document.querySelector('.app');

      if (this.user) {
        if (gate) gate.hidden = true;
        if (app) app.style.display = '';
        if (menu) {
          menu.hidden = false;
          const name = this.user.username || 'user';
          const avatar = document.getElementById('zoe-user-avatar');
          const nameEl = document.getElementById('zoe-user-name');
          const popupName = document.getElementById('zoe-user-popup-name');
          const popupRole = document.getElementById('zoe-user-popup-role');
          if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
          if (nameEl) nameEl.textContent = name;
          if (popupName) popupName.textContent = name;
          if (popupRole) popupRole.textContent = this.user.isAdmin ? '🛡️ admin' : 'user';
          const adminLink = document.getElementById('zoe-user-menu-admin');
          if (adminLink) adminLink.hidden = !this.user.isAdmin;
        }
      } else {
        if (gate) gate.hidden = false;
        if (app) app.style.display = 'none';
        if (menu) menu.hidden = true;
      }
    },

    async login() {
      const username = document.getElementById('zoe-login-username').value.trim();
      const password = document.getElementById('zoe-login-password').value;
      const errorEl = document.getElementById('zoe-login-error');
      const submitBtn = document.getElementById('zoe-login-submit');
      if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…'; }
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (errorEl) { errorEl.hidden = false; errorEl.textContent = data.error || `Sign in failed (HTTP ${res.status})`; }
          return;
        }
        this.user = data.user;
        this.render();
        // If they were trying to reach /admin, route them there now.
        if (location.pathname === '/admin' || location.pathname === '/admin/') {
          this.handleAdminRoute();
        }
      } catch (e) {
        if (errorEl) { errorEl.hidden = false; errorEl.textContent = 'Network error — try again'; }
        console.error('login error:', e);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign in'; }
      }
    },

    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_) { /* best effort */ }
      this.user = null;
      this.render();
      // If we were on /admin, kick back to home.
      if (location.pathname === '/admin' || location.pathname === '/admin/') {
        history.pushState({}, '', '/');
      }
    },

    async handleAdminRoute() {
      // Hide the normal app, show the admin panel inside the gate container.
      if (!this.user) {
        // Not logged in → show login gate.
        const gate = document.getElementById('zoe-login-gate');
        if (gate) gate.hidden = false;
        const app = document.querySelector('.app');
        if (app) app.style.display = 'none';
        return;
      }
      if (!this.user.isAdmin) {
        document.body.innerHTML = '<div style="padding:60px;text-align:center;font-family:system-ui;color:#fff;background:#0f172a;min-height:100vh"><h1>403 — admin only</h1><p>You\'re signed in as <code>' + this.user.username + '</code> but this user doesn\'t have admin access.</p><p><a href="/" style="color:#14b8a6">← back to app</a></p></div>';
        return;
      }
      // Render admin panel
      this.renderAdminPanel();
    },

    renderAdminPanel() {
      const app = document.querySelector('.app');
      if (app) app.style.display = 'none';
      const gate = document.getElementById('zoe-login-gate');
      if (gate) gate.hidden = true;
      // Inject admin panel
      let panel = document.getElementById('zoe-admin-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'zoe-admin-panel';
        panel.className = 'zoe-admin-panel';
        document.body.appendChild(panel);
      }
      panel.hidden = false;
      panel.innerHTML = `
        <div class="zoe-admin-shell">
          <header class="zoe-admin-head">
            <h1>🛡️ Agent Zoe — Admin</h1>
            <div class="zoe-admin-head-right">
              <span class="zoe-admin-user">Signed in as <strong>${this.user.username}</strong></span>
              <a class="zoe-admin-link" href="/">← back to app</a>
              <button class="zoe-admin-btn" id="zoe-admin-logout">Sign out</button>
            </div>
          </header>
          <div class="zoe-admin-grid">
            <section class="zoe-admin-card">
              <h2>System</h2>
              <div id="zoe-admin-system">Loading…</div>
            </section>
            <section class="zoe-admin-card">
              <h2>Engines (proxy status)</h2>
              <div id="zoe-admin-engines">Loading…</div>
            </section>
            <section class="zoe-admin-card">
              <h2>Memory store</h2>
              <div id="zoe-admin-memory">Loading…</div>
            </section>
            <section class="zoe-admin-card">
              <h2>Auth</h2>
              <div id="zoe-admin-auth">Loading…</div>
            </section>
          </div>
        </div>
      `;
      const logoutBtn = document.getElementById('zoe-admin-logout');
      if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
      this.loadAdminData();
    },

    async loadAdminData() {
      const systemEl = document.getElementById('zoe-admin-system');
      const enginesEl = document.getElementById('zoe-admin-engines');
      const memoryEl = document.getElementById('zoe-admin-memory');
      const authEl = document.getElementById('zoe-admin-auth');

      // System info
      if (systemEl) {
        systemEl.innerHTML = `
          <div class="zoe-admin-row"><span>Path</span><code>${location.pathname}</code></div>
          <div class="zoe-admin-row"><span>Origin</span><code>${location.origin}</code></div>
          <div class="zoe-admin-row"><span>User-Agent</span><code>${navigator.userAgent.slice(0, 80)}…</code></div>
          <div class="zoe-admin-row"><span>Logged in as</span><code>${this.user.username} (${this.user.isAdmin ? 'admin' : 'user'})</code></div>
        `;
      }

      // Engine status (from proxy)
      try {
        const res = await fetch('/api/proxy/status', { credentials: 'include' });
        const data = await res.json();
        if (enginesEl) {
          if (data.proxyLive) {
            const rows = Object.entries(data.engines || {}).map(([id, status]) => {
              const cls = status === 'live' ? 'ok' : 'muted';
              return `<div class="zoe-admin-row"><span>${id}</span><span class="us-status us-status-${cls === 'ok' ? 'ok' : 'muted'}">${status}</span></div>`;
            }).join('');
            enginesEl.innerHTML = rows || '<div class="zoe-admin-row"><span>No engines registered</span></div>';
          } else {
            enginesEl.innerHTML = '<div class="zoe-admin-row"><span>Proxy</span><span class="us-status us-status-muted">not deployed</span></div>';
          }
        }
      } catch (e) {
        if (enginesEl) enginesEl.innerHTML = '<div class="zoe-admin-row"><span>Error</span><code>' + (e.message || e) + '</code></div>';
      }

      // Memory — show counts for current user
      try {
        if (window.Memory && typeof window.Memory.list === 'function') {
          const items = await window.Memory.list();
          const list = Array.isArray(items) ? items : [];
          if (memoryEl) {
            memoryEl.innerHTML = `
              <div class="zoe-admin-row"><span>Memories for <code>${this.user.id}</code></span><strong>${list.length}</strong></div>
              <div class="zoe-admin-row"><span>Storage</span><code>Cloudflare KV (agent-zoe-memory)</code></div>
              <div class="zoe-admin-row"><span>Limit</span><code>200 per user / 30-day idle</code></div>
            `;
          }
        } else {
          if (memoryEl) memoryEl.innerHTML = '<div class="zoe-admin-row"><span>Memory module</span><span class="us-status us-status-muted">not loaded</span></div>';
        }
      } catch (e) {
        if (memoryEl) memoryEl.innerHTML = '<div class="zoe-admin-row"><span>Memory error</span><code>' + (e.message || e) + '</code></div>';
      }

      // Auth info
      if (authEl) {
        authEl.innerHTML = `
          <div class="zoe-admin-row"><span>Cookie</span><code>zoe_session (HttpOnly)</code></div>
          <div class="zoe-admin-row"><span>JWT</span><code>HS256, 30-day expiry</code></div>
          <div class="zoe-admin-row"><span>Roles</span><code>admin (env: ADMIN_USERNAME)</code></div>
          <div class="zoe-admin-row"><span>Change password</span><code>Cloudflare Pages → env ADMIN_PASSWORD</code></div>
        `;
      }
    }
  };

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Auth.init());
  } else {
    Auth.init();
  }

  // Expose for other modules (e.g. memory.js can call (Auth.user && Auth.user.id))
  window.ZoeAuth = Auth;
})();
