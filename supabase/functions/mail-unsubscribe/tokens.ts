const enc = new TextEncoder();
function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
async function key(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("mail_unconfigured");
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function unsubscribeToken(
  email: string,
  secret: string,
): Promise<string> {
  const data = b64(enc.encode(email));
  return `${data}.${
    b64(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", await key(secret), enc.encode(data)),
      ),
    )
  }`;
}
export async function verifyUnsubscribe(
  token: string,
  secret: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,500}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const [data, signature] = token.split(".");
    if (
      !await crypto.subtle.verify(
        "HMAC",
        await key(secret),
        unb64(signature),
        enc.encode(data),
      )
    ) return null;
    const email = new TextDecoder("utf-8", { fatal: true }).decode(unb64(data));
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320
      ? email
      : null;
  } catch {
    return null;
  }
}
