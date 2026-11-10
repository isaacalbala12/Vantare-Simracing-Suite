import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { leerContrato } from '../dist/contrato.js';

test('generador admite mi-modelo y retira solo declaraciones generadas sin contrato', t => {
  const pruebas = fileURLToPath(new URL('.',import.meta.url));
  const temporal = mkdtempSync(path.join(pruebas,'.temporal-generador-'));
  t.after(()=>{ assert.ok(path.resolve(temporal).startsWith(path.resolve(pruebas)+path.sep)); rmSync(temporal,{recursive:true,force:true}); });
  const base=path.join(temporal,'ts');
  mkdirSync(path.join(base,'pruebas'),{recursive:true}); mkdirSync(path.join(temporal,'modelos'));
  copyFileSync(fileURLToPath(new URL('../generar.mjs',import.meta.url)),path.join(base,'generar.mjs'));
  copyFileSync(fileURLToPath(new URL('ejemplo.sistema.json',import.meta.url)),path.join(base,'pruebas/ejemplo.sistema.json'));
  const contrato=path.join(temporal,'modelos/mi-modelo.modelo.json');
  writeFileSync(contrato,JSON.stringify({modelo:'mi-modelo/1',campos:{titulo:'texto'}}));
  const generar=()=>{ const r=spawnSync(process.execPath,[path.join(base,'generar.mjs')],{encoding:'utf8',timeout:10000}); assert.equal(r.status,0,r.stderr); };
  generar();
  const declaracion=path.join(base,'generado/mi-modelo.d.ts');
  assert.match(readFileSync(declaracion,'utf8'),/export type MiModelo =/);
  const programa=ts.createProgram([declaracion],{noEmit:true,lib:['lib.es2023.d.ts']});
  assert.equal(ts.getPreEmitDiagnostics(programa).length,0);
  writeFileSync(path.join(base,'generado/manual.d.ts'),'// Documento ajeno al generador\n');
  unlinkSync(contrato); generar();
  assert.equal(existsSync(declaracion),false); assert.equal(existsSync(path.join(base,'generado/manual.d.ts')),true);
});
test('contrato ausente, JSON inválido y estructura inválida tienen mensajes diferentes', t => {
  const fichero=fileURLToPath(new URL('.temporal-contrato.json',import.meta.url));
  t.after(()=>{if(existsSync(fichero))unlinkSync(fichero);});
  assert.throws(()=>leerContrato(fichero),/No se puede leer.*Comprueba/);
  writeFileSync(fichero,'{'); assert.throws(()=>leerContrato(fichero),/JSON inválido.*Corrige/);
  writeFileSync(fichero,'{"modelo":"x/1","campos":{"x":"inventado"}}'); assert.throws(()=>leerContrato(fichero),/Contrato inválido.*Usa/);
});
