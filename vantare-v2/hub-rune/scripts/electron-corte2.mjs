// Bun controller. Reuses the cut-1 guard BEFORE importing the actual QA entry.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [rootArg, output, initial] = process.argv.slice(2);
const screens = ["home", "studio", "launcher"];
if (process.platform !== "darwin" || !rootArg || !output || !screens.includes(initial))
  throw new Error("macOS only; owned hub-web root, disposable data directory and screen required");
const root = resolve(rootArg);
const electron = join(root, "node_modules/electron/dist/Electron.app");
if (!['1', 'true'].includes(execFileSync("plutil", ["-extract", "LSUIElement", "raw", "-o", "-", join(electron, "Contents/Info.plist")], {encoding:"utf8"}).trim()))
  throw new Error("Owned QA Electron bundle must have LSUIElement=true; nothing launched");
const require = createRequire(join(root, "package.json"));
const { _electron } = require("playwright-core");
const entry = join(root, "out-qa/main/capture-index.js");
const guard = join(root, "out-qa/main/capture-guard.mjs");
await writeFile(guard, await readFile(join(root, "../hub-rune/scripts/electron-capture-guard.mjs")));
await writeFile(entry, `import ${JSON.stringify(pathToFileURL(guard).href)};\n${await readFile(join(root, "out-qa/main/index.js"), "utf8")}`);
const emit = (event) => console.log(`cut2 ${JSON.stringify(event)}`);
const frontPid = () => Number(execFileSync("osascript", ["-l", "JavaScript", "-e", 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier'], {encoding:"utf8"}).trim());
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const env = { ...process.env, VANTARE_HUB_HOST:"mock", VANTARE_HUB_SCENE:`visual-dark:${{home:'inicio-base', studio:'studio-base', launcher:'launcher-base'}[initial]}`, VANTARE_HUB_DATA_DIR:output };
for (const key of ["ELECTRON_RUN_AS_NODE", "VANTARE_HUB_PIPE", "VANTARE_HUB_TOKEN"]) delete env[key];
let app;
process.on("SIGTERM", () => { app?.process().kill("SIGKILL"); process.exit(143); });
try {
  emit({kind:"start"});
  app = await _electron.launch({executablePath:join(electron,"Contents/MacOS/Electron"), args:[entry,"--force-device-scale-factor=1"], env, timeout:60000});
  emit({kind:"pid", pid:app.process().pid});
  const page = await app.firstWindow({timeout:30000});
  page.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const buttons = {home:"Inicio",studio:/^(Studio|Overlays Studio)$/,launcher:"Launcher"};

  const ordered = [...screens.slice(screens.indexOf(initial)),...screens.slice(0,screens.indexOf(initial)),initial];
  for (let i=0;i<ordered.length;i++) {
    const screen=ordered[i];
    if(i) { await wait(12000); emit({kind:"nav",screen}); }
    await page.getByRole("button",{name:buttons[screen],exact:true}).dispatchEvent("click");
    if(screen === "home") await page.locator(".v-home:not(.v-home--loading)").waitFor();
    if(screen==='home') await page.getByRole('button',{name:'Lanzar perfil seleccionado',exact:true}).waitFor();
    else await page.getByRole('heading',{name:screen==='studio'?/^Standings(?: 1)?$/:"Creador de Contenido",exact:true}).waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image=>image.decode()));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const windows = await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused(),focusable:w.isFocusable()})));
    if(windows.some(w=>w.visible||w.focused||w.focusable) || frontPid() === app.process().pid) throw new Error("Window guard violated; stop batch");
    emit({kind:"ready",screen});
  }
  await wait(9000);
} finally { if(app) await app.close(); }
