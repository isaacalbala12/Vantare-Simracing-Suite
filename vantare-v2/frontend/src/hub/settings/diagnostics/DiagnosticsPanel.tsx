import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { ConnectionSummary } from "./ConnectionSummary";
import {
  createBrowserDiagnosticsActions,
  type DiagnosticsActions,
} from "./diagnostics-actions";
import {
  isDiagnosticsClientError,
  type DiagnosticsClient,
} from "./diagnostics-client";
import {
  DIAGNOSTICS_MUTED_TEXT_COLOR,
  type DiagnosticsActionState,
  type RequestState,
} from "./diagnostics-view-model";
import type {
  DiagnosticsErrorCode,
  DiagnosticsSession,
  PreparedDiagnostics,
} from "./contracts";
import { SanitizedPackage } from "./SanitizedPackage";
import { SessionDetail } from "./SessionDetail";
import { SessionsList } from "./SessionsList";

export type DiagnosticsPanelProps = {
  client: DiagnosticsClient;
  actions?: DiagnosticsActions;
};

function stateFromError<T>(error: unknown, data?: T): RequestState<T> {
  if (isDiagnosticsClientError(error)) {
    if (error.code === "timeout") {
      return { status: "timeout", code: error.code, data };
    }
    if (error.code === "canceled") {
      return { status: "canceled", code: error.code, data };
    }
    return { status: "error", code: error.code, data };
  }
  return { status: "error", code: "internal", data };
}

function abortPending(ref: { current: AbortController | null }): void {
  const controller = ref.current;
  ref.current = null;
  controller?.abort();
}

export function DiagnosticsPanel({
  client,
  actions,
}: DiagnosticsPanelProps) {
  const { locale, t } = useI18n();
  const diagnosticsActions = useMemo(
    () => actions ?? createBrowserDiagnosticsActions(),
    [actions],
  );
  const [prepared, setPrepared] = useState<RequestState<PreparedDiagnostics>>({
    status: "loading",
  });
  const [sessions, setSessions] = useState<
    RequestState<{ sessions: DiagnosticsSession[]; truncated: boolean }>
  >({ status: "loading" });
  const [selected, setSelected] = useState<RequestState<DiagnosticsSession>>({
    status: "idle",
  });
  const [actionState, setActionState] =
    useState<DiagnosticsActionState>("idle");
  const refreshController = useRef<AbortController | null>(null);
  const inspectController = useRef<AbortController | null>(null);

  const load = useCallback(
    (controller: AbortController) => {
      void client
        .prepare(controller.signal)
        .then((value) => {
          if (refreshController.current === controller) {
            setPrepared({ status: "ready", data: value });
          }
        })
        .catch((error: unknown) => {
          if (refreshController.current === controller) {
            setPrepared(stateFromError(error));
          }
        });

      void client
        .listSessions({ signal: controller.signal })
        .then((value) => {
          if (refreshController.current === controller) {
            setSessions({
              status: value.sessions.length === 0 ? "empty" : "ready",
              data: value,
            });
          }
        })
        .catch((error: unknown) => {
          if (refreshController.current === controller) {
            setSessions(stateFromError(error));
          }
        });
    },
    [client],
  );

  const runRefresh = useCallback(() => {
    abortPending(refreshController);
    abortPending(inspectController);
    const controller = new AbortController();
    refreshController.current = controller;
    setPrepared({ status: "loading" });
    setSessions({ status: "loading" });
    setSelected({ status: "idle" });
    setActionState("idle");
    load(controller);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    refreshController.current = controller;
    load(controller);
    return () => {
      abortPending(refreshController);
      abortPending(inspectController);
    };
  }, [load]);

  const inspect = (session: DiagnosticsSession) => {
    inspectController.current?.abort();
    if (
      session.compatibility !== "current" ||
      session.availability !== "ready"
    ) {
      inspectController.current = null;
      setSelected({ status: "ready", data: session });
      return;
    }
    const controller = new AbortController();
    inspectController.current = controller;
    setSelected({ status: "loading", data: session });
    void client
      .inspectSession(session.handle, controller.signal)
      .then((value) => {
        if (inspectController.current === controller) {
          setSelected({ status: "ready", data: value });
        }
      })
      .catch((error: unknown) => {
        if (inspectController.current === controller) {
          setSelected(stateFromError(error, session));
        }
      });
  };

  const copy = async () => {
    if (!prepared.data) return;
    try {
      await diagnosticsActions.copy(prepared.data.payload);
      setActionState("copied");
    } catch {
      setActionState("error");
    }
  };

  const download = () => {
    if (!prepared.data) return;
    try {
      diagnosticsActions.download(prepared.data);
      setActionState("downloaded");
    } catch {
      setActionState("error");
    }
  };

  const errorText = (code?: DiagnosticsErrorCode) =>
    t(`diagnostics.error.${code ?? "internal"}`);

  return (
    <section
      aria-labelledby="diagnostics-title"
      className="space-y-4"
      data-testid="diagnostics-panel"
      style={
        {
          "--v-text-muted": DIAGNOSTICS_MUTED_TEXT_COLOR,
        } as CSSProperties
      }
    >
      <header className="card-sleek rounded-xl border border-white/8 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-vantare-red-400">
              {t("diagnostics.eyebrow")}
            </p>
            <h2
              id="diagnostics-title"
              className="mt-2 font-display text-xl font-semibold text-white sm:text-2xl"
            >
              {t("diagnostics.title")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-vantare-textMuted">
              {t("diagnostics.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(prepared.status === "loading" ||
              sessions.status === "loading") && (
              <button
                type="button"
                onClick={() => refreshController.current?.abort()}
                className="min-h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-vantare-textMuted transition-colors hover:border-white/20 hover:text-white"
              >
                {t("diagnostics.action.cancel")}
              </button>
            )}
            <button
              type="button"
              onClick={runRefresh}
              className="min-h-11 rounded-lg border border-vantare-red-400/40 bg-vantare-red-500/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-vantare-red-500/20"
            >
              {t("diagnostics.action.refresh")}
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm leading-relaxed text-emerald-100">
          {t("diagnostics.privacy")}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ConnectionSummary
          prepared={prepared}
          locale={locale}
          t={t}
          errorText={errorText}
        />
        <SessionsList
          sessions={sessions}
          selectedHandle={selected.data?.handle}
          locale={locale}
          t={t}
          errorText={errorText}
          onInspect={inspect}
          onRetry={runRefresh}
        />
      </div>

      <SessionDetail
        selected={selected}
        t={t}
        errorText={errorText}
        onCancel={() => inspectController.current?.abort()}
        onRetry={inspect}
      />

      <SanitizedPackage
        prepared={prepared}
        actionState={actionState}
        locale={locale}
        t={t}
        errorText={errorText}
        onCopy={() => void copy()}
        onDownload={download}
      />
    </section>
  );
}
