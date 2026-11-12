import { Checkbox } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useId, useRef } from "react";
import type {
  CalendarIcsScope,
  CalendarIcsStatus,
  CalendarIcsView,
} from "../../contract/generated/calendar";
import type { HostError } from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { calendarIcsText as text } from "../i18n/calendarIcs";
import { Button, IconButton } from "./Button";
import { CalendarIcsReplacement } from "./CalendarIcsReplacement";
import { clock } from "./calendarDate";
import { WindowDialog as Dialog } from "./WindowDialog";
import "../assets/calendar-ics.css";
import "./calendar-ics.css";

type Props = {
  scope: CalendarIcsScope;
  alarm: boolean;
  lead: number;
  utc: boolean;
  view?: CalendarIcsView;
  busy: boolean;
  exporting?: boolean;
  failure?: HostError["kind"];
  status?: CalendarIcsStatus;
  confirmationId?: string;
  onReplace?: (replace: boolean) => void;
  onScope: (scope: CalendarIcsScope) => void;
  onAlarm: (value: boolean) => void;
  onRetry: () => void;
  onDownload: () => void;
  onClose: () => void;
  returnFocus?: () => HTMLElement | false;
};
export function CalendarIcsDialog(p: Props) {
  const id = useId();
  const download = useRef<HTMLButtonElement>(null);
  const close = () => {
    if (!p.exporting && !p.confirmationId) p.onClose();
  };
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
      modal={false}
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-calendar-ics-backdrop" />
        <Dialog.Popup
          className="v-calendar v-calendar-ics"
          aria-describedby={`${id}-description`}
          finalFocus={p.returnFocus ?? true}
        >
          <header>
            <div>
              <Dialog.Title>{text.title}</Dialog.Title>
              <Dialog.Description id={`${id}-description`}>
                {text.subtitle}
              </Dialog.Description>
            </div>
            <IconButton
              label={text.close}
              variant="ghost"
              aria-disabled={p.exporting || undefined}
              onClick={close}
            >
              <Icon name="x" />
            </IconButton>
          </header>
          <div className="v-calendar-ics-body">
            {p.failure && (
              <div role="alert" className="v-calendar-ics-error">
                <span>{text.error(p.failure)}</span>
                <Button
                  size="sm"
                  aria-disabled={p.busy}
                  onClick={() => {
                    if (!p.busy) {
                      download.current?.focus();
                      p.onRetry();
                    }
                  }}
                >
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
                        aria-disabled={p.busy}
                        aria-busy={p.busy}
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
                    aria-disabled={p.busy}
                    aria-busy={p.busy}
                    onCheckedChange={(checked) => {
                      if (!p.busy) p.onAlarm(checked);
                    }}
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
                  {p.view ? text.preview(p.view.total) : text.previewPending}
                </h3>
                {p.busy && !p.view ? (
                  <p role="status" className="v-muted">
                    {p.exporting ? text.exporting : text.preparing}
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
            <span>
              {text.destination}
              <br />
              <span id={`${id}-expiry`}>{text.expiry}</span>
            </span>
            <Button
              size="sm"
              aria-disabled={p.exporting || undefined}
              onClick={close}
            >
              {text.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              aria-disabled={!p.view || p.busy}
              aria-busy={p.busy}
              ref={download}
              aria-describedby={`${id}-expiry`}
              onClick={() => {
                if (p.view && !p.busy) p.onDownload();
              }}
            >
              {text.download}
            </Button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
      {p.confirmationId && (
        <CalendarIcsReplacement
          busy={!!p.exporting}
          onReplace={p.onReplace}
          returnFocus={() => download.current ?? false}
        />
      )}
    </Dialog.Root>
  );
}
