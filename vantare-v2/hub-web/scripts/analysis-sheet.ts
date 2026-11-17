import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
/** A review sheet must remain viewable after copying just its HTML file. */
export async function writeAnalysisSheet(output: string, html: string) {
  const files = [
    ...new Set(
      [...html.matchAll(/src="([^"]+\.png)"/g)].map((match) => match[1]),
    ),
  ];
  for (const file of files) {
    const data = await readFile(resolve(output, file));
    html = html.replaceAll(
      `src="${file}"`,
      `src="data:image/png;base64,${data.toString("base64")}"`,
    );
  }
  await writeFile(resolve(output, "comparacion.html"), html);
}
