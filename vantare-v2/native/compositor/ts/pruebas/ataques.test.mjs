import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Traductor, ErrorTraduccion } from '../dist/traductor.js';

const base = new URL('ataques/', import.meta.url);
const entrada = fileURLToPath(new URL('.temporal-adversaria.tsx', import.meta.url));
const traductor = new Traductor();
// Casos que son marcado válido; los demás deben producir errores, nunca un JSON.
const validos = new Set(['a09','a17','a39','a40','b15','b19','b23','b27','b29','b32','b38','b39','d09','d10','d16','d18','d08','d01']);
for (const nombre of readdirSync(base).filter(f => f.endsWith('.tsx')).sort()) test(`adversaria ${nombre}`, () => {
  const original = readFileSync(new URL(nombre, base), 'utf8');
  const texto = nombre.startsWith('d04_') ? original.replace(/\r?\n/g, '\r\n') : original;
  writeFileSync(entrada, texto);
  try {
    if (validos.has(nombre.slice(0,3))) assert.equal(traductor.traducir(entrada, texto).tipo, 'overlay');
    else assert.throws(() => traductor.traducir(entrada, texto), error => {
      assert.ok(error instanceof ErrorTraduccion, String(error));
      for (const d of error.diagnosticos ?? [error]) {
        assert.ok(d.linea >= 1 && d.columna >= 1);
        assert.match(d.message, /usa|quita|corrige|pide|añade|coloca|no uses|comprueba|exporta|escribe|selecciona|enlaza|importa|no repitas|necesita/i);
      }
      return true;
    });
  } finally { unlinkSync(entrada); }
});
test('CRLF, BOM y caracteres astrales conservan posiciones UTF-16 exactas', () => {
  for (const nombre of ['d04_crlf_pos.tsx','d05_bom.tsx','d06_astral_before_error.tsx']) {
    const original = readFileSync(new URL(nombre,base),'utf8');
    const texto = nombre.startsWith('d04') ? original.replace(/\r?\n/g,'\r\n') : original;
    const antes = texto.slice(0,texto.indexOf('m.en_garaje ?')).split(/\r\n|\n/);
    assert.throws(()=>traductor.traducir(entrada,texto),error=>{
      assert.equal(error.codigo,'TERNARIO'); assert.equal(error.linea,antes.length); assert.equal(error.columna,antes.at(-1).length+1); return true;
    });
  }
});
test('la lista blanca también cierra objetos constantes y entidades en atributos', () => {
  const imports = `import {Overlay,Caja} from '../receta/index.js';\nimport {m} from '../generado/relativo.js';\n`;
  for (const cuerpo of ['const estilo={opacidad:1,inventada:2}; export default <Overlay nombre="t" modelo="relativo/1"><Caja estilo={estilo}/></Overlay>', 'export default <Overlay nombre="a&amp;b" modelo="relativo/1"><Caja/></Overlay>']) {
    assert.throws(()=>traductor.traducir(entrada,imports+cuerpo),error=>{ assert.equal(error.codigo,'SINTAXIS'); return true; });
  }
});
test('directivas y referencias tienen posición exacta; las cadenas no son comentarios', () => {
  const imports = `import { Overlay, Caja, Texto } from '../receta/index.js';\nimport {m} from '../generado/relativo.js';\n`;
  const overlay = `export default <Overlay nombre="t" modelo="relativo/1"><Caja><Texto>{"@ts-ignore"}</Texto></Caja></Overlay>`;
  for (const [comentario, codigo] of [['// @ts-ignore', 'DIRECTIVA'], ['/* @ts-expect-error */', 'DIRECTIVA'], ['/// <reference types="node" />', 'REFERENCIA'], ['/// <reference lib="dom" />', 'REFERENCIA']]) {
    assert.throws(() => traductor.traducir(entrada, comentario + '\n' + imports + overlay), e => {
      assert.equal(e.codigo, codigo); assert.equal(e.linea, 1); assert.equal(e.columna, 1); return true;
    });
  }
  assert.equal(traductor.traducir(entrada, imports + overlay).raiz.hijos[0].texto, '@ts-ignore');
});
test('errores de marcado y tipos se devuelven juntos, incluidos los nodos antes de tsc', () => {
  const texto = readFileSync(new URL('c03_type_then_jsx_spread.tsx', base), 'utf8');
  assert.throws(() => traductor.traducir(entrada, texto), e => {
    assert.equal(e.codigo, 'SINTAXIS');
    assert.ok(e.diagnosticos.some(d => d.codigoTs === 2322));
    return true;
  });
  const varios = readFileSync(new URL('c01_multi_markup.tsx', base), 'utf8');
  assert.throws(() => traductor.traducir(entrada, varios), e => {
    for (const codigo of ['TERNARIO','LOGICA','MAP']) assert.ok(e.diagnosticos.some(d => d.codigo === codigo));
    return true;
  });
});
test('una lectura suministrada prevalece sobre el disco y no se vuelve a leer la entrada', () => {
  const texto = readFileSync(new URL('b27_unused_const_ok.tsx', base), 'utf8');
  writeFileSync(entrada, '// @ts-nocheck\ntexto inválido');
  try { assert.equal(traductor.traducir(entrada, texto).tipo, 'overlay'); }
  finally { unlinkSync(entrada); }
});
test('posición exacta de una ruta JS fuera del contrato y tokens por símbolo', () => {
  const texto = readFileSync(new URL('b08_length.tsx', base), 'utf8');
  const antes = texto.slice(0, texto.indexOf('m.titulo.length')).split('\n');
  assert.throws(() => traductor.traducir(entrada, texto), e => {
    assert.equal(e.codigo, 'MODELO'); assert.equal(e.linea, antes.length); assert.equal(e.columna, antes.at(-1).length + 1); return true;
  });
  const bueno = readFileSync(new URL('b38_tokens_comment.tsx', base), 'utf8');
  assert.equal(traductor.traducir(entrada, bueno).raiz.hijos[0].estilo.color, '$color.texto');
});

test('espacios al final y NBSP explícito se conservan sin normalización', () => {
 const texto=readFileSync(new URL('d08_texto_un_hijo_espacio.tsx', base), 'utf8');
 assert.equal(traductor.traducir(entrada,texto).raiz.hijos[0].texto, 'Hola ');
 const nbsp=readFileSync(new URL('b05_nbsp.tsx', base), 'utf8').replace('>1\u00a0000\u00a0km<', '>{"1\u00a0000\u00a0km"}<');
 assert.equal(traductor.traducir(entrada,nbsp).raiz.hijos[0].texto, '1\u00a0000\u00a0km');
});
