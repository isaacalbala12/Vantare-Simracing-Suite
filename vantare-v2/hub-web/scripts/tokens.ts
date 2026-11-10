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
  css.push(
    `:root {\n${[...geometry, ...spaces].join("\n")}\n  --font-sans: Inter, "Segoe UI Variable", "Segoe UI", sans-serif;\n  --font-display: Rajdhani, sans-serif;\n  --font-mono: "Cascadia Code", Consolas, "Space Mono", monospace;\n  --contrast: 1; --glass: .8; --density: 1;\n  --rail-w: clamp(320px, 22vw, 400px);\n  --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 260ms;\n  --ease-standard: cubic-bezier(.2,0,0,1);\n}`,
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
  await writeFile(
    `${output}/tokens.ts`,
    `// Generated from design/tokens.json.\nexport const semantic = ${JSON.stringify(tokens.semantic)} as const;\nexport type Semantic = typeof semantic[number];\n`,
  );
}
