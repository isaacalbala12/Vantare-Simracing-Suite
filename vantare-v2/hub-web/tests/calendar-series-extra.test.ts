import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import fixture from "../fixtures/calendar-demo.json";
import {
  relativeDay,
  seriesRules,
} from "../src/renderer/screens/calendar/series";

it("projects GPUI rule translations and real phase lengths", () => {
  const series = {
    ...fixture.series[0],
    licenseLabel: "Bronze SR",
    setup: "open",
    assists: "Low assists allowed",
    tyreWarmers: false,
    tyres: null,
    splits: null,
    sessions: [
      { name: "practice", durationMin: 2, estimated: true },
      { name: "qualifying", durationMin: 12, estimated: true },
      { name: "race", durationMin: 35, estimated: false },
    ],
  };
  const rules = Object.fromEntries(seriesRules(series));
  expect(rules.Licencia).toBe("Bronce SR");
  expect(rules.Reglaje).toBe("Libre");
  expect(rules.Ayudas).toBe("Pocas permitidas");
  expect(rules.Calentadores).toBe("No");
  expect(rules.Neumáticos).toBe("—");
  expect(rules.Divisiones).toBe("—");
  expect(rules.Sesiones).toBe("P 2′ · Q 12′ · R 35 min");
  expect(
    Object.fromEntries(
      seriesRules({
        ...series,
        licenseLabel: "Silver",
        setup: "fixed",
        assists: "High assists allowed",
        tyreWarmers: true,
        splits: 20,
      }),
    ),
  ).toMatchObject({
    Licencia: "Plata",
    Reglaje: "Fijo",
    Ayudas: "Todas permitidas",
    Calentadores: "Sí",
    Divisiones: "hasta 20",
  });
});
it("distinguishes today, tomorrow and another UTC date", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  expect(relativeDay(Date.parse("2026-10-24T00:00:00Z"), now, true)).toBe(
    "hoy",
  );
  expect(relativeDay(Date.parse("2026-10-25T00:00:00Z"), now, true)).toBe(
    "mañana",
  );
  expect(relativeDay(Date.parse("2026-10-26T00:00:00Z"), now, true)).toBe(
    "lun 26",
  );
});
it("groups both repeated local hours and the spring jump without changing the racing night", () => {
  const source = pathToFileURL(
    resolve("src/renderer/screens/calendar/series.ts"),
  ).href;
  const bands = pathToFileURL(
    resolve("src/renderer/screens/calendar/bands.ts"),
  ).href;
  const script = `import {slotGroups,relativeDay} from ${JSON.stringify(source)};import {bandCovers} from ${JSON.stringify(bands)};const fold=['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z','2026-10-25T02:00:00Z'].map(Date.parse);const spring=['2026-03-29T00:30:00Z','2026-03-29T01:00:00Z'].map(Date.parse);const band={from:120,to:180,days:'weekdays',mode:'first',seriesId:'qa'};console.log(JSON.stringify({fold:slotGroups(fold,Date.parse('2026-10-24T12:00:00Z'),false).map(g=>[g.label,g.starts.length]),spring:slotGroups(spring,Date.parse('2026-03-28T12:00:00Z'),false).map(g=>[g.label,g.starts.length]),covers:fold.map(at=>bandCovers(band,at))}));`;
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { encoding: "utf8", env: { ...process.env, TZ: "Europe/Madrid" } },
    ),
  );
  expect(result.fold).toEqual([
    ["hoy", 2],
    ["mañana", 1],
  ]);
  expect(result.spring).toEqual([
    ["hoy", 1],
    ["mañana", 1],
  ]);
  expect(result.covers).toEqual([true, true, false]);
});
