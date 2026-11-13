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
}: {
  control: ResidentControlController;
  view: LauncherView;
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
  function action(scope: ResidentRetryScope) {
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
        : text.sameSteps;
    return (
      <div className="v-launcher-retry-action" key={scope}>
        <Button
          aria-disabled={!target || !!reason}
          aria-describedby={`${help}-${scope}`}
          onClick={() => {
            if (target && !reason) void control.retry(target);
          }}
        >
          {scope === "failed" ? controlText.retryFailed : controlText.retryAll}
        </Button>
        <p id={`${help}-${scope}`}>{description}</p>
      </div>
    );
  }
  return (
    <section
      className="v-launcher-run-results"
      aria-labelledby={`${help}-title`}
    >
      <h3 id={`${help}-title`}>
        {text.title}
        {profile ? ` · ${profile.name}` : ""}
      </h3>
      {value ? (
        <>
          <p>
            {text[value.mode]} ·{" "}
            {value.outcome ? text[value.outcome.kind] : text.running}
          </p>
          {!profile && <p>{text.stale}</p>}
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
        </>
      ) : (
        <p>
          {results.kind === "unsupported" ? text.unsupported : text.unknown}
        </p>
      )}
      <div className="v-launcher-retry-actions">
        {action("failed")}
        {action("all")}
      </div>
    </section>
  );
}
