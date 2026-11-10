import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { traducir, ErrorTraduccion, ErroresTipo } from '../dist/traductor.js';

const ejemplo = fileURLToPath(new URL('ejemplo.tsx', import.meta.url));
const temporal = fileURLToPath(new URL('.temporal-caso.tsx', import.meta.url));
const imports = `import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';\n`;
const overlay = texto => `export default <Overlay nombre="test" modelo="relativo/1"><Caja>${texto}</Caja></Overlay>;`;
function caso(codigo, contrato = 'relativo') {
  writeFileSync(temporal, imports.replace('generado/relativo.js', `generado/${contrato}.js`) + codigo);
  try { return traducir(temporal); } finally { unlinkSync(temporal); }
}
test('ejemplo equivale a una receta manual con todas las características', () => {
  assert.deepEqual(traducir(ejemplo), JSON.parse(readFileSync(new URL('ejemplo.receta.json', import.meta.url), 'utf8')));
});
test('const literales, tokens, condiciones y enlaces se sustituyen', () => {
  const obtenido = caso(`const estilo = {color: tokens.color.texto};\n` + overlay('<Texto estilo={estilo}>{m.titulo}</Texto>'));
  assert.deepEqual(obtenido, { receta: 1, tipo: 'overlay', nombre: 'test', modelo: 'relativo/1', raiz: { tipo: 'caja', hijos: [{tipo: 'texto', estilo: {color: '$color.texto'}, texto: '{titulo}'}] } });
});
test('estilos tipados, degradado, transiciones y muelle se conservan', () => {
  const obtenido = caso(`import type { Estilo } from '../receta/index.js';
const estilo = { ancho: '100%', radio: 0, fondo: {lineal: {angulo: 90, paradas: [[tokens.color.panel.arriba, 0], [tokens.color.texto, 1]]}} } satisfies Estilo;
` + overlay('<Caja id="panel" estilo={estilo} transiciones={{opacidad: {duracion: 200, curva: [0, 0, 1, 1], retardo: 10}, y: {muelle: {rigidez: 100, amortiguacion: 20}}}}/>'));
  assert.deepEqual(obtenido.raiz.hijos[0], {tipo: 'caja', id: 'panel', estilo: {ancho: '100%', radio: 0, fondo: {lineal: {angulo: 90, paradas: [['$color.panel.arriba', 0], ['$color.texto', 1]]}}}, transiciones: {opacidad: {duracion: 200, curva: [0,0,1,1], retardo: 10}, y: {muelle: {rigidez: 100, amortiguacion: 20}}}, });
});
const errores = [
  ['TERNARIO', overlay('{m.en_garaje ? <Caja/> : <Caja/>}')],
  ['LOGICA', overlay('{m.en_garaje && <Caja/>}')],
  ['LOGICA', overlay('{m.en_garaje || <Caja/>}')],
  ['ARITMETICA', overlay('<Texto>{1 + 2}</Texto>')],
  ['MAP', overlay('{m.filas.map(fila => <Texto>{fila.piloto}</Texto>)}')],
  ['LLAMADA', overlay('<Texto>{String(m.titulo)}</Texto>')],
  ['MUTABLE', 'let x = 1;\n' + overlay('')],
  ['CONTROL', 'if (true) {}\n' + overlay('')],
  ['CONTROL', 'for (;;) {}\n' + overlay('')],
  ['IMPORT', `import fs from 'node:fs';\n` + overlay('')],
  ['IMPORT', `import { Caja as Otra } from '../receta/index.js';\n` + overlay('')],
  ['CONSTANTE', 'const x = m.titulo;\n' + overlay('')],
  ['CONSTANTE', 'const x = y; const y = x;\n' + overlay('')],
  ['SINTAXIS', overlay('<Caja {...{capa:true}}/>')],
  ['SINTAXIS', overlay('<Lista de={m.filas} clave="id">{fila => { return <Caja/>; }}</Lista>')],
  ['MODELO', overlay('').replace('relativo/1', 'relativo/99')],
  ['TIPO', overlay('<Texto estilo={{color: tokens.color.inventado}}>hola</Texto>')],
  ['TIPO', overlay('<Texto estilo={{color: "#ffffff"}}>hola</Texto>')],
  ['TIPO', overlay('<Caja estilo={{alto: 24}}/>')],
  ['TIPO', overlay('<Texto>{m.no_existe}</Texto>')],
  ['TIPO', overlay('<Caja visible={es(m.titulo, "x")}/>')],
  ['TIPO', overlay('<Caja visible={es(m.aviso, "inexistente")}/>')],
  ['TIPO', overlay('<Caja visible={no(m.titulo)}/>')],
  ['TIPO', overlay('<Caja estilo={{fondo: "rojo" as any}}/>')],
  ['TIPO', overlay('<Caja estilo={{propiedad_inventada: 0}}/>')],
  ['TIPO', overlay('<Lista de={m.filas} clave="no_existe">{fila => <Texto>{fila.piloto}</Texto>}</Lista>')],
  ['TIPO', overlay('<Lista de={m.filas} clave="id">{fila => <Texto estilo={{color: `$color.clase.${fila.lado}`}}>{fila.piloto}</Texto>}</Lista>')],
];
for (const [codigo, fuente] of errores) test(`rechaza ${codigo}: ${fuente.slice(0, 95)}`, () => {
  assert.throws(() => caso(fuente), error => {
    assert.ok(error instanceof ErrorTraduccion, String(error));
    assert.equal(error.codigo, codigo);
    assert.equal(error.fichero, temporal);
    assert.ok(error.linea >= 1 && error.columna >= 1);
    return true;
  });
});
test('posición exacta del ternario (línea y columna base uno)', () => {
  assert.throws(() => caso(overlay('{m.en_garaje ? <Caja/> : <Caja/>}')), e => {
    assert.equal(e.linea, 3); assert.equal(e.columna, 66); return true;
  });
});
test('contrato inexistente produce error tipado en el fichero de autor', () => {
  assert.throws(() => caso(overlay(''), 'inventado'), e => {
    assert.ok(e instanceof ErrorTraduccion); assert.equal(e.codigo, 'MODELO');
    assert.equal(e.linea, 3); return true;
  });
});

test('TSX del relativo equivale exactamente a la receta directa vigente', () => {
  assert.deepEqual(traducir(fileURLToPath(new URL('relativo.tsx', import.meta.url))), JSON.parse(readFileSync(new URL('../../recetas/relativo.receta.json', import.meta.url), 'utf8')));
});
test('un estado puede tener solo bucle y los bucles no necesitan cuando', () => {
  const resultado = caso(overlay('<Caja estados={[{cuando: m.marca, bucle: {propiedad: "opacidad", valores: [0, 1], duracion: 200}}]} bucle={{propiedad: "opacidad", valores: [1, 0], duracion: 300}}/>'));
  assert.deepEqual(resultado.raiz.hijos[0], {tipo: 'caja', estados: [{cuando: 'marca', bucle: {propiedad: 'opacidad', valores: [0,1], duracion: 200}}], bucle: {propiedad: 'opacidad', valores: [1,0], duracion: 300}});
});
test('devuelve todos los errores tsc con código y posición propios', () => {
  const codigo = overlay('<Texto estilo={{color: "#fff", alto: 24}}>{m.no_existe}</Texto>');
  const fuente = imports + codigo;
  assert.throws(() => caso(codigo), error => {
    assert.ok(error instanceof ErroresTipo);
    assert.equal(error.diagnosticos.length, 3);
    const esperados = [['color:', 2322], ['alto:', 2322], ['no_existe', 2339]];
    for (const [i, diagnostico] of error.diagnosticos.entries()) {
      const [campo, codigoTs] = esperados[i];
      const antes = fuente.slice(0, fuente.indexOf(campo)).split('\n');
      assert.equal(diagnostico.codigoTs, codigoTs);
      assert.equal(diagnostico.fichero, temporal);
      assert.equal(diagnostico.linea, antes.length);
      assert.equal(diagnostico.columna, antes.at(-1).length + 1);
      assert.ok(error.message.includes(diagnostico.message));
    }
    return true;
  });
});
