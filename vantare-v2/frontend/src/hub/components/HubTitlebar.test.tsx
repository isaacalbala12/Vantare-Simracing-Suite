import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clipboard, Window } from '@wailsio/runtime';
import { HubTitlebar } from './HubTitlebar';

vi.mock('@wailsio/runtime', () => ({
  Events: { On: vi.fn(() => () => undefined) },
  Application: { Quit: vi.fn(async () => undefined) },
  Clipboard: { SetText: vi.fn(async () => undefined), Text: vi.fn(async () => 'pegado') },
  Window: {
    Minimise: vi.fn(async () => undefined),
    ToggleMaximise: vi.fn(async () => undefined),
    ToggleFullscreen: vi.fn(async () => undefined),
    Close: vi.fn(async () => undefined),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HubTitlebar', () => {
  it('opens a vertical menu beneath each title without a native popup', () => {
    render(<HubTitlebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Edición' }));
    const menu = screen.getByRole('menu', { name: 'Edición' });
    expect(menu.className).toBe('hub-titlebar__dropdown');
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent)).toEqual([
      'DeshacerCtrl+Z', 'RehacerCtrl+Y', 'CortarCtrl+X', 'CopiarCtrl+C',
      'PegarCtrl+V', 'EliminarDel', 'Seleccionar todoCtrl+A',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(screen.queryByRole('menu', { name: 'Edición' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Pantalla completa/ })).toBeTruthy();
  });

  it('copies the selection from the previously focused text field', async () => {
    render(<><HubTitlebar /><input aria-label="Campo" defaultValue="Vantare" /></>);
    const editor = screen.getByRole('textbox', { name: 'Campo' }) as HTMLInputElement;
    editor.focus();
    editor.setSelectionRange(0, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Edición' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Copiar/ }));
    await vi.waitFor(() => expect(Clipboard.SetText).toHaveBeenCalledWith('Van'));
  });

  it('keeps the window controls usable', () => {
    render(<HubTitlebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(Window.Minimise).toHaveBeenCalledOnce();
    expect(Window.ToggleMaximise).toHaveBeenCalledOnce();
    expect(Window.Close).toHaveBeenCalledOnce();
  });

  it('runs the advertised F11 shortcut', () => {
    render(<HubTitlebar />);
    fireEvent.keyDown(document, { key: 'F11' });
    expect(Window.ToggleFullscreen).toHaveBeenCalledOnce();
  });
});
