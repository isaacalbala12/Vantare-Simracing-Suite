import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDocumentV3, WidgetInstanceV3 } from '../core/profile-document';
import { createTestTelemetryCoordinator } from '../../hub/overlay-studio/test-helpers';
import { deltaDefinition } from '../widget-types/delta/delta-definition';
import { StudioProvider, useStudioDocument } from '../../hub/overlay-studio/state/studio-store';
import type {
  StudioProfileClient,
  StudioSaveResult,
} from '../../hub/overlay-studio/state/studio-profile-client';
import { InPlaceInspectorPanel } from './InPlaceInspectorPanel';
import { useInplaceAutosave } from './use-inplace-autosave';

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock('@wailsio/runtime', () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () =>
        runtimeMock.handlers.set(
          name,
          (runtimeMock.handlers.get(name) ?? []).filter((h) => h !== handler),
        );
    },
    Emit: runtimeMock.emit,
  },
}));

const suiteAccess = {
  planLabel: 'suite' as const,
  planStatus: 'active' as const,
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

function buildDeltaWidget(): WidgetInstanceV3 {
  const widget = deltaDefinition.createDefault('delta-main');
  widget.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return widget;
}

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: 'profile-1',
    name: 'Test',
    displayMode: 'edit',
    monitorIndex: 0,
    layouts: {
      general: { type: 'general', widgets: [buildDeltaWidget()] },
    },
  };
}

function createMemoryClient(): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: buildDocument(), revision: 'rev-1' })),
    save: vi.fn(
      async (): Promise<StudioSaveResult> => ({
        status: 'saved',
        document: buildDocument(),
        revision: 'rev-2',
      }),
    ),
  };
}

function Harness({ widget }: { widget: WidgetInstanceV3 | null }): React.ReactElement {
  const coordinator = createTestTelemetryCoordinator();
  return (
    <StudioProvider
      client={createMemoryClient()}
      initialFile="test.json"
      recoveryStorage={null}
      access={suiteAccess}
    >
      <Inner widget={widget} telemetry={coordinator} />
    </StudioProvider>
  );
}

function Inner({
  widget,
  telemetry,
}: {
  widget: WidgetInstanceV3 | null;
  telemetry: ReturnType<typeof createTestTelemetryCoordinator>;
}): React.ReactElement {
  const { dispatch, undo, redo, save } = useStudioDocument();
  const autosave = useInplaceAutosave({ dispatch, undo, redo, save, interactionActive: false });
  return (
    <InPlaceInspectorPanel
      widget={widget}
      session="race"
      telemetry={telemetry}
      access={suiteAccess}
      licenseLoading={false}
      autosave={autosave}
      selectedWidgetId={widget?.id ?? null}
    />
  );
}

beforeEach(() => {
  runtimeMock.emit.mockClear();
  runtimeMock.handlers.clear();
});

afterEach(() => {
  cleanup();
});

describe('InPlaceInspectorPanel', () => {
  it('shows an empty state without a selected widget', () => {
    render(<Harness widget={null} />);
    expect(screen.getByTestId('inplace-inspector-panel')).toBeTruthy();
    expect(screen.getByTestId('inplace-inspector-empty')).toBeTruthy();
  });

  it('renders the three property sections for a selected widget', async () => {
    render(<Harness widget={buildDeltaWidget()} />);
    await waitFor(() => expect(screen.getByTestId('inplace-inspector-panel')).toBeTruthy());
    expect(screen.getByTestId('inplace-inspector-section-appearance')).toBeTruthy();
    expect(screen.getByTestId('inplace-inspector-section-content')).toBeTruthy();
    expect(screen.getByTestId('inplace-inspector-section-behavior')).toBeTruthy();
  });

  it('dispatches widget/visual when toggling an appearance control', async () => {
    render(<Harness widget={buildDeltaWidget()} />);
    const toggle = await screen.findByRole('button', { name: 'Mostrar cabecera' });
    fireEvent.click(toggle);

    // El toggle de apariencia marca el documento dirty (el dispatch llego al store).
    await waitFor(() => expect(screen.getByTestId('inplace-inspector-dirty')).toBeTruthy());
  });

  it('provides undo and redo buttons wired to history', async () => {
    render(<Harness widget={buildDeltaWidget()} />);
    await waitFor(() => expect(screen.getByTestId('inplace-undo')).toBeTruthy());

    const undo = screen.getByTestId('inplace-undo') as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    const redo = screen.getByTestId('inplace-redo') as HTMLButtonElement;
    expect(redo.disabled).toBe(true);

    // Un cambio de apariencia habilita undo.
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar cabecera' }));
    await waitFor(() =>
      expect((screen.getByTestId('inplace-undo') as HTMLButtonElement).disabled).toBe(false),
    );

    act(() => {
      fireEvent.click(screen.getByTestId('inplace-undo'));
    });
    expect((screen.getByTestId('inplace-undo') as HTMLButtonElement).disabled).toBe(true);
  });
});
