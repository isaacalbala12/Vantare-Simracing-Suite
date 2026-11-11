import { Checkbox } from "@base-ui/react/checkbox";
import { Dialog } from "@base-ui/react/dialog";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useId } from "react";
import type {
  CalendarIcsScope,
  CalendarIcsStatus,
  CalendarIcsView,
} from "../../contract/generated/calendar";
import type { HostError } from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { calendarIcsText as text } from "../i18n/calendarIcs";
import { Button, IconButton } from "./Button";
import { clock } from "./calendarDate";
import "../assets/calendar-ics.css";
import "./calendar-ics.css";

type Props = {
  scope: CalendarIcsScope;
  alarm: boolean;
  lead: number;
  utc: boolean;
  view?: CalendarIcsView;
  busy: boolean;
  failure?: HostError["kind"];
  status?: CalendarIcsStatus;
  onScope: (scope: CalendarIcsScope) => void;
  onAlarm: (value: boolean) => void;
  onRetry: () => void;
  onDownload: () => void;
  onClose: () => void;
};
export function CalendarIcsDialog(p: Props) {
  const id = useId();
  const day = (at: number) =>
    new Intl.DateTimeFormat("es", {
      weekday: "short",
      day: "numeric",
      ...(p.utc ? { timeZone: "UTC" } : {}),
    })
      .format(at)
      .replaceAll(".", "");
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) p.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-calendar-ics-backdrop" />
        <Dialog.Popup
          className="v-calendar v-calendar-ics"
          aria-describedby={`${id}-description`}
        >
          <header>
            <div>
              <Dialog.Title>{text.title}</Dialog.Title>
              <Dialog.Description id={`${id}-description`}>
                {text.subtitle}
              </Dialog.Description>
            </div>
            <IconButton label={text.close} variant="ghost" onClick={p.onClose}>
              <Icon name="x" />
            </IconButton>
          </header>
          <div className="v-calendar-ics-body">
            {p.failure && (
              <div role="alert" className="v-calendar-ics-error">
                <span>{text.error(p.failure)}</span>
                <Button size="sm" disabled={p.busy} onClick={p.onRetry}>
                  {text.retry}
                </Button>
              </div>
            )}
            {p.status === "conflict" && <p role="status">{text.conflict}</p>}
            {p.status === "cancelled" && <p role="status">{text.cancelled}</p>}
            <div className="v-calendar-ics-columns">
              <section>
                <h3 id={`${id}-what`}>{text.what}</h3>
                <RadioGroup
                  value={p.scope}
                  onValueChange={(value) => {
                    const scope = text.scopes.find((s) => s.id === value);
                    if (scope && !p.busy) p.onScope(scope.id);
                  }}
                  aria-labelledby={`${id}-what`}
                  className="v-calendar-ics-options"
                >
                  {text.scopes.map((scope) => (
                    <label
                      className="v-calendar-ics-card"
                      data-selected={p.scope === scope.id || undefined}
                      key={scope.id}
                      htmlFor={`${id}-${scope.id}`}
                    >
                      <Radio.Root
                        className="v-radio"
                        id={`${id}-${scope.id}`}
                        value={scope.id}
                        disabled={p.busy}
                        aria-labelledby={`${id}-${scope.id}-label`}
                      >
                        <Radio.Indicator className="v-radio-indicator" />
                      </Radio.Root>
                      <span>
                        <strong id={`${id}-${scope.id}-label`}>
                          {scope.label}
                        </strong>
                        <span>{scope.hint}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
                <label
                  className="v-calendar-ics-card v-calendar-ics-alarm"
                  data-selected={p.alarm || undefined}
                  htmlFor={`${id}-alarm`}
                >
                  <Checkbox.Root
                    id={`${id}-alarm`}
                    className="v-checkbox"
                    checked={p.alarm}
                    disabled={p.busy}
                    onCheckedChange={(checked) => p.onAlarm(checked)}
                    aria-labelledby={`${id}-alarm-label`}
                  >
                    <Checkbox.Indicator>
                      <Icon name="check" />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  <span>
                    <strong id={`${id}-alarm-label`}>{text.alarm}</strong>
                    <span>{text.alarmHint(p.lead)}</span>
                  </span>
                </label>
              </section>
              <section>
                <h3>{text.how}</h3>
                <div className="v-calendar-ics-card v-calendar-ics-subscription">
                  <span>
                    <strong>{text.subscription}</strong>
                    <span>{text.subscriptionHint}</span>
                  </span>
                </div>
                <div className="v-calendar-ics-card" data-selected>
                  <i className="v-calendar-ics-file-dot" aria-hidden="true" />
                  <span>
                    <strong>{text.file}</strong>
                    <span>{text.fileHint}</span>
                  </span>
                </div>
                <h3 className="v-calendar-ics-preview-title">
                  {text.preview(p.view?.total ?? 0)}
                </h3>
                {p.busy && !p.view ? (
                  <p role="status" className="v-muted">
                    {text.preparing}
                  </p>
                ) : (
                  p.view?.entries.map((entry) => (
                    <div
                      className="v-calendar-ics-entry"
                      key={`${entry.seriesId}:${entry.start}`}
                    >
                      <span>
                        {text.day(day(entry.start))}
                        <time>{clock(entry.start, p.utc)}</time>
                      </span>
                      <span>{entry.summary}</span>
                    </div>
                  ))
                )}
              </section>
            </div>
          </div>
          <footer>
            <span>{text.destination}</span>
            <Button size="sm" onClick={p.onClose}>
              {text.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!p.view || p.busy}
              onClick={p.onDownload}
            >
              {text.download}
            </Button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
