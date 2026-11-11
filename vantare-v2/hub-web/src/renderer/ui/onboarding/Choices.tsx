import { Icon } from "../../assets/icons/Icon";
import { onboardingChoicesText as t } from "../../i18n/onboarding";
import { Button } from "../Button";

type SimId = (typeof t.simulators)[number]["id"];
type StyleId = (typeof t.styles)[number]["id"];
function Check({ selected }: { selected: boolean }) {
  return (
    <span className="v-ob-check" aria-hidden="true" data-selected={selected}>
      {selected ? t.check : null}
    </span>
  );
}
export function SimulatorChoices({
  selected,
  found,
  disabled = false,
  toggle,
}: {
  selected: readonly [boolean, boolean];
  found: readonly [boolean, boolean];
  disabled?: boolean;
  toggle: (id: SimId) => void;
}) {
  return (
    <div className="v-ob-simulators">
      {t.simulators.map(({ id, abbr, name }) => (
        <Button
          key={id}
          className="v-ob-simulator"
          aria-label={name}
          aria-pressed={selected[id]}
          disabled={disabled}
          onClick={() => toggle(id)}
        >
          <span className="v-ob-sim-icon">{abbr}</span>
          <span className="v-ob-sim-copy">
            <strong>{name}</strong>
            <span className="v-ob-sim-note">
              <span className="v-ob-found" data-found={found[id]}>
                {found[id] ? t.found : t.missing}
              </span>
              <span>{found[id] ? t.library : t.installLater}</span>
            </span>
          </span>
          <Check selected={selected[id]} />
        </Button>
      ))}
    </div>
  );
}
const icons = ["route", "star", "clock", "v-camera"] as const;
export function StyleChoices({
  selected,
  disabled = false,
  toggle,
}: {
  selected: readonly [boolean, boolean, boolean, boolean];
  disabled?: boolean;
  toggle: (id: StyleId) => void;
}) {
  return (
    <div className="v-ob-styles">
      {t.styles.map(({ id, name, description }) => (
        <Button
          key={id}
          className="v-ob-style"
          aria-label={name}
          aria-pressed={selected[id]}
          disabled={disabled}
          onClick={() => toggle(id)}
        >
          <span className="v-ob-style-icon" aria-hidden="true">
            <Icon name={icons[id]} />
          </span>
          <strong>{name}</strong>
          <span className="v-ob-style-description">{description}</span>
          <Check selected={selected[id]} />
        </Button>
      ))}
    </div>
  );
}
