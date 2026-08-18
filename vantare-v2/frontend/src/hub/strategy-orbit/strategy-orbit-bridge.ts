/**
 * Puente del evento activo de Estrategia (briefing 07).
 *
 * `strategy-contract-v1` describe el **plan** (stints, neumáticos, entradas
 * manuales), no el evento ni el equipo: no hay ningún sitio en el contrato
 * donde vivan el reparto de pilotos, sus ritmos o el horario de la carrera.
 * Así que el hub los publica por su propio canal Wails, igual que el
 * calendario publica `calendar:loaded`, y la pantalla no inventa nada: sin
 * `strategy:roster` no hay evento y el panel muestra el estado vacío.
 */

import { Events } from "@wailsio/runtime";
import type {
  StrategyDriver,
  StrategyEvent,
  StrategyMode,
  StrategyPace,
} from "./strategy-orbit-model";

export const STRATEGY_ROSTER_REQUEST = "strategy:roster:get";
export const STRATEGY_ROSTER_EVENT = "strategy:roster";

/** Estrategia tal y como la publica el puente (sin overrides ni neumáticos). */
export interface RosterStrategy {
  id: string;
  name: string;
  note: string;
  mode: StrategyMode;
  order: string[];
}

export interface StrategyRoster {
  event: StrategyEvent;
  drivers: StrategyDriver[];
  strategies: RosterStrategy[];
  /** Ids de los juegos que el evento asigna, si el puente los conoce. */
  tyreIds?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function pace(value: unknown, fallback: StrategyPace): StrategyPace {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  return [num(value[0], fallback[0]), num(value[1], fallback[1])];
}

function parseDriver(value: unknown): StrategyDriver | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null;
  const dry = pace(value.dry, [104, 2.75]);
  return {
    id: value.id,
    name: str(value.name, value.id),
    ini: str(value.ini, value.id.slice(0, 2).toUpperCase()),
    color: str(value.color, "var(--orbit-coral)"),
    cls: str(value.cls),
    dry,
    wet: pace(value.wet, [dry[0] + 8, dry[1] - 0.35]),
    eco: pace(value.eco, [dry[0] + 1.1, dry[1] - 0.2]),
  };
}

const MODES: StrategyMode[] = ["dry", "wet", "eco"];

function parseStrategy(value: unknown, index: number): RosterStrategy | null {
  if (!isRecord(value)) return null;
  const order = Array.isArray(value.order) ? value.order.filter((id): id is string => typeof id === "string") : [];
  if (order.length === 0) return null;
  const mode = MODES.includes(value.mode as StrategyMode) ? (value.mode as StrategyMode) : "dry";
  return {
    id: str(value.id, `s${index + 1}`),
    name: str(value.name, `#${index + 1}`),
    note: str(value.note),
    mode,
    order,
  };
}

/** Traduce el payload del puente; `null` si no trae un evento utilizable. */
export function parseStrategyRoster(payload: unknown): StrategyRoster | null {
  if (!isRecord(payload) || !isRecord(payload.event)) return null;
  const raw = payload.event;
  const drivers = (Array.isArray(payload.drivers) ? payload.drivers : [])
    .map(parseDriver)
    .filter((item): item is StrategyDriver => item !== null);
  if (drivers.length === 0) return null;

  const event: StrategyEvent = {
    startMin: num(raw.startMin, 14 * 60),
    durationMin: num(raw.durationMin, 240),
    tankL: num(raw.tankL, 90),
    pitS: num(raw.pitS, 64),
    name: str(raw.name, "—"),
    subtitle: str(raw.subtitle),
    monogram: str(raw.monogram, "EV"),
    vehicleClass: str(raw.vehicleClass),
    team: str(raw.team),
    dayLabel: str(raw.dayLabel),
    startISO: typeof raw.startISO === "string" ? raw.startISO : undefined,
  };

  const strategies = (Array.isArray(payload.strategies) ? payload.strategies : [])
    .map(parseStrategy)
    .filter((item): item is RosterStrategy => item !== null);

  return {
    event,
    drivers,
    strategies: strategies.length
      ? strategies
      : [
          {
            id: "s1",
            name: "#1",
            note: "",
            mode: "dry",
            order: drivers.map((driver) => driver.id),
          },
        ],
    tyreIds: Array.isArray(payload.tyreIds)
      ? payload.tyreIds.filter((id): id is string => typeof id === "string")
      : undefined,
  };
}

/** Se suscribe al puente y pide el evento activo. Devuelve la baja. */
export function subscribeToStrategyRoster(
  listener: (roster: StrategyRoster) => void,
): () => void {
  const off = Events.On(STRATEGY_ROSTER_EVENT, (event: { data?: unknown }) => {
    const payload = Array.isArray(event?.data) ? event.data[0] : event?.data;
    const roster = parseStrategyRoster(payload);
    if (roster) listener(roster);
  });
  Events.Emit(STRATEGY_ROSTER_REQUEST);
  return () => off();
}
