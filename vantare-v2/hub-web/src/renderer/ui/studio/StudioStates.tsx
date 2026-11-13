import type { ReactNode } from "react";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { studioStateText as text } from "../../i18n/studio-states.es";
import { Button } from "../Button";
import { Skeleton } from "../Data";
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
  const label = state.failure
    ? t.notSaved
    : saving
      ? t.saving
      : view?.state === "protected"
        ? t.readOnly
        : view?.state === "ready"
          ? t.saved
          : t.loading;
  return (
    <div
      className="v-focus-save"
      role="status"
      aria-label={label}
      data-failed={!!state.failure}
      data-saving={saving}
      data-readonly={view?.state === "protected"}
    >
      {saving || loading ? (
        <span className="v-spinner" aria-hidden="true" />
      ) : (
        <Icon
          name={
            state.failure
              ? "alert"
              : view?.state === "protected"
                ? "lock"
                : "check"
          }
        />
      )}
      <span>{label}</span>
    </div>
  );
}

export function StudioFeedback({ model }: { model: ReturnTypeOfStudioFocus }) {
  const { state } = model;
  const protectedView = state.view?.state === "protected";
  if (!state.failure && !protectedView) return null;
  return (
    <section
      className="v-studio-state-feedback"
      role="alert"
      data-tone={state.failure ? "err" : "warn"}
    >
      <Icon name={protectedView ? "lock" : "alert"} />
      <div>
        <strong>{state.failure?.message ?? t.protected}</strong>
        <p>
          {state.failure
            ? state.canRetry
              ? text.retryHelp
              : t.reconfirm
            : text.protectedHelp}
        </p>
      </div>
      <div className="v-studio-state-actions">
        {state.failure ? (
          <>
            {state.canRetry && (
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
            <Button
              size="sm"
              aria-disabled={state.pending}
              onClick={() => {
                if (!state.pending) state.discard();
              }}
            >
              {t.discard}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            aria-disabled={state.pending}
            onClick={() => {
              if (!state.pending)
                void state.execute({ method: "studio.get" }).then((view) => {
                  if (view)
                    model.root.current
                      ?.querySelector<HTMLElement>(
                        "[data-widget], [data-add-widget]",
                      )
                      ?.focus();
                });
            }}
          >
            {t.reload}
          </Button>
        )}
      </div>
    </section>
  );
}

export function ReadonlyStudio({ children }: { children?: ReactNode }) {
  if (children)
    return (
      <section className="v-studio-readonly-with-steps">
        {children}
        <p className="v-studio-readonly-detail">
          <Icon name="lock" />
          {text.protectedSettings}
        </p>
      </section>
    );
  return (
    <section className="v-studio-unread" role="note">
      <Icon name="lock" />
      <div>
        <strong>{t.appearanceUnavailable}</strong>
        <p>{text.protectedSettings}</p>
      </div>
    </section>
  );
}

export function LoadingStudio() {
  return (
    <div className="v-studio-state-loading" aria-busy="true">
      <Skeleton label={t.loading} />
      <div className="v-studio-loading-options">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} label={t.loading} />
        ))}
      </div>
    </div>
  );
}
