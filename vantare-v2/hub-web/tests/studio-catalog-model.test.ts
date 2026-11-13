import { expect, it } from "vitest";
import { studioLimits } from "../src/contract/generated/studio";
import { createMockHost } from "../src/mock/host";
import {
  catalogBlock,
  catalogGroups,
} from "../src/renderer/ui/studio/catalog-model";

function view() {
  const host = createMockHost("studio-base");
  const reply = host({
    kind: "request",
    id: 1,
    request: { method: "studio.get" },
  });
  if (reply?.kind !== "response" || reply.result.method !== "studio.get")
    throw new Error("missing Studio view");
  return reply.result.value;
}

it("searches names and descriptions without accents and combines the exact category", () => {
  const value = view();
  const sample = value.catalog[0];
  value.catalog = [
    {
      ...sample,
      name: "Telemetría",
      about: "Información de vuelta",
      category: "Pilotaje",
    },
    {
      ...sample,
      kind: "delta",
      name: "Otro",
      about: "Información de vuelta",
      category: "Carrera",
    },
  ];
  expect(
    catalogGroups(value, "  TELEMETRIA  ", "")
      .flatMap((group) => group.items)
      .map((widget) => widget.name),
  ).toEqual(["Telemetría"]);
  expect(
    catalogGroups(value, "informacion", "Carrera")
      .flatMap((group) => group.items)
      .map((widget) => widget.name),
  ).toEqual(["Otro"]);
  expect(
    catalogGroups(value, "inexistente", "").every(
      (group) => !group.items.length,
    ),
  ).toBe(true);
});

it("suggests only allowed kinds not already owned and never duplicates a group entry", () => {
  const value = view();
  const groups = catalogGroups(value, "", "");
  expect(
    groups[0].items.every(
      (widget) =>
        widget.allowed &&
        widget.suggested &&
        !value.instances.some((item) => item.kind === widget.kind),
    ),
  ).toBe(true);
  expect(groups[1].items.every((widget) => widget.allowed)).toBe(true);
  expect(groups[2].items.every((widget) => !widget.allowed)).toBe(true);
  expect(
    groups
      .flatMap((group) => group.items)
      .map((widget) => widget.kind)
      .toSorted(),
  ).toEqual(value.catalog.map((widget) => widget.kind).toSorted());
});

it("keeps all add restrictions when the catalogue moves to a modal", () => {
  const value = view();
  const widget = { ...value.catalog[0], allowed: true };
  expect(catalogBlock(value, widget, false)).toBeUndefined();
  expect(catalogBlock({ ...value, state: "protected" }, widget, false)).toBe(
    "protected",
  );
  expect(catalogBlock(value, widget, true)).toBe("pending");
  expect(
    catalogBlock(
      {
        ...value,
        instances: Array.from(
          { length: studioLimits.instances },
          () => value.instances[0],
        ),
      },
      widget,
      false,
    ),
  ).toBe("limit");
  expect(
    catalogBlock(
      { ...value, plan: "free" },
      { ...widget, allowed: false },
      false,
    ),
  ).toBe("pro");
  expect(
    catalogBlock(
      { ...value, plan: "unverified" },
      { ...widget, allowed: false },
      false,
    ),
  ).toBe("unverified");
});
