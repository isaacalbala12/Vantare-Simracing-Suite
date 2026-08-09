import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

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

vi.mock('../../lib/license', () => ({
  useLicense: () => ({
    result: {
      email: 'test@example.com',
      state: 'active',
      entitlements: ['overlays', 'engineer'],
      capabilities: ['vantare.channel.nightly'],
    },
    loading: false,
    refresh: vi.fn(),
  }),
  LicenseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../lib/supabase-auth', () => ({
  signOut: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../settings/diagnostics/WailsDiagnosticsPanel', () => ({
  WailsDiagnosticsPanel: () => (
    <section data-testid="diagnostics-panel">
      <h2>Inspector y paquete de diagnóstico</h2>
    </section>
  ),
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

const release = {
  tag_name: 'v0.1.5-prealpha',
  name: 'v0.1.5',
  body: 'Bugfixes.',
  prerelease: true,
  published_at: '2026-06-15T00:00:00Z',
  html_url: 'https://github.com/example',
  assets: [
    {
      name: 'vantare-amd64-installer.exe',
      size: 6624510,
      browser_download_url: 'https://example.com/installer.exe',
    },
    {
      name: 'vantare-amd64-installer.exe.sha256',
      size: 100,
      browser_download_url: 'https://example.com/installer.exe.sha256',
    },
  ],
};

function clickTab(tabLabel: string) {
  fireEvent.click(screen.getByRole('tab', { name: tabLabel }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders header and shows Cuenta tab by default', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Cuenta' })).toBeDefined();
    expect(screen.getByRole('tabpanel', { name: 'Cuenta' })).toBeDefined();
  });

  it('renders AccountSettings inside the Cuenta tab', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Cuenta' })).toBeDefined();
  });

  it('shows channel options when clicking Actualizaciones tab', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    expect(screen.getByLabelText('Stable')).toBeDefined();
    expect(screen.getByLabelText('Testers')).toBeDefined();
    expect(screen.getByLabelText('Nightly')).toBeDefined();
  });

  it('shows hotkeys when clicking Hotkeys tab', () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    expect(screen.getByRole('heading', { name: 'Atajos de teclado globales' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Guardar atajos' })).toBeDefined();
    expect(screen.getByText('Toggle overlay')).toBeDefined();
    expect(screen.getByText('Siguiente perfil')).toBeDefined();
    expect(screen.getByText('Perfil anterior')).toBeDefined();
  });

  function clickFirstHotkeyButton() {
    const buttons = screen.getAllByRole('button', { name: /Cambiar/ });
    fireEvent.click(buttons[0]);
  }

  it('enters capture mode when clicking a hotkey row', () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    expect(screen.getByText('Pulsa una combinación...')).toBeDefined();
    expect(screen.getByText('Cancelar')).toBeDefined();
  });

  it('captures Ctrl+Shift+E and updates the value', async () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    const event = new KeyboardEvent('keydown', {
      key: 'e',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => { document.dispatchEvent(event); });
    await waitFor(() => {
      expect(screen.queryByText('Pulsa una combinación...')).toBeNull();
    });
    expect(screen.getByText('ctrl+shift+e')).toBeDefined();
  });

  it('cancels capture on Escape and preserves previous value', async () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
    });
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    const esc = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    act(() => { document.dispatchEvent(esc); });
    await waitFor(() => {
      expect(screen.queryByText('Pulsa una combinación...')).toBeNull();
    });
    expect(screen.getByText('ctrl+shift+v')).toBeDefined();
  });

  it('does not change value when pressing only Ctrl', () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
    });
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    const ctrl = new KeyboardEvent('keydown', {
      key: 'Control',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ctrl);
    expect(screen.getByText('Pulsa una combinación...')).toBeDefined();
  });

  it('shows diagnostics when clicking Diagnóstico tab', () => {
    render(<SettingsPage />);
    clickTab('Datos y diagnóstico');
    expect(screen.getByRole('heading', { name: 'Inspector y paquete de diagnóstico' })).toBeDefined();
    expect(screen.getByTestId('diagnostics-panel')).toBeDefined();
  });

  // The Avanzado tab is gone. deltaMode had no consumer anywhere -- not in
  // internal/, not in cmd/, not in the frontend -- so it was a control that did
  // nothing. Its Información card was worth keeping and now sits beside the
  // diagnostics panel.
  it('no longer offers an Avanzado tab or the inert delta mode', () => {
    render(<SettingsPage />);
    expect(screen.queryByRole('tab', { name: 'Avanzado' })).toBeNull();
    clickTab('Datos y diagnóstico');
    expect(screen.queryByText('Modo delta')).toBeNull();
  });

  // cpuSampling went out with it by mistake and came back: cmd/vantare wires it
  // to RuntimeSampler.SetCPUEnabled, which starts and stops the sampler. It
  // belongs beside diagnostics, because what it controls is instrumentation.
  it('keeps the CPU sampling control, in the Diagnóstico tab', () => {
    render(<SettingsPage />);
    expect(screen.queryByText('Monitorizar uso de CPU')).toBeNull();
    clickTab('Datos y diagnóstico');
    expect(screen.getByText('Monitorizar uso de CPU')).toBeDefined();
  });

  it('shows the Información card inside the Diagnóstico tab', () => {
    render(<SettingsPage />);
    clickTab('Datos y diagnóstico');
    expect(screen.getByRole('heading', { name: 'Información' })).toBeDefined();
    expect(screen.getByText(/Versión actual:/)).toBeDefined();
    expect(screen.getByText(/Canal:/)).toBeDefined();
  });

  it('emits settings save when channel changes', () => {
    render(<SettingsPage />);
    dispatch('updater:settings', { settings: { channel: 'stable' } });
    clickTab('Actualizaciones');

    fireEvent.click(screen.getByLabelText('Nightly'));

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:settings:save', {
      channel: 'nightly',
    });
  });

  it('displays available releases and marks current version', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [{ ...release, tag_name: 'v0.1.4-prealpha' }, release],
      },
    });

    expect(screen.getByText('v0.1.5-prealpha')).toBeDefined();
    expect(screen.getByText('Instalada')).toBeDefined();
  });

  it('emits ignore event when skipping a version', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [release],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:ignore', { version: 'v0.1.5-prealpha' });
  });

  it('shows changelog when clicking Ver cambios', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [release],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ver cambios' }));
    expect(screen.getByText('Bugfixes.')).toBeDefined();
  });

  it('shows downgrade confirmation when installing an older version', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.5-prealpha',
        releases: [{ ...release, tag_name: 'v0.1.4-prealpha' }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Downgrade' }));
    expect(screen.getByText('Confirmar downgrade')).toBeDefined();
  });

  // The confirmation used to be a bare `fixed inset-0` drawn inside the page,
  // with the Cancel button as its only exit. It is a modal now: it lives in a
  // portal on document.body and Escape closes it.
  it('renders the downgrade confirmation as a dismissable modal in a portal', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.5-prealpha',
        releases: [{ ...release, tag_name: 'v0.1.4-prealpha' }],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Downgrade' }));

    const dialog = screen.getByRole('dialog', { name: 'Confirmar downgrade' });
    expect(dialog.closest('[data-testid="settings-downgrade-overlay"]')).not.toBeNull();
    expect(document.body.contains(dialog)).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Confirmar downgrade' })).toBeNull();
  });

  // The save status used to sit at the foot of the page, so a toggle in one tab
  // reported itself somewhere the user was not looking. It now belongs to the
  // section that triggered the write.
  it('reports the save status inside the section that triggered it', () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar atajos' }));

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Guardando...');
    expect(status.closest('[role="tabpanel"]')?.getAttribute('id')).toBe('panel-hotkeys');
  });

  it('walks the tab bar with the arrow keys and keeps one tab stop', () => {
    render(<SettingsPage />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((tab) => tab.getAttribute('tabindex') === '0')).toHaveLength(1);

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Aplicación' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Cuenta' }).getAttribute('aria-selected')).toBe('true');
  });

  it('renders technical support section and diagnostics button', () => {
    render(<SettingsPage />);
    clickTab('Datos y diagnóstico');
    expect(screen.getByRole('heading', { name: 'Inspector y paquete de diagnóstico' })).toBeDefined();
  });

  it('does not retain the legacy immediate diagnostics copy flow', () => {
    render(<SettingsPage />);
    clickTab('Datos y diagnóstico');
    expect(runtimeMock.emit).not.toHaveBeenCalledWith('diagnostics:get');
    expect(runtimeMock.handlers.has('diagnostics')).toBe(false);
  });

  it('emits updater:install:verified (never legacy updater:install) when installing', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [release],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));

    const legacyCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'updater:install',
    );
    expect(legacyCalls).toHaveLength(0);

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:install:verified', release);
  });

  it('renders horizontal tab bar (no internal sidebar)', () => {
    render(<SettingsPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Cuenta',
      'Aplicación',
      'Actualizaciones',
      'Hotkeys',
      'Datos y diagnóstico',
    ]);
  });

  // TD-041: saving one setting must not wipe unrelated fields. The delta-mode
  // and cpuSampling variants of this test went with the Avanzado tab; saving
  // hotkeys is now the surviving path and carries the invariant alone -- it is
  // also the strongest case, because it writes the whole settings object.
  it('preserves activeOverlayProfileId when saving hotkeys (anti TD-041)', () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
      activeOverlayProfileId: 'must-survive-hotkeys',
    });
    clickTab('Hotkeys');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar atajos' }));
    const saveCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'settings:save',
    );
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
    const payload = saveCalls[saveCalls.length - 1][1] as Record<string, unknown>;
    expect(payload.activeOverlayProfileId).toBe('must-survive-hotkeys');
  });

});
describe('SettingsPage i18n', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    runtimeMock.handlers.clear();
    dispatch('settings', { deltaMode: 'lap', hotkeys: { toggleOverlay: '' } });
    dispatch('updater:settings', { settings: { channel: 'stable' } });
    dispatch('updater:available', { info: { currentVersion: '0.1.0', latestVersion: '0.1.1', available: false } });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows the language selector inside the Aplicación tab', () => {
    render(<SettingsPage />);
    clickTab('Aplicación');
    expect(screen.getByTestId('language-selector')).toBeTruthy();
  });

  it('displays settings title in Spanish by default', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Ajustes')).toBeTruthy();
  });

  it('changes visible text when language is switched to Portuguese', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Ajustes')).toBeTruthy();
    clickTab('Aplicación');
    const select = screen.getByTestId('language-selector') as HTMLSelectElement;
    select.value = 'pt';
    fireEvent.change(select);
    expect(screen.getByText('Configurações')).toBeTruthy();
  });

  it('persists language choice in localStorage', () => {
    render(<SettingsPage />);
    clickTab('Aplicación');
    const select = screen.getByTestId('language-selector') as HTMLSelectElement;
    select.value = 'it';
    fireEvent.change(select);
    expect(localStorage.getItem('vantare.locale')).toBe('it');
  });
});
