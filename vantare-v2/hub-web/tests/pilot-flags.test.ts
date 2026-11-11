import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { renderPilotFlags } from "../scripts/pilot-flags";

it("commits exactly the assets derived from native stripe data", async () => {
  const source = await readFile("../native/ui/src/pilot_flag.rs", "utf8");
  const generated = await readFile(
    "src/renderer/assets/generated/pilot-flags.ts",
    "utf8",
  );
  expect(generated.replaceAll("\r\n", "\n")).toBe(renderPilotFlags(source));
});
it("fails closed on an unsupported native arm instead of dropping a country", async () => {
  const source = await readFile("../native/ui/src/pilot_flag.rs", "utf8");
  expect(() =>
    renderPilotFlags(source.replace('"ES" => h(', '"ES" => future(')),
  ).toThrow();
  expect(() =>
    renderPilotFlags(source.replace('"FR" => v(', '"ES" => v(')),
  ).toThrow();
});
