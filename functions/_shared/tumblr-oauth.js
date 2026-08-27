const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return key;
}

export async function createState(secret) {
  const payload = { nonce: crypto.randomUUID(), issuedAt: Date.now() };
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmac(secret, encodedPayload);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyState(secret, state, maxAgeMs = 10 * 60 * 1000) {
  if (!state || typeof state !== "string") return false;
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
    if (!payload.issuedAt || Date.now() - payload.issuedAt > maxAgeMs || Date.now() - payload.issuedAt < -60_000) return false;
    const key = await hmac(secret, encodedPayload);
    return crypto.subtle.verify("HMAC", key, fromBase64Url(encodedSignature), encoder.encode(encodedPayload));
  } catch {
    return false;
  }
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

export function htmlResponse(title, message, status = 200) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080812;color:#f8fafc;font:16px system-ui,sans-serif}main{max-width:38rem;margin:2rem;padding:2rem;border:1px solid #7c3aed;border-radius:1rem;background:#111126;box-shadow:0 0 40px #312e81}h1{margin-top:0;color:#67e8f9}p{line-height:1.6;color:#cbd5e1}</style></head><body><main><h1>${escape(title)}</h1><p>${escape(message)}</p></main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
}
