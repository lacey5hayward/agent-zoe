/* ============================================================
 * uschat-glue.js — chat routing glue for the merged product
 * ============================================================
 *
 * This snippet wires Social Hub's existing composer-chat form
 * (#bot-form, #bot-input, #bot-messages) to Unicorn's chat API
 * (window.UsChat.*). Drop this into the merged app.js *between*
 * Social Hub's IIFE close and Unicorn's IIFE body.
 *
 * What it does:
 *   1. Hides Social Hub's legacy chat panel (we keep the DOM
 *      only for the Discord-widget embed toggle).
 *   2. On submit of #bot-form:
 *        - reads input from #usInput (Unicorn's textarea)
 *        - posts as a user message via UsChat.postUser
 *        - calls the configured engine via /api/proxy
 *        - posts the reply as an AI message via UsChat.postAI
 *   3. Leaves the legacy botChats store alone (it's harmless).
 *
 * PREREQUISITES:
 *   - window.UsChat must be defined (Unicorn's app.js sets it)
 *   - #usInput must be reachable (Unicorn renders it inside #usApp)
 *   - /api/proxy works (Cloudflare Worker, see MERGE_PLAN.md §6)
 * ============================================================ */

(function wireComposerChatToUnicorn() {
  const $ = (sel) => document.querySelector(sel);

  function hideLegacyChatPanel() {
    const legacy = $('#bot-messages');
    if (legacy) legacy.style.display = 'none';
    // Don't disable the form — the Discord-widget toggle still uses it.
  }

  async function sendViaUnicorn(text) {
    if (!window.UsChat) {
      console.warn('[merge] UsChat not ready; message dropped:', text);
      return;
    }
    UsChat.postUser(text);
    UsChat.addTyping();

    try {
      // Pick the default engine from Unicorn's STATE if exposed, else Pollinations.
      const engine =
        (window.UsState && window.UsState.defaultEngine) || 'pollinations';

      const resp = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          messages: [{ role: 'user', content: text }],
          sysPrompt: window.UsState?.sysPrompt || 'You are a helpful assistant.',
        }),
      });

      if (!resp.ok) throw new Error(`proxy ${resp.status}`);
      const data = await resp.json();
      const aiText = data?.choices?.[0]?.message?.content
                  || data?.content?.[0]?.text
                  || data?.text
                  || '[no content]';

      UsChat.postAI(aiText, engine);
    } catch (err) {
      UsChat.postAI(`[engine error] ${err.message}`, 'system');
      console.error('[merge] engine call failed:', err);
    } finally {
      UsChat.removeTyping();
    }
  }

  function attachHandlers() {
    const form  = $('#bot-form');
    const input = $('#usInput');
    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      sendViaUnicorn(text);
      input.value = '';
    });

    // Unicorn already binds Enter on #usInput for its own purposes;
    // that path is the canonical one. The form-submit handler above
    // is the fallback for keyboard / accessibility paths.
  }

  // Wait for Unicorn to mount, then wire.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      hideLegacyChatPanel();
      // small delay so Unicorn's IIFE has finished setting window.UsChat
      setTimeout(attachHandlers, 0);
    });
  } else {
    hideLegacyChatPanel();
    setTimeout(attachHandlers, 0);
  }
})();
