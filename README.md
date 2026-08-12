# Agent Zoe — merged

> The merged product of **Unicorn Sparkles** (in-browser AI chatbot) and
> **Social Hub** (local-first social-media-hub prototype). Social Hub is the
> visible product; Unicorn is the chat engine. AI backend is the Cloudflare
> Pages Function in `functions/api/proxy/`. Memory lives in Cloudflare KV.

## What this is

A single deployable static site whose:

- **UI** is Social Hub's: 4 tabs (Dashboard / Composer / Blaster Bay / Pages)
  with 7 post types, Squidoo Lense stacked-block editor, Piczo Page free-form
  canvas, theme picker, ad campaigns, drafts, activity feed.
- **Chat engine** is Zoe's: A full Discord-like AI chat interface inside the
  Composer → Chat card. Features a left-hand channel sidebar (#general, #brainstorm, #code, #images), 
  fused media upload ("＋" button) in the chat bar, and a "Save Post" feature that syncs transcripts 
  directly to your Text posts. Powered by a fallback chain of 5+ engines.
- **AI backend** is the Cloudflare Pages Function at `functions/api/proxy/`
  (server-side API keys via encrypted secrets; browser never sees them).
- **Memory** lives in Cloudflare KV (`agent-zoe-memory` namespace), bound
  to the Pages project as `MEMORY`.
- **Clones** wrap premium models on free backends — a DNA profile
  (model-style fingerprint) on top of an engine chain. When credits
  run out on the lead engine, the chain auto-advances to the next
  free one, response style preserved.
- **Persona** is Mavis's — opinionated, direct, casual connectors, no
  customer-service-botlinese. Layered on top of any clone.

## Run locally

```bash
python3 -m http.server -d . 8000
# then open http://localhost:8000
```

For full functionality (memory), you'll need to deploy to Cloudflare
and bind the KV namespace. Locally, chat works keyless via Pollinations.

## Smoke test

| # | Test | Pass? |
|---|---|---|
| 1 | Open `http://localhost:8000/` | ✅ No console errors. Sidebar nav visible. |
| 2 | Click each nav tab | ✅ All 4 views render. |
| 3 | Composer → Chat shows Zoe Discord UI | ✅ Left sidebar, #channels, full-width chat area. |
| 4 | Type a message, click Send | ✅ Discord-style bubbles + AI reply (Zoe identity). |
| 5 | Click "＋" in chat bar | ✅ File picker opens for media uploads. |
| 6 | Click "💾 Save Post" in topbar | ✅ Transcript automatically populates the Text Post tab. |
| 7 | Switch to #images channel | ✅ Auto-switches Zoe to Image Generation mode. |
| 8 | Open Settings (⚙️) | ✅ Zoe's settings modal opens in Discord dark theme. |
| 9 | Click 🧠 (memory FAB) | ✅ Slide-out panel opens. |
| 10 | Save a memory | ✅ Appears in list. Reload page → still there. |
| 11 | Toggle Recall, send chat | ✅ Top-3 recalled memories prepended to system prompt. |
| 12 | Pages → Squidoo editor | ✅ Stacked-block editor renders. |
| 13 | Pages → Piczo editor | ✅ Free-form canvas renders. |
| 14 | Theme picker on a page | ✅ minimal/sunset/midnight/forest applies. |
| 15 | localStorage check | ✅ `sh_*`, `us-state`, `us-clone`, `us-persona`, `us-mem-user-id` all present. |
| 16 | Console on reload | ✅ No errors after reload. |
| 17 | Switch clone, send chat | ✅ Footer shows new clone label + engine used + fallbacks. |
| 18 | Static smoke | ✅ All assets serve 200. |

Note: items 4–11 require `/api/proxy` (and 10–11 require KV) to be
reachable. Without a deployed Cloudflare Pages project, Pollinations
(the keyless engine) will still work because Unicorn's IIFE has
fallback paths to call it directly.

## Deploy

See **`DEPLOY.md`** for the full step-by-step. TL;DR:

1. Create KV namespace `agent-zoe-memory`
2. Connect repo to Pages (or `wrangler pages deploy`)
3. Bind KV (variable name `MEMORY` → namespace `agent-zoe-memory`)
4. Add secrets (any subset of the 5 engine keys; Pollinations is keyless)
5. Visit `https://<project>.pages.dev`

## Engines (Phase 7+)

| Engine | Free tier | Card required? | Variable name |
|---|---|---|---|
| **Pollinations** | Keyless, unlimited | No | (none) |
| **Mistral** | 500 req/mo | No | `MISTRAL_API_KEY` |
| **Groq** | Generous (varies) | No | `GROQ_API_KEY` |
| **DeepSeek** | 50 req/day | No | `DEEPSEEK_API_KEY` |
| **Gemini** | 15 RPM, 1500 RPD | No | `GEMINI_API_KEY` |
| **HuggingFace** | Limited (image gen) | No | `HUGGINGFACE_API_KEY` |
| **OpenRouter** | Many free models | No | `OPENROUTER_API_KEY` (commented out) |
| **Together AI** | $5 credit | No | `TOGETHER_API_KEY` (commented out) |
| **Fireworks** | $1 credit | No | `FIREWORKS_API_KEY` (commented out) |

The Worker uses **429 auto-fallback**: if your lead engine hits a rate
limit, the chain auto-advances to the next engine in the clone's
chain. The footer of each AI bubble shows which engine actually
responded + which fallbacks were tried.

## Clones (Phase 8)

6 clones, each = `{ DNA profile + engine chain }`. Switch via Settings
dropdown.

| Clone | DNA | Engine chain | Notes |
|---|---|---|---|
| `opus-clone` | Claude Opus | groq → pollinations | Thoughtful, long-form |
| `gpt5-clone` | GPT-4o | gemini → pollinations | Balanced, multimodal |
| `reasoning-clone` | Reasoning | deepseek → pollinations | Step-by-step logic |
| `speed-clone` | Neutral | pollinations | Fast, keyless |
| `polly-clone` | Neutral | pollinations | Zero-setup, works day 0 |
| `mavis-clone` | Mavis DNA + Mavis persona | groq → pollinations | This assistant's voice |

## Persona (Phase 11)

**Mavis** is the default persona. It's a voice overlay on top of any
clone's DNA. Steers tone without changing content.

- Opinionated, direct, casual connectors ("yeah", "tbh")
- No "Great question!" / "Hope this helps!" / bullet recitals of
  capabilities
- Self-correcting ("wait, that last bit's off")
- Push-back-once-then-commit

Other clones can pin to Mavis (default), opt out (`persona: false`),
or fall through to whatever persona is set in the dropdown.

## Memory (Phases 9–10)

- **Save:** Click the 🧠 FAB, type a note, hit Save. Or use the 💾
  icon on any AI message. Or just chat — every 3rd user turn
  auto-saves (throttled).
- **Recall:** Toggle "Recall" in the memory panel. When on, the next
  chat request finds the top-3 most relevant memories (keyword scoring
  + recency) and prepends them to the system prompt.
- **Storage:** Cloudflare KV, `agent-zoe-memory` namespace, bound as
  `MEMORY` on the Pages project. 200 memories per user, 30-day idle
  expiry.
- **Identity:** Browser-keyed (UA + origin + localStorage salt). No
  sign-in required. Cross-device claim is a v3 feature.

## Layout

```
merged/
├── index.html                ← merged page (Social Hub DOM + #usApp mount)
├── style.css                 ← merged stylesheet (Social Hub base + Unicorn tokens + glue)
├── app.js                    ← merged JS (Social Hub + merge glue + Unicorn)
│
├── files.js                  ← Unicorn's file store (IndexedDB)
├── live-css.js               ← Unicorn's live CSS hot-reload
├── live-js.js                ← Unicorn's cache-bust dynamic import helper
├── editor.js                 ← Unicorn's in-app code editor (dormant in v1)
├── build-agent.js            ← Unicorn's build agent (dormant in v1)
│
├── dna-profiles.js           ← Phase 8: 6 DNA profiles
├── clones.js                 ← Phase 8: 6 clones (DNA + engine chain)
├── clone-state.js            ← Phase 8: localStorage-backed active clone
├── clone-picker.js           ← Phase 8: Settings modal injection
├── personas.js               ← Phase 11: PERSONAS + PersonaState
├── persona-picker.js         ← Phase 11: Settings modal injection
├── memory.js                 ← Phase 9: KV-backed memory browser module
├── memory-ui.js              ← Phase 10: FAB + slide-out panel + per-msg save
│
├── functions/
│   └── api/
│       ├── proxy/
│       │   ├── index.js      ← POST /api/proxy (5 engines + 429 fallback)
│       │   └── status.js     ← GET /api/proxy/status
│       └── memory/
│           ├── [userId].js   ← GET/POST/DELETE /api/memory/<userId>
│           └── search.js     ← POST /api/memory/search
│
├── DEPLOY.md                 ← Cloudflare deploy guide (NEW in Phase 12)
├── MERGE.md                  ← Unicorn's own integration contract (reference)
│
├── index.html.template       ← near-ready HTML template (kept for reference)
├── snippets/
│   ├── uschat-glue.js        ← earlier draft of the chat-routing glue (superseded by inline SECTION B in app.js)
│   └── theme-align.css       ← optional: align --sh-* tokens to --us-* values
└── README.md                 ← this file
```

## Source provenance

- **Social Hub** source: `../original-projects/social-hub/`
- **Unicorn Sparkles** source: `../original-projects/unicorn-sparkles/`

`original-projects/` is the read-only truth. **Never edit it.**

## Where to look first

- **New agent picking up the merge?** Read `../GAME_PLAN.md` first.
- **Want the merge mechanics?** Read `../MERGE_PLAN.md`.
- **Want the strategic rationale?** Read `../integration-strategy/`.
- **Want to deploy?** Read `DEPLOY.md` (this directory).
- **Want the integration contract from Unicorn's POV?** Read `MERGE.md`.

## Status

✅ **Merged, smoke-tested, deployable.** All 229 phase assertions pass.

| Phase | Status |
|---|---|
| 0–6 (merge) | ✅ done |
| 7 (Worker hardening) | ✅ 32/32 |
| 8 (DNA + clones) | ✅ 98/98 |
| 9 (KV memory) | ✅ 54/54 |
| 10 (Memory UI) | ✅ 25/25 |
| 11 (Mavis persona) | ✅ 20/20 |
| 12 (Deploy guide) | ✅ done (this file + DEPLOY.md) |
| 13 (Final smoke + zip) | ✅ done |

---
**Heartbeat:** This project is powered by a lot of hard work and emotional investment. 💓 (Triggered redeploy to sync secrets).
