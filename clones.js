/* ============================================================================
 * clones.js — Clone registry
 * ----------------------------------------------------------------------------
 * A clone is a (DNA profile + engine chain) pair. When the user picks a
 * clone, every chat request is sent with:
 *
 *   {
 *     chain: clone.engines,           // Worker iterates and falls back
 *     dna: DNA_PROFILES[clone.dna],   // Style overlay
 *     messages, sysPrompt, persona
 *   }
 *
 * Adding a new clone = one entry here, no other code change. The DNA field
 * references a key in DNA_PROFILES (dna-profiles.js). The engines array is
 * an ordered fallback chain; the Worker walks it on 429 / 402 / empty.
 *
 * Engine IDs must match keys in OPENAI_COMPAT or SPECIAL in the Worker.
 * Currently supported: mistral, groq, deepseek, gemini, pollinations.
 * (Puter and Workers AI are browser-routed by Unicorn and not yet
 * available via /api/proxy.)
 * ============================================================================ */

window.CLONES = [
  {
    id: 'opus-clone',
    label: '🧠 Claude Opus (free clone)',
    description: 'Careful, structured prose. Best for analysis, long-form writing, and reasoning through tradeoffs.',
    dna: 'DNA_CLAUDE_OPUS',
    engines: ['openrouter', 'groq', 'mistral', 'deepseek', 'pollinations', 'kilo', 'llm7', 'nvidia']
  },
  {
    id: 'gpt5-clone',
    label: '🤖 GPT-5 (free clone)',
    description: 'Crisp, friendly, code-ready. Best for everyday tasks and quick answers.',
    dna: 'DNA_GPT4O',
    engines: ['openrouter', 'groq', 'mistral', 'pollinations', 'kilo', 'llm7', 'nvidia']
  },
  {
    id: 'reasoning-clone',
    label: '🧮 Reasoning mode',
    description: 'Chain-of-thought, step-by-step. Best for hard problems, debugging, and decisions.',
    dna: 'DNA_REASONING',
    engines: ['deepseek', 'gemini', 'groq', 'pollinations', 'kilo', 'llm7', 'nvidia']
  },
  {
    id: 'speed-clone',
    label: '⚡ Speed mode',
    description: 'Minimal prompt, fastest path. Best for quick Q&A and short answers.',
    dna: 'DNA_NEUTRAL',
    engines: ['groq', 'pollinations', 'kilo', 'llm7', 'nvidia']
  },
  {
    id: 'polly-clone',
    label: '🌸 Pollinations (keyless)',
    description: 'Always-on, no setup required. Best for first-time users and zero-key deployments.',
    dna: 'DNA_NEUTRAL',
    engines: ['pollinations', 'groq']
  },
  {
    id: 'mavis-clone',
    label: '🦉 Mavis (Phase 11)',
    description: 'Opinionated, direct, casual. Personality baked into the clone via the Mavis persona overlay.',
    dna: 'DNA_MAVIS',
    engines: ['openrouter', 'groq', 'mistral', 'pollinations'],
    persona: 'mavis'  // Phase 11: pin to the Mavis voice.
  }
];
