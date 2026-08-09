# MERGE.md — Unicorn Sparkles × Tumblr/Discord

How to combine this project with whatever's running on the Tumblr/Discord side.

This file is the integration contract. It documents:

1. The **mount surface** — where the merge injects Unicorn Sparkles
2. The **contract surface** — what either side can call
3. The **storage surface** — namespaces for keys, state, files
4. The **event surface** — UI event delegation contract
5. **Known seams** — places that need explicit glue at merge time

If you're about to merge and find something missing from this doc, that's a bug
in the doc — please add it.

---

## 1. Project layout

```
unicorn-sparkles/
├── index.html              host page (vanilla HTML, no build step)
├── styles.css              theme + layout (`--us-` CSS variables)
├── app.js                  chat, engines, folder, settings (IIFE, ~1600 lines)
├── files.js                Phase 5 — IndexedDB-backed file store
├── live-css.js             Phase 5 — live CSS hot-reload
├── live-js.js              Phase 5 — cache-bust dynamic-import helper
├── editor.js               Phase 5 — Files tab + in-app code editor
├── build-agent.js          Phase 5 — chat-driven edit agent
├── README.md
├── MERGE.md                this file
├── phase5-deliverable.md   Phase 5 changelog
├── functions/
│   └── api/
│       └── proxy/
│           ├── index.js    Cloudflare Pages Function — POST /api/proxy
│           └── status.js   Cloudflare Pages Function — GET  /api/proxy/status
└── deliverable.md          Phase 3 changelog
```

No `package.json`, no `node_modules`, no bundler config. Vanilla HTML/CSS/JS
served from any static host. Cloudflare Pages picks up `functions/` for the
Worker code automatically.

---

## 2. Mount surface — where Unicorn Sparkles attaches

The host page must include:

```html
<link rel="stylesheet" href="<path-to-unicorn>/styles.css" />
<style id="us-live-css"></style>      <!-- Phase 5: live CSS slot -->
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="<path-to-unicorn>/app.js"></script>
<script src="<path-to-unicorn>/files.js"></script>
<script src="<path-to-unicorn>/live-css.js"></script>
<script src="<path-to-unicorn>/live-js.js"></script>
<script src="<path-to-unicorn>/editor.js"></script>
<script src="<path-to-unicorn>/build-agent.js"></script>
<script>
  if (window.UsEditor) UsEditor.bootstrap();
  if (window.UsBuild) UsBuild.bootstrap();
</script>
```

Recommended order: linked CSS, `<style id="us-live-css">` (empty), CDN libs
(marked, DOMPurify, JSZip), then Unicorn's own files. **`<style
id="us-live-css">` must come after the linked stylesheet**, otherwise cascade
order will favor the (cached) shipped stylesheet over user's live edits.

The mount point inside the page:

```html
<div class="us-app" id="usApp">
  <!-- topbar, chat, folder, settings modal, image modal, editor modal, toast -->
  <!-- see index.html for the full markup -->
</div>
```

`#usApp` is the single mount root. Everything Unicorn owns is its descendant.
Anything else on the page is outside Unicorn's purview.

If you're embedding Unicorn into an existing page (say, as a sidebar panel),
put `#usApp` inside that panel. Don't try to split Unicorn across multiple
roots — the event delegation assumes a single root.

---

## 3. Contract surface — what each side exports

### Unicorn exposes (`window.*`)

| Symbol                | Read/Write | Purpose                                                   |
| --------------------- | ---------- | --------------------------------------------------------- |
| `UsChat.postUser(t)`  | call       | Append a `user` message bubble to chat                     |
| `UsChat.postAI(t,e)`  | call       | Append an `ai` message bubble, render as Markdown         |
| `UsChat.addTyping()`  | call       | Show typing indicator                                     |
| `UsChat.removeTyping()`| call      | Hide typing indicator                                     |
| `UsChat.setStatus(s)` | call       | Update the engine-status line at the bottom of the input  |
| `UsChat.toast(m,t)`   | call       | Show a transient notification toast                       |
| `UsState.*`           | read-mostly| Same shape as the IIFE's `STATE` object                   |
| `UsEditor.openFile(p)`| call       | Open the in-app editor for project file `p`               |
| `UsEditor.snapshot()` | call       | Download a `.zip` snapshot of all project files           |
| `UsEditor.resetAll()` | call       | Reset every file to its shipped version                   |
| `UsBuild.toggle()`    | call       | Toggle Build Mode                                         |
| `UsBuild.send(text)`  | call       | Route `text` through the build agent (requires Build Mode)|
| `UsFiles.read(p)`     | async      | Read text content of a project file from IndexedDB        |
| `UsFiles.write(p,c)`  | async      | Write text content of a project file to IndexedDB         |
| `UsFiles.SHIPPED_PATHS` | read     | The canonical list of project files                       |
| `UsLiveCss.apply(c)`  | call       | Replace the live CSS slot with `c` (hot-reload)           |

### What Unicorn reads from `window.*`

- `window.UsChat`, `window.UsState`, `window.UsEditor`, `window.UsBuild`,
  `window.UsFiles`, `window.UsLiveCss`, `window.UsLiveJs` (set internally)
- `window.puter` (Phase 4) — Puter.js SDK for the Puter engine
- `window.marked`, `window.DOMPurify`, `window.JSZip` (CDN)

### What Unicorn calls on the host

The Tumblr/Discord side can hook any of the `Us*` symbols above. If a symbol
is missing, Unicorn logs a warning and continues — it never throws.

---

## 4. Storage surface — namespacing rules

| Key                     | Where       | Owns          | Format                                          |
| ----------------------- | ----------- | ------------- | ----------------------------------------------- |
| `us-state`              | localStorage| Unicorn       | `{ keys, defaultEngine, tone, enhance, ..., messages, outputs }` |
| `us-files-db/files`     | IndexedDB   | Unicorn       | `key = path (string)`, `value = text content`   |
| Cloudflare secrets: `MISTRAL_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `HUGGINGFACE_API_KEY` | Cloudflare Pages | Unicorn | encrypted at rest, exposed via `/api/proxy/status` |

Rules:

- **All localStorage keys owned by Unicorn are prefixed `us-`.** Anything
  matching that prefix belongs to Unicorn. Don't read or write `us-*` keys
  from the host side.
- **All IndexedDB database names owned by Unicorn are prefixed `us-`.** Same
  rule: don't open `us-*` databases from outside.
- **All DOM elements with class `us-*` or id `us-*` belong to Unicorn.** Outside
  code can style/override them via descendant selectors in its own CSS, but
  shouldn't insert children under them — the IIFE event handlers assume a
  specific child structure.
- **All `window.Us*` symbols belong to Unicorn.**

If the Tumblr/Discord project uses a different prefix (`td-*`, `tumblr-*`,
etc.), don't collide. Use `td-*` for its own keys.

---

## 5. Event surface — UI event delegation

Unicorn binds a single `document.addEventListener('click', …)` for click
delegation. Clicked elements are matched against CSS selectors starting with
`#` IDs or `.us-*` classes. The host page can ALSO bind its own click handler
on the same document — there's no exclusivity. Just be aware:

- **Capture-phase listeners** registered by host code can stop Unicorn's
  bubble-phase handler from running by calling `event.stopImmediatePropagation()`.
  Use sparingly.
- **Bubble-phase listeners** run alongside Unicorn's. Order is registration order.

Unicorn also installs capture-phase click + keydown interceptors on the
**send button** when Build Mode is on. The interceptors call
`event.stopImmediatePropagation()` to prevent the regular chat send path from
running. If you want to add your own send-button behavior that runs
independently of Unicorn, register a capture-phase listener that runs before
Unicorn's, and call `stopImmediatePropagation()` only when your handler
handles it.

For keyboard shortcuts (`#usInput` is the chat textarea), Unicorn listens for
`Enter` (send) and `Shift+Enter` (newline). Tab indents the editor textarea
when that field has focus. Esc closes any open Unicorn modal. Host code can
attach additional `keydown` listeners on `document` and inspect `e.target`.

---

## 6. CSS contract

Unicorn exposes its theme via `:root` CSS variables in `styles.css`:

```css
--us-bg, --us-bg-soft, --us-bg-strong
--us-text, --us-text-dim, --us-text-muted
--us-accent, --us-accent-soft
--us-success, --us-danger, --us-warning
--us-border, --us-border-strong
--us-radius, --us-radius-sm
```

Host CSS can override these. They're scoped to `:root` so they propagate
through the entire page, including Unicorn UI. Conversely, host UI should
not depend on these — they're internal.

---

## 7. Worker (`functions/api/proxy/`)

The Cloudflare Pages Function in `functions/api/proxy/index.js` accepts:

```
POST /api/proxy
Content-Type: application/json

{
  "engine": "mistral" | "groq" | "deepseek" | "gemini" | "huggingface",
  "messages": [{"role": "user"|"assistant", "content": "..."}],
  "sysPrompt": "...",
  "prompt": "...",    // huggingface image gen only
  "style": "...",     // huggingface image gen only
  "ratio": "..."      // huggingface image gen only
}

GET /api/proxy/status
→ { "proxyLive": true, "engines": { "<name>": "live"|"missing", ... }, ... }
```

For merge purposes, the Tumblr/Discord side should treat this endpoint as
**Unicorn's**. Don't write a separate Worker for AI proxying; reuse this one.
If you need an additional engine (e.g. a model the two of you share keys
for), add it to `ENGINE_CONFIG` in `functions/api/proxy/index.js` and
expose the matching secret via Cloudflare Pages → Settings → Environment
variables.

---

## 8. Merge checklist

Concrete steps to combine the two projects. **Fill in the placeholders for
your specific layout.**

- [ ] **Decide mount layout.** Are you embedding Unicorn as a full page,
      a sidebar panel, or a modal? Set the layout in `index.html`'s
      `<div class="us-app" id="usApp">…</div>` placement.
- [ ] **Copy or link the 11 files.** Recommend symlinking rather than
      copying — edits via the in-app editor only write to IndexedDB and
      don't update the on-disk source unless you snapshot back.
- [ ] **Reconcile namespaces.** Verify the Tumblr/Discord side doesn't
      collide with `us-*` anywhere (localStorage, IndexedDB, DOM classes,
      window globals).
- [ ] **Reconcile CDN libs.** If host already pulls `marked`, `DOMPurify`, or
      `JSZip`, deduplicate — pin to the same version as Unicorn uses.
- [ ] **Reconcile CSS variables.** If host already defines
      `--us-bg`, `--us-accent`, etc., pick whose values win; consider renaming
      one set to avoid surprise.
- [ ] **Run Build Agent smoke test.** Open the merged page, click Build,
      type "add a hello banner to index.html", confirm the agent previews an
      edit and applies it. Verify CSS hot-reload and the snapshot zip.
- [ ] **Smoke test AI engines.** Open Settings, click Refresh status. All
      engines configured in Cloudflare secrets should read ✓ ready.
- [ ] **Decide deployment target.** If both sides deploy to the same
      Cloudflare Pages project, the Worker `/api/proxy` covers both. If
      they're on different projects, keep secrets separate but the proxy
      code path is identical.

---

## 9. Known seams

A few places where merging needs explicit glue:

- **The chat input.** Unicorn owns `#usInput`. If Tumblr/Discord needs to
  inject prompts into chat, call `window.UsChat.postUser(text)` — it adds
  the text as a user message bubble. Don't reach in and set `.value`.
- **The output folder.** Unicorn owns `#usFolderList`. Saved items live in
  `STATE.outputs`. Outside code can call `saveToFolder(opts)` if we export
  it, but for now it's bound inside the IIFE. To keep merge clean, prefer
  reading from localStorage `us-state` after a save (the persistence layer
  syncs each save).
- **Build Mode intercepted send.** When Build Mode is on, the send button
  doesn't go through chat — it goes through the build agent. If host code
  also wants to intercept the send button, do it in capture phase BEFORE
  Unicorn's interceptor, and call `stopImmediatePropagation()` only when the
  host handler claims it.
- **The `data-active="true"` attribute on toggle buttons.** Unicorn's CSS
  styles `[data-active="true"]` for toggles like Enhance and Build. If your
  toggle buttons use the same attribute for a different purpose, rename one.

If you hit a seam not listed here, document it inline with
`// MERGE-TODO:` so a future session can address it.
