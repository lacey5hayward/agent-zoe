// ============================================================================
// /api/deploy — GitHub Self-Deploy Bridge (v2.6.0)
// ----------------------------------------------------------------------------
// This worker allows Zoe to "push" her own source code changes back to GitHub.
// It uses a secure GitHub Token stored in Cloudflare Secrets.
// ============================================================================

const GITHUB_OWNER = 'lacey5hayward';
const GITHUB_REPO = 'agent-zoe';
const GITHUB_BRANCH = 'main';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // v2.6.0: Use secret GITHUB_TOKEN (Must be set in Cloudflare Pages Settings)
  const token = env.GITHUB_TOKEN;
  
  if (!token) {
    return jsonResponse({ error: 'GITHUB_TOKEN secret not set in Cloudflare' }, 500);
  }

  try {
    const body = await request.json();
    const { path, content, message } = body;

    if (!path || !content) {
      return jsonResponse({ error: 'Missing path or content' }, 400);
    }

    const commitMessage = message || `Zoe Self-Edit: ${path} (v${Date.now()})`;

    // 1. Get the current file SHA (needed for updates)
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Agent-Zoe-Deployer',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }

    // 2. Push the update
    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Agent-Zoe-Deployer',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
        branch: GITHUB_BRANCH,
        sha: sha // Include SHA if updating existing file
      })
    });

    if (!putRes.ok) {
      const errorData = await putRes.text();
      return jsonResponse({ error: 'GitHub API failed', details: errorData }, putRes.status);
    }

    const result = await putRes.json();
    return jsonResponse({ 
      success: true, 
      commit: result.commit.sha,
      url: result.content.html_url
    });

  } catch (e) {
    return jsonResponse({ error: 'Deployment failed: ' + e.message }, 500);
  }
}
