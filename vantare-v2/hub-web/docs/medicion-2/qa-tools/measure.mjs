import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {cp,mkdir,readFile,unlink,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createInterface} from 'node:readline';
import {cpus,freemem,totalmem,release} from 'node:os';
import {root,evidence,code,sourceGeneration,require,json,owned,experiments,until,hashFile} from './common.mjs';
import {fluency} from './fluency.mjs';
import {imageProof} from './image-proof.mjs';
const {chromium}=require('playwright-core');
async function deadline(promise,label,milliseconds=15000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Deadline: ${label}`)),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
async function acknowledgeStartup(token){
  const expected=Buffer.from(token,'utf8');
  try{
    await until(async()=>{
      const received=await readFile(join(root,'hub-ready')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(!received)return false;
      try{
        assert.equal(received.length,expected.length,'QA startup nonce length differs');
        assert.ok(timingSafeEqual(received,expected),'QA startup nonce does not match this host');
        return true;
      }finally{received.fill(0);}
    },15000,'Native hub-ready before supervisor acknowledgment');
    await unlink(join(root,'boot-pending.json'));
  }finally{expected.fill(0);}
}
const experiment=process.env.VANTARE_MEASURE_EXPERIMENT;
assert.ok(experiments.includes(experiment),'Closed experiment selection required');
const runs=Number(process.env.VANTARE_MEASURE_RUNS??5);
assert.ok(runs===1||runs===5);
const prepared=await json(join(root,'prepared.json'));
const generation=owned(prepared.folder),data=join(generation,'data');
const trial=randomBytes(4).toString('hex');
const output=join(evidence,`${runs===1?'pilot':'paired'}-${experiment}-${trial}`);
await mkdir(output,{recursive:true});
await mkdir(join(root,'tmp'),{recursive:true});
await mkdir(data,{recursive:true});
await cp(join(sourceGeneration,'data/layout.json'),join(data,'layout.json'));
const appearance=await json(join(sourceGeneration,'data/hub/appearance.json'));
await mkdir(join(data,'Vantare/native'),{recursive:true});
await cp(join(sourceGeneration,'data/Vantare/native/privacy.json'),join(data,'Vantare/native/privacy.json'));
const env={};
for(const key of ['SystemRoot','SystemDrive','WINDIR','PATH','PATHEXT','COMSPEC','USERPROFILE','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','SESSIONNAME'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{TEMP:join(root,'tmp'),TMP:join(root,'tmp')});
const pipe=`vantare-measure-${randomBytes(16).toString('hex')}`;
const peers=[],samples=[],profiles={};
let driver,browser,activeProfile;
const originalToolHash=await hashFile(join(code,'scripts/measure.ps1'));
const toolHashes=Object.fromEntries(await Promise.all(['measure.mjs','measure.ps1','capture-lock.ps1','measure-window.ps1','fluency.mjs','image-proof.mjs','measurement-qa.mjs'].map(async name=>[name,await hashFile(join(root,'tools',name))])));
const toolSource=execFileSync('git',['rev-parse','HEAD'],{cwd:code,encoding:'utf8',windowsHide:true}).trim();
try{
  for(const [name,role] of [['vantare-core.exe','rights'],['vantare.exe','services']]){
    const peer=spawn(join(generation,'bin',name),['--root',generation,'--pipe',pipe,'--role',role],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    peers.push(peer);
    await new Promise((accept,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Local ${role} peer readiness deadline`)),10000);
      peer.stdout.once('data',chunk=>{clearTimeout(timer);String(chunk).trim()==='ready'?accept():reject(new Error('Invalid local peer readiness'));});
      peer.once('error',error=>{clearTimeout(timer);reject(error);});
      peer.once('exit',status=>{clearTimeout(timer);reject(new Error(`Local peer exited ${status}`));});
    });
  }
  const apps=['baseline','variant'].map(name=>({name,exe:join(generation,'bin/vantare-hub.exe'),arguments:['--control-stdin','--data-dir',join(data,'hub'),'--layout',join(data,'layout.json'),'--pipe',pipe],environment:{...env,VANTARE_NATIVE_DATA_ROOT:data,LOCALAPPDATA:data,APPDATA:join(data,'roaming'),VANTARE_BOOT_TOKEN:randomBytes(16).toString('hex')}}));
  if(experiments.indexOf(experiment)%2)apps.reverse();
  const configuration={runs,evidence:output,apps};
  const config=owned(join(root,`config-${trial}.json`));
  await writeFile(config,JSON.stringify(configuration)); // QA-only ephemeral bootstrap; never log this file.
  await writeFile(join(output,'provenance.json'),JSON.stringify({...prepared,experiment,runs,trial,toolHashes,toolSource,reservationFile:process.env.VANTARE_MEASURE_RESERVATION_FILE??null,nodeVersion:process.version,sourceMeasureWrapperSha256:originalToolHash,os:release(),logicalCpus:cpus().length,totalMemory:totalmem(),freeMemory:freemem(),initialOrder:apps.map(item=>item.name),method:'Five alternated same-package baseline/variant launches, fresh profiles, Settings then Home, no own compilation, natural OS caches'},null,2));
  driver=spawn('pwsh',['-NoProfile','-MTA','-File',join(root,'tools/measure-window.ps1'),'-Config',config],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stderr='';driver.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=new Promise((accept,reject)=>{driver.once('exit',accept);driver.once('error',reject);});
  for await(const line of createInterface({input:driver.stdout})){
    const event=JSON.parse(line);samples.push(event);
    console.log(`${experiment} ${event.phase} ${event.app} ${event.iteration} ${event.section??''}`);
    await writeFile(join(output,'samples.json'),JSON.stringify(samples,null,2));
    if(event.phase==='before'){
      const profile=owned(join(data,`r-${trial}-${event.app[0]}-${event.iteration}`));
      profiles[`${event.app}-${event.iteration}`]=profile;activeProfile=profile;
      await mkdir(profile,{recursive:true});
      await writeFile(join(profile,'appearance.json'),JSON.stringify(appearance));
      await writeFile(join(profile,'measurement-options.json'),JSON.stringify({variant:event.app==='baseline'?'baseline':experiment}));
      await unlink(join(root,'hub-ready')).catch(error=>{if(error.code!=='ENOENT')throw error;});
      await writeFile(join(root,'boot-pending.json'),'{}');
      const application=apps.find(app=>app.name===event.app);
      const args=[...application.arguments];args[args.indexOf('--data-dir')+1]=profile;
      driver.stdin.write(JSON.stringify({command:'launch',arguments:args,environment:application.environment})+'\n');
    }else if(event.phase==='visible'){
      await acknowledgeStartup(apps.find(app=>app.name===event.app).environment.VANTARE_BOOT_TOKEN);
      let endpoint='';
      await until(async()=>{const log=await readFile(join(activeProfile,'hub-ui-qa.log'),'utf8').catch(()=> '');endpoint=log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]??'';return !!endpoint;},15000,'QA debugger endpoint');
      browser=await chromium.connectOverCDP(endpoint);
      const context=browser.contexts()[0],page=context.pages()[0]??await context.waitForEvent('page');
      await page.getByRole('heading',{name:'General',exact:true}).waitFor({timeout:15000});
      await page.getByRole('tab',{name:'Apariencia',exact:true}).click();
      await page.getByRole('heading',{name:'Apariencia',exact:true}).waitFor();
      await page.getByRole('tab',{name:'General',exact:true}).click();
      await page.getByRole('heading',{name:'General',exact:true}).waitFor();
      await page.getByRole('switch',{name:'Empezar minimizado',exact:true}).focus();
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'switch');
      driver.stdin.write('ready\n');
    }else if(event.phase==='navigate'){
      const page=browser.contexts()[0].pages()[0];
      await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Inicio',exact:true}).click();
      await page.locator('.v-home').waitFor({timeout:15000});
      driver.stdin.write('ready\n');
    }else if(event.phase==='idle'){
      assert.deepEqual([...event.familyAfter].sort((a,b)=>a-b),event.processMetrics.map(item=>item.pid).sort((a,b)=>a-b),'Process family changed during idle sample');
      const page=browser.contexts()[0].pages()[0];
      const renderer=await page.context().newCDPSession(page);
      const heap=await deadline(renderer.send('Runtime.getHeapUsage'),'renderer heap'),dom=await deadline(renderer.send('Memory.getDOMCounters'),'DOM counters');
      await renderer.detach();
      const connection=await browser.newBrowserCDPSession();
      const processes=await deadline(connection.send('SystemInfo.getProcessInfo'),'process roles');
      let gpu;
      try{gpu=(await deadline(connection.send('SystemInfo.getInfo'),'GPU feature status',5000)).gpu.featureStatus;}catch(error){gpu={unavailable:String(error)};}
      await connection.detach();
      const paint=await page.evaluate(()=>({origin:performance.timeOrigin,paint:performance.getEntriesByType('paint').map(item=>({name:item.name,startTime:item.startTime})),motion:document.documentElement.dataset.motion}));
      const startup=await json(join(activeProfile,'measurement-startup.json'));
      assert.equal(startup.deniedSchemes.length,0,'QA attempted external network access');
      assert.equal(startup.variant,event.app==='baseline'?'baseline':experiment);
      const nativeImage=await imageProof(join(output,`${event.app}-${event.section}-${event.iteration}.png`));
      const detail={event,heap,dom,processes,gpu,paint,startup,nativeImage};
      await writeFile(join(output,`${event.app}-${event.section}-${event.iteration}.json`),JSON.stringify(detail,null,2));
      if(event.section==='home'){
        if(event.app==='variant'&&experiment==='trace'){
          await writeFile(join(activeProfile,'measurement-stop-trace'),'stop');
          await until(async()=>await readFile(join(activeProfile,'trace-complete'),'utf8').catch(()=> '')==='ok',20000,'Trace flushed before controlled close');
          assert.ok((await stat(join(activeProfile,'startup-trace.json'))).size>0);
          await cp(join(activeProfile,'startup-trace.json'),join(output,`startup-trace-${event.iteration}.json`));
        }
        driver.stdin.write('fluency\n');
      }else{
        driver.stdin.write('next\n');
      }
    }else if(event.phase==='fluency'){
      assert.deepEqual(event.size,[1440,720],'Separate fluency viewport after both idle samples');
      const page=browser.contexts()[0].pages()[0];
      const exercise=await fluency(page);
      await writeFile(join(output,`${event.app}-fluency-${event.iteration}.json`),JSON.stringify({event,...exercise},null,2));
      driver.stdin.write('next\n');
    }else if(event.phase==='closed'){
      assert.equal(event.exitCode,0,'Controlled host close must exit cleanly');
      assert.deepEqual(event.survivors,[],'Hub left descendants alive');
      await browser?.close().catch(()=>{});browser=undefined;
      const profile=profiles[`${event.app}-${event.iteration}`];
      await cp(join(profile,'measurement-startup.json'),join(output,`${event.app}-startup-${event.iteration}.json`));
      const exercisePath=join(output,`${event.app}-fluency-${event.iteration}.json`);
      const exercise=await json(exercisePath);
      exercise.nativeImage=await imageProof(join(output,`${event.app}-fluency-${event.iteration}.png`),720);
      await writeFile(exercisePath,JSON.stringify(exercise,null,2));
    }
  }
  const status=await done;
  await writeFile(join(output,'stderr.log'),stderr);
  assert.equal(status,0,stderr);
  assert.equal(samples.filter(item=>item.phase==='idle').length,4*runs);
  assert.equal(samples.filter(item=>item.phase==='closed').length,2*runs);
  await writeFile(join(output,'complete.json'),JSON.stringify({experiment,runs,output,completed:new Date().toISOString()}));
  console.log(`COMPLETE ${output}`);
}finally{
  await browser?.close().catch(()=>{});
  if(driver?.exitCode===null&&driver.pid){try{execFileSync('taskkill',['/PID',String(driver.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{driver.kill();}}
  for(const peer of peers){peer.stdin.end();if(peer.exitCode===null)await Promise.race([new Promise(accept=>peer.once('exit',accept)),new Promise(accept=>setTimeout(accept,3000))]);if(peer.exitCode===null)peer.kill();}
}
