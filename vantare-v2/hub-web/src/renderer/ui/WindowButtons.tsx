import { Icon } from "../assets/icons/Icon";
import { Button } from "./Button";

export function WindowButtons({
  maximized,
  disabled,
  labels,
  minimize,
  maximize,
  close,
}: {
  maximized: boolean;
  disabled: boolean;
  labels: {
    minimize: string;
    maximize: string;
    restore: string;
    close: string;
  };
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}) {
  return (
    <div className="v-window-controls">
      <Button
        variant="ghost"
        className="v-window-button"
        aria-label={labels.minimize}
        disabled={disabled}
        onClick={minimize}
      >
        <Icon name="min" />
      </Button>
      <Button
        variant="ghost"
        className="v-window-button"
        aria-label={maximized ? labels.restore : labels.maximize}
        disabled={disabled}
        onClick={maximize}
      >
        <Icon name="max" />
      </Button>
      <Button
        variant="ghost"
        className="v-window-button v-window-button--close"
        aria-label={labels.close}
        disabled={disabled}
        onClick={close}
      >
        <Icon name="x" />
      </Button>
    </div>
  );
}
