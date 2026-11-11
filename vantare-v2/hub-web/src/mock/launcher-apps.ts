import fixture from "../../fixtures/launcher-apps.json";
import type {
  AppDraft,
  CatalogView,
  HostToUi,
  LauncherView,
  UiToHost,
} from "../contract/generated/contract";
import { launcherLimits } from "../contract/generated/contract";

/** Local QA data only. No executable paths are kept in the simulated document. */
export function createLauncherAppsMock(view: LauncherView, scene: string) {
  const applicationsScene =
    scene.startsWith("launcher-aplicaciones") ||
    scene === "launcher-escaneando" ||
    scene === "launcher-borrar-app";
  const catalog = structuredClone(fixture) as CatalogView;
  if (applicationsScene) {
    view.apps = catalog.apps.map((app) => ({
      id: app.id,
      name: app.name,
      available: true,
    }));
    view.profiles = view.profiles.map((profile) => ({
      ...profile,
      launchable: true,
    }));
    view.scanning = scene === "launcher-escaneando";
  } else {
    catalog.apps = catalog.apps
      .filter((app) => view.apps.some((known) => known.id === app.id))
      .map((app) => ({
        ...app,
        found: view.apps.some(
          (known) => known.id === app.id && known.available,
        ),
        installed: view.apps.some(
          (known) => known.id === app.id && known.available,
        ),
      }));
  }
  const drafts = new Map<string, AppDraft>(
    catalog.apps.map((app) => [
      app.id,
      {
        id: app.id,
        name: app.name,
        favorite: app.favorite,
        useDiscovery: false,
      },
    ]),
  );
  const customized = new Set(
    scene === "launcher-aplicaciones-args" ? ["obs"] : [],
  );
  const customProfiles = new Map<string, number>(
    scene === "launcher-aplicaciones-args" ? [["obs", 1]] : [],
  );
  let selectionTarget: string | null | undefined;
  let serial = 0;
  let conflictOnce = scene.endsWith("-conflicto");
  let selection: { token: string; name: string } | null = null;
  const bump = () => {
    view.revision = (BigInt(`0x${view.revision}`) + 1n)
      .toString(16)
      .padStart(64, "0");
  };
  function picked(name: string) {
    selection = { token: (++serial).toString(16).padStart(64, "0"), name };
    return structuredClone(selection);
  }
  return (message: UiToHost): HostToUi | undefined => {
    if (message.kind === "pickedExecutable")
      return {
        kind: "response",
        id: message.id,
        result: {
          method: "launcher.app.pick",
          value:
            message.path === null
              ? null
              : picked(
                  message.path
                    .split(/[\\/]/)
                    .pop()
                    ?.replace(/\.exe$/i, "") || "Aplicación QA",
                ),
        },
      };
    if (message.kind !== "request") return;
    const { id, request } = message;
    const fail = (kind: "denied" | "protected"): HostToUi => ({
      kind: "failure",
      id,
      error: { kind },
    });
    if (
      request.method !== "launcher.catalog" &&
      request.method !== "launcher.scan" &&
      !request.method.startsWith("launcher.app.")
    )
      return;
    if (view.protected) return fail("protected");
    if (request.method === "launcher.catalog")
      return {
        kind: "response",
        id,
        result: {
          method: request.method,
          value: {
            ...structuredClone(catalog),
            revision: view.revision,
            scanning: view.scanning,
          },
        },
      };
    if (request.method === "launcher.scan")
      return {
        kind: "response",
        id,
        result: { method: request.method, value: structuredClone(view) },
      };
    if (request.method === "launcher.app.pick") {
      selectionTarget = request.id;
      return {
        kind: "response",
        id,
        result: { method: request.method, value: picked("Aplicación QA") },
      };
    }
    if (request.method === "launcher.app.get") {
      const draft =
        request.id === null
          ? {
              id: null,
              name: "",
              favorite: false,
              useDiscovery: false,
            }
          : drafts.get(request.id);
      return draft
        ? {
            kind: "response",
            id,
            result: {
              method: request.method,
              value: {
                revision: view.revision,
                draft: structuredClone(draft),
                hasExecutable: draft.id?.startsWith("custom:") ?? false,
                hasCustomArguments:
                  draft.id !== null && customized.has(draft.id),
                customProfiles:
                  draft.id === null ? 0 : (customProfiles.get(draft.id) ?? 0),
              },
            },
          }
        : fail("denied");
    }
    if (
      request.method !== "launcher.app.save" &&
      request.method !== "launcher.app.remove" &&
      request.method !== "launcher.app.favorite"
    )
      return;
    if (conflictOnce && request.method === "launcher.app.save") {
      conflictOnce = false;
      if (scene === "launcher-aplicaciones-args-conflicto") {
        customized.add("obs");
        customProfiles.set("obs", 2);
      }
      bump();
    }
    if (request.baseRevision !== view.revision)
      return {
        kind: "failure",
        id,
        error: { kind: "launcherConflict", current: structuredClone(view) },
      };
    if (request.method === "launcher.app.remove") {
      const app = catalog.apps.find((app) => app.id === request.id);
      if (
        !app?.removable ||
        view.profiles.some((profile) => profile.apps.includes(request.id))
      )
        return fail("denied");
      catalog.apps = catalog.apps.filter((app) => app.id !== request.id);
      view.apps = view.apps.filter((app) => app.id !== request.id);
      drafts.delete(request.id);
    } else if (request.method === "launcher.app.favorite") {
      const app = catalog.apps.find((app) => app.id === request.id),
        draft = drafts.get(request.id);
      if (!app || !draft) return fail("denied");
      app.favorite = request.favorite;
      draft.favorite = request.favorite;
    } else {
      const draft = request.draft;
      if (
        !draft.name.trim() ||
        (request.pickToken !== null &&
          (request.pickToken !== selection?.token ||
            selectionTarget !== draft.id))
      )
        return fail("denied");
      const existing =
        draft.id === null
          ? undefined
          : catalog.apps.find((app) => app.id === draft.id);
      if (
        draft.useDiscovery &&
        (!existing || existing.removable || request.pickToken !== null)
      )
        return fail("denied");
      if (draft.id !== null && !existing) return fail("denied");
      if (
        draft.id === null &&
        (!selection ||
          request.pickToken === null ||
          catalog.apps.length >= launcherLimits.apps)
      )
        return fail("denied");
      const appId = draft.id ?? `custom:qa-${++serial}`;
      if (request.pickToken !== null) {
        customized.delete(appId);
        customProfiles.delete(appId);
      }
      drafts.set(appId, { ...structuredClone(draft), id: appId });
      if (existing) {
        existing.name = draft.name;
        existing.favorite = draft.favorite;
      } else
        catalog.apps.push({
          id: appId,
          name: draft.name,
          category: "Manual",
          steam: false,
          favorite: draft.favorite,
          removable: true,
          found: true,
          installed: true,
        });
      const projected = view.apps.find((app) => app.id === appId);
      if (projected) projected.name = draft.name;
      else view.apps.push({ id: appId, name: draft.name, available: true });
      if (request.pickToken !== null) selection = null;
    }
    bump();
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(view) },
    };
  };
}
