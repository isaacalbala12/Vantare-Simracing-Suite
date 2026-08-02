import {
  DiagnosticsContractError,
  type PreparedDiagnostics,
} from "./contracts";

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyPreparedDiagnostics(
  prepared: PreparedDiagnostics,
): Promise<void> {
  const payloadBytes = new TextEncoder().encode(prepared.payload);
  if (payloadBytes.byteLength !== prepared.byteSize) {
    throw new DiagnosticsContractError(
      "prepared diagnostics byteSize does not match payload",
    );
  }
  if (!globalThis.crypto?.subtle) {
    throw new DiagnosticsContractError(
      "SHA-256 verification is not available in this environment",
    );
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payloadBytes);
  if (hex(digest) !== prepared.sha256) {
    throw new DiagnosticsContractError(
      "prepared diagnostics sha256 does not match payload",
    );
  }
}
