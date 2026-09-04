import goldenV2Raw from "../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json?raw";
import type {
  OverlayFrameV2,
  OverlaySourceStatusV2,
  OverlayUpdateV2,
} from "../../../generated/telemetry";
import type { DesignSystemId, WidgetType } from "../../core/profile-document";
import type { WidgetRuntimeInput } from "../../core/widget-definition";

// El golden es la única semilla: si carece de frame, source o standings no
// hay fixture honesto que construir y se falla rápido en la carga, sin
// fallbacks undefined/[] sintéticos.
const canonical = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

function requireCanonicalFrame(): OverlayFrameV2 {
  const frame = canonical.frame;
  if (!frame) {
    throw new Error("authoring-v2-scenario-fixture: el golden V2 de 20 carece de frame");
  }
  if (!Array.isArray(frame.standings) || frame.standings.length === 0) {
    throw new Error("authoring-v2-scenario-fixture: el golden V2 de 20 carece de standings");
  }
  // Lo que C2a promete usar/preservar debe existir en la semilla: id del
  // jugador, track de sesión y relative no vacío con side/authority del
  // productor (se exigen, no se sintetizan).
  if (typeof frame.player?.id !== "string" || frame.player.id === "") {
    throw new Error("authoring-v2-scenario-fixture: el golden V2 de 20 carece de player.id");
  }
  if (!frame.session?.track) {
    throw new Error("authoring-v2-scenario-fixture: el golden V2 de 20 carece de session.track");
  }
  if (
    !Array.isArray(frame.relative) ||
    frame.relative.length === 0 ||
    frame.relative.some((row) => !row.side || !row.authority)
  ) {
    throw new Error(
      "authoring-v2-scenario-fixture: el golden V2 de 20 carece de relative con side/authority de productor",
    );
  }
  return frame;
}

function requireCanonicalSource(): OverlaySourceStatusV2 {
  if (!canonical.source) {
    throw new Error("authoring-v2-scenario-fixture: el golden V2 de 20 carece de source");
  }
  return canonical.source;
}

const canonicalFrame = requireCanonicalFrame();
const canonicalSource = requireCanonicalSource();

// Variantes soportadas hoy: solo estas dos. El tipo estrecho impide no-ops
// silenciosos en TS; cualquier otra variante falla rápido en runtime.
export type AuthoringV2Variant = "default" | "standings-multiclass";

export type AuthoringV2Scenario = {
  session: "practice" | "qualifying" | "race";
  location: "track" | "pits";
  state: "ready" | "stale" | "disconnected" | "error";
  widget: WidgetType;
  system: DesignSystemId;
  variant: AuthoringV2Variant;
};

function sourceStateFor(state: AuthoringV2Scenario["state"]): OverlaySourceStatusV2["state"] {
  if (state === "ready") {
    return "live";
  }
  if (state === "disconnected") {
    return "stopped";
  }
  return state;
}

// Fixture V2 puro de autoría (C2a+C2b4): el frame canónico de 20 coches ya
// es el campo multiclass (hypercar/lmp2/gte) con el jugador dentro, y el
// relative canónico ya trae side/authority del productor. El escenario clona
// en profundo, mapea el estado a source y aplica solo dos transformaciones
// acotadas desde datos canónicos: session → phase (misma quality) y
// location → pit de la fila del jugador.
export function buildAuthoringV2ScenarioRuntime(
  scenario: AuthoringV2Scenario,
): WidgetRuntimeInput {
  // widget/system quedan reservados en la API estable para C2b+: el fixture
  // canónico aún no los especializa.
  const { state, variant, session, location } = scenario;
  if (variant !== "default" && variant !== "standings-multiclass") {
    throw new Error(
      `authoring-v2-scenario-fixture: variante no soportada ${JSON.stringify(variant)}`,
    );
  }
  const frame: OverlayFrameV2 = structuredClone(canonicalFrame);
  const source: OverlaySourceStatusV2 = {
    ...structuredClone(canonicalSource),
    state: sourceStateFor(state),
  };
  const playerId = frame.player.id;
  if (typeof playerId !== "string" || playerId === "") {
    throw new Error(
      "authoring-v2-scenario-fixture: el golden V2 de 20 carece de player.id",
    );
  }
  // location especializa únicamente el pit de la fila cuyo id coincide con
  // el jugador canónico. Sin esa fila no hay fixture honesto: falla rápido,
  // sin fallback ni id inventado.
  const pit = location === "pits" ? "pit" : "track";
  const standings = variant === "standings-multiclass"
    ? structuredClone(canonicalFrame.standings)
    : frame.standings;
  if (!standings.some((row) => row.id === playerId)) {
    throw new Error(
      "authoring-v2-scenario-fixture: el jugador canónico no está en standings",
    );
  }
  // standings-multiclass selecciona el campo multiclass canónico tal cual,
  // sin reescribir datos del productor (el frame de 20 coches ya es
  // multiclass). Es la única variante que re-selecciona una sección.
  // session especializa únicamente phase, conservando su quality canónica.
  const outFrame: OverlayFrameV2 = {
    ...frame,
    session: {
      ...frame.session,
      phase: { v: session, q: frame.session.phase.q },
    },
    standings: withPlayerPit(standings, playerId, pit),
  };
  return { overlayV2Frame: outFrame, overlayV2Source: source };
}

function withPlayerPit(
  standings: OverlayFrameV2["standings"],
  playerId: string,
  pit: "pit" | "track",
): OverlayFrameV2["standings"] {
  return standings.map((row) => (row.id === playerId ? { ...row, pit } : row));
}
