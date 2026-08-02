import type { PreparedDiagnostics } from "./contracts";
import {
  formatBytes,
  type DiagnosticsActionState,
  type ErrorText,
  type RequestState,
  type Translate,
} from "./diagnostics-view-model";
import {
  LoadingBlock,
  StateNotice,
} from "./diagnostics-view-shared";

export function SanitizedPackage({
  prepared,
  actionState,
  locale,
  t,
  errorText,
  onCopy,
  onDownload,
}: {
  prepared: RequestState<PreparedDiagnostics>;
  actionState: DiagnosticsActionState;
  locale: string;
  t: Translate;
  errorText: ErrorText;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <article className="card-sleek min-w-0 rounded-xl border border-white/8 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">
            {t("diagnostics.package.title")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-vantare-textMuted">
            {t("diagnostics.package.subtitle")}
          </p>
        </div>
        {prepared.data ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopy}
              data-testid="diagnostics-copy"
              className="min-h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white transition-colors hover:border-vantare-red-400/40"
            >
              {t("diagnostics.action.copy")}
            </button>
            <button
              type="button"
              onClick={onDownload}
              data-testid="diagnostics-download"
              className="min-h-11 rounded-lg bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy px-4 text-sm font-semibold text-white"
            >
              {t("diagnostics.action.download")}
            </button>
          </div>
        ) : null}
      </div>

      {prepared.data ? (
        <div className="mt-4 space-y-3">
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 rounded-lg border border-white/8 bg-black/20 p-3">
              <dt className="text-xs uppercase tracking-wider text-vantare-textMuted">
                SHA-256
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-white">
                {prepared.data.sha256}
              </dd>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/20 p-3">
              <dt className="text-xs uppercase tracking-wider text-vantare-textMuted">
                {t("diagnostics.package.size")}
              </dt>
              <dd className="mt-1 font-mono text-xs text-white">
                {formatBytes(prepared.data.byteSize, locale)} KiB ·{" "}
                {prepared.data.byteSize} B
              </dd>
            </div>
          </dl>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-vantare-textMuted">
              {t("diagnostics.package.preview")}
            </p>
            <pre
              aria-label={t("diagnostics.package.preview")}
              className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[#080808] p-4 font-mono text-xs leading-relaxed text-vantare-textMuted"
              data-testid="diagnostics-payload"
              tabIndex={0}
            >
              {prepared.data.payload}
            </pre>
          </div>
          <p className="text-sm leading-relaxed text-emerald-100">
            {t("diagnostics.package.excludes")}
          </p>
          <div
            aria-live="polite"
            className="min-h-5 text-sm text-vantare-textMuted"
          >
            {actionState === "copied" && t("diagnostics.action.copied")}
            {actionState === "downloaded" &&
              t("diagnostics.action.downloaded")}
            {actionState === "error" && t("diagnostics.action.failed")}
          </div>
        </div>
      ) : prepared.status === "loading" || prepared.status === "idle" ? (
        <div className="mt-4">
          <LoadingBlock label={t("diagnostics.state.loading")} />
        </div>
      ) : (
        <div className="mt-4">
          <StateNotice
            title={t(`diagnostics.state.${prepared.status}`)}
            body={errorText(prepared.code)}
          />
        </div>
      )}
    </article>
  );
}
