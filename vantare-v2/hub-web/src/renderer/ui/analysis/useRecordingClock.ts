import { useEffect, useState } from "react";
export function useRecordingClock(clock: () => number) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const value = clock();
      setNow(value);
      const midnight = new Date(value);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(update, midnight.getTime() - value);
    };
    update();
    return () => clearTimeout(timer);
  }, [clock]);
  return now;
}
