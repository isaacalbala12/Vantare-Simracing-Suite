import { createContext, useContext } from 'react';
import type { TelemetryActivityGate } from '../../../overlay/runtime/telemetry-activity-gate';

export type MutableOrbitActivityGate = TelemetryActivityGate & {
  setActive(active: boolean): void;
};

const alwaysActiveGate: TelemetryActivityGate = {
  getActive: () => true,
  subscribe: () => () => undefined,
};

export const OrbitKeepAliveActivityContext =
  createContext<TelemetryActivityGate>(alwaysActiveGate);

export function createOrbitActivityGate(initialActive: boolean): MutableOrbitActivityGate {
  let active = initialActive;
  const listeners = new Set<(active: boolean) => void>();
  return {
    getActive: () => active,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActive(nextActive) {
      if (nextActive === active) return;
      active = nextActive;
      for (const listener of listeners) listener(active);
    },
  };
}

export function useOrbitKeepAliveActivity(): TelemetryActivityGate {
  return useContext(OrbitKeepAliveActivityContext);
}
