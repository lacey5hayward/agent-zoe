import { pageResponse } from "./_shared/discord.js";

export async function onRequestGet() {
  return pageResponse("Agent Zoe Hub — Privacy Policy", "Privacy Policy", [
    "Agent Zoe Hub is a personal, privately operated Discord application and creative workspace.",
    "The application may receive Discord interaction data, such as the invoking user, server, channel, command, and message content needed to respond. It uses that information only to provide the requested feature and maintain security.",
    "Tumblr and Discord credentials are stored as protected server-side secrets and are not included in public pages, client-side code, or source-control files.",
    "The owner may remove or change integrations and retained data. Do not use Agent Zoe Hub if you do not agree with this policy.",
    "Discord’s own privacy practices and policies also apply when you use Discord.",
  ]);
}
