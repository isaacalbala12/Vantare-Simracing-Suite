import { describe, expect, it } from 'vitest';
import {
  StandingsConfigSchema,
  RelativeConfigSchema,
  OverlayPositionSchema,
} from '../overlay-config';

describe('StandingsConfigSchema', () => {
  it('accepts valid minimal config', () => {
    const result = StandingsConfigSchema.parse({});
    expect(result).toEqual({
      rowCount: 20,
      showMulticlass: true,
      showGaps: true,
      showLastLap: true,
      showBestLap: true,
      columns: ['position', 'name', 'gap', 'lastLap'],
      opacity: 1,
    });
  });

  it('rejects rowCount below 5', () => {
    expect(() => StandingsConfigSchema.parse({ rowCount: 4 })).toThrow();
  });

  it('rejects rowCount above 40', () => {
    expect(() => StandingsConfigSchema.parse({ rowCount: 41 })).toThrow();
  });

  it('rejects opacity below 0', () => {
    expect(() => StandingsConfigSchema.parse({ opacity: -0.1 })).toThrow();
  });

  it('rejects opacity above 1', () => {
    expect(() => StandingsConfigSchema.parse({ opacity: 1.5 })).toThrow();
  });

  it('rejects non-integer rowCount', () => {
    expect(() => StandingsConfigSchema.parse({ rowCount: 5.5 })).toThrow();
  });

  it('rejects invalid column values', () => {
    expect(() =>
      StandingsConfigSchema.parse({ columns: ['position', 'invalid'] }),
    ).toThrow();
  });

  it('accepts all valid column values', () => {
    const result = StandingsConfigSchema.parse({
      columns: ['position', 'name', 'car', 'class', 'gap', 'lastLap', 'bestLap', 'interval'],
    });
    expect(result.columns).toHaveLength(8);
  });
});

describe('RelativeConfigSchema', () => {
  it('accepts valid minimal config', () => {
    const result = RelativeConfigSchema.parse({});
    expect(result).toEqual({
      rangeAhead: 3,
      rangeBehind: 3,
      showGaps: true,
      colorCoding: true,
      opacity: 1,
    });
  });

  it('rejects rangeAhead below 0', () => {
    expect(() => RelativeConfigSchema.parse({ rangeAhead: -1 })).toThrow();
  });

  it('rejects rangeAhead above 10', () => {
    expect(() => RelativeConfigSchema.parse({ rangeAhead: 11 })).toThrow();
  });

  it('rejects rangeBehind below 0', () => {
    expect(() => RelativeConfigSchema.parse({ rangeBehind: -1 })).toThrow();
  });

  it('rejects opacity below 0', () => {
    expect(() => RelativeConfigSchema.parse({ opacity: -0.5 })).toThrow();
  });

  it('rejects opacity above 1', () => {
    expect(() => RelativeConfigSchema.parse({ opacity: 2 })).toThrow();
  });

  it('rejects non-integer range values', () => {
    expect(() => RelativeConfigSchema.parse({ rangeAhead: 2.5 })).toThrow();
  });
});

describe('OverlayPositionSchema', () => {
  it('accepts valid minimal config', () => {
    const result = OverlayPositionSchema.parse({});
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 600,
      visible: true,
      opacity: 1,
    });
  });

  it('rejects non-positive width', () => {
    expect(() => OverlayPositionSchema.parse({ width: 0 })).toThrow();
    expect(() => OverlayPositionSchema.parse({ width: -10 })).toThrow();
  });

  it('rejects non-positive height', () => {
    expect(() => OverlayPositionSchema.parse({ height: 0 })).toThrow();
    expect(() => OverlayPositionSchema.parse({ height: -5 })).toThrow();
  });

  it('rejects non-integer dimensions', () => {
    expect(() => OverlayPositionSchema.parse({ width: 400.5 })).toThrow();
    expect(() => OverlayPositionSchema.parse({ height: 600.5 })).toThrow();
  });

  it('rejects opacity below 0', () => {
    expect(() => OverlayPositionSchema.parse({ opacity: -1 })).toThrow();
  });

  it('rejects opacity above 1', () => {
    expect(() => OverlayPositionSchema.parse({ opacity: 1.1 })).toThrow();
  });

  it('accepts custom position and dimensions', () => {
    const result = OverlayPositionSchema.parse({
      x: 100,
      y: 200,
      width: 800,
      height: 1200,
      visible: false,
      opacity: 0.5,
    });
    expect(result).toEqual({
      x: 100,
      y: 200,
      width: 800,
      height: 1200,
      visible: false,
      opacity: 0.5,
    });
  });
});
