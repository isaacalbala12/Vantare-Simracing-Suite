import { useState } from "react";
import type {
  CalendarAlerts,
  CalendarSchedule,
  CalendarSeries,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";
import {
  alertAt,
  board,
  nextRace,
  raceMinutes,
} from "../screens/calendar/rows";
import { Button, IconButton } from "./Button";
import { CalendarFilters } from "./CalendarFilters";
import { civilDay, clock, datePart } from "./calendarDate";
import { zoneLabel } from "./calendarZone";
import { SearchInput, Select } from "./Forms";
import "./calendar-live.css";

function classLabel(value: string) {
  return (value.includes("McLaren") ? "LMGT3" : value).replace(" Class", "");
}
function Tier({ series }: { series: CalendarSeries }) {
  return (
    <span className="v-calendar-tier" data-tier={series.tier}>
      {series.eventKind === "special"
        ? text.specialty
        : (text.tiers[series.tier as keyof typeof text.tiers] ?? series.tier)}
    </span>
  );
}
function countdown(at: number, now: number) {
  const seconds = Math.max(0, Math.floor((at - now) / 1000));
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
export function CalendarLiveView({
  schedule,
  alerts,
  following,
  utc,
  now,
  limit,
  profile,
  canLaunch = true,
  canFollow = true,
  onFollow,
  onDetail,
  onLaunch,
}: {
  schedule: CalendarSchedule;
  alerts: CalendarAlerts;
  following: string[];
  utc: boolean;
  now: number;
  limit: number;
  profile?: string;
  canLaunch?: boolean;
  canFollow?: boolean;
  onFollow: (id: string, on: boolean) => void;
  onDetail?: (id: string, at?: number) => void;
  onLaunch: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState(""),
    [tier, setTier] = useState("all"),
    [only, setOnly] = useState("all"),
    [vehicle, setVehicle] = useState("all");
  const hero = nextRace(schedule, now, following, limit),
    rows = board(schedule, now, following, limit);
  const classes = [
    ...new Set(
      schedule.series.flatMap((s) =>
        s.classes.length ? s.classes.map((c) => c.name) : [s.vehicleClass],
      ),
    ),
  ].sort();
  const included = (s: CalendarSeries) =>
    (tier === "all" || s.tier === tier) &&
    (vehicle === "all" ||
      s.vehicleClass === vehicle ||
      s.classes.some((c) => c.name === vehicle)) &&
    `${s.name} ${s.track}`.toLowerCase().includes(query.trim().toLowerCase());
  const favorites = rows.favorites.filter((r) => included(r.series)),
    rest = only === "all" ? rows.rest.filter((r) => included(r.series)) : [];
  const renderRow = (row: ReturnType<typeof board>["rest"][number]) => {
    const s = row.series,
      hasAlert =
        row.next !== undefined && alertAt(schedule, s, row.next, alerts, limit);
    const visibleStarts = row.starts.filter(
      (at) =>
        at - (now - 10 * 60_000) > 5.5 * 60_000 &&
        now + 90 * 60_000 - at > 5.5 * 60_000,
    );
    const future = visibleStarts.some((at) => at >= now);
    const nextDay =
      row.next === undefined
        ? ""
        : civilDay(row.next, 0, utc) === civilDay(now, 0, utc)
          ? text.today
          : civilDay(row.next, 0, utc) === civilDay(now, 1, utc)
            ? text.tomorrow
            : `${datePart(row.next, "weekday", utc)} ${datePart(row.next, "day", utc)}`;
    const tag =
      s.eventKind === "special"
        ? text.weekendSlots
        : s.eventKind === "weekly"
          ? text.weekdaySlots
          : "";
    return (
      <div
        className="v-calendar-live-row"
        data-favorite={row.favorite || undefined}
        key={s.id}
      >
        <Button
          variant="ghost"
          className="v-calendar-star"
          aria-label={text.toggleFavorite(s.name)}
          disabled={!canFollow}
          onClick={() => onFollow(s.id, !row.favorite)}
        >
          <Icon name={row.favorite ? "star" : "star-line"} />
        </Button>
        <button
          type="button"
          className="v-calendar-live-series"
          disabled={!onDetail}
          onClick={() => onDetail?.(s.id, row.next)}
        >
          <strong>{s.name}</strong>
          <span>
            <Tier series={s} />
            {s.track.split(" (")[0]}
            {text.separator}
            {text.minutes(raceMinutes(s))}
          </span>
        </button>
        <div className="v-calendar-live-classes">
          {s.classes.length > 2 ? (
            <span className="v-calendar-multi-class">
              {s.classes.slice(0, 3).map((item) => (
                <i
                  key={item.name}
                  data-class={classLabel(item.name).toLowerCase()}
                />
              ))}
              {s.classes.length} {text.classes.toLowerCase()}
            </span>
          ) : (
            (s.classes.length
              ? s.classes.map((c) => c.name)
              : [s.vehicleClass]
            ).map((c) => (
              <span key={c} data-class={classLabel(c).toLowerCase()}>
                {classLabel(c)}
              </span>
            ))
          )}
        </div>
        <div className="v-calendar-live-next">
          <strong>{row.next === undefined ? "—" : clock(row.next, utc)}</strong>
          <small>
            {row.next === undefined
              ? ""
              : new Date(row.next).getDate() !== new Date(now).getDate()
                ? text.tomorrow
                : text.inMinutes(Math.ceil((row.next - now) / 60_000))}
          </small>
        </div>
        <div className="v-calendar-live-line">
          <i className="v-calendar-now" />
          {visibleStarts.map((at) => (
            <button
              type="button"
              key={at}
              className="v-calendar-time"
              data-next={row.next === at || undefined}
              data-gone={at < now || undefined}
              data-alert={
                (alerts.bands.some((band) => band.seriesId === s.id)
                  ? (row.next === at &&
                      alertAt(schedule, s, at, alerts, limit)) ||
                    alerts.slots.some(
                      (slot) => slot.seriesId === s.id && slot.at * 1000 === at,
                    )
                  : alertAt(schedule, s, at, alerts, limit)) || undefined
              }
              style={{
                left: `${(100 * (at - (now - 10 * 60_000))) / (100 * 60_000)}%`,
              }}
              disabled={!onDetail}
              onClick={() => onDetail?.(s.id, at)}
            >
              {clock(at, utc)}
            </button>
          ))}
          {!future && row.next !== undefined && (
            <button
              type="button"
              className="v-calendar-event-range"
              disabled={!onDetail}
              onClick={() => onDetail?.(s.id)}
            >
              {nextDay} {clock(row.next, utc)}
              {tag && (
                <>
                  {text.separator}
                  {tag}
                </>
              )}
              <Icon name="down" />
            </button>
          )}
          {hasAlert && <span className="v-sr-only">{text.alerts}</span>}
        </div>
      </div>
    );
  };
  return (
    <div className="v-calendar-live">
      {hero ? (
        <section className="v-calendar-hero">
          <div className="v-calendar-hero-copy">
            <div className="v-calendar-eyebrow">
              {text.yourNext}
              <Tier series={hero.series} />
              {alertAt(schedule, hero.series, hero.at, alerts, limit) && (
                <span className="v-calendar-alert-chip">
                  {text.alertAt(clock(hero.at - alerts.leadMin * 60_000, utc))}
                  <Icon name="bell-fill" />
                </span>
              )}
            </div>
            <h2>{hero.series.name}</h2>
            <p>
              <strong>{hero.series.track.split(" (")[0]}</strong>
              <span className="v-calendar-license">
                {hero.series.track.split(" (")[1]?.replace(/\)$/u, "") ?? ""}
              </span>
              <span
                className="v-calendar-hero-class"
                data-class={hero.series.vehicleClass
                  .replace(" Class", "")
                  .toLowerCase()}
              >
                {classLabel(hero.series.vehicleClass)}
              </span>
            </p>
            <p>{text.raceDuration(raceMinutes(hero.series))}</p>
            <div className="v-calendar-after">
              {text.after}
              {hero.after.slice(0, 3).map((r) => (
                <span key={`${r.series.id}:${r.time}`}>
                  <Icon name="star" />
                  {clock(r.time, utc)}
                  {text.separator}
                  {r.series.name}
                </span>
              ))}
            </div>
          </div>
          <div className="v-calendar-hero-time">
            <small>{text.leavesToday(clock(hero.at, utc))}</small>
            <strong>{countdown(hero.at, now)}</strong>
            <p>
              {text.raceAt} <b>{clock(hero.raceAt, utc)}</b>
              {text.separator}
              {utc ? text.utc : zoneLabel(hero.at, true)}
            </p>
          </div>
          <div className="v-calendar-hero-actions">
            <Button
              variant="primary"
              onClick={onLaunch}
              disabled={!profile || !canLaunch}
            >
              <Icon name="play" />
              {profile
                ? text.launch(
                    Array.from(profile).slice(0, 18).join("") +
                      (Array.from(profile).length > 18 ? "…" : ""),
                  )
                : text.launchDefault}
              <kbd>{text.launchShortcut}</kbd>
            </Button>
            <div>
              <Button
                disabled={!onDetail}
                onClick={() => onDetail?.(hero.series.id, hero.at)}
              >
                <Icon name="info" />
                {text.detail}
              </Button>
              <Button
                className="v-calendar-launch-pending"
                title={text.launchPending}
                disabled
              >
                <Icon name="clock" />
                {text.launchAt(clock(hero.at - 3 * 60_000, utc))}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="v-calendar-no-favorites">
          <Icon name="star-line" />
          <h2>{text.noFavorites}</h2>
          <p>{text.favoritesHelp}</p>
          <div>
            {["beginner", "intermediate", "advanced"]
              .map((t) => schedule.series.find((s) => s.tier === t))
              .filter((s): s is CalendarSeries => !!s)
              .map((s) => (
                <Button
                  key={s.id}
                  disabled={!canFollow}
                  onClick={() => onFollow(s.id, true)}
                >
                  <Tier series={s} />
                  {s.name}
                  {text.separator}
                  {text.favorite}
                </Button>
              ))}
          </div>
        </section>
      )}
      <section className="v-calendar-live-board">
        <div className="v-calendar-live-tools">
          <div className="v-calendar-board-caption">
            <strong>{text.departures}</strong>
            <span>
              {text.slotsNext90}
              {text.separator}
              {utc ? text.utc : zoneLabel(now, true)}
            </span>
          </div>
          <CalendarFilters
            only={only}
            tier={tier}
            total={schedule.series.length}
            following={following.length}
            onOnly={setOnly}
            onTier={setTier}
          />
          <Select
            label={text.classFilter}
            value={vehicle}
            onChange={setVehicle}
            hideLabel
            options={[
              { value: "all", label: text.class },
              ...classes.map((c) => ({ value: c, label: c })),
            ]}
          />
          <IconButton
            label={text.search}
            variant="ghost"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Icon name="search" />
          </IconButton>
          {(searchOpen || query) && (
            <SearchInput
              label={text.search}
              clearLabel={text.clearSearch}
              value={query}
              onChange={setQuery}
            />
          )}
        </div>
        <div className="v-calendar-live-head">
          <span />
          {[text.series, text.classes, text.next].map((label) => (
            <span key={label}>{label}</span>
          ))}
          <span>
            {Array.from({ length: 7 }, (_, i) =>
              clock(
                Math.ceil((now - 10 * 60_000) / (15 * 60_000)) * 15 * 60_000 +
                  i * 15 * 60_000,
                utc,
              ),
            ).join(" ")}
          </span>
        </div>
        <div className="v-calendar-live-body">
          {!!favorites.length && (
            <>
              <div className="v-calendar-group">
                {text.yourFavorites}
                <span>{text.nearestFirst}</span>
              </div>
              {favorites.map(renderRow)}
            </>
          )}
          {!!rest.length && (
            <>
              <div className="v-calendar-group">
                {text.remaining}
                <span>{text.tierOrder}</span>
              </div>
              {rest.map(renderRow)}
            </>
          )}
          {!favorites.length && !rest.length && <p>{text.noResults}</p>}
        </div>
      </section>
    </div>
  );
}
