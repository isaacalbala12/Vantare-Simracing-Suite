import path from 'node:path';
import { experimentPlugin } from './experiment-transforms.mjs';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import inspector from 'node:inspector';
const [rootArg, outputArg, label='base', experiment='none'] = process.argv.slice(2);
const root=path.resolve(rootArg), output=path.resolve(outputArg);
const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
const server=await createServer({root,envDir:path.join(output,'no-env-files'),configFile:false,plugins:[experimentPlugin(experiment,output)],optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},logLevel:'error'});
const session=new inspector.Session();session.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(err,result)=>err?reject(err):resolve(result)));
try {
 const {buildTrackMapViewModelV2:build}=await server.ssrLoadModule('/src/overlay/widget-types/track-map/track-map-view-model-v2.ts');
 const {TRACK_GEOMETRY_PACK:pack}=await server.ssrLoadModule('/src/overlay/track-geometry/track-geometry-pack.ts');
 const rows=Array.from({length:44},(_,i)=>({id:String(i),groundPosition:{q:'fresh',v:{x:i*10,z:i*5}}}));
 const frame={session:{track:{q:'fresh',v:'Circuit de la Sarthe'}},player:{id:'0'},standings:rows};
 const track=pack.find(x=>x.id.includes('sarthe'))??pack.find(x=>!x.synthetic);frame.session.track.v=track.label;
 const source={state:'live'},content={showTrackLabel:true};
 const model=build(frame,source,content);if(!model.outlinePath||model.markers.length!==44)throw new Error('Fixture failed: no real track/44 markers');
 for(let i=0;i<1000;i++)build(frame,source,content);
 await post('Profiler.enable');await post('Profiler.start');
 const runs=[];let checksum=0;
 for(let run=0;run<10;run++){
  const start=performance.now();for(let i=0;i<3000;i++){frame.standings[0].groundPosition.v.x=i;checksum+=build(frame,source,content).outlinePath.length;}
  runs.push((performance.now()-start)*1e6/3000);
 }
 const profile=(await post('Profiler.stop')).profile;
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`${label}-track-map.cpuprofile`),JSON.stringify(profile));
 const record={label,classification:'MEASURED-MAC-RELATIVE',fixture:{track:track.label,points:track.points.length,vehicles:44,warmup:1000,iterations:3000,repetitions:10},nsPerOp:runs,checksum};
 fs.writeFileSync(path.join(output,`${label}-track-map.json`),JSON.stringify(record,null,2));console.log(record);
} finally {session.disconnect();await server.close();}
