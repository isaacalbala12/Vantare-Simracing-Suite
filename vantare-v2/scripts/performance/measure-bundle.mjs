import fs from 'node:fs';
import { experimentPlugin } from './experiment-transforms.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
const [rootArg, outputArg, label = 'candidate', variant = 'minified', experiment = 'none'] = process.argv.slice(2);
if (!rootArg || !outputArg) throw new Error('Usage: node measure-bundle.mjs FRONTEND_ROOT OUTPUT_DIR LABEL [minified|raw]');
const root = path.resolve(rootArg), output = path.resolve(outputArg);
fs.mkdirSync(output, { recursive: true });
const { build } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')));
const graph = {}, chunks = {}, assets = {};
const started = performance.now();
await build({ root, envDir: path.join(output, 'no-env-files'), mode: 'production', logLevel: 'warn',
  build: { outDir: path.join(output, `${label}-${variant}-dist`), emptyOutDir: true, manifest: true, minify: variant === 'raw' ? false : 'oxc' },
  plugins: [experimentPlugin(experiment, output), { name: 'astra-primary-bundle-evidence',
    generateBundle(_, bundle) {
      for (const id of this.getModuleIds()) {
        const m = this.getModuleInfo(id); if (!m) continue;
        const clean = s => s.replace(root, '<frontend>');
        graph[clean(id)] = { imports: m.importedIds.map(clean), dynamicImports: m.dynamicallyImportedIds.map(clean), importers: m.importers.map(clean), dynamicImporters: m.dynamicImporters.map(clean), sideEffects: m.moduleSideEffects, isEntry: m.isEntry };
      }
      for (const [name, item] of Object.entries(bundle)) {
        const data = Buffer.from(item.type === 'chunk' ? item.code : item.source);
        const sizes = { bytes: data.length, gzip: gzipSync(data,{level:9}).length, brotli: brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length };
        if (item.type === 'chunk') chunks[name] = { ...sizes, entry: item.isEntry, dynamicEntry: item.isDynamicEntry, facade: item.facadeModuleId?.replace(root,'<frontend>'), imports: item.imports, dynamicImports: item.dynamicImports, modules: Object.fromEntries(Object.entries(item.modules).map(([k,v])=>[k.replace(root,'<frontend>'),{renderedLength:v.renderedLength,originalLength:v.originalLength}])) };
        else assets[name] = sizes;
      }
    }
  }]
});
// Vite rewrites preload placeholders after generateBundle. Measure final emitted bytes.
for (const [name, item] of Object.entries({...chunks,...assets})) {
 const file=path.join(output,`${label}-${variant}-dist`,name);
 if(fs.existsSync(file)){const bytes=fs.readFileSync(file);Object.assign(item,{bytes:bytes.length,gzip:gzipSync(bytes,{level:9}).length,brotli:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length});}
}
const manifest=JSON.parse(fs.readFileSync(path.join(output,`${label}-${variant}-dist/.vite/manifest.json`),'utf8'));
const record = { label, variant, manifest, classification: 'MEASURED-MAC-CANONICAL', buildSeconds: (performance.now()-started)/1000, graph, chunks, assets };
fs.writeFileSync(path.join(output,`${label}-${variant}.json`),JSON.stringify(record,null,2));
console.log(JSON.stringify({label,variant,buildSeconds:record.buildSeconds,chunks:Object.keys(chunks).length,modules:Object.keys(graph).length,largest:Object.entries(chunks).sort((a,b)=>b[1].bytes-a[1].bytes).slice(0,12).map(([n,c])=>({name:n,bytes:c.bytes,gzip:c.gzip,brotli:c.brotli}))},null,2));
