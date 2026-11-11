import { useEffect, useState } from "react";
import type { CalendarRun } from "./CalendarRun";

declare const __VANTARE_RENDERER_MOCK__: boolean;
// The frozen GPUI has no production run reader. Its capture bank alone seeds runs.
// Use the existing build gate so release cannot load the public capture fixture.
export function useCalendarQARuns(enabled: boolean) {
  const [runs, setRuns] = useState<readonly CalendarRun[]>([]);
  useEffect(() => {
    let active = true;
    setRuns([]);
    if (
      typeof __VANTARE_RENDERER_MOCK__ === "boolean" &&
      __VANTARE_RENDERER_MOCK__ &&
      enabled
    )
      void import("../../../mock/calendar-runs").then((fixture) => {
        if (active) setRuns(fixture.calendarRuns);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return runs;
}
