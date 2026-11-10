import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { readFileSync, writeFileSync, unlinkSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('vigilar: veinte guardados, reemplazo atómico y recuperación tras error', { timeout: 60000 }, async () => {
  // El plazo es solo una guarda de bloqueo; cada paso espera el ACK real del CLI.
  const entrada = fileURLToPath(new URL('.temporal-vigilar.tsx', import.meta.url));
  const salida = entrada + '.json';
  const contenido = readFileSync(new URL('relativo.tsx', import.meta.url), 'utf8');
  writeFileSync(entrada, contenido);
  const cli = spawn(process.execPath, [fileURLToPath(new URL('../dist/traducir.js', import.meta.url)), entrada, '-o', salida, '--vigilar']);
  const fin = once(cli, 'exit');
  const stdout = createInterface({ input: cli.stdout })[Symbol.asyncIterator]();
  const stderr = createInterface({ input: cli.stderr })[Symbol.asyncIterator]();
  const muestras = [];
  try {
    assert.match((await stdout.next()).value, /^OK /);
    for (let i = 0; i < 20; i++) {
      const inicio = performance.now();
      const nuevo = contenido.replace('nombre={"relativo"}', `nombre={"relativo_${i}"}`);
      if (i % 2) { writeFileSync(entrada + '.nuevo', nuevo); renameSync(entrada + '.nuevo', entrada); }
      else writeFileSync(entrada, nuevo);
      assert.match((await stdout.next()).value, /^OK /);
      const ms = performance.now() - inicio;
      assert.equal(JSON.parse(readFileSync(salida, 'utf8')).nombre, `relativo_${i}`);
      muestras.push(Number(ms.toFixed(2)));
    }
    const previo = readFileSync(salida, 'utf8');
    writeFileSync(entrada, contenido.replace('nombre={"relativo"}', 'nombre={1 + 2}'));
    assert.match((await stderr.next()).value, /ARITMETICA/);
    assert.equal(readFileSync(salida, 'utf8'), previo);
    writeFileSync(entrada, contenido);
    assert.match((await stdout.next()).value, /^OK /);
    assert.equal(JSON.parse(readFileSync(salida, 'utf8')).nombre, 'relativo');
    writeFileSync(entrada, contenido.replace('m.titulo', 'm.no_existe'));
    assert.match((await stderr.next()).value, /TIPO/);
    assert.equal(JSON.parse(readFileSync(salida, 'utf8')).nombre, 'relativo');
    writeFileSync(entrada, contenido.replace('nombre={"relativo"}', 'nombre={"recuperado"}'));
    assert.match((await stdout.next()).value, /^OK /);
    assert.equal(JSON.parse(readFileSync(salida, 'utf8')).nombre, 'recuperado');
    const ordenadas = muestras.toSorted((a,b) => a-b);
    console.log('Mediana ms:', (ordenadas[9] + ordenadas[10]) / 2, 'p95 ms (rango más próximo):', ordenadas[18]);
    console.log('Guardar → JSON escrito (ms), 20 muestras:', JSON.stringify(muestras));
  } finally {
    cli.kill(); await fin;
    for (const fichero of [entrada, salida, entrada + '.nuevo']) if (existsSync(fichero)) unlinkSync(fichero);
  }
});
