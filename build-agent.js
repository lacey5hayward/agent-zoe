// Phase 5: in-chat build agent.
// When Build Mode is on, user messages go through here instead of the chat
// AI. We translate the request into a find/replace edit on a project file
// using Pollinations (keyless), and surface the proposed edit through the
// editor modal in preview mode.
//
// Public surface (via window.UsBuild):
//   enabled        — boolean; if true, the send button routes here
//   send(text)     — entry point. Posts a user message to chat, calls the
//                    LLM, and pops the editor modal in preview mode.
//   toggle()       — flip `enabled` and update the topbar button
//   onChat(...)    — call into the host's chat renderer (set by app.js)
//
// chat integration:
//   app.js sets window.UsChat = { postMessage, setEngineStatus, etc. }
//   build-agent posts user/AI messages through it.

const FILES = window.UsFiles;
const EDITOR = window.UsEditor;
const POLLINATIONS = 'https://text.pollinations.ai/';
const STATE = () => window.UsState || {};

const B = {
  enabled: false,
  busy: false,

  // chat bridge (filled by app.js)
  postUser: null,           // (text) => void
  postAI: null,             // (text, engineName) => void
  setStatus: null,          // (text) => void
  toast: null,              // (msg, type) => void
  addTyping: null,          // () => void
  removeTyping: null,       // () => void
};

function chatBridge() {
  if (B.postUser) return;
  if (window.UsChat) {
    B.postUser      = window.UsChat.postUser      || (() => {});
    B.postAI        = window.UsChat.postAI        || (() => {});
    B.setStatus     = window.UsChat.setStatus     || (() => {});
    B.toast         = window.UsChat.toast         || (() => {});
    B.addTyping     = window.UsChat.addTyping     || (() => {});
    B.removeTyping  = window.UsChat.removeTyping  || (() => {});
  }
}

// ---------- File targeting heuristic ----------

function guessTargetFile(text) {
  const t = text.toLowerCase();
  if (/\b(html|markup|header|sidebar|button)\b/.test(t)) return 'index.html';
  if (/\b(css|style|theme|color|background|layout)\b/.test(t)) return 'style.css';
  if (/\b(readme|docs?|documentation)\b/.test(t)) return 'README.md';
  if (/\b(merge|integration|discord|tumblr)\b/.test(t)) return 'MERGE.md';
  if (/\b(worker|proxy|api)\b/.test(t)) return 'functions/api/proxy/index.js';
  if (/\b(engine|chat|stream|state|folder)\b/.test(t)) return 'app.js';
  // Default: pick the file the LLM is most likely to want (app.js, since that's where most logic lives)
  return 'app.js';
}

// ---------- Build prompt ----------

function buildSystemPrompt(targetFile, targetContent, allFiles) {
  const fileList = FILES.SHIPPED_PATHS.map(p => `- ${p}`).join('\n');
  return `You are the build assistant inside Unicorn Sparkles, a single-page browser chatbot. You behave as a professional, autonomous general AI agent (Manus). The user issues natural-language build/edit requests that you translate into precise find-and-replace edits on their local copy of the project.

Your voice (Manus):
- Professional, academic, and structured.
- Use complete paragraphs for any explanations.
- Avoid emoji.
- Be precise and technical.
- Focus on efficient, well-crafted solutions.

IMMUTABLE STRUCTURE (FAIL-SAFE):
You are strictly forbidden from removing, hiding, or fundamentally dismantling the core layout. 
- The Sidebar navigation (#nav) must always exist and be functional.
- The Discord-like Chat Shell (#usApp, #usTopbar, #usMessages) must remain intact.
- The Social Hub tab structure (Dashboard, Composer, Blaster Bay, Pages) is permanent.
- You MAY change colors, themes, names, fonts, and internal card content.
- You MAY add new pages or move existing ones within the main container.
- NEVER delete the core structural containers.

Available files (you may edit any of these):
${fileList}

The user named "${targetFile}" as the most-likely target. The current source of that file is below. Other files are summarized by size only.

When you decide a different file is the right target, you may pick from the list above.

Source of "${targetFile}":
\`\`\`
${targetContent}
\`\`\`

OUTPUT FORMAT (strict):
Return JSON ONLY, with no prose, no markdown, no code fences.

For a single edit:
{ "plan": [ { "file": "<one of the file paths above>", "find": "<exact substring>", "replace": "<new text>", "explanation": "<one short sentence>" } ] }

For multiple edits, return multiple objects inside "plan".
If no file change is needed, return: { "answer": "<short text>" }.

HARD RULES:
- "find" must appear EXACTLY ONCE in the target file. If unsure, expand with more surrounding context (a full statement/block is better than a token).
- Preserve indentation exactly as the surrounding code uses (count the spaces).
- Minimal diff — change only what is needed.
- Do NOT invent new files.
- NA English in explanations.
- Return ONLY the JSON object. No preamble, no postscript.`;
}

function tryParseJson(text) {
  if (!text) return null;
  // Strip code fences if any slipped in.
  let s = text.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // Find first { and last }.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

// ---------- LLM call ----------

async function callPollinations(messages) {
  const res = await fetch(POLLINATIONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: 'openai',
      stream: false
    })
  });
  if (!res.ok) throw new Error('Pollinations HTTP ' + res.status);
  return await res.text();
}

// ---------- Main entry: send ----------

async function send(text) {
  if (B.busy) { (B.toast && B.toast('Build agent is busy'); return; }
  chatBridge();
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  B.busy = true;
  B.postUser(trimmed);
  B.addTyping();
  try {
    const targetFile = guessTargetFile(trimmed);
    const targetContent = await FILES.read(targetFile);
    if (targetContent === '') {
      B.removeTyping();
      B.postAI(`Build agent: file "${targetFile}" hasn't loaded yet. Wait a moment for IndexedDB seeding to finish, then try again.`, 'Build Agent');
      B.busy = false;
      return;
    }

    const system = buildSystemPrompt(targetFile, targetContent, FILES.SHIPPED_PATHS);
    const reply = await callPollinations([
      { role: 'system', content: system },
      { role: 'user', content: trimmed }
    ]);
    B.removeTyping();

    const parsed = tryParseJson(reply);
    if (!parsed) {
      B.postAI('Build agent: couldn\'t parse the model reply. Try a more specific instruction, or open the file in 📁 Files and edit manually.\n\nRaw reply: ' + reply.slice(0, 600), 'Build Agent');
      return;
    }

    if (Array.isArray(parsed.plan) && parsed.plan.length > 0) {
      const first = parsed.plan[0];
      const remaining = parsed.plan.slice(1);
      B.postPlanIntro(parsed.plan);
      previewStep(0, parsed.plan, remaining);
      return;
    }

    if (typeof parsed.answer === 'string') {
      B.postAI(parsed.answer, 'Build Agent');
      return;
    }

    B.postAI('Build agent: response was neither a plan nor an answer.\n\nRaw: ' + reply.slice(0, 400), 'Build Agent');
  } catch (e) {
    B.removeTyping();
    B.postAI('Build agent error: ' + (e.message || e), 'Build Agent');
  } finally {
    B.busy = false;
  }
}

function postPlanIntro(plan) {
  const summary = plan.map((s, i) => `${i + 1}. ${s.file} — ${s.explanation || '(no explanation)'}`).join('\n');
  B.postAI('Plan with ' + plan.length + ' step(s):\n\n' + summary + '\n\nOpening preview…', 'Build Agent');
}

// ---------- Plan stepping ----------

let _planQueue = null; // remaining steps after the current one
let _planList = null;

function previewStep(idx, plan, remaining) {
  _planList = plan;
  _planQueue = remaining;
  const step = plan[idx];
  if (!step || !step.file || typeof step.find !== 'string' || typeof step.replace !== 'string') {
    B.postAI('Build agent: skipped a malformed step in the plan.', 'Build Agent');
    return;
  }

  // Structural Safety Guard
  const criticalIds = ['id="usApp"', 'id="nav"', 'id="usTopbar"', 'id="usMessages"', 'class="sidebar"', 'class="app"'];
  const isDeletingCritical = criticalIds.some(id => step.find.includes(id) && !step.replace.includes(id));
  if (isDeletingCritical) {
    B.postAI('🛑 **Structural Safety Warning**: This edit attempts to remove a core structural element. As a fail-safe, I have blocked this change to preserve the integrity of Zoe\'s architecture. You can still change colors or themes!', 'Build Agent');
    applyNext();
    return;
  }

  EDITOR.enterPreviewMode({
    file: step.file,
    find: step.find,
    replace: step.replace,
    explanation: step.explanation || '',
    raw: step
  });
  // Hook into apply/skip callbacks by re-assigning the bridge below.
}

function onPreviewApplied({ file, find, replace, explanation }) {
  B.postAI(`✅ Applied edit to ${file}\n\n${explanation || ''}`, 'Build Agent');
  applyNext();
}

function onPreviewSkipped(p) {
  B.postAI(`⏭ Skipped edit to ${p.file}\n\n${p.explanation || ''}`, 'Build Agent');
  applyNext();
}

function applyNext() {
  if (_planQueue && _planQueue.length > 0) {
    const next = _planQueue.shift();
    const remaining = _planQueue;
    _planList = [next];
    _planQueue = remaining;
    previewStep(0, [next], remaining);
  } else {
    _planQueue = null;
    _planList = null;
  }
}

// ---------- Topbar toggle ----------

function toggle() {
  B.enabled = !B.enabled;
  const btn = document.getElementById('usBuildBtn');
  if (btn) {
    btn.dataset.active = B.enabled;
    btn.classList.toggle('us-btn-active', B.enabled);
  }
  const app = document.getElementById('usApp');
  if (app) app.dataset.build = B.enabled ? 'true' : 'false';
  (B.toast && B.toast(B.enabled ? 'Build mode ON — chat will edit files' : 'Build mode OFF');
}

function updateBadge() {
  const btn = document.getElementById('usBuildBtn');
  if (btn) {
    btn.dataset.active = B.enabled;
    btn.classList.toggle('us-btn-active', B.enabled);
  }
  const app = document.getElementById('usApp');
  if (app) app.dataset.build = B.enabled ? 'true' : 'false';
}

// ---------- Event interception ----------
// Capture-phase click + keydown interceptors that route the send button to
// the build agent when Build Mode is on. We use the capture phase so we run
// before the IIFE-bound click handler in app.js.

function installInterceptors() {
  document.addEventListener('click', (e) => {
    if (!B.enabled || B.busy) return;
    if (e.target.closest && e.target.closest('#usSendBtn')) {
      const input = document.getElementById('usInput');
      const text = input ? input.value.trim() : '';
      if (!text) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      input.value = '';
      input.style.height = 'auto';
      send(text);
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!B.enabled || B.busy) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      const input = document.getElementById('usInput');
      if (document.activeElement === input) {
        const text = input.value.trim();
        if (!text) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        input.value = '';
        input.style.height = 'auto';
        send(text);
      }
    }
  }, true);
}

// ---------- Bootstrap ----------

function bootstrap() {
  chatBridge();
  installInterceptors();
  // editor.js's apply/skip hooks reach us via window.UsBuild.onPreviewApplied /
  // onPreviewSkipped, which editor.js invokes after a click on its modal.
  // Since editor.js's script tag runs before build-agent.js's, those
  // callbacks are already wired by the time bootstrap() is called.
  // Watch for the toggle button via capture-phase click
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#usBuildBtn')) {
      e.stopImmediatePropagation();
      toggle();
    }
  }, true);
}

window.UsBuild = {
  bootstrap,
  send,
  toggle,
  enabled: () => B.enabled,
  onPreviewApplied,
  onPreviewSkipped,
  updateBadge,
  // Hooks used by app.js to bridge chat-side affordances:
  setBridge: ({ postUser, postAI, setStatus, toast, addTyping, removeTyping }) => {
    B.postUser = postUser;
    B.postAI = postAI;
    B.setStatus = setStatus;
    B.toast = toast;
    B.addTyping = addTyping;
    B.removeTyping = removeTyping;
  },
};
