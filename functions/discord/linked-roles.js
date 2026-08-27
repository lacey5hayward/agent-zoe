import { pageResponse } from "../_shared/discord.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const clientId = context.env.DISCORD_APPLICATION_ID;
  const redirectUri = new URL("/discord/linked-roles", context.request.url).toString();

  if (error) return pageResponse("Agent Zoe Hub — Linked Roles", "Verification cancelled", ["Discord did not grant linked-role authorization. You may close this window."]); 
  if (!clientId) return pageResponse("Agent Zoe Hub — Linked Roles", "Linked Roles is not configured yet", ["The Discord Application ID must be added to the protected Agent Zoe Cloudflare environment before linked-role verification can begin."], 503);

  if (!code) {
    const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "identify role_connections.write");
    return Response.redirect(authorizeUrl.toString(), 302);
  }

  if (!context.env.DISCORD_CLIENT_SECRET) {
    return pageResponse("Agent Zoe Hub — Linked Roles", "Linked Roles needs one more setting", ["Discord returned an authorization code, but the protected Discord client secret has not been configured yet. No credential was exposed or stored."], 503);
  }

  return pageResponse("Agent Zoe Hub — Linked Roles", "Authorization received", ["The Discord authorization code was received securely. Role-connection metadata storage will be enabled when the linked-role configuration is completed."]); 
}
