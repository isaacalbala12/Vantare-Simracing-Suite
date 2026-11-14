import { useId } from "react";
import type {
  LauncherView,
  ResidentRetryScope,
  ResidentRetryTarget,
} from "../../../contract/generated/contract";
import { controlText } from "../../i18n/launcher-control";
import { resultsText as text } from "../../i18n/launcher-results";
import type { ResidentControlController } from "../../screens/launcher/resident-control";
import { Button } from "../Button";
import "./results.css";

export function ResidentResults({
  control,
  view,
  profileId,
}: {
  control: ResidentControlController;
  view: LauncherView;
  profileId?: string;
}) {
  const help = useId();
  const results = control.results;
  const value = results.kind === "known" ? results.value : undefined;
  const profile =
    value && view.revision === value.revision && !view.protected
      ? view.profiles.find((item) => item.id === value.profile)
      : undefined;
  const snapshot =
    value?.outcome && control.scope
      ? {
          instance: control.scope.instance,
          accountGeneration: value.accountGeneration,
          run: value.run,
          profile: value.profile,
          revision: value.revision,
        }
      : undefined;
  const actions = (["failed", "all"] as const).map(
    (scope: ResidentRetryScope) => {
      const target: ResidentRetryTarget | undefined = snapshot
        ? { ...snapshot, scope }
        : undefined;
      const reason = target
        ? control.reason({ kind: "retry", target })
        : undefined;
      const description = reason
        ? controlText[reason]
        : !target
          ? text.unavailable
          : scope === "all"
            ? text.sameSteps
            : text.failedSteps;
      return { scope, target, reason, description };
    },
  );
  const sharedHelp = actions[0].description === actions[1].description;
  const Heading = view.profiles.length ? "h3" : "h2";
  return (
    <section
      className="v-launcher-run-results"
      aria-labelledby={`${help}-title`}
    >
      <Heading id={`${help}-title`}>
        {text.title}
        {profile ? ` · ${profile.name}` : ""}
      </Heading>
      {value ? (
        <>
          <p>
            {text.summary(
              text[value.mode],
              value.outcome ? text[value.outcome.kind] : text.running,
            )}
          </p>
          {!profile && <p>{text.stale}</p>}
          {(!profile || value.profile !== profileId) && (
            <ol className="v-launcher-result-steps">
              {value.steps.map((step) => {
                const app =
                  profile &&
                  view.apps.find((app) => app.id === profile.apps[step.index]);
                return (
                  <li key={step.index} data-state={step.state}>
                    <span>
                      {text.step(step.index)}
                      {app ? ` · ${app.name}` : ""}
                    </span>
                    <strong>{text.states[step.state]}</strong>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : (
        <p>
          {results.kind === "unsupported" ? text.unsupported : text.unknown}
        </p>
      )}
      <div className="v-launcher-retry-actions">
        {actions.map(({ scope, target, reason }) => (
          <Button
            key={scope}
            aria-disabled={!target || !!reason}
            aria-describedby={`${help}-${sharedHelp ? "failed" : scope}`}
            onClick={() => {
              if (target && !reason) void control.retry(target);
            }}
          >
            {scope === "failed"
              ? controlText.retryFailed
              : controlText.retryAll}
          </Button>
        ))}
      </div>
      {actions
        .filter(({ scope }) => !sharedHelp || scope === "failed")
        .map(({ scope, description }) => (
          <p
            key={scope}
            className="v-launcher-retry-help"
            id={`${help}-${scope}`}
          >
            {description}
          </p>
        ))}
    </section>
  );
}
