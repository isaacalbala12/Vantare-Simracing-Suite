const encoder = new TextEncoder();

export async function authenticateBuildToken(provided: string, expected: string): Promise<boolean> {
  if (!validSecret(provided) || !validSecret(expected)) return false;
  const [actualDigest, expectedDigest] = await Promise.all([sha256Bytes(provided), sha256Bytes(expected)]);
  return equalBytes(actualDigest, expectedDigest);
}

export function validSecret(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,256}$/.test(value);
}

export async function protectedHash(pepper: string, domain: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${domain}\0${value}`));
  return hexadecimal(new Uint8Array(signature));
}

export async function sha256(value: string): Promise<string> {
  return hexadecimal(await sha256Bytes(value));
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function hexadecimal(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
