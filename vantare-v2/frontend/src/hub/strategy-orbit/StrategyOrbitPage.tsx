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
  AvailabilityBoard,
  Button,
  Chip,
  CornerSlot,
  Donut,
  Field,
  HorizontalTimeline,
  Input,
  ListRow,
  Menu,
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
  type AvailRange,
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
import { exportStrategyPackage } from "../../strategy/strategy-transfer";
import {
  addAvailability,
  AVAILABILITY_FROM,
  AVAILABILITY_TO,
  buildPlan,
  clockTime,
  compareStrategies,
  distribution,
  hhmm,
  lapTime,
  ORBIT_CORNERS,
  parseHhmm,
  pitWindowClock,
  pitWindowLap,
  rotateOrder,
  stintClock,
  tyreCondition,
  tyreUses,
  type AvailabilitySegment,
  type AvailabilityState,
  type OrbitCorner,
  type StrategyDriver,
  type StrategyPlan,
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

/** Lo que la pantalla guarda en local: estrategias y disponibilidad juntas. */
interface StoredStrategyState {
  variants: Record<string, Partial<StrategyVariant>>;
  availability?: Record<string, AvailabilitySegment[]>;
}

function readStored(): StoredStrategyState {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { variants: {} };
    const parsed = JSON.parse(raw) as StoredStrategyState | Record<string, Partial<StrategyVariant>>;
    // La parte A guardaba el mapa de estrategias en la raíz de la clave.
    if (parsed && typeof parsed === "object" && "variants" in parsed) {
      return parsed as StoredStrategyState;
    }
    return { variants: (parsed ?? {}) as Record<string, Partial<StrategyVariant>> };
  } catch {
    return { variants: {} };
  }
}

function writeStored(patch: Partial<StoredStrategyState>): void {
  try {
    const current = readStored();
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Sin almacenamiento el reparto solo vive en memoria.
  }
}

/** Sin dato declarado, un piloto está disponible de punta a punta del eje. */
const FULL_AVAILABILITY: AvailabilitySegment[] = [
  { state: "ok", from: AVAILABILITY_FROM, to: AVAILABILITY_TO },
];

/** Primer id libre de la serie `local-n` (los duplicados y las nuevas). */
function freeId(taken: Readonly<Record<string, unknown>>, prefix: string): string {
  let n = 1;
  while (taken[`${prefix}-${n}`]) n += 1;
  return `${prefix}-${n}`;
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
    const stored = readStored().variants;
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
    setVariants((current) => ({ ...next, ...current }));
    setActiveId((current) => (current ?? roster.strategies[0]?.id ?? null));
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
        writeStored({ variants: next });
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

  // ── estrategias: activar, duplicar, crear ───────────────────────────────
  const activate = useCallback(
    (id: string, silent = false) => {
      setActiveId(id);
      setEditing(-1);
      setSelected(-1);
      if (silent) return;
      const name = variants[id]?.name ?? "";
      toast.show(
        t("strategy.cards.activated"),
        formatMessage(t("strategy.cards.activatedHint"), { name }),
      );
    },
    [t, toast, variants],
  );

  const duplicate = useCallback(
    (id: string) => {
      const source = variants[id];
      if (!source) return;
      const copyId = freeId(variants, "local");
      const name = formatMessage(t("strategy.cards.copyName"), { name: source.name });
      setVariants((current) => {
        const next = {
          ...current,
          [copyId]: { ...source, id: copyId, name, state: "draft" as const },
        };
        writeStored({ variants: next });
        return next;
      });
      toast.show(t("strategy.cards.duplicated"), formatMessage(t("strategy.cards.duplicatedHint"), { name }));
    },
    [t, toast, variants],
  );

  /** La tarjeta «+ Nueva estrategia» avisa; la de la columna no (briefing 07). */
  const createStrategy = useCallback(
    (silent = false) => {
      if (!roster) return;
      const newId = freeId(variants, "local");
      const base = roster.strategies[0]?.order ?? roster.drivers.map((driver) => driver.id);
      const name = formatMessage(t("strategy.cards.newName"), {
        n: Object.keys(variants).length + 1,
      });
      const fresh = buildPlan(roster.event, driversById, { mode: "dry", order: base, overrides: {} });
      setVariants((current) => {
        const next: Record<string, StrategyVariant> = {
          ...current,
          [newId]: {
            id: newId,
            name,
            note: t("strategy.cards.newNote"),
            mode: "dry",
            order: base,
            state: "draft",
            overrides: {},
            tyres: defaultTyres(fresh.stints.length, inventory),
          },
        };
        writeStored({ variants: next });
        return next;
      });
      activate(newId, true);
      if (!silent) {
        toast.show(t("strategy.cards.created"), formatMessage(t("strategy.cards.createdHint"), { name }));
      }
    },
    [activate, driversById, inventory, roster, t, toast, variants],
  );

  // ── comparación ─────────────────────────────────────────────────────────
  const [compareId, setCompareId] = useState<string | null>(null);

  // ── disponibilidad ──────────────────────────────────────────────────────
  // Sin dato real de disponibilidad, cada piloto entra disponible de punta a
  // punta: la pantalla no inventa ausencias que nadie ha declarado.
  const [availability, setAvailability] = useState<Record<string, AvailabilitySegment[]>>(
    () => readStored().availability ?? {},
  );
  const [avDriver, setAvDriver] = useState("");
  const [avState, setAvState] = useState<AvailabilityState>("ok");
  const [avFrom, setAvFrom] = useState("14:00");
  const [avTo, setAvTo] = useState("16:00");

  const addSlot = useCallback(
    (driverId: string, state: AvailabilityState, from: string, to: string) => {
      const a = parseHhmm(from);
      const b = parseHhmm(to);
      if (a === null || b === null || b <= a) {
        toast.show(t("strategy.availability.invalidTitle"), t("strategy.availability.invalid"));
        return;
      }
      setAvailability((current) => {
        const next = {
          ...current,
          [driverId]: addAvailability(current[driverId] ?? FULL_AVAILABILITY, {
            state,
            from: a,
            to: b,
          }),
        };
        writeStored({ availability: next });
        return next;
      });
      toast.show(
        t("strategy.availability.added"),
        formatMessage(t("strategy.availability.addedHint"), {
          driver: driversById[driverId]?.name ?? driverId,
          from,
          to,
        }),
      );
    },
    [driversById, t, toast],
  );

  // ── ⚙ Ajustes ───────────────────────────────────────────────────────────
  const exportPlan = useCallback(async () => {
    const draft = snapshot.draft;
    if (!draft) {
      toast.show(t("strategy.menu.exportFailed"), t("strategy.menu.soon"));
      return;
    }
    try {
      // Exportación real del dominio (`strategy-transfer.ts`): el paquete lo
      // arma el servicio, esta pantalla solo dice qué plan y cuánto pesa.
      const pack = await exportStrategyPackage(runtime.client, `orbit-export-${draft.draftId}`, {
        plans: [{ planId: draft.planId, variantId: draft.variantId }],
        provenance: {
          application: "Vantare",
          applicationVersion: "orbit-v0.3",
          exportedAt: new Date().toISOString(),
        },
      });
      toast.show(
        t("strategy.menu.exportDone"),
        formatMessage(t("strategy.menu.exportDoneHint"), {
          file: pack.suggestedFileName,
          kb: (pack.bytes.length / 1024).toFixed(1),
        }),
      );
    } catch (error) {
      toast.show(
        t("strategy.menu.exportFailed"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [runtime, snapshot.draft, t, toast]);

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
              onClick={() => activate(variant.id, true)}
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
        data-testid="orbit-strategy-new-column"
        onClick={() => createStrategy(true)}
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

  // ── derivados de las pestañas Estrategias y Disponibilidad ──────────────
  const cards = Object.values(variants);
  const plansById: Record<string, StrategyPlan> = Object.fromEntries(
    cards.map((variant) => [variant.id, buildPlan(event, driversById, variant)]),
  );
  const others = cards.filter((variant) => variant.id !== active.id);
  const compare = others.find((variant) => variant.id === compareId) ?? others[0];
  const verdict = compare
    ? compareStrategies(
        { id: active.id, plan },
        { id: compare.id, plan: plansById[compare.id] },
        event.pitS,
        drivers,
      )
    : null;
  const verdictText = verdict
    ? formatMessage(t("strategy.cards.verdict"), {
        winner: variants[verdict.winnerId]?.name ?? "",
        a: verdict.winnerLaps,
        b: verdict.loserLaps,
        diff: verdict.diff === 0 ? t("strategy.cards.tie") : `+${verdict.diff}`,
        reason: verdict.sameStops
          ? t("strategy.cards.same")
          : formatMessage(t("strategy.cards.saves"), {
              n: verdict.savedStops,
              s: verdict.savedS.toFixed(0),
              cost: verdict.costS.toFixed(0),
            }) + (verdict.pays ? t("strategy.cards.pays") : t("strategy.cards.noPays")),
        stints: verdict.stints,
        drivers: verdict.driverCount,
        doubles: verdict.doubles.join(", ") || t("strategy.cards.nobody"),
      })
    : null;

  const availRanges: Record<string, AvailRange[]> = Object.fromEntries(
    drivers.map((driver) => [
      driver.id,
      (availability[driver.id] ?? FULL_AVAILABILITY).map((segment) => ({
        from: segment.from / 60,
        to: segment.to / 60,
        state: segment.state,
      })),
    ]),
  );
  const avDriverId = avDriver || drivers[0]?.id || "";
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
          <Menu
            items={[
              {
                id: "telemetry",
                title: t("strategy.menu.telemetry"),
                description: t("strategy.menu.telemetryHint"),
                onSelect: () => toast.show(t("strategy.menu.telemetry"), t("strategy.menu.soon")),
              },
              {
                id: "fuel",
                title: t("strategy.menu.fuel"),
                description: t("strategy.menu.fuelHint"),
                onSelect: () => toast.show(t("strategy.menu.fuel"), t("strategy.menu.soon")),
              },
              {
                id: "info",
                title: t("strategy.menu.info"),
                description: t("strategy.menu.infoHint"),
                onSelect: () => toast.show(t("strategy.menu.info"), t("strategy.menu.soon")),
              },
              {
                id: "export",
                title: t("strategy.menu.export"),
                description: t("strategy.menu.exportHint"),
                onSelect: () => void exportPlan(),
              },
            ]}
            label={t("strategy.menu.label")}
            trigger={
              <Button data-testid="orbit-strategy-settings" icon="i-ajustes" variant="ghost">
                {t("strategy.settings")}
              </Button>
            }
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

      {tab === "strategies" ? (
        <div className="orbit-strategy__pane" data-testid="orbit-strategy-strategies">
          <div className="orbit-strats-grid">
            {cards.map((variant) => {
              const q = plansById[variant.id];
              return (
                <article
                  className="orbit-strat-card"
                  data-active={variant.id === active.id ? "true" : undefined}
                  data-testid={`orbit-strat-${variant.id}`}
                  key={variant.id}
                >
                  <h4>
                    {variant.name}
                    <StateChip state={variant.state === "ok" ? "ok" : "draft"}>
                      {variant.state === "ok" ? t("strategy.upToDate") : t("strategy.draft")}
                    </StateChip>
                  </h4>
                  <p>{variant.note}</p>
                  <dl>
                    <dt>{t("strategy.cards.stintsStops")}</dt>
                    <dd>
                      {q.stints.length} · {q.stops}
                    </dd>
                    <dt>{t("strategy.cards.laps")}</dt>
                    <dd>{q.totalLaps}</dd>
                    <dt>{t("strategy.cards.avgPace")}</dt>
                    <dd>{lapTime(q.avgPace)}</dd>
                    <dt>{t("strategy.cards.avgFuel")}</dt>
                    <dd>{q.avgFuel.toFixed(2)} L/v</dd>
                    <dt>{t("strategy.cards.total")}</dt>
                    <dd>{clockTime(q.total)}</dd>
                  </dl>
                  <div className="orbit-strat-card__acts">
                    {variant.id === active.id ? (
                      <Button disabled size="sm" variant="ghost">
                        {t("strategy.cards.active")}
                      </Button>
                    ) : (
                      <Button
                        data-testid={`orbit-strat-activate-${variant.id}`}
                        onClick={() => activate(variant.id)}
                        size="sm"
                        variant="primary"
                      >
                        {t("strategy.cards.activate")}
                      </Button>
                    )}
                    <Button
                      data-testid={`orbit-strat-duplicate-${variant.id}`}
                      onClick={() => duplicate(variant.id)}
                      size="sm"
                      variant="ghost"
                    >
                      {t("strategy.cards.duplicate")}
                    </Button>
                  </div>
                </article>
              );
            })}
            <button
              className="orbit-strat-card orbit-strat-card--new"
              data-testid="orbit-strategy-new-card"
              onClick={() => createStrategy()}
              type="button"
            >
              <b>{t("strategy.new")}</b>
              <span>{t("strategy.cards.newNote")}</span>
            </button>
          </div>

          <Surface
            actions={
              others.length > 1 && compare ? (
                <Select
                  label={t("strategy.cards.compare")}
                  onChange={setCompareId}
                  options={others.map((variant) => ({ value: variant.id, label: variant.name }))}
                  value={compare.id}
                />
              ) : undefined
            }
            aria-label={t("strategy.cards.compare")}
            meta={t("strategy.cards.compareMeta")}
            title={t("strategy.cards.compare")}
          >
            <p className="orbit-strategy__verdict" data-testid="orbit-strategy-verdict">
              {verdictText ?? t("strategy.cards.compareNone")}
            </p>
          </Surface>
        </div>
      ) : tab === "availability" ? (
        <div className="orbit-strategy__pane" data-testid="orbit-strategy-availability">
          <Surface
            aria-label={t("strategy.availability.title")}
            meta={formatMessage(t("strategy.availability.range"), {
              from: hhmm(AVAILABILITY_FROM),
              to: hhmm(AVAILABILITY_TO),
            })}
            title={t("strategy.availability.title")}
          >
            <AvailabilityBoard
              drivers={drivers.map((driver) => ({
                id: driver.id,
                name: driver.name,
                color: driver.color,
              }))}
              from={AVAILABILITY_FROM / 60}
              label={t("strategy.availability.title")}
              ranges={availRanges}
              to={AVAILABILITY_TO / 60}
            />
          </Surface>

          <Surface
            aria-label={t("strategy.availability.add")}
            meta={t("strategy.availability.addHint")}
            title={t("strategy.availability.add")}
          >
            <form
              className="orbit-avail-form"
              data-testid="orbit-availability-form"
              onSubmit={(formEvent) => {
                formEvent.preventDefault();
                addSlot(avDriverId, avState, avFrom, avTo);
              }}
            >
              <Field htmlFor="orbit-av-driver" label={t("strategy.availability.driver")}>
                <Select
                  id="orbit-av-driver"
                  label={t("strategy.availability.driver")}
                  onChange={setAvDriver}
                  options={drivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                  value={avDriverId}
                />
              </Field>
              <Field htmlFor="orbit-av-state" label={t("strategy.availability.status")}>
                <Select<AvailabilityState>
                  id="orbit-av-state"
                  label={t("strategy.availability.status")}
                  onChange={setAvState}
                  options={[
                    { value: "ok", label: t("strategy.availability.ok") },
                    { value: "maybe", label: t("strategy.availability.maybe") },
                    { value: "no", label: t("strategy.availability.no") },
                  ]}
                  value={avState}
                />
              </Field>
              <Field htmlFor="orbit-av-from" label={t("strategy.availability.from")}>
                <Input
                  aria-label={t("strategy.availability.from")}
                  id="orbit-av-from"
                  numeric
                  onChange={(changed) => setAvFrom(changed.currentTarget.value)}
                  step={300}
                  type="time"
                  value={avFrom}
                />
              </Field>
              <Field htmlFor="orbit-av-to" label={t("strategy.availability.to")}>
                <Input
                  aria-label={t("strategy.availability.to")}
                  id="orbit-av-to"
                  numeric
                  onChange={(changed) => setAvTo(changed.currentTarget.value)}
                  step={300}
                  type="time"
                  value={avTo}
                />
              </Field>
              <Button type="submit" variant="primary">
                {t("strategy.availability.submit")}
              </Button>
            </form>
          </Surface>
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
                        {/* Asa visual del prototipo: el orden se cambia con el
                            Select de piloto, no arrastrando la tarjeta. */}
                        <span aria-hidden="true" className="orbit-stint__grip">
                          ⋮⋮
                        </span>
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
