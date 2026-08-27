import { MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES } from "./constants";

export class BodyLimitError extends Error {}
export class BodyEncodingError extends Error {}

export async function readBundleBody(request: Request): Promise<{ text: string; compressedBytes: number }> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_COMPRESSED_BYTES)) {
    throw new BodyLimitError("compressed body exceeds limit");
  }
  if (request.body === null) throw new BodyEncodingError("request body is required");

  const compressed = await readBounded(request.body, MAX_COMPRESSED_BYTES);
  const encoding = (request.headers.get("content-encoding") ?? "identity").trim().toLowerCase();
  let decoded: Uint8Array;
  if (encoding === "identity") {
    decoded = compressed;
  } else if (encoding === "gzip") {
    const owned = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
    const stream = new Blob([owned]).stream().pipeThrough(new DecompressionStream("gzip"));
    decoded = await readBounded(stream, MAX_DECOMPRESSED_BYTES);
  } else {
    throw new BodyEncodingError("unsupported content encoding");
  }
  if (decoded.byteLength > MAX_DECOMPRESSED_BYTES) {
    throw new BodyLimitError("decompressed body exceeds limit");
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(decoded),
      compressedBytes: compressed.byteLength,
    };
  } catch {
    throw new BodyEncodingError("body must be UTF-8");
  }
}

async function readBounded(stream: ReadableStream<Uint8Array>, maximum: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel("body exceeds limit");
        throw new BodyLimitError("body exceeds limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
