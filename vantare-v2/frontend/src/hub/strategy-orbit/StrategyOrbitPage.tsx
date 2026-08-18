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
  Featured,
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
import type { RaceStart } from "../orbit/race-starts";
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
  activeEventOf,
  createCustomEvent,
  createEventFromSeries,
  eventFromRoster,
  initialsOf,
  newDriver,
  patchEvent,
  readLegacyStrategyState,
  readStrategyEvents,
  rosterEventId,
  toStrategyEvent,
  upsertEvent,
  writeStrategyEvents,
  DRIVER_COLORS,
  type StrategyEventRecord,
  type StrategyEventsState,
} from "./strategy-events-store";
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

type StrategyTab = "overview" | "strategies" | "availability";
/** Camino elegido en el estado inicial (`00-decisiones.md`, D-W4-2). */
type PickerPath = "none" | "series";
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

/** Formulario del evento: todo texto, se valida al enviar. */
interface EventForm {
  name: string;
  track: string;
  cls: string;
  durationMin: string;
  /** `YYYY-MM-DDTHH:mm` del `datetime-local`. */
  startAt: string;
  tankL: string;
  pitLossSec: string;
  team: string;
  drivers: StrategyDriver[];
}

/** Duraciones de un clic (`Seg`); el resto se escribe en el campo de minutos. */
const DURATION_PRESETS = [60, 120, 240, 360] as const;

/** `Date` → valor de un `input[type=datetime-local]` en hora local. */
function toLocalInput(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Valor de un `datetime-local` → ISO; hoy a esa hora si el texto no vale. */
function fromLocalInput(value: string): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
}

function formOf(record: StrategyEventRecord): EventForm {
  return {
    name: record.name,
    track: record.track,
    cls: record.cls,
    durationMin: String(record.durationMin),
    startAt: toLocalInput(new Date(record.startAt)),
    tankL: String(record.tankL),
    pitLossSec: String(record.pitLossSec),
    team: record.team ?? "",
    drivers: record.drivers,
  };
}

/** Número positivo del formulario, o el valor por defecto. */
function positive(raw: string, fallback: number): number {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  const { t, locale } = useI18n();
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

  // ── eventos locales ─────────────────────────────────────────────────────
  const [store, setStore] = useState<StrategyEventsState>(() => readStrategyEvents());
  const commit = useCallback(
    (change: (current: StrategyEventsState) => StrategyEventsState) => {
      setStore((current) => {
        const next = change(current);
        if (next === current) return current;
        writeStrategyEvents(next);
        return next;
      });
    },
    [],
  );

  // El roster del puente entra como un evento más y ya no manda sobre la vista.
  const imported = useRef<string | null>(null);
  useEffect(() => {
    if (!roster) return;
    const id = rosterEventId(roster);
    if (imported.current === id) return;
    imported.current = id;
    commit((current) => {
      if (current.events.some((event) => event.id === id)) return current;
      const next = upsertEvent(current, eventFromRoster(roster, readLegacyStrategyState()));
      return { ...next, activeId: current.activeId ?? id };
    });
  }, [commit, roster]);

  const eventRecord = activeEventOf(store);
  const strategyEvent = useMemo(
    () => (eventRecord ? toStrategyEvent(eventRecord, locale) : null),
    [eventRecord, locale],
  );

  const driversById = useMemo(
    () => Object.fromEntries((eventRecord?.drivers ?? []).map((driver) => [driver.id, driver])),
    [eventRecord],
  );

  // ── estrategias (reparto, overrides y neumáticos) ───────────────────────
  // El inventario llega después del evento: mientras una estrategia no tenga
  // reparto propio se le calcula el de partida al vuelo, sin persistir nada
  // (se guarda en cuanto el usuario toca una esquina).
  const variants = useMemo<Record<string, StrategyVariant>>(() => {
    const list = eventRecord?.strategies ?? [];
    return Object.fromEntries(
      list.map((item) => {
        if (Object.keys(item.tyres).length > 0 || !strategyEvent || inventory.length === 0) {
          return [item.id, item];
        }
        const stints = buildPlan(strategyEvent, driversById, item).stints.length;
        return [item.id, { ...item, tyres: defaultTyres(stints, inventory) }];
      }),
    );
  }, [driversById, eventRecord, inventory, strategyEvent]);
  const activeId = eventRecord
    ? (eventRecord.activeStrategyId && variants[eventRecord.activeStrategyId]
        ? eventRecord.activeStrategyId
        : (eventRecord.strategies[0]?.id ?? null))
    : null;
  const active = activeId ? variants[activeId] : undefined;

  const eventId = eventRecord?.id ?? null;
  const patchStrategies = useCallback(
    (change: (list: StrategyVariant[]) => StrategyVariant[], nextActive?: string) => {
      if (!eventId) return;
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          strategies: change(event.strategies),
          activeStrategyId: nextActive ?? event.activeStrategyId,
        })),
      );
    },
    [commit, eventId],
  );

  const update = useCallback(
    (change: (variant: StrategyVariant) => StrategyVariant, dirty = true) => {
      if (!activeId) return;
      patchStrategies((list) =>
        list.map((item) => {
          if (item.id !== activeId) return item;
          // El reparto de neumáticos de partida se calcula al vuelo: al
          // escribir hay que partir de la estrategia efectiva, no de la guardada.
          const patched = change(variants[item.id] ?? item);
          return dirty ? { ...patched, state: "draft" as const } : patched;
        }),
      );
    },
    [activeId, patchStrategies, variants],
  );

  // ── plan derivado ───────────────────────────────────────────────────────
  const plan = useMemo(() => {
    if (!strategyEvent || !active) return null;
    return buildPlan(strategyEvent, driversById, active);
  }, [active, driversById, strategyEvent]);

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
      patchStrategies((list) => list, id);
      setEditing(-1);
      setSelected(-1);
      if (silent) return;
      const name = variants[id]?.name ?? "";
      toast.show(
        t("strategy.cards.activated"),
        formatMessage(t("strategy.cards.activatedHint"), { name }),
      );
    },
    [patchStrategies, t, toast, variants],
  );

  const duplicate = useCallback(
    (id: string) => {
      const source = variants[id];
      if (!source) return;
      const copyId = freeId(variants, "local");
      const name = formatMessage(t("strategy.cards.copyName"), { name: source.name });
      patchStrategies((list) => [...list, { ...source, id: copyId, name, state: "draft" as const }]);
      toast.show(t("strategy.cards.duplicated"), formatMessage(t("strategy.cards.duplicatedHint"), { name }));
    },
    [patchStrategies, t, toast, variants],
  );

  /** La tarjeta «+ Nueva estrategia» avisa; la de la columna no (briefing 07). */
  const createStrategy = useCallback(
    (silent = false) => {
      if (!eventRecord || !strategyEvent) return;
      const newId = freeId(variants, "local");
      const base = eventRecord.strategies[0]?.order ?? eventRecord.drivers.map((driver) => driver.id);
      const name = formatMessage(t("strategy.cards.newName"), {
        n: Object.keys(variants).length + 1,
      });
      const fresh = buildPlan(strategyEvent, driversById, { mode: "dry", order: base, overrides: {} });
      patchStrategies(
        (list) => [
          ...list,
          {
            id: newId,
            name,
            note: t("strategy.cards.newNote"),
            mode: "dry" as const,
            order: base,
            state: "draft" as const,
            overrides: {},
            tyres: defaultTyres(fresh.stints.length, inventory),
          },
        ],
        newId,
      );
      setEditing(-1);
      setSelected(-1);
      if (!silent) {
        toast.show(t("strategy.cards.created"), formatMessage(t("strategy.cards.createdHint"), { name }));
      }
    },
    [driversById, eventRecord, inventory, patchStrategies, strategyEvent, t, toast, variants],
  );

  // ── comparación ─────────────────────────────────────────────────────────
  const [compareId, setCompareId] = useState<string | null>(null);

  // ── disponibilidad ──────────────────────────────────────────────────────
  // Sin dato real de disponibilidad, cada piloto entra disponible de punta a
  // punta: la pantalla no inventa ausencias que nadie ha declarado.
  const availability = eventRecord?.availability ?? {};
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
      if (!eventId) return;
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          availability: {
            ...(event.availability ?? {}),
            [driverId]: addAvailability(event.availability?.[driverId] ?? FULL_AVAILABILITY, {
              state,
              from: a,
              to: b,
            }),
          },
        })),
      );
      toast.show(
        t("strategy.availability.added"),
        formatMessage(t("strategy.availability.addedHint"), {
          driver: driversById[driverId]?.name ?? driverId,
          from,
          to,
        }),
      );
    },
    [commit, driversById, eventId, t, toast],
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

  /**
   * Orden de partida de una estrategia: el que publicó el puente si el evento
   * viene del roster, y si no el de los pilotos del evento local.
   */
  const baseOrder = useCallback(
    (id: string): string[] => {
      const fromRoster =
        eventRecord?.source === "roster"
          ? roster?.strategies.find((item) => item.id === id)?.order
          : undefined;
      return fromRoster ?? eventRecord?.drivers.map((driver) => driver.id) ?? [];
    },
    [eventRecord, roster],
  );

  const reset = useCallback(() => {
    if (!strategyEvent || !activeId) return;
    const order = baseOrder(activeId);
    if (order.length === 0) return;
    const fresh = buildPlan(strategyEvent, driversById, { mode: "dry", order, overrides: {} });
    update(
      (variant) => ({
        ...variant,
        order,
        overrides: {},
        tyres: defaultTyres(fresh.stints.length, inventory),
        state: "ok",
      }),
      false,
    );
    setEditing(-1);
    setPicked(null);
    toast.show(t("strategy.reset"), t("strategy.resetHint"));
  }, [activeId, baseOrder, driversById, inventory, strategyEvent, t, toast, update]);

  const spread = useCallback(() => {
    if (!plan || !activeId) return;
    const order = baseOrder(activeId);
    if (order.length === 0) return;
    update((variant) => ({ ...variant, order: rotateOrder(order, plan.stints.length) }));
  }, [activeId, baseOrder, plan, update]);

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

  // ── eventos: dos caminos, formulario y edición ──────────────────────────
  const [path, setPath] = useState<PickerPath>("none");
  const [form, setForm] = useState<{ mode: "create" | "edit"; draft: EventForm } | null>(null);

  /**
   * El piloto por defecto de un evento nuevo es quien lo crea. El nombre real
   * lo pone el usuario en el formulario: la pantalla no depende del proveedor
   * de licencia solo para rellenar una fila (D-W4-4).
   */
  const me = useCallback((): StrategyDriver => {
    const name = t("strategy.form.me");
    return { ...newDriver(name, 0), ini: initialsOf(name) };
  }, [t]);

  const openCreate = useCallback(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    setForm({
      mode: "create",
      draft: {
        name: "",
        track: "",
        cls: "",
        durationMin: "120",
        startAt: toLocalInput(start),
        tankL: "90",
        pitLossSec: "60",
        team: "",
        drivers: [me()],
      },
    });
  }, [me]);

  const openEdit = useCallback(() => {
    if (!eventRecord) return;
    setForm({ mode: "edit", draft: formOf(eventRecord) });
  }, [eventRecord]);

  const patchForm = useCallback((change: Partial<EventForm>) => {
    setForm((current) => (current ? { ...current, draft: { ...current.draft, ...change } } : current));
  }, []);

  const patchFormDriver = useCallback(
    (index: number, change: Partial<StrategyDriver>) => {
      setForm((current) => {
        if (!current) return current;
        const drivers = current.draft.drivers.map((driver, i) =>
          i === index ? { ...driver, ...change } : driver,
        );
        return { ...current, draft: { ...current.draft, drivers } };
      });
    },
    [],
  );

  const submitForm = useCallback(() => {
    const draft = form?.draft;
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || draft.drivers.length === 0) {
      toast.show(t("strategy.form.invalidTitle"), t("strategy.form.invalid"));
      return;
    }
    const shared = {
      name,
      track: draft.track.trim(),
      cls: draft.cls.trim(),
      durationMin: Math.round(positive(draft.durationMin, 120)),
      startAt: fromLocalInput(draft.startAt),
      tankL: positive(draft.tankL, 90),
      pitLossSec: positive(draft.pitLossSec, 60),
      team: draft.team.trim(),
      drivers: draft.drivers,
    };
    if (form.mode === "edit" && eventId) {
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          ...shared,
          team: shared.team || undefined,
          // Si un piloto desaparece, las estrategias que lo usaban se rehacen.
          strategies: event.strategies.map((item) => {
            const order = item.order.filter((id) => shared.drivers.some((d) => d.id === id));
            return order.length > 0
              ? item
              : { ...item, order: shared.drivers.map((d) => d.id), state: "draft" as const };
          }),
        })),
      );
      setForm(null);
      toast.show(t("strategy.form.savedTitle"), formatMessage(t("strategy.form.savedHint"), { name }));
      return;
    }
    const created = createCustomEvent(store.events, shared, {
      strategyName: formatMessage(t("strategy.cards.newName"), { n: 1 }),
      strategyNote: t("strategy.cards.newNote"),
    });
    commit((current) => ({ ...upsertEvent(current, created), activeId: created.id }));
    setForm(null);
    setPath("none");
    setTab("overview");
    toast.show(t("strategy.form.createdTitle"), formatMessage(t("strategy.form.createdHint"), { name }));
  }, [commit, eventId, form, store.events, t, toast]);

  const createFromSeries = useCallback(
    (start: RaceStart) => {
      const created = createEventFromSeries(store.events, start, me(), {
        strategyName: formatMessage(t("strategy.cards.newName"), { n: 1 }),
        strategyNote: t("strategy.cards.newNote"),
      });
      commit((current) => ({ ...upsertEvent(current, created), activeId: created.id }));
      setPath("none");
      setTab("overview");
      toast.show(
        t("strategy.form.createdTitle"),
        formatMessage(t("strategy.form.createdHint"), { name: created.name }),
      );
    },
    [commit, me, store.events, t, toast],
  );

  const selectEvent = useCallback(
    (id: string) => {
      commit((current) => ({ ...current, activeId: id }));
      setForm(null);
      setPath("none");
      setEditing(-1);
      setSelected(-1);
      setCompareId(null);
      setTab("overview");
    },
    [commit],
  );

  /** «Nuevo evento» vuelve al selector de dos caminos. */
  const newEvent = useCallback(() => {
    commit((current) => ({ ...current, activeId: null }));
    setForm(null);
    setPath("none");
  }, [commit]);

  // ── pilotos del evento (editables) ──────────────────────────────────────
  const [editDriver, setEditDriver] = useState<string | null>(null);

  const patchDriver = useCallback(
    (driverId: string, change: (driver: StrategyDriver) => StrategyDriver) => {
      if (!eventId) return;
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          drivers: event.drivers.map((driver) => (driver.id === driverId ? change(driver) : driver)),
        })),
      );
    },
    [commit, eventId],
  );

  const setDriverPace = useCallback(
    (driverId: string, mode: "dry" | "wet" | "eco", slot: 0 | 1, raw: string) => {
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) return;
      patchDriver(driverId, (driver) => {
        const pace: [number, number] = [driver[mode][0], driver[mode][1]];
        pace[slot] = value;
        return { ...driver, [mode]: pace };
      });
    },
    [patchDriver],
  );

  // ── columna contextual ──────────────────────────────────────────────────
  /** Series del calendario: primero las seguidas, luego el resto. */
  const seriesOptions = useMemo(() => {
    const followed = calendar.starts.filter((start) => start.followed);
    const rest = calendar.starts.filter((start) => !start.followed);
    return [...followed, ...rest].slice(0, 10);
  }, [calendar.starts]);

  const context = (
    <div className="orbit-strategy__context">
      <section aria-label={t("strategy.context.events")} className="orbit-block">
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{t("strategy.context.events")}</span>
        </div>
        <div className="orbit-list" data-testid="orbit-strategy-events">
          {store.events.length === 0 ? (
            <p className="orbit-row__copy">{t("strategy.context.noEvents")}</p>
          ) : (
            store.events.map((item) => (
              <ListRow
                ariaSelected={item.id === store.activeId}
                key={item.id}
                onClick={() => selectEvent(item.id)}
                selected={item.id === store.activeId}
                subtitle={item.track || item.cls}
                title={item.name}
                trailing={
                  <span className="orbit-when">{formatStartTime(new Date(item.startAt))}</span>
                }
              />
            ))
          )}
        </div>
      </section>

      {/* Las estrategias son del evento activo: sin evento no hay bloque vacío. */}
      <section
        aria-label={t("strategy.context.strategies")}
        className="orbit-block"
        hidden={!eventRecord}
      >
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{eventRecord?.name ?? t("strategy.context.noEvent")}</span>
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

      <div className="orbit-strategy__context-acts">
        <Button
          className="orbit-strategy__new"
          data-testid="orbit-strategy-new-column"
          disabled={!eventRecord}
          onClick={() => createStrategy(true)}
          variant="ghost"
        >
          {t("strategy.new")}
        </Button>
        <Button
          className="orbit-strategy__new"
          data-testid="orbit-strategy-new-event"
          onClick={newEvent}
          variant="ghost"
        >
          {t("strategy.context.newEvent")}
        </Button>
      </div>
    </div>
  );

  // ── formulario del evento (crear · editar) ──────────────────────────────
  const durationPreset = form
    ? (DURATION_PRESETS.map(String) as string[]).includes(form.draft.durationMin)
      ? form.draft.durationMin
      : "custom"
    : "custom";

  const eventForm = form ? (
    <Surface
      aria-label={form.mode === "edit" ? t("strategy.form.editTitle") : t("strategy.form.title")}
      data-testid="orbit-strategy-form"
      fill
      meta={t("strategy.form.meta")}
      title={form.mode === "edit" ? t("strategy.form.editTitle") : t("strategy.form.title")}
    >
      <form
        className="orbit-event-form"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          submitForm();
        }}
      >
        <div className="orbit-event-form__grid">
          <Field htmlFor="orbit-ev-name" label={t("strategy.form.name")}>
            <Input
              id="orbit-ev-name"
              onChange={(changed) => patchForm({ name: changed.currentTarget.value })}
              placeholder={t("strategy.form.namePlaceholder")}
              value={form.draft.name}
            />
          </Field>
          <Field htmlFor="orbit-ev-track" label={t("strategy.form.track")}>
            <Input
              id="orbit-ev-track"
              onChange={(changed) => patchForm({ track: changed.currentTarget.value })}
              value={form.draft.track}
            />
          </Field>
          <Field htmlFor="orbit-ev-cls" label={t("strategy.form.cls")}>
            <Input
              id="orbit-ev-cls"
              list="orbit-ev-cls-options"
              onChange={(changed) => patchForm({ cls: changed.currentTarget.value })}
              value={form.draft.cls}
            />
          </Field>
          <datalist id="orbit-ev-cls-options">
            {["GT3", "LMGT3", "LMP2", "Hypercar", "GTE", "TCR"].map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <Field htmlFor="orbit-ev-start" label={t("strategy.form.start")}>
            <Input
              id="orbit-ev-start"
              onChange={(changed) => patchForm({ startAt: changed.currentTarget.value })}
              type="datetime-local"
              value={form.draft.startAt}
            />
          </Field>
          <Field htmlFor="orbit-ev-duration" label={t("strategy.form.duration")}>
            <div className="orbit-event-form__duration">
              <Seg
                label={t("strategy.form.duration")}
                onChange={(value) => {
                  if (value !== "custom") patchForm({ durationMin: value });
                }}
                options={[
                  ...DURATION_PRESETS.map((min) => ({
                    value: String(min),
                    label: formatMessage(t("strategy.form.durationPreset"), { h: min / 60 }),
                  })),
                  { value: "custom", label: t("strategy.form.durationCustom") },
                ]}
                value={durationPreset}
              />
              <Input
                aria-label={t("strategy.form.durationMin")}
                id="orbit-ev-duration"
                inputMode="numeric"
                numeric
                onChange={(changed) => patchForm({ durationMin: changed.currentTarget.value })}
                unit="min"
                value={form.draft.durationMin}
              />
            </div>
          </Field>
          <Field htmlFor="orbit-ev-tank" label={t("strategy.form.tank")}>
            <Input
              id="orbit-ev-tank"
              inputMode="decimal"
              numeric
              onChange={(changed) => patchForm({ tankL: changed.currentTarget.value })}
              unit="L"
              value={form.draft.tankL}
            />
          </Field>
          <Field htmlFor="orbit-ev-pit" label={t("strategy.form.pit")}>
            <Input
              id="orbit-ev-pit"
              inputMode="decimal"
              numeric
              onChange={(changed) => patchForm({ pitLossSec: changed.currentTarget.value })}
              unit="s"
              value={form.draft.pitLossSec}
            />
          </Field>
          <Field htmlFor="orbit-ev-team" label={t("strategy.form.team")}>
            <Input
              id="orbit-ev-team"
              onChange={(changed) => patchForm({ team: changed.currentTarget.value })}
              value={form.draft.team}
            />
          </Field>
        </div>

        <section aria-label={t("strategy.form.drivers")} className="orbit-event-form__drivers">
          <div className="orbit-event-form__drivers-head">
            <h4>{t("strategy.form.drivers")}</h4>
            <Button
              data-testid="orbit-strategy-form-add-driver"
              onClick={() =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        draft: {
                          ...current.draft,
                          drivers: [
                            ...current.draft.drivers,
                            newDriver(
                              formatMessage(t("strategy.form.driverN"), {
                                n: current.draft.drivers.length + 1,
                              }),
                              current.draft.drivers.length,
                            ),
                          ],
                        },
                      }
                    : current,
                )
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("strategy.form.addDriver")}
            </Button>
          </div>
          {form.draft.drivers.map((driver, index) => (
            <div className="orbit-event-form__driver" key={driver.id}>
              <Input
                aria-label={formatMessage(t("strategy.form.driverName"), { n: index + 1 })}
                onChange={(changed) =>
                  patchFormDriver(index, {
                    name: changed.currentTarget.value,
                    ini: initialsOf(changed.currentTarget.value),
                  })
                }
                value={driver.name}
              />
              <Input
                aria-label={formatMessage(t("strategy.form.driverIni"), { n: index + 1 })}
                maxLength={3}
                onChange={(changed) => patchFormDriver(index, { ini: changed.currentTarget.value })}
                value={driver.ini}
              />
              <Select
                label={formatMessage(t("strategy.form.driverColor"), { n: index + 1 })}
                onChange={(value) => patchFormDriver(index, { color: value })}
                options={DRIVER_COLORS.map((color, k) => ({
                  value: color,
                  label: formatMessage(t("strategy.form.colorN"), { n: k + 1 }),
                }))}
                value={driver.color}
              />
              <Input
                aria-label={formatMessage(t("strategy.form.driverPace"), { n: index + 1 })}
                inputMode="decimal"
                numeric
                onChange={(changed) =>
                  patchFormDriver(index, {
                    dry: [Number(changed.currentTarget.value) || driver.dry[0], driver.dry[1]],
                  })
                }
                unit="s"
                value={String(driver.dry[0])}
              />
              <Input
                aria-label={formatMessage(t("strategy.form.driverFuel"), { n: index + 1 })}
                inputMode="decimal"
                numeric
                onChange={(changed) =>
                  patchFormDriver(index, {
                    dry: [driver.dry[0], Number(changed.currentTarget.value) || driver.dry[1]],
                  })
                }
                unit="L/v"
                value={String(driver.dry[1])}
              />
              <Button
                aria-label={formatMessage(t("strategy.form.removeDriver"), { n: index + 1 })}
                disabled={form.draft.drivers.length <= 1}
                onClick={() =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          draft: {
                            ...current.draft,
                            drivers: current.draft.drivers.filter((_, i) => i !== index),
                          },
                        }
                      : current,
                  )
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                ×
              </Button>
            </div>
          ))}
        </section>

        <div className="orbit-event-form__acts">
          <Button data-testid="orbit-strategy-form-submit" type="submit" variant="primary">
            {form.mode === "edit" ? t("strategy.form.save") : t("strategy.form.submit")}
          </Button>
          <Button onClick={() => setForm(null)} type="button" variant="ghost">
            {t("strategy.form.cancel")}
          </Button>
        </div>
      </form>
    </Surface>
  ) : null;

  // ── estado inicial: dos caminos ─────────────────────────────────────────
  if (!eventRecord || !strategyEvent || !active || !plan) {
    return (
      <div className="orbit-strategy orbit-strategy--empty" data-testid="orbit-strategy">
        {contextSlot ? createPortal(context, contextSlot) : null}
        {form ? eventForm : (
        <Surface
          aria-label={t("strategy.picker.title")}
          data-testid="orbit-strategy-empty"
          fill
          meta={t("strategy.picker.meta")}
          title={t("strategy.picker.title")}
        >
          <p className="orbit-strategy__empty-lead">{t("strategy.picker.lead")}</p>
          <div className="orbit-strategy__paths" data-testid="orbit-strategy-paths">
            <Featured
              data-testid="orbit-strategy-path-own"
              interactive
              onClick={openCreate}
            >
              <span className="orbit-path__k">{t("strategy.picker.own")}</span>
              <span className="orbit-path__d">{t("strategy.picker.ownHint")}</span>
            </Featured>
            <Featured
              data-testid="orbit-strategy-path-series"
              interactive
              onClick={() => {
                setForm(null);
                setPath("series");
              }}
            >
              <span className="orbit-path__k">{t("strategy.picker.series")}</span>
              <span className="orbit-path__d">{t("strategy.picker.seriesHint")}</span>
            </Featured>
          </div>

          {path === "series" ? (
            <div className="orbit-list" data-testid="orbit-strategy-series">
              {seriesOptions.length === 0 ? (
                <Note title={t("strategy.empty.noneTitle")}>{t("strategy.empty.none")}</Note>
              ) : (
                seriesOptions.map((start) => (
                  <ListRow
                    key={`${start.seriesId}-${start.at.getTime()}`}
                    onClick={() => createFromSeries(start)}
                    subtitle={[start.track, start.vehicleClass, start.durationMin
                      ? formatMessage(t("strategy.chip.duration"), { min: start.durationMin })
                      : ""]
                      .filter(Boolean)
                      .join(" · ")}
                    title={start.name}
                    trailing={<span className="orbit-when">{formatStartTime(start.at)}</span>}
                  />
                ))
              )}
            </div>
          ) : null}
        </Surface>
        )}
      </div>
    );
  }

  const event = strategyEvent;
  const drivers = eventRecord.drivers;

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
                onSelect: openEdit,
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

      {form ? eventForm : tab === "strategies" ? (
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
                      <Button
                        data-tip={t("strategy.cards.activeTip")}
                        data-tip-side="top"
                        disabled
                        size="sm"
                        variant="ghost"
                      >
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
                      {/* Los pilotos son del evento local: sus ritmos y su
                          consumo se editan aquí y el plan se recalcula
                          (D-W4-3, sustituye al botón muerto de D-94). */}
                      <Button
                        aria-expanded={editDriver === driver.id}
                        data-testid={`orbit-driver-edit-${driver.id}`}
                        onClick={() =>
                          setEditDriver((current) => (current === driver.id ? null : driver.id))
                        }
                        size="sm"
                        variant="ghost"
                      >
                        {t("strategy.drivers.edit")}
                      </Button>
                      {editDriver === driver.id ? (
                        <div
                          className="orbit-driver__editor"
                          data-testid={`orbit-driver-editor-${driver.id}`}
                        >
                          <label className="orbit-driver__field">
                            <span>{t("strategy.drivers.name")}</span>
                            <Input
                              aria-label={t("strategy.drivers.name")}
                              onChange={(changed) =>
                                patchDriver(driver.id, (item) => ({
                                  ...item,
                                  name: changed.currentTarget.value,
                                }))
                              }
                              value={driver.name}
                            />
                          </label>
                          {(["dry", "wet", "eco"] as const).map((mode) => (
                            <div className="orbit-driver__field-row" key={mode}>
                              <label className="orbit-driver__field">
                                <span>
                                  {formatMessage(t("strategy.drivers.paceOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                </span>
                                <Input
                                  aria-label={formatMessage(t("strategy.drivers.paceOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                  inputMode="decimal"
                                  numeric
                                  onChange={(changed) =>
                                    setDriverPace(driver.id, mode, 0, changed.currentTarget.value)
                                  }
                                  unit="s"
                                  value={String(driver[mode][0])}
                                />
                              </label>
                              <label className="orbit-driver__field">
                                <span>
                                  {formatMessage(t("strategy.drivers.fuelOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                </span>
                                <Input
                                  aria-label={formatMessage(t("strategy.drivers.fuelOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                  inputMode="decimal"
                                  numeric
                                  onChange={(changed) =>
                                    setDriverPace(driver.id, mode, 1, changed.currentTarget.value)
                                  }
                                  unit="L/v"
                                  value={String(driver[mode][1])}
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
