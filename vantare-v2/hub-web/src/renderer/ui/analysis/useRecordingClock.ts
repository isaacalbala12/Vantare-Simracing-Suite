import { useEffect, useState } from "react";
import { nextRecordingDay, recordingZone } from "../../app/analysis-dates";
export function useRecordingClock(
  clock: () => number,
  timeZone = recordingZone(),
) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const value = clock();
      setNow(value);
      timer = setTimeout(update, nextRecordingDay(value, timeZone) - value);
    };
    update();
    return () => clearTimeout(timer);
  }, [clock, timeZone]);
  return now;
}
