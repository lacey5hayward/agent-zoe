import assert from "node:assert/strict";
import test from "node:test";
import { createState, parseCookies, verifyState } from "../functions/_shared/tumblr-oauth.js";

test("creates and verifies a signed, time-limited OAuth state", async () => {
  const state = await createState("test-state-secret");
  assert.equal(await verifyState("test-state-secret", state), true);
  assert.equal(await verifyState("wrong-secret", state), false);
  assert.equal(await verifyState("test-state-secret", `${state}tampered`), false);
});

test("parses the OAuth state cookie without exposing other data", () => {
  const cookies = parseCookies(new Request("https://example.test", { headers: { Cookie: "tumblr_oauth_state=abc%20123; theme=dark" } }));
  assert.deepEqual(cookies, { tumblr_oauth_state: "abc 123", theme: "dark" });
});
