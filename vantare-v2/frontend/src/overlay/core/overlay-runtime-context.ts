import type {
  OverlayCapabilitiesV2,
  OverlayFrameV2,
  OverlaySourceStateV2,
  OverlaySourceStatusV2,
} from "../../generated/telemetry";

export type OverlayRuntimeSessionType =
  | "practice"
  | "qualifying"
  | "race"
  | "warmup"
  | "endurance";

export type OverlayRuntimeContext = Readonly<{
  sourceState?: OverlaySourceStateV2;
  sourceReason?: string;
  sessionType?: OverlayRuntimeSessionType;
  playerPresent: boolean;
  playerInPit?: boolean;
  vehicleCount: number;
  capabilities?: OverlayCapabilitiesV2;
}>;

const SESSION_TYPES = new Set<OverlayRuntimeSessionType>([
  "practice",
  "qualifying",
  "race",
  "warmup",
  "endurance",
]);

export function buildOverlayRuntimeContext(
  frame: OverlayFrameV2 | undefined,
  source: OverlaySourceStatusV2 | undefined,
): OverlayRuntimeContext {
  const playerId = frame?.player.id;
  const playerRow = playerId
    ? frame?.standings.find((row) => row.id === playerId)
    : undefined;

  return Object.freeze({
    sourceState: source?.state,
    sourceReason: source?.reason,
    sessionType: readSessionType(frame),
    playerPresent: playerId !== undefined && playerId !== "",
    playerInPit: playerRow?.pit === "pit"
      ? true
      : playerRow?.pit === "track"
        ? false
        : undefined,
    vehicleCount: frame?.standings.length ?? 0,
    capabilities: frame?.capabilities,
  });
}

function readSessionType(frame: OverlayFrameV2 | undefined): OverlayRuntimeSessionType | undefined {
  const phase = frame?.session.phase;
  if (!phase || (phase.q !== "fresh" && phase.q !== "stale")) {
    return undefined;
  }
  return typeof phase.v === "string" && SESSION_TYPES.has(phase.v as OverlayRuntimeSessionType)
    ? phase.v as OverlayRuntimeSessionType
    : undefined;
}
