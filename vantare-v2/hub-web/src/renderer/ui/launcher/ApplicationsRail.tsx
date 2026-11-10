import type { LauncherView } from "../../../contract/generated/contract";
import { Icon } from "../../assets/icons/Icon";
import { launcherText as text } from "../../i18n/launcher";
import { Button } from "../Button";
import { Select } from "../Forms";
import { AppMark } from "./Profiles";
export function LauncherApplicationsRail({
  view,
  selected,
  onApplications,
}: {
  view: LauncherView;
  selected?: string;
  onApplications?: (create?: boolean) => void;
}) {
  const profile =
    view.profiles.find((item) => item.id === selected) ??
    view.profiles.find((item) => item.favorite) ??
    view.profiles[0];
  const options = profile?.options;
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
              {text.advancedOptions}
            </h2>
          </header>
          <div className="v-launcher-options">
            {[
              {
                label: text.alreadyRunning,
                value: options.alreadyRunning,
                choices: [
                  { value: "reuse", label: text.reuse },
                  { value: "restart", label: text.restart },
                  { value: "ask", label: text.ask },
                ],
              },
              {
                label: text.firstDelay,
                value: String(options.firstStepDelay),
                choices: [
                  {
                    value: String(options.firstStepDelay),
                    label: text.seconds(options.firstStepDelay),
                  },
                ],
              },
              {
                label: text.retries,
                value: String(options.retries),
                choices: [
                  {
                    value: String(options.retries),
                    label: String(options.retries),
                  },
                ],
              },
              {
                label: text.failure,
                value: options.failure,
                choices: [
                  { value: "continue", label: text.keepGoing },
                  { value: "stop", label: text.stop },
                  { value: "ask", label: text.ask },
                ],
              },
              {
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
                  disabled
                  onChange={() => {}}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
