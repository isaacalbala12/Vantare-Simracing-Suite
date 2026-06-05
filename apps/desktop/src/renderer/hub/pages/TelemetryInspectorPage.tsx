import { useEffect, useRef, useState, useCallback } from 'react';
import type { Telemetry } from '@vantare/sim-core';
import { TelemetryInspector } from '../components/TelemetryInspector';

// Rate-limit interval: 62ms ≈ 16Hz
const RATE_LIMIT_MS = 62;

export default function TelemetryInspectorPage() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const lastUpdateRef = useRef(0);
  const rafIdRef = useRef(0);
  const latestDataRef = useRef<Telemetry | null>(null);

  // Throttled update: schedule at most one rAF update per RATE_LIMIT_MS
  const scheduleUpdate = useCallback((telem: Telemetry) => {
    latestDataRef.current = telem;
    const now = performance.now();

    if (rafIdRef.current !== 0) return; // Update already scheduled

    const delay = Math.max(0, RATE_LIMIT_MS - (now - lastUpdateRef.current));

    rafIdRef.current = window.setTimeout(() => {
      rafIdRef.current = 0;
      lastUpdateRef.current = performance.now();
      setData(latestDataRef.current);
    }, delay);
  }, []);

  useEffect(() => {
    // Initial load
    window.vantare.getInspectorData().then((telem) => {
      if (telem) {
        latestDataRef.current = telem;
        setData(telem);
        setConnected(true);
      }
    }).catch(() => {
      // Bridge not available — keep null
    });

    // Live updates
    const unsub = window.vantare.onInspectorData((telem) => {
      setConnected(true);
      scheduleUpdate(telem);
    });

    return () => {
      unsub();
      if (rafIdRef.current !== 0) {
        clearTimeout(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [scheduleUpdate]);

  return (
    <div className="p-6 h-full flex flex-col" data-testid="telemetry-inspector-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
        <div>
          <h1 className="text-lg font-semibold text-white/90">Telemetry Inspector</h1>
          <p className="text-sm text-white/50 mt-0.5">
            Real-time telemetry data from the active simulator
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected && data?.isConnected
                  ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse'
                  : 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]'
              }`}
            />
            <span className="text-xs text-white/40 font-mono">
              {data?.isConnected ? (data.sim ?? 'Connected') : 'Disconnected'}
            </span>
          </div>
          {/* Sim name badge */}
          {data && (
            <span className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded">
              @ {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '—'}
            </span>
          )}
        </div>
      </div>

      {/* Inspector content */}
      <div className="flex-1 overflow-auto">
        <TelemetryInspector data={data} />
      </div>
    </div>
  );
}
