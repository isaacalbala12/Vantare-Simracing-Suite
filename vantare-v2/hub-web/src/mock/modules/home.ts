import homeFixture from "../../../fixtures/inicio-base.json";
import launcher from "../../../fixtures/launcher-base.json";
import type { UiToHost } from "../../contract/generated/contract";
import { homeNaturalSizes } from "../../contract/generated/home";
import type { MockContext, MockHandler } from "../context";
import { homeScene } from "../home-scene";
export function create({ sceneName, core }: MockContext): MockHandler {
  if (sceneName.startsWith("inicio-")) {
    core.access.verified = true;
    core.access.blocked = false;
    core.access.tester = true;
    core.rights = "connected";
  }
  const value = homeScene(sceneName, launcher, homeFixture, homeNaturalSizes);
  return (m: UiToHost) => {
    if (m.kind === "subscribe" && m.topic === "home")
      return sceneName === "inicio-cargando"
        ? null
        : {
            kind: "event",
            event: { topic: "home", value: structuredClone(value) },
          };
    if (m.kind === "unsubscribe" && m.topic === "home") return null;
    if (m.kind === "request" && m.request.method === "home.get") {
      if (sceneName === "inicio-error")
        return {
          kind: "failure",
          id: m.id,
          error: { kind: "coreUnavailable" },
        };
      return sceneName === "inicio-cargando"
        ? null
        : {
            kind: "response",
            id: m.id,
            result: { method: "home.get", value: structuredClone(value) },
          };
    }
    return undefined;
  };
}
