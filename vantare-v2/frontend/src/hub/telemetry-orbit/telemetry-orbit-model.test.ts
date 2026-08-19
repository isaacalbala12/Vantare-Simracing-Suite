import { describe, expect, it } from "vitest";
import {
  DEMO_CORNERS,
  DEMO_TRACK,
  demoChannels,
  demoDeltaSeries,
  demoInsights,
  demoSectors,
  demoSegments,
  demoTotalDelta,
  formatDelta,
  LAP_METERS,
  readoutAt,
  REFERENCE_SCALE,
  SAMPLES,
} from "./telemetry-orbit-model";

describe("telemetry-orbit-model", () => {
  it("genera 400 muestras deterministas por canal", () => {
    const first = demoChannels(true);
    const second = demoChannels(true);
    expect(first.speed).toHaveLength(SAMPLES);
    expect(first.throttle).toHaveLength(SAMPLES);
    expect(first.brake).toHaveLength(SAMPLES);
    expect(first.steer).toHaveLength(SAMPLES);
    expect(first.speed).toEqual(second.speed);
  });

  it("mantiene la velocidad en el rango del generador", () => {
    const { speed, throttle, brake } = demoChannels(true);
    expect(Math.min(...speed)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...speed)).toBeLessThanOrEqual(250);
    expect(Math.min(...throttle)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...brake)).toBeLessThanOrEqual(100);
  });

  it("acumula el delta una sola vez por curva", () => {
    const series = demoDeltaSeries(1);
    const sum = DEMO_CORNERS.reduce((total, corner) => total + corner.delta, 0);
    expect(series).toHaveLength(SAMPLES);
    expect(series[series.length - 1]).toBeCloseTo(sum, 6);
    // La serie nunca retrocede sin que haya una curva de ganancia.
    expect(series[0]).toBe(0);
  });

  it("reescala deltas, insights y sectores con la referencia", () => {
    const best = demoTotalDelta(REFERENCE_SCALE.best);
    const session = demoTotalDelta(REFERENCE_SCALE.session);
    const pro = demoTotalDelta(REFERENCE_SCALE.pro);
    expect(session).toBeCloseTo(best * 0.85, 6);
    expect(pro).toBeCloseTo(best * 1.6, 6);

    const worst = demoInsights(REFERENCE_SCALE.best)[0];
    const worstPro = demoInsights(REFERENCE_SCALE.pro)[0];
    expect(worstPro.delta).toBeCloseTo(worst.delta * 1.6, 6);
    expect(demoSegments(REFERENCE_SCALE.pro)[0].delta).toBeCloseTo(
      demoSegments(REFERENCE_SCALE.best)[0].delta * 1.6,
      6,
    );
    expect(demoSectors(REFERENCE_SCALE.pro)[0].delta).toBeCloseTo(
      demoSectors(REFERENCE_SCALE.best)[0].delta * 1.6,
      6,
    );
  });

  it("ordena los insights por pérdida y les da tono", () => {
    const insights = demoInsights(1);
    expect(insights).toHaveLength(DEMO_CORNERS.length);
    for (let index = 1; index < insights.length; index += 1) {
      expect(insights[index - 1].delta).toBeGreaterThanOrEqual(insights[index].delta);
    }
    expect(insights[0].corner).toBe("T7");
    expect(insights[0].tone).toBe("loss");
    expect(insights[insights.length - 1].tone).toBe("gain");
  });

  it("reparte las ocho curvas en tres sectores", () => {
    const sectors = demoSectors(1);
    expect(sectors.map((sector) => sector.id)).toEqual(["S1", "S2", "S3"]);
    const total = sectors.reduce((sum, sector) => sum + sector.delta, 0);
    expect(total).toBeCloseTo(demoTotalDelta(1), 6);
  });

  it("dibuja el trazado cerrado con Catmull-Rom", () => {
    expect(DEMO_TRACK).toHaveLength(19 * 12);
    expect(DEMO_TRACK[0]).toEqual([60, 150]);
  });

  it("lee metros y velocidad del cursor", () => {
    const channels = demoChannels(true);
    expect(readoutAt(channels, 0).meters).toBe(0);
    expect(readoutAt(channels, 1).meters).toBe(LAP_METERS);
    expect(readoutAt(channels, 0.5).speed).toBe(Math.round(channels.speed[200]));
    // Fuera de rango se recorta en vez de reventar.
    expect(readoutAt(channels, 2).meters).toBe(LAP_METERS);
    expect(readoutAt(channels, -1).meters).toBe(0);
  });

  it("formatea el delta con signo", () => {
    expect(formatDelta(0.532, 3)).toBe("+0.532");
    expect(formatDelta(-0.04)).toBe("-0.04");
    expect(formatDelta(0)).toBe("0.00");
  });
});
