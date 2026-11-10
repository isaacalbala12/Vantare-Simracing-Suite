import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export type Codigo = 'TIPO' | 'IMPORT' | 'MUTABLE' | 'CONTROL' | 'TERNARIO' | 'LOGICA' | 'MAP' | 'ARITMETICA' | 'LLAMADA' | 'SINTAXIS' | 'MODELO' | 'CONSTANTE';
export class ErrorTraduccion extends Error {
  readonly fichero: string;
  readonly linea: number;
  readonly columna: number;
  constructor(readonly codigo: Codigo, nodo: ts.Node, mensaje: string) {
    const fuente = nodo.getSourceFile();
    const pos = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente));
    super(`${fuente.fileName}:${pos.line + 1}:${pos.character + 1}: ${codigo}: ${mensaje}`);
    this.fichero = path.resolve(fuente.fileName); this.linea = pos.line + 1; this.columna = pos.character + 1;
  }
}
type Json = string | number | boolean | Json[] | { [key: string]: Json };
type Objeto = { [key: string]: Json };
const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../receta/index.ts');
const generado = path.resolve(path.dirname(api), '../generado');

export function traducir(fichero: string): Objeto {
  const programa = ts.createProgram([path.resolve(fichero)], {
    strict: true, noEmit: true, target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.Preserve, types: [], skipLibCheck: false,
  });
  const fuente = programa.getSourceFile(path.resolve(fichero));
  if (!fuente) throw new Error(`No se puede leer ${fichero}.`);
  const checker = programa.getTypeChecker();
  const constantes = new Map<string, ts.Expression>();
  let modelo = '';
  let raiz: ts.Expression | undefined;
  function fallo(codigo: Codigo, nodo: ts.Node, mensaje: string): never { throw new ErrorTraduccion(codigo, nodo, mensaje); }
  // Da primero las sugerencias de marcado, incluso si tsc también rechaza la expresión.
  function revisar(n: ts.Node): void {
    if (n.kind === ts.SyntaxKind.AnyKeyword || ts.isTypeAssertionExpression(n) || ts.isAsExpression(n) && n.type.getText(fuente) !== 'const') fallo('TIPO', n, 'No desactives el contrato con any o as; usa sus tipos generados.');
    if (ts.isConditionalExpression(n)) fallo('TERNARIO', n, 'Usa estados con cuando en lugar de un ternario.');
    if (ts.isBinaryExpression(n)) fallo(n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken ? 'LOGICA' : 'ARITMETICA', n, 'Usa visible/estados con cuando. Si necesitas calcular, pide el campo ya calculado al contrato del modelo.');
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map') fallo('MAP', n, 'Usa <Lista de={m.filas} clave="id"> con una función hija.');
      if (!ts.isIdentifier(n.expression) || !['no','es'].includes(n.expression.text)) fallo('LLAMADA', n, 'Solo se admiten no() y es(); pide al núcleo el valor ya calculado.');
    }
    if (ts.isIfStatement(n) || ts.isIterationStatement(n, false) || ts.isSwitchStatement(n)) fallo('CONTROL', n, 'Usa Lista para repetir y estados/visible para condiciones.');
    ts.forEachChild(n, revisar);
  }
  revisar(fuente);
  for (const sentencia of fuente.statements) {
    if (ts.isImportDeclaration(sentencia)) {
      if (!ts.isStringLiteral(sentencia.moduleSpecifier)) fallo('IMPORT', sentencia, 'Importa solo la API, tokens o el modelo generado.');
      const ruta = path.resolve(path.dirname(fichero), sentencia.moduleSpecifier.text).replace(/\.js$/, '.ts');
      const esApi = ruta === api;
      const esModelo = ruta.startsWith(generado + path.sep) && ruta.endsWith('.ts') && !ruta.endsWith('tokens.ts');
      if (!esApi && !esModelo) fallo('IMPORT', sentencia, 'Importa solo receta/index.js o generado/<modelo>.js.');
      const bindings = sentencia.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings) || sentencia.importClause?.name) fallo('IMPORT', sentencia, 'Usa imports con nombres, sin alias.');
      for (const b of bindings.elements) {
        const esTipo = b.isTypeOnly || sentencia.importClause?.isTypeOnly;
        const permitido = esApi ? (esTipo ? ['Estilo', 'Nodo', 'Transicion'] : ['Overlay','Caja','Texto','Lista','tokens','no','es']).includes(b.name.text) : b.name.text === 'm';
        if (b.propertyName || !permitido) fallo('IMPORT', b, 'Usa los nombres originales de la API o m del modelo generado.');
      }
      if (esModelo) { if (modelo) fallo('MODELO', sentencia, 'Importa un único modelo.'); modelo = path.basename(ruta, '.ts'); }
    } else if (ts.isVariableStatement(sentencia)) {
      if (!(sentencia.declarationList.flags & ts.NodeFlags.Const)) fallo('MUTABLE', sentencia, 'Usa const con literales; el modelo contiene los valores que cambian.');
      for (const d of sentencia.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) fallo('CONSTANTE', d, 'Usa const nombre = literal.');
        constantes.set(d.name.text, d.initializer);
      }
    } else if (ts.isExportAssignment(sentencia) && !sentencia.isExportEquals) {
      if (raiz) fallo('SINTAXIS', sentencia, 'Exporta un único Overlay por defecto.');
      raiz = sentencia.expression;
    } else fallo('SINTAXIS', sentencia, 'Solo imports, const literales y export default <Overlay> están permitidos.');
  }
  let alias: string[] = [];
  function ruta(n: ts.Expression): string {
    if (!ts.isPropertyAccessExpression(n)) return fallo('MODELO', n, 'Usa un acceso directo al modelo, como m.titulo o fila.piloto.');
    const partes: string[] = [];
    let actual: ts.Expression = n;
    while (ts.isPropertyAccessExpression(actual)) { partes.unshift(actual.name.text); actual = actual.expression; }
    if (!ts.isIdentifier(actual) || !(actual.text === 'm' || alias.includes(actual.text))) return fallo('MODELO', n, 'Usa m.campo o el parámetro de Lista.');
    return (actual.text === 'm' ? [] : [actual.text]).concat(partes).join('.');
  }
  function condicion(n: ts.Expression): string {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (n.expression.text === 'no' && n.arguments.length === 1) {
        const p = n.arguments[0];
        if (!(checker.getTypeAtLocation(p).flags & ts.TypeFlags.BooleanLike)) fallo('TIPO', p, 'no() necesita un booleano del modelo.');
        return '!' + ruta(p);
      }
      if (n.expression.text === 'es' && n.arguments.length === 2 && ts.isStringLiteral(n.arguments[1])) {
        const tipo = checker.getTypeAtLocation(n.arguments[0]);
        if (!(tipo.isStringLiteral() || tipo.isUnion() && tipo.types.every(t => t.isStringLiteral()))) fallo('TIPO', n, 'es() necesita un enumerado del contrato.');
        return ruta(n.arguments[0]) + '=' + n.arguments[1].text;
      }
      fallo('LLAMADA', n, 'Usa no(booleano) o es(enumerado, "valor").');
    }
    if (!(checker.getTypeAtLocation(n).flags & ts.TypeFlags.BooleanLike)) fallo('TIPO', n, 'La condición debe ser un booleano del modelo.');
    return ruta(n);
  }
  const resolviendo = new Set<string>();
  function literal(n: ts.Expression): void {
    if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n)) return literal(n.expression);
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) fallo('CONSTANTE', p, 'Las constantes solo contienen literales y tokens.');
        literal(p.initializer);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(n)) { n.elements.forEach(literal); return; }
    if (ts.isIdentifier(n) && constantes.has(n.text) || ts.isPropertyAccessExpression(n) && n.getText(fuente).startsWith('tokens.')) return;
    if (ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return;
    fallo('CONSTANTE', n, 'Las constantes solo contienen literales y tokens; enlaza el modelo directamente en JSX.');
  }
  function valor(n: ts.Expression, campo = ''): Json {
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) return valor(n.expression, campo);
    if (campo === 'cuando' || campo === 'visible') return condicion(n);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text);
    if (ts.isObjectLiteralExpression(n)) {
      const salida: Objeto = {};
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) fallo('SINTAXIS', p, 'Usa propiedades explícitas sin spread ni métodos.');
        if (Object.hasOwn(salida, p.name.text)) fallo('SINTAXIS', p, 'No repitas una propiedad.');
        salida[p.name.text] = valor(p.initializer, p.name.text);
      }
      return salida;
    }
    if (ts.isArrayLiteralExpression(n)) return n.elements.map(e => valor(e));
    if (ts.isIdentifier(n) && constantes.has(n.text)) {
      if (resolviendo.has(n.text)) fallo('CONSTANTE', n, 'Evita referencias circulares entre constantes.');
      resolviendo.add(n.text); const resultado = valor(constantes.get(n.text)!, campo); resolviendo.delete(n.text); return resultado;
    }
    if (ts.isPropertyAccessExpression(n)) {
      if (n.getText(fuente).startsWith('tokens.')) {
        const tipo = checker.getTypeAtLocation(n);
        if (!tipo.isStringLiteral()) fallo('TIPO', n, 'Selecciona un token final, no una familia de tokens.');
        return tipo.value;
      }
      return '{' + ruta(n) + '}';
    }
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map(s => '{' + ruta(s.expression) + '}' + s.literal.text).join('');
    return fallo('SINTAXIS', n, 'Usa literales, tokens, accesos al modelo o plantillas de texto.');
  }
  function hijos(n: ts.JsxElement): (ts.JsxElement | ts.JsxSelfClosingElement | ts.Expression | string)[] {
    return n.children.flatMap<ts.Expression | string>(c => {
      if (ts.isJsxText(c)) { const t = c.text.replace(/\s+/g, ' ').trim(); return t ? [t] : []; }
      if (ts.isJsxExpression(c)) return c.expression ? [c.expression] : [];
      return [c];
    });
  }
  function nodo(n: ts.Expression): Objeto {
    if (ts.isParenthesizedExpression(n)) return nodo(n.expression);
    if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) return fallo('SINTAXIS', n, 'Escribe un componente de la API.');
    const apertura = ts.isJsxElement(n) ? n.openingElement : n;
    const nombre = apertura.tagName.getText(fuente);
    if (!['Overlay','Caja','Texto','Lista'].includes(nombre)) fallo('SINTAXIS', apertura, 'Usa Overlay, Caja, Texto o Lista.');
    const salida: Objeto = { tipo: nombre.toLowerCase() };
    for (const p of apertura.attributes.properties) {
      if (!ts.isJsxAttribute(p) || !p.initializer) fallo('SINTAXIS', p, 'Escribe cada prop explícitamente: capa={true}; sin spread.');
      const expr = ts.isJsxExpression(p.initializer) ? p.initializer.expression : p.initializer;
      if (!expr) fallo('SINTAXIS', p, 'La prop necesita un valor.');
      if (p.name.getText(fuente) === 'children') fallo('SINTAXIS', p, 'Escribe los hijos entre las etiquetas, no en una prop children.');
      salida[p.name.getText(fuente)] = p.name.getText(fuente) === 'de' ? ruta(expr) : valor(expr, p.name.getText(fuente));
    }
    const contenido = ts.isJsxElement(n) ? hijos(n) : [];
    if (nombre === 'Lista') {
      const fn = contenido[0];
      if (contenido.length !== 1 || typeof fn === 'string' || !ts.isArrowFunction(fn) || fn.parameters.length !== 1 || !ts.isIdentifier(fn.parameters[0].name) || ts.isBlock(fn.body)) fallo('SINTAXIS', n, 'Lista necesita una función hija: {(fila) => <Caja>…</Caja>}.');
      const nombreFila = fn.parameters[0].name.text;
      if (nombreFila === 'm' || nombreFila === 'tokens' || alias.includes(nombreFila) || constantes.has(nombreFila)) fallo('MODELO', fn, 'Usa un nombre de fila que no oculte otro enlace.');
      alias.push(nombreFila); salida.como = nombreFila; salida.plantilla = nodo(fn.body); alias.pop();
    } else if (nombre === 'Texto') {
      salida.texto = contenido.map(c => typeof c === 'string' ? c : valor(c)).join('');
    } else {
      const nodos = contenido.map(c => typeof c === 'string' ? fallo('SINTAXIS', n, 'Coloca el texto dentro de Texto.') : nodo(c));
      if (nombre === 'Overlay') {
        if (nodos.length !== 1) fallo('SINTAXIS', n, 'Overlay necesita exactamente una raíz.');
        salida.receta = 1; salida.raiz = nodos[0];
      } else salida.hijos = nodos;
    }
    return salida;
  }
  if (!raiz || !modelo) fallo('MODELO', fuente, 'Importa m del contrato generado y exporta por defecto un Overlay.');
  // Validar también constantes no utilizadas: no son una vía para introducir código.
  for (const [nombre, expr] of constantes) { literal(expr); valor(expr); if (nombre === 'm' || nombre === 'tokens') fallo('CONSTANTE', expr, 'No ocultes m ni tokens.'); }
  const resultado = nodo(raiz);
  if (resultado.tipo !== 'overlay') fallo('SINTAXIS', raiz, 'La raíz debe ser Overlay.');
  let contrato: { modelo: string };
  try {
    contrato = JSON.parse(readFileSync(path.resolve(generado, '../../modelos', modelo + '.modelo.json'), 'utf8')) as { modelo: string };
  } catch {
    return fallo('MODELO', raiz, 'No existe un contrato JSON válido para el modelo importado; genera los tipos desde modelos/*.modelo.json.');
  }
  if (resultado.modelo !== contrato.modelo) fallo('MODELO', raiz, 'El nombre y versión del modelo de Overlay deben coincidir con el contrato importado.');
  const diagnosticos = ts.getPreEmitDiagnostics(programa);
  if (diagnosticos.length) {
    const d = diagnosticos[0];
    const f = d.file ?? fuente;
    const ubicacion = { ...f, getSourceFile: () => f, getStart: () => d.start ?? 0 } as ts.Node;
    fallo('TIPO', ubicacion, ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }
  return resultado;
}
