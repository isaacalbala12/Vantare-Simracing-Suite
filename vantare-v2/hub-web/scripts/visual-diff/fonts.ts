import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

export async function auditFontSources() {
  const sha = async (path: string) =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const nativeNames = [400, 500, 600, 650, 700, 750, 800]
    .map((weight) => `Inter-${weight}.ttf`)
    .concat("Rajdhani.ttf", "SpaceMono.ttf");
  const css = await readFile("src/renderer/design/fonts.css", "utf8");
  const web = await Promise.all(
    [...css.matchAll(/url\("([^"]+)"\)/g)].map(async (match) => ({
      file: basename(match[1]),
      sha256: await sha(resolve("src/renderer/design", match[1])),
    })),
  );
  const native = await Promise.all(
    nativeNames.map(async (file) => ({
      file,
      sha256: await sha(`../native/ui/assets/fonts/${file}`),
    })),
  );
  return {
    native,
    web,
    missingOrDifferentNativeFaces: native.filter(
      (face) =>
        !web.some(
          (loaded) =>
            loaded.file === face.file && loaded.sha256 === face.sha256,
        ),
    ),
  };
}
