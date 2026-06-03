/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import OverlayShell from '../OverlayShell';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock overlay components (paths relative to test file in __tests__/)
vi.mock('../Standings', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="standings-component" {...props} />
  ),
}));

vi.mock('../Relative', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="relative-component" {...props} />
  ),
}));

// Mock CSS import
vi.mock('../overlay.css', () => ({}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function setUrl(search: string) {
  const url = new URL('http://localhost' + (search.startsWith('/') ? '' : '/') + search);
  Object.defineProperty(window, 'location', {
    value: {
      href: url.href,
      search: url.search,
      pathname: url.pathname,
    },
    writable: true,
    configurable: true,
  });
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe('OverlayShell', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    setUrl('/');
    document.body.classList.remove('overlay-mode');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // ── Routing ────────────────────────────────────────────────────────────────

  it('renders Standings component for ?overlay=standings', async () => {
    setUrl('/?overlay=standings');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(container.innerHTML).toContain('data-testid="standings-component"');
  });

  it('renders Relative component for ?overlay=relative', async () => {
    setUrl('/?overlay=relative');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(container.innerHTML).toContain('data-testid="relative-component"');
  });

  it('returns null when no overlay param is present', async () => {
    setUrl('/');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(container.innerHTML).toBe('');
  });

  it('returns null for unknown overlay id', async () => {
    setUrl('/?overlay=delta-bar');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(container.innerHTML).toBe('');
  });

  // ── Body class ─────────────────────────────────────────────────────────────

  it('applies overlay-mode class to body when overlay param is present', async () => {
    setUrl('/?overlay=standings');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(document.body.classList.contains('overlay-mode')).toBe(true);
  });

  it('removes overlay-mode class from body when no overlay param', async () => {
    setUrl('/');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(document.body.classList.contains('overlay-mode')).toBe(false);
  });

  // ── Props ──────────────────────────────────────────────────────────────────

  it('Standings component renders when routed (no telemetry prop passed by shell)', async () => {
    // NOTE: Current OverlayShell implementation renders <OverlayComponent /> without
    // passing telemetry. Standings handles undefined telemetry via its empty state.
    // This test verifies the routing wiring is correct; telemetry prop passing
    // would require modifying OverlayShell (out of scope for this task).
    setUrl('/?overlay=standings');
    await act(async () => {
      root.render(<OverlayShell />);
    });
    expect(container.innerHTML).toContain('data-testid="standings-component"');
  });
});
