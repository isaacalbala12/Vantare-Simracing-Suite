import { createHash } from "node:crypto";

const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
/** native/ui/src/capture_batch.rs: SHA256 of concatenated 1 MiB block hashes. */
export function referenceReceiptHash(bytes: Uint8Array) {
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 1024 * 1024)
    parts.push(sha(bytes.subarray(offset, offset + 1024 * 1024)));
  return sha(parts.join(""));
}
