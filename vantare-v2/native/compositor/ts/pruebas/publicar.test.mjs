import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, renameSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicar } from '../dist/publicar.js';
import { conPlazo } from './plazo.mjs';

const salida = fileURLToPath(new URL('.temporal-publicar.json', import.meta.url));
for (const codigo of ['EPERM','EBUSY']) test(`publicación reintenta ${codigo}, escribe o conserva y limpia`, async () => {
  let intentos = 0;
  let esperas = 0;
  const io = { escribir: writeFileSync, borrar: unlinkSync, existe: existsSync, esperar: async () => { esperas++; }, renombrar: (a,b) => { intentos++; if (intentos < 3) throw Object.assign(new Error('ocupado'), {code: codigo}); renameSync(a,b); } };
  try {
    writeFileSync(salida, 'viejo');
    await publicar(salida, 'nuevo', io);
    assert.equal(readFileSync(salida,'utf8'), 'nuevo');
    assert.equal(intentos, 3); assert.equal(esperas, 2); assert.equal(existsSync(salida + '.tmp'), false);
    intentos = 0;
    io.renombrar = () => { intentos++; throw Object.assign(new Error('ocupado'), {code: codigo}); };
    await assert.rejects(publicar(salida, 'perdido', io), /cierra el lector.*vuelve a guardar/);
    assert.equal(intentos, 5); assert.equal(readFileSync(salida,'utf8'), 'nuevo'); assert.equal(existsSync(salida + '.tmp'), false);
  } finally { for (const f of [salida, salida+'.tmp']) if (existsSync(f)) unlinkSync(f); }
});
test('un CLI sin ACK agota su plazo y ejecuta el cierre', async () => {
  let cerrado = false;
  await assert.rejects(conPlazo(new Promise(() => {}), 20, () => { cerrado = true; }), /Plazo agotado/);
  assert.equal(cerrado, true);
});
