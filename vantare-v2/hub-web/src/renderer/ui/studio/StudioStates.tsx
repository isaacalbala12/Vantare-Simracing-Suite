import type { ReactNode } from "react";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Button } from "../Button";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";

export function StudioSaveStatus({
  model,
}: {
  model: ReturnTypeOfStudioFocus;
}) {
  const { state } = model;
  const view = state.view;
  const saving = view?.state === "ready" && state.pending;
  const loading = !view && !state.failure;
  const label =
    view?.state === "protected"
      ? t.readOnly
      : state.failure
        ? state.failure.request.method === "studio.get"
          ? t.readFailed
          : t.notSaved
        : saving
          ? t.saving
          : view?.state === "ready"
            ? t.saved
            : t.loading;
  return (
    <div
      className="v-focus-save"
      role="status"
      aria-label={label}
      data-failed={!!state.failure && view?.state !== "protected"}
      data-saving={saving}
      data-readonly={view?.state === "protected"}
    >
      {saving || loading ? (
        <span className="v-spinner" aria-hidden="true" />
      ) : (
        <Icon
          name={
            view?.state === "protected"
              ? "lock"
              : state.failure
                ? "alert"
                : "check"
          }
        />
      )}
      <span>{label}</span>
    </div>
  );
}

function ReloadStudio({ model }: { model: ReturnTypeOfStudioFocus }) {
  return (
    <Button
      size="sm"
      data-studio-reload
      aria-disabled={model.state.pending}
      onClick={() => {
        if (!model.state.pending) void model.reload();
      }}
    >
      {t.reload}
    </Button>
  );
}

export function StudioFeedback({ model }: { model: ReturnTypeOfStudioFocus }) {
  const { state } = model;
  const protectedView = state.view?.state === "protected";
  const readingFailure = state.failure?.request.method === "studio.get";
  const canRetry =
    state.canRetry &&
    state.view?.state === "ready" &&
    state.view.plan !== "unverified";
  return (
    <>
      {protectedView && (
        <section
          className="v-studio-state-feedback"
          role="alert"
          data-tone="warn"
        >
          <Icon name="lock" />
          <div>
            <strong>{t.protected}</strong>
            <p>{t.protectedHelp}</p>
          </div>
          <div className="v-studio-state-actions">
            <ReloadStudio model={model} />
          </div>
        </section>
      )}
      {state.failure && (
        <section
          className="v-studio-state-feedback"
          role="alert"
          data-tone="err"
        >
          <Icon name="alert" />
          <div>
            <strong>
              {readingFailure ? t.readFailed : state.failure.message}
            </strong>
            <p>
              {readingFailure
                ? t.readFailedHelp
                : canRetry
                  ? t.retryHelp
                  : protectedView
                    ? t.protectedAction
                    : t.reconfirm}
            </p>
          </div>
          <div className="v-studio-state-actions">
            {readingFailure && !protectedView && <ReloadStudio model={model} />}
            {!readingFailure && canRetry && (
              <Button
                size="sm"
                aria-disabled={state.pending}
                onClick={() => {
                  if (!state.pending) state.retry();
                }}
              >
                {t.retry}
              </Button>
            )}
            {(!readingFailure || (!!state.view && !protectedView)) && (
              <Button
                size="sm"
                aria-disabled={state.pending}
                onClick={() => {
                  if (!state.pending) state.discard();
                }}
              >
                {t.discard}
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
export function ReadonlyStudio({ children }: { children?: ReactNode }) {
  if (children)
    return (
      <section className="v-studio-readonly-with-steps">
        {children}
        <p className="v-studio-readonly-detail">
          <Icon name="lock" />
          {t.protectedSettings}
        </p>
      </section>
    );
  return (
    <section className="v-studio-unread" role="note">
      <Icon name="lock" />
      <div>
        <strong>{t.appearanceUnavailable}</strong>
        <p>{t.protectedSettings}</p>
      </div>
    </section>
  );
}

export function LoadingStudio() {
  return (
    <div className="v-studio-state-loading" aria-busy="true">
      <span className="v-skeleton" aria-hidden="true" />
      <div className="v-studio-loading-options">
        {[0, 1, 2].map((n) => (
          <span key={n} className="v-skeleton" aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}
