import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { hideToasts } from "./lib/orbit-still.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.VANTARE_ENGINEER_EVIDENCE_DIR || path.resolve(frontend, "../docs/design/orbit-v03/evidence/porte/08-ingeniero");
const port = 5198;
const url = `http://127.0.0.1:${port}/orbit-engineer-harness.html?view=ingeniero`;


const viewports = [
  { name: "1920x1080", width: 1920, height: 1080, interact: true },
  { name: "1280x800", width: 1280, height: 800, interact: false },
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
  // El runtime simulado publica la configuración real del Ingeniero
  // (`engineer:status`) con veinte mensajes de radio sembrados.
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
      const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Orbit engineer harness did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    const page = await browser.newPage({viewport:{width:viewport.width,height:viewport.height},acceptDownloads:true});
    const problems=[];
    page.on("pageerror",error=>{if(!(error.stack??"").includes("wailsio_runtime"))problems.push(error.message)});
    await page.goto(url,{waitUntil:"networkidle"});
    await page.getByRole("heading",{name:"Ingeniero Vantare",exact:true}).waitFor();
    await page.getByText("Estado actualizado desde el servicio.").waitFor();
    await hideToasts(page);
    if(await page.locator(".engineer-test-outputs select").count()!==7)throw new Error("missing real output controls");
    if(await page.locator(".engineer-test tbody tr").count()!==19)throw new Error("current-cycle history incorrect");
    if(viewport.interact){
      await page.getByLabel("Ciclos",{exact:true}).selectOption("all");
      if(await page.locator(".engineer-test tbody tr").count()!==20)throw new Error("all-cycle history incorrect");
      await page.getByLabel("Vueltas",{exact:true}).selectOption("disabled");
      await page.getByText("Cambio aplicado y guardado.").waitFor();
      await page.getByLabel("Ingeniero de pista",{exact:true}).uncheck();
      await page.getByRole("button",{name:"Probar sonido",exact:true}).click();
      await page.getByText("El reproductor ha terminado sin error.",{exact:true}).waitFor();
      await page.getByRole("button",{name:"Probar frase en caché",exact:true}).click();
      await page.getByText("La frase no está en caché: no se ha reproducido audio.",{exact:true}).waitFor();
      await page.getByRole("button",{name:"Preparar informe",exact:true}).click();
      const preview=await page.getByLabel("Contenido del informe",{exact:true}).textContent();
      const downloaded=page.waitForEvent("download");
      await page.getByRole("button",{name:"Descargar JSON",exact:true}).click();
      const file=await downloaded;const actual=fs.readFileSync(await file.path(),"utf8");
      if(actual!==preview)throw new Error("download differs from exact preview");
      await page.getByRole("heading",{name:"Vista previa del informe",exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,"engineer-report-preview.png")});
      await page.getByRole("button",{name:"Cerrar vista previa",exact:true}).click();
    }
    await page.getByRole("heading",{name:"Registro de entregas",exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`engineer-history-${viewport.name}.png`)});
    const horizontal=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    if(horizontal)throw new Error(`${viewport.name}: document horizontal overflow`);
    await page.getByRole("heading",{name:"Ingeniero Vantare",exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`engineer-functional-${viewport.name}.png`),fullPage:true});
    if(problems.length)throw new Error(problems.join("\n"));
    await page.close();
  }
  fs.writeFileSync(path.join(output,"visual-check.json"),JSON.stringify({result:"PASS",scope:"synthetic UI, not LMU or OS audio",viewports},null,2));
  console.log(`Engineer functional UI PASS (synthetic). Captures: ${output}`);
} finally {await browser?.close();stopServer();}
