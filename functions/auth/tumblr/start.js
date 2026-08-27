import { createState, htmlResponse } from "../../_shared/tumblr-oauth.js";

export async function onRequestGet(context) {
  const clientId = context.env.TUMBLR_CLIENT_ID;
  const stateSecret = context.env.TUMBLR_OAUTH_STATE_SECRET;
  if (!clientId || !stateSecret) {
    return htmlResponse("Tumblr connection is not configured", "The Tumblr client ID and OAuth state secret must be configured in the protected Cloudflare environment before authorization can begin.", 503);
  }

  const redirectUri = new URL("/auth/tumblr/callback", context.request.url).toString();
  const state = await createState(stateSecret);
  const authorizeUrl = new URL("https://www.tumblr.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "basic write offline_access");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      "Set-Cookie": `tumblr_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}
