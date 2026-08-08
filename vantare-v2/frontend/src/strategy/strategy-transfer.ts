import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
  type StrategyImportEntryV1,
  type StrategyImportPreviewV1,
  type StrategyPackageProvenanceV1,
  type StrategyPlanSelectorV1,
} from "./strategy-application-client";

/**
 * Taking a plan out of this machine and bringing one in.
 *
 * Both directions go through the application service, which owns the
 * repository and decides what is written. This module carries bytes and shapes
 * the answer for a person; it never persists anything itself.
 *
 * Export is local and explicit. The package is handed back to the caller to
 * save where the user chose — nothing here uploads, shares or transmits it.
 */

export type StrategyExportRequest = {
  readonly plans: readonly StrategyPlanSelectorV1[];
  readonly provenance: StrategyPackageProvenanceV1;
};

export type StrategyExport = {
  /** The package bytes, ready to be written to a file the user picked. */
  readonly bytes: Uint8Array;
  /** A suggested filename. The user remains free to choose another. */
  readonly suggestedFileName: string;
};

/**
 * Builds a package for the selected plans. An empty selection is refused here
 * as well as in Go, so the mistake is caught before a command is sent.
 */
export async function exportStrategyPackage<TPayload>(
  client: StrategyApplicationClient<TPayload>,
  commandId: string,
  request: StrategyExportRequest,
): Promise<StrategyExport> {
  if (request.plans.length === 0) {
    throw new Error("Selecciona al menos un plan para exportar");
  }
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId,
    operation: "export",
    // Exporting reads; it has no version to guard against.
    expectedRepositoryVersion: 0,
    plans: request.plans,
    provenance: request.provenance,
  });
  if (result.package === undefined) {
    throw new Error("El servicio no devolvió ningún paquete");
  }
  return {
    bytes: decodeBase64(result.package),
    suggestedFileName: suggestFileName(request),
  };
}

/**
 * Reports what importing would do, without writing anything. This is the step
 * that must always run before a real import: a person should never discover
 * what an import did by looking at the result.
 */
export async function previewStrategyImport<TPayload>(
  client: StrategyApplicationClient<TPayload>,
  commandId: string,
  bytes: Uint8Array,
): Promise<StrategyImportPreviewV1> {
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId,
    operation: "import",
    expectedRepositoryVersion: 0,
    package: encodeBase64(bytes),
    dryRun: true,
  });
  if (result.preview === undefined) {
    throw new Error("El servicio no devolvió una vista previa");
  }
  if (result.imported === true) {
    // A dry run that reports having written is a contradiction, and trusting
    // it would hide a real mutation. Refuse rather than reconcile.
    throw new Error("La vista previa afirma haber escrito; se descarta");
  }
  return result.preview;
}

export type StrategyImportOutcome = {
  readonly repositoryVersion: number;
  readonly preview: StrategyImportPreviewV1;
};

/**
 * Applies a package. The whole package lands as one repository transaction or
 * none of it does; there is no partial import to undo.
 */
export async function commitStrategyImport<TPayload>(
  client: StrategyApplicationClient<TPayload>,
  commandId: string,
  bytes: Uint8Array,
  expectedRepositoryVersion: number,
): Promise<StrategyImportOutcome> {
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId,
    operation: "import",
    expectedRepositoryVersion,
    package: encodeBase64(bytes),
  });
  if (result.imported !== true || result.preview === undefined) {
    throw new Error("La importación no se completó");
  }
  return { repositoryVersion: result.repositoryVersion, preview: result.preview };
}

/** Describes one entry in words a person can act on. */
export function describeImportEntry(entry: StrategyImportEntryV1): string {
  switch (entry.disposition) {
    case "new":
      return entry.revisionCount === 1
        ? "Nuevo · 1 revisión"
        : `Nuevo · ${entry.revisionCount} revisiones`;
    case "unchanged":
      return "Ya lo tienes · no cambia nada";
    case "adds_revisions":
      return entry.newRevisions === 1
        ? "Añade 1 revisión"
        : `Añade ${entry.newRevisions} revisiones`;
    case "replaces_draft":
      return "Sustituye tus cambios abiertos";
    case "conflict":
      return entry.conflictingRevisions.length === 1
        ? "Choca con 1 revisión guardada"
        : `Choca con ${entry.conflictingRevisions.length} revisiones guardadas`;
  }
}

/** Sums a preview into one sentence, so the button above it can be honest. */
export function summariseImport(preview: StrategyImportPreviewV1): string {
  if (!preview.importable) {
    const blocked = preview.entries.filter((entry) => entry.disposition === "conflict").length;
    return blocked === 1
      ? "1 plan choca con lo que ya tienes guardado"
      : `${blocked} planes chocan con lo que ya tienes guardado`;
  }
  const changing = preview.entries.filter((entry) => entry.disposition !== "unchanged");
  if (changing.length === 0) return "Nada que importar: ya lo tienes todo";
  const replacing = changing.filter((entry) => entry.disposition === "replaces_draft").length;
  const plans = changing.length === 1 ? "1 plan" : `${changing.length} planes`;
  if (replacing > 0) {
    return `${plans}, y ${replacing === 1 ? "1 sustituye" : `${replacing} sustituyen`} cambios abiertos`;
  }
  return plans;
}

function suggestFileName(request: StrategyExportRequest): string {
  const stamp = request.provenance.exportedAt.slice(0, 10);
  if (request.plans.length === 1) {
    return `${sanitise(request.plans[0].planId)}-${stamp}.vantareplan.json`;
  }
  return `planes-${request.plans.length}-${stamp}.vantareplan.json`;
}

function sanitise(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60) || "plan";
}

/**
 * Base64 is how Go encodes []byte over the bridge. These two helpers are the
 * only place that fact leaks into the frontend.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
