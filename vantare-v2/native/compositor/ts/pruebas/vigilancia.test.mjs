import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, rmdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { conPlazo } from './plazo.mjs';

const raiz = fileURLToPath(new URL('../', import.meta.url));
function entorno(t) {
  const temporal = mkdtempSync(path.join(raiz, 'pruebas/.temporal-vigilancia-'));
  const compositor = path.join(temporal, 'compositor');
  const ts = path.join(compositor, 'ts');
  mkdirSync(path.join(ts, 'pruebas'), {recursive:true});
  for (const carpeta of ['dist','generado','receta']) cpSync(path.join(raiz,carpeta), path.join(ts,carpeta), {recursive:true});
  for (const carpeta of ['modelos','sistemas']) cpSync(path.join(raiz,'..',carpeta), path.join(compositor,carpeta), {recursive:true});
  writeFileSync(path.join(ts, 'package.json'), '{"type":"module"}');
  const entrada = path.join(ts, 'pruebas/autor.tsx');
  const texto = readFileSync(path.join(raiz,'pruebas/ejemplo.tsx'),'utf8');
  writeFileSync(entrada,texto);
  const salida = path.join(ts, 'salida.json');
  t.after(() => {
    assert.ok(path.resolve(temporal).startsWith(path.resolve(raiz, 'pruebas') + path.sep));
    rmSync(temporal, {recursive:true, force:true});
  });
  return {ts, entrada, salida, texto, cli:path.join(ts,'dist/traducir.js')};
}
function lanzar(t, e) {
  const cli = spawn(process.execPath,[e.cli,e.entrada,'-o',e.salida,'--vigilar']);
  const fin = once(cli,'exit');
  t.after(async () => { cli.kill(); await conPlazo(fin,3000,()=>cli.kill()); });
  const stdout = createInterface({input:cli.stdout})[Symbol.asyncIterator]();
  const stderr = createInterface({input:cli.stderr})[Symbol.asyncIterator]();
  const esperar = (iterador, patron) => conPlazo((async()=>{
    for (;;) { const v=await iterador.next(); if(v.done) throw new Error('CLI cerrado sin ACK'); if(patron.test(v.value)) return v.value; }
  })(),10000,()=>cli.kill());
  return {ok:()=>esperar(stdout,/^OK /), error:p=>esperar(stderr,p)};
}
test('salida igual a entrada (también mayúsculas y temporal) se rechaza sin sobrescribir', t => {
  const e=entorno(t);
  for (const salida of [e.entrada, ...(process.platform === 'win32' ? [e.entrada.toUpperCase()] : []), e.entrada.slice(0,-4)]) {
    // El tercer caso usa como entrada el .tmp de la salida.
    const entrada = salida === e.entrada.slice(0,-4) ? salida+'.tmp' : e.entrada;
    if (entrada !== e.entrada) writeFileSync(entrada,e.texto);
    const r=spawnSync(process.execPath,[e.cli,entrada,'-o',salida],{encoding:'utf8',timeout:10000});
    assert.equal(r.status,1,r.stderr); assert.match(r.stderr,/distintas de la entrada/);
    assert.equal(readFileSync(entrada,'utf8'),e.texto);
  }
});
test('fallo al publicar y mismo texto guardado después: se recupera y limpia tmp', async t => {
  const e=entorno(t);
  mkdirSync(e.salida);
  const v=lanzar(t,e);
  await v.error(/No se pudo publicar/);
  assert.equal(existsSync(e.salida+'.tmp'),false);
  rmdirSync(e.salida);
  writeFileSync(e.entrada,e.texto);
  await v.ok();
  assert.equal(JSON.parse(readFileSync(e.salida,'utf8')).nombre,'muestra');
});
test('vigila API y generado; contrato y tokens inválidos avisan sin sustituir el JSON', async t => {
  const e=entorno(t);
  const v=lanzar(t,e);
  await v.ok();
  const api=path.join(e.ts,'receta/index.ts');
  const originalApi=readFileSync(api,'utf8');
  writeFileSync(api,originalApi+'\n// actualización de API\n');
  await v.ok();
  const modelo=path.join(e.ts,'generado/relativo.d.ts');
  const originalModelo=readFileSync(modelo,'utf8');
  writeFileSync(modelo,originalModelo.replace('readonly "en_garaje": boolean','readonly "en_garaje": string'));
  await v.error(/TIPO/);
  assert.equal(JSON.parse(readFileSync(e.salida,'utf8')).nombre,'muestra');
  writeFileSync(modelo,originalModelo);
  await v.ok();
  const token=path.join(e.ts,'generado/tokens.ts');
  const originalToken=readFileSync(token,'utf8');
  writeFileSync(token,originalToken.replace('"piloto": "$tipo.piloto"','"retirado": "$tipo.piloto"'));
  await v.error(/TIPO/);
  writeFileSync(token,originalToken);
  await v.ok();
  const contrato=path.join(e.ts,'../modelos/relativo.modelo.json');
  const originalContrato=readFileSync(contrato,'utf8');
  writeFileSync(contrato,'{JSON inválido');
  await v.error(/JSON inválido/);
  writeFileSync(contrato,originalContrato);
  await v.ok();
});
test('error emitido por fs.watch informa y cierra las escuchas', t => {
  const e=entorno(t);
  const hook=path.join(e.ts,'watch-error.mjs');
  writeFileSync(hook, `import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const original=fs.watch;
fs.watch=(...args)=>{const v=original(...args);setImmediate(()=>v.emit('error',new Error('fallo inyectado')));return v;};
syncBuiltinESMExports();`);
  const r=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,e.cli,e.entrada,'-o',e.salida,'--vigilar'],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,1,r.stderr);
  assert.match(r.stderr,/Falló la vigilancia.*fallo inyectado.*Reinicia --vigilar/);
  assert.doesNotMatch(r.stderr,/Unhandled 'error' event/);
});
