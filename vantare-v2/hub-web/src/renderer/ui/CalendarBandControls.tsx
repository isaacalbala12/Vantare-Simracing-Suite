import type {
  CalendarBand,
  CalendarBandMode,
  CalendarDays,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarBandText as text } from "../i18n/calendarBands";
import { shiftBand } from "../screens/calendar/bands";
import { Button } from "./Button";
import { Segmented, Switch } from "./Forms";
import "./calendar-band-controls.css";
export function CalendarBandControls({
  seriesId,
  band,
  defaultBand,
  every,
  lead,
  leads,
  days,
  modes,
  stepMinutes,
  dayMinutes,
  busy,
  onBand,
  onLead,
}: {
  seriesId: string;
  band: CalendarBand | undefined;
  defaultBand: CalendarBand;
  every: number;
  lead: number;
  leads: readonly number[];
  days: readonly CalendarDays[];
  modes: readonly CalendarBandMode[];
  stepMinutes: number;
  dayMinutes: number;
  busy: boolean;
  onBand?: (band: CalendarBand | undefined) => void;
  onLead?: (lead: number) => void;
}) {
  const shown = band ?? { ...defaultBand, seriesId },
    hhmm = (n: number) =>
      `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return (
    <div className="v-calendar-band-box" data-enabled={!!band || undefined}>
      <div className="v-calendar-band-title">
        <Icon name={band ? "bell-fill" : "bell"} />
        <div>
          <strong>
            {band
              ? text.enabled(hhmm(shown.from), hhmm(shown.to))
              : text.disabled}
          </strong>
          <p>
            {band
              ? text.hint(
                  text.daysLong[shown.days],
                  Math.ceil((shown.to - shown.from) / Math.max(1, every)),
                )
              : text.disabledHelp}
          </p>
        </div>
        <Switch
          hideLabel
          label={text.toggle}
          checked={!!band}
          disabled={busy || !onBand}
          onCheckedChange={(value) => onBand?.(value ? shown : undefined)}
        />
      </div>
      <div className="v-calendar-band-row">
        <span>{text.from}</span>
        <Button
          className="v-calendar-band-time"
          aria-label={text.start}
          disabled={busy || !onBand}
          onClick={() =>
            onBand?.(shiftBand(shown, false, stepMinutes, dayMinutes))
          }
        >
          {hhmm(shown.from)}
        </Button>
        <span>{text.to}</span>
        <Button
          className="v-calendar-band-time"
          aria-label={text.end}
          disabled={busy || !onBand}
          onClick={() =>
            onBand?.(shiftBand(shown, true, stepMinutes, dayMinutes))
          }
        >
          {hhmm(shown.to)}
        </Button>
        <Segmented
          disabled={busy || !onBand}
          label={text.toggle}
          value={shown.days}
          onChange={(value) => {
            const day = days.find((day) => day === value);
            if (day) onBand?.({ ...shown, days: day });
          }}
          options={days.map((value) => ({ value, label: text.days[value] }))}
        />
      </div>
      <div className="v-calendar-band-row">
        <span>{text.notify}</span>
        <Segmented
          disabled={busy || !onBand}
          label={text.notify}
          value={shown.mode}
          onChange={(value) => {
            const mode = modes.find((mode) => mode === value);
            if (mode) onBand?.({ ...shown, mode });
          }}
          options={modes.map((value) => ({ value, label: text.modes[value] }))}
        />
        <span>{text.before}</span>
        <Segmented
          disabled={busy || !onLead}
          label={text.before}
          value={String(lead)}
          onChange={(value) => {
            const next = leads.find((lead) => String(lead) === value);
            if (next !== undefined) onLead?.(next);
          }}
          options={leads.map((value) => ({
            value: String(value),
            label: `${value}′`,
          }))}
        />
      </div>
    </div>
  );
}
