import { Dialog } from "@base-ui/react/dialog";
import { type ReactNode, useState } from "react";
import type {
  CalendarAlerts,
  CalendarBand,
  CalendarSchedule,
  CalendarSeries,
} from "../../contract/generated/calendar";
import {
  calendarAlertLeads,
  calendarBandModes,
  calendarDayMinutes,
  calendarDays,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText } from "../i18n/calendar";
import { calendarDetailText as text } from "../i18n/calendarDetail";
import { calendarSeriesText as st } from "../i18n/calendarSeries";
import type { CalendarRun } from "../screens/calendar/CalendarRun";
import { detailDepartures, detailPhases } from "../screens/calendar/detail";
import { daily } from "../screens/calendar/rows";
import { seriesHistory, seriesRules } from "../screens/calendar/series";
import { Button, IconButton } from "./Button";
import { CalendarBandControls } from "./CalendarBandControls";
import { clock, datePart } from "./calendarDate";
import { zoneLabel } from "./calendarZone";
import { Segmented, Switch } from "./Forms";
import { Tooltip } from "./Layers";
import "../assets/calendar-detail.css";
import "../design/generated/calendar-tokens.css";
import "./calendar-detail.css";

type Props = {
  schedule: CalendarSchedule;
  seriesId: string;
  initialAt?: number;
  now: number;
  utc: boolean;
  limit: number;
  alerts: CalendarAlerts;
  following: readonly string[];
  runs: readonly CalendarRun[];
  profile?: string;
  canLaunch: boolean;
  canFollow: boolean;
  busy?: boolean;
  onClose: () => void;
  onFollow: (id: string, enabled: boolean) => void;
  onLaunch: () => void;
  onSerie?: (id: string) => void;
  onExport?: () => void;
  onBand?: (id: string, band: CalendarBand | undefined) => void;
  onSlot?: (id: string, at: number, enabled: boolean) => void;
  onLead?: (n: number) => void;
  failure?: ReactNode;
};
export function CalendarDetail(props: Props) {
  const series = props.schedule.series.find((s) => s.id === props.seriesId);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-calendar-detail-backdrop" />
        <Dialog.Popup
          className="v-calendar v-calendar-detail"
          aria-describedby={undefined}
          finalFocus={() =>
            document.querySelector<HTMLElement>(".v-calendar-serie-name h2") ??
            true
          }
        >
          {series ? (
            <DetailBody
              key={`${series.id}:${props.initialAt}`}
              {...props}
              series={series}
            />
          ) : (
            <>
              <Dialog.Title>{text.unknown}</Dialog.Title>
              <Button onClick={props.onClose}>{text.close}</Button>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function DetailBody(p: Props & { series: CalendarSeries }) {
  const { series: s, schedule, now, utc, alerts } = p;
  const picks = detailDepartures(schedule, s, now, p.limit);
  const [selected, setSelected] = useState(p.initialAt),
    at = selected ?? picks[0];
  const phase = detailPhases(s, at),
    isDaily = daily(s),
    followed = p.following.includes(s.id);
  const band = alerts.bands.find((b) => b.seriesId === s.id),
    slotOn =
      at !== undefined &&
      alerts.slots.some((x) => x.seriesId === s.id && x.at * 1000 === at);
  const history = seriesHistory(
    p.runs,
    s.id,
    Date.parse(schedule.validFrom),
    Date.parse(schedule.validUntil),
  );
  const count = p.runs.filter(
    (r) =>
      r.seriesId === s.id &&
      r.at >= Date.parse(schedule.validFrom) &&
      r.at < Date.parse(schedule.validUntil),
  ).length;
  const rules = seriesRules(s).filter(([label]) =>
    [st.setup, st.assists, st.warmers, st.tyres, st.splits].includes(label),
  );
  rules.push(
    s.veLimit === null
      ? [text.format, s.format === "team" ? text.team : text.individual]
      : [text.energy, `${s.veLimit} % VE`],
  );
  const hm = (value: number | undefined) =>
      value === undefined ? "—" : clock(value, utc),
    launchAt = at === undefined ? undefined : at - 180_000;
  return (
    <>
      <header className="v-calendar-detail-header">
        <div className="v-calendar-detail-kind">
          <span className="v-calendar-tier" data-tier={s.tier}>
            {calendarText.tiers[s.tier as keyof typeof calendarText.tiers] ??
              s.tier}
          </span>
          <span>
            {s.recurrence.kind === "interval"
              ? text.daily(s.recurrence.intervalMinutes)
              : s.eventKind === "special"
                ? text.special
                : text.weekly}
            {s.licenseLabel
              ? text.license(
                  s.licenseLabel
                    .replaceAll("Bronze", "Bronce")
                    .replaceAll("Silver", "Plata"),
                )
              : ""}
          </span>
        </div>
        <Button
          className="v-calendar-detail-series"
          size="sm"
          disabled={!p.onSerie}
          onClick={() => p.onSerie?.(s.id)}
        >
          {text.series}
        </Button>
        <IconButton
          className="v-calendar-detail-close"
          label={text.close}
          variant="ghost"
          onClick={p.onClose}
        >
          <Icon name="x" />
        </IconButton>
        <Dialog.Title>{s.name}</Dialog.Title>
        <p>
          <strong>{s.track.split(" (")[0]}</strong>{" "}
          <span>
            {s.track.includes("(")
              ? s.track.split("(")[1].replace(")", "")
              : ""}
          </span>
        </p>
        <div className="v-calendar-detail-classes">
          {s.classes.map((c) => (
            <span key={c.name}>
              <i data-class={c.name} />
              {c.name}
            </span>
          ))}
        </div>
      </header>
      <div className="v-calendar-detail-body">
        {p.failure}
        <section>
          <Caption
            title={text.choose}
            hint={utc ? "UTC" : zoneLabel(now, true)}
          />
          <div className="v-calendar-detail-picks">
            {picks.map((value) => (
              <Button
                key={value}
                size="sm"
                aria-pressed={value === at}
                onClick={() => setSelected(value)}
              >
                {isDaily
                  ? hm(value)
                  : `${datePart(value, "weekday", utc)} ${hm(value)}`}
              </Button>
            ))}
          </div>
        </section>
        <section>
          <Caption
            title={text.phase(hm(at))}
            hint={
              at === undefined
                ? ""
                : calendarText.inMinutes(
                    Math.max(0, Math.ceil((at - now) / 60_000)),
                  )
            }
          />
          <div className="v-calendar-detail-phase">
            {[text.practice, text.qualifying, text.race].map((name, i) => (
              <div key={name} style={{ flexGrow: phase.weights[i] }}>
                <b>{name}</b>
                <span>
                  {i === 2
                    ? calendarText.minutes(phase.minutes[i])
                    : `${phase.minutes[i]}′`}
                </span>
              </div>
            ))}
          </div>
          <div className="v-calendar-detail-hours">
            <span>
              {hm(at)} {text.enter}
            </span>
            <span>
              {hm(phase.raceAt)} {text.race.toLowerCase()}
            </span>
            <span>
              {`~${hm(phase.endAt)}`} {text.end}
            </span>
          </div>
          <p className="v-calendar-detail-estimate">{text.estimate}</p>
        </section>
        <div
          className="v-calendar-detail-favorite"
          data-enabled={followed || undefined}
        >
          <Icon name={followed ? "star" : "star-line"} />
          <div>
            <strong>{followed ? text.followed : text.follow}</strong>
            <p>{followed ? text.followedHelp : text.followHelp}</p>
          </div>
          <Switch
            hideLabel
            label={text.follow}
            checked={followed}
            disabled={!p.canFollow || p.busy}
            onCheckedChange={(value) => p.onFollow(s.id, value)}
          />
        </div>
        {isDaily ? (
          <CalendarBandControls
            seriesId={s.id}
            band={band}
            defaultBand={{
              seriesId: s.id,
              from: 1200,
              to: 1380,
              days: "all",
              mode: "each",
            }}
            every={s.recurrence.intervalMinutes}
            lead={alerts.leadMin}
            leads={calendarAlertLeads.slice(0, 3)}
            days={calendarDays}
            modes={calendarBandModes}
            stepMinutes={30}
            dayMinutes={calendarDayMinutes}
            busy={!!p.busy}
            onBand={p.onBand ? (value) => p.onBand?.(s.id, value) : undefined}
            onLead={p.onLead}
          />
        ) : (
          <div
            className="v-calendar-detail-favorite"
            data-enabled={slotOn || undefined}
          >
            <Icon name={slotOn ? "bell-fill" : "bell"} />
            <Button
              variant="ghost"
              disabled={!p.onSlot || at === undefined || at < now || p.busy}
              onClick={() => {
                if (at !== undefined) p.onSlot?.(s.id, at, !slotOn);
              }}
            >
              <strong>
                {slotOn && at !== undefined
                  ? text.alertAt(hm(at - alerts.leadMin * 60_000))
                  : text.alert}
              </strong>
              <span>{text.alertHelp(alerts.leadMin)}</span>
            </Button>
            <Segmented
              label={text.before}
              value={String(alerts.leadMin)}
              disabled={!p.onLead || p.busy}
              options={calendarAlertLeads.map((n) => ({
                value: String(n),
                label: `${n}′`,
              }))}
              onChange={(value) => {
                const n = calendarAlertLeads.find((n) => String(n) === value);
                if (n !== undefined) p.onLead?.(n);
              }}
            />
          </div>
        )}
        <section>
          <Caption title={text.rules} />
          <dl className="v-calendar-detail-rules">
            {rules.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <Caption title={text.history} hint={text.recorded} />
          <div className="v-calendar-detail-facts">
            {[
              [text.races, count ? text.count(count) : history.count],
              [text.best, history.best],
              [text.mean, history.mean],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <p className="v-calendar-detail-simulator">
            {text.simulator}{" "}
            <b>
              {st.multiplayer} {st.breadcrumb}{" "}
              {isDaily ? st.dailyRaces : st.events} {st.breadcrumb} {s.name}
            </b>
          </p>
        </section>
        {s.notes.some((note) => note.includes("tracerudp")) && (
          <div className="v-calendar-detail-warning">
            <strong>{text.tracer}</strong>
            <p>{text.tracerHelp}</p>
          </div>
        )}
      </div>
      <footer className="v-calendar-detail-footer">
        <div className="v-calendar-detail-profile">
          <Icon name="play" />
          <span>
            {text.profile} <b>{p.profile ?? text.defaultProfile}</b>
          </span>
          <small>{text.programs}</small>
          <Icon name="down" />
        </div>
        <div>
          <Button
            variant="primary"
            disabled={!p.canLaunch || p.busy}
            onClick={p.onLaunch}
          >
            <Icon name="play" />
            {text.launch}
          </Button>
          {launchAt !== undefined && launchAt > now && (
            <Tooltip label={calendarText.launchPending}>
              <span>
                <Button disabled aria-description={calendarText.launchPending}>
                  <Icon name="clock" />
                  {calendarText.launchAt(hm(launchAt))}
                </Button>
              </span>
            </Tooltip>
          )}
          <IconButton
            label={text.add}
            disabled={!p.onExport}
            onClick={p.onExport}
          >
            <Icon name="v-calendar" />
          </IconButton>
        </div>
      </footer>
    </>
  );
}
function Caption({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="v-calendar-detail-caption">
      <h3>{title}</h3>
      {hint && <span>{hint}</span>}
    </div>
  );
}
