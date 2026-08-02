import type { PreparedDiagnostics } from "./contracts";
import {
  formatDate,
  type ErrorText,
  type RequestState,
  type Translate,
} from "./diagnostics-view-model";
import {
  LoadingBlock,
  StateNotice,
} from "./diagnostics-view-shared";

export function ConnectionSummary({
  prepared,
  locale,
  t,
  errorText,
}: {
  prepared: RequestState<PreparedDiagnostics>;
  locale: string;
  t: Translate;
  errorText: ErrorText;
}) {
  const connection = prepared.data?.report.telemetry;
  const connectionStatus = connection?.live
    ? "live"
    : connection?.available
      ? "available"
      : "unavailable";

  return (
    <article className="card-sleek rounded-xl border border-white/8 p-4 sm:p-5">
      <h3 className="font-display text-lg font-semibold text-white">
        {t("diagnostics.connection.title")}
      </h3>
      {prepared.status === "loading" || prepared.status === "idle" ? (
        <div className="mt-4">
          <LoadingBlock label={t("diagnostics.state.loading")} />
        </div>
      ) : prepared.data && connection ? (
        <dl
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
          data-testid="diagnostics-connection-summary"
        >
          <div className="rounded-lg border border-white/8 bg-black/20 p-3">
            <dt className="text-xs uppercase tracking-wider text-vantare-textMuted">
              {t("diagnostics.connection.state")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-white">
              {t(`diagnostics.connection.${connectionStatus}`)}
            </dd>
          </div>
          <div className="rounded-lg border border-white/8 bg-black/20 p-3">
            <dt className="text-xs uppercase tracking-wider text-vantare-textMuted">
              {t("diagnostics.connection.source")}
            </dt>
            <dd className="mt-1 text-sm font-semibold uppercase text-white">
              {connection.source}
            </dd>
          </div>
          <div className="rounded-lg border border-white/8 bg-black/20 p-3">
            <dt className="text-xs uppercase tracking-wider text-vantare-textMuted">
              {t("diagnostics.connection.generated")}
            </dt>
            <dd className="mt-1 text-sm text-white">
              {formatDate(prepared.data.generatedAtUtc, locale)}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-4">
          <StateNotice
            title={
              prepared.status === "timeout"
                ? t("diagnostics.state.timeout")
                : prepared.status === "canceled"
                  ? t("diagnostics.state.canceled")
                  : t("diagnostics.state.error")
            }
            body={errorText(prepared.code)}
          />
        </div>
      )}
    </article>
  );
}
