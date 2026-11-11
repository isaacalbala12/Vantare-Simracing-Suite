import { readFile, writeFile } from "node:fs/promises";

const filtersPath = "../native/hub/src/calendar/ui/proximas.rs";
const sourcePath = "../native/hub/src/calendar/chrome.rs";
const fields: Record<string, string> = {
  l1: "surface-1",
  l2: "surface-2",
  l3: "surface-3",
  el: "surface-elevated",
  hover: "hover",
  active: "active",
  line1: "line-1",
  line2: "line-2",
  line3: "line-3",
  text1: "text-1",
  text2: "text-2",
  text3: "text-3",
  cap: "text-caption",
  accent: "accent",
  accent_fill: "accent-fill",
  accent_bright: "accent-bright",
  accent_tint: "accent-tint",
  hero_ring: "hero-ring",
  selection: "selection",
  button_pressed: "button-pressed",
  ok: "ok",
  warn: "warn",
  err: "err",
};
const classes: Record<string, string> = {
  Hypercar: "hypercar",
  LMP2: "lmp2",
  LMP3: "lmp3",
  LMGT3: "lmgt3",
  GTE: "gte",
};
const color = (hex: string) => `#${hex.replaceAll("_", "").toLowerCase()}`;
export function calendarTokens(source: string, filters: string) {
  const branches = source.split("if light(cx) {")[1]?.split("} else {");
  if (!branches || branches.length < 2)
    throw new Error("Calendar palette branches missing");
  const css = [
    "/* Generated from native/hub/src/calendar/chrome.rs by scripts/calendar-tokens.ts. */",
  ];
  for (const [scheme, branch] of [
    ["light", branches[0]],
    ["dark", branches[1].split("\n    }\n    s.live")[0]],
  ] as const) {
    const values: Record<string, string> = {};
    for (const [field, token] of Object.entries(fields)) {
      const match = branch.match(
        new RegExp(`s\\.${field} = 0x([A-Fa-f0-9_]+);`),
      );
      if (!match)
        throw new Error(`Calendar palette field missing: ${scheme}/${field}`);
      values[token] = color(match[1]);
    }
    for (const [field, token, angle] of [
      ["hero", "grad-hero", 118],
      ["neo", "grad-neo", 145],
      ["button", "grad-button", 180],
      ["button_hover", "grad-button-hover", 180],
    ] as const) {
      const match = branch.match(
        new RegExp(
          `s\\.${field} = ramp\\(0x([A-Fa-f0-9_]+), 0x([A-Fa-f0-9_]+)\\);`,
        ),
      );
      if (!match)
        throw new Error(`Calendar gradient missing: ${scheme}/${field}`);
      values[token] =
        `linear-gradient(${angle}deg, ${color(match[1])} 0%, ${color(match[2])} 100%)`;
    }
    const white = source.match(/s\.on_primary = 0x([A-Fa-f0-9_]+);/);
    if (!white) throw new Error("Calendar primary text missing");
    values["text-on-accent"] = color(white[1]);
    css.push(
      `[data-palette="vantare"][data-scheme="${scheme}"] :is(.v-calendar, .v-calendar-rail),\n[data-palette="classic"][data-scheme="${scheme}"] :is(.v-calendar, .v-calendar-rail) {\n${Object.entries(
        values,
      )
        .map(([token, value]) => `  --${token}: ${value};`)
        .join("\n")}\n}`,
    );
    const classValues = Object.entries(classes).map(([name, token]) => {
      const line = source
        .split("\n")
        .find(
          (line) =>
            line.includes(`"${name}"`) &&
            line.includes(`, ${scheme === "light"})`),
        );
      const match = line?.match(/=> 0x([A-Fa-f0-9_]+),/);
      if (!match)
        throw new Error(`Calendar class color missing: ${scheme}/${name}`);
      return `  --calendar-class-${token}: ${color(match[1])};`;
    });
    css.push(
      `[data-scheme="${scheme}"] :is(.v-calendar, .v-calendar-rail) {\n${classValues.join("\n")}\n}`,
    );
  }
  const filterValues = ["beginner", "intermediate", "advanced"].map((tier) => {
    const match = filters.match(new RegExp(`"${tier}" => 0x([A-Fa-f0-9_]+),`));
    if (!match) throw new Error(`Calendar filter color missing: ${tier}`);
    return `  --calendar-filter-${tier}: ${color(match[1])};`;
  });
  css.push(
    `:is(.v-calendar, .v-calendar-rail) {\n${filterValues.join("\n")}\n}`,
  );
  return `${css.join("\n\n")}\n`;
}
if (import.meta.main)
  await writeFile(
    "src/renderer/design/generated/calendar-tokens.css",
    calendarTokens(
      await readFile(sourcePath, "utf8"),
      await readFile(filtersPath, "utf8"),
    ),
  );
