import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CoreStatus,
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/contract";
import type {
  PreviewImage,
  PreviewTarget,
} from "../../../contract/generated/preview";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { useOptionalStudio } from "../../screens/studio/state";
import { decodePhoto, previewAuthority } from "./previewPhoto";

export type PhotoStatus =
  | "preparing"
  | "photo"
  | "noDemo"
  | "unavailable"
  | "graphicsDisabled"
  | "gpuUnavailable"
  | "captureFailed"
  | "timeout"
  | "tooLarge"
  | "busy"
  | "denied"
  | "studioConflict"
  | "invalidInput";
type Photo = {
  status: PhotoStatus;
  image?: Pick<PreviewImage, "width" | "height">;
  src?: string;
  retrying?: boolean;
  frame?: number;
  key: string;
};

// preview_settings() passes only kind and settings to Rune; the CLI creates a
// fresh instance with default placement/visibility and derives its natural size.
export function previewFingerprint(
  item: Pick<OverlayInstance, "kind" | "settings">,
) {
  return JSON.stringify(
    { kind: item.kind, settings: item.settings },
    (_key, value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, (value as Record<string, unknown>)[key]]),
          )
        : value,
  );
}

// The host has no cancellation command. A superseded request must finish before
// the latest selection can be sent; its pixels and announcements are discarded.
export type SceneTarget = Extract<PreviewTarget, { kind: "scene" }>;
export function usePreviewPhoto(
  source: OverlayInstance | SceneTarget | undefined,
  view?: StudioView,
  sceneEnabled = true,
) {
  const scene = source?.kind === "scene" ? source : undefined;
  const item = source?.kind === "scene" ? undefined : source;
  const isScene = !!scene;
  const isInstance = !!item;
  const { client, issue } = useHost();
  const cache = useQueryClient();
  // Workshop leaves StudioProvider unmounted, so execute can be undefined.
  const execute = useOptionalStudio()?.execute;
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [photo, setPhoto] = useState<Photo>({ status: "preparing", key: "" });
  const [regeneration, regenerate] = useState(0);
  const alive = useRef(false);
  const active = useRef(false);
  const [sceneInFlight, setSceneInFlight] = useState(false);
  const serial = useRef(0);
  const desired = useRef<(() => Promise<void>) | undefined>(undefined);
  const previous = useRef<
    | {
        id: string;
        key: string;
        account: string | null;
        client: typeof client;
        regeneration: number;
      }
    | undefined
  >(undefined);
  const accountChanged = useRef(false);
  const reconciling = useRef(false);
  const id =
    item?.id ?? (scene && JSON.stringify([scene.widget, scene.sceneId]));
  const fingerprint = item ? previewFingerprint(item) : scene?.frame;
  const key = `${core.accountGeneration}:${id}:${fingerprint}:demo:1`;
  const target = useRef<PreviewTarget | undefined>(undefined);
  target.current =
    scene ??
    (item &&
      view && {
        kind: "instance",
        id: item.id,
        baseRevision: view.revision,
      });
  const currentKey = useRef(key);
  currentKey.current = key;
  const allowed =
    !!client &&
    !issue &&
    previewAuthority(core, core.accountGeneration) &&
    (scene
      ? sceneEnabled && core.access.tester
      : !!item && !item.locked && view?.state === "ready");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      serial.current++;
      desired.current = undefined;
    };
  }, []);

  useEffect(() => {
    const last = previous.current;
    const changed =
      !last ||
      last.key !== key ||
      last.client !== client ||
      last.regeneration !== regeneration;
    if (
      !isScene &&
      last &&
      (last.account !== core.accountGeneration || last.client !== client)
    )
      accountChanged.current = true;
    if (last && last.id !== id) accountChanged.current = false;
    if (!allowed || !id || accountChanged.current) {
      if (!isInstance && last) last.key = "";
      serial.current++;
      desired.current = undefined;
      setPhoto({ status: "denied", key: isScene ? "" : key });
      return;
    }
    previous.current = {
      id,
      key,
      account: core.accountGeneration,
      client,
      regeneration,
    };
    if (!changed) return;
    if (reconciling.current && last?.id === id) {
      setPhoto({ status: "studioConflict", key });
      return;
    }
    const token = ++serial.current;
    setPhoto((previousPhoto) => ({
      status: "preparing",
      key,
      retrying: !!last && last.regeneration !== regeneration,
      ...(isScene && last?.id === id && last.account === core.accountGeneration
        ? {
            src: previousPhoto.src,
            image: previousPhoto.image,
            frame: previousPhoto.frame,
          }
        : {}),
    }));
    const valid = () => {
      // Query observers notify React asynchronously; authority may already have
      // changed in the cache before the component gets its next render.
      const authority = cache.getQueryData<CoreStatus>(coreKey);
      return (
        alive.current &&
        serial.current === token &&
        currentKey.current === key &&
        previewAuthority(authority, core.accountGeneration) &&
        (!isScene || authority?.access.tester)
      );
    };
    const run = async () => {
      if (!valid()) return;
      active.current = true;
      if (isScene) setSceneInFlight(true);
      try {
        const requested = target.current;
        if (!requested) return;
        const reply = await client.request({
          method: "preview.render",
          target: requested,
          scene: "demo",
          scale: "1",
        });
        if (!valid()) return;
        const decoded = await decodePhoto(reply);
        if (!decoded) {
          if (valid()) setPhoto({ status: "invalidInput", key });
          return;
        }
        if (valid())
          setPhoto({
            status: "photo",
            image: { width: decoded.width, height: decoded.height },
            src: decoded.src,
            frame: requested.kind === "scene" ? requested.frame : undefined,
            key,
          });
      } catch (error) {
        if (!valid()) return;
        const detail = error instanceof HostFailure ? error.detail : undefined;
        const status: PhotoStatus =
          detail?.kind === "previewFailed"
            ? detail.reason
            : detail?.kind === "busy"
              ? "busy"
              : detail?.kind === "studioConflict"
                ? "studioConflict"
                : detail?.kind === "denied" ||
                    (!isScene && detail?.kind === "protected")
                  ? "denied"
                  : "unavailable";
        setPhoto({ status, key });
        if (status === "studioConflict" && execute && !isScene) {
          reconciling.current = true;
          const current = await execute({ method: "studio.get" });
          const refreshed = current?.instances.find(
            (instance) => instance.id === id,
          );
          if (
            alive.current &&
            serial.current === token &&
            previous.current?.id === id &&
            refreshed
          ) {
            const refreshedKey = `${core.accountGeneration}:${id}:${previewFingerprint(refreshed)}:demo:1`;
            previous.current.key = refreshedKey;
            setPhoto({ status: "studioConflict", key: refreshedKey });
          }
          reconciling.current = false;
        }
      } finally {
        active.current = false;
        if (isScene && alive.current) setSceneInFlight(false);
        const next = desired.current;
        desired.current = undefined;
        if (alive.current && next) void next();
      }
    };
    if (active.current) desired.current = run;
    else void run();
  }, [
    allowed,
    client,
    core.accountGeneration,
    id,
    isInstance,
    isScene,
    regeneration,
    key,
    execute,
    cache,
  ]);

  return {
    sceneInFlight,
    ...(photo.key === key && allowed && !accountChanged.current
      ? photo
      : {
          status:
            !allowed ||
            accountChanged.current ||
            (!isScene &&
              previous.current &&
              previous.current.account !== core.accountGeneration)
              ? ("denied" as const)
              : ("preparing" as const),
          key,
        }),
    regenerate: () => {
      if (!active.current && allowed) regenerate((n) => n + 1);
    },
  };
}
