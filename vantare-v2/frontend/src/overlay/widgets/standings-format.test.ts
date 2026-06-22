import { describe, expect, it } from "vitest";
import type { ColumnConfig } from "../../lib/profile";
import {
  formatStandingsDriverName,
  formatStandingsLapTime,
  getStandingsColumnAlign,
  getStandingsColumnColor,
  getStandingsColumnWidth,
  getStandingsIntrinsicWidth,
  getStandingsJustifyClass,
} from "./standings-format";

function column(overrides: Partial<ColumnConfig> = {}): ColumnConfig {
  return { id: "driverName", metricId: "driverName", enabled: true, ...overrides };
}

describe("standings-format", () => {
  describe("formatStandingsDriverName", () => {
    it("returns the full name when format mode is not truncate", () => {
      expect(formatStandingsDriverName("ALPINE", column())).toBe("ALPINE");
      expect(formatStandingsDriverName(undefined, column())).toBe("?");
    });

    it("truncates the name to maxChars when mode is truncate", () => {
      const c = column({ format: { mode: "truncate", maxChars: 6 } });
      expect(formatStandingsDriverName("ALPINE", c)).toBe("ALPINE");
      expect(formatStandingsDriverName("CADILLAC RACING", c)).toBe("CADIL…");
    });

    it("clamps maxChars to a minimum of 2 and maximum of 64", () => {
      expect(formatStandingsDriverName("AB", column({ format: { mode: "truncate", maxChars: 1 } }))).toBe("…");
      const long = "A".repeat(80);
      const c = column({ format: { mode: "truncate", maxChars: 100 } });
      expect(formatStandingsDriverName(long, c).length).toBe(64);
    });
  });

  describe("formatStandingsLapTime", () => {
    it("renders full lap time with default 3 decimals", () => {
      const c = column({ id: "bestLap", metricId: "bestLap" });
      expect(formatStandingsLapTime(89.455, c)).toBe("1:29.455");
    });

    it("renders compact lap time when display is compact", () => {
      const c = column({ id: "bestLap", metricId: "bestLap", format: { display: "compact", decimals: 2 } });
      expect(formatStandingsLapTime(89.455, c)).toBe("29.46");
    });

    it("respects decimals 0", () => {
      const c = column({ id: "bestLap", metricId: "bestLap", format: { display: "full", decimals: 0 } });
      expect(formatStandingsLapTime(89.455, c)).toBe("1:29");
    });

    it("returns dash for missing or non-positive seconds", () => {
      const c = column({ id: "bestLap", metricId: "bestLap" });
      expect(formatStandingsLapTime(undefined, c)).toBe("-");
      expect(formatStandingsLapTime(0, c)).toBe("-");
    });

    it("carries over seconds >= 60 to the next minute", () => {
      const c = column({ id: "bestLap", metricId: "bestLap", format: { display: "full", decimals: 3 } });
      expect(formatStandingsLapTime(89.999, c)).toBe("1:30.000");
    });
  });

  describe("getStandingsColumnWidth", () => {
    it("returns the column width when present", () => {
      expect(getStandingsColumnWidth(column({ width: 220 }), 100)).toBe(220);
    });

    it("falls back to the provided fallback when width is missing", () => {
      expect(getStandingsColumnWidth(column(), 132)).toBe(132);
    });

    it("clamps to a minimum of 6 px", () => {
      expect(getStandingsColumnWidth(column({ width: 0 }), 100)).toBe(6);
      expect(getStandingsColumnWidth(column({ width: -5 }), 100)).toBe(6);
    });
  });

  describe("getStandingsColumnColor", () => {
    it("returns the style color when present", () => {
      expect(getStandingsColumnColor(column({ style: { color: "#ffcc00" } }), "#FFFFFF")).toBe("#ffcc00");
    });

    it("falls back when color is missing", () => {
      expect(getStandingsColumnColor(column(), "#FFFFFF")).toBe("#FFFFFF");
    });
  });

  describe("getStandingsColumnAlign", () => {
    it("returns the style align when valid", () => {
      expect(getStandingsColumnAlign(column({ style: { align: "right" } }), "left")).toBe("right");
    });

    it("falls back when align is invalid or missing", () => {
      expect(getStandingsColumnAlign(column(), "left")).toBe("left");
      expect(getStandingsColumnAlign(column({ style: { align: "diagonal" } }), "center")).toBe("center");
    });
  });

  describe("getStandingsJustifyClass", () => {
    it("maps align to tailwind justify classes", () => {
      expect(getStandingsJustifyClass("left")).toBe("justify-start text-left");
      expect(getStandingsJustifyClass("center")).toBe("justify-center text-center");
      expect(getStandingsJustifyClass("right")).toBe("justify-end text-right");
    });
  });

  describe("getStandingsIntrinsicWidth", () => {
    it("sums enabled column widths plus horizontal padding", () => {
      const columns: ColumnConfig[] = [
        { id: "position", metricId: "position", enabled: true, width: 28 },
        { id: "driverName", metricId: "driverName", enabled: true, width: 132 },
        { id: "bestLap", metricId: "bestLap", enabled: false, width: 76 },
      ];
      const width = getStandingsIntrinsicWidth(columns);
      expect(width).toBe(28 + 132 + 32);
    });

    it("uses fallback widths from the standings catalog when width is missing", () => {
      const columns: ColumnConfig[] = [
        { id: "position", metricId: "position", enabled: true },
        { id: "driverName", metricId: "driverName", enabled: true },
      ];
      const width = getStandingsIntrinsicWidth(columns);
      expect(width).toBe(28 + 132 + 32);
    });
  });
});
