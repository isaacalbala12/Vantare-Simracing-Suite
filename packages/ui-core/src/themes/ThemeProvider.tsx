import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { builtInThemeMap, builtInThemes, DEFAULT_THEME_ID } from './defaults';
import { migrateLegacyTheme } from './legacy-mapper';
import { applyThemeToDOM, isDarkColor, mergeThemeTokens } from './theme-utils';
import type { Theme, ThemeTokenMap, ThemeTokens } from './types';
import { validateTheme } from './types';

export interface ThemeContextValue {
  theme: Theme;
  themeId: string;
  tokens: ThemeTokenMap;
  setTheme: (id: string) => void;
  setToken: <K extends keyof ThemeTokenMap>(
    category: K,
    token: keyof ThemeTokenMap[K],
    value: string | number,
  ) => void;
  applyOverlayOverride: (overlayId: string, override: Partial<ThemeTokenMap>) => void;
  clearOverlayOverride: (overlayId: string) => void;
  availableThemes: Array<{ id: string; name: string; description: string }>;
  runtimeOverlayOverrides: Record<string, Partial<ThemeTokens>>;
  isDark: boolean;
  isLoading: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const BUILT_IN_IDS = new Set(builtInThemes.map((theme) => theme.id));

function mergeAvailableThemes(storedThemes: Theme[]): Theme[] {
  const customThemes = storedThemes
    .filter((theme) => !BUILT_IN_IDS.has(theme.id))
    .map((theme) => {
      try {
        return validateTheme(migrateLegacyTheme(theme as never));
      } catch {
        return null;
      }
    })
    .filter((theme): theme is Theme => theme !== null);

  return [...builtInThemes, ...customThemes];
}

function resolveTheme(themes: Theme[], themeId: string): Theme {
  return themes.find((theme) => theme.id === themeId) ?? builtInThemeMap[DEFAULT_THEME_ID];
}

interface ThemeProviderProps {
  children: ReactNode;
  initialThemeId?: string;
}

export function ThemeProvider({ children, initialThemeId }: ThemeProviderProps) {
  const [themes, setThemes] = useState<Theme[]>([...builtInThemes]);
  const [themeId, setThemeId] = useState(initialThemeId ?? DEFAULT_THEME_ID);
  const [theme, setThemeState] = useState<Theme>(builtInThemeMap[DEFAULT_THEME_ID]);
  const [overlayOverrides, setOverlayOverrides] = useState<Record<string, Partial<ThemeTokens>>>({});
  const [isLoading, setIsLoading] = useState(true);

  const tokens = useMemo(
    () => theme.tokens,
    [theme.tokens],
  );

  const isDark = useMemo(() => isDarkColor(tokens.color.surface), [tokens.color.surface]);

  useEffect(() => {
    applyThemeToDOM(tokens);
  }, [tokens]);

  useEffect(() => {
    let cancelled = false;

    async function loadThemes() {
      if (!window.vantare?.getThemes || !window.vantare?.getActiveTheme) {
        setIsLoading(false);
        return;
      }

      try {
        const [storedThemes, activeTheme] = await Promise.all([
          window.vantare.getThemes(),
          window.vantare.getActiveTheme(),
        ]);

        if (cancelled) return;

        const mergedThemes = mergeAvailableThemes(storedThemes);
        const nextThemeId = activeTheme?.id ?? initialThemeId ?? DEFAULT_THEME_ID;
        const nextTheme = resolveTheme(mergedThemes, nextThemeId);

        setThemes(mergedThemes);
        setThemeId(nextTheme.id);
        setThemeState(nextTheme);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadThemes();

    return () => {
      cancelled = true;
    };
  }, [initialThemeId]);

  const persistTheme = useCallback(async (nextTheme: Theme) => {
    if (BUILT_IN_IDS.has(nextTheme.id)) return;
    await window.vantare?.saveTheme?.(nextTheme);
  }, []);

  const setTheme = useCallback(
    (id: string) => {
      const nextTheme = resolveTheme(themes, id);
      setThemeId(nextTheme.id);
      setThemeState(nextTheme);
      setOverlayOverrides({});
      void window.vantare?.setActiveTheme?.(nextTheme.id);
    },
    [themes],
  );

  const setToken = useCallback(
    <K extends keyof ThemeTokenMap>(
      category: K,
      token: keyof ThemeTokenMap[K],
      value: string | number,
    ) => {
      setThemeState((current) => {
        const categoryTokens = current.tokens[category];
        const nextTokens = mergeThemeTokens(current.tokens, {
          [category]: {
            ...categoryTokens,
            [token]: value,
          },
        } as Partial<ThemeTokens>);

        const nextTheme = { ...current, tokens: nextTokens };
        void persistTheme(nextTheme);
        return nextTheme;
      });
    },
    [persistTheme],
  );

  const applyOverlayOverride = useCallback(
    (overlayId: string, override: Partial<ThemeTokenMap>) => {
      setOverlayOverrides((current) => {
        const previous = current[overlayId] ?? {};
        return {
          ...current,
          [overlayId]: {
            ...previous,
            ...override,
            color: { ...previous.color, ...override.color },
            font: {
              ...previous.font,
              ...override.font,
              size: { ...previous.font?.size, ...override.font?.size },
              weight: { ...previous.font?.weight, ...override.font?.weight },
            },
            spacing: { ...previous.spacing, ...override.spacing },
            radius: { ...previous.radius, ...override.radius },
            shadow: { ...previous.shadow, ...override.shadow },
            animation: {
              ...previous.animation,
              ...override.animation,
              duration: {
                ...previous.animation?.duration,
                ...override.animation?.duration,
              },
              easing: {
                ...previous.animation?.easing,
                ...override.animation?.easing,
              },
            },
            glass: { ...previous.glass, ...override.glass },
            z: { ...previous.z, ...override.z },
          } as Partial<ThemeTokens>,
        };
      });
    },
    [],
  );

  const clearOverlayOverride = useCallback((overlayId: string) => {
    setOverlayOverrides((current) => {
      if (!(overlayId in current)) return current;
      const next = { ...current };
      delete next[overlayId];
      return next;
    });
  }, []);

  const availableThemes = useMemo(
    () => themes.map(({ id, name, description }) => ({ id, name, description })),
    [themes],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeId,
      tokens,
      setTheme,
      setToken,
      applyOverlayOverride,
      clearOverlayOverride,
      availableThemes,
      runtimeOverlayOverrides: overlayOverrides,
      isDark,
      isLoading,
    }),
    [
      theme,
      themeId,
      tokens,
      setTheme,
      setToken,
      applyOverlayOverride,
      clearOverlayOverride,
      availableThemes,
      overlayOverrides,
      isDark,
      isLoading,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
