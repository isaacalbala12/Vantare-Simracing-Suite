import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const sources = new Map<string, string>();
for (const folder of ["../native/hub/assets/icons", "../native/hub/assets/pit"])
  for (const file of await readdir(folder))
    if (file.endsWith(".svg"))
      sources.set(
        file.slice(0, -4),
        await readFile(`${folder}/${file}`, "utf8"),
      );
const assets = await readFile("../native/hub/src/shell/assets.rs", "utf8");
for (const match of assets.matchAll(
  /"icons\/(v-[^"]+)\.svg",\s*br#"([\s\S]*?)"#/g,
))
  sources.set(match[1], match[2]);
const properties: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  "clip-path": "clipPath",
  "stroke-opacity": "strokeOpacity",
  "fill-opacity": "fillOpacity",
};
const entries: string[] = [];
for (const [name, svg] of [...sources].sort()) {
  if (/<(script|foreignObject)|\bon\w+=|(?:href|url\()/i.test(svg))
    throw new Error(`Unsafe SVG: ${name}`);
  let body = svg
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  body = body.replace(/(?:fill|stroke)="(?!none|currentColor)[^"]+"/g, (attr) =>
    attr.replace(/="[^"]+"/, '="currentColor"'),
  );
  for (const [from, to] of Object.entries(properties))
    body = body.replaceAll(`${from}=`, `${to}=`);
  body = body
    .replace(/<svg[^>]*>/, (tag) =>
      tag.replace(/\s(?:width|height)="[^"]*"/g, ""),
    )
    .replace(
      "<svg ",
      '<svg width="20" height="20" aria-hidden="true" focusable="false" ',
    );
  entries.push(`  ${JSON.stringify(name)}: (${body}),`);
}
const output = "src/renderer/assets/icons";
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/Icon.tsx`,
  `// Generated from native Hub SVG assets.\nconst icons = {\n${entries.join("\n")}\n} as const;\nexport type IconName = keyof typeof icons;\nexport function Icon({name}:{name:IconName}) { return icons[name]; }\n`,
);
