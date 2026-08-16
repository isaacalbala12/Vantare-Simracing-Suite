import { useEffect, useRef, type RefObject } from "react";
import type { TrackMapMarker } from "../../../widget-types/track-map/track-map-view-model";
import { advanceMarkers, type MarkerPositions } from "./track-map-motion";

/**
 * Eases the car markers between published positions.
 *
 * Positions are written straight onto the circles each frame rather than held
 * in React state, following the imperative preview rule in
 * docs/overlays-studio/canvas-drag-imperative-preview.md: a component that
 * re-rendered sixty times a second to move a dot would cost far more than the
 * dot is worth.
 *
 * The rendered markup keeps the published positions, so a single render without
 * animation frames is still exactly the truth. Motion only ever fills the gaps
 * between samples.
 */
export function useTrackMapMotion(
  markers: readonly TrackMapMarker[],
  enabled: boolean,
  rootRef: RefObject<Element | null>,
): void {
  const markersRef = useRef(markers);
  const displayedRef = useRef<MarkerPositions>(new Map());

  // The animation loop reads the latest markers through a ref so that a new
  // frame of telemetry does not tear the loop down and build it again sixty
  // times a second. Refs belong to effects, not to render.
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    if (!enabled) {
      displayedRef.current = new Map();
      return;
    }

    let frame = 0;
    let previousTime: number | null = null;

    const step = (time: number) => {
      const elapsed = previousTime === null ? 0 : time - previousTime;
      previousTime = time;

      displayedRef.current = advanceMarkers(
        displayedRef.current,
        markersRef.current,
        elapsed,
      );

      const root = rootRef.current;
      if (root) {
        for (const [id, position] of displayedRef.current) {
          const node = root.querySelector(`[data-track-map-car="${CSS.escape(id)}"]`);
          if (node) {
            node.setAttribute("cx", String(position.x));
            node.setAttribute("cy", String(position.y));
          }
        }
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, rootRef]);
}
