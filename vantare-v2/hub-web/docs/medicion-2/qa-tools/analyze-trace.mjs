import assert from 'node:assert/strict';
import {readdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {evidence,json} from './common.mjs';
const output=[];
for(const entry of await readdir(evidence,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('paired-trace-'))continue;
  const directory=join(evidence,entry.name);
  const complete=await json(join(directory,'complete.json')).catch(()=>null);
  if(!complete||complete.runs!==5)continue;
  const samples=await json(join(directory,'samples.json'));
  for(let iteration=0;iteration<5;iteration++){
    const startup=await json(join(directory,`variant-startup-${iteration}.json`));
    const traceBytes=await readFile(join(directory,`startup-trace-${iteration}.json`));
    const isJson=traceBytes.toString('utf8',0,32).trimStart().startsWith('{');
    const trace=isJson?JSON.parse(traceBytes.toString('utf8')):null;
    assert.ok(traceBytes.length>1000,'Trace must contain real recording data');
    if(!isJson)await writeFile(join(directory,`startup-trace-${iteration}.pftrace`),traceBytes);
    const detail=await json(join(directory,`variant-settings-${iteration}.json`));
    const launch=samples.find(sample=>sample.app==='variant'&&sample.iteration===iteration&&sample.phase==='visible');
    assert.ok(startup.events.some(event=>event.name==='trace-started'));
    assert.ok(startup.events.some(event=>event.name==='trace-stopped'));
    const start=launch.launchEpochMs;
    assert.ok(Number.isFinite(start));
    const stages=startup.events.filter(event=>Number.isFinite(event.epochMs)).map(event=>({name:event.name,afterLaunchMs:event.epochMs-start}));
    const paints=detail.paint.paint.map(paint=>({name:paint.name,afterLaunchMs:detail.paint.origin+paint.startTime-start}));
    // Complete trace slices overlap/nest: these are diagnostic rankings, NOT
    // additive wall time. Do not retain args (which can contain URLs).
    const groups=new Map();
    for(const event of trace?.traceEvents??[]){
      if(event.ph!=='X'||!Number.isFinite(event.dur))continue;
      const key=event.name;
      const previous=groups.get(key)??{name:key,count:0,totalSliceMs:0,maxSliceMs:0};
      previous.count++;previous.totalSliceMs+=event.dur/1000;previous.maxSliceMs=Math.max(previous.maxSliceMs,event.dur/1000);groups.set(key,previous);
    }
    output.push({directory:entry.name,iteration,visibleMs:launch.visibleMs,stages,paints,traceFormat:trace?.format==='vantare-startup-markers-v1'?'Explicit epoch marker timeline':isJson?'Chrome JSON':'Perfetto protobuf',traceBytes:traceBytes.length,traceEvents:trace?.traceEvents?.length??null,topSlices:[...groups.values()].sort((a,b)=>b.totalSliceMs-a.totalSliceMs).slice(0,25),limit:trace?.format==='vantare-startup-markers-v1'?'Explicit wall-clock markers only, not Chromium/V8 CPU slices. Native stopRecording pilots timed out and are excluded.':isJson?null:'Electron 45 emits Perfetto. Raw recording retained; no speculative protobuf parser or external converter. Startup wall phases come from explicit epoch markers; no V8 CPU totals are claimed.'});
  }
}
await writeFile(join(evidence,'trace-analysis.json'),JSON.stringify(output,null,2));
console.log(`Analyzed ${output.length} complete N=5 trace runs; nested slice durations must not be summed.`);
