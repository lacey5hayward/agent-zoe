# `merged/` — the final deliverable

This is the directory the resumed merge session writes into.

## Final layout

```
merged/
├── README.md                         ← what this product is, how to run it
├── index.html                        ← merged page (built in MERGE_PLAN.md §3 Step 2)
├── style.css                         ← merged stylesheet (built in Step 3)
├── app.js                            ← merged JS (built in Step 4)
│
├── files.js                          ← copy from unicorn-sparkles (Step 1)
├── live-css.js                       ← copy from unicorn-sparkles (Step 1)
├── live-js.js                        ← copy from unicorn-sparkles (Step 1)
├── editor.js                         ← copy from unicorn-sparkles (Step 1, dormant in v1)
├── build-agent.js                    ← copy from unicorn-sparkles (Step 1, dormant in v1)
│
├── MERGE.md                          ← Unicorn's own integration contract, kept for reference
│
├── functions/
│   └── api/
│       └── proxy/
│           ├── index.js              ← Cloudflare Worker (copy from unicorn-sparkles)
│           └── status.js             ← Cloudflare Worker (copy from unicorn-sparkles)
│
├── index.html.template               ← near-ready HTML template for the resumed agent
└── snippets/
    ├── uschat-glue.js                ← the chat-routing glue snippet (seam #1)
    └── theme-align.css               ← optional: align --sh-* tokens to --us-* values
```

## Files in this directory right now

- `README.md` — what you're reading… but you should also check the merged one once produced.
- `index.html.template` — the bootstrap HTML the resumed agent customizes.
- `snippets/` — reusable code blocks saved as standalone files for copy-paste.
- The expected final files (`index.html`, `style.css`, `app.js`, etc.) **are not yet present**. That's the work to be done.
