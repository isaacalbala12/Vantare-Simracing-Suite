import { resetStudioStageGeometryCache } from './canvas/stage-geometry-cache';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Events } from '@wailsio/runtime';
import { deltaDefinition } from '../../overlay/widget-types/delta/delta-definition';
import type { ProfileDocumentV3 } from '../../overlay/core/profile-document';
import { createTelemetryRateCoordinator } from '../../overlay/core/telemetry-rate-coordinator';
import { StudioRoute } from './StudioRoute';
import type { StudioProfileClient } from './state/studio-profile-client';

const listeners = new Map<string, ((event: { data: unknown }) => void)[]>();

vi.mock('@wailsio/runtime', () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(cb);
      listeners.set(name, existing);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

vi.mock('../../lib/access', () => ({
  useAccess: () => ({
    planLabel: 'free',
    planStatus: 'free',
    roles: [],
    isBlocked: false,
    isUnconfigured: false,
  }),
}));

function dispatch(name: string, data: unknown) {
  for (const handler of listeners.get(name) ?? []) {
    handler({ data });
  }
}

function buildDocument(id = 'default-racing'): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id,
    name: 'Default Racing',
    displayMode: 'edit',
    monitorIndex: 0,
    layouts: {
      general: {
        type: 'general',
        widgets: [deltaDefinition.createDefault('delta-main')],
      },
    },
  };
}

function createMockClient(documents: Record<string, ProfileDocumentV3> = {}): StudioProfileClient {
  const defaults: Record<string, ProfileDocumentV3> = {
    'example-racing.json': buildDocument('default-racing'),
    'profile-b.json': buildDocument('profile-b'),
    ...documents,
  };
  return {
    load: vi.fn(async (file: string) => ({
      document: structuredClone(defaults[file] ?? buildDocument()),
      revision: 'rev-1',
    })),
    save: vi.fn(async (input) => ({
      status: 'saved' as const,
      document: input.document,
      revision: 'rev-2',
    })),
  };
}

function bootProfiles(activeProfileId: string | null = 'default-racing') {
  dispatch('hub:profiles', {
    profiles: [
      {
        id: 'default-racing',
        file: 'example-racing.json',
        name: 'Default Racing',
        displayMode: 'racing',
        widgets: 1,
      },
      {
        id: 'profile-b',
        file: 'profile-b.json',
        name: 'Profile B',
        displayMode: 'racing',
        widgets: 2,
      },
    ],
  });
  if (activeProfileId) {
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: {},
      activeOverlayProfileId: activeProfileId,
    });
  }
}

describe('StudioRoute', () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    resetStudioStageGeometryCache();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('requests profiles and settings on mount', () => {
    render(
      <StudioRoute
        client={createMockClient()}
        coordinator={createTelemetryRateCoordinator()}
        liveAvailable={false}
      />,
    );
    expect(Events.Emit).toHaveBeenCalledWith('hub:list');
    expect(Events.Emit).toHaveBeenCalledWith('settings:get');
  });

  it('loads the active profile directly into Overlay Studio V3', async () => {
    render(
      <StudioRoute
        client={createMockClient()}
        coordinator={createTelemetryRateCoordinator()}
        liveAvailable={false}
      />,
    );
    bootProfiles();

    expect(await screen.findByTestId('overlay-studio-v3')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Overlays Studio' })).toBeNull();
    expect(screen.queryByTestId('no-active-profile-state')).toBeNull();
  });

  it('shows no-active-profile guidance when there is no active profile', async () => {
    render(
      <StudioRoute
        client={createMockClient()}
        coordinator={createTelemetryRateCoordinator()}
        liveAvailable={false}
      />,
    );
    dispatch('hub:profiles', {
      profiles: [
        {
          id: 'default-racing',
          file: 'example-racing.json',
          name: 'Default Racing',
          displayMode: 'racing',
          widgets: 1,
        },
      ],
    });

    expect(await screen.findByTestId('no-active-profile-state')).toBeTruthy();
    expect(screen.queryByTestId('overlay-studio-v3')).toBeNull();
  });

  it('uses the injected studio client instead of Wails transport in tests', async () => {
    const client = createMockClient();
    render(
      <StudioRoute
        client={client}
        coordinator={createTelemetryRateCoordinator()}
        liveAvailable={false}
      />,
    );
    bootProfiles();
    await screen.findByTestId('overlay-studio-v3');
    expect(client.load).toHaveBeenCalledWith('example-racing.json');
  });

  it('uses one bounded pull session for live Studio without global telemetry events', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/close')) {
        return Promise.resolve({ ok: true, status: 204 } as Response);
      }
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <StrictMode>
        <StudioRoute
          client={createMockClient()}
          coordinator={createTelemetryRateCoordinator()}
          liveAvailable
        />
      </StrictMode>,
    );
    bootProfiles();
    await screen.findByTestId('overlay-studio-v3');

    fireEvent.click(screen.getByRole('button', { name: 'Live' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/_vantare/overlay-telemetry/pull');
    expect(vi.mocked(Events.On).mock.calls.map(([name]) => name)).not.toContain(
      'telemetry:overlay:projection',
    );
    expect(vi.mocked(Events.On).mock.calls.map(([name]) => name)).not.toContain(
      'telemetry:overlay-v2:snapshot',
    );
    expect(vi.mocked(Events.Emit).mock.calls.map(([name]) => name)).not.toContain(
      'telemetry:overlay:status:get',
    );

    view.unmount();
    expect(fetchMock.mock.calls.filter(([route]) => String(route).endsWith('/pull'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([route]) => String(route).endsWith('/close'))).toHaveLength(1);
  });

  it('keeps the editor mounted and inert while visiting another Studio section', async () => {
    const client = createMockClient();
    const coordinator = createTelemetryRateCoordinator();
    const view = render(
      <StudioRoute client={client} coordinator={coordinator} liveAvailable={false} />,
    );
    bootProfiles();

    const editor = await screen.findByTestId('overlay-studio-v3');

    view.rerender(
      <StudioRoute
        client={client}
        coordinator={coordinator}
        liveAvailable={false}
        target="profiles"
      />,
    );

    expect(await screen.findByTestId('orbit-profiles')).toBeTruthy();
    expect(editor.isConnected).toBe(true);
    expect(editor.closest('[data-studio-editor-view]')?.getAttribute('aria-hidden')).toBe('true');
    expect(editor.closest('[data-studio-editor-view]')?.hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByTestId('orbit-profiles-back'));

    expect(screen.getByTestId('overlay-studio-v3')).toBe(editor);
    expect(editor.closest('[data-studio-editor-view]')?.getAttribute('aria-hidden')).toBe('false');
    expect(editor.closest('[data-studio-editor-view]')?.hasAttribute('inert')).toBe(false);
  });

  it('creates a profile from the in-app dialog and activates it in the editor', async () => {
    const client = createMockClient({
      'custom-race-hud.json': buildDocument('custom-race-hud'),
    });
    render(
      <StudioRoute
        client={client}
        coordinator={createTelemetryRateCoordinator()}
        liveAvailable={false}
      />,
    );
    dispatch('hub:profiles', { profiles: [] });
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: {},
      activeOverlayProfileId: null,
    });

    await screen.findByTestId('no-active-profile-state');
    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));
    expect(await screen.findByTestId('studio-create-profile-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('studio-create-profile-dialog-input'), {
      target: { value: 'Race HUD' },
    });
    fireEvent.click(screen.getByTestId('studio-create-profile-dialog-confirm'));

    expect(Events.Emit).toHaveBeenCalledWith('hub:create', { name: 'Race HUD' });

    dispatch('hub:profiles', {
      profiles: [
        {
          id: 'custom-race-hud',
          file: 'custom-race-hud.json',
          name: 'Race HUD',
          displayMode: 'edit',
          widgets: 3,
        },
      ],
    });

    expect(await screen.findByTestId('overlay-studio-v3')).toBeTruthy();
    expect(Events.Emit).toHaveBeenCalledWith('hub:set-active', {
      id: 'custom-race-hud',
      file: 'custom-race-hud.json',
    });
    expect(screen.queryByTestId('no-active-profile-state')).toBeNull();
  });
});
