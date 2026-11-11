import scene from "../../fixtures/ajustes-base.json";
import coreScene from "../../fixtures/core-offline.json";
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
  return name === "componentes-incompatibles"
    ? { ...hello, version: HOST_PROTOCOL_VERSION + 1 }
    : hello;
}
export function createMockHost(sceneName = "ajustes-base") {
  const visual =
    /^visual-(dark|light):(ajustes-con-diseno|proximamente-base|roadmap-base|notificaciones-base|launcher-base|launcher-ready|launcher-aplicaciones|launcher-escaneando|launcher-borrar-app|testing-reference)$/.exec(
      sceneName,
    );
  sceneName = visual?.[2] ?? sceneName;
  const core = structuredClone(coreScene) as CoreStatus;

  const notes: MockContext["notes"] = [];
  const context: MockContext = {
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
        ? helloForScene(sceneName)
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
