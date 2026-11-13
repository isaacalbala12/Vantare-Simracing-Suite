import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { type ReactNode, useId, useState } from "react";
import { isCalendarAlerts } from "../../contract/calendar-config-validation";
import {
  type CalendarAlerts,
  type CalendarBand,
  type CalendarChannels,
  type CalendarSchedule,
  calendarAlertLeads,
  calendarDayMinutes,
  calendarDays,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarStartNoticeText } from "../i18n/calendar-notices";
import { calendarAlertsText as text } from "../i18n/calendarAlerts";
import { calendarBandText as bandText } from "../i18n/calendarBands";
import { calendarLaunchText } from "../i18n/calendarLaunch";
import type { CalendarAlertChange } from "../screens/calendar/AlertChange";
import { daily, nextStart, raceMinutes } from "../screens/calendar/rows";
import { relativeDay } from "../screens/calendar/series";
import { Button, IconButton } from "./Button";
import {
  type AlertsDocumentState,
  CalendarAlertsStatus,
} from "./CalendarAlertsStatus";
import { civilDay, clock } from "./calendarDate";
import { Segmented, Switch } from "./Forms";
import { Tooltip } from "./Layers";
import { WindowDialog as Dialog } from "./WindowDialog";
import "../assets/calendar-alerts.css";
import "../design/generated/calendar-tokens.css";
import "./calendar-alerts.css";

const hm = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
type Props = {
  launchControl?: {
    armed: boolean;
    decisionRequired?: boolean;
    busy: boolean;
    reason?: string;
    onChange: (enabled: boolean) => void;
  };
  schedule: CalendarSchedule | null;
  alertsState?: AlertsDocumentState;
  windowsDisabledReason?: string;
  returnFocus?: () => HTMLElement | false;
  alerts: CalendarAlerts;
  following: readonly string[];
  now: number;
  utc: boolean;
  limit: number;
  profile?: string;
  canEdit: boolean;
  busy: boolean;
  onChange: (change: CalendarAlertChange) => void;
  onClose: () => void;
  onTest?: () => void;
  testBusy?: boolean;
  testCooling?: boolean;
  testFeedback?: ReactNode;
  failure?: ReactNode;
};
export function CalendarAlertsDialog(p: Props) {
  const testHint = useId();
  const [editing, setEditing] = useState<string>();
  const name = (id: string) =>
    p.schedule?.series.find((s) => s.id === id)?.name ?? text.missing(id);
  const disabled = !p.canEdit;
  const ready = (p.alertsState ?? "ready") === "ready";
  const legacy = !isCalendarAlerts(p.alerts);
  const change = (value: CalendarAlertChange) => {
    if (!p.busy && !disabled) p.onChange(value);
  };
  return (
    <Dialog.Root
      modal={false}
      open
      onOpenChange={(open) => {
        if (!open) p.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-calendar-alerts-backdrop" />
        <Dialog.Popup
          className="v-calendar v-calendar-alerts"
          aria-describedby={undefined}
          finalFocus={p.returnFocus ?? true}
        >
          <header>
            <div>
              <Dialog.Title>{text.title}</Dialog.Title>
              <p>{text.subtitle}</p>
            </div>
            <IconButton label={text.close} variant="ghost" onClick={p.onClose}>
              <Icon name="x" />
            </IconButton>
          </header>
          <div className="v-calendar-alerts-body">
            {p.failure}
            {p.testFeedback}
            <CalendarAlertsStatus state={p.alertsState ?? "ready"} />
            {ready && legacy && <p role="status">{text.duplicates}</p>}
            {p.busy && <p role="status">{text.saving}</p>}
            {ready && (
              <div className="v-calendar-alerts-columns">
                <section>
                  <Caption>{text.lead}</Caption>
                  <p>{text.leadScope}</p>
                  <Segmented
                    label={`${text.lead}. ${text.leadScope}`}
                    value={String(p.alerts.leadMin)}
                    disabled={disabled || legacy}
                    pending={p.busy}
                    options={calendarAlertLeads.map((n) => ({
                      value: String(n),
                      label: text.minute(n),
                    }))}
                    onChange={(value) => {
                      const next = calendarAlertLeads.find(
                        (n) => String(n) === value,
                      );
                      if (next !== undefined)
                        change({ kind: "lead", value: next });
                    }}
                  />
                  <Caption>{text.where}</Caption>
                  <p role="status">
                    {p.windowsDisabledReason ?? text.deliveryScope}
                  </p>
                  {(
                    [
                      ["windows", text.windows, text.windowsHint],
                      ["inTrack", text.track, text.trackHint],
                      ["sound", text.sound, text.soundHint],
                    ] as const
                  ).map(([channel, label, hint]) => (
                    <Channel
                      key={channel}
                      label={label}
                      hint={
                        channel !== "inTrack" && p.windowsDisabledReason
                          ? p.windowsDisabledReason
                          : channel === "sound" && !p.alerts.channels.windows
                            ? text.soundRequiresWindows
                            : hint
                      }
                      value={p.alerts.channels[channel]}
                      disabled={
                        disabled ||
                        legacy ||
                        (channel !== "inTrack" && !!p.windowsDisabledReason) ||
                        (channel === "sound" && !p.alerts.channels.windows)
                      }
                      pending={p.busy}
                      onChange={(value) => {
                        if (channel !== "inTrack" && p.windowsDisabledReason)
                          return;
                        if (channel === "sound" && !p.alerts.channels.windows)
                          return;
                        change({
                          kind: "channel",
                          channel: channel as keyof CalendarChannels,
                          value,
                        });
                      }}
                    />
                  ))}
                  <Caption>{text.when}</Caption>
                  <Tooltip
                    label={
                      p.launchControl?.reason ?? calendarLaunchText.onlyOpen
                    }
                  >
                    <div className="v-calendar-alerts-auto">
                      <Switch
                        hideLabel
                        label={text.auto(p.profile ?? text.defaultProfile)}
                        checked={
                          p.launchControl
                            ? p.launchControl.armed
                            : p.alerts.autoLaunch
                        }
                        disabled={
                          disabled ||
                          legacy ||
                          (p.launchControl
                            ? !p.launchControl.armed && !!p.launchControl.reason
                            : !p.alerts.autoLaunch)
                        }
                        pending={p.busy || p.launchControl?.busy}
                        onCheckedChange={(value) => {
                          if (p.busy || p.launchControl?.busy) return;
                          if (p.launchControl) p.launchControl.onChange(value);
                          else if (!value) change({ kind: "autoLaunchOff" });
                        }}
                      />
                      <div>
                        <strong>
                          {text.auto(p.profile ?? text.defaultProfile)}
                        </strong>
                        <p>
                          {p.launchControl
                            ? (p.launchControl.reason ??
                              calendarLaunchText.onlyOpen)
                            : p.alerts.autoLaunch
                              ? text.autoLegacyHint
                              : text.autoHint}
                        </p>
                      </div>
                    </div>
                  </Tooltip>
                  {p.launchControl?.armed &&
                    p.launchControl.decisionRequired && (
                      <p role="status">{calendarLaunchText.ask}</p>
                    )}
                  {p.launchControl &&
                    p.alerts.autoLaunch &&
                    !p.launchControl.armed && (
                      <p role="status">{calendarLaunchText.stored}</p>
                    )}
                  <Caption>{text.what}</Caption>
                  <div className="v-calendar-alerts-help">
                    <b>{text.daily}</b>
                    <p>{text.dailyHelp}</p>
                    <b>{text.events}</b> {text.eventsHelp}
                  </div>
                </section>
                <section>
                  {!p.windowsDisabledReason && (
                    <>
                      <Caption>{text.sample}</Caption>
                      <p>{text.previewScope}</p>
                      <Preview {...p} />
                    </>
                  )}
                  <Caption
                    hint={text.count(
                      p.alerts.bands.length,
                      p.alerts.slots.length,
                    )}
                  >
                    {text.yours}
                  </Caption>
                  <div className="v-calendar-alerts-list">
                    {p.alerts.bands
                      .filter(
                        (band, index, all) =>
                          all.findIndex(
                            (candidate) => candidate.seriesId === band.seriesId,
                          ) === index,
                      )
                      .map((band) => (
                        <BandRow
                          key={band.seriesId}
                          band={band}
                          name={name(band.seriesId)}
                          canEdit={
                            !disabled &&
                            !!p.schedule?.series.some(
                              (s) => s.id === band.seriesId && daily(s),
                            )
                          }
                          canRemove={!disabled}
                          pending={p.busy}
                          editing={editing === band.seriesId}
                          onEdit={() =>
                            setEditing(
                              editing === band.seriesId
                                ? undefined
                                : band.seriesId,
                            )
                          }
                          onChange={change}
                        />
                      ))}
                    {p.alerts.slots
                      .filter(
                        (slot, index, all) =>
                          all.findIndex(
                            (candidate) =>
                              candidate.seriesId === slot.seriesId &&
                              candidate.at === slot.at,
                          ) === index,
                      )
                      .map((slot) => (
                        <div
                          className="v-calendar-alerts-item"
                          key={`${slot.seriesId}:${slot.at}`}
                        >
                          <i />
                          <div>
                            <strong>{name(slot.seriesId)}</strong>
                            <p>
                              {Number.isFinite(
                                new Date(slot.at * 1000).getTime(),
                              )
                                ? text.slot(
                                    relativeDay(
                                      civilDay(slot.at * 1000, 0, p.utc),
                                      p.now,
                                      p.utc,
                                    ),
                                    clock(slot.at * 1000, p.utc),
                                    clock(
                                      slot.at * 1000 -
                                        p.alerts.leadMin * 60_000,
                                      p.utc,
                                    ),
                                  )
                                : text.invalidSlot}
                            </p>
                          </div>
                          <IconButton
                            label={text.removeSlot}
                            variant="ghost"
                            disabled={disabled}
                            aria-disabled={p.busy || disabled}
                            onClick={() =>
                              change({
                                kind: "slot",
                                id: slot.seriesId,
                                at: slot.at,
                                enabled: false,
                              })
                            }
                          >
                            <Icon name="x" />
                          </IconButton>
                        </div>
                      ))}
                    {p.schedule?.series
                      .filter(
                        (s) =>
                          daily(s) &&
                          p.following.includes(s.id) &&
                          !p.alerts.bands.some((b) => b.seriesId === s.id),
                      )
                      .map((s) => (
                        <div className="v-calendar-alerts-add" key={s.id}>
                          <span>{s.name}</span>
                          <Button
                            size="sm"
                            disabled={disabled}
                            aria-disabled={p.busy || disabled}
                            onClick={() =>
                              change({
                                kind: "band",
                                id: s.id,
                                enabled: true,
                                patch: {},
                              })
                            }
                          >
                            {text.add}
                          </Button>
                        </div>
                      ))}
                    {!p.alerts.bands.length && !p.alerts.slots.length && (
                      <p className="v-calendar-alerts-empty">{text.empty}</p>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
          <footer>
            <Tooltip label={p.windowsDisabledReason ?? text.testHint}>
              <span>
                <span id={testHint} className="v-sr-only">
                  {p.windowsDisabledReason ?? text.testHint}
                </span>
                <Button
                  disabled={!p.onTest || !ready || !!p.windowsDisabledReason}
                  focusableWhenDisabled
                  aria-disabled={
                    !p.onTest ||
                    !ready ||
                    !!p.windowsDisabledReason ||
                    p.testBusy ||
                    p.testCooling ||
                    p.busy
                  }
                  aria-busy={p.testBusy || undefined}
                  onClick={() => {
                    if (
                      !p.windowsDisabledReason &&
                      !p.testBusy &&
                      !p.testCooling &&
                      !p.busy &&
                      ready
                    )
                      p.onTest?.();
                  }}
                  aria-describedby={testHint}
                >
                  {text.test}
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="primary"
              aria-disabled={p.busy}
              onClick={() => {
                if (!p.busy) p.onClose();
              }}
            >
              {text.save}
            </Button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Caption({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="v-calendar-alerts-caption">
      <h3>{children}</h3>
      {hint && <span>{hint}</span>}
    </div>
  );
}
function Channel({
  label,
  hint,
  value,
  disabled,
  pending,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      className="v-calendar-alerts-channel"
      data-enabled={value || undefined}
      data-disabled={disabled || undefined}
      htmlFor={id}
    >
      <BaseCheckbox.Root
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        className="v-checkbox"
        checked={value}
        disabled={disabled}
        aria-disabled={disabled || pending}
        aria-busy={pending}
        onCheckedChange={(value) => {
          if (!pending) onChange(value);
        }}
      >
        <BaseCheckbox.Indicator>
          <Icon name="check" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <div>
        <strong id={`${id}-title`}>{label}</strong>
        <p id={`${id}-hint`}>{hint}</p>
      </div>
    </label>
  );
}
function BandRow({
  band,
  name,
  canEdit,
  canRemove,
  pending,
  editing,
  onEdit,
  onChange,
}: {
  band: CalendarBand;
  name: string;
  canEdit: boolean;
  canRemove: boolean;
  pending: boolean;
  editing: boolean;
  onEdit: () => void;
  onChange: (change: CalendarAlertChange) => void;
}) {
  const moves = [
    { label: text.fromLess, edge: "from", delta: -30 },
    { label: text.fromMore, edge: "from", delta: 30 },
    { label: text.toLess, edge: "to", delta: -30 },
    { label: text.toMore, edge: "to", delta: 30 },
  ] as const;
  return (
    <div className="v-calendar-alerts-band">
      <div className="v-calendar-alerts-item">
        <i />
        <div>
          <strong>{name}</strong>
          <p>
            {text.band(
              hm(band.from),
              hm(band.to),
              bandText.daysLong[band.days].toLowerCase(),
              bandText.modes[band.mode].toLowerCase(),
            )}
          </p>
        </div>
        <Button size="sm" disabled={!canEdit} onClick={onEdit}>
          {editing ? text.endEdit : text.edit}
        </Button>
        <IconButton
          label={text.removeBand}
          variant="ghost"
          disabled={!canRemove}
          aria-disabled={pending || !canRemove}
          onClick={() =>
            onChange({
              kind: "band",
              id: band.seriesId,
              enabled: false,
              patch: {},
            })
          }
        >
          <Icon name="x" />
        </IconButton>
      </div>
      {editing && (
        <div className="v-calendar-alerts-band-editor">
          {moves.map((move) => {
            const next = Math.max(
              0,
              Math.min(calendarDayMinutes, band[move.edge] + move.delta),
            );
            const valid =
              move.edge === "from" ? next < band.to : next > band.from;
            return (
              <Button
                key={`${move.edge}:${move.delta}`}
                size="sm"
                disabled={!canEdit || !valid || next === band[move.edge]}
                aria-disabled={
                  pending || !canEdit || !valid || next === band[move.edge]
                }
                aria-label={`${move.edge === "from" ? text.starts : text.ends}: ${hm(next)}`}
                onClick={() =>
                  onChange({
                    kind: "band",
                    id: band.seriesId,
                    enabled: true,
                    patch: { [move.edge]: next },
                  })
                }
              >
                {move.label}
              </Button>
            );
          })}
          <Button
            size="sm"
            disabled={!canEdit}
            aria-disabled={pending || !canEdit}
            onClick={() =>
              onChange({
                kind: "band",
                id: band.seriesId,
                enabled: true,
                patch: {
                  days: calendarDays[
                    (calendarDays.indexOf(band.days) + 1) % calendarDays.length
                  ],
                },
              })
            }
          >
            {bandText.days[band.days]}
          </Button>
          <Button
            size="sm"
            disabled={!canEdit}
            aria-disabled={pending || !canEdit}
            onClick={() =>
              onChange({
                kind: "band",
                id: band.seriesId,
                enabled: true,
                patch: { mode: band.mode === "each" ? "first" : "each" },
              })
            }
          >
            {bandText.modes[band.mode]}
          </Button>
        </div>
      )}
    </div>
  );
}
function Preview(p: Props) {
  const series =
    p.schedule?.series.find((s) =>
      p.alerts.bands.some((b) => b.seriesId === s.id),
    ) ?? p.schedule?.series[0];
  const first =
    series && p.schedule
      ? nextStart(p.schedule, series, p.now, p.limit)
      : undefined;
  const sample =
    series && first !== undefined
      ? calendarStartNoticeText(
          {
            series: series.name,
            track: series.track,
            at: first,
            raceMinutes: raceMinutes(series),
          },
          first - p.alerts.leadMin * 60000,
        )
      : undefined;
  return (
    <section
      className="v-calendar-alerts-preview"
      aria-label={text.previewLabel}
    >
      <div className="v-calendar-alerts-toast">
        <header>
          <Icon name="i-vantare" />
          <span>{text.previewApp}</span>
          <span>{text.now}</span>
        </header>
        <div className="v-calendar-alerts-toast-body">
          <b>{`${p.alerts.leadMin}′`}</b>
          <div>
            <strong>{sample?.title ?? text.previewMissing}</strong>
            <p>{sample?.body ?? text.previewMissingHelp}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
