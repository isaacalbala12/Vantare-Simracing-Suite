import { z } from 'zod';

// ──────────────────────────────────────────────
// Overlay configuration schemas
// ──────────────────────────────────────────────

export const StandingsConfigSchema = z.object({
  rowCount: z.number().int().min(5).max(40).default(20),
  showMulticlass: z.boolean().default(true),
  showGaps: z.boolean().default(true),
  showLastLap: z.boolean().default(true),
  showBestLap: z.boolean().default(true),
  columns: z
    .array(z.enum(['position', 'name', 'car', 'class', 'gap', 'lastLap', 'bestLap', 'interval']))
    .default(['position', 'name', 'gap', 'lastLap']),
  opacity: z.number().min(0).max(1).default(1),
});

export const RelativeConfigSchema = z.object({
  rangeAhead: z.number().int().min(0).max(10).default(3),
  rangeBehind: z.number().int().min(0).max(10).default(3),
  showGaps: z.boolean().default(true),
  colorCoding: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
});

export const OverlayPositionSchema = z.object({
  x: z.number().int().default(0),
  y: z.number().int().default(0),
  width: z.number().int().positive().default(400),
  height: z.number().int().positive().default(600),
  visible: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
});

// ──────────────────────────────────────────────
// Derived TypeScript types
// ──────────────────────────────────────────────

export type StandingsConfig = z.infer<typeof StandingsConfigSchema>;
export type RelativeConfig = z.infer<typeof RelativeConfigSchema>;
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>;
