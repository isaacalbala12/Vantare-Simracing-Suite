import { mkdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  discoverDeclarationModules,
  renderGeneratedBarrel,
} from "./generate-official-design-declarations.mjs";

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DESIGN_SYSTEMS_RELATIVE = "src/overlay/design-systems";

function assertKebabCase(label, value) {
  if (typeof value !== "string" || !KEBAB_CASE.test(value)) {
    throw new Error(`${label} must be kebab-case`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function titleFromId(id) {
  return id.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
}

function identifierFromId(id) {
  const title = titleFromId(id).replaceAll(" ", "");
  return `${title[0].toLowerCase()}${title.slice(1)}Design`;
}

function renderDeclaration({ design, name, widget, system, settings, registration }) {
  const exportName = identifierFromId(design);
  const visual = JSON.stringify(settings, null, 2).split("\n").map((line, index) => index === 0 ? line : `      ${line}`).join("\n");
  return `import { defineOfficialWidgetDesign } from "../../../official-design-declaration";
import { designSystemRegistry } from "../../../../core/design-system-registry";
import { widgetTypeRegistry } from "../../../../core/widget-registry";

const systemDefinition = designSystemRegistry.get(${JSON.stringify(system)}, ${registration.systemVersion});
const registration = systemDefinition.widgets.find((candidate) => candidate.widgetType === ${JSON.stringify(widget)});
if (!registration) {
  throw new Error(${JSON.stringify(`missing productive registration: ${system}@${registration.systemVersion}/${widget}`)});
}

// Authoring skeleton: customize only supported visual settings. Rendering remains product-owned.
export const ${exportName} = defineOfficialWidgetDesign({
  design: {
    id: ${JSON.stringify(design)},
    name: ${JSON.stringify(name)},
    widgetType: ${JSON.stringify(widget)},
    systemId: ${JSON.stringify(system)},
    systemVersion: ${registration.systemVersion},
    configVersion: ${registration.configVersion},
    visual: ${visual},
    includesContent: false,
    origin: "vantare",
  },
  registration,
  defaultSize: widgetTypeRegistry.get(${JSON.stringify(widget)}).capabilities.defaultSize,
  scenarios: ["ready", "stale", "disconnected", "error"],
});

export const officialWidgetDesignDeclarations = [${exportName}] as const;
`;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function workshopUrl(widget, system, design) {
  const params = new URLSearchParams({
    widget,
    system,
    design,
    state: "ready",
    surface: "studio",
    variant: "default",
  });
  return `http://localhost:5173/workshop?${params}`;
}

export async function scaffoldOverlayDesign(options, dependencies) {
  const { widget, system, design } = options;
  assertKebabCase("widget", widget);
  assertKebabCase("system", system);
  assertKebabCase("design", design);
  if (!system.startsWith("vantare-")) throw new Error("system must belong to the vantare-* product registry");
  const name = options.name ?? titleFromId(design);
  if (typeof name !== "string" || name.trim() === "") throw new Error("name must not be empty");
  const requestedSettings = options.settings ?? {};
  if (!isRecord(requestedSettings)) throw new Error("settings must be a JSON object");

  const catalog = dependencies.catalog;
  if (catalog.designs.some((candidate) => candidate.id === design)) {
    throw new Error(`official design id already exists: ${design}`);
  }
  const registration = catalog.resolve(widget, system);
  const settings = registration.parseSettings(structuredClone(requestedSettings));
  if (!isRecord(settings)) throw new Error("productive settings parser returned an invalid result");
  if (Object.keys(settings).some((key) => key.toLowerCase().includes("diagnostic"))) {
    throw new Error("unsupported visual form; implement and register the renderer form in a prior cut");
  }

  const frontendRoot = path.resolve(options.frontendRoot);
  const systemsRoot = path.join(frontendRoot, ...DESIGN_SYSTEMS_RELATIVE.split("/"));
  const parentDirectory = path.join(systemsRoot, system, widget);
  if (!(await exists(parentDirectory))) {
    throw new Error(`unsupported widget/system source path: ${system}/${widget}`);
  }
  const targetDirectory = path.join(parentDirectory, design);
  const declarationPath = path.join(targetDirectory, "official-designs.ts");
  if (await exists(targetDirectory)) throw new Error(`target already exists: ${targetDirectory}`);

  const currentModules = await discoverDeclarationModules(frontendRoot);
  const targetModule = `./${[system, widget, design, "official-designs"].join("/")}`;
  const nextModules = [...currentModules, targetModule].sort((left, right) => left.localeCompare(right, "en"));
  const barrelPath = path.join(systemsRoot, "official-design-declarations.generated.ts");
  const barrelBefore = await readFile(barrelPath, "utf8");
  const barrelAfter = renderGeneratedBarrel(nextModules);
  const declaration = renderDeclaration({ design, name: name.trim(), widget, system, settings, registration });
  const url = workshopUrl(widget, system, design);
  const output = [
    options.dryRun ? "DRY RUN - no files written" : "Overlay design declaration created",
    `Declaration: ${declarationPath}`,
    `Generated barrel: ${barrelPath}`,
    "Start Workshop: corepack pnpm --dir frontend dev",
    `Open: ${url}`,
  ].join("\n");
  if (options.dryRun) {
    return { written: false, declarationPath, barrelPath, workshopUrl: url, output };
  }

  let createdDirectory = false;
  let createdDeclaration = false;
  let barrelAttempted = false;
  try {
    await mkdir(targetDirectory);
    createdDirectory = true;
    await writeFile(declarationPath, declaration, { encoding: "utf8", flag: "wx" });
    createdDeclaration = true;
    barrelAttempted = true;
    await writeFile(barrelPath, barrelAfter, "utf8");
    dependencies.afterBarrelWrite?.();
    return { written: true, declarationPath, barrelPath, workshopUrl: url, output };
  } catch (error) {
    if (barrelAttempted) await writeFile(barrelPath, barrelBefore, "utf8");
    if (createdDeclaration) await rm(declarationPath, { force: true });
    if (createdDirectory) await rmdir(targetDirectory);
    throw error;
  }
}

async function loadProductCatalog(frontendRoot) {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: frontendRoot,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true },
  });
  try {
    const [official, systems, widgets] = await Promise.all([
      server.ssrLoadModule("/src/overlay/design-systems/official-designs.ts"),
      server.ssrLoadModule("/src/overlay/core/design-system-registry.ts"),
      server.ssrLoadModule("/src/overlay/core/widget-registry.ts"),
    ]);
    return {
      designs: official.listOfficialDesigns(),
      resolve(widget, system) {
        const definitions = systems.designSystemRegistry.list().filter((candidate) => candidate.id === system);
        if (definitions.length !== 1) {
          throw new Error(`unsupported widget/system registration: ${widget}/${system}`);
        }
        const definition = definitions[0];
        const registration = definition.widgets.find((candidate) => candidate.widgetType === widget);
        if (!registration) throw new Error(`unsupported widget/system registration: ${widget}/${system}`);
        return {
          systemVersion: definition.version,
          configVersion: registration.configVersion,
          defaultSettings: registration.defaultSettings,
          parseSettings: registration.parseSettings,
          defaultSize: widgets.widgetTypeRegistry.get(widget).capabilities.defaultSize,
        };
      },
    };
  } finally {
    await server.close();
  }
}

function parseCli(argv) {
  const options = {
    frontendRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    settings: {},
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--dry-run") options.dryRun = true;
    else if (["--widget", "--system", "--design", "--name", "--settings", "--root"].includes(argument) && argv[index + 1]) {
      const value = argv[++index];
      if (argument === "--settings") options.settings = JSON.parse(value);
      else if (argument === "--root") options.frontendRoot = path.resolve(value);
      else options[argument.slice(2)] = value;
    } else throw new Error(`unknown or incomplete argument: ${argument}`);
  }
  for (const required of ["widget", "system", "design"]) {
    if (!options[required]) throw new Error(`missing required argument: --${required}`);
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const catalog = await loadProductCatalog(options.frontendRoot);
  const result = await scaffoldOverlayDesign(options, { catalog });
  console.log(result.output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
