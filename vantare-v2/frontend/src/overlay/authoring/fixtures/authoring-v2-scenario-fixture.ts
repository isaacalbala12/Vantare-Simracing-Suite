import goldenV2Raw from "../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json?raw";
import type {
  OverlayFrameV2,
  OverlaySourceStatusV2,
  OverlayUpdateV2,
} from "../../../generated/telemetry";
import type { DesignSystemId, WidgetType } from "../../core/profile-document";
import type { WidgetRuntimeInput } from "../../core/widget-definition";
import type { HarnessVariant } from "./authoring-fixtures";

const canonical = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

export type AuthoringV2Scenario = {
  session: "practice" | "qualifying" | "race";
  location: "track" | "pits";
  state: "ready" | "stale" | "disconnected" | "error";
  widget: WidgetType;
  system: DesignSystemId;
  variant: HarnessVariant;
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

// Fixture V2 puro de autoría (C2a): el frame canónico de 20 coches ya es el
// campo multiclass (hypercar/lmp2/gte) con el jugador dentro, y el relative
// canónico ya trae side/authority del productor. El escenario solo clona en
// profundo y mapea el estado a source.
export function buildAuthoringV2ScenarioRuntime(
  scenario: AuthoringV2Scenario,
): WidgetRuntimeInput {
  // session/location/widget/system quedan reservados en la API estable para
  // C2b: el fixture canónico aún no los especializa.
  const { state, variant } = scenario;
  const frame: OverlayFrameV2 | undefined = structuredClone(canonical.frame ?? undefined);
  const source: OverlaySourceStatusV2 = {
    ...structuredClone(canonical.source),
    state: sourceStateFor(state),
  };
  // Única sección que una variante puede tocar: standings-multiclass
  // selecciona el campo multiclass canónico tal cual, sin reescribir datos
  // del productor (el frame de 20 coches ya es multiclass).
  const outFrame = variant === "standings-multiclass" && frame
    ? { ...frame, standings: structuredClone(canonical.frame?.standings ?? []) }
    : frame;
  return { overlayV2Frame: outFrame, overlayV2Source: source };
}

// Runtime estático compartido por las previews Hub: escenario default, fuente
// V2 pura, sin snapshot ni mocks por superficie.
export const PREVIEW_V2_RUNTIME: WidgetRuntimeInput = buildAuthoringV2ScenarioRuntime({
  session: "race",
  location: "track",
  state: "ready",
  widget: "standings",
  system: "vantare-crystal",
  variant: "default",
});
