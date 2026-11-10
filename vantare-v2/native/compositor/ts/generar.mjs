import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.dirname(fileURLToPath(import.meta.url));
const cabecera = '// Generado por generar.mjs. No editar.\n';
function tipo(campo) {
  if (campo === 'bool') return 'boolean';
  if (campo === 'texto') return 'string';
  if (campo === 'numero') return 'number';
  if (campo.enum) return campo.enum.map(v => JSON.stringify(v)).join(' | ');
  if (campo.lista) return `Array<${objeto(campo.lista)}>`;
  throw new Error(`Tipo de contrato desconocido: ${JSON.stringify(campo)}`);
}
function objeto(campos) {
  return `{\n${Object.entries(campos).map(([k,v]) => `readonly ${JSON.stringify(k)}: ${tipo(v)};`).join('\n')}\n}`;
}
mkdirSync(path.join(base, 'generado'), { recursive: true });
const vigentes = new Set();
for (const fichero of readdirSync(path.join(base, '../modelos')).filter(f => f.endsWith('.modelo.json')).sort()) {
  const contrato = JSON.parse(readFileSync(path.join(base, '../modelos', fichero), 'utf8'));
  const nombre = fichero.replace('.modelo.json', '');
  const partes = nombre.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = partes.map(p => p[0].toUpperCase() + p.slice(1)).join('');
  const interfaz = /^[A-Za-z]/.test(pascal) ? pascal : 'Modelo' + pascal;
  vigentes.add(`${nombre}.d.ts`);
  writeFileSync(path.join(base, 'generado', `${nombre}.d.ts`), cabecera + `export type ${interfaz} = ${objeto(contrato.campos)};\nexport declare const m: ${interfaz};\n`);
}
for (const fichero of readdirSync(path.join(base, 'generado'))) {
  const ruta = path.join(base, 'generado', fichero);
  if (fichero.endsWith('.d.ts') && !vigentes.has(fichero) && readFileSync(ruta, 'utf8').startsWith(cabecera)) unlinkSync(ruta);
}
const sistemas = path.join(base, '../sistemas');
const archivos = existsSync(sistemas) ? readdirSync(sistemas).filter(f => f.endsWith('.sistema.json')).sort().map(f => path.join(sistemas, f)) : [];
const opciones = process.argv.slice(2);
if (opciones.length && (opciones.length !== 2 || opciones[0] !== '--sistema')) throw new Error('Uso: node generar.mjs [--sistema ruta.sistema.json]');
if (!opciones.length && archivos.length > 1) throw new Error('Selecciona un único sistema con --sistema; no se mezclan sistemas.');
const sistema = JSON.parse(readFileSync(opciones[1] ? path.resolve(opciones[1]) : archivos[0] ?? path.join(base, 'pruebas/ejemplo.sistema.json'), 'utf8'));
function tokens(valor, ruta) {
  if (typeof valor !== 'object' || valor === null || ['tipo','mov','efecto'].includes(ruta.split('.')[0]) && ruta.includes('.')) return '$' + ruta;
  return Object.fromEntries(Object.entries(valor).map(([k,v]) => [k, tokens(v, ruta ? `${ruta}.${k}` : k)]));
}
const espacios = Object.fromEntries(Object.entries(sistema).filter(([k]) => !['sistema','nombre','fuentes'].includes(k)));
writeFileSync(path.join(base, 'generado/tokens.ts'), cabecera + `export const tokens = ${JSON.stringify(tokens(espacios, ''), null, 2)} as const;\n`);
