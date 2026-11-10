import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const defaultRoot = new URL("../src/contract/", import.meta.url);
export function contractIndex(root = defaultRoot): void {
  const directory = new URL("generated/", root);
  const ids = readdirSync(directory)
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        name !== "contract.ts" &&
        name !== "validators.ts",
    )
    .map((name) => name.slice(0, -3))
    .sort();
  const sources = ids.map((id) => ({
    id,
    text: readFileSync(new URL(`${id}.ts`, directory), "utf8"),
  }));
  if (ids.some((id) => !/^[a-z]+(?:_[a-z]+)*$/.test(id)))
    throw new Error("Invalid contract module id");
  const validationIds = readdirSync(new URL("modules/", root))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.slice(0, -3))
    .sort();
  if (JSON.stringify(ids) !== JSON.stringify(validationIds))
    throw new Error("Contract modules and validators must match exactly");
  let text = "// Generated index. Run bun run contract:index.\n";
  for (const { id } of sources) text += `export * from "./${id}";\n`;
  for (const kind of ["Request", "Reply", "HostError", "Topic", "Event"]) {
    const names = sources.flatMap(({ id, text }) =>
      [...text.matchAll(/^export type (\w+) /gm)]
        .map((match) => match[1])
        .filter(
          (name) =>
            name ===
            id
              .split("_")
              .map((part) => part[0].toUpperCase() + part.slice(1))
              .join("") +
              kind,
        )
        .sort(),
    );
    if (names.length === 0) throw new Error(`Missing closed union: ${kind}`);
    for (const { id, text: source } of sources) {
      const owned = names.filter((name) =>
        source.includes(`export type ${name} =`),
      );
      if (owned.length)
        text += `import type { ${owned.join(", ")} } from "./${id}";\n`;
    }
    text += `export type ${kind} = ${names.join(" | ")};\n`;
  }
  for (const [kind, suffix] of [
    ["methods", "Methods"],
    ["topics", "Topics"],
  ]) {
    const owners = sources.filter(({ text }) => text.includes(`${suffix} =`));
    for (const { id } of owners)
      text += `import { ${id}${suffix} } from "./${id}";\n`;
    text += `export const ${kind} = [${owners.map(({ id }) => `...${id}${suffix}`).join(", ")}] as const;\n`;
  }
  writeFileSync(new URL("contract.ts", directory), text);
  const corpus: { host: unknown[]; ui: unknown[] } = { host: [], ui: [] };
  for (const id of ids) {
    const sample = JSON.parse(
      readFileSync(new URL(`corpus/${id}.json`, directory), "utf8"),
    ) as typeof corpus;
    corpus.host.push(...sample.host);
    corpus.ui.push(...sample.ui);
  }
  writeFileSync(
    new URL("corpus.json", directory),
    `${JSON.stringify(corpus, null, 2)}\n`,
  );
  let validators = "// Generated index. Run bun run contract:index.\n";
  for (const id of ids) {
    // Missing validators are a build failure, never a permissive fallback.
    readFileSync(new URL(`modules/${id}.ts`, root), "utf8");
    validators += `import * as ${id} from "../modules/${id}";\n`;
  }
  validators += `export const validators = [${ids.join(", ")}] as const;\n`;
  writeFileSync(new URL("validators.ts", directory), validators);
  mkdirSync(new URL("mocks/", directory), { recursive: true });
  let mocks = "// Generated index. Run bun run contract:index.\n";
  for (const id of ids)
    mocks += `import * as ${id} from "../../../mock/modules/${id}";\n`;
  mocks += `export const mockModules = [${ids.join(", ")}] as const;\n`;
  writeFileSync(new URL("mocks/index.ts", directory), mocks);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) contractIndex();
