import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CanvasView,
  CoreStatus,
  HomeLayoutView,
  StudioView,
} from "../../../contract/generated/contract";
import { coreKey, homePhotosKey, offline, useHost } from "../../app/Host";
import {
  decodePhoto,
  type PreviewPhoto,
  previewAuthority,
} from "../studio/previewPhoto";
import { previewFingerprint } from "../studio/usePreviewPhoto";

type RetainedPhotos = {
  visit: symbol;
  key: string;
  photos: Map<string, PreviewPhoto>;
};
type Snapshot = StudioView & { canvas: CanvasView };
export type HomePhotos = {
  snapshot: Snapshot;
  photos: Map<string, PreviewPhoto>;
};
const maxPhotos = 8;

export function useHomePhotos(
  layout: HomeLayoutView | undefined,
): HomePhotos | undefined {
  const { client, issue } = useHost();
  const cache = useQueryClient();
  const { data: core = offline } = useQuery<CoreStatus>({
    queryKey: coreKey,
    queryFn: skipToken,
  });
  const account = core.accountGeneration;
  const allowed = !!client && !issue && previewAuthority(core, account);
  const count = layout?.state === "ready" ? layout.widgets.length : 0;
  const eligible = count > 0 && count <= maxPhotos;
  const hasLayout = layout !== undefined;
  const started = useRef(false);
  const [complete, setComplete] = useState<{
    key: string;
    snapshot: Snapshot;
  }>();

  useEffect(() => {
    if (!eligible) {
      if (hasLayout)
        cache.removeQueries({ queryKey: homePhotosKey, exact: true });
      return;
    }
    if (!allowed || !client || started.current) return;
    started.current = true;
    // The only retained set lives with the renderer's existing QueryClient.
    // An empty slot also lets the existing core handler revoke in-flight work.
    cache.setQueryDefaults(homePhotosKey, { gcTime: Infinity });
    const visit = Symbol();
    cache.setQueryData<RetainedPhotos>(homePhotosKey, (prior) => ({
      key: prior?.key ?? "",
      photos: prior?.photos ?? new Map(),
      visit,
    }));
    let active = true;
    const staged = new Map<string, PreviewPhoto>();
    const valid = () =>
      active &&
      cache.getQueryData<RetainedPhotos>(homePhotosKey)?.visit === visit &&
      previewAuthority(cache.getQueryData<CoreStatus>(coreKey), account);

    void (async () => {
      try {
        const reply = await client.request({ method: "studio.get" });
        if (!valid() || reply.method !== "studio.get") return;
        const value = reply.value;
        if (
          value.state !== "ready" ||
          !value.canvas ||
          value.instances.length !== count
        ) {
          cache.removeQueries({ queryKey: homePhotosKey, exact: true });
          return;
        }
        const snapshot = { ...value, canvas: value.canvas };
        const key = JSON.stringify([
          account,
          snapshot.instances.map((item) => [item.id, previewFingerprint(item)]),
        ]);
        if (cache.getQueryData<RetainedPhotos>(homePhotosKey)?.key === key) {
          setComplete({ key, snapshot });
          return;
        }
        cache.setQueryData<RetainedPhotos>(homePhotosKey, {
          key: "",
          photos: new Map(),
          visit,
        });
        for (const item of snapshot.instances) {
          if (!valid()) return;
          const response = await client.request({
            method: "preview.render",
            target: {
              kind: "instance",
              id: item.id,
              baseRevision: snapshot.revision,
            },
            scene: "demo",
            scale: "1",
          });
          if (!valid()) return;
          const photo = await decodePhoto(response);
          if (!photo || !valid()) return;
          staged.set(item.id, photo);
        }
        cache.setQueryData<RetainedPhotos>(homePhotosKey, {
          key,
          photos: new Map(staged),
          visit,
        });
        setComplete({ key, snapshot });
      } catch {
        // All-or-nothing: every failure leaves the drawing until the next visit.
      } finally {
        staged.clear();
      }
    })();
    return () => {
      active = false;
      staged.clear();
    };
  }, [account, allowed, cache, client, count, eligible, hasLayout]);

  if (!allowed || !eligible || complete?.snapshot.instances.length !== count)
    return;
  const retained = cache.getQueryData<RetainedPhotos>(homePhotosKey);
  if (retained?.key === complete.key)
    return { snapshot: complete.snapshot, photos: retained.photos };
}
