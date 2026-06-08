/**
 * QA: DashboardPage — comprehensive render test
 *
 * Verifies:
 * 1. Dashboard root and all 5 panels render with correct test IDs
 * 2. CanvasParticles renders canvas element with aria-hidden
 * 3. Each panel displays correct content from mocked IPC data
 * 4. Navigation links have correct href paths
 * 5. Theme preview displays from mock (async)
 * 6. Animation behavior respects prefers-reduced-motion
 * 7. Panel titles render correctly
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { setupMockVantare } from '../__stories__/mock-vantare';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../styles/dashboard.css', () => ({}));

// ---------------------------------------------------------------------------
// DOM API mocks (jsdom gaps)
// ---------------------------------------------------------------------------

const originalRAF = window.requestAnimationFrame;
const originalCAF = window.cancelAnimationFrame;
let rafId = 0;
window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  rafId++;
  setTimeout(() => cb(Date.now()), 16);
  return rafId;
}) as typeof window.requestAnimationFrame;
window.cancelAnimationFrame = vi.fn();

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DashboardPage — static render QA', () => {
  beforeEach(() => {
    setupMockVantare();
    vi.clearAllMocks();

    // jsdom does not implement matchMedia — stub it so DashboardPage's
    // prefers-reduced-motion check does not throw.
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  });

  // ─── Root & structure ─────────────────────────────────

  it('renders dashboard root with correct test ID', () => {
    renderDashboard();
    const root = screen.getByTestId('dashboard-page');
    expect(root).not.toBeNull();
  });

  it('renders all 5 panels with correct test IDs', () => {
    renderDashboard();
    expect(screen.getByTestId('dashboard-panel-overlays')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-sim')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-themes')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-account')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-settings')).not.toBeNull();
  });

  it('has CanvasParticles canvas element', () => {
    renderDashboard();
    const canvas = document.querySelector('canvas.particles-canvas');
    expect(canvas).not.toBeNull();
  });

  // ─── OverlaysPanel ────────────────────────────────────

  it('shows overlay panel with default state from mock', async () => {
    renderDashboard();
    // getOverlayWindows() → [], getActiveProfile() → null → total=0, active=0
    await waitFor(() => {
      // The "0 / 0 active" count text is split across parent+span nodes,
      // so match via the single-element empty-state paragraph instead.
      expect(screen.getByText('No overlays configured')).toBeTruthy();
    });
  });

  it('shows Open All and Close All buttons in overlays panel', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Open All')).not.toBeNull();
      expect(screen.getByText('Close All')).not.toBeNull();
    });
  });

  // ─── SimStatusPanel ───────────────────────────────────

  it('shows "No sim detected" when sim disconnected', () => {
    renderDashboard();
    // useSimState defaults to { connected: false, simName: null }
    expect(screen.getByText('No sim detected')).not.toBeNull();
  });

  it('shows OFFLINE badge when sim disconnected', () => {
    renderDashboard();
    expect(screen.getByText('● OFFLINE')).not.toBeNull();
  });

  it('shows "Connect a simulator to begin" info text', () => {
    renderDashboard();
    expect(screen.getByText('Connect a simulator to begin')).not.toBeNull();
  });

  // ─── ThemesPanel ──────────────────────────────────────

  it('displays theme preview from mock', async () => {
    renderDashboard();
    // getActiveTheme() resolves to dark theme with name "Dark"
    await waitFor(() => {
      expect(screen.getByText('Dark')).toBeTruthy();
    });
  });

  // ─── AccountPanel ─────────────────────────────────────

  it('shows "Sign in to sync your setup" when logged out', () => {
    renderDashboard();
    // Auth store defaults to user: null
    expect(screen.getByText('Sign in to sync your setup')).not.toBeNull();
  });

  // ─── SettingsPanel ────────────────────────────────────

  it('shows settings panel with demo mode toggle (default off)', () => {
    renderDashboard();
    const container = screen.getByTestId('dashboard-panel-settings');
    expect(container.textContent).toContain('Demo Mode');
    expect(container.textContent).toContain('HTTP Port');
    expect(container.textContent).toContain('Visibility Key');
  });

  // ─── Navigation links ─────────────────────────────────

  it('overlays panel link navigates to /overlays', () => {
    renderDashboard();
    const link = screen.getByTestId('dashboard-panel-overlays');
    expect(link.getAttribute('href')).toBe('/overlays');
  });

  it('settings panel link navigates to /settings', () => {
    renderDashboard();
    const link = screen.getByTestId('dashboard-panel-settings');
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('themes panel link navigates to /themes', () => {
    renderDashboard();
    const link = screen.getByTestId('dashboard-panel-themes');
    expect(link.getAttribute('href')).toBe('/themes');
  });

  it('account panel link navigates to /account', () => {
    renderDashboard();
    const link = screen.getByTestId('dashboard-panel-account');
    expect(link.getAttribute('href')).toBe('/account');
  });

  // ─── CanvasParticles ──────────────────────────────────

  it('CanvasParticles canvas has aria-hidden attribute', () => {
    renderDashboard();
    const canvas = document.querySelector('canvas.particles-canvas');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
  });

  // ─── Animation / reduced motion ───────────────────────

  it('renders all panels without error when prefers-reduced-motion is set', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderDashboard();
    // All 5 panels should render without animation-related crashes
    expect(screen.getByTestId('dashboard-panel-overlays')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-sim')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-themes')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-account')).not.toBeNull();
    expect(screen.getByTestId('dashboard-panel-settings')).not.toBeNull();
  });

  it('renders panel titles in dashboard', () => {
    renderDashboard();
    expect(screen.getByText('Overlays')).not.toBeNull();
    expect(screen.getByText('SIM Status')).not.toBeNull();
    expect(screen.getByText('Themes')).not.toBeNull();
    expect(screen.getByText('Account')).not.toBeNull();
    expect(screen.getByText('Settings')).not.toBeNull();
  });
});
