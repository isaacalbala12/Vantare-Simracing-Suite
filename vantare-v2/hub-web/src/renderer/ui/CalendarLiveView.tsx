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
  daily,
  nextRace,
  raceMinutes,
} from "../screens/calendar/rows";
import { Button } from "./Button";
import { clock } from "./calendarDate";
import { SearchInput, Segmented, Select } from "./Forms";
import "./calendar-live.css";

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
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function CalendarLiveView({
  schedule,
  alerts,
  following,
  utc,
  now,
  limit,
  profile,
  onFollow,
  onDetail,
  onLaunch,
  onArm,
}: {
  schedule: CalendarSchedule;
  alerts: CalendarAlerts;
  following: string[];
  utc: boolean;
  now: number;
  limit: number;
  profile?: string;
  onFollow: (id: string, on: boolean) => void;
  onDetail: (id: string, at?: number) => void;
  onLaunch: () => void;
  onArm: (at: number) => void;
}) {
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
          onClick={() => onFollow(s.id, !row.favorite)}
        >
          <Icon name={row.favorite ? "star" : "star-line"} />
        </Button>
        <button
          type="button"
          className="v-calendar-live-series"
          onClick={() => onDetail(s.id, row.next)}
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
          {s.classes.length > 2
            ? `${s.classes.length} ${text.classes.toLowerCase()}`
            : (s.classes.length
                ? s.classes.map((c) => c.name)
                : [s.vehicleClass]
              ).map((c) => <span key={c}>{c.replace(" Class", "")}</span>)}
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
          {row.starts.map((at) => (
            <button
              type="button"
              key={at}
              className="v-calendar-time"
              data-next={row.next === at || undefined}
              data-alert={alertAt(schedule, s, at, alerts, limit) || undefined}
              style={{
                left: `${(100 * (at - (now - 10 * 60_000))) / (100 * 60_000)}%`,
              }}
              onClick={() => onDetail(s.id, at)}
            >
              {clock(at, utc)}
            </button>
          ))}
          {!row.starts.length && !daily(s) && (
            <button
              type="button"
              className="v-calendar-event-range"
              onClick={() => onDetail(s.id)}
            >
              {s.track.split(" (")[0]}
              {text.separator}
              {text.weekendSlots}
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
              {text.separator}
              {hero.series.vehicleClass}
            </p>
            <p>{text.raceDuration(raceMinutes(hero.series))}</p>
            <div className="v-calendar-after">
              {text.after}
              {hero.after.slice(0, 3).map((r) => (
                <span key={`${r.series.id}:${r.time}`}>
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
            </p>
          </div>
          <div className="v-calendar-hero-actions">
            <Button variant="primary" onClick={onLaunch} disabled={!profile}>
              <Icon name="play" />
              {text.launch(profile ?? "LMU")}
              <kbd>{text.launchShortcut}</kbd>
            </Button>
            <div>
              <Button onClick={() => onDetail(hero.series.id, hero.at)}>
                {text.detail}
              </Button>
              <Button
                onClick={() => onArm(hero.at - 3 * 60_000)}
                disabled={!profile}
              >
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
                <Button key={s.id} onClick={() => onFollow(s.id, true)}>
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
            <span>{text.slotsNext90}</span>
          </div>
          <Segmented
            label={text.favorites}
            value={only}
            onChange={setOnly}
            options={[
              { value: "all", label: `${text.all} ${schedule.series.length}` },
              {
                value: "favorites",
                label: `${text.favorites} ${following.length}`,
              },
            ]}
          />
          <Segmented
            label={text.tiers.weekly}
            value={tier}
            onChange={setTier}
            options={[
              { value: "all", label: text.allTiers },
              ...Object.entries(text.tiers).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
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
          <SearchInput
            label={text.search}
            clearLabel={text.clearSearch}
            value={query}
            onChange={setQuery}
          />
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
