import type {
  OverlayFrameV2,
  OverlayQValue,
  OverlaySourceStatusV2,
} from "../../../generated/telemetry";
import { pedalValue } from "../pedals-telemetry/pedals-telemetry-view-model-v2";
import type { PedalsContent } from "./pedals-definition";
import type {
  PedalsFlag,
  PedalsSessionPhase,
  PedalsViewModel,
} from "./pedals-view-model";

function formatPedalPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function unavailable(status: PedalsViewModel["status"], statusMessage?: string): PedalsViewModel {
  return {
    type: "pedals",
    status,
    statusMessage,
    throttle: 0,
    brake: 0,
    clutch: 0,
    throttleText: "—",
    brakeText: "—",
    clutchText: "—",
    flag: "unknown",
    sessionPhase: "unknown",
  };
}

function displayedFlag(value: OverlayQValue<string>): PedalsFlag {
  if (value.q !== "fresh") return "unknown";
  switch (value.v?.trim().toLowerCase()) {
    case "green":
    case "yellow":
    case "blue":
    case "red":
    case "white":
    case "black":
      return value.v.trim().toLowerCase() as Exclude<PedalsFlag, "unknown" | "checkered">;
    case "checkered":
    case "chequered":
      return "checkered";
    default:
      return "unknown";
  }
}

function displayedSessionPhase(value: OverlayQValue<string>): PedalsSessionPhase {
  if (value.q !== "fresh") return "unknown";
  switch (value.v?.trim().toLowerCase()) {
    case "practice":
    case "qualifying":
    case "race":
      return value.v.trim().toLowerCase() as Exclude<PedalsSessionPhase, "unknown">;
    default:
      return "unknown";
  }
}

/**
 * Pedals view model over the Overlay v2 contract.
 *
 * Consume `player.throttle / brake / clutch` publicados por el frame v2
 * (mismos que `pedals-telemetry` e `input-telemetry`). No reimplementa
 * dominio: solo formatea 0..1 a porcentaje y propaga el lifecycle del source.
 * Missing/invalid se muestra como ausencia por canal; cero fresco sigue
 * siendo una medición válida. La señal de sesión se consume
 * aparte: `session.flag` y `session.phase` solo llegan a la línea de estado
 * cuando son valores frescos y reconocidos; nunca se deduce una bandera del
 * color o del valor de un pedal, ni se inventa verde por ausencia.
 */
export function buildPedalsViewModelV2(
  frame: OverlayFrameV2,
  source: OverlaySourceStatusV2,
  _content: PedalsContent,
): PedalsViewModel {
  void _content;
  if (!["live", "degraded", "stale"].includes(source.state)) {
    return unavailable(source.state === "error" ? "error" : "disconnected", source.reason || undefined);
  }

  const hasStalePedal = [frame.player.throttle, frame.player.brake, frame.player.clutch].some(
    (value) => value.q === "stale",
  );
  const throttle = pedalValue(frame.player.throttle);
  const brake = pedalValue(frame.player.brake);
  const clutch = pedalValue(frame.player.clutch);
  const hasMissingPedal = [throttle, brake, clutch].some((value) => value === undefined);
  const status: PedalsViewModel["status"] =
    source.state === "stale" || hasStalePedal ? "stale" : hasMissingPedal ? "missing" : "ready";

  return {
    type: "pedals",
    status,
    statusMessage: source.reason || undefined,
    // Zero only positions an empty bar; the text preserves channel absence.
    throttle: throttle ?? 0,
    brake: brake ?? 0,
    clutch: clutch ?? 0,
    throttleText: formatPedalPercent(throttle),
    brakeText: formatPedalPercent(brake),
    clutchText: formatPedalPercent(clutch),
    flag: displayedFlag(frame.session.flag),
    sessionPhase: displayedSessionPhase(frame.session.phase),
  };
}

export function pedalsDisplayedValues(model: PedalsViewModel): Readonly<Record<string, string>> {
  return Object.freeze({
    status: model.status,
    throttle: model.throttleText,
    brake: model.brakeText,
    clutch: model.clutchText,
    flag: model.flag ?? "unknown",
    sessionPhase: model.sessionPhase ?? "unknown",
  });
}

export const OVERLAY_V2_PEDALS_DECLARED_GAPS: readonly string[] = Object.freeze([]);
