import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({headless:true, ...(existsSync(chrome)?{executablePath:chrome}:{})});
try {
const {InputTelemetryCrystal}=await server.ssrLoadModule('/src/overlay/design-systems/vantare-crystal/input-telemetry/InputTelemetryCrystal.tsx');
const css=(await Promise.all(['tokens.css','isa93-live-families.css','isa93-input.css','isa93-parity-overrides.css'].map(f=>readFile('src/overlay/design-systems/vantare-crystal/'+f,'utf8')))).join('\n');
const model={type:'input-telemetry',status:'ready',throttle:.8,brake:.1,clutch:.5,speedKph:242,gear:6,history:[],historySeconds:4,showClutch:true};
const page=await browser.newPage();
for(const templateId of ['input-dense','input-capsule','input-blade']) {
for(const [width,height] of [[280,100],[360,140],[480,180]]) {
const scale=width/360;
const html=renderToStaticMarkup(createElement(InputTelemetryCrystal,{model,settings:{templateId},renderMode:'harness'}));
await page.setContent(`<style>body{background:#202530}*{box-sizing:border-box} ${css}</style><div style="width:360px;height:${height/scale}px;transform:scale(${scale});transform-origin:top left">${html}</div>`);
const result=await page.evaluate(()=>{const graph=document.querySelector('.vc-input-graph').getBoundingClientRect();const bars=document.querySelector('.vc-input-horizontal,.vc-input-vertical').getBoundingClientRect();return {graphWidth:graph.width,barsWidth:bars.width};});
console.log(templateId,width,height,result);
assert.ok(result.graphWidth>=65*scale,'history needs at least 65px at base width');
assert.ok(result.barsWidth>=85*scale,'pedal channels need at least 85px at base width');
const escaped=await page.evaluate(()=>{const root=document.querySelector('.vc-input-telemetry').getBoundingClientRect();return [...document.querySelectorAll('.vc-input-telemetry header,.vc-input-graph,.vc-input-readout,.vc-input-horizontal,.vc-input-vertical,.vc-input-readout b,.vc-input-readout strong,.vc-input-horizontal span,.vc-input-vertical span')].filter(el=>{const r=el.getBoundingClientRect();return r.left<root.left-1 || r.right>root.right+1 || r.bottom>root.bottom+1 || r.top<root.top-1;}).map(el=>({name:el.className,rect:el.getBoundingClientRect().toJSON(),root:root.toJSON()}));});
if(width===360) await page.screenshot({path:join(tmpdir(),`isa990-${templateId}.png`)});
assert.deepEqual(escaped,[], 'all sections must stay inside the actual frame');
}
}
const {PedalsTelemetryCompactCrystal}=await server.ssrLoadModule('/src/overlay/design-systems/vantare-crystal/pedals-telemetry-compact/PedalsTelemetryCompactCrystal.tsx');
const compact={...model,type:'pedals-telemetry-compact',showRpm:true,showSpeed:true,gearText:'R',rpm:12500,rpmText:'12.5k',speedText:'242'};
await page.setContent(`<style>body{background:#202530}*{box-sizing:border-box} ${css}</style><div style="width:260px;height:92px">${renderToStaticMarkup(createElement(PedalsTelemetryCompactCrystal,{model:compact,settings:{},renderMode:'harness'}))}</div>`);
const escaped=await page.evaluate(()=>{const root=document.querySelector('section').getBoundingClientRect();return [...document.querySelectorAll('section *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0 && (r.left<root.left-1 || r.right>root.right+1 || r.bottom>root.bottom+1 || r.top<root.top-1);}).map(el=>el.className);});
await page.screenshot({path:join(tmpdir(),'isa990-compact.png')});
assert.deepEqual(escaped,[],'compact RPM, gear and speed remain contained');
} finally {await browser.close();await server.close();}
