import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CoreStatus,
  WidgetInfo,
  WidgetKind,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import {
  decodePhoto,
  type PreviewPhoto,
  previewAuthority,
} from "./previewPhoto";

/** One sequential queue per opening. An attempted kind is never retried here. */
export function useCatalogPhotos(
  open: boolean,
  widgets: readonly WidgetInfo[],
) {
  const { client, issue } = useHost();
  const cache = useQueryClient();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [body, bodyRef] = useState<HTMLDivElement | null>(null);
  const [photos, setPhotos] = useState(new Map<WidgetKind, PreviewPhoto>());
  const [pending, setPending] = useState<WidgetKind>();
  const active = useRef(false);
  const advance = useRef<() => void>(() => {});
  const current = useRef({
    open,
    client,
    issue,
    account: core.accountGeneration,
  });
  current.current = { open, client, issue, account: core.accountGeneration };
  const order = widgets
    .filter((widget) => widget.allowed)
    .map((widget) => widget.kind)
    .join(",");
  const authority = previewAuthority(core, core.accountGeneration);
  const invalidated = useRef(false);
  const session = useRef<
    | {
        requested: Set<WidgetKind>;
        photos: Map<WidgetKind, PreviewPhoto>;
        candidates: WidgetKind[];
        account: string | null;
        client: typeof client;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const account = core.accountGeneration;
    session.current?.photos.clear();
    setPhotos(new Map());
    setPending(undefined);
    if (!open) invalidated.current = false;
    else if (
      session.current &&
      (!authority ||
        issue ||
        session.current.account !== account ||
        session.current.client !== client)
    )
      invalidated.current = true;
    if (!open || !client || issue || !authority || invalidated.current) {
      session.current = undefined;
      return;
    }
    const state = {
      requested: new Set<WidgetKind>(),
      photos: new Map<WidgetKind, PreviewPhoto>(),
      candidates: [] as WidgetKind[],
      account,
      client,
    };
    session.current = state;
  }, [open, client, issue, authority, core.accountGeneration]);

  useEffect(
    () => () => {
      session.current?.photos.clear();
      session.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const state = session.current;
    if (!body || !open || !client || issue || !authority || !state) return;
    let disposed = false;
    let scrolling = false;
    const account = core.accountGeneration;
    const allowed = new Set(order.split(","));
    const cards = Array.from(
      body.querySelectorAll<HTMLElement>("[data-kind]"),
    ).filter((card) => allowed.has(card.dataset.kind ?? ""));
    const visible = new Set<Element>();
    state.candidates = [];
    const valid = () =>
      session.current === state &&
      current.current.open &&
      current.current.client === client &&
      !current.current.issue &&
      current.current.account === account &&
      previewAuthority(cache.getQueryData<CoreStatus>(coreKey), account);
    const pump = () => {
      if (disposed || !valid() || scrolling || active.current) return;
      const kind = state.candidates.find((kind) => !state.requested.has(kind));
      if (!kind) return;
      state.requested.add(kind);
      active.current = true;
      setPending(kind);
      void (async () => {
        try {
          const reply = await client.request({
            method: "preview.render",
            target: { kind: "catalog", widget: kind },
            scene: "demo",
            scale: "1",
          });
          if (!valid() || !state.candidates.includes(kind)) return;
          const photo = await decodePhoto(reply);
          if (photo && valid() && state.candidates.includes(kind)) {
            state.photos.set(kind, photo);
            setPhotos(new Map(state.photos));
          }
        } catch {
          /* A failed attempt keeps its drawing until the next opening. */
        } finally {
          active.current = false;
          if (valid()) setPending(undefined);
          advance.current();
        }
      })();
    };
    advance.current = pump;
    const settle = () => {
      if (disposed || !valid() || scrolling) return;
      state.candidates = cards
        .filter((card) => visible.has(card))
        .map((card) => card.dataset.kind as WidgetKind);
      const last = cards.findLastIndex((card) => visible.has(card));
      // The cap is always visible+1: never walk past the card after the last
      // visible one, even when it was already requested.
      if (last >= 0 && cards[last + 1])
        state.candidates.push(cards[last + 1].dataset.kind as WidgetKind);
      for (const kind of state.photos.keys())
        if (!state.candidates.includes(kind)) state.photos.delete(kind);
      setPhotos(new Map(state.photos));
      pump();
    };
    // Filter changes release removed cards before the observer's first delivery.
    for (const kind of state.photos.keys())
      if (!allowed.has(kind)) state.photos.delete(kind);
    setPhotos(new Map(state.photos));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0)
            visible.add(entry.target);
          else visible.delete(entry.target);
        }
        settle();
      },
      { root: body, threshold: 0 },
    );
    for (const card of cards) observer.observe(card);
    const scroll = () => {
      scrolling = true;
    };
    const scrollend = () => {
      scrolling = false;
      settle();
    };
    body.addEventListener("scroll", scroll);
    body.addEventListener("scrollend", scrollend);
    return () => {
      disposed = true;
      observer.disconnect();
      body.removeEventListener("scroll", scroll);
      body.removeEventListener("scrollend", scrollend);
      if (advance.current === pump) advance.current = () => {};
    };
  }, [
    body,
    open,
    client,
    issue,
    authority,
    core.accountGeneration,
    order,
    cache,
  ]);

  return {
    bodyRef,
    photos:
      open &&
      authority &&
      !issue &&
      session.current?.account === core.accountGeneration &&
      session.current?.client === client
        ? photos
        : new Map<WidgetKind, PreviewPhoto>(),
    pending:
      open &&
      authority &&
      !issue &&
      session.current?.account === core.accountGeneration &&
      session.current?.client === client
        ? pending
        : undefined,
  };
}
