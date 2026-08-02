import type { PreparedDiagnostics } from "./contracts";

export type DiagnosticsActions = {
  copy(payload: string): Promise<void>;
  download(prepared: PreparedDiagnostics): void;
};

export function diagnosticsFilename(generatedAtUtc: string): string {
  return `vantare-diagnostics-${generatedAtUtc.replace(/[:.]/gu, "-")}.json`;
}

export function buildDiagnosticsBlob(payload: string): Blob {
  return new Blob([payload], { type: "application/json;charset=utf-8" });
}

export function createBrowserDiagnosticsActions(): DiagnosticsActions {
  return {
    async copy(payload) {
      await navigator.clipboard.writeText(payload);
    },
    download(prepared) {
      const blob = buildDiagnosticsBlob(prepared.payload);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = diagnosticsFilename(prepared.generatedAtUtc);
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    },
  };
}
