import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CoreStatus,
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/contract";
import type { PreviewImage } from "../../../contract/generated/preview";
import { isReply } from "../../../contract/modules/preview";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { useStudio } from "../../screens/studio/state";

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
export function usePreviewPhoto(item: OverlayInstance, view: StudioView) {
  const { client, issue } = useHost();
  const cache = useQueryClient();
  const { execute } = useStudio();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [photo, setPhoto] = useState<Photo>({ status: "preparing", key: "" });
  const [regeneration, regenerate] = useState(0);
  const alive = useRef(false);
  const active = useRef(false);
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
  const key = `${core.accountGeneration}:${item.id}:${previewFingerprint(item)}:demo:1`;
  const revision = useRef(view.revision);
  revision.current = view.revision;
  const currentKey = useRef(key);
  currentKey.current = key;
  const allowed =
    !!client &&
    !issue &&
    !core.live &&
    !!core.accountGeneration &&
    core.rights === "connected" &&
    core.access.verified &&
    !core.access.blocked &&
    !item.locked &&
    view.state === "ready";

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
      last &&
      (last.account !== core.accountGeneration || last.client !== client)
    )
      accountChanged.current = true;
    if (last && last.id !== item.id) accountChanged.current = false;
    if (!allowed || accountChanged.current) {
      serial.current++;
      desired.current = undefined;
      setPhoto({ status: "denied", key });
      return;
    }
    previous.current = {
      id: item.id,
      key,
      account: core.accountGeneration,
      client,
      regeneration,
    };
    if (!changed) return;
    if (reconciling.current && last?.id === item.id) {
      setPhoto({ status: "studioConflict", key });
      return;
    }
    const token = ++serial.current;
    setPhoto({
      status: "preparing",
      key,
      retrying: !!last && last.regeneration !== regeneration,
    });
    const valid = () => {
      // Query observers notify React asynchronously; authority may already have
      // changed in the cache before the component gets its next render.
      const authority = cache.getQueryData<CoreStatus>(coreKey);
      return (
        alive.current &&
        serial.current === token &&
        currentKey.current === key &&
        authority?.accountGeneration === core.accountGeneration &&
        !authority?.live &&
        authority?.rights === "connected" &&
        authority.access.verified &&
        !authority.access.blocked
      );
    };
    const run = async () => {
      if (!valid()) return;
      active.current = true;
      try {
        const reply = await client.request({
          method: "preview.render",
          target: {
            kind: "instance",
            id: item.id,
            baseRevision: revision.current,
          },
          scene: "demo",
          scale: "1",
        });
        if (!valid()) return;
        if (reply.method !== "preview.render" || !isReply(reply)) {
          setPhoto({ status: "invalidInput", key });
          return;
        }
        const src = `data:image/png;base64,${reply.value.pngBase64}`;
        const image = new Image();
        image.src = src;
        try {
          await image.decode();
        } catch {
          if (valid()) setPhoto({ status: "invalidInput", key });
          return;
        }
        if (valid())
          setPhoto({
            status: "photo",
            image: { width: reply.value.width, height: reply.value.height },
            src,
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
                : detail?.kind === "denied" || detail?.kind === "protected"
                  ? "denied"
                  : "unavailable";
        setPhoto({ status, key });
        if (status === "studioConflict") {
          reconciling.current = true;
          const current = await execute({ method: "studio.get" });
          const refreshed = current?.instances.find(
            (instance) => instance.id === item.id,
          );
          if (
            alive.current &&
            serial.current === token &&
            previous.current?.id === item.id &&
            refreshed
          ) {
            const refreshedKey = `${core.accountGeneration}:${item.id}:${previewFingerprint(refreshed)}:demo:1`;
            previous.current.key = refreshedKey;
            setPhoto({ status: "studioConflict", key: refreshedKey });
          }
          reconciling.current = false;
        }
      } finally {
        active.current = false;
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
    item.id,
    regeneration,
    key,
    execute,
    cache,
  ]);

  return {
    ...(photo.key === key && allowed && !accountChanged.current
      ? photo
      : {
          status:
            !allowed ||
            accountChanged.current ||
            (previous.current &&
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
