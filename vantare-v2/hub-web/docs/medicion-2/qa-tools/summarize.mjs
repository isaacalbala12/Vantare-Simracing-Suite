import assert from 'node:assert/strict';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {evidence,json,experiments} from './common.mjs';
const mib=1048576;
export const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;};
export function stats(values){assert.equal(values.length,5);assert.ok(values.every(Number.isFinite));const value=median(values);return{median:value,min:Math.min(...values),max:Math.max(...values),mad:median(values.map(item=>Math.abs(item-value))),values};}
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];};
const directories=(await readdir(evidence,{withFileTypes:true})).filter(item=>item.isDirectory()).map(item=>item.name);
const results=[],excluded=[];
for(const name of directories){
  const path=join(evidence,name),complete=await json(join(path,'complete.json')).catch(()=>null);
  if(!complete||complete.runs!==5){excluded.push({directory:name,reason:complete?'pilot, not N=5':'incomplete series'});continue;}
  const provenance=await json(join(path,'provenance.json')),samples=await json(join(path,'samples.json'));
  assert.ok(experiments.includes(complete.experiment));
  assert.equal(samples.filter(item=>item.phase==='idle').length,20);
  assert.equal(samples.filter(item=>item.phase==='closed').length,10);
  assert.ok(samples.filter(item=>item.phase==='closed').every(item=>item.survivors.length===0));
  for(let iteration=0;iteration<5;iteration++)assert.deepEqual(samples.filter(item=>item.phase==='before'&&item.iteration===iteration).map(item=>item.app),iteration%2?[...provenance.initialOrder].reverse():provenance.initialOrder);
  const condition={};
  for(const app of ['baseline','variant']){
    const visible=samples.filter(item=>item.phase==='visible'&&item.app===app).sort((a,b)=>a.iteration-b.iteration);
    const closed=samples.filter(item=>item.phase==='closed'&&item.app===app).sort((a,b)=>a.iteration-b.iteration);
    const integrity=closed.map(item=>{const found=item.stderr.match(/first_walk_us=(\d+) verify_walk_and_hash_us=(\d+)/);assert.ok(found);return{walk:Number(found[1])/1000,verify:Number(found[2])/1000,total:(Number(found[1])+Number(found[2]))/1000};});
    const metrics={visibleMs:stats(visible.map(item=>item.visibleMs)),responsiveMs:stats(visible.map(item=>item.responsiveMs)),integrityMs:stats(integrity.map(item=>item.total)),firstWalkMs:stats(integrity.map(item=>item.walk)),verifyHashMs:stats(integrity.map(item=>item.verify)),foreground:visible.map(item=>item.foreground)};
    for(const section of ['settings','home']){
      const details=await Promise.all(Array.from({length:5},(_,iteration)=>json(join(path,`${app}-${section}-${iteration}.json`))));
      assert.ok(details.every(item=>item.nativeImage.colors>16));
      const roles=[...new Set(details.flatMap(item=>item.event.processMetrics.map(process=>process.role)))];
      metrics[section]={workingMiB:stats(details.map(item=>item.event.workingSetBytes/mib)),privateMiB:stats(details.map(item=>item.event.privateBytes/mib)),privateResidentMiB:stats(details.map(item=>item.event.processMetrics.reduce((sum,process)=>sum+process.privateWorkingSetBytes,0)/mib)),cpuOneCorePercent:stats(details.map(item=>item.event.cpuOneCorePercent)),heapUsedMiB:stats(details.map(item=>item.heap.usedSize/mib)),heapReservedMiB:stats(details.map(item=>item.heap.totalSize/mib)),embedderHeapMiB:stats(details.map(item=>(item.heap.embedderHeapUsedSize??0)/mib)),interactiveMs:stats(details.map(item=>item.event.verifiedMs)),gpuCount:stats(details.map(item=>item.event.processMetrics.filter(process=>process.role==='gpu-process').length)),rendererCount:stats(details.map(item=>item.event.processMetrics.filter(process=>process.role==='renderer').length)),gpuStatus:details.map(item=>item.gpu),roles:Object.fromEntries(roles.map(role=>[role,{workingMiB:stats(details.map(item=>item.event.processMetrics.filter(process=>process.role===role).reduce((sum,process)=>sum+process.workingSetBytes,0)/mib)),privateMiB:stats(details.map(item=>item.event.processMetrics.filter(process=>process.role===role).reduce((sum,process)=>sum+process.privateBytes,0)/mib))}]))};
    }
    const exercises=await Promise.all(Array.from({length:5},(_,iteration)=>json(join(path,`${app}-fluency-${iteration}.json`))));
    metrics.fluency={scrollP95CallbackGapMs:stats(exercises.map(item=>percentile(item.scroll.intervals,.95))),scrollDurationMs:stats(exercises.map(item=>item.scroll.transitions.reduce((sum,transition)=>sum+transition.milliseconds,0))),scrollMovement:exercises.map(item=>item.scroll.transitions),sidebarCallbacks:exercises.map(item=>item.sidebar.intervals.length),sidebarP95CallbackGapMs:exercises.map(item=>percentile(item.sidebar.intervals,.95)),sidebarDurations:exercises.map(item=>item.sidebar.transitions.map(transition=>transition.milliseconds)),foreground:exercises.map(item=>item.event.foreground)};
    condition[app]=metrics;
  }
  const paired={};
  for(const [key,read]of[['visibleMs',item=>item.visibleMs],['settingsWorkingMiB',item=>item.settings.workingMiB],['homeWorkingMiB',item=>item.home.workingMiB],['scrollP95GapMs',item=>item.fluency.scrollP95CallbackGapMs]]){
    const left=read(condition.baseline).values,right=read(condition.variant).values;
    paired[key]=stats(right.map((value,index)=>value-left[index]));
  }
  assert.ok(!results.some(item=>item.experiment===complete.experiment),'Multiple complete series: select explicitly, never pick the best');
  results.push({experiment:complete.experiment,directory:name,provenance,condition,paired});
}
await writeFile(join(evidence,'statistics.json'),JSON.stringify({results,excluded},null,2));
const format=value=>value.toFixed(2).replace('.',',');
const table=['| Experimento | Ajustes WS MiB A → B | Δ pareada MiB | Visible ms A → B | GPU A → B | Scroll p95 callback ms A → B |','| --- | ---: | ---: | ---: | ---: | ---: |'];
for(const result of results){const{baseline:a,variant:b}=result.condition;table.push(`| ${result.experiment} | ${format(a.settings.workingMiB.median)} → ${format(b.settings.workingMiB.median)} | ${format(result.paired.settingsWorkingMiB.median)} | ${format(a.visibleMs.median)} → ${format(b.visibleMs.median)} | ${a.settings.gpuCount.median} → ${b.settings.gpuCount.median} | ${format(a.fluency.scrollP95CallbackGapMs.median)} → ${format(b.fluency.scrollP95CallbackGapMs.median)} |`);}
await writeFile(join(evidence,'TABLA-PARCIAL.md'),table.join('\n')+'\n');
console.log(table.join('\n'));
