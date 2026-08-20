import { describe, expect, it } from "vitest";
import { countByLevel, formatLogForClipboard, type LogEntry } from "./useAppLog";

const entry = (seq: number, level: LogEntry["level"], message: string): LogEntry => ({
  seq,
  level,
  message,
  time: `2026-08-20T10:00:0${seq}Z`,
});

describe("registro de la aplicación (ISA-379)", () => {
  it("cuenta los eventos por nivel y el total", () => {
    const counts = countByLevel([
      entry(1, "info", "a"),
      entry(2, "warn", "b"),
      entry(3, "error", "c"),
      entry(4, "error", "d"),
    ]);

    expect(counts).toEqual({ all: 4, info: 1, warn: 1, error: 2 });
  });

  it("una lista vacía cuenta cero en todos los niveles", () => {
    expect(countByLevel([])).toEqual({ all: 0, info: 0, warn: 0, error: 0 });
  });

  // Quien pega esto en un hilo de soporte tiene que ver las mismas líneas que
  // guarda el fichero, no una re-pintura de la interfaz.
  it("copia con el mismo formato que el fichero de registro", () => {
    const text = formatLogForClipboard([
      entry(1, "info", "arranque"),
      entry(2, "error", "storage error: disco lleno"),
    ]);

    expect(text).toBe(
      "2026-08-20T10:00:01Z INFO  arranque\n" +
        "2026-08-20T10:00:02Z ERROR storage error: disco lleno",
    );
  });

  it("copiar una lista vacía no produce una línea en blanco", () => {
    expect(formatLogForClipboard([])).toBe("");
  });
});
