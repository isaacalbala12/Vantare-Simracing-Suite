import type { DiagnosticsSession } from "./contracts";
import {
  badgeClass,
  formatDate,
  type ErrorText,
  type RequestState,
  type Translate,
} from "./diagnostics-view-model";
import {
  LoadingBlock,
  StateNotice,
} from "./diagnostics-view-shared";

type SessionsState = RequestState<{
  sessions: DiagnosticsSession[];
  truncated: boolean;
}>;

export function SessionsList({
  sessions,
  selectedHandle,
  locale,
  t,
  errorText,
  onInspect,
  onRetry,
}: {
  sessions: SessionsState;
  selectedHandle?: string;
  locale: string;
  t: Translate;
  errorText: ErrorText;
  onInspect: (session: DiagnosticsSession) => void;
  onRetry: () => void;
}) {
  return (
    <article className="card-sleek min-w-0 rounded-xl border border-white/8 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">
            {t("diagnostics.sessions.title")}
          </h3>
          <p className="mt-1 text-sm text-vantare-textMuted">
            {t("diagnostics.sessions.subtitle")}
          </p>
        </div>
        {sessions.data?.truncated ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200">
            {t("diagnostics.sessions.truncated")}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {sessions.status === "loading" || sessions.status === "idle" ? (
          <LoadingBlock label={t("diagnostics.state.loading")} />
        ) : sessions.status === "empty" ? (
          <StateNotice
            title={t("diagnostics.sessions.emptyTitle")}
            body={t("diagnostics.sessions.emptyBody")}
          />
        ) : sessions.status === "error" ||
          sessions.status === "timeout" ||
          sessions.status === "canceled" ? (
          <StateNotice
            title={t(`diagnostics.state.${sessions.status}`)}
            body={errorText(sessions.code)}
            action={
              <button
                type="button"
                onClick={onRetry}
                className="min-h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white hover:border-vantare-red-400/40"
              >
                {t("diagnostics.action.retry")}
              </button>
            }
          />
        ) : (
          <ul
            aria-label={t("diagnostics.sessions.title")}
            className="max-h-80 space-y-2 overflow-y-auto pr-1"
          >
            {sessions.data?.sessions.map((session) => (
              <li key={session.handle}>
                <button
                  type="button"
                  onClick={() => onInspect(session)}
                  aria-pressed={selectedHandle === session.handle}
                  data-testid={`diagnostics-session-${session.compatibility}`}
                  className="min-h-14 w-full rounded-lg border border-white/8 bg-black/20 p-3 text-left transition-colors hover:border-vantare-red-400/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vantare-red-400 aria-pressed:border-vantare-red-400/60 aria-pressed:bg-vantare-red-500/8"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold uppercase text-white">
                      {session.simulator}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${badgeClass(session.compatibility)}`}
                    >
                      {t(
                        `diagnostics.compatibility.${session.compatibility}`,
                      )}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-vantare-textMuted">
                    {formatDate(session.startedAtUtc, locale)} ·{" "}
                    {t(`diagnostics.integrity.${session.integrity}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
