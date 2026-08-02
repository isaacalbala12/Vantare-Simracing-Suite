import type { DiagnosticsSession } from "./contracts";
import type {
  ErrorText,
  RequestState,
  Translate,
} from "./diagnostics-view-model";
import { LoadingBlock, StateNotice } from "./diagnostics-view-shared";

function sessionNotice(
  session: DiagnosticsSession,
  t: Translate,
): { body: string; testId: string } | null {
  if (session.compatibility === "future") {
    return {
      body: t("diagnostics.inspector.future"),
      testId: "diagnostics-session-notice-future",
    };
  }
  if (session.compatibility === "corrupt") {
    return {
      body: t("diagnostics.inspector.corrupt"),
      testId: "diagnostics-session-notice-corrupt",
    };
  }
  if (session.availability !== "ready") {
    const reason =
      session.unavailableReason ??
      (session.availability === "metadata_only"
        ? "metadata_only"
        : "unavailable");
    return {
      body: t(`diagnostics.unavailable.${reason}`),
      testId: "diagnostics-session-notice-unavailable",
    };
  }
  return null;
}

export function SessionDetail({
  selected,
  t,
  errorText,
  onCancel,
  onRetry,
}: {
  selected: RequestState<DiagnosticsSession>;
  t: Translate;
  errorText: ErrorText;
  onCancel: () => void;
  onRetry: (session: DiagnosticsSession) => void;
}) {
  const notice = selected.data ? sessionNotice(selected.data, t) : null;
  const hasInspectedHistory =
    selected.status === "ready" &&
    selected.data?.compatibility === "current" &&
    selected.data.availability === "ready";

  return (
    <article className="card-sleek rounded-xl border border-white/8 p-4 sm:p-5">
      <h3 className="font-display text-lg font-semibold text-white">
        {t("diagnostics.inspector.title")}
      </h3>
      {selected.status === "idle" ? (
        <div className="mt-4">
          <StateNotice
            title={t("diagnostics.inspector.selectTitle")}
            body={t("diagnostics.inspector.selectBody")}
          />
        </div>
      ) : selected.status === "loading" ? (
        <div className="mt-4 space-y-3">
          <LoadingBlock label={t("diagnostics.inspector.loading")} />
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-vantare-textMuted hover:text-white"
          >
            {t("diagnostics.action.cancel")}
          </button>
        </div>
      ) : selected.data ? (
        <div className="mt-4 space-y-4">
          {(selected.status === "error" ||
            selected.status === "timeout" ||
            selected.status === "canceled") && (
            <StateNotice
              title={t(`diagnostics.state.${selected.status}`)}
              body={errorText(selected.code)}
              action={
                <button
                  type="button"
                  onClick={() => onRetry(selected.data as DiagnosticsSession)}
                  className="min-h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white"
                >
                  {t("diagnostics.action.retry")}
                </button>
              }
            />
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "diagnostics.inspector.manifest",
                value: selected.data.manifestVersion,
              },
              {
                label: "diagnostics.inspector.schema",
                value: selected.data.schemaVersion,
              },
              {
                label: "diagnostics.inspector.observations",
                value: selected.data.countsKnown
                  ? selected.data.observedCount
                  : "—",
              },
              {
                label: "diagnostics.inspector.facts",
                value: selected.data.countsKnown
                  ? selected.data.factCount
                  : "—",
              },
              {
                label: "diagnostics.inspector.laps",
                value: hasInspectedHistory ? selected.data.lapCount : "—",
                testId: "diagnostics-detail-laps",
              },
              {
                label: "diagnostics.inspector.vehicles",
                value: hasInspectedHistory ? selected.data.vehicleCount : "—",
                testId: "diagnostics-detail-vehicles",
              },
            ].map(({ label, value, testId }) => (
              <div
                key={label}
                className="rounded-lg border border-white/8 bg-black/20 p-3"
              >
                <dt className="text-xs text-vantare-textMuted">
                  {t(String(label))}
                </dt>
                <dd
                  className="mt-1 font-mono text-sm text-white"
                  data-testid={testId}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {notice ? (
            <div
              className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm text-cyan-100"
              data-testid={notice.testId}
              role="status"
            >
              {notice.body}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-white">
                {t("diagnostics.inspector.fields")}
              </h4>
              {selected.data.fields.length === 0 ? (
                <p className="mt-2 text-sm text-vantare-textMuted">
                  {t("diagnostics.inspector.noFields")}
                </p>
              ) : (
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selected.data.fields.map((field) => {
                    const fieldName = t(`diagnostics.field.${field.name}`);
                    const availability = t(
                      field.present
                        ? "diagnostics.field.present"
                        : "diagnostics.field.unavailable",
                    );
                    return (
                      <li
                        key={field.name}
                        aria-label={`${fieldName}: ${availability}`}
                        data-testid={`diagnostics-field-${field.name}`}
                        className="rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-sm text-vantare-textMuted"
                      >
                        <span
                          aria-hidden="true"
                          className={
                            field.present
                              ? "text-emerald-300"
                              : "text-vantare-textMuted"
                          }
                        >
                          {field.present ? "●" : "○"}
                        </span>{" "}
                        {fieldName}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">
                {t("diagnostics.inspector.quality")}
              </h4>
              {selected.data.quality.length === 0 ? (
                <p className="mt-2 text-sm text-vantare-textMuted">
                  {t("diagnostics.inspector.noQuality")}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selected.data.quality.map((entry) => (
                    <li
                      key={entry.quality}
                      className="flex items-center justify-between rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-sm"
                    >
                      <span className="text-vantare-textMuted">
                        {t(`diagnostics.quality.${entry.quality}`)}
                      </span>
                      <span className="font-mono text-white">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {selected.data.inspectionTruncated ? (
            <p className="text-sm text-amber-200">
              {t("diagnostics.inspector.truncated")}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
