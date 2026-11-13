import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, mkdtemp, statfs } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = process.argv[2];
const output = process.argv[3];
if (process.platform !== "darwin" || !root || !output || !process.argv[4] || !/^[0-9a-f]{40}$/.test(process.argv[5] ?? "")) throw new Error("macOS only; hub-web root, fresh output, plan.json and QA build source SHA required");
const plist=join(root,"node_modules/electron/dist/Electron.app/Contents/Info.plist");
if(!["1","true"].includes(execFileSync("plutil",["-extract","LSUIElement","raw","-o","-",plist],{encoding:"utf8"}).trim()))
  throw new Error("Owned QA Electron bundle needs LSUIElement=true before capture; no application launched");
const require = createRequire(join(root, "package.json"));
const { _electron } = require("playwright-core");
const { PNG } = require("pngjs");
const { visualScenes } = await import(pathToFileURL(join(root,"scripts/visual-diff/scenes.ts")).href);
const plan = JSON.parse(await readFile(process.argv[4],"utf8"));
await mkdir(output,{recursive:false});
const entry=join(root,"out-qa/main/capture-index.js");
const guard=pathToFileURL(join(root,"out-qa/main/capture-guard.mjs")).href;
await writeFile(join(root,"out-qa/main/capture-guard.mjs"), await readFile(join(root,"../hub-rune/scripts/electron-capture-guard.mjs"),"utf8"));
await writeFile(entry, `import ${JSON.stringify(guard)};\n`+await readFile(join(root,"out-qa/main/index.js"),"utf8"));
const rows=[];
let cancelled=false;
let activeApp;
process.on("SIGTERM", () => {
  cancelled=true;
  // Exit the controller immediately: termination must never launch the next cell.
  activeApp?.process().kill("SIGKILL");
  process.exit(143);
});
for (const cell of plan) {
  if(cancelled) break;
  const disk=await statfs(output);
  if(disk.bavail*disk.bsize<12*1024**3) throw new Error("Fewer than 12 GiB free; stop without deleting targets");
  const directory=join(output,cell.group,cell.id); await mkdir(directory,{recursive:true});
  const data=await mkdtemp(join(output,"qa-"));
  const env={...process.env,VANTARE_HUB_HOST:"mock",VANTARE_HUB_DATA_DIR:data,
    VANTARE_HUB_SCENE:cell.host_scene === "roadmap-error" ? "roadmap-error" : `visual-${cell.theme}:${cell.host_scene}`};
  delete env.ELECTRON_RUN_AS_NODE; delete env.VANTARE_HUB_PIPE; delete env.VANTARE_HUB_TOKEN;
  const frontPid = () => Number(execFileSync("osascript", ["-l", "JavaScript", "-e", 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier'], {encoding:"utf8"}).trim());
  const previousFront=frontPid();
  let app;
  const row={...cell,reference_source_sha:process.argv[5],qa_bundle_sha256:createHash("sha256").update(await readFile(join(root,"out-qa/main/index.js"))).digest("hex"),status:"failed",source:"Mac Electron QA, CDP client screenshot; supplementary to official Windows HWND bank"};
  try {
    app=await _electron.launch({executablePath:join(root,"node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
      args:[entry,`--force-device-scale-factor=${cell.scale}`],env,timeout:60000});
    activeApp=app;


    const page=await app.firstWindow({timeout:60000});
    page.setDefaultTimeout(30000);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
    // macOS constrains the visible window to the desktop (890 px here). Capture the
    // real QA renderer at the requested viewport/DPR through CDP, without resampling.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {width:1440,height:900,deviceScaleFactor:cell.scale,mobile:false});
    await page.getByRole("button",{name:"Inicio",exact:true}).waitFor();
    if(cell.host_scene === "roadmap-error") {
      if(cell.theme === "light") await page.getByRole("button",{name:"Cambiar tema claro u oscuro",exact:true}).click();
      await page.getByRole("button",{name:"Roadmap",exact:true}).click();
      await page.getByRole("tab",{name:"Circuito",exact:true}).click();
      await page.locator(".v-roadmap-hero h2").waitFor();
    } else {
      const scene=cell.electron_scene;
      if(!visualScenes[scene]) throw new Error(`No adapter: ${scene}`);
      await visualScenes[scene].prepare(page);
    }
    const nav=page.locator(".v-sidebar");
    const expanded=await nav.evaluate(n=>!n.classList.contains("v-sidebar--collapsed"));
    if(expanded !== (cell.sidebar === "expanded")) await page.keyboard.press("Control+b");
    await page.waitForFunction(({theme,expanded})=>document.documentElement.dataset.scheme===theme &&
      !document.querySelector(".v-sidebar").classList.contains("v-sidebar--collapsed")===expanded,
      {theme:cell.theme,expanded:cell.sidebar==="expanded"});
    await page.evaluate(async()=>{ await document.fonts.ready; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); });
    await page.mouse.move(5,5);
    row.viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scale:devicePixelRatio}));
    if(row.viewport.width !==1440 || row.viewport.height !==900 || Math.abs(row.viewport.scale-cell.scale)>.001)
      throw new Error(`Viewport mismatch ${JSON.stringify(row.viewport)}`);
    row.frontBefore=previousFront; row.frontAfter=frontPid();
    row.ownPid=app.process().pid;
    if(row.frontAfter===row.ownPid) throw new Error("QA reference became frontmost; stop, no automatic retry");
    row.background=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused(),focusable:w.isFocusable()})));
    if(row.background.some(w=>w.visible||w.focused||w.focusable)) throw new Error("Reference capture must stay hidden and unfocused");
    const bytes=await page.screenshot({animations:"disabled",scale:"device"});
    const png=PNG.sync.read(bytes);
    if(png.width!==cell.physical[0] || png.height!==cell.physical[1]) throw new Error("Physical pixel mismatch");
    await writeFile(join(directory,"electron.png"),bytes);
    row.sha256=createHash("sha256").update(bytes).digest("hex");
    row.png=`${cell.group}/${cell.id}/electron.png`; row.status="captured";
    row.electron=await app.evaluate(()=>process.versions.electron);
  } catch(error) { row.error=String(error); }
  finally { if(app) await app.close(); }
  rows.push(row); await writeFile(join(output,"manifest.json"),JSON.stringify(rows,null,2));
  console.log(cell.id,row.status,row.error??"");
  if(row.status!=="captured") throw new Error(row.error);
}
