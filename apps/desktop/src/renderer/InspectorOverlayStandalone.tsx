import { useEffect, useRef, useState } from 'react';
import type { Telemetry } from '@vantare/sim-core';
import { TelemetryInspector } from './hub/components/TelemetryInspector';

/**
 * Standalone overlay wrapper for the TelemetryInspector.
 * Used when loading the renderer with `?overlay=inspector` in a
 * transparent, frameless Electron window.
 *
 * Connects directly to the IPC bridge for live telemetry updates,
 * rate-limited to 16Hz display updates.
 */
export default function InspectorOverlayStandalone() {
  const [data, setData] = useState<Telemetry | null>(null);
  const lastUpdateRef = useRef(0);
  const rafIdRef = useRef(0);
  const latestDataRef = useRef<Telemetry | null>(null);

  // Throttled update: at most 1 update per 62ms (~16Hz)
  useEffect(() => {
    // Initial load
    window.vantare.getInspectorData().then((telem) => {
      if (telem) {
        latestDataRef.current = telem;
        setData(telem);
      }
    }).catch(() => {
      // Bridge not available
    });

    // Live updates with rate limiting
    const unsub = window.vantare.onInspectorData((telem) => {
      latestDataRef.current = telem;
      const now = performance.now();

      if (rafIdRef.current !== 0) return;

      const delay = Math.max(0, 62 - (now - lastUpdateRef.current));

      rafIdRef.current = window.setTimeout(() => {
        rafIdRef.current = 0;
        lastUpdateRef.current = performance.now();
        setData(latestDataRef.current);
      }, delay);
    });

    return () => {
      unsub();
      if (rafIdRef.current !== 0) {
        clearTimeout(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      {/* Title bar */}
      <div className="absolute top-0 left-0 right-0 h-6 flex items-center px-2 bg-[#0a0a0a]/80 select-none">
        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
          Telemetry Inspector
        </span>
        {data?.isConnected && (
          <span className="ml-auto text-[9px] font-mono text-white/20">
            {data.sim} @ {new Date(data.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Inspector content - compact mode */}
      <div className="absolute top-6 left-0 right-0 bottom-0 overflow-auto">
        <TelemetryInspector data={data} compact />
      </div>
    </div>
  );
}
