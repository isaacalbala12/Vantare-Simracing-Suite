import type {
  LauncherView,
  ProfileOption,
} from "../../../contract/generated/contract";
import {
  launcherFirstDelays,
  profileFailures,
  profileLimits,
  profileRunning,
} from "../../../contract/generated/contract";
import { oneOf } from "../../../contract/validation-common";
import { Icon } from "../../assets/icons/Icon";
import { launcherText as text } from "../../i18n/launcher";
import { actionText } from "../../i18n/launcher-actions";
import { Button } from "../Button";
import { Select, Switch } from "../Forms";
import { AppMark } from "./Profiles";

function patch(
  field: ProfileOption["option"],
  raw: string,
): ProfileOption | undefined {
  switch (field) {
    case "alreadyRunning":
      return oneOf(raw, profileRunning)
        ? { option: field, value: raw }
        : undefined;
    case "failure":
      return oneOf(raw, profileFailures)
        ? { option: field, value: raw }
        : undefined;
    case "firstStepDelay": {
      const value = Number(raw);
      return launcherFirstDelays.some((delay) => delay === value)
        ? { option: field, value }
        : undefined;
    }
    case "retries": {
      const value = Number(raw);
      return Number.isInteger(value) &&
        value >= 0 &&
        value <= profileLimits.retries
        ? { option: field, value }
        : undefined;
    }
    case "startup":
      return raw === "true" || raw === "false"
        ? { option: field, value: raw === "true" }
        : undefined;
    default:
      return undefined;
  }
}
export function LauncherApplicationsRail({
  view,
  selected,
  onApplications,
  onOption,
  pending = false,
}: {
  view: LauncherView;
  selected?: string;
  onApplications?: (create?: boolean) => void;
  onOption?: (id: string, value: ProfileOption) => void;
  pending?: boolean;
}) {
  const profile =
    view.profiles.find((item) => item.id === selected) ??
    view.profiles.find((item) => item.favorite) ??
    view.profiles[0];
  const options = profile?.options;
  const delays: number[] = [...launcherFirstDelays];
  if (options && !delays.includes(options.firstStepDelay))
    delays.push(options.firstStepDelay);
  return (
    <div className="v-launcher-rail">
      <section>
        <header>
          <h2>
            <Icon name="gamepad" />
            {text.yourApps}
          </h2>
          <Button
            variant="ghost"
            disabled={!onApplications}
            onClick={() => onApplications?.()}
          >
            {text.allApps}
          </Button>
        </header>
        <div className="v-launcher-app-grid">
          {view.apps.slice(0, 5).map((app) => (
            <div key={app.id} className="v-launcher-app-tile">
              <AppMark app={app} small />
              <strong>{app.name}</strong>
              <small>{app.available ? text.available : text.unavailable}</small>
            </div>
          ))}
          <button
            type="button"
            disabled={!onApplications}
            onClick={() => onApplications?.(true)}
            className="v-launcher-app-tile"
          >
            {text.addApp}
          </button>
        </div>
      </section>
      {options && (
        <section>
          <header>
            <h2>
              <Icon name="v-sliders" />
              {view.running ? text.nextOptions : text.advancedOptions}
            </h2>
          </header>
          <div className="v-launcher-options">
            {[
              {
                field: "alreadyRunning" as const,
                label: text.alreadyRunning,
                value: options.alreadyRunning,
                choices: [
                  { value: "reuse", label: text.reuse },
                  { value: "restart", label: text.restart },
                  { value: "ask", label: text.ask },
                ],
              },
              {
                field: "firstStepDelay" as const,
                label: text.firstDelay,
                value: String(options.firstStepDelay),
                choices: delays.map((value) => ({
                  value: String(value),
                  label: text.seconds(value),
                })),
              },
              {
                field: "retries" as const,
                label: text.retries,
                value: String(options.retries),
                choices: Array.from(
                  { length: profileLimits.retries + 1 },
                  (_, value) => ({
                    value: String(value),
                    label: String(value),
                  }),
                ),
              },
              {
                field: "failure" as const,
                label: text.failure,
                value: options.failure,
                choices: [
                  { value: "continue", label: text.keepGoing },
                  { value: "stop", label: text.stop },
                  { value: "ask", label: text.ask },
                ],
              },
              {
                field: "startup" as const,
                label: text.startup,
                value: String(options.startup),
                choices: [
                  { value: "true", label: text.enabled },
                  { value: "false", label: text.disabled },
                ],
              },
            ].map((option) => (
              <div key={option.label}>
                <span>{option.label}</span>
                <Select
                  label={option.label}
                  hideLabel
                  options={option.choices}
                  value={option.value}
                  disabled={!onOption || pending || view.protected}
                  onChange={(raw) => {
                    if (raw === option.value) return;
                    const value = patch(option.field, raw);
                    if (value && profile) onOption?.(profile.id, value);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="v-launcher-quick">
            <Switch
              label={actionText.closeOnExit}
              checked={options.closeOnExit}
              disabled={!onOption || pending || view.protected}
              onCheckedChange={(value) =>
                profile &&
                onOption?.(profile.id, { option: "closeOnExit", value })
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}
