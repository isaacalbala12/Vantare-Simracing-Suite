import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, owned, sourceGeneration, uiSource, require, hashFile, digest, evidence, code } from './common.mjs';

const { extractAll, getRawHeader, createPackageWithOptions } = await import(pathToFileURL(require.resolve('@electron/asar')).href);
const { NtExecutable, NtExecutableResource } = await import(pathToFileURL(require.resolve('resedit')).href);
const { verifyQaFuses } = await import(pathToFileURL(join(code, 'scripts/qa-fuses.ts')).href);
const originalManifestBytes = await readFile(join(sourceGeneration, 'manifest.json'));
const originalManifest = JSON.parse(originalManifestBytes);
const originalState = JSON.parse(await readFile(join(dirname(dirname(sourceGeneration)), 'state.json'), 'utf8'));
assert.equal(digest(originalManifestBytes), originalState.active.manifest_sha256);
for (const path of ['bin/vantare-hub.exe', 'bin/vantare.exe', 'bin/vantare-core.exe', 'hub-ui/vantare-hub-ui.exe', 'hub-ui/resources/app.asar']) {
  const member = originalManifest.files.find(member => member.path === path);
  assert.ok(member, `Missing original inventory ${path}`);
  assert.equal(await hashFile(join(sourceGeneration, path)), member.sha256);
}
console.log('Original candidate and executable/ASAR inventory verified');
const generation = randomBytes(16).toString('hex');
const folder = owned(join(root, 'generations', generation));
await mkdir(folder, { recursive: true });
await cp(join(sourceGeneration, 'bin'), join(folder, 'bin'), { recursive: true });
await cp(join(sourceGeneration, 'hub-ui'), join(folder, 'hub-ui'), { recursive: true });
await cp(join(sourceGeneration, 'replies.json'), join(folder, 'replies.json'));
await cp(join(sourceGeneration, 'measurement-qa-owned'), join(folder, 'measurement-qa-owned'));
const stage = owned(join(root, 'stage', generation));
await mkdir(stage, { recursive: true });
const archive = join(folder, 'hub-ui/resources/app.asar');
extractAll(archive, stage);
const metadata = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'));
assert.equal(metadata.main, 'out/main/index.js');
const entry = join(stage, metadata.main);
const originalMain = await readFile(entry, 'utf8');
let main = 'import "./measurement-qa.mjs";\n' + originalMain;
const patches = [];
function markAround(anchor, before, after) {
  assert.equal(main.split(anchor).length - 1, 1, `Unique instrumentation anchor: ${anchor}`);
  main = main.replace(anchor, `globalThis.__vantareMeasureMark(${JSON.stringify(before)});\n${anchor}\nglobalThis.__vantareMeasureMark(${JSON.stringify(after)});`);
  patches.push({ anchor, before, after });
}
markAround('await app.whenReady();', 'before-app-ready-await', 'after-app-ready-await');
markAround('const host = createHost();', 'before-host-create', 'after-host-create');
markAround('const hello = await host.hello;', 'before-host-hello', 'after-host-hello');
markAround('port1.postMessage(hello);', 'before-renderer-hello', 'after-renderer-hello');
await writeFile(entry, main);
await cp(join(root, 'tools/measurement-qa.mjs'), join(dirname(entry), 'measurement-qa.mjs'));
await createPackageWithOptions(stage, archive, {});
const executable = join(folder, 'hub-ui/vantare-hub-ui.exe');
const bytes = await readFile(executable);
const featureNames = Object.fromEntries(['MediaRouter','HardwareMediaKeyHandling','renderer-process-limit'].map(name => [name, bytes.includes(Buffer.from(name))]));
const exe = NtExecutable.from(bytes);
const resources = NtExecutableResource.from(exe);
const integrity = resources.entries.filter(item => item.type === 'INTEGRITY' && item.id === 'ELECTRONASAR');
assert.equal(integrity.length, 1);
const values = JSON.parse(Buffer.from(integrity[0].bin).toString('utf8').replace(/\0+$/, ''));
assert.equal(values.length, 1);
assert.equal(values[0].alg, 'SHA256');
assert.match(values[0].file, /resources[\\/]app\.asar$/i);
values[0].value = digest(getRawHeader(archive).headerString);
const encoded = Buffer.from(JSON.stringify(values));
integrity[0].bin = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
resources.outputResource(exe);
await writeFile(executable, Buffer.from(exe.generate()));
await verifyQaFuses(join(folder, 'hub-ui'));
console.log('QA ASAR rebuilt, PE integrity resource updated, all seven fuses retained');
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === folder && ['data','manifest.json'].includes(entry.name)) continue;
    assert.ok(!entry.isSymbolicLink(), 'QA inventory rejects links');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result.sort();
}
for (const path of await files(folder)) if (path.toLowerCase().endsWith('.exe')) await writeFile(path+'.sha256', `${await hashFile(path)}  ${path.split(/[\\/]/).pop()}\n`);
const members = [];
for (const path of await files(folder)) members.push({ path: relative(folder,path).replaceAll('\\','/'), size: (await stat(path)).size, sha256: await hashFile(path) });
const version = execFileSync(join(folder, 'bin/vantare-hub.exe'), ['--version'], { encoding:'utf8', windowsHide:true }).match(/^Vantare Native (\d+\.\d+\.\d+) /)?.[1];
assert.ok(version);
const source = execFileSync('git',['rev-parse','HEAD'],{ cwd:code,encoding:'utf8',windowsHide:true }).trim();
const manifest = JSON.stringify({ schema:1,product:'vantare-native',candidate:true,architecture:'windows-x64',version,channel:'nightly',data_schema:'opaque-v1',source_sha:source,source_dirty:true,build_profile:'Release',files:members });
await writeFile(join(folder,'manifest.json'),manifest);
await writeFile(join(root,'state.json'),JSON.stringify({schema:1,product:'vantare-native',channel:'nightly',active:{generation,manifest_sha256:digest(manifest)},previous:null}));
await mkdir(evidence,{recursive:true});
const provenance = { generation, folder, source, uiSource, originalGeneration:sourceGeneration, originalMainSha256:digest(originalMain), instrumentedMainSha256:digest(main), appAsarSha256:await hashFile(archive), uiExeSha256:await hashFile(executable), featureNames, patches, payloadBytes:members.reduce((sum,item)=>sum+item.size,0), qaOnly:true, source_dirty:true, method:'Common instrumented package for every baseline/variant; only a closed QA data-file option changes. No product files or security preferences altered.' };
await writeFile(join(root,'prepared.json'),JSON.stringify(provenance,null,2));
await writeFile(join(evidence,'provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({ generation, featureNames, payloadBytes:provenance.payloadBytes }));
