import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../ThemeProvider';
import { useTheme } from '../useTheme';
import { useOverlayTheme } from '../useOverlayTheme';
import { dark } from '../defaults';

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('theme hooks', () => {
  beforeEach(() => {
    window.vantare = {
      getThemes: vi.fn().mockResolvedValue([]),
      getActiveTheme: vi.fn().mockResolvedValue(dark),
      setActiveTheme: vi.fn().mockResolvedValue(undefined),
      saveTheme: vi.fn().mockResolvedValue(undefined),
    } as unknown as Window['vantare'];
  });

  it('useTheme throws outside ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });

  it('useOverlayTheme applies override only for one overlay', async () => {
    const { result } = renderHook(
      () => ({
        global: useTheme(),
        standings: useOverlayTheme('standings'),
        relative: useOverlayTheme('relative'),
      }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.standings.applyOverride({
        color: { primary: '#ff0000' },
      } as Parameters<typeof result.current.standings.applyOverride>[0]);
    });

    expect(result.current.standings.tokens.color.primary).toBe('#ff0000');
    expect(result.current.global.tokens.color.primary).toBe('#3b82f6');
    expect(result.current.relative.tokens.color.primary).toBe('#3b82f6');
  });
});
