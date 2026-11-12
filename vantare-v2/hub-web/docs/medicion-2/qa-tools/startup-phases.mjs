import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {evidence,json} from './common.mjs';
const {results}=await json(join(evidence,'statistics.json'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const output=[];
for(const result of results){
  for(const app of ['baseline','variant']){
    const rows=[];
    const samples=await json(join(evidence,result.directory,'samples.json'));
    for(let i=0;i<5;i++){
      const startup=await json(join(evidence,result.directory,`${app}-startup-${i}.json`));
      const detail=await json(join(evidence,result.directory,`${app}-settings-${i}.json`));
      const launch=samples.find(item=>item.phase==='visible'&&item.app===app&&item.iteration===i);
      const t=name=>startup.events.find(event=>event.name===name)?.epochMs;
      const interval=(start,end)=>t(end)-t(start);
      const fcp=detail.paint.paint.find(paint=>paint.name==='first-contentful-paint');
      rows.push({parentToElectronMs:startup.creationEpochMs-launch.launchEpochMs,electronToMainMarkerMs:t('qa-module-start')-startup.creationEpochMs,appReadyWaitMs:interval('before-app-ready-await','after-app-ready-await'),hostHandshakeMs:interval('before-host-hello','after-host-hello'),windowConstructorMs:interval('before-window-constructor','after-window-constructor'),loadToDomMs:interval('did-start-loading','dom-ready'),domToShowMs:interval('dom-ready','window-show'),fcpAfterLaunchMs:fcp?detail.paint.origin+fcp.startTime-launch.launchEpochMs:null,visibleMs:launch.visibleMs});
    }
    output.push({experiment:result.experiment,condition:app,rows,summary:Object.fromEntries(Object.keys(rows[0]).map(key=>{const values=rows.map(row=>row[key]).filter(Number.isFinite);return[key,{n:values.length,median:values.length?median(values):null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null}];}))});
  }
}
await writeFile(join(evidence,'startup-phases.json'),JSON.stringify(output,null,2));
console.log('Startup wall phases saved. Medians of intervals must not be added to reproduce a median total.');
