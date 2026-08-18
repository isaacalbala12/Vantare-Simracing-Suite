import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import {
  Button,
  Chip,
  CornerSlot,
  Donut,
  HorizontalTimeline,
  IconButton,
  Input,
  ListRow,
  Monogram,
  Note,
  Seg,
  Select,
  StateChip,
  StatRow,
  StatTile,
  Surface,
  TyreItem,
  UnderlineTabs,
  useToast,
  type DonutSlice,
  type TimelineBlock,
  type TyreView,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { useCalendarStarts } from "../orbit/use-calendar-starts";
import { formatStartTime } from "../orbit/next-starts";
import {
  createWailsStrategyEditorRuntime,
  openOrCreateStrategyEditor,
  type StrategyEditorRuntime,
} from "../../strategy/strategy-editor-store";
import type { StrategyEditorDocument, StrategyTyre } from "../../strategy/strategy-editor";
import { assertPlannable, StrategyTyreError, type StrategyCorner } from "../../strategy/strategy-tyre";
import {
  subscribeToStrategyRoster,
  type StrategyRoster,
} from "./strategy-orbit-bridge";
import {
  buildPlan,
  clockTime,
  distribution,
  hhmm,
  lapTime,
  ORBIT_CORNERS,
  pitWindowClock,
  pitWindowLap,
  rotateOrder,
  stintClock,
  tyreCondition,
  tyreUses,
  type OrbitCorner,
  type StrategyDriver,
  type StrategyVariant,
  type TyreAssignments,
} from "./strategy-orbit-model";
import "../../styles/orbit-strategy.css";

/** Hueco que la shell reserva para la columna de Estrategia (briefing 07). */
export const STRATEGY_CONTEXT_SLOT_ID = "orbit-strategy-context-slot";

/** Clave local del reparto de pilotos y neumáticos (ver `00-decisiones.md`). */
const STORAGE_KEY = "vantare.v03orbit.strategy";

type StrategyTab = "overview" | "strategies" | "availability";
type SidePanel = "drivers" | "tyres";
type DonutMode = "laps" | "time";

/** `FL|FR|RL|RR` → esquina del dominio real (`strategy-tyre`). */
const CORNER_TO_DOMAIN: Record<OrbitCorner, StrategyCorner> = {
  FL: "front_left",
  FR: "front_right",
  RL: "rear_left",
  RR: "rear_right",
};

/** El compuesto `wet` del dominio no tiene chip propio en el kit. */
function chipCompound(tyre: StrategyTyre): TyreView["compound"] {
  return tyre.compound === "wet" ? "soft" : tyre.compound;
}

/** Reparto inicial: cuatro juegos por stint en orden de inventario. */
function defaultTyres(stints: number, tyres: readonly StrategyTyre[]): TyreAssignments {
  if (tyres.length === 0) return {};
  const map: Record<number, Partial<Record<OrbitCorner, string>>> = {};
  for (let i = 0; i < stints; i += 1) {
    map[i] = {};
    ORBIT_CORNERS.forEach((corner, k) => {
      map[i][corner] = tyres[(i * ORBIT_CORNERS.length + k) % tyres.length].id;
    });
  }
  return map;
}

function readStored(): Record<string, Partial<StrategyVariant>> {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Partial<StrategyVariant>>) : {};
  } catch {
    return {};
  }
}

function writeStored(value: Record<string, Partial<StrategyVariant>>): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Sin almacenamiento el reparto solo vive en memoria.
  }
}

export interface StrategyOrbitPageProps {
  /** Runtime del editor real; se crea contra Wails si no se inyecta. */
  runtimeFactory?: () => StrategyEditorRuntime;
  /** Evento y pilotos ya resueltos (tests y harness); si no, llega por el puente. */
  roster?: StrategyRoster | null;
}

/**
 * Estrategia de Command Orbit (`15-briefings/07-estrategia.md`, parte A).
 *
 * El inventario de neumáticos, su legalidad y su condición son del dominio
 * real (`strategy/strategy-editor.ts`, `strategy-tyre.ts`); el reparto de
 * vueltas y la rotación de pilotos, que el contrato no modela, viven en
 * `strategy-orbit-model.ts` con los casos a–d de `13.5`.
 */
export function StrategyOrbitPage({ runtimeFactory, roster: injected }: StrategyOrbitPageProps) {
  const { t } = useI18n();
  const toast = useToast();
  const contextSlot = useOrbitSlot(STRATEGY_CONTEXT_SLOT_ID);
  const calendar = useCalendarStarts();

  // ── evento activo ───────────────────────────────────────────────────────
  const [bridged, setBridged] = useState<StrategyRoster | null>(null);
  useEffect(() => {
    if (injected !== undefined) return;
    return subscribeToStrategyRoster(setBridged);
  }, [injected]);
  const roster = injected !== undefined ? injected : bridged;

  // ── documento real del editor (neumáticos) ──────────────────────────────
  const [runtime] = useState<StrategyEditorRuntime>(
    () => (runtimeFactory ?? createWailsStrategyEditorRuntime)(),
  );
  // StrictMode monta, desmonta y vuelve a montar: si el cierre del efecto
  // desechara el runtime en el acto, el segundo montaje encontraría un cliente
  // muerto y el inventario nunca llegaría (mismo patrón que el planificador).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void openOrCreateStrategyEditor(runtime.store).catch(() => undefined);
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) runtime.dispose();
      });
    };
  }, [runtime]);
  const snapshot = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
  const document_: StrategyEditorDocument | undefined = snapshot.draft?.payload;
  const inventory = useMemo(() => document_?.tyres ?? [], [document_]);

  // ── estrategias (reparto, overrides y neumáticos) ───────────────────────
  const [variants, setVariants] = useState<Record<string, StrategyVariant>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (!roster || inventory.length === 0) return;
    const key = `${roster.event.name}|${roster.strategies.map((item) => item.id).join(",")}`;
    if (seeded.current === key) return;
    seeded.current = key;
    const stored = readStored();
    const next: Record<string, StrategyVariant> = {};
    for (const item of roster.strategies) {
      const plan = buildPlan(roster.event, Object.fromEntries(roster.drivers.map((d) => [d.id, d])), {
        mode: item.mode,
        order: item.order,
        overrides: {},
      });
      const saved = stored[item.id];
      next[item.id] = {
        ...item,
        state: (saved?.state as StrategyVariant["state"]) ?? "ok",
        overrides: saved?.overrides ?? {},
        order: saved?.order ?? item.order,
        tyres: saved?.tyres ?? defaultTyres(plan.stints.length, inventory),
      };
    }
    setVariants(next);
    setActiveId((current) => (current && next[current] ? current : (roster.strategies[0]?.id ?? null)));
  }, [inventory, roster]);

  const active = activeId ? variants[activeId] : undefined;

  const update = useCallback(
    (change: (variant: StrategyVariant) => StrategyVariant, dirty = true) => {
      setVariants((current) => {
        if (!activeId || !current[activeId]) return current;
        const patched = change(current[activeId]);
        const next = {
          ...current,
          [activeId]: dirty ? { ...patched, state: "draft" as const } : patched,
        };
        writeStored(next);
        return next;
      });
    },
    [activeId],
  );

  // ── plan derivado ───────────────────────────────────────────────────────
  const driversById = useMemo(
    () => Object.fromEntries((roster?.drivers ?? []).map((driver) => [driver.id, driver])),
    [roster],
  );
  const plan = useMemo(() => {
    if (!roster || !active) return null;
    return buildPlan(roster.event, driversById, active);
  }, [active, driversById, roster]);

  // ── interacción ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<StrategyTab>("overview");
  const [donutMode, setDonutMode] = useState<DonutMode>("laps");
  const [panel, setPanel] = useState<SidePanel>("drivers");
  const [selected, setSelected] = useState(-1);
  const [editing, setEditing] = useState(-1);
  const [picked, setPicked] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToStint = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-stint="${index}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const uses = useMemo(() => tyreUses(active?.tyres ?? {}), [active]);

  const assign = useCallback(
    (stint: number, corner: OrbitCorner, tyreId: string) => {
      const tyre = inventory.find((item) => item.id === tyreId);
      if (!tyre) return;
      try {
        // La legalidad la decide el dominio real, no esta pantalla.
        assertPlannable(tyre, CORNER_TO_DOMAIN[corner]);
      } catch (error) {
        if (error instanceof StrategyTyreError) {
          toast.show(t("strategy.tyres.rejected"), error.message);
          return;
        }
        throw error;
      }
      update((variant) => ({
        ...variant,
        tyres: { ...variant.tyres, [stint]: { ...variant.tyres[stint], [corner]: tyreId } },
      }));
      setPicked(null);
    },
    [inventory, t, toast, update],
  );

  const clear = useCallback(
    (stint: number, corner: OrbitCorner) => {
      update((variant) => {
        const corners = { ...variant.tyres[stint] };
        delete corners[corner];
        return { ...variant, tyres: { ...variant.tyres, [stint]: corners } };
      });
    },
    [update],
  );

  const reset = useCallback(() => {
    if (!roster || !activeId) return;
    const base = roster.strategies.find((item) => item.id === activeId);
    if (!base) return;
    const fresh = buildPlan(roster.event, driversById, { ...base, overrides: {} });
    update(
      (variant) => ({
        ...variant,
        order: base.order,
        overrides: {},
        tyres: defaultTyres(fresh.stints.length, inventory),
        state: "ok",
      }),
      false,
    );
    setEditing(-1);
    setPicked(null);
    toast.show(t("strategy.reset"), t("strategy.resetHint"));
  }, [activeId, driversById, inventory, roster, t, toast, update]);

  const spread = useCallback(() => {
    if (!roster || !plan || !activeId) return;
    const base = roster.strategies.find((item) => item.id === activeId)?.order ?? [];
    update((variant) => ({ ...variant, order: rotateOrder(base, plan.stints.length) }));
  }, [activeId, plan, roster, update]);

  const setDriver = useCallback(
    (index: number, driverId: string) => {
      if (!plan) return;
      update((variant) => {
        const order = rotateOrder(variant.order, plan.stints.length);
        order[index] = driverId;
        return { ...variant, order };
      });
    },
    [plan, update],
  );

  const setOverride = useCallback(
    (index: number, field: "laps" | "fuel", raw: string) => {
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) return;
      update((variant) => ({
        ...variant,
        overrides: { ...variant.overrides, [index]: { ...variant.overrides[index], [field]: value } },
      }));
    },
    [update],
  );

  const clearOverride = useCallback(
    (index: number) => {
      update((variant) => {
        const overrides = { ...variant.overrides };
        delete overrides[index];
        return { ...variant, overrides };
      });
    },
    [update],
  );

  // ── columna contextual ──────────────────────────────────────────────────
  const otherEvents = useMemo(
    () => calendar.starts.filter((start) => start.followed).slice(0, 6),
    [calendar.starts],
  );

  const context = (
    <div className="orbit-strategy__context">
      <section aria-label={t("strategy.context.strategies")} className="orbit-block">
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{roster?.event.name ?? t("strategy.context.noEvent")}</span>
        </div>
        <div className="orbit-list" data-testid="orbit-strategy-variants">
          {Object.values(variants).map((variant) => (
            <ListRow
              ariaSelected={variant.id === activeId}
              key={variant.id}
              onClick={() => {
                setActiveId(variant.id);
                setEditing(-1);
                setSelected(-1);
              }}
              selected={variant.id === activeId}
              subtitle={variant.note}
              title={variant.name}
              trailing={
                <StateChip state={variant.state === "ok" ? "ok" : "draft"}>
                  {variant.state === "ok" ? t("strategy.upToDate") : t("strategy.draft")}
                </StateChip>
              }
            />
          ))}
        </div>
      </section>

      <section aria-label={t("strategy.context.others")} className="orbit-block">
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{t("strategy.context.others")}</span>
        </div>
        <div className="orbit-list" data-testid="orbit-strategy-others">
          {otherEvents.length === 0 ? (
            <p className="orbit-row__copy">{t("strategy.context.noOthers")}</p>
          ) : (
            otherEvents.map((start) => (
              <ListRow
                key={`${start.seriesId}-${start.at.getTime()}`}
                subtitle={start.track}
                title={start.name}
                trailing={<span className="orbit-when">{formatStartTime(start.at)}</span>}
              />
            ))
          )}
        </div>
      </section>

      <Button
        className="orbit-strategy__new"
        onClick={() => toast.show(t("strategy.new"), t("strategy.newHint"))}
        variant="ghost"
      >
        {t("strategy.new")}
      </Button>
    </div>
  );

  // ── estado vacío ────────────────────────────────────────────────────────
  if (!roster || !active || !plan) {
    return (
      <div className="orbit-strategy orbit-strategy--empty" data-testid="orbit-strategy">
        {contextSlot ? createPortal(context, contextSlot) : null}
        <Surface
          aria-label={t("strategy.empty.title")}
          data-testid="orbit-strategy-empty"
          title={t("strategy.empty.title")}
        >
          <p className="orbit-strategy__empty-lead">{t("strategy.empty.lead")}</p>
          <div className="orbit-list">
            {otherEvents.length === 0 ? (
              <Note title={t("strategy.empty.noneTitle")}>{t("strategy.empty.none")}</Note>
            ) : (
              otherEvents.map((start) => (
                <ListRow
                  key={`${start.seriesId}-${start.at.getTime()}`}
                  subtitle={start.track}
                  title={start.name}
                  trailing={<span className="orbit-when">{formatStartTime(start.at)}</span>}
                />
              ))
            )}
          </div>
        </Surface>
      </div>
    );
  }

  const event = roster.event;
  const drivers = roster.drivers;
  const timelineStart = event.startISO
    ? new Date(event.startISO)
    : (() => {
        const base = new Date();
        base.setHours(Math.floor(event.startMin / 60), event.startMin % 60, 0, 0);
        return base;
      })();
  const spanMin = Math.ceil(event.durationMin * 1.02);
  const slices = distribution(plan, drivers);
  const donutSlices: DonutSlice[] = slices.map((slice) => ({
    id: slice.driver.id,
    label: `${slice.driver.name.split(" ")[0]} · ${
      donutMode === "laps" ? slice.laps : clockTime(slice.time)
    }`,
    value: donutMode === "laps" ? slice.laps : slice.time,
    color: slice.driver.color,
  }));
  const totalTime = slices.reduce((sum, slice) => sum + slice.time, 0);

  const blocksOf = (driver: StrategyDriver): TimelineBlock[] => {
    const mine = plan.stints.filter((stint) => stint.d === driver.id);
    const stints: TimelineBlock[] = mine.map((stint) => ({
      id: String(stint.i),
      start: new Date(timelineStart.getTime() + stint.start * 1000),
      durationMin: (stint.end - stint.start) / 60,
      color: driver.color,
      label: `S${stint.i + 1}`,
    }));
    const pits: TimelineBlock[] = mine
      .filter((stint) => stint.i < plan.stints.length - 1)
      .map((stint) => ({
        id: `pit-${stint.i}`,
        start: new Date(timelineStart.getTime() + stint.end * 1000),
        durationMin: event.pitS / 60,
        color: "var(--orbit-ember)",
        label: t("strategy.pit.label"),
      }));
    return [...stints, ...pits];
  };

  const tyreView = (tyre: StrategyTyre): TyreView => {
    const condition = tyreCondition(tyre, uses[tyre.id]?.length ?? 0);
    return {
      id: tyre.id,
      compound: chipCompound(tyre),
      condition: condition.max,
      label: t("strategy.tyres.free"),
    };
  };

  const modeLabel =
    active.mode === "wet"
      ? t("strategy.stints.wet")
      : active.mode === "eco"
        ? t("strategy.stints.eco")
        : t("strategy.stints.dry");

  return (
    <div className="orbit-strategy" data-testid="orbit-strategy">
      {contextSlot ? createPortal(context, contextSlot) : null}

      <header className="orbit-strategy__head">
        <Monogram
          g1="var(--orbit-coral)"
          g2="var(--orbit-wine)"
          size={52}
          text={event.monogram}
        />
        <div className="orbit-strategy__copy">
          <div className="orbit-strategy__crumb">
            <span>{t("strategy.crumb")}</span>
            <i aria-hidden="true">›</i>
            <b data-testid="orbit-strategy-name">{active.name}</b>
            <StateChip state={active.state === "ok" ? "ok" : "draft"}>
              {active.state === "ok" ? t("strategy.upToDate") : t("strategy.draft")}
            </StateChip>
          </div>
          <h2>{event.name}</h2>
          <p>{event.subtitle}</p>
          <div className="orbit-strategy__chips">
            <Chip caseNormal icon="i-carreras">
              {formatMessage(t("strategy.chip.when"), {
                day: event.dayLabel,
                from: hhmm(event.startMin),
                to: hhmm(event.startMin + event.durationMin),
              })}
            </Chip>
            <Chip caseNormal>{formatMessage(t("strategy.chip.duration"), { min: event.durationMin })}</Chip>
            {event.vehicleClass ? <Chip tier="silver">{event.vehicleClass}</Chip> : null}
            {event.team ? <Chip caseNormal>{event.team}</Chip> : null}
          </div>
        </div>
        <div className="orbit-strategy__actions">
          {/* El menú ⚙ (Telemetría · Combustible · Información · Exportar) llega
              en la parte B del briefing; aquí queda el disparador montado. */}
          <IconButton
            data-testid="orbit-strategy-settings"
            disabled
            icon="i-ajustes"
            label={t("strategy.settings")}
          />
          <Button data-testid="orbit-strategy-reset" onClick={reset} variant="ghost">
            {t("strategy.reset")}
          </Button>
        </div>
      </header>

      <UnderlineTabs<StrategyTab>
        className="orbit-strategy__tabs"
        label={t("strategy.tabs.label")}
        onChange={setTab}
        tabs={[
          { id: "overview", label: t("strategy.tabs.overview") },
          { id: "strategies", label: t("strategy.tabs.strategies") },
          { id: "availability", label: t("strategy.tabs.availability") },
        ]}
        value={tab}
      />

      {tab !== "overview" ? (
        <div className="orbit-strategy__pending" data-testid="orbit-strategy-pending">
          <Note title={t("strategy.pending.title")}>{t("strategy.pending.lead")}</Note>
        </div>
      ) : (
        <div className="orbit-strategy__overview" data-testid="orbit-strategy-overview">
          <StatRow className="orbit-strategy__kpis">
            <StatTile
              label={t("strategy.kpi.duration")}
              sub={formatMessage(t("strategy.kpi.durationHint"), {
                from: hhmm(event.startMin),
                to: hhmm(event.startMin + event.durationMin),
              })}
              value={`${Math.floor(event.durationMin / 60)}h${String(event.durationMin % 60).padStart(2, "0")}m`}
            />
            <StatTile
              label={t("strategy.kpi.tank")}
              sub={formatMessage(t("strategy.kpi.tankHint"), {
                laps: plan.maxLaps,
                l: plan.avgFuel.toFixed(2),
              })}
              value={`${event.tankL} L`}
            />
            <StatTile
              label={t("strategy.kpi.pit")}
              sub={t("strategy.kpi.pitHint")}
              value={lapTime(event.pitS)}
            />
            <StatTile
              label={t("strategy.kpi.stops")}
              sub={formatMessage(t("strategy.kpi.stopsHint"), {
                stints: plan.stints.length,
                laps: plan.totalLaps,
              })}
              value={plan.stops}
            />
          </StatRow>

          <div className="orbit-strategy__grid">
            <Surface
              aria-label={t("strategy.timeline.title")}
              meta={t("strategy.timeline.hint")}
              title={t("strategy.timeline.title")}
            >
              <HorizontalTimeline
                blocks={blocksOf}
                headWidth={150}
                label={t("strategy.timeline.title")}
                onBlock={(id) => {
                  if (id.startsWith("pit-")) return;
                  setSelected(Number(id));
                  scrollToStint(Number(id));
                }}
                rowLabel={(driver: StrategyDriver) => (
                  <span className="orbit-strategy__tl-driver">
                    <i aria-hidden="true" style={{ background: driver.color }} />
                    {driver.name}
                  </span>
                )}
                rows={drivers}
                selected={selected >= 0 ? String(selected) : undefined}
                spanMin={spanMin}
                start={timelineStart}
                tickEveryMin={30}
              />
            </Surface>

            <Surface
              actions={
                <Seg<DonutMode>
                  label={t("strategy.distribution.title")}
                  onChange={setDonutMode}
                  options={[
                    { value: "laps", label: t("strategy.distribution.laps") },
                    { value: "time", label: t("strategy.distribution.time") },
                  ]}
                  value={donutMode}
                />
              }
              aria-label={t("strategy.distribution.title")}
              title={t("strategy.distribution.title")}
            >
              <Donut
                centerLabel={t("strategy.distribution.total")}
                centerValue={
                  donutMode === "laps"
                    ? formatMessage(t("strategy.distribution.lapsValue"), { n: plan.totalLaps })
                    : clockTime(totalTime)
                }
                slices={donutSlices}
              />
            </Surface>
          </div>

          <div className="orbit-strategy__grid2">
            <section aria-label={t("strategy.stints.title")} className="orbit-strategy__stints">
              <div className="orbit-strategy__stints-head">
                <h3>{t("strategy.stints.title")}</h3>
                <span className="orbit-strategy__meta">{t("strategy.stints.hint")}</span>
                <Button data-testid="orbit-strategy-spread" onClick={spread} size="sm" variant="ghost">
                  {t("strategy.stints.autoAssign")}
                </Button>
              </div>
              <p className="orbit-strategy__edge">
                {formatMessage(t("strategy.stints.start"), {
                  time: hhmm(event.startMin),
                  fuel: Math.min(event.tankL, plan.stints[0]?.fuel ?? 0).toFixed(0),
                })}
              </p>

              <div className="orbit-strategy__list" data-testid="orbit-strategy-list" ref={listRef}>
                {plan.stints.map((stint, index) => {
                  const driver = driversById[stint.d];
                  const corners = active.tyres[stint.i] ?? {};
                  return (
                    <Fragment key={stint.i}>
                      <div
                        className="orbit-stint"
                        data-selected={selected === stint.i ? "true" : undefined}
                        data-laps={stint.laps}
                        data-stint={stint.i}
                        data-testid={`orbit-stint-${stint.i}`}
                      >
                        <span className="orbit-stint__n">#{index + 1}</span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.driver")}</span>
                          <span
                            className="orbit-stint__driver"
                            style={{ "--orbit-driver": driver?.color } as React.CSSProperties}
                          >
                            <i aria-hidden="true" />
                            <Select
                              label={formatMessage(t("strategy.stints.driverOf"), { n: index + 1 })}
                              onChange={(value) => setDriver(stint.i, value)}
                              options={drivers.map((item) => ({ value: item.id, label: item.name }))}
                              value={stint.d}
                            />
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.time")}</span>
                          <span className="orbit-stint__v orbit-stint__v--num">
                            {hhmm(stintClock(event, stint.start))} – {hhmm(stintClock(event, stint.end))}
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.laps")}</span>
                          <span className="orbit-stint__v orbit-stint__v--num">
                            {stint.laps} <small>{stint.lap0}–{stint.lap1}</small>
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.fuel")}</span>
                          <span
                            className="orbit-stint__v orbit-stint__v--num"
                            data-warn={stint.over ? "true" : undefined}
                          >
                            {stint.fuel.toFixed(1)} L
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.pitWindow")}</span>
                          <span className="orbit-stint__v orbit-stint__v--num">
                            {index < plan.stints.length - 1
                              ? `${hhmm(pitWindowClock(event, stint))} (~V${pitWindowLap(stint)})`
                              : "—"}
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.setup")}</span>
                          <Chip caseNormal tone={active.mode === "wet" ? "reference" : "warn"}>
                            {modeLabel}
                          </Chip>
                        </span>
                        <span className="orbit-stint__acts">
                          <button
                            aria-expanded={editing === stint.i}
                            aria-label={formatMessage(t("strategy.stints.edit"), { n: index + 1 })}
                            className="orbit-icon-btn orbit-icon-btn--28"
                            data-testid={`orbit-stint-edit-${stint.i}`}
                            onClick={() => {
                              const next = editing === stint.i ? -1 : stint.i;
                              setEditing(next);
                              setSelected(stint.i);
                              if (next >= 0) scrollToStint(stint.i);
                            }}
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              fill="none"
                              height="14"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.4"
                              viewBox="0 0 16 16"
                              width="14"
                            >
                              <path d="M11.5 2.5l2 2L6 12H4v-2z" />
                            </svg>
                          </button>
                          {stint.manual ? (
                            <span
                              aria-label={t("strategy.stints.manual")}
                              className="orbit-stint__flag orbit-stint__flag--manual"
                              data-testid={`orbit-stint-manual-${stint.i}`}
                              role="img"
                            >
                              ✎
                            </span>
                          ) : null}
                          {stint.over ? (
                            <span
                              aria-label={t("strategy.stints.over")}
                              className="orbit-stint__flag orbit-stint__flag--over"
                              role="img"
                            >
                              !
                            </span>
                          ) : null}
                        </span>
                      </div>

                      {editing === stint.i ? (
                        <div className="orbit-stint-editor" data-testid={`orbit-stint-editor-${stint.i}`}>
                          <div className="orbit-stint-editor__fields">
                            <label className="orbit-stint-editor__field">
                              <span>{t("strategy.editor.laps")}</span>
                              <Input
                                defaultValue={String(stint.laps)}
                                inputMode="numeric"
                                key={`laps-${stint.i}-${stint.laps}`}
                                numeric
                                onBlur={(e) => setOverride(stint.i, "laps", e.currentTarget.value)}
                                aria-label={t("strategy.editor.laps")}
                              />
                            </label>
                            <label className="orbit-stint-editor__field">
                              <span>{t("strategy.editor.fuel")}</span>
                              <Input
                                defaultValue={stint.fuel.toFixed(1)}
                                inputMode="decimal"
                                key={`fuel-${stint.i}-${stint.fuel.toFixed(1)}`}
                                numeric
                                onBlur={(e) => setOverride(stint.i, "fuel", e.currentTarget.value)}
                                unit="L"
                                aria-label={t("strategy.editor.fuel")}
                              />
                            </label>
                            <span className="orbit-stint-editor__field">
                              <span>{t("strategy.editor.pace")}</span>
                              <b className="orbit-stint__v orbit-stint__v--num">{lapTime(stint.pace)}</b>
                              <em>{t("strategy.editor.ofDriver")}</em>
                            </span>
                            <Button
                              disabled={!stint.manual}
                              onClick={() => clearOverride(stint.i)}
                              size="sm"
                              variant="ghost"
                            >
                              {t("strategy.editor.auto")}
                            </Button>
                          </div>
                          <div className="orbit-stint-editor__corners">
                            <div className="orbit-stint-editor__car">
                              <span className="orbit-stint-editor__axle">{t("strategy.editor.front")}</span>
                              {(["FL", "FR"] as OrbitCorner[]).map((corner) => (
                                <CornerSlot
                                  corner={corner}
                                  key={corner}
                                  onClear={() => clear(stint.i, corner)}
                                  onDrop={(id) => assign(stint.i, corner, id)}
                                  picked={Boolean(picked)}
                                  pickedId={picked ?? undefined}
                                  tyre={(() => {
                                    const mounted = inventory.find((item) => item.id === corners[corner]);
                                    return mounted ? tyreView(mounted) : undefined;
                                  })()}
                                />
                              ))}
                              <span className="orbit-stint-editor__axle">{t("strategy.editor.rear")}</span>
                              {(["RL", "RR"] as OrbitCorner[]).map((corner) => (
                                <CornerSlot
                                  corner={corner}
                                  key={corner}
                                  onClear={() => clear(stint.i, corner)}
                                  onDrop={(id) => assign(stint.i, corner, id)}
                                  picked={Boolean(picked)}
                                  pickedId={picked ?? undefined}
                                  tyre={(() => {
                                    const mounted = inventory.find((item) => item.id === corners[corner]);
                                    return mounted ? tyreView(mounted) : undefined;
                                  })()}
                                />
                              ))}
                            </div>
                            <p className="orbit-stint-editor__hint">{t("strategy.editor.hint")}</p>
                          </div>
                        </div>
                      ) : null}

                      {index < plan.stints.length - 1 ? (
                        <div className="orbit-pit" data-testid={`orbit-pit-${stint.i}`}>
                          <span aria-hidden="true" className="orbit-pit__line" />
                          <span className="orbit-pit__label">{t("strategy.pit.label")}</span>
                          <span className="orbit-pit__detail">
                            <span>
                              {t("strategy.pit.duration")} <b>{lapTime(event.pitS)}</b>
                            </span>
                            <span>
                              {t("strategy.pit.fuel")}{" "}
                              <b>{formatMessage(t("strategy.pit.inTank"), { tank: event.tankL })}</b>{" "}
                              {formatMessage(t("strategy.pit.added"), {
                                l: Math.min(event.tankL, plan.stints[index + 1].fuel).toFixed(1),
                              })}
                            </span>
                            <span>
                              {t("strategy.pit.lap")} <b>{stint.lap1}</b>
                            </span>
                            <span>
                              {t("strategy.pit.tyres")} <b>{t("strategy.pit.newSet")}</b>
                            </span>
                          </span>
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>

              <p className="orbit-strategy__edge">
                {formatMessage(t("strategy.stints.end"), {
                  flag: hhmm(event.startMin + event.durationMin),
                  end: hhmm(stintClock(event, plan.total)),
                  laps: plan.totalLaps,
                })}
              </p>
            </section>

            <Surface
              actions={
                <Seg<SidePanel>
                  label={t("strategy.drivers.title")}
                  onChange={setPanel}
                  options={[
                    { value: "drivers", label: t("strategy.drivers.title") },
                    { value: "tyres", label: t("strategy.drivers.tyres") },
                  ]}
                  value={panel}
                />
              }
              aria-label={t("strategy.drivers.title")}
              className="orbit-strategy__side"
              fill
              meta={
                panel === "drivers"
                  ? String(drivers.length)
                  : formatMessage(t("strategy.drivers.inUse"), {
                      n: inventory.length,
                      used: Object.keys(uses).length,
                    })
              }
            >
              {panel === "drivers" ? (
                <div className="orbit-strategy__drivers" data-testid="orbit-strategy-drivers">
                  {drivers.map((driver) => (
                    <article
                      className="orbit-driver"
                      key={driver.id}
                      style={{ "--orbit-driver": driver.color } as React.CSSProperties}
                    >
                      <div className="orbit-driver__head">
                        <span aria-hidden="true" className="orbit-driver__avatar">
                          {driver.ini}
                        </span>
                        <span className="orbit-driver__name">
                          <b>{driver.name}</b>
                          {driver.cls ? (
                            <Chip tier={driver.cls.startsWith("Gold") ? "gold" : "silver"}>{driver.cls}</Chip>
                          ) : null}
                        </span>
                      </div>
                      <div className="orbit-driver__paces">
                        {(
                          [
                            ["dry", t("strategy.drivers.dry"), "var(--orbit-ember)"],
                            ["wet", t("strategy.drivers.wet"), "var(--orbit-cyan)"],
                            ["eco", t("strategy.drivers.eco"), "var(--orbit-green)"],
                          ] as const
                        ).map(([mode, label, color]) => (
                          <div className="orbit-driver__pace" key={mode}>
                            <span>
                              <i aria-hidden="true" style={{ background: color }} />
                              {label}
                            </span>
                            <b>{lapTime(driver[mode][0])}</b>
                            <em>{driver[mode][1].toFixed(2)} L/v</em>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => toast.show(t("strategy.drivers.edit"), driver.name)}
                        size="sm"
                        variant="ghost"
                      >
                        {t("strategy.drivers.edit")}
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="orbit-strategy__tyres" data-testid="orbit-strategy-tyres">
                  <p className="orbit-strategy__tyre-hint">{t("strategy.drivers.hint")}</p>
                  <div className="orbit-strategy__tyre-list">
                    {inventory.map((tyre) => {
                      const used = uses[tyre.id] ?? [];
                      const condition = tyreCondition(tyre, used.length);
                      return (
                        <TyreItem
                          key={tyre.id}
                          onPick={() => {
                            const next = picked === tyre.id ? null : tyre.id;
                            setPicked(next);
                            if (next && editing < 0) {
                              toast.show(t("strategy.drivers.picked"), t("strategy.drivers.pickedHint"));
                            }
                          }}
                          picked={picked === tyre.id}
                          tyre={{
                            id: tyre.id,
                            compound: chipCompound(tyre),
                            condition: condition.max,
                            label: t("strategy.tyres.free"),
                          }}
                          used={used.map((use) => ({ stint: use.stint + 1, corner: use.corner }))}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
