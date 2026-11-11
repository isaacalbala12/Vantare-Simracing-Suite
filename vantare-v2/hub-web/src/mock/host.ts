import scene from "../../fixtures/ajustes-base.json";
import coreScene from "../../fixtures/core-offline.json";
import demoIdentity from "../../fixtures/demo-identity.json";
import {
  type CoreStatus,
  HOST_PROTOCOL_VERSION,
  type HostToUi,
} from "../contract/generated/contract";
import { mockModules } from "../contract/generated/mocks";
import { isUiMessage } from "../contract/validation";
import type { MockContext } from "./context";
export const hello = scene as Extract<HostToUi, { kind: "hello" }>;
export function helloForScene(name?: string): typeof hello {
  if (name?.startsWith("visual-"))
    return { ...hello, demoName: demoIdentity.name };
  return name === "componentes-incompatibles"
    ? { ...hello, version: HOST_PROTOCOL_VERSION + 1 }
    : name === "componentes-incompatibles-light"
      ? {
          ...hello,
          version: HOST_PROTOCOL_VERSION + 1,
          theme: { ...hello.theme, scheme: "light" },
        }
      : hello;
}
export function createMockHost(
  sceneName = "ajustes-base",
  emit: (message: HostToUi) => void = () => {},
) {
  const requestedScene = sceneName;
  const visual =
    /^visual-(dark|light):(privacidad-pendiente|privacidad-uso|inicio-(?:base|referencia|vacio|cargando|error|lanzando|sin-diseno)|ajustes-con-diseno|proximamente-base|roadmap-base|notificaciones-base|launcher-base|launcher-ready|launcher-aplicaciones|launcher-escaneando|launcher-borrar-app|launcher-decision|launcher-shortcuts|launcher-offline|testing-reference|testing-tester-reference|testing-tester-questionnaires-reference|testing-tester-community-reference)$/.exec(
      sceneName,
    );
  sceneName = visual?.[2] ?? sceneName;
  const core = structuredClone(coreScene) as CoreStatus;
  // Match the local GPUI reference bank; never changes access from the real host.
  if (visual)
    core.access = {
      verified: true,
      blocked: false,
      tester: true,
      calendar: true,
      engineer: true,
      strategy: true,
    };

  const notes: MockContext["notes"] = [];
  const context: MockContext = {
    emit,
    sceneName,
    visual,
    core,
    notes,
    note: (section, code) => {
      notes.push({ section, code });
    },
  };
  const handlers = mockModules.map((module) => module.create(context));
  return (value: unknown): HostToUi | null => {
    if (!isUiMessage(value)) return null;
    if (value.kind === "hello")
      return value.version === HOST_PROTOCOL_VERSION
        ? helloForScene(requestedScene)
        : null;
    for (const handler of handlers) {
      const result = handler(value);
      if (result !== undefined) return result;
    }
    return value.kind === "request"
      ? { kind: "failure", id: value.id, error: { kind: "unsupported" } }
      : null;
  };
}
export const mockReply = (value: unknown) => createMockHost()(value);
