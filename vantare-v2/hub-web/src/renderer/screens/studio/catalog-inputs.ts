import {
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type StudioRequest,
  type StudioView,
  studioGeometryLimits,
  type WidgetKind,
} from "../../../contract/generated/studio";
import { studioDropText as t } from "../../i18n/studio-drop";
import {
  beginCatalogDrop,
  type CatalogPreview,
  catalogDropController,
  type DropSurface,
} from "./catalog-drop";
import { useStudio } from "./state";

type Held = {
  id: number;
  kind: WidgetKind;
  node: HTMLElement;
  x: number;
  y: number;
  surface: DropSurface;
  moved: boolean;
};
export type DropVisual = {
  kind: WidgetKind;
  pointer: readonly [number, number];
  surface: DropSurface;
  preview: CatalogPreview | null;
};

/** Pointer capture belongs to the mounted catalogue handle; no HTML drag payload. */
export function useCatalogInputs(
  view: StudioView,
  enabled: boolean,
  plane: RefObject<HTMLDivElement | null>,
  viewport: RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  const studio = useStudio();
  const controller = useRef(catalogDropController());
  const held = useRef<Held | undefined>(undefined),
    clickSource = useRef<HTMLElement | undefined>(undefined),
    alive = useRef(true),
    sending = useRef(false),
    suppressClick = useRef(false);
  const [visual, setVisual] = useState<DropVisual>(),
    [message, setMessage] = useState("");
  const latest = useRef({ view, enabled, studio, close });
  latest.current = { view, enabled, studio, close };
  const access = () => ({
    enabled: latest.current.enabled,
    pending: latest.current.studio.pending || sending.current,
  });
  const clear = useCallback((announce = false) => {
    const value = held.current;
    held.current = undefined;
    controller.current.cancel();
    if (value) {
      try {
        if (value.node.hasPointerCapture(value.id))
          value.node.releasePointerCapture(value.id);
      } catch {
        /* The handle can disappear during a permission change. */
      }
    }
    if (alive.current) {
      setVisual(undefined);
      if (announce) setMessage(t.cancel);
    }
  }, []);
  useLayoutEffect(() => {
    if (
      held.current &&
      !beginCatalogDrop(view, held.current.kind, {
        enabled,
        pending: studio.pending || sending.current,
      })
    ) {
      suppressClick.current = true;
      clear(true);
    }
  }, [view, enabled, studio.pending, clear]);
  useEffect(() => {
    alive.current = true;
    const cancel = () => {
      if (held.current) suppressClick.current = true;
      clear(!!held.current?.moved);
    };
    const key = (event: KeyboardEvent) => {
      if (held.current && event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick.current = true;
        clear(true);
      }
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("scroll", cancel, true);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      alive.current = false;
      clear();
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("scroll", cancel, true);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [clear]);
  const surface = (): DropSurface | null => {
    const rect = plane.current?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
      : null;
  };
  const preview = (value: Held, x: number, y: number) => {
    const measured = surface();
    if (
      !measured ||
      Object.keys(measured).some(
        (key) =>
          Math.abs(
            measured[key as keyof DropSurface] -
              value.surface[key as keyof DropSurface],
          ) > studioGeometryLimits.epsilon,
      )
    ) {
      suppressClick.current = true;
      clear(true);
      return null;
    }
    const rect = viewport.current?.getBoundingClientRect();
    const hit = document.elementFromPoint(x, y);
    // A point over a toolbar, catalogue, window edge or clipped plane is outside.
    if (
      !rect ||
      x < rect.left ||
      y < rect.top ||
      x >= rect.right ||
      y >= rect.bottom ||
      !hit ||
      !viewport.current?.contains(hit)
    )
      return null;
    return controller.current.preview(
      latest.current.view,
      [x, y],
      measured,
      access(),
    );
  };
  const send = async (
    request: Extract<StudioRequest, { method: "studio.add" }>,
  ) => {
    if (sending.current) return;
    sending.current = true;
    try {
      const value = await latest.current.studio.execute(request);
      if (value && alive.current) {
        setMessage("");
        latest.current.close();
      } else if (alive.current) setMessage("");
    } finally {
      sending.current = false;
    }
  };
  const cancel = useCallback(() => {
    if (held.current) suppressClick.current = true;
    clear(!!held.current?.moved);
  }, [clear]);
  return {
    visual,
    message,
    cancel,
    pointerDown(event: PointerEvent<HTMLElement>, kind: WidgetKind) {
      if (event.button !== 0 || !event.isPrimary || held.current) return;
      suppressClick.current = false;
      const measured = surface();
      if (
        !measured ||
        !controller.current.begin(latest.current.view, kind, access())
      )
        return;
      const value = {
        id: event.pointerId,
        kind,
        node: event.currentTarget,
        x: event.clientX,
        y: event.clientY,
        surface: measured,
        moved: false,
      };
      held.current = value;
      clickSource.current = event.currentTarget;
      setMessage("");
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        suppressClick.current = true;
        clear(true);
      }
    },
    pointerMove(event: PointerEvent<HTMLElement>) {
      const value = held.current;
      if (!value || value.id !== event.pointerId) return;
      if (
        !value.moved &&
        Math.hypot(event.clientX - value.x, event.clientY - value.y) < 4
      )
        return;
      value.moved = true;
      suppressClick.current = true;
      event.preventDefault();
      const result = preview(value, event.clientX, event.clientY);
      if (held.current === value) {
        setVisual({
          kind: value.kind,
          pointer: [event.clientX, event.clientY],
          surface: value.surface,
          preview: result,
        });
        setMessage(
          result
            ? `${result.guides.some((guide) => guide !== null) ? `${t.snapped} · ` : ""}${t.release}`
            : t.outside,
        );
      }
    },
    pointerUp(event: PointerEvent<HTMLElement>) {
      const value = held.current;
      if (!value || value.id !== event.pointerId) return;
      const result = value.moved
        ? preview(value, event.clientX, event.clientY)
        : null;
      const request =
        result && held.current === value
          ? controller.current.release(
              latest.current.view,
              [event.clientX, event.clientY],
              value.surface,
              access(),
            )
          : null;
      if (value.moved) {
        suppressClick.current = true;
        event.preventDefault();
      }
      clear(value.moved && !request);
      if (request) void send(request);
    },
    pointerLost(event: PointerEvent<HTMLElement>) {
      if (held.current?.id === event.pointerId) {
        suppressClick.current = true;
        clear(true);
      }
    },
    click(event: MouseEvent<HTMLElement>, kind: WidgetKind) {
      if (held.current) return;
      if (
        event.detail > 1 ||
        (event.detail > 0 &&
          suppressClick.current &&
          event.currentTarget === clickSource.current)
      )
        return;
      if (!beginCatalogDrop(latest.current.view, kind, access())) return;
      void send({
        method: "studio.add",
        kind,
        baseRevision: latest.current.view.revision,
      });
    },
  };
}
