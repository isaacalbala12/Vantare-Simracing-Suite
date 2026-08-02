import type { PreparedReportDiagnostic } from "./contracts";

type DiagnosticPreviewPanelProps = {
  diagnostic: PreparedReportDiagnostic | null;
  loading: boolean;
  error: boolean;
  t: (key: string) => string;
};

export function DiagnosticPreviewPanel({ diagnostic, loading, error, t }: DiagnosticPreviewPanelProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5" aria-busy={loading}>
      <h2 className="text-base font-semibold text-white">{t("testingCenter.preview.title")}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-vantare-textMuted">
        {t("testingCenter.preview.description")}
      </p>
      {loading && <p className="mt-4 text-sm text-vantare-textMuted" role="status">{t("testingCenter.preview.loading")}</p>}
      {error && <p className="mt-4 text-sm text-red-300" role="alert">{t("testingCenter.preview.error")}</p>}
      {diagnostic && !loading && (
        <details className="mt-4" open>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-white">
            {t("testingCenter.preview.exact")}
          </summary>
          <dl className="mb-3 grid grid-cols-1 gap-2 text-xs text-vantare-textMuted sm:grid-cols-3">
            <div><dt className="font-medium text-white">SHA-256</dt><dd className="break-all font-mono">{diagnostic.preview.sha256}</dd></div>
            <div><dt className="font-medium text-white">Bytes</dt><dd>{diagnostic.preview.byteSize}</dd></div>
            <div><dt className="font-medium text-white">Logs</dt><dd>{diagnostic.environment.availableLogCount}</dd></div>
          </dl>
          <pre data-testid="testing-center-diagnostic-payload" className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-vantare-textMuted">
            {diagnostic.preview.payload}
          </pre>
        </details>
      )}
    </section>
  );
}
