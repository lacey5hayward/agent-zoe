# UPLOAD.md — How to Upload Agent Zoe to Cloudflare

> **What this is.** The explicit upload instructions for the
> `agent-zoe-final-v2.zip` file. Pick Option A (Git push) for ongoing
> development, or Option B (direct upload) for a one-off deploy with
> no Git involvement.

---

## Before you start

You should already have:
- ✅ A Cloudflare account (free, no card needed)
- ✅ The `agent-zoe-final-v2.zip` file (from this package)
- ✅ Created the `agent-zoe-memory` KV namespace (see `DEPLOY.md` §3)
- ✅ (Optional) GitHub account, if using Option A

You will need:
- A terminal (Mac/Linux) or PowerShell (Windows)
- 10-20 minutes

---

## Option A — Git push (recommended)

**Use this if:** you want to update Zoe by pushing code changes later.
Every `git push` auto-redeploys via Cloudflare Pages.

### A.1 — Unzip the package

```bash
unzip agent-zoe-final-v2.zip
cd build/zoe/merged
```

(On Windows, right-click the zip → "Extract All" → use File Explorer)

### A.2 — Create a GitHub repo

1. Go to **github.com** → click **+** (top-right) → **New repository**
2. **Name:** `agent-zoe` (or whatever)
3. **Public** or **Private** (your choice)
4. **Do not** initialize with README (we have one)
5. Click **Create repository**
6. Copy the URL it shows you, e.g. `https://github.com/YOUR_USERNAME/agent-zoe.git`

### A.3 — Create a Personal Access Token (if you don't have one)

1. GitHub → click your avatar → **Settings**
2. **Developer settings** (bottom of left sidebar)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. **Note:** `agent-zoe-deploy`
6. **Expiration:** 90 days
7. **Scopes:** `repo` (required)
8. **Generate token** → **COPY IT NOW** (you can't see it again)
9. Save it somewhere safe (password manager, notes app)

### A.4 — Push the code to GitHub

From inside `build/zoe/merged/`:

```bash
git init
git add -A
git commit -m "Initial Agent Zoe build — Phases 0-13 complete"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent-zoe.git
git push -u origin main
```

When prompted:
- **Username:** your GitHub username
- **Password:** paste the PAT (not your GitHub password)

### A.5 — Connect the repo to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create application**
2. **Pages** tab → **Connect to Git**
3. Click **GitHub** → **Authorize Cloudflare** (if first time)
4. Select your `agent-zoe` repo
5. Click **Begin setup**

### A.6 — Configure the build settings

Fill in exactly:
- **Project name:** `agent-zoe` (this becomes `agent-zoe.pages.dev`)
- **Production branch:** `main`
- **Framework preset:** **None** ← CRITICAL
- **Build command:** *(leave empty)*
- **Build output directory:** `/` (just one slash)
- **Root directory:** *(leave empty)*

Click **Save and Deploy**.

### A.7 — Wait for first build

~1-2 minutes. You'll see "Building..." then "Success" in the
**Deployments** tab.

Your live URL: `https://agent-zoe.pages.dev`

### A.8 — Bind the KV namespace

(From `DEPLOY.md` §5)

1. Click your `agent-zoe` project → **Settings** tab
2. **Functions** (left sidebar)
3. Scroll to **KV namespace bindings** → **Add binding**
4. **Variable name:** `MEMORY` (exact, all caps)
5. **KV namespace:** select `agent-zoe-memory` from dropdown
6. **Save** → auto-redeploys in ~30 sec

### A.9 — Add API keys (optional)

Skip this for now. Zoe works day 0 with Pollinations (keyless).
Add Azure, Oracle, or other engine keys whenever you want (see
`DEPLOY.md` §6).

### A.10 — Done!

Open `https://agent-zoe.pages.dev` in your browser. You should see
the Social Hub UI. Click **Composer** → **Chat** to test.

**To update later:**
```bash
cd build/zoe/merged
# make changes
git add -A
git commit -m "what I changed"
git push
```

Cloudflare auto-detects the push and redeploys in ~30 sec. Done.

---

## Option B — Direct upload (one-off, no Git)

**Use this if:** you don't want to use Git, or you just want to
deploy once without ongoing development.

### B.1 — Unzip the package

```bash
unzip agent-zoe-final-v2.zip
cd build/zoe/merged
```

### B.2 — Install Wrangler (if not already installed)

Wrangler is Cloudflare's CLI tool. You need Node.js 16+ installed.

```bash
npm install -g wrangler
# or
npx wrangler --version  # uses npx without global install
```

### B.3 — Log in to Cloudflare

```bash
wrangler login
```

This opens a browser window asking you to authorize. Click **Allow**.

### B.4 — Deploy

```bash
wrangler pages deploy . --project-name=agent-zoe
```

If `agent-zoe` doesn't exist yet, it'll create it. If it does exist,
it'll deploy a new version.

Wait ~1 minute. The output will show your URL:
```
✨ Success! Uploaded 34 files (X KB)
🌎 Deploying...
✨ Deployment complete! Take a look at your site:
   https://agent-zoe.pages.dev
```

### B.5 — Bind the KV namespace

Same as A.8 above:
1. Cloudflare dashboard → your project → **Settings** → **Functions**
2. **KV namespace bindings** → **Add binding**
3. **Variable name:** `MEMORY`
4. **KV namespace:** select `agent-zoe-memory`
5. **Save** → auto-redeploys

### B.6 — Add API keys (optional)

Same as A.9 above. See `DEPLOY.md` §6 for details.

### B.7 — Done!

Open your URL. Chat works. Memory works (after KV bind).

**To update later** (if using direct upload):
```bash
cd build/zoe/merged
# make changes
wrangler pages deploy . --project-name=agent-zoe
```

Each upload creates a new "Deployment" in Cloudflare. You can roll
back to any previous deployment from the dashboard.

---

## Option C — GitHub-only (no Cloudflare signup yet)

**Use this if:** you want to back up your code first, decide on
hosting later.

### C.1 — Unzip

```bash
unzip agent-zoe-final-v2.zip
cd build/zoe/merged
```

### C.2 — Init + push to GitHub

```bash
git init
git add -A
git commit -m "Initial Agent Zoe build"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent-zoe.git
git push -u origin main
```

(Use your PAT when prompted for password)

### C.3 — Done (for now)

Your code is safe in GitHub. When you're ready to deploy, follow
Option A from A.5 onwards.

---

## Which option should I pick?

| Situation | Option |
|-----------|--------|
| "I want to keep updating Zoe" | **A — Git push** |
| "I just want it live, don't care about updates" | **B — Direct upload** |
| "Just back up the code for now" | **C — GitHub only** |
| "I want to test locally first" | See `DEPLOY.md` §0 (run `python3 -m http.server`) |

---

## Common upload errors

### "Authentication failed"

- You used your GitHub password instead of the PAT
- **Fix:** Use the PAT. Generate one at
  github.com/settings/tokens

### "Permission denied (publickey)"

- You haven't set up SSH keys with GitHub
- **Fix:** Use HTTPS URL (not SSH), and use PAT for password

### "wrangler: command not found"

- Node.js not installed, or wrangler not installed
- **Fix:** Install Node 16+, then `npm install -g wrangler`

### "Project name already taken"

- Someone else (or you) already has a project called `agent-zoe`
- **Fix:** Use a different name: `wrangler pages deploy . --project-name=my-agent-zoe`

### "Build failed"

- You selected a Framework preset other than "None"
- **Fix:** Edit project settings → Build settings → Framework preset: None
- Build command: empty
- Build output: `/`

### Deploy succeeds but page is blank

- KV not bound yet (memory errors crash the page)
- **Fix:** Add KV binding (§A.8 or §B.5)

### "Mixed content" errors in browser

- You're accessing via HTTP instead of HTTPS
- **Fix:** Always use `https://your-project.pages.dev`

---

## After upload: what to do next

1. **Test it:** Open the URL, click Composer → Chat, send a message.
2. **Add engines:** See `DEPLOY.md` §6 for Azure, Oracle, and other keys.
3. **Customize:** Edit `clones.js`, `personas.js`, `dna-profiles.js` to make your own bots.
4. **Custom domain:** See `DEPLOY.md` §11.

---

## File size & limits

Cloudflare Pages free tier:
- 100,000 requests/day
- 500 builds/month
- 25 MB max file size per asset
- Unlimited static assets
- 1 GB KV storage (plenty for memory)
- 100K KV reads/day
- 1K KV writes/day

Your `agent-zoe-final-v2.zip` is ~120 KB. Well within limits.

---

## UPLOAD CHECKLIST (print this)

```
□ Downloaded agent-zoe-final-v2.zip
□ Chose Option A, B, or C
□ Unzipped the package
□ (A only) Created GitHub repo
□ (A only) Pushed to GitHub
□ (A/B) Created Cloudflare Pages project
□ (A/B) Set Framework preset: None
□ (A/B) Set Build output: /
□ (A/B) First deploy succeeded
□ Created agent-zoe-memory KV namespace
□ Bound KV as variable name MEMORY
□ Opened https://agent-zoe.pages.dev
□ Composer → Chat works
□ Memory FAB (🧠) opens
□ (Optional) Added engine API keys
□ (Optional) Set up Discord webhook
□ (Optional) Custom domain
```

---

*End of UPLOAD.md. If something breaks, the answer is usually in
`DEPLOY.md` §10 (Troubleshooting).*
