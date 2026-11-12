import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readdir,stat,writeFile,symlink} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {code,root,evidence,uiSource,require,json,hashFile} from './common.mjs';
const snapshot=join(root,'analysis-source');
await mkdir(snapshot,{recursive:true});
const paths=['vantare-v2/hub-web/src','vantare-v2/hub-web/design','vantare-v2/hub-web/scripts/contract-index.ts','vantare-v2/hub-web/package.json','vantare-v2/native/hub/reference/fixtures','vantare-v2/native/hub/assets'];
const tracked=execFileSync('git',['ls-tree','-r','--name-only',uiSource,'--',...paths],{cwd:code,encoding:'utf8'}).trim().split('\n');
assert.ok(tracked.every(path=>!path.split('/').some(part=>part.startsWith('.env'))));
execFileSync('git',['archive','--format=tar','-o',join(root,'analysis-source.tar'),uiSource,'--',...paths],{cwd:code,windowsHide:true});
execFileSync('tar',['-xf',join(root,'analysis-source.tar'),'-C',snapshot],{windowsHide:true});
const project=join(snapshot,'vantare-v2/hub-web');
await symlink(join(code,'node_modules'),join(project,'node_modules'),'junction').catch(error=>{if(error.code!=='EEXIST')throw error;});
const {contractIndex}=await import(pathToFileURL(join(project,'scripts/contract-index.ts')).href);
contractIndex(new URL('./src/contract/',pathToFileURL(project+'/')));
const {build}=await import(pathToFileURL(require.resolve('vite')).href);
const tailwind=(await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)).default;
const chunks=[];
await build({configFile:false,envDir:false,root:join(project,'src/renderer'),base:'./',plugins:[tailwind(),{name:'qa-module-weights',generateBundle(_options,bundle){for(const item of Object.values(bundle)){if(item.type!=='chunk')continue;chunks.push({fileName:item.fileName,bytes:Buffer.byteLength(item.code),isEntry:item.isEntry,imports:item.imports,dynamicImports:item.dynamicImports,modules:Object.entries(item.modules).map(([id,details])=>({id:id.replaceAll('\\','/').replace(project.replaceAll('\\','/'),'<source>'),renderedLength:details.renderedLength,originalLength:details.originalLength}))});}}}],define:{'process.env.NODE_ENV':JSON.stringify('production'),__VANTARE_RENDERER_MOCK__:'true'},build:{outDir:join(root,'bundle-analysis-out'),emptyOutDir:true,minify:true,rollupOptions:{input:join(project,'src/renderer/index.html')}}});
const prepared=await json(join(root,'prepared.json'));
const original=join(root,'stage',prepared.generation,'out/renderer/assets');
const assets=[];
for(const name of await readdir(original)){const path=join(original,name);if((await stat(path)).isFile())assets.push({name,bytes:(await stat(path)).size,sha256:await hashFile(path)});}
const modules=new Map();
for(const chunk of chunks)for(const module of chunk.modules){const match=module.id.match(/node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);const group=match?.[1]??'application';modules.set(group,(modules.get(group)??0)+module.renderedLength);}
await writeFile(join(evidence,'bundle-analysis.json'),JSON.stringify({source:uiSource,method:'Exact packaged asset byte sizes; diagnostic source rebuild module renderedLength estimates (not compressed, not additive heap). No sourcemaps, no network, no product build changed.',assets,chunks,groups:[...modules].map(([name,renderedLength])=>({name,renderedLength})).sort((a,b)=>b.renderedLength-a.renderedLength)},null,2));
console.log('Bundle analysis saved; module renderedLength is a contribution estimate, never heap usage.');
