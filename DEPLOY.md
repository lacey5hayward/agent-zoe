# DEPLOY.md — Agent Zoe (Complete)

> **What this is.** The full deploy guide for Agent Zoe. Covers Cloudflare
> Pages hosting, KV memory store, GitHub for code backup + auto-deploy,
> webhooks for external notifications, and **all 9 integrated engines**
> (Pollinations + 6 other keyless + Azure OpenAI + Oracle OCI). AWS
> Bedrock is documented but requires a SigV4 proxy (not directly callable
> from a Cloudflare Worker without one).
>
> **Time estimate:** 30 min first deploy (no keys), +5 min per engine key.
>
> **What you get at the end:** A live URL like
> `https://agent-zoe.pages.dev` with chat, clones, memory, persona, and
> every engine wired up.

---

## What this guide covers

**Covers:**
- Cloudflare Pages deploy (the host)
- Cloudflare KV (the memory store)
- GitHub (code backup + auto-deploy + webhook source)
- Discord webhooks (notifications + bot)
- **All 9 engines** in the Worker:
  1. **Pollinations** (keyless, day-0)
  2. **Kilo** (keyless, auto:free model)
  3. **LLM7** (keyless, anonymous)
  4. **OpenCode Zen** (keyless)
  5. **BazaarLink** (keyless, auto:free)
  6. **OVH AI Endpoints** (keyless, ~2 req/min)
  7. **NVIDIA NIM** (keyless, 100+ models, 40 RPM)
  8. **Azure OpenAI** (paid, $200 credit, card required)
  9. **Oracle OCI Generative AI** (always-free tier, Llama 3.1 70B)
- AWS Bedrock (documented as needing a SigV4 proxy)
- Email-ecosystem bot keys (Gmail → Google, Outlook → Microsoft)

**Doesn't cover (intentionally):**
- Custom domain setup (covered briefly in §11)
- OAuth login flows (v2 feature)
- Cross-device memory claim (v2 feature)
- Email-to-SMS gateway setup (separate setup, not in this build)

---

## TL;DR (5-step version)

1. **Set up GitHub** (account + repo + PAT).
2. **Set up webhooks** (Discord for notifications).
3. **Create Cloudflare KV namespace** (`agent-zoe-memory`).
4. **Deploy to Cloudflare Pages** from GitHub.
5. **Add API keys** for any of the 9 engines you want (Pollinations works day 0 with zero keys).

---

## Section 1 — GitHub Setup (10 min, one-time)

GitHub gives you: code backup, version control, auto-deploy to
Cloudflare, and a webhook source for "when code is pushed" events.

### 1.1 — Create GitHub account (if needed)

1. Go to **github.com**
2. Sign up (use your new Gmail, not iCloud — you're migrating)
3. Verify email
4. Enable 2FA (recommended)

### 1.2 — Create Personal Access Token (PAT)

1. GitHub → click avatar (top-right) → **Settings**
2. **Developer settings** (bottom of left sidebar)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. **Note:** `agent-zoe-deploy`
6. **Expiration:** 90 days
7. **Scopes:**
   - `repo` (full repo access)
   - `workflow` (for GitHub Actions if you ever use them)
8. **Generate token** → **COPY IT NOW** (you can't see it again)
9. Save in your notes: `GITHUB_PAT`

### 1.3 — Create the agent-zoe repository

1. GitHub → top-right **+** → **New repository**
2. **Name:** `agent-zoe`
3. **Description:** `Agent Zoe — Social Hub + Unicorn chat`
4. Public or Private (your choice)
5. **Don't** initialize with README (we have one)
6. Click **Create repository**
7. Copy the URL: `https://github.com/YOUR_USERNAME/agent-zoe.git`

### 1.4 — Push the Zoe code

From the unzipped package directory:

```bash
cd build/zoe/merged
git init
git add -A
git commit -m "Initial Agent Zoe build — Phases 0-13 complete"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent-zoe.git
git push -u origin main
```

GitHub will ask for username + PAT (not password).

**Save:** `GITHUB_USERNAME`, `GITHUB_PAT`, `GITHUB_REPO`

---

## Section 2 — Webhooks Setup (10 min, one-time)

### 2.1 — Discord Webhook (for notifications)

**What this does:** Zoe posts messages to a Discord channel
("Engine fallback triggered", "Memory saved", etc.). You get
mobile push notifications.

1. Open Discord → your server
2. Right-click a channel → **Edit Channel** → **Integrations** → **Webhooks**
3. **New Webhook**
4. **Name:** `Agent Zoe`
5. **Channel:** `#zoe-logs` (or whatever)
6. **Copy Webhook URL**
7. Save: `DISCORD_WEBHOOK_URL`

### 2.2 — Discord Bot (for chatbot features, optional)

1. **discord.com/developers/applications** → **New Application**
2. Name: `Agent Zoe` → **Create**
3. Left sidebar → **Bot** → **Add Bot**
4. **Copy token** → save as `DISCORD_BOT_TOKEN`
5. Enable **Message Content Intent**
6. **OAuth2 → URL Generator:**
   - Scopes: `bot`
   - Permissions: Send Messages, Read History, Embed Links
7. Open generated URL, invite to your server

### 2.3 — Test Webhook (for debugging)

1. Go to **webhook.site**
2. Copy the unique URL
3. Save as `TEST_WEBHOOK_URL`

---

## Section 3 — Create Cloudflare KV Namespace (2 min)

1. **dash.cloudflare.com** → **Workers & Pages** → **KV** tab
2. **Create a namespace**
3. **Name:** `agent-zoe-memory`
4. **Add**
5. **Copy the Namespace ID**

---

## Section 4 — Deploy to Cloudflare Pages (10 min)

### 4.1 — Connect GitHub to Cloudflare

1. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. **GitHub** → **Authorize Cloudflare**
3. Select your `agent-zoe` repo → **Begin setup**

### 4.2 — Configure build

- **Project name:** `agent-zoe`
- **Production branch:** `main`
- **Framework preset:** **None** ← critical
- **Build command:** (empty)
- **Build output directory:** `/` (single slash)
- **Root directory:** (empty)
- Click **Save and Deploy**

Wait ~1 min. URL: `https://agent-zoe.pages.dev`

### 4.3 — Auto-deploy

Cloudflare watches your repo. Every push to `main` redeploys automatically.

---

## Section 5 — Bind KV to Pages Project (2 min)

1. **Workers & Pages** → `agent-zoe` project
2. **Settings** → **Functions** (left sidebar)
3. **KV namespace bindings** → **Add binding**
4. **Variable name:** `MEMORY` (exact, all caps)
5. **KV namespace:** select `agent-zoe-memory`
6. **Save** → auto-redeploys

**Memory features now work.**

---

## Section 6 — Add Engine Secrets (5 min per engine)

The Worker has **9 engine slots** in `functions/api/proxy/index.js`:

### 6.1 — The 7 Keyless Engines (work day 0, no setup)

| # | Engine | Secret needed? | Rate limit | Notes |
|---|--------|----------------|------------|-------|
| 1 | **Pollinations** | None | Generous | Default, always available |
| 2 | **Kilo** | None | ~10 RPM | `auto:free` auto-routes |
| 3 | **LLM7** | None | Varies | Anonymous tier |
| 4 | **OpenCode Zen** | None | Varies | Free tier |
| 5 | **BazaarLink** | None | 10 RPM / 150/day | `auto:free` |
| 6 | **OVH AI** | None | ~2 req/min | Anonymous, drifts in/out |
| 7 | **NVIDIA NIM** | None | 40 RPM | 100+ models, no quota |

**All 7 work with zero setup.** They all have `secret: null` in the
Worker. The clones (`clones.js`) already include several in their
fallback chains.

### 6.2 — Azure OpenAI (paid, $200 credit, card required)

**Get the key:**

1. Go to **ai.azure.com**
2. Sign in with your **Outlook** account
3. **Create a resource** → search "Azure OpenAI"
4. Fill in:
   - Subscription: free trial
   - Resource group: create new → `agent-zoe-rg`
   - Region: pick closest (e.g. East US)
   - Name: `agent-zoe-openai`
   - Pricing tier: **Standard S0**
5. **Review + Create** → **Create**
6. Wait ~2 min
7. Go to resource → **Keys and Endpoint** (left sidebar)
8. Copy **KEY 1** and **ENDPOINT**

**Save:**
- `AZURE_OPENAI_API_KEY` — the key
- `AZURE_OPENAI_ENDPOINT` — e.g. `https://agent-zoe-openai.openai.azure.com`
- (Optional) `AZURE_OPENAI_DEPLOYMENT` — e.g. `gpt-4o` (defaults to model name)

**Paste into Cloudflare:**

1. **Workers & Pages** → `agent-zoe` project → **Settings** → **Environment variables**
2. **Add variable:**
   - Name: `AZURE_OPENAI_API_KEY`
   - Value: paste your key
3. **Add variable:**
   - Name: `AZURE_OPENAI_ENDPOINT`
   - Value: paste your endpoint URL
4. (Optional) **Add variable:**
   - Name: `AZURE_OPENAI_DEPLOYMENT`
   - Value: `gpt-4o` (or whatever you named your deployment)
5. **Save** → auto-redeploys

**What it unlocks:** GPT-4o, GPT-4 Turbo, GPT-4, etc. via Azure. The
`gpt5-clone` works. Uses `api-key` header (not Bearer) — Worker handles this.

### 6.3 — Oracle OCI Generative AI (always-free tier hosts Llama 3.1 70B)

**Get the key:**

1. Go to **cloud.oracle.com** → sign in (create account if needed, card required for sign-up but not charged for always-free)
2. Create a **Compartment** (or use root)
3. **Identity & Security** → **Users** → your user → **API Keys** → **Add API Key**
4. Copy:
   - **User OCID** (looks like `ocid1.user.oc1..aaaa...`)
   - **Tenancy OCID** (looks like `ocid1.tenancy.oc1..aaaa...`)
   - **Fingerprint** (looks like `aa:bb:cc:dd:...`)
   - **Private Key** (PEM format, download it)
5. **Create a Dedicated AI Cluster** (free tier):
   - **Analytics & AI** → **Generative AI** → **Dedicated AI clusters** → **Create cluster**
   - Name: `agent-zoe-cluster`
   - Region: us-chicago-1 (required for OpenAI-compat endpoint)
   - Compartment: root
6. Wait ~5 min for cluster to provision
7. Once active, click cluster → **Generate API Key** (this is the Bearer-style key the Worker uses)

**Save:**
- `ORACLE_API_KEY` — the Bearer key from the cluster
- (For full SigV4, also save the OCIDs + private key, but our Worker uses the simpler Bearer path)

**Paste into Cloudflare:**

1. **Workers & Pages** → `agent-zoe` project → **Settings** → **Environment variables**
2. **Add variable:**
   - Name: `ORACLE_API_KEY`
   - Value: paste your OCI API key
3. **Save** → auto-redeploys

**What it unlocks:** Llama 3.1 70B via Oracle's OpenAI-compatible
endpoint in us-chicago-1. Always-free tier.

**Note:** If you want full IAM SigV4 auth (more secure), edit
`functions/api/proxy/index.js` to add a custom OCI signer. The current
implementation uses the simpler Bearer-style key from dedicated
clusters.

### 6.4 — AWS Bedrock (documented, not directly wired)

**Why not directly:** Bedrock requires AWS SigV4 signing on every
request. Cloudflare Workers don't have a built-in SigV4 signer for
Bedrock, and the OCI-style Bearer key path doesn't exist on AWS.

**Two options:**

**Option A — API Gateway proxy:**
1. Create an AWS API Gateway HTTP API
2. Backend is a Lambda function that signs and forwards to Bedrock
3. API Gateway URL becomes a regular OpenAI-compatible endpoint
4. Add as a `bedrock` entry in the Worker

**Option B — Skip Bedrock, use the alternatives:**
- Llama 3.1 70B → already in Oracle (free) and Groq (free with key)
- Claude 3.5 → use via OpenRouter (one key, many models) or direct
  Anthropic API ($5 trial)
- Mistral Large → use via Mistral direct (free) or OpenRouter

**To get AWS Bedrock access if you still want it:**
1. AWS account (card required)
2. Enable Bedrock in your region
3. Request model access (Claude, Llama, etc.)
4. Use it via AWS Console playground or the SigV4 path above

**Free tier:** $100 signup credit + up to $100 more by using services
= up to $200 over 6 months. Not a permanent free tier.

### 6.5 — Other Engines (existing in Worker, optional)

The Worker also has commented-out entries for:

| Engine | Secret var | Card? | Notes |
|---|---|---|---|
| **Mistral** | `MISTRAL_API_KEY` | No | 500 req/mo free |
| **Groq** | `GROQ_API_KEY` | No | Very fast, generous |
| **DeepSeek** | `DEEPSEEK_API_KEY` | No | 50 req/day free |
| **HuggingFace** | `HUGGINGFACE_API_KEY` | No | Image gen |
| **OpenRouter** | `OPENROUTER_API_KEY` | No | 200+ models, 50 req/day free |
| **Together AI** | `TOGETHER_API_KEY` | No | $5 credit |
| **Fireworks** | `FIREWORKS_API_KEY` | No | $1 credit |

To enable: open `functions/api/proxy/index.js`, find `OPENAI_COMPAT`,
uncomment the entry, add the secret, commit, push.

---

## Section 7 — Webhook → Worker Connection (10 min)

### 7.1 — Discord Webhook → Zoe Notifications

To enable fallback notifications:

1. Open `functions/api/proxy/index.js` in your editor
2. Find `callWithFallback` (around line 240)
3. After a successful fallback, add:

```js
if (result.usedFallback && result.usedFallback.length > 0 && env.DISCORD_WEBHOOK_URL) {
  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `⚠️ Engine fallback: tried ${result.usedFallback.join(', ')}, succeeded with ${result.engine}`
    })
  }).catch(() => {});
}
```

4. Add `DISCORD_WEBHOOK_URL` as Cloudflare env var (§2.1)
5. Commit + push

### 7.2 — GitHub → Cloudflare (auto-deploy)

Already automatic. Cloudflare Pages watches your repo. Every push to
`main` → redeploy in ~30 sec.

### 7.3 — Discord Bot → Zoe (chat via Discord)

To make your Discord bot forward messages to Zoe:

1. Create `functions/api/discord-webhook.js`:

```js
export async function onRequestPost(context) {
  const data = await context.request.json();
  if (data.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { 'Content-Type': 'application/json' } });
  
  const userMessage = data.content || '';
  const zoeRes = await fetch(new URL('/api/proxy', context.request.url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chain: ['pollinations', 'gemini', 'oracle', 'azure', 'kilo', 'nvidia', 'llm7', 'bazaarlink', 'opencode', 'ovh'],
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  const zoeData = await zoeRes.json();
  
  return new Response(JSON.stringify({
    type: 4,
    data: { content: zoeData.text || 'Sorry, I couldn\'t generate a response.' }
  }), { headers: { 'Content-Type': 'application/json' } });
}
```

2. Discord dev portal → your app → **General Information** → copy **Public Key**
3. Add as env var: `DISCORD_PUBLIC_KEY`
4. **Interactions Endpoint URL:** `https://agent-zoe.pages.dev/api/discord-webhook`
5. Commit + push

---

## Section 8 — Test Everything (10 min)

1. Open `https://agent-zoe.pages.dev`
2. **Composer** → **Chat** → send a message
   - Should respond via Pollinations (keyless, default)
3. **Settings (⚙️)** → **Refresh status**
   - All 7 keyless engines: "ready"
   - Azure: "ready" if you added keys, else "missing"
   - Oracle: "ready" if you added key, else "missing"
4. **🧠 (memory FAB)** → save a note → reload → still there
5. **Clone dropdown** → switch to `mavis-clone` → next message uses Mavis + Gemini (or fallback)
6. **Check Discord** (if webhook set up): fallback notifications appear
7. **Check Cloudflare Dashboard** → Deployments: latest commit "Success"
8. **Check GitHub**: code is there, Cloudflare Pages commit status "Active"

If all 8 pass, you're fully deployed. 🎉

---

## Section 9 — Going Forward

### Re-deploy after code changes

```bash
git add -A
git commit -m "description"
git push
```

Auto-redeploys in ~30 sec.

### Add a new engine

1. Open `functions/api/proxy/index.js`
2. Add an entry to `OPENAI_COMPAT` (or `SPECIAL` if non-OpenAI shape)
3. Commit + push
4. Add the matching `_API_KEY` env var if needed

### Add a new clone

Edit `clones.js`:

```js
'my-bot': {
  id: 'my-bot',
  label: 'My Bot',
  description: '...',
  dna: 'DNA_NEUTRAL',
  engines: ['azure', 'pollinations', 'kilo'],  // 9-level fallback chain
  persona: 'mavis'
}
```

Commit + push.

### Add a new persona

Edit `personas.js`:

```js
PERSONAS.custom = {
  id: 'custom',
  label: '🎯 Custom',
  description: '...',
  prompt: '...'
}
```

---

## Section 10 — Troubleshooting

### Chat doesn't respond

1. DevTools → Console → check for errors
2. Network tab → look at `/api/proxy` response body
3. If "All engines failed": at least one of your chains has no working engine
4. **Fix:** Ensure Pollinations is in at least one chain (default `speed-clone` uses it)

### KV not working

1. Check §3 — namespace created?
2. Check §5 — bound with name `MEMORY` (exact)?
3. Redeploy after binding

### GitHub push fails

- Use PAT, not password
- PAT must have `repo` scope

### Discord webhook not working

- Test with curl: `curl -X POST YOUR_WEBHOOK_URL -d '{"content":"test"}'`
- Check env var name is `DISCORD_WEBHOOK_URL` (exact)

### Engine shows "ready" but doesn't respond

- Check the key is valid (test in provider's console)
- Some providers have IP allowlists (Cloudflare's IPs may need to be added)
- Check Worker logs: Cloudflare dashboard → project → Logs

### Azure returns 401

- Check `AZURE_OPENAI_API_KEY` is correct
- Check `AZURE_OPENAI_ENDPOINT` ends with `.openai.azure.com` (no trailing slash)
- Check the deployment exists in Azure portal

### Oracle returns 401

- Check `ORACLE_API_KEY` is the cluster's Bearer key, not the IAM user's
- Check the cluster is in `us-chicago-1` (only region with OpenAI-compat endpoint)
- Check the cluster is "Active" in OCI console

---

## Section 11 — (Optional) Custom Domain

1. **Workers & Pages** → `agent-zoe` → **Custom domains** tab
2. **Set up a custom domain**
3. Enter `zoe.yourname.com`
4. If your domain is on Cloudflare, DNS auto-configures
5. Wait ~5 min for SSL

**Cost:** Domain $10-15/year (regular) or $10-50 one-time (crypto).

---

## Architecture summary

```
User browser
    ↓
agent-zoe.pages.dev (Cloudflare Pages)
    ├── Static site (HTML/CSS/JS)
    ├── /api/proxy → Worker → 9 engines
    ├── /api/memory/[userId] → Worker → KV
    └── /api/memory/search → Worker → KV

Engines (9 total):
    Keyless (day 0, no setup):
        1. Pollinations
        2. Kilo
        3. LLM7
        4. OpenCode Zen
        5. BazaarLink
        6. OVH AI
        7. NVIDIA NIM
    Paid (card required):
        8. Azure OpenAI ($200 credit, Outlook ecosystem)
        9. Oracle OCI (always-free tier, 24GB RAM)
    Documented:
        AWS Bedrock (needs SigV4 proxy)

External:
    GitHub → code + auto-deploy
    Discord → notifications + bot
    Gmail → Google bot keys (Gemini)
    Outlook → Microsoft bot keys (Azure)
```

---

## What "done" looks like (acceptance checklist)

- [ ] `https://agent-zoe.pages.dev` loads, no console errors
- [ ] All 4 nav tabs work
- [ ] Composer → Chat: AI responds (Pollinations keyless, default)
- [ ] Settings (⚙️) shows all 7 keyless engines as "ready"
- [ ] If Azure key added: `gpt5-clone` works
- [ ] If Oracle key added: `oracle` engine works
- [ ] Clones switch correctly
- [ ] Memory FAB (🧠) opens, save/recall works
- [ ] Reload → memory persists (KV working)
- [ ] GitHub repo has the code
- [ ] Push to `main` → auto-deploys in <30 sec
- [ ] Discord webhook receives notifications (if configured)
- [ ] `agent-zoe-final-v2.zip` saved locally for re-deploy

---

## Variables reference

| Variable name | Required? | Source | Purpose |
|---|---|---|---|
| `MEMORY` | Yes (binding) | Cloudflare KV | Memory store |
| `GITHUB_PAT` | Optional | GitHub | Auto-deploy |
| `DISCORD_WEBHOOK_URL` | Optional | Discord server | Outgoing notifications |
| `DISCORD_BOT_TOKEN` | Optional | Discord app | Bot account |
| `DISCORD_PUBLIC_KEY` | Optional | Discord app | Webhook signing |
| `TEST_WEBHOOK_URL` | Optional | webhook.site | Debugging |
| `GEMINI_API_KEY` | Optional | Gmail/Google | Gemini |
| `AZURE_OPENAI_API_KEY` | Optional | Outlook/Microsoft | Azure OpenAI |
| `AZURE_OPENAI_ENDPOINT` | Optional | Outlook/Microsoft | Azure endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | Optional | Outlook/Microsoft | Deployment name |
| `ORACLE_API_KEY` | Optional | Oracle OCI | Llama 3.1 70B |
| `MISTRAL_API_KEY` | Optional | Mistral | Mistral models |
| `GROQ_API_KEY` | Optional | Groq | Fast Llama |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek | Code-specialist |
| `HUGGINGFACE_API_KEY` | Optional | HuggingFace | Image gen |
| `OPENROUTER_API_KEY` | Optional | OpenRouter | 200+ models |
| `TOGETHER_API_KEY` | Optional | Together AI | 100+ models |
| `FIREWORKS_API_KEY` | Optional | Fireworks | Fast inference |

**All variables optional except `MEMORY` (binding, not secret).**
**7 engines work keyless. Add keys for the rest as needed.**

---

## What you DON'T need to do

- ❌ Don't rename `us-*` / `sh_*` IDs (namespace contracts)
- ❌ Don't edit `original-projects/` (read-only)
- ❌ Don't add a build step (plain HTML/CSS/JS)
- ❌ Don't set env vars on the Worker directly (use Pages project)
- ❌ Don't worry about CORS (Worker handles it)
- ❌ Don't need AWS Bedrock — Llama 3.1 70B is in Oracle (free) and Groq (free with key)

---

## What comes next (v2 features)

- Custom OAuth login (Discord/GitHub/Google as providers)
- Cross-device memory claim (short-code flow)
- Real Discord bot posting
- Custom domain with SSL
- AWS Bedrock via API Gateway proxy
- More clones, more personas, more engines
- Email-to-SMS push notifications

Tell me which one you want next.

---

*End of DEPLOY.md. For Worker errors, check Cloudflare Pages function
logs. For UI bugs, check browser DevTools console. For GitHub issues,
check the repo's Actions tab.*
