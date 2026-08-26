import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertNoHorizontalOverflow } from "./orbit-overflow-assert.mjs";
import { hideToasts, settle, stillPage } from "./lib/orbit-still.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/04-studio");
const port = 5196;
const base = `http://127.0.0.1:${port}/orbit-studio-harness.html`;
const url = (query = "") => `${base}?view=studio${query}`;

const shots = [
  { name: "1920x1080", width: 1920, height: 1080, query: "" },
  { name: "1920x900", width: 1920, height: 900, query: "" },
  { name: "1920x1080-dock-cerrado", width: 1920, height: 1080, query: "&rightDock=closed" },
  { name: "1920x1080-estres", width: 1920, height: 1080, query: "&stress=1" },
  // Selección real: el inspector con sus cuatro acordeones y la etiqueta
  // `delta · w × h` sobre el widget del lienzo.
  { name: "1920x1080-seleccion", width: 1920, height: 1080, query: "", select: "delta" },
  // Standings seleccionado con el acordeón de contenido abierto: es la "zona
  // fea" del feedback (A5) y a la vez el caso donde el marco no se ceñía al
  // widget (A1) y la etiqueta se iba de paseo (A2).
  {
    name: "1920x1080-standings-contenido",
    width: 1920,
    height: 1080,
    query: "",
    select: "standings",
    revealContent: true,
  },
  // Widget oculto (A4): la fila sigue legible y con el ojo accionable, y en el
  // lienzo la etiqueta lo marca y ofrece "Mostrar".
  {
    name: "1920x1080-oculto",
    width: 1920,
    height: 1080,
    query: "",
    hide: "relative",
    select: "relative",
  },
  // Ancho reducido (D-R4-4). Son los dos escalones del solape que reporto
  // Isaac: a 1440 el inspector sigue desplegado pero estrecho y la toolbar
  // pierde el rotulo de Browser View; a 1280 el inspector se pliega solo y la
  // statusbar lo avisa. En ambos ningun control de la toolbar puede pisar la
  // columna del inspector.
  {
    name: "1440x900-estrecho",
    width: 1440,
    height: 900,
    query: "",
    expectDockWidth: 320,
  },
  {
    name: "1280x720-inspector-plegado",
    width: 1280,
    height: 720,
    query: "",
    expectDockClosed: true,
  },
  // Studio > Mis perfiles con la piel Orbit: mismo destino que usa la shell
  // real (`navigate("studio", "profiles")`).
  {
    name: "perfiles-1920x1080",
    file: "orbit-perfiles-1920x1080.png",
    width: 1920,
    height: 1080,
    query: "&studio=profiles",
    profiles: true,
  },
];

fs.mkdirSync(output, { recursive: true });

function portOwners() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
  ], { encoding: "utf8", windowsHide: true });
  return result.stdout.trim().split(",").map((value) => value.trim()).filter(Boolean);
}

const owners = portOwners();
if (owners.length) throw new Error(`port ${port} already owned by ${owners.join(", ")}`);

const server = spawn(process.execPath, [
  path.join(frontend, "node_modules", "vite", "bin", "vite.js"),
  "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], {
  cwd: frontend,
  // El Studio necesita perfiles reales: sin el runtime simulado el navegador
  // limpio nunca recibe `hub:list` ni el documento del perfil activo.
  env: { ...process.env, VITE_RUNTIME_MOCK: "mock" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  detached: process.platform !== "win32",
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function stopServer() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(url(), (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit studio harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const shot of shots) {
    const page = await stillPage(browser, {
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
    });
    const problems = [];
    const isWailsRuntimeNoise = (error) => (error.stack ?? "").includes("wailsio_runtime");
    page.on("pageerror", (error) => {
      if (!isWailsRuntimeNoise(error)) problems.push(`pageerror: ${error.message}`);
    });

    await page.goto(url(shot.query), { waitUntil: "networkidle" });

    if (shot.profiles) {
      await page.getByTestId("orbit-profiles").waitFor();
      await page.getByTestId("orbit-profiles-grid").waitFor();
      await hideToasts(page);
      await settle(page);

      const own = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="orbit-profiles"]');
        const grid = document.querySelector('[data-testid="orbit-profiles-grid"]');
        return {
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          cards: document.querySelectorAll('[data-testid^="orbit-profiles-card-"]').length,
          gridOverflows: grid ? grid.scrollHeight > grid.clientHeight + 1 : false,
          nativeTitles: root ? root.querySelectorAll("[title]").length : -1,
          heading: root?.querySelector("h2")?.textContent?.trim() ?? "",
          back: Boolean(document.querySelector('[data-testid="orbit-profiles-back"]')),
          create: Boolean(document.querySelector('[data-testid="orbit-profiles-create"]')),
        };
      });

      if (own.scrollHeight > own.innerHeight) {
        throw new Error(`${shot.name}: la pagina hace scroll vertical (${own.scrollHeight} > ${own.innerHeight})`);
      }
      if (own.scrollWidth > own.innerWidth) {
        throw new Error(`${shot.name}: la pagina hace scroll horizontal`);
      }
      if (own.cards < 1) {
        throw new Error(`${shot.name}: no hay tarjetas de perfil`);
      }
      if (own.gridOverflows) {
        throw new Error(`${shot.name}: la rejilla desborda con ${own.cards} perfiles`);
      }
      if (own.nativeTitles !== 0) {
        throw new Error(`${shot.name}: la vista usa title nativo (${own.nativeTitles})`);
      }
      await assertNoHorizontalOverflow(page, shot.name);
      if (!own.back || !own.create) {
        throw new Error(`${shot.name}: falta el enlace de volver o el boton de nuevo perfil`);
      }
      if (!own.heading) {
        throw new Error(`${shot.name}: la cabecera no tiene h2`);
      }
      if (problems.length) {
        throw new Error(`${shot.name}: la consola no esta limpia\n${problems.join("\n")}`);
      }

      await hideToasts(page);

      await settle(page);
      await page.screenshot({ path: path.join(output, shot.file), fullPage: false });
      await page.close();
      continue;
    }

    await page.getByTestId("orbit-studio").waitFor();
    await page.getByTestId("orbit-studio-widget-list").waitFor();
    await page.getByTestId("orbit-studio-topbar-controls").waitFor();
    await page.getByTestId("orbit-studio-stage").waitFor();
    if (shot.hide) {
      await page.getByTestId(`orbit-studio-widget-eye-${shot.hide}`).click();
      await page
        .locator(`[data-testid="orbit-studio-widget-item-${shot.hide}"][data-enabled="false"]`)
        .waitFor();
    }
    if (shot.select) {
      const row = page.getByTestId(`orbit-studio-widget-item-${shot.select}`);
      await row.waitFor();
      await row.getByRole("option").click();
      await page.getByTestId("orbit-studio-selection-tag").waitFor();
    }
    if (shot.revealContent) {
      const columns = page.getByTestId("studio-standings-columns");
      await columns.waitFor();
      await columns.scrollIntoViewIfNeeded();
    }

    await hideToasts(page);

    await settle(page);

    const contract = await page.evaluate((selected) => {
      const studio = document.querySelector('[data-testid="orbit-studio"]');
      // `offsetHeight` y no `getBoundingClientRect()`: bajo el `zoom` de la
      // shell (ventanas por debajo de 1180x790) el rect va en px reales y las
      // alturas del briefing —60 de toolbar, 39 de statusbar— son de
      // maquetación.
      const box = (selector) => {
        const node = document.querySelector(selector);
        return node ? node.offsetHeight : -1;
      };
      const dock = document.querySelector('[data-testid="orbit-studio-dock"]');
      return {
        scrollHeight: document.documentElement.scrollHeight,
        // El viewport comparable con `scrollWidth/Height` es el de maquetación:
        // bajo `zoom` `innerWidth/Height` van en px reales y no coinciden.
        innerHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: document.documentElement.clientWidth,
        toolbar: box('[data-testid="orbit-studio-toolbar"]'),
        statusbar: box('[data-testid="orbit-studio-statusbar"]'),
        dockOpen: studio?.getAttribute("data-right-dock") === "open",
        dockWidth: dock && !dock.hasAttribute("hidden")
          ? Math.round(dock.getBoundingClientRect().width)
          : 0,
        widgetRows: document.querySelectorAll('[data-testid^="orbit-studio-widget-item-"]').length,
        nativeTitles: studio ? studio.querySelectorAll("[title]").length : -1,
        columnTitles: document.querySelectorAll('.orbit-column [title]').length,
        // La columna del Studio es solo la lista de widgets: ni carreras, ni
        // perfil de overlay, ni launcher (briefing 04).
        columnBlocks: document.querySelectorAll('[data-testid="orbit-column-blocks"] [data-block]').length,
        // La lista ocupa la altura disponible y el pie "Anadir widget" queda
        // abajo, siempre visible.
        listFillsColumn: (() => {
          const items = document.querySelector('.orbit-studio-wlist__items');
          const slot = document.querySelector('#orbit-studio-context-slot');
          if (!items || !slot) return false;
          return items.getBoundingClientRect().height > slot.getBoundingClientRect().height * 0.5;
        })(),
        addFootVisible: (() => {
          const foot = document.querySelector('.orbit-studio-wlist__foot');
          if (!foot) return false;
          const rect = foot.getBoundingClientRect();
          return rect.height > 0 && rect.bottom <= window.innerHeight + 0.5;
        })(),
        // Alineación de la topbar: los controles del Studio van tras el título,
        // no pegados a la pill de actualización del borde derecho.
        topbarTitleRight: Math.round(
          document.querySelector(".orbit-topbar__tt")?.getBoundingClientRect().right ?? -1,
        ),
        topbarControlsLeft: Math.round(
          document
            .querySelector('[data-testid="orbit-studio-topbar-controls"]')
            ?.getBoundingClientRect().left ?? -1,
        ),
        // Solo los acordeones de primer nivel: dentro de Apariencia hay un
        // sub-bloque `details` para los colores que no cuenta como seccion.
        accordions: document.querySelectorAll(
          '[data-testid="orbit-studio-inspector"] details.orbit-acc',
        ).length,
        selectionTag:
          document.querySelector('[data-testid="orbit-studio-selection-tag"]')?.textContent?.trim() ??
          "",
        selectedRows: document.querySelectorAll(
          '[data-testid^="orbit-studio-widget-item-"] .orbit-row--sel',
        ).length,
        selectedRowIsTarget: selected
          ? Boolean(
              document
                .querySelector(`[data-testid="orbit-studio-widget-item-${selected}"] .orbit-row--sel`)
                ?.getAttribute("aria-selected") === "true",
            )
          : true,
        // A1/A2: el envoltorio de selección se ciñe a lo pintado y la etiqueta
        // se ancla a él, dentro del lienzo.
        selection: (() => {
          if (!selected) return null;
          const frame = document.querySelector(`[data-testid="studio-widget-frame-${selected}"]`);
          const box = frame?.querySelector("[data-widget-selection]");
          const tag = document.querySelector('[data-testid="orbit-studio-selection-tag"]');
          const stage = document.querySelector('[data-testid="orbit-studio-stage"]');
          if (!frame || !box || !tag || !stage) return null;
          const r = (node) => {
            const rect = node.getBoundingClientRect();
            return { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom, w: rect.width, h: rect.height };
          };
          const visual = frame.querySelector("[data-widget-visual-viewport]");
          const painted = visual ? r(visual.firstElementChild ?? visual) : null;
          return { frame: r(frame), box: r(box), tag: r(tag), stage: r(stage), painted, fitted: box.getAttribute("data-fitted") === "true" };
        })(),
        // D-R4-4: ningun control de la toolbar puede intersectar la columna
        // del inspector. Se miden los controles reales (no la banda, que es
        // `width: 100%` de la columna del lienzo por diseno).
        toolbarOverlap: (() => {
          const dockNode = document.querySelector('[data-testid="orbit-studio-dock"]');
          if (!dockNode || dockNode.hasAttribute("hidden")) return [];
          const dockRect = dockNode.getBoundingClientRect();
          if (dockRect.width <= 0) return [];
          const bar = document.querySelector('[data-testid="orbit-studio-toolbar"]');
          if (!bar) return [];
          const hits = [];
          for (const node of bar.querySelectorAll("button, .orbit-seg, .orbit-studio-toolbar__zoom")) {
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            // Solo el nivel exterior: los hijos repiten el mismo solape.
            if (node.parentElement?.closest(".orbit-seg, .orbit-studio-toolbar__zoom")) continue;
            if (rect.right > dockRect.left + 0.5 && rect.left < dockRect.right - 0.5) {
              hits.push(
                `${node.getAttribute("data-testid") ?? node.className} right=${Math.round(rect.right)} > dock=${Math.round(dockRect.left)}`,
              );
            }
          }
          return hits;
        })(),
        // Aviso de la statusbar cuando el inspector se pliega por falta de ancho.
        inspectorLockedNote: Boolean(
          document.querySelector('[data-testid="orbit-studio-status-inspector-locked"]'),
        ),
        // A5: la sección de contenido no puede tener un control nativo.
        contentNative: (() => {
          const section = document.querySelector('[data-testid="studio-inspector-section-content"]');
          if (!section) return -1;
          return section.querySelectorAll('select, input[type="checkbox"], input[type="radio"]').length;
        })(),
      };
    }, shot.select ?? null);

    if (contract.scrollHeight > contract.innerHeight) {
      throw new Error(`${shot.name}: la página hace scroll vertical (${contract.scrollHeight} > ${contract.innerHeight})`);
    }
    if (contract.scrollWidth > contract.innerWidth) {
      throw new Error(`${shot.name}: la página hace scroll horizontal (${contract.scrollWidth} > ${contract.innerWidth})`);
    }
    await assertNoHorizontalOverflow(page, shot.name);
    if (contract.toolbar !== 60) {
      throw new Error(`${shot.name}: toolbar de ${contract.toolbar}px, se esperaban 60`);
    }
    if (contract.statusbar !== 39) {
      throw new Error(`${shot.name}: statusbar de ${contract.statusbar}px, se esperaban 39`);
    }
    const dockClosed = shot.query.includes("rightDock=closed") || shot.expectDockClosed === true;
    if (contract.dockOpen === dockClosed) {
      throw new Error(`${shot.name}: el inspector está ${contract.dockOpen ? "abierto" : "cerrado"} y se esperaba lo contrario`);
    }
    const expectedDockWidth = shot.expectDockWidth ?? 395;
    if (!dockClosed && contract.dockWidth !== expectedDockWidth) {
      throw new Error(`${shot.name}: inspector de ${contract.dockWidth}px, se esperaban ${expectedDockWidth}`);
    }
    // D-R4-4: la toolbar nunca se pinta encima del inspector.
    if (contract.toolbarOverlap.length) {
      throw new Error(
        `${shot.name}: la toolbar se solapa con el inspector\n  ${contract.toolbarOverlap.join("\n  ")}`,
      );
    }
    // El plegado automático se anuncia; el manual (`rightDock=closed`) no.
    const expectsLockedNote = shot.expectDockClosed === true;
    if (contract.inspectorLockedNote !== expectsLockedNote) {
      throw new Error(
        `${shot.name}: el aviso de inspector plegado ${contract.inspectorLockedNote ? "aparece" : "falta"} y se esperaba lo contrario`,
      );
    }
    const expectedRows = shot.query.includes("stress=1") ? 20 : 3;
    if (contract.widgetRows !== expectedRows) {
      throw new Error(`${shot.name}: ${contract.widgetRows} filas de widgets, se esperaban ${expectedRows}`);
    }
    if (contract.columnBlocks !== 0) {
      throw new Error(`${shot.name}: la columna del Studio pinta ${contract.columnBlocks} bloques persistentes, se esperaban 0`);
    }
    if (!contract.listFillsColumn) {
      throw new Error(`${shot.name}: la lista de widgets no ocupa la altura de la columna`);
    }
    if (!contract.addFootVisible) {
      throw new Error(`${shot.name}: el pie "Anadir widget" no queda visible abajo`);
    }
    if (contract.nativeTitles !== 0 || contract.columnTitles !== 0) {
      throw new Error(`${shot.name}: la vista usa \`title\` nativo (${contract.nativeTitles} + ${contract.columnTitles})`);
    }
    if (contract.topbarControlsLeft - contract.topbarTitleRight > 40) {
      throw new Error(
        `${shot.name}: los controles de la topbar no siguen al título (${contract.topbarTitleRight} → ${contract.topbarControlsLeft})`,
      );
    }
    if (shot.select) {
      // Diseño · Apariencia · Comportamiento · Layout. `appearance` se separó
      // de `design` para que el primer acordeón dejara de ser el más largo del
      // panel y el resto no quedara bajo el scroll.
      if (contract.accordions !== 4) {
        throw new Error(`${shot.name}: ${contract.accordions} acordeones en el inspector, se esperaban 4`);
      }
      if (contract.selectedRows !== 1 || !contract.selectedRowIsTarget) {
        throw new Error(`${shot.name}: la fila de \`${shot.select}\` no está en estado seleccionado`);
      }
      if (!/×/.test(contract.selectionTag)) {
        throw new Error(`${shot.name}: la etiqueta de selección no muestra \`w × h\` (${contract.selectionTag})`);
      }

      const sel = contract.selection;
      if (!sel) {
        throw new Error(`${shot.name}: no se pudo medir el envoltorio de selección de \`${shot.select}\``);
      }
      // A1: la caja de selección nunca es mayor que el marco y, cuando el
      // widget pinta menos, se ciñe a lo pintado (± 2 px de redondeo).
      if (sel.box.w > sel.frame.w + 2 || sel.box.h > sel.frame.h + 2) {
        throw new Error(
          `${shot.name}: el marco de selección (${Math.round(sel.box.w)}×${Math.round(sel.box.h)}) desborda el widget (${Math.round(sel.frame.w)}×${Math.round(sel.frame.h)})`,
        );
      }
      if (sel.painted && sel.painted.h > 4) {
        const slack = sel.box.h - sel.painted.h;
        if (slack > 6) {
          throw new Error(
            `${shot.name}: el marco sobra ${Math.round(slack)}px respecto a lo que pinta el widget (A1)`,
          );
        }
      }
      // A2: la etiqueta se pega al marco y no se sale del lienzo.
      const gapAbove = sel.box.t - sel.tag.b;
      const gapBelow = sel.tag.t - sel.box.b;
      const attached = (gapAbove >= -1 && gapAbove <= 14) || (gapBelow >= -1 && gapBelow <= 14);
      if (!attached) {
        throw new Error(
          `${shot.name}: la etiqueta no está pegada al widget (hueco arriba ${Math.round(gapAbove)}px, abajo ${Math.round(gapBelow)}px)`,
        );
      }
      const tagCenter = (sel.tag.l + sel.tag.r) / 2;
      const boxCenter = (sel.box.l + sel.box.r) / 2;
      if (Math.abs(tagCenter - boxCenter) > Math.max(8, sel.stage.w / 2 - sel.tag.w / 2)) {
        throw new Error(`${shot.name}: la etiqueta no sigue al widget en el eje X`);
      }
      if (
        sel.tag.l < sel.stage.l - 1
        || sel.tag.r > sel.stage.r + 1
        || sel.tag.t < sel.stage.t - 1
        || sel.tag.b > sel.stage.b + 1
      ) {
        throw new Error(`${shot.name}: la etiqueta se sale del lienzo`);
      }
    }
    if (shot.hide) {
      const hidden = await page.evaluate((id) => {
        const eye = document.querySelector(`[data-testid="orbit-studio-widget-eye-${id}"]`);
        const tag = document.querySelector('[data-testid="orbit-studio-selection-tag"]');
        const rect = eye?.getBoundingClientRect();
        const style = eye ? getComputedStyle(eye) : null;
        return {
          eyeVisible: Boolean(rect && rect.width > 0 && rect.height > 0 && style?.visibility !== "hidden" && Number(style?.opacity) > 0.4),
          eyeTip: eye?.getAttribute("data-tip") ?? "",
          eyeDisabled: eye?.hasAttribute("disabled") ?? true,
          tagHidden: tag?.getAttribute("data-hidden") === "true",
          tagCopy: tag?.textContent?.trim() ?? "",
          showAction: Boolean(document.querySelector('[data-testid="orbit-studio-selection-show"]')),
          rowSelectable: Boolean(
            document.querySelector(`[data-testid="orbit-studio-widget-item-${id}"] .orbit-row--sel`),
          ),
        };
      }, shot.hide);
      if (!hidden.eyeVisible || hidden.eyeDisabled) {
        throw new Error(`${shot.name}: el ojo del widget oculto no es visible ni accionable (A4)`);
      }
      if (!/Mostrar/.test(hidden.eyeTip)) {
        throw new Error(`${shot.name}: el ojo del widget oculto no dice "Mostrar" (${hidden.eyeTip})`);
      }
      if (!hidden.rowSelectable) {
        throw new Error(`${shot.name}: la fila oculta no se puede seleccionar (A4)`);
      }
      if (!hidden.tagHidden || !/oculto/.test(hidden.tagCopy) || !hidden.showAction) {
        throw new Error(`${shot.name}: la etiqueta no marca "oculto" ni ofrece "Mostrar" (${hidden.tagCopy})`);
      }
    }
    if (shot.revealContent && contract.contentNative !== 0) {
      throw new Error(
        `${shot.name}: la sección de contenido usa ${contract.contentNative} controles nativos (A5)`,
      );
    }
    if (problems.length) {
      throw new Error(`${shot.name}: la consola no está limpia\n${problems.join("\n")}`);
    }

    await hideToasts(page);

    await settle(page);
    await page.screenshot({ path: path.join(output, shot.file ?? `orbit-studio-${shot.name}.png`), fullPage: false });
    await page.close();
  }

  console.log(`Orbit studio visual PASS. Captures: ${output}`);
} finally {
  await browser?.close();
  stopServer();
}
