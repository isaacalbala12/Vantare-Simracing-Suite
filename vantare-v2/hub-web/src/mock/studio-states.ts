import type { StudioView } from "../contract/generated/studio";
import { studioLimits } from "../contract/generated/studio";
import type { MockHandler } from "./context";

export const studioStateVisual =
  /^visual-(dark|light):(studio-a-(?:vacio|protegido|ilegible|guardando|error|oculto|cargando|missing|fallo-lectura|recargar|limite|no-verificado))$/;

/** QA scenes exercise the real renderer state machine; never imported by production. */
export function studioStateScene(scene: string, view: StudioView): MockHandler {
  if (!scene.startsWith("studio-a-")) return () => undefined;
  const delta = view.instances.find((item) => item.kind === "delta");
  if (delta) {
    delta.opacity = 85;
    delta.size = { width: 380, height: 72 };
    if (delta.settings?.kind === "delta") delta.settings.size = "bar";
  }
  const relative = view.instances.find((item) => item.kind === "relative");
  if (relative) {
    relative.visible = false;
    relative.size = { width: 300, height: 196 };
    relative.showIn = { practice: false, qualifying: false, race: true };
  }
  if (scene === "studio-a-vacio") view.instances = [];
  if (scene === "studio-a-protegido" || scene === "studio-a-ilegible")
    view.state = "protected";
  if (scene === "studio-a-ilegible") view.instances = [];
  const recovered = structuredClone(view.instances[0]);
  if (scene === "studio-a-recargar") {
    view.state = "protected";
    view.instances = [];
  }
  if (scene === "studio-a-limite") {
    const samples = view.instances;
    view.instances = Array.from({ length: studioLimits.instances }, (_, i) => ({
      ...structuredClone(samples[i % samples.length]),
      id: `limit-${i}`,
    }));
  }
  if (scene === "studio-a-no-verificado") view.plan = "unverified";
  if (scene === "studio-a-missing") {
    view.state = "missing";
    view.instances = [];
  }
  let failed = false;
  let reads = 0;
  return (message) => {
    if (
      scene === "studio-a-fallo-lectura" &&
      message.kind === "subscribe" &&
      message.topic === "studio"
    )
      return null;
    if (message.kind === "request" && message.request.method === "studio.get") {
      reads++;
      if (scene === "studio-a-fallo-lectura" && reads === 1)
        return { kind: "failure", id: message.id, error: { kind: "io" } };
      if (scene === "studio-a-recargar" && reads > 1) {
        view.state = "ready";
        view.instances = [{ ...recovered, id: "recovered-widget" }];
      }
    }
    if (
      scene === "studio-a-cargando" &&
      ((message.kind === "subscribe" && message.topic === "studio") ||
        (message.kind === "request" && message.request.method === "studio.get"))
    )
      return null;
    if (
      message.kind !== "request" ||
      !["studio.instance", "studio.visibility"].includes(message.request.method)
    )
      return;
    // Deliberately unresolved QA response: no synthetic pending property, sleeps,
    // or mutation of the renderer. Closing Client cancels its normal deadline.
    if (scene === "studio-a-guardando") return null;
    if (scene === "studio-a-error" && !failed) {
      failed = true;
      return { kind: "failure", id: message.id, error: { kind: "io" } };
    }
  };
}
