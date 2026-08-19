import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Regresión del onboarding con Orbit encendido.
 *
 * `BetaWelcome` vivía dentro de `children` de la shell, y la shell Orbit solo
 * pinta `children` en su rama de respaldo (Overlays Studio): la bienvenida
 * aparecía en Studio en vez de encima de Inicio.
 */

const { onListeners, eventsOn, eventsEmit, useLicenseMock } = vi.hoisted(() => {
  const onListeners = new Map<string, (event: unknown) => void>();
  return {
    onListeners,
    eventsOn: vi.fn((name: string, cb: (event: unknown) => void) => {
      onListeners.set(name, cb);
      return () => onListeners.delete(name);
    }),
    eventsEmit: vi.fn(),
    useLicenseMock: vi.fn(),
  };
});

vi.mock('@wailsio/runtime', () => ({
  Events: { On: eventsOn, Off: vi.fn(), Emit: eventsEmit },
}));

vi.mock('../lib/license', () => ({
  LicenseProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLicense: useLicenseMock,
}));

vi.mock('./auth/LicenseBanner', () => ({ LicenseBanner: () => null }));

vi.mock('./onboarding/BetaWelcome', () => ({
  BetaWelcome: () => <div data-testid="beta-welcome">bienvenida</div>,
}));

import { HubApp } from './HubApp';
import { initialSection } from './orbit/initial-view';
import { ORBIT_KEYS, orbitStore } from './orbit/orbit-store';

function activeLicense() {
  useLicenseMock.mockReturnValue({
    result: {
      state: 'active',
      entitlements: ['overlays', 'engineer'],
      userId: 'u',
      email: 'u@example.com',
      deviceOK: true,
    },
    loading: false,
    refresh: vi.fn(),
  });
}

describe('initialSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sin preferencia guardada arranca en Inicio', () => {
    expect(initialSection()).toBe('dashboard');
  });

  it('con Orbit respeta la preferencia guardada de una sesión anterior', () => {
    orbitStore.set(ORBIT_KEYS.view, 'launcher');
    expect(initialSection()).toBe('launcher');
  });

  it('ignora un valor guardado que no nombra una vista real', () => {
    orbitStore.set(ORBIT_KEYS.view, 'no-existe' as never);
    expect(initialSection()).toBe('dashboard');
  });
});

describe('HubApp con Orbit: onboarding sobre Inicio', () => {
  beforeEach(() => {
    cleanup();
    onListeners.clear();
    eventsOn.mockClear();
    eventsEmit.mockClear();
    useLicenseMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('primer arranque sin preferencia: shell Orbit en Inicio con la bienvenida encima', async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === 'settings') {
        setTimeout(() => cb({ data: { betaWelcomeCompleted: false } }), 0);
      }
      return () => false;
    });
    activeLicense();

    render(<HubApp />);

    await waitFor(() => {
      expect(screen.getByTestId('beta-welcome')).toBeTruthy();
    });
    expect(screen.getByTestId('orbit-shell')).toBeTruthy();
    // El rail marca Inicio como vista activa, no Studio.
    expect(screen.getByTestId('orbit-rail-inicio').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('orbit-rail-studio').getAttribute('aria-current')).not.toBe('page');
  });

  it('una preferencia guardada de Studio no secuestra el primer arranque con onboarding pendiente', async () => {
    orbitStore.set(ORBIT_KEYS.view, 'studio');
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === 'settings') {
        setTimeout(() => cb({ data: { betaWelcomeCompleted: false } }), 0);
      }
      return () => false;
    });
    activeLicense();

    render(<HubApp />);

    await waitFor(() => {
      expect(screen.getByTestId('beta-welcome')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('orbit-rail-inicio').getAttribute('aria-current')).toBe('page');
    });
    expect(orbitStore.get(ORBIT_KEYS.view)).toBe('inicio');
  });

  it('sin onboarding pendiente respeta la vista guardada', async () => {
    orbitStore.set(ORBIT_KEYS.view, 'launcher');
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === 'settings') {
        setTimeout(() => cb({ data: { betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    activeLicense();

    render(<HubApp />);

    await waitFor(() => {
      expect(screen.getByTestId('orbit-rail-launcher').getAttribute('aria-current')).toBe('page');
    });
    expect(screen.queryByTestId('beta-welcome')).toBeNull();
  });
});
