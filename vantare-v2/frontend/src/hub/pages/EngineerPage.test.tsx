import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineerPage } from './EngineerPage';

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

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

const mockStatus = {
  enabled: true,
  connected: true,
  source: 'simulator',
  spotterEnabled: true,
  sensitivity: 'normal',
  ttsCacheCount: 0,
  recentMessages: [
    {
      id: 'msg-1',
      category: 'spotter',
      severity: 'info',
      textKey: 'spotter.car_left',
      text: 'Coche a la izquierda',
      priority: 100,
      createdAt: 1623800000000,
      source: 'simulator',
    },
  ],
};

describe('EngineerPage', () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders section heading and description', () => {
    render(<EngineerPage />);
    expect(screen.getByRole('heading', { name: 'Ingeniero Vantare' })).toBeDefined();
    expect(screen.getByText(/Configura el ingeniero de pista y el spotter/i)).toBeDefined();
  });

  it('renders development banner', () => {
    render(<EngineerPage />);
    expect(screen.getByText('En desarrollo')).toBeDefined();
    expect(screen.getByText(/Módulo de ingeniero — funcionalidad activa bajo el banner/i)).toBeDefined();
  });

  it('does not render unimplemented fake voice profile data', () => {
    render(<EngineerPage />);

    expect(screen.queryByText(/Carlos \(Ingeniero\)/i)).toBeNull();
    expect(screen.queryByText(/12 perfiles compatibles/i)).toBeNull();
    expect(screen.queryByText(/LMU, iRacing y Assetto Corsa/i)).toBeNull();
  });

  it('renders disabled advanced options button', () => {
    render(<EngineerPage />);
    const btn = screen.getByRole('button', { name: /opciones avanzadas/i });
    expect(btn).toBeDefined();
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('renders honest footer text', () => {
    render(<EngineerPage />);
    expect(screen.getByText(/Configuración aplicada localmente/i)).toBeDefined();
  });

  it('does not render fake voice panels or TTS sliders', () => {
    render(<EngineerPage />);
    expect(screen.queryByText(/Marcos/i)).toBeNull();
    expect(screen.queryByText(/Lucía/i)).toBeNull();
    expect(screen.queryByText(/James/i)).toBeNull();
    expect(screen.queryByText(/Hugo/i)).toBeNull();
    expect(screen.queryByText(/Carlos \(Ingeniero\)/i)).toBeNull();
    expect(screen.queryByText(/Probar voz/i)).toBeNull();
    expect(screen.queryByText(/API key TTS/i)).toBeNull();
  });

  it('requests status on mount', () => {
    render(<EngineerPage />);
    expect(runtimeMock.emit).toHaveBeenCalledWith('engineer:status:get');
  });

  it('listens to engineer:status and engineer:notification events', () => {
    render(<EngineerPage />);
    expect(runtimeMock.handlers.has('engineer:status')).toBe(true);
    expect(runtimeMock.handlers.has('engineer:notification')).toBe(true);
  });

  it('displays connection status and recent messages from status', () => {
    render(<EngineerPage />);
    dispatch('engineer:status', mockStatus);

    const badge = screen.getByTestId('connection-badge');
    expect(badge.textContent).toContain('CONECTADO');
    expect(screen.getByText('Coche a la izquierda')).toBeDefined();
  });

  it('handles real-time notifications', () => {
    render(<EngineerPage />);
    dispatch('engineer:status', { ...mockStatus, recentMessages: [] });

    expect(screen.queryByText('Coche a la izquierda')).toBeNull();

    dispatch('engineer:notification', mockStatus.recentMessages[0]);
    expect(screen.getByText('Coche a la izquierda')).toBeDefined();
  });

  it('emits correct event when clicking active/enabled toggle', () => {
    render(<EngineerPage />);
    dispatch('engineer:status', mockStatus);

    const toggle = screen.getByTestId('toggle-enabled');
    fireEvent.click(toggle);

    expect(runtimeMock.emit).toHaveBeenCalledWith('engineer:enabled:set', false);
  });

  it('emits correct event when clicking spotter toggle', () => {
    render(<EngineerPage />);
    dispatch('engineer:status', mockStatus);

    const toggle = screen.getByTestId('toggle-spotter');
    fireEvent.click(toggle);

    expect(runtimeMock.emit).toHaveBeenCalledWith('engineer:spotter:set', false);
  });

  it('emits correct event when changing telemetry source', () => {
    render(<EngineerPage />);
    dispatch('engineer:status', mockStatus);

    const select = screen.getByTestId('select-source');
    fireEvent.change(select, { target: { value: 'replay' } });

    expect(runtimeMock.emit).toHaveBeenCalledWith('engineer:source:set', 'replay');
  });

  it('emits correct event when changing spotter sensitivity', () => {
    render(<EngineerPage />);
    dispatch('engineer:status', mockStatus);

    const select = screen.getByTestId('select-sensitivity');
    fireEvent.change(select, { target: { value: 'aggressive' } });

    expect(runtimeMock.emit).toHaveBeenCalledWith('engineer:sensitivity:set', 'aggressive');
  });

  it('does not contain fake data from old HTML mock', () => {
    render(<EngineerPage />);
    expect(screen.queryByText(/12 perfiles compatibles/i)).toBeNull();
    expect(screen.queryByText(/Carlos/i)).toBeNull();
    expect(screen.queryByText(/Marcos/i)).toBeNull();
    expect(screen.queryByText(/Lucía/i)).toBeNull();
    expect(screen.queryByText(/James/i)).toBeNull();
    expect(screen.queryByText(/Hugo/i)).toBeNull();
    expect(screen.queryByText(/Probar voz/i)).toBeNull();
    expect(screen.queryByText(/API key TTS/i)).toBeNull();
  });
});
