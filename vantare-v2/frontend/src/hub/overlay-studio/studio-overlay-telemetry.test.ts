import { describe, expect, it, vi } from 'vitest';
import { createTelemetryRateCoordinator } from '../../overlay/core/telemetry-rate-coordinator';
import { createOverlayFrameV2Store } from '../../telemetry-transport/overlay-frame-v2-store';
import type { OverlayWailsPullClient } from '../../telemetry-transport/overlay-wails-pull';
import { createStudioOverlayTelemetryAdapter } from './studio-overlay-telemetry';

function createPullDouble(order: string[], listeners: Map<string, Set<(data: unknown) => void>>): OverlayWailsPullClient {
  return {
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
}

describe('Studio Overlay telemetry lifecycle (V2-only)', () => {
  it('exposes the given coordinator and starts one pull session after attaching V2 listeners', () => {
    const order: string[] = [];
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    const coordinator = createTelemetryRateCoordinator();
    const pull = createPullDouble(order, listeners);
    const store = createOverlayFrameV2Store();
    const adapter = createStudioOverlayTelemetryAdapter({
      coordinator,
      pull,
      overlayV2Store: store,
    });

    expect(adapter.coordinator).toBe(coordinator);

    adapter.start();
    adapter.start();
    expect(order).toEqual([
      'listen:telemetry:overlay-v2:status',
      'listen:telemetry:overlay-v2:snapshot',
      'pull:start',
    ]);

    // Un status V2 sigue actualizando el store: unica fuente viva.
    for (const listener of listeners.get('telemetry:overlay-v2:status') ?? []) {
      listener({ revision: 50, source: { state: 'connecting' }, frame: null });
    }
    expect(store.getSnapshot().source?.state).toBe('connecting');
    expect(store.getSnapshot().revision).toBe(50);

    adapter.stop();
    adapter.stop();
    expect(pull.stop).toHaveBeenCalledTimes(1);
    expect(listeners.get('telemetry:overlay-v2:status')?.size).toBe(0);
    expect(listeners.get('telemetry:overlay-v2:snapshot')?.size).toBe(0);

    // Reinicio vuelve a revision 0 y vuelve a aceptar frames V2.
    adapter.start();
    expect(pull.start).toHaveBeenCalledTimes(2);
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

  it('cleans up pull and listeners when pull.start fails and rethrows the original error', () => {
    const order: string[] = [];
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    const coordinator = createTelemetryRateCoordinator();
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
      start: () => { throw new Error('pull failed'); },
      stop: vi.fn(() => order.push('pull:stop')),
    };
    const store = createOverlayFrameV2Store();
    const adapter = createStudioOverlayTelemetryAdapter({
      coordinator,
      pull,
      overlayV2Store: store,
    });

    expect(() => adapter.start()).toThrow('pull failed');
    expect(order).toEqual([
      'listen:telemetry:overlay-v2:status',
      'listen:telemetry:overlay-v2:snapshot',
      'pull:stop',
      'unlisten:telemetry:overlay-v2:status',
      'unlisten:telemetry:overlay-v2:snapshot',
    ]);
    expect(listeners.get('telemetry:overlay-v2:status')?.size).toBe(0);
    expect(listeners.get('telemetry:overlay-v2:snapshot')?.size).toBe(0);

    // El adapter queda detenido: stop es no-op y se puede reintentar.
    adapter.stop();
    expect(pull.stop).toHaveBeenCalledTimes(1);

    store.dispose();
    coordinator.dispose();
  });

  it('reports invalid V2 frames through onOverlayV2Error', () => {
    const order: string[] = [];
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    const coordinator = createTelemetryRateCoordinator();
    const pull = createPullDouble(order, listeners);
    const store = createOverlayFrameV2Store();
    const onOverlayV2Error = vi.fn();
    const adapter = createStudioOverlayTelemetryAdapter({
      coordinator,
      pull,
      overlayV2Store: store,
      onOverlayV2Error,
    });

    adapter.start();
    for (const listener of listeners.get('telemetry:overlay-v2:status') ?? []) {
      listener({ revision: 'nope', source: { state: 'live' }, frame: null });
    }
    expect(onOverlayV2Error).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ revision: 0, ageMs: 0 });
    adapter.stop();
    store.dispose();
    coordinator.dispose();
  });
});
