# AGENT ZOE — TONIGHT'S BUILD MANUAL

> **Print this. Follow it top to bottom. You should be live in 30 min.**
>
> **What you need:**
> - The `agent-zoe-final-v2.zip` file (already in your hands)
> - A Cloudflare account (free, no card) — sign up at dash.cloudflare.com
> - A GitHub account (free) — sign up at github.com
> - 30 minutes
> - A terminal / PowerShell
> - (Optional) A Gmail and/or Outlook account for paid-tier engines later

---

## PART A — UNZIP AND INSPECT (2 min)

### Step 1: Unzip the package

**Mac/Linux:**
```bash
unzip agent-zoe-final-v2.zip
cd build/zoe/merged
ls
```

**Windows:** Right-click the zip → "Extract All" → use File Explorer.

**You should see:**
- `index.html` (the page)
- `style.css`, `app.js` (the styles + logic)
- `functions/` (the Worker code)
- `DEPLOY.md` (full reference — don't read now, just know it's there)
- `UPLOAD.md` (this manual's parent)
- `README.md` (overview)

**✓ Checkpoint:** You see the files. Move to Part B.

---

## PART B — SET UP GITHUB (10 min)

GitHub = code backup + auto-deploy to Cloudflare + webhook source.

### Step 2: Create GitHub account (skip if you have one)

1. Go to **github.com** → **Sign up**
2. Use your **new Gmail** (not iCloud — you're migrating)
3. Verify email
4. Enable 2FA (Settings → Password and authentication)

### Step 3: Create Personal Access Token (PAT)

1. GitHub → click your **avatar** (top-right) → **Settings**
2. Scroll to bottom of left sidebar → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. **Note:** `agent-zoe-deploy`
6. **Expiration:** `90 days`
7. **Scopes:** check `repo` (the rest stay unchecked)
8. Click **Generate token**
9. **COPY THE TOKEN NOW** — you will never see it again
10. Paste it somewhere safe (notes app, password manager)

**Save in your notes:** `GITHUB_PAT = ghp_xxxxxxxxxxxxxxxxxxxx`

### Step 4: Create the agent-zoe repo

1. GitHub → top-right **+** → **New repository**
2. **Repository name:** `agent-zoe`
3. **Description:** `Agent Zoe`
4. Choose **Public** or **Private** (your call)
5. **DO NOT** check "Add a README file" (we have one)
6. Click **Create repository**
7. **Copy the repo URL** — looks like `https://github.com/YOUR_USERNAME/agent-zoe.git`

**Save in your notes:** `GITHUB_REPO = https://github.com/YOUR_USERNAME/agent-zoe.git`

### Step 5: Push the code to GitHub

From inside `build/zoe/merged/`:

```bash
git init
git add -A
git commit -m "Initial Agent Zoe build - Phases 0-13"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent-zoe.git
git push -u origin main
```

When prompted:
- **Username:** your GitHub username
- **Password:** paste the PAT (NOT your GitHub password)

You should see something like:
```
Enumerating objects: 57, done.
Counting objects: 100% (57/57), done.
...
To https://github.com/YOUR_USERNAME/agent-zoe.git
 * [new branch]      main -> main
```

**✓ Checkpoint:** Refresh github.com/YOUR_USERNAME/agent-zoe — you see your files.

---

## PART C — SET UP CLOUDFLARE (10 min)

Cloudflare = hosting + Worker runtime + KV memory.

### Step 6: Create the KV namespace (memory store)

1. Go to **dash.cloudflare.com** → log in
2. Left sidebar → **Workers & Pages**
3. Top of page, click the **KV** tab
4. Click **Create a namespace**
5. **Namespace name:** `agent-zoe-memory` (exact, no spaces)
6. Click **Add**
7. You'll see it in the list. You don't need to copy the ID.

**✓ Checkpoint:** `agent-zoe-memory` is in your KV namespaces list.

### Step 7: Connect the GitHub repo to Cloudflare Pages

1. Still on **dash.cloudflare.com** → **Workers & Pages**
2. Click **Create application** (top-right blue button)
3. **Pages** tab → **Connect to Git**
4. Click **GitHub** → **Authorize Cloudflare** (popup)
5. Find and select your `agent-zoe` repo
6. Click **Begin setup**

### Step 8: Configure the build (CRITICAL — get this right)

Fill in **EXACTLY** this:

- **Project name:** `agent-zoe` (becomes `agent-zoe.pages.dev`)
- **Production branch:** `main`
- **Framework preset:** `None` ← THIS MUST BE NONE, NOT Next.js, NOT Hugo
- **Build command:** *(leave empty)*
- **Build output directory:** `/` (just one slash character)
- **Root directory:** *(leave empty)*

Click **Save and Deploy**.

Wait ~1-2 minutes. You'll see:
- "Building..." then "Success"
- Your URL: **`https://agent-zoe.pages.dev`**

**✓ Checkpoint:** Open the URL in a new tab. You see a page with 4 nav tabs (Dashboard, Composer, Blaster Bay, Pages).

### Step 9: Bind the KV namespace (makes memory work)

1. On your `agent-zoe` project page → **Settings** tab
2. Left sidebar → **Functions**
3. Scroll to **KV namespace bindings**
4. Click **Add binding**
5. **Variable name:** `MEMORY` (EXACT — all caps, no quotes)
6. **KV namespace:** select `agent-zoe-memory` from the dropdown
7. Click **Save**

This auto-redeploys in ~30 seconds.

**✓ Checkpoint:** Click Composer → Chat, send a message, get a response.

---

## PART D — FIRST TEST (3 min)

### Step 10: Test that everything works

Open `https://agent-zoe.pages.dev` in your browser.

1. **You see the 4 nav tabs** (Dashboard, Composer, Blaster Bay, Pages)
   - ✓ Pass
2. **Click Composer → Chat card**
   - ✓ You see a chat interface with a topbar (⚡ Enhance / 🛠️ Build / ⚙️)
3. **Type "Hello" and hit Send**
   - ✓ You get a response (via Pollinations, keyless)
4. **Click ⚙️ Settings in the topbar**
   - ✓ You see engine list with statuses
5. **Click 🧠 (brain icon, bottom-right of chat)**
   - ✓ Memory panel slides out from the right
6. **Type a memory "I love purple" and hit Save**
   - ✓ It appears in the list
7. **Reload the page (Cmd+R or Ctrl+R)**
   - ✓ The memory is still there
8. **Check the AI bubble footer**
   - ✓ Shows which engine responded (likely "pollinations")

**All 8 pass? You're live. Move to Part E for bonus features.**

---

## PART E — ADD DISCORD WEBHOOKS (OPTIONAL, 5 min)

Webhooks let Zoe send notifications to Discord when things happen.

### Step 11: Create a Discord webhook

1. Open Discord → your server (create one if you don't have: `+` → "Create My Own")
2. Pick or create a text channel (e.g. `#zoe-logs`)
3. **Right-click the channel** → **Edit Channel** → **Integrations** tab
4. Click **Webhooks** → **New Webhook**
5. **Name:** `Agent Zoe`
6. **Copy Webhook URL** (looks like `https://discord.com/api/webhooks/123/abc...`)

**Save in your notes:** `DISCORD_WEBHOOK_URL = https://discord.com/api/webhooks/...`

### Step 12: Add the webhook to Cloudflare

1. **dash.cloudflare.com** → `agent-zoe` project → **Settings**
2. Left sidebar → **Environment variables**
3. Click **Add variable**
4. **Variable name:** `DISCORD_WEBHOOK_URL` (exact)
5. **Value:** paste your webhook URL
6. **Environment:** check `Production`
7. Click **Save**

Auto-redeploys in ~30 seconds.

**✓ Checkpoint:** When Zoe's primary engine fails and falls back, you get a Discord notification.

---

## PART F — ADD ENGINE API KEYS (OPTIONAL, 5 min per key)

By default, only Pollinations works (keyless). Add keys to unlock more engines.

### Step 13: Which engines to add (pick what you want)

| Engine | Card needed? | Cost | Quality | How to get key |
|---|---|---|---|---|
| **Gemini** (Google) | No | Free forever | Excellent, multimodal | aistudio.google.com → API key |
| **Azure OpenAI** (Microsoft) | Yes | $200 free credit | GPT-4o | ai.azure.com → create resource |
| **Oracle OCI** (Llama 3.1 70B) | Yes (sign-up) | Always free | Large open model | cloud.oracle.com → GenAI cluster |
| **NVIDIA NIM** | No | Free | 100+ models | Already works keyless (no action) |
| **Groq** | No | Free tier | Very fast | console.groq.com |
| **Mistral** | No | Free tier | European | console.mistral.ai |
| **OpenRouter** | No | 50 free/day | 200+ models | openrouter.ai |

### Step 14: Get a Gemini key (recommended first, 3 min)

1. Go to **aistudio.google.com**
2. Sign in with your **Gmail**
3. Click **Get API key** (top-right)
4. Click **Create API key in new project**
5. Copy the key (looks like `AIza...`)

**Save in your notes:** `GEMINI_API_KEY = AIza...`

### Step 15: Add the key to Cloudflare

1. **dash.cloudflare.com** → `agent-zoe` project → **Settings**
2. **Environment variables** → **Add variable**
3. **Variable name:** `GEMINI_API_KEY` (exact)
4. **Value:** paste your key
5. **Environment:** check `Production`
6. Click **Save**

Auto-redeploys in ~30 seconds.

**✓ Checkpoint:** Open Settings (⚙️) in Zoe → Refresh status. Gemini now shows "ready" instead of "missing."

### Step 16 (optional): Get an Azure OpenAI key (5 min, card required)

1. Go to **ai.azure.com**
2. Sign in with your **Outlook** account
3. **Create a resource** → search "Azure OpenAI" → **Create**
4. Fill in:
   - Subscription: free trial
   - Resource group: `agent-zoe-rg` (create new)
   - Region: pick closest (East US is good)
   - Name: `agent-zoe-openai`
   - Pricing: `Standard S0`
5. **Review + Create** → **Create**
6. Wait ~2 min
7. Click into the resource → **Keys and Endpoint** (left sidebar)
8. Copy **KEY 1** and **ENDPOINT**

**Save:**
- `AZURE_OPENAI_API_KEY` = the key
- `AZURE_OPENAI_ENDPOINT` = e.g. `https://agent-zoe-openai.openai.azure.com`

### Step 17 (optional): Add Azure keys to Cloudflare

1. **Settings** → **Environment variables** → **Add variable**
2. Add 2 variables:
   - `AZURE_OPENAI_API_KEY` = your key
   - `AZURE_OPENAI_ENDPOINT` = your endpoint
3. Save → auto-redeploys

**✓ Checkpoint:** In Settings, Azure now shows "ready."

### Step 18 (optional): Get an Oracle OCI key (10 min, card for sign-up but not charged)

1. Go to **cloud.oracle.com** → sign up (card required for ID verification, not charged for always-free)
2. **Analytics & AI** → **Generative AI** → **Dedicated AI clusters**
3. **Create cluster:**
   - Name: `agent-zoe-cluster`
   - Region: `us-chicago-1` (REQUIRED for OpenAI-compat endpoint)
   - Compartment: root
4. Wait ~5 min for "Active" status
5. Click the cluster → **Generate API Key** (this is a Bearer-style key)
6. Copy the key

**Save:** `ORACLE_API_KEY = the bearer key`

### Step 19 (optional): Add Oracle key to Cloudflare

1. **Settings** → **Environment variables** → **Add variable**
2. `ORACLE_API_KEY` = your key
3. Save → auto-redeploys

**✓ Checkpoint:** In Settings, Oracle now shows "ready." Llama 3.1 70B is now available.

---

## PART G — DONE!

### Step 20: Verify everything

Open `https://agent-zoe.pages.dev` in a fresh tab.

**Acceptance checklist (all 12 should be ✓):**
- [ ] Page loads, no console errors (open DevTools → Console)
- [ ] All 4 nav tabs work
- [ ] Composer → Chat: AI responds to your message
- [ ] Settings shows engine statuses (Pollinations always ready, others as configured)
- [ ] 🧠 memory FAB opens, save a memory, reload, it's still there
- [ ] Clones dropdown in Settings works — try switching to mavis-clone
- [ ] Recall toggle in memory panel — toggle on, send a chat, see context prepended
- [ ] Mavis persona — responses are direct, no "Great question!" openers
- [ ] GitHub repo has the code
- [ ] Cloudflare Pages shows "Active" deployment
- [ ] (If Discord webhook set up) Engine fallbacks notify Discord
- [ ] (If any API keys added) Those engines show "ready" in Settings

**All 12 ✓? You're fully deployed. Congrats.** 🎉

---

## TROUBLESHOOTING (if something breaks)

### "Build failed" in Cloudflare

- You probably picked the wrong Framework preset
- **Fix:** Settings → Build settings → Framework preset: **None**
- Build command: (empty) | Build output: `/`

### Chat doesn't respond

1. Open DevTools → Console (F12) — look for red errors
2. Network tab → find the `/api/proxy` request → see the response body
3. If "All engines failed": at least one of your chains has no working engine
4. **Fix:** Pollinations works keyless, ensure it's in at least one clone's chain

### Memory doesn't save

1. Settings → Functions → KV namespace bindings
2. Check variable name is EXACTLY `MEMORY` (all caps)
3. Redeploy after binding changes (auto-happens)
4. DevTools → Network → check `/api/memory/...` requests
5. If 404, the binding isn't right

### GitHub push fails with "Authentication failed"

- You used your GitHub password instead of the PAT
- **Fix:** Use the PAT as the password. Generate a new one if needed.

### Engine shows "ready" but doesn't respond

- The key might be invalid (test in provider's console)
- Some providers have IP allowlists
- Check Cloudflare → your project → Logs tab → real Worker errors

### Discord webhook not working

- Test with curl: `curl -X POST YOUR_WEBHOOK_URL -d '{"content":"test"}'`
- Check the channel still exists
- Check env var name is EXACTLY `DISCORD_WEBHOOK_URL`

### Azure returns 401

- Check `AZURE_OPENAI_API_KEY` is correct
- Check endpoint ends with `.openai.azure.com` (no trailing slash)
- Check the deployment exists in Azure portal

### Oracle returns 401

- Check `ORACLE_API_KEY` is the cluster's Bearer key (not IAM user key)
- Check cluster region is `us-chicago-1` (only region with OpenAI-compat)
- Check cluster status is "Active" in OCI console

---

## WHAT TO DO TOMORROW

1. **Customize the bot:**
   - Edit `clones.js` in your repo (GitHub) to add your own clones
   - Edit `personas.js` to add your own personas
   - Edit `dna-profiles.js` to add custom DNA
   - `git push` → auto-deploys

2. **Add a custom domain:**
   - Cloudflare → your project → Custom domains
   - Enter `zoe.yourname.com` (or whatever)
   - If your domain is on Cloudflare, DNS auto-configures
   - SSL in ~5 min

3. **Try the self-edit features:**
   - Click 🛠️ Build in chat topbar
   - Type "make the chat bubbles rounded"
   - Zoe proposes a CSS edit, you click Apply
   - Live CSS hot-reload, no deploy needed

4. **Add more engine keys as you sign up for them**

---

## YOUR FINAL LIST (after you finish)

**Always set:**
- `MEMORY` (KV binding, not a secret)

**Set when you sign up for them (optional):**
- `GEMINI_API_KEY` (Google)
- `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` (Microsoft)
- `ORACLE_API_KEY` (Oracle)
- `DISCORD_WEBHOOK_URL` (Discord)
- `GROQ_API_KEY`, `MISTRAL_API_KEY`, etc. (standalone)

**Work with zero setup (7 keyless engines):**
- Pollinations
- Kilo
- LLM7
- OpenCode Zen
- BazaarLink
- OVH AI
- NVIDIA NIM

---

## LINKS

- **Cloudflare dashboard:** dash.cloudflare.com
- **GitHub:** github.com
- **Gemini key:** aistudio.google.com
- **Azure OpenAI:** ai.azure.com
- **Oracle Cloud:** cloud.oracle.com
- **Discord dev portal:** discord.com/developers/applications
- **Webhook tester:** webhook.site

---

## YOU DID IT

When all 12 acceptance checks pass, you have:
- ✅ A live chatbot at `https://agent-zoe.pages.dev`
- ✅ Code backed up on GitHub
- ✅ Memory that persists across reloads
- ✅ 7 keyless engines (work forever, free)
- ✅ Optional paid engines (add when you want)
- ✅ Discord notifications (if configured)
- ✅ The ability to self-edit the UI via chat
- ✅ A foundation for adding more clones, personas, and engines

**Go build it. You got this.** 💛

---

*This manual is in the zip as `merged/QUICKSTART.md`. Print it, follow it, done.*
