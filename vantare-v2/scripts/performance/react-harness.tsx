import React, { Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { RuntimeWidgetFrame } from '/src/overlay/runtime/RuntimeWidgetFrame';
import { createTelemetryRateCoordinator } from '/src/overlay/core/telemetry-rate-coordinator';
import { widgetTypeRegistry } from '/src/overlay/core/widget-registry';
import golden from '/@fs/REPLACE_APP_ROOT/internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json';
import '/src/index.css';
let root: Root | undefined, coordinator: ReturnType<typeof createTelemetryRateCoordinator> | undefined;
let frame = structuredClone(golden.frame), revision = 1;
let commits: {id:string;phase:string;duration:number;at:number}[]=[];
let mutations = 0, subscriptions = 0, notifications = 0;
const host=document.getElementById('root')!;
const observer=new MutationObserver(records=>{mutations+=records.length;});observer.observe(host,{subtree:true,childList:true,characterData:true,attributes:true});
function resetFrame(){frame=structuredClone(golden.frame);frame.session.track={q:'fresh',v:'Circuit de la Sarthe'};const row=frame.standings[0];frame.standings=Array.from({length:44},(_,i)=>({...structuredClone(row),id:'vehicle-'+String(i).padStart(3,'0'),position:i+1,groundPosition:{q:'fresh',v:{x:i*15,z:i*9}}}));}
const widgets=['track-map','pedals','standings'].map((type,i)=>{const w=widgetTypeRegistry.get(type).createDefault(type);w.layout={...w.layout,x:i*360,y:0};return w;});
function mount(){
 resetFrame();coordinator=createTelemetryRateCoordinator();
 const subscribe=coordinator.subscribe;coordinator.subscribe=(key,fn)=>{subscriptions++;const stop=subscribe(key,()=>{notifications++;fn();});let done=false;return()=>{if(!done){done=true;subscriptions--;stop();}};};
 coordinator.setOverlayFrame(frame,golden.source,++revision,revision);root=createRoot(host);
 flushSync(()=>root!.render(<>{widgets.map(w=><Profiler key={w.id} id={w.id} onRender={(id,phase,duration)=>commits.push({id,phase,duration,at:performance.now()})}><RuntimeWidgetFrame widget={w} profileId="audit-fixture" telemetry={coordinator!} renderMode="desktop" /></Profiler>)}</>));
}
function unmount(){root?.unmount();root=undefined;coordinator?.dispose();coordinator=undefined;}
const nextFrame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
(window as any).astra={
 async cycles(count:number){for(let i=0;i<count;i++){mount();await nextFrame();unmount();await nextFrame();}return {subscriptions,notifications,dom:host.childElementCount};},
 async run(count=180){mount();for(let i=0;i<30;i++)await nextFrame();commits=[];mutations=0;notifications=0;const times:number[]=[];let prev=performance.now();const start=prev;
  for(let i=0;i<count;i++){const now=await new Promise<number>(r=>requestAnimationFrame(r));times.push(now-prev);prev=now;frame={...frame,sequence:++revision,player:{...frame.player,throttle:{q:'fresh',v:(i%100)/100}},standings:frame.standings.map((row,j)=>({...row,groundPosition:{q:'fresh',v:{x:j*15+i,z:j*9+i}}}))};coordinator!.setOverlayFrame(frame,golden.source,revision,revision);}
  await nextFrame();const result={seconds:(performance.now()-start)/1000,commits:[...commits],mutations,notifications,frameIntervals:times,diagnostics:host.querySelectorAll('[data-testid="widget-host-diagnostic"]').length,renderers:host.querySelectorAll('[data-widget-renderer]').length};unmount();return result;
 }, stop(){unmount();observer.disconnect();}
};
