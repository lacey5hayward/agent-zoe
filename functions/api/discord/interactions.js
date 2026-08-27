import { jsonResponse, verifyDiscordRequest } from "../../_shared/discord.js";

export async function onRequestPost(context) {
  const publicKey = context.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return jsonResponse({ error: "Discord public key is not configured" }, 503);
  if (!(await verifyDiscordRequest(context.request, publicKey))) return jsonResponse({ error: "Invalid Discord request signature" }, 401);

  let interaction;
  try {
    interaction = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (interaction?.type === 1) return jsonResponse({ type: 1 });
  if (interaction?.type === 2) {
    return jsonResponse({
      type: 4,
      data: {
        content: "Agent Zoe Hub is connected. Command handling is being configured securely.",
        flags: 64,
      },
    });
  }
  return jsonResponse({ error: "Unsupported Discord interaction" }, 400);
}

export async function onRequestGet() {
  return jsonResponse({ ok: true, service: "agent-zoe-discord-interactions" });
}
