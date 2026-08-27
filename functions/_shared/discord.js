const encoder = new TextEncoder();

function hexToBytes(value) {
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function hexToBytesSafe(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return hexToBytes(value);
  } catch {
    return null;
  }
}

export async function verifyDiscordRequest(request, publicKey) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const keyBytes = hexToBytesSafe(publicKey);
  if (!signature || !timestamp || !keyBytes || !/^[0-9a-f]{128}$/i.test(signature)) return false;

  const signatureBytes = hexToBytesSafe(signature);
  if (!signatureBytes) return false;
  const body = await request.clone().text();
  const message = encoder.encode(`${timestamp}${body}`);
  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, message);
  } catch {
    return false;
  }
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" },
  });
}

export function pageResponse(title, heading, paragraphs, status = 200) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const content = paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080812;color:#f8fafc;font:16px system-ui,sans-serif}main{max-width:42rem;margin:2rem;padding:2rem;border:1px solid #7c3aed;border-radius:1rem;background:#111126;box-shadow:0 0 40px #312e81}h1{margin-top:0;color:#67e8f9}p{line-height:1.6;color:#cbd5e1}</style></head><body><main><h1>${escape(heading)}</h1>${content}</main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
}
