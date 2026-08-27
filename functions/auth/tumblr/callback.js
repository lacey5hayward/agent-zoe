import { htmlResponse, parseCookies, verifyState } from "../../../_shared/tumblr-oauth.js";

async function exchangeCode(code, redirectUri, env) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.TUMBLR_CLIENT_ID,
    client_secret: env.TUMBLR_CLIENT_SECRET,
    redirect_uri: redirectUri,
  });
  const response = await fetch("https://api.tumblr.com/v2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Tumblr token exchange failed");
  return data;
}

export async function onRequestGet(context) {
  const stateSecret = context.env.TUMBLR_OAUTH_STATE_SECRET;
  if (!context.env.TUMBLR_CLIENT_ID || !context.env.TUMBLR_CLIENT_SECRET || !stateSecret) {
    return htmlResponse("Tumblr connection is not configured", "The Tumblr OAuth credentials and state secret must be configured in the protected Cloudflare environment.", 503);
  }

  const url = new URL(context.request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) return htmlResponse("Tumblr authorization was cancelled", "No Tumblr access was granted. You can close this window and try again later.", 400);

  const state = url.searchParams.get("state");
  const cookies = parseCookies(context.request);
  if (!state || cookies.tumblr_oauth_state !== state || !(await verifyState(stateSecret, state))) {
    return htmlResponse("Tumblr authorization could not be verified", "The security check failed or the authorization request expired. Start the connection again.", 400);
  }

  const code = url.searchParams.get("code");
  if (!code) return htmlResponse("Tumblr authorization is incomplete", "Tumblr did not return an authorization code.", 400);

  try {
    const redirectUri = new URL("/auth/tumblr/callback", context.request.url).toString();
    const token = await exchangeCode(code, redirectUri, context.env);
    if (!context.env.TUMBLR_TOKEN_STORE || typeof context.env.TUMBLR_TOKEN_STORE.put !== "function") {
      return htmlResponse("Tumblr authorization succeeded", "Tumblr approved access, but secure token storage is not configured yet. No token was written.", 503);
    }
    await context.env.TUMBLR_TOKEN_STORE.put("owner", JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresIn: token.expires_in || null,
      scope: token.scope || null,
      savedAt: Date.now(),
    }));
    return htmlResponse("Tumblr is connected", "Agent Zoe Hub is now authorized to use the approved Tumblr scopes. You may close this window.");
  } catch {
    return htmlResponse("Tumblr authorization could not be completed", "Tumblr returned an authorization response, but the secure token exchange failed. No credentials were exposed.", 502);
  }
}
