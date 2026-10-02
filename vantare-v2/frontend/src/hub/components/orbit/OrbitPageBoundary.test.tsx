import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrbitPageBoundary } from './OrbitPageBoundary';

afterEach(() => cleanup());

function Bomba({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) {
    throw new Error('chunk no encontrado');
  }
  return <div data-testid="contenido">ok</div>;
}

describe('OrbitPageBoundary', () => {
  it('deja pasar el contenido cuando no hay error', () => {
    render(
      <OrbitPageBoundary title="error" retry="reintentar">
        <Bomba explode={false} />
      </OrbitPageBoundary>,
    );
    expect(screen.getByTestId('contenido')).toBeTruthy();
  });

  it('captura el fallo del chunk y ofrece reintento', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <OrbitPageBoundary title="error" retry="reintentar">
          <Bomba explode />
        </OrbitPageBoundary>,
      );
      expect(screen.getByRole('alert').textContent).toContain('error');
      expect(screen.getByRole('button', { name: 'reintentar' })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
