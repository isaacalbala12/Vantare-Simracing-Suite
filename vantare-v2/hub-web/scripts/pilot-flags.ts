import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
/** Build-time assets only: renderer never imports the GPUI source. */
export function renderPilotFlags(source: string): string {
  const aspect = Number(/pub const ASPECT: f32 = ([0-9.]+);/.exec(source)?.[1]);
  assert.ok(Number.isFinite(aspect) && aspect > 0, "Missing flag aspect");
  const body = source.split("Some(match code.as_str() {")[1]?.split("})")[0];
  assert.ok(body, "Missing native flag table");
  const pattern = /((?:"[A-Z]{2}"\s*\|?\s*)+) => ([hv])\(&\[([\s\S]*?)\]\),/g;
  const flags: Record<string, string> = {};
  let remainder = body;
  for (const match of body.matchAll(pattern)) {
    const stripes = [...match[3].matchAll(/\(0x([0-9a-f_]+),\s*(\d+)\)/g)].map(
      (item) => ({
        color: Number.parseInt(item[1].replaceAll("_", ""), 16)
          .toString(16)
          .padStart(6, "0"),
        weight: Number(item[2]),
      }),
    );
    assert.ok(
      stripes.length && stripes.every((item) => item.weight > 0),
      "Unsupported native stripe",
    );
    const rest = match[3]
      .replace(/\(0x[0-9a-f_]+,\s*\d+\)/g, "")
      .replace(/[\s,]/g, "");
    assert.equal(rest, "", "Unsupported stripe expression");
    const total = stripes.reduce((sum, item) => sum + item.weight, 0);
    let offset = 0;
    const horizontal = match[2] === "h";
    const rectangles = stripes
      .map((item) => {
        const share = item.weight / total;
        const x = horizontal ? 0 : offset * 27,
          y = horizontal ? offset * 18 : 0,
          width = horizontal ? 27 : share * 27,
          height = horizontal ? share * 18 : 18;
        offset += share;
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#${item.color}"/>`;
      })
      .join("");
    assert.equal(aspect, 27 / 18, "Update viewBox to match the native aspect");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27 18">${rectangles}</svg>`;
    for (const code of match[1].matchAll(/"([A-Z]{2})"/g)) {
      assert.equal(flags[code[1]], undefined, "Duplicate country flag");
      flags[code[1]] = svg;
    }
    remainder = remainder.replace(match[0], "");
  }
  assert.equal(
    remainder.replace(/_ => return None,/g, "").trim(),
    "",
    "Unparsed native flag arm",
  );
  assert.ok(Object.keys(flags).length > 0);
  return `// Generated from native/ui/src/pilot_flag.rs. Do not edit.\nexport const pilotFlags: Readonly<Record<string,string>> = ${JSON.stringify(flags, null, 2)};\n`;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const source = await readFile("../native/ui/src/pilot_flag.rs", "utf8");
  await writeFile(
    "src/renderer/assets/generated/pilot-flags.ts",
    renderPilotFlags(source),
  );
}
