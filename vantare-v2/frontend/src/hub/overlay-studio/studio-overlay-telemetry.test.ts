import { describe, expect, it, vi } from 'vitest';
import { createTelemetryRateCoordinator } from '../../overlay/core/telemetry-rate-coordinator';
import type { TelemetryAdapter } from '../../overlay/transports/telemetry-adapter';
import { createOverlayFrameV2Store } from '../../telemetry-transport/overlay-frame-v2-store';
import type { OverlayWailsPullClient } from '../../telemetry-transport/overlay-wails-pull';
import { createStudioOverlayTelemetryAdapter } from './studio-overlay-telemetry';

describe('Studio Overlay telemetry lifecycle', () => {
  it('starts one pull session after attaching V1 and V2 and restarts safely', () => {
    const order: string[] = [];
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    const coordinator = createTelemetryRateCoordinator();
    const legacy: TelemetryAdapter = {
      coordinator,
      start: vi.fn(() => order.push('v1:start')),
      stop: vi.fn(() => order.push('v1:stop')),
    };
    const pull: OverlayWailsPullClient = {
      source: {
        subscribe(name, listener) {
          order.push(`listen:${name}`);
          const current = listeners.get(name) ?? new Set();
          current.add(listener);
          listeners.set(name, current);
          return () => {
            order.push(`unlisten:${name}`);
            current.delete(listener);
          };
        },
      },
      start: vi.fn(() => order.push('pull:start')),
      stop: vi.fn(() => order.push('pull:stop')),
    };
    const store = createOverlayFrameV2Store();
    const adapter = createStudioOverlayTelemetryAdapter({ legacy, pull, overlayV2Store: store });

    adapter.start();
    adapter.start();
    expect(order).toEqual([
      'listen:telemetry:overlay-v2:status',
      'listen:telemetry:overlay-v2:snapshot',
      'v1:start',
      'pull:start',
    ]);

    for (const listener of listeners.get('telemetry:overlay-v2:status') ?? []) {
      listener({ revision: 50, source: { state: 'connecting' }, frame: null });
    }
    expect(store.getSnapshot().source?.state).toBe('connecting');
    expect(store.getSnapshot().revision).toBe(50);

    adapter.stop();
    adapter.stop();
    expect(pull.stop).toHaveBeenCalledTimes(1);
    expect(legacy.stop).toHaveBeenCalledTimes(1);
    expect(listeners.get('telemetry:overlay-v2:status')?.size).toBe(0);
    expect(listeners.get('telemetry:overlay-v2:snapshot')?.size).toBe(0);

    adapter.start();
    expect(pull.start).toHaveBeenCalledTimes(2);
    expect(legacy.start).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toEqual({ revision: 0, ageMs: 0 });
    for (const listener of listeners.get('telemetry:overlay-v2:status') ?? []) {
      listener({ revision: 2, source: { state: 'live' }, frame: null });
    }
    expect(store.getSnapshot().revision).toBe(2);
    expect(store.getSnapshot().source?.state).toBe('live');
    adapter.stop();
    store.dispose();
    coordinator.dispose();
  });

  it('rolls back all listeners when starting V1 fails', () => {
    const listeners = new Set<() => void>();
    const coordinator = createTelemetryRateCoordinator();
    const legacy: TelemetryAdapter = {
      coordinator,
      start: () => { throw new Error('v1 failed'); },
      stop: vi.fn(),
      getDiagnostics: () => ({ active: false, requestsCompleted: 0, receivedV1Projections: 0, receivedV2Snapshots: 0, requestDurationMs: { count: 0, sampleCount: 0, mean: 0, max: 0, p99: 0, histogram: [] } }),
    };
    const pull: OverlayWailsPullClient = {
      source: {
        subscribe() {
          const remove = vi.fn();
          listeners.add(remove);
          return remove;
        },
      },
      start: vi.fn(),
      stop: vi.fn(),
      getDiagnostics: () => ({ active: false, requestsCompleted: 0, receivedV1Projections: 0, receivedV2Snapshots: 0, requestDurationMs: { count: 0, sampleCount: 0, mean: 0, max: 0, p99: 0, histogram: [] } }),
    };
    const store = createOverlayFrameV2Store();
    const adapter = createStudioOverlayTelemetryAdapter({ legacy, pull, overlayV2Store: store });

    expect(() => adapter.start()).toThrow('v1 failed');
    expect(pull.start).not.toHaveBeenCalled();
    expect(pull.stop).toHaveBeenCalledTimes(1);
    expect(legacy.stop).toHaveBeenCalledTimes(1);
    for (const remove of listeners) expect(remove).toHaveBeenCalledTimes(1);

    store.dispose();
    coordinator.dispose();
  });
});
