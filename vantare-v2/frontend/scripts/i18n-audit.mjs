import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const localeRoot = path.join(srcRoot, "i18n", "locales");
const fix = process.argv.includes("--fix");
const localeNames = ["es", "en", "pt", "it"];

function walk(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target, predicate);
    return predicate(target) ? [target] : [];
  });
}

const sourceFiles = walk(
  srcRoot,
  (file) => /\.(?:ts|tsx)$/.test(file) && !file.startsWith(localeRoot),
);
const exactReferences = new Set();
const prefixReferences = new Set();

for (const file of sourceFiles) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) && node.text.includes(".")) {
      exactReferences.add(node.text);
    }
    if (ts.isTemplateExpression(node) && node.head.text.includes(".")) {
      prefixReferences.add(node.head.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const localeFiles = walk(localeRoot, (file) => /(?:^|[\\/])(es|en|pt|it)\.ts$/.test(file));
const catalogs = new Map();

for (const file of localeFiles) {
  const locale = path.basename(file, ".ts");
  const group = path.relative(localeRoot, path.dirname(file)) || ".";
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = new Map();
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.name)) {
      entries.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  catalogs.set(`${group}:${locale}`, { file, text, source, entries });
}

const groups = [...new Set([...catalogs.keys()].map((key) => key.split(":")[0]))].sort();
let parityErrors = 0;
const unusedByGroup = new Map();
const allKeysByLocale = new Map(localeNames.map((locale) => [locale, new Set()]));

for (const group of groups) {
  const groupCatalogs = localeNames.map((locale) => catalogs.get(`${group}:${locale}`));
  if (groupCatalogs.some((catalog) => !catalog)) {
    console.error(`Falta un catálogo en ${group}`);
    parityErrors += 1;
    continue;
  }
  const expected = new Set(groupCatalogs[0].entries.keys());
  for (let index = 0; index < localeNames.length; index += 1) {
    const locale = localeNames[index];
    const keys = new Set(groupCatalogs[index].entries.keys());
    for (const key of keys) allKeysByLocale.get(locale).add(key);
    const missing = [...expected].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !expected.has(key));
    if (missing.length || extra.length) {
      console.error(`${group}/${locale}: missing=${missing.join(",")} extra=${extra.join(",")}`);
      parityErrors += missing.length + extra.length;
    }
  }
  const unused = [...expected].filter(
    (key) =>
      !exactReferences.has(key) &&
      ![...prefixReferences].some((prefix) => key.startsWith(prefix)),
  );
  unusedByGroup.set(group, unused);
}

const usedKeys = [...exactReferences].filter((key) =>
  localeNames.some((locale) => allKeysByLocale.get(locale).has(key)),
);
let missingUsed = 0;
for (const key of usedKeys) {
  for (const locale of localeNames) {
    if (!allKeysByLocale.get(locale).has(key)) {
      console.error(`Clave usada ausente en ${locale}: ${key}`);
      missingUsed += 1;
    }
  }
}

const unusedCount = [...unusedByGroup.values()].reduce((sum, keys) => sum + keys.length, 0);
if (fix && !parityErrors && !missingUsed) {
  for (const group of groups) {
    const unused = unusedByGroup.get(group);
    if (!unused.length) continue;
    for (const locale of localeNames) {
      const catalog = catalogs.get(`${group}:${locale}`);
      const lineStarts = catalog.source.getLineStarts();
      const ranges = unused.map((key) => {
        const node = catalog.entries.get(key);
        const startLine = catalog.source.getLineAndCharacterOfPosition(node.getStart(catalog.source)).line;
        const endLine = catalog.source.getLineAndCharacterOfPosition(node.end).line;
        return {
          start: lineStarts[startLine],
          end: endLine + 1 < lineStarts.length ? lineStarts[endLine + 1] : catalog.text.length,
        };
      });
      let next = catalog.text;
      for (const range of ranges.sort((a, b) => b.start - a.start)) {
        next = next.slice(0, range.start) + next.slice(range.end);
      }
      fs.writeFileSync(catalog.file, next);
    }
  }
  console.log(`Eliminadas ${unusedCount} claves huérfanas por idioma.`);
} else {
  console.log(`Paridad: ${parityErrors === 0 ? "OK" : `${parityErrors} errores`}`);
  console.log(`Claves usadas ausentes: ${missingUsed}`);
  console.log(`Claves huérfanas conservadoras: ${unusedCount}`);
  for (const [group, keys] of unusedByGroup) {
    if (keys.length) console.log(`  ${group}: ${keys.length}`);
  }
}

if (parityErrors || missingUsed || (!fix && unusedCount)) process.exitCode = 1;
