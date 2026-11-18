import {
  previewErrors,
  previewTransparentPng,
} from "../../contract/generated/preview";
import { studioFreeKinds } from "../../contract/generated/studio";
import type { MockContext, MockHandler } from "../context";
import { workshopCatalog } from "./workshop";
export function create(context: MockContext): MockHandler {
  if (context.sceneName.startsWith("preview-")) {
    context.core.rights = "connected";
    context.core.access.verified = true;
    context.core.accountGeneration = "a".repeat(64);
  }
  return (message) => {
    if (
      message.kind !== "request" ||
      message.request.method !== "preview.render"
    )
      return undefined;
    const { id, request } = message;
    if (
      context.core.live ||
      !context.core.access.verified ||
      context.core.access.blocked
    )
      return { kind: "failure", id, error: { kind: "denied" } };
    if (!context.core.accountGeneration)
      return { kind: "failure", id, error: { kind: "coreUnavailable" } };
    const view = context.studioData;
    if (request.target.kind === "instance") {
      if (!view || request.target.baseRevision !== view.revision)
        return view
          ? {
              kind: "failure",
              id,
              error: { kind: "studioConflict", current: structuredClone(view) },
            }
          : { kind: "failure", id, error: { kind: "protected" } };
      if (view.state !== "ready")
        return { kind: "failure", id, error: { kind: "protected" } };
      const source = view.instances.find(
        (item) =>
          request.target.kind === "instance" && item.id === request.target.id,
      );
      if (!source || source.locked)
        return { kind: "failure", id, error: { kind: "denied" } };
    } else {
      const { target } = request;
      const allowed =
        target.kind === "catalog"
          ? view?.catalog.some(
              (item) => item.kind === target.widget && item.allowed,
            )
          : view?.plan === "pro" ||
            view?.plan === "founders" ||
            ((view?.plan === "free" || view?.plan === "launch") &&
              studioFreeKinds.some((kind) => kind === target.widget));
      if (!allowed) return { kind: "failure", id, error: { kind: "denied" } };
    }
    if (context.sceneName === "preview-busy")
      return { kind: "failure", id, error: { kind: "busy" } };
    if (request.target.kind === "scene") {
      const target = request.target;
      const scene = workshopCatalog.widgets
        .find(({ kind }) => kind === target.widget)
        ?.scenes.find(({ id }) => id === target.sceneId);
      if (!scene || target.frame >= scene.frames)
        return {
          kind: "failure",
          id,
          error: { kind: "previewFailed", reason: "invalidInput" },
        };
    }
    const reason = previewErrors.find(
      (reason) => context.sceneName === `preview-${reason}`,
    );
    if (reason)
      return { kind: "failure", id, error: { kind: "previewFailed", reason } };
    if (context.sceneName !== "preview-image")
      return {
        kind: "failure",
        id,
        error: { kind: "previewFailed", reason: "noDemo" },
      };
    return {
      kind: "response",
      id,
      result: {
        method: "preview.render",
        value: { width: 1, height: 1, pngBase64: previewTransparentPng },
      },
    };
  };
}
