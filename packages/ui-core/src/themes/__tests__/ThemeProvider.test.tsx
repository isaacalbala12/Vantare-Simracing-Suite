import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../ThemeProvider';
import { useTheme } from '../useTheme';
import { dark } from '../defaults';

function ThemeProbe() {
  const { themeId, isDark } = useTheme();
  return (
    <div>
      <span data-testid="theme-id">{themeId}</span>
      <span data-testid="is-dark">{String(isDark)}</span>
    </div>
  );
}

function ThemeSwitcher() {
  const { setTheme } = useTheme();
  return <button onClick={() => setTheme('blood')}>Switch to blood</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    window.vantare = {
      getThemes: vi.fn().mockResolvedValue([]),
      getActiveTheme: vi.fn().mockResolvedValue(dark),
      setActiveTheme: vi.fn().mockResolvedValue(undefined),
      saveTheme: vi.fn().mockResolvedValue(undefined),
    } as unknown as Window['vantare'];
  });

  it('applies CSS variables on mount', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--color-surface')).toBe('#0a0a0a');
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#3b82f6');
    });
  });

  it('switches theme and updates CSS variables', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeProbe />
        <ThemeSwitcher />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme-id').textContent).toBe('dark');
    });

    await user.click(screen.getByRole('button', { name: 'Switch to blood' }));

    await waitFor(() => {
      expect(screen.getByTestId('theme-id').textContent).toBe('blood');
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#8B0000');
    });
  });

  it('marks dark themes correctly', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-dark').textContent).toBe('true');
    });
  });
});
