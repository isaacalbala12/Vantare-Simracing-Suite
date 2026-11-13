import { PNG } from "pngjs";
import { expect, it } from "vitest";
import { validateReferenceState } from "../scripts/visual-diff/reference-state";

function window(expanded: boolean) {
  const image = new PNG({ width: 320, height: 100 });
  image.data.fill(255);
  for (let y = 8; y < 44; y++)
    for (let x = 10; x < (expanded ? 260 : 60); x++) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = expanded ? 0 : 216;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
    }
  return PNG.sync.write(image);
}
it.each([false, true])(
  "rejects an ineffective native sidebar toggle (expanded=%s)",
  (expanded) => {
    expect(() =>
      validateReferenceState(
        "ajustes-aplicacion",
        window(expanded),
        window(expanded),
        expanded,
      ),
    ).not.toThrow();
    expect(() =>
      validateReferenceState(
        "ajustes-aplicacion",
        window(!expanded),
        window(expanded),
        expanded,
      ),
    ).toThrow();
  },
);
it("rejects an expired or different calendar fixture even with the right dimensions and sidebar", () => {
  const png = window(true);
  const valid = {
    calendar_spec: "state=ok;view=proximas",
    native_scene: "calendario-base",
  };
  expect(() =>
    validateReferenceState("calendario-r6-proximas", png, png, true, valid),
  ).not.toThrow();
  for (const bank of [
    undefined,
    { ...valid, calendar_spec: "state=expired;view=proximas" },
    { ...valid, calendar_spec: "state=ok;view=mes" },
    { ...valid, native_scene: "calendario-r6-proximas" },
  ])
    expect(() =>
      validateReferenceState("calendario-r6-proximas", png, png, true, bank),
    ).toThrow();
});
