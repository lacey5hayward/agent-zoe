import { pageResponse } from "./_shared/discord.js";

export async function onRequestGet() {
  return pageResponse("Agent Zoe Hub — Terms of Service", "Terms of Service", [
    "Agent Zoe Hub is a personal, privately operated Discord application and creative workspace.",
    "Access is provided at the owner’s discretion. Do not use the application for unlawful activity, abuse, harassment, spam, or attempts to bypass Discord’s rules.",
    "The service is provided as-is for personal use. Features may change, be paused, or be removed without notice.",
    "By using Agent Zoe Hub, you agree to comply with Discord’s Terms of Service and Community Guidelines.",
  ]);
}
