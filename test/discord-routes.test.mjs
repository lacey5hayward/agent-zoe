import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as interactionsPost, onRequestGet as interactionsGet } from "../functions/api/discord/interactions.js";
import { onRequestGet as linkedRolesGet } from "../functions/discord/linked-roles.js";
import { onRequestGet as termsGet } from "../functions/terms.js";
import { onRequestGet as privacyGet } from "../functions/privacy.js";

function context(request, env = {}) {
  return { request, env };
}

test("Discord interactions endpoint reports missing public-key configuration without leaking secrets", async () => {
  const response = await interactionsPost(context(new Request("https://example.com/api/discord/interactions", { method: "POST", body: JSON.stringify({ type: 1 }) })));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Discord public key is not configured" });
});

test("Discord interactions endpoint rejects unsigned requests", async () => {
  const response = await interactionsPost(context(new Request("https://example.com/api/discord/interactions", { method: "POST", body: JSON.stringify({ type: 1 }) }), { DISCORD_PUBLIC_KEY: "00".repeat(32) }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid Discord request signature" });
});

test("Discord interactions endpoint health check is public and non-secret", async () => {
  const response = await interactionsGet(context(new Request("https://example.com/api/discord/interactions")));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "agent-zoe-discord-interactions" });
});

test("linked roles route requires protected application configuration", async () => {
  const response = await linkedRolesGet(context(new Request("https://example.com/discord/linked-roles")));
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Linked Roles is not configured yet/);
});

test("policy routes return public pages", async () => {
  const terms = await termsGet(context(new Request("https://example.com/terms")));
  const privacy = await privacyGet(context(new Request("https://example.com/privacy")));
  assert.equal(terms.status, 200);
  assert.equal(privacy.status, 200);
  assert.match(await terms.text(), /Terms of Service/);
  assert.match(await privacy.text(), /Privacy Policy/);
});
