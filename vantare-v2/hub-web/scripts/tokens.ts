import { mkdir, readFile, writeFile } from "node:fs/promises";
export interface Tokens {
  version: number;
  semantic: string[];
  primitives: Record<string, unknown>;
  themes: Record<string, Record<string, Record<string, string>>>;
}
export function render(tokens: Tokens) {
  const css: string[] = [];
  const p = tokens.primitives;
  const geometry = Object.entries(p)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(
      ([key, value]) =>
        `  --${key}: ${value}${key.startsWith("z-") || key.endsWith("opacity") ? "" : "px"};`,
    );
  const spaces = (p.space as number[]).map(
    (value, index) => `  --space-${index + 1}: ${value}px;`,
  );
  const custom = Object.entries((p.css ?? {}) as Record<string, string>).map(
    ([key, value]) => `  --${key}: ${value};`,
  );
  const durations = ((p.duration as number[]) ?? [])
    .slice(0, 3)
    .map(
      (value, index) =>
        `  --dur-${["fast", "base", "slow"][index]}: ${value}ms;`,
    );
  css.push(
    `:root {\n${[...geometry, ...spaces, ...custom, ...durations].join("\n")}\n}`,
  );
  for (const [palette, schemes] of Object.entries(tokens.themes))
    for (const [scheme, values] of Object.entries(schemes)) {
      if (
        Object.keys(values).sort().join() !== [...tokens.semantic].sort().join()
      )
        throw new Error(`Missing semantics: ${palette}/${scheme}`);
      css.push(
        `[data-palette="${palette}"][data-scheme="${scheme}"] {\n  color-scheme: ${scheme};\n${Object.entries(
          values,
        )
          .map(([key, value]) => `  --${key}: ${value};`)
          .join("\n")}\n}`,
      );
    }
  const colors = tokens.semantic
    .filter((name) => !name.startsWith("grad-"))
    .map((name) => `  --color-${name}: var(--${name});`);
  return {
    typescript: `// Generated from design/tokens.json.\nexport const semantic = ${JSON.stringify(tokens.semantic)} as const;\nexport type Semantic = typeof semantic[number];\n`,
    css: `${css.join("\n\n")}\n`,
    theme: `@theme {\n  --*: initial;\n${colors.join("\n")}\n${(p.space as number[]).map((value, index) => `  --spacing-${index + 1}: ${value}px;`).join("\n")}\n}\n`,
  };
}
if (import.meta.main) {
  const tokens: Tokens = JSON.parse(
    await readFile("design/tokens.json", "utf8"),
  );
  const result = render(tokens);
  const output = "src/renderer/design/generated";
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/tokens.css`, result.css);
  await writeFile(`${output}/theme.css`, result.theme);
  await writeFile(`${output}/tokens.ts`, result.typescript);
}
