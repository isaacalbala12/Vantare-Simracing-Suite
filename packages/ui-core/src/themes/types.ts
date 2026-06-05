import { z } from 'zod';

/** Accepts hex (#rgb, #rrggbb, #rrggbbaa), rgb(), rgba(), hsl(), hsla() */
export const colorValueSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
      /^rgba?\([^)]+\)$/.test(value) ||
      /^hsla?\([^)]+\)$/.test(value),
    { message: 'Invalid color format (expected hex, rgb/rgba, or hsl/hsla)' },
  );

export const cssSizeSchema = z.string().min(1);
export const cssDurationSchema = z.string().min(1);

export const ColorTokensSchema = z.object({
  surface: colorValueSchema,
  surfaceAlt: colorValueSchema,
  surfaceElevated: colorValueSchema,
  border: colorValueSchema,
  borderSubtle: colorValueSchema,
  primary: colorValueSchema,
  primaryHover: colorValueSchema,
  primaryMuted: colorValueSchema,
  secondary: colorValueSchema,
  secondaryHover: colorValueSchema,
  text: colorValueSchema,
  textMuted: colorValueSchema,
  textInverse: colorValueSchema,
  positive: colorValueSchema,
  negative: colorValueSchema,
  warning: colorValueSchema,
  danger: colorValueSchema,
  glass: colorValueSchema,
  glassBorder: colorValueSchema,
  overlay: colorValueSchema,
});

export const FontSizeTokensSchema = z.object({
  xs: cssSizeSchema,
  sm: cssSizeSchema,
  base: cssSizeSchema,
  lg: cssSizeSchema,
  xl: cssSizeSchema,
  '2xl': cssSizeSchema,
});

export const FontWeightTokensSchema = z.object({
  normal: z.number(),
  medium: z.number(),
  semibold: z.number(),
  bold: z.number(),
});

export const FontTokensSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  mono: z.string().min(1),
  size: FontSizeTokensSchema,
  weight: FontWeightTokensSchema,
});

export const SpacingTokensSchema = z.object({
  xs: cssSizeSchema,
  sm: cssSizeSchema,
  md: cssSizeSchema,
  lg: cssSizeSchema,
  xl: cssSizeSchema,
  '2xl': cssSizeSchema,
});

export const RadiusTokensSchema = z.object({
  sm: cssSizeSchema,
  md: cssSizeSchema,
  lg: cssSizeSchema,
  xl: cssSizeSchema,
  full: cssSizeSchema,
});

export const ShadowTokensSchema = z.object({
  sm: z.string().min(1),
  md: z.string().min(1),
  lg: z.string().min(1),
  glow: z.string().min(1),
});

export const AnimationDurationTokensSchema = z.object({
  fast: cssDurationSchema,
  normal: cssDurationSchema,
  slow: cssDurationSchema,
  slowest: cssDurationSchema,
});

export const AnimationEasingTokensSchema = z.object({
  default: z.string().min(1),
  bounce: z.string().min(1),
  sharp: z.string().min(1),
});

export const AnimationTokensSchema = z.object({
  duration: AnimationDurationTokensSchema,
  easing: AnimationEasingTokensSchema,
});

export const GlassTokensSchema = z.object({
  blur: cssSizeSchema,
  opacity: z.number().min(0).max(1),
  saturation: cssSizeSchema,
});

export const ZIndexTokensSchema = z.object({
  base: z.number(),
  overlay: z.number(),
  dropdown: z.number(),
  modal: z.number(),
  toast: z.number(),
  tooltip: z.number(),
});

export const ThemeTokensSchema = z.object({
  color: ColorTokensSchema,
  font: FontTokensSchema,
  spacing: SpacingTokensSchema,
  radius: RadiusTokensSchema,
  shadow: ShadowTokensSchema,
  animation: AnimationTokensSchema,
  glass: GlassTokensSchema,
  z: ZIndexTokensSchema,
});

const overlayOverrideSchema = z.object({
  color: ColorTokensSchema.partial().optional(),
  font: FontTokensSchema.deepPartial().optional(),
  spacing: SpacingTokensSchema.partial().optional(),
  radius: RadiusTokensSchema.partial().optional(),
  shadow: ShadowTokensSchema.partial().optional(),
  animation: AnimationTokensSchema.deepPartial().optional(),
  glass: GlassTokensSchema.partial().optional(),
  z: ZIndexTokensSchema.partial().optional(),
});

export const ThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  author: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  parent: z.string().nullable().optional(),
  tokens: ThemeTokensSchema,
  overlayOverrides: z.record(z.string(), overlayOverrideSchema).optional(),
});

export type ColorTokens = z.infer<typeof ColorTokensSchema>;
export type FontTokens = z.infer<typeof FontTokensSchema>;
export type SpacingTokens = z.infer<typeof SpacingTokensSchema>;
export type RadiusTokens = z.infer<typeof RadiusTokensSchema>;
export type ShadowTokens = z.infer<typeof ShadowTokensSchema>;
export type AnimationTokens = z.infer<typeof AnimationTokensSchema>;
export type GlassTokens = z.infer<typeof GlassTokensSchema>;
export type ZIndexTokens = z.infer<typeof ZIndexTokensSchema>;
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;
export type ThemeTokenMap = ThemeTokens;
export type ThemeOverlayOverride = z.infer<typeof overlayOverrideSchema>;
export type Theme = z.infer<typeof ThemeSchema>;

export const THEME_TOKEN_COUNT = 64;

export function validateTheme(theme: unknown): Theme {
  return ThemeSchema.parse(theme);
}

export function countThemeTokens(tokens: ThemeTokens): number {
  const countObject = (obj: Record<string, unknown>): number =>
    Object.values(obj).reduce<number>((sum, value) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return sum + countObject(value as Record<string, unknown>);
      }
      return sum + 1;
    }, 0);

  return countObject(tokens as unknown as Record<string, unknown>);
}
