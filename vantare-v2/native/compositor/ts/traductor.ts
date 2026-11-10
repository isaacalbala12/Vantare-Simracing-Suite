import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { leerContrato, type Contrato, type Campo, type Campos } from './contrato.js';
export type Codigo = 'TIPO' | 'IMPORT' | 'MUTABLE' | 'CONTROL' | 'TERNARIO' | 'LOGICA' | 'MAP' | 'ARITMETICA' | 'LLAMADA' | 'SINTAXIS' | 'MODELO' | 'CONSTANTE' | 'DIRECTIVA' | 'REFERENCIA';
export class ErrorTraduccion extends Error {
    readonly fichero: string;
    readonly linea: number;
    readonly columna: number;
    constructor(readonly codigo: Codigo, fichero: string, posicion: ts.LineAndCharacter, mensaje: string, readonly codigoTs?: number) {
        super(`${fichero}:${posicion.line + 1}:${posicion.character + 1}: ${codigo}: ${mensaje}`);
        this.fichero = path.resolve(fichero);
        this.linea = posicion.line + 1;
        this.columna = posicion.character + 1;
    }
}
export class ErroresTraduccion extends ErrorTraduccion {
    constructor(readonly diagnosticos: readonly ErrorTraduccion[]) {
        const primero = diagnosticos[0];
        if (!primero)
            throw new Error('Se necesita al menos un diagnóstico.');
        super(primero.codigo, primero.fichero, { line: primero.linea - 1, character: primero.columna - 1 }, 'Errores de TypeScript');
        this.message = diagnosticos.map(d => d.message).join('\n');
    }
}
export class ErroresTipo extends ErroresTraduccion {
}
type Json = string | number | boolean | Json[] | {
    [key: string]: Json;
};
type Objeto = {
    [key: string]: Json;
};
const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../receta/index.ts');
const generado = path.resolve(path.dirname(api), '../generado');
function comprobarDirectivas(fuente: ts.SourceFile): void {
    const errores: ErrorTraduccion[] = [];
    const protegidos: {
        inicio: number;
        fin: number;
    }[] = [];
    function visitar(n: ts.Node): void {
        if (ts.isStringLiteralLike(n) || ts.isJsxText(n) || [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(n.kind))
            protegidos.push({ inicio: n.getStart(fuente), fin: n.end });
        ts.forEachChild(n, visitar);
    }
    visitar(fuente);
    const scanner = ts.createScanner(ts.ScriptTarget.ES2023, false, ts.LanguageVariant.JSX, fuente.text);
    while (scanner.getTextPos() < fuente.text.length) {
        const protegido = protegidos.find(r => scanner.getTextPos() >= r.inicio && scanner.getTextPos() < r.fin);
        if (protegido) {
            scanner.setTextPos(protegido.fin);
            continue;
        }
        const token = scanner.scan();
        if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
            const texto = scanner.getTokenText();
            const directiva = /@ts-/.test(texto);
            if (directiva || /<reference\b/i.test(texto))
                errores.push(new ErrorTraduccion(directiva ? 'DIRECTIVA' : 'REFERENCIA', fuente.fileName, fuente.getLineAndCharacterOfPosition(scanner.getTokenPos()), 'No desactives ni amplíes el contrato desde comentarios. Quita la directiva y usa la API y el modelo generado.'));
        }
    }
    if ((fuente.referencedFiles.length || fuente.typeReferenceDirectives.length || fuente.libReferenceDirectives.length || fuente.hasNoDefaultLib) && !errores.some(e => e.codigo === 'REFERENCIA'))
        errores.push(new ErrorTraduccion('REFERENCIA', fuente.fileName, { line: 0, character: 0 }, 'Quita las referencias triples; importa solo la API y el modelo generado.'));
    if (errores.length)
        throw new ErroresTraduccion(errores);
}
export class Traductor {
    private anterior?: ts.SemanticDiagnosticsBuilderProgram;
    private readonly opciones: ts.CompilerOptions = {
        strict: true, noEmit: true, target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
        jsx: ts.JsxEmit.Preserve, types: [], lib: ['lib.es2023.d.ts'], skipLibCheck: false,
    };
    private readonly host = ts.createCompilerHost(this.opciones);
    private entrada?: {
        fichero: string;
        texto: string;
    };
    constructor() {
        const fuentes = new Map<string, ts.SourceFile & {
            version: string;
        }>();
        this.host.getSourceFile = (nombre, lenguaje, onError) => {
            const texto = path.resolve(nombre) === this.entrada?.fichero ? this.entrada.texto : this.host.readFile(nombre);
            if (texto === undefined) {
                onError?.(`No se puede leer ${nombre}`);
                return undefined;
            }
            const previa = fuentes.get(nombre);
            if (previa?.text === texto)
                return previa;
            const fuente = Object.assign(ts.createSourceFile(nombre, texto, lenguaje, true), { version: String(Number(previa?.version ?? 0) + 1) });
            fuentes.set(nombre, fuente);
            return fuente;
        };
    }
    traducir(fichero: string, texto = readFileSync(fichero, 'utf8')): Objeto {
        const fuente = ts.createSourceFile(path.resolve(fichero), texto, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
        comprobarDirectivas(fuente);
        this.entrada = { fichero: path.resolve(fichero), texto };
        this.anterior = ts.createSemanticDiagnosticsBuilderProgram([path.resolve(fichero)], this.opciones, this.host, this.anterior);
        return emitir(fichero, this.anterior);
    }
}
export function traducir(fichero: string): Objeto { return new Traductor().traducir(fichero); }
function emitir(fichero: string, builder: ts.SemanticDiagnosticsBuilderProgram): Objeto {
    const programa = builder.getProgram();
    const fuente = programa.getSourceFile(path.resolve(fichero));
    if (!fuente)
        throw new Error(`No se puede leer ${fichero}.`);
    const checker = programa.getTypeChecker();
    const errores: ErrorTraduccion[] = [];
    function capturar<T>(accion: () => T): T | undefined {
        try {
            return accion();
        }
        catch (error) {
            if (!(error instanceof ErrorTraduccion))
                throw error;
            errores.push(error);
            return undefined;
        }
    }
    const constantes = new Map<string, ts.Expression>();
    let modelo = '';
    let modeloNodo: ts.Node = fuente;
    let raiz: ts.Expression | undefined;
    function fallo(codigo: Codigo, nodo: ts.Node, mensaje: string): never {
        const f = nodo.getSourceFile();
        throw new ErrorTraduccion(codigo, f.fileName, f.getLineAndCharacterOfPosition(nodo.getStart(f)), mensaje);
    }
    // Da primero las sugerencias de marcado, incluso si tsc también rechaza la expresión.
    function revisar(n: ts.Node): void {
        capturar(() => {
            if (n.kind === ts.SyntaxKind.AnyKeyword || ts.isTypeAssertionExpression(n) || ts.isAsExpression(n) && n.type.getText(fuente) !== 'const')
                fallo('TIPO', n, 'No desactives el contrato con any o as; usa sus tipos generados.');
            if ('questionDotToken' in n && n.questionDotToken)
                fallo('SINTAXIS', n, 'No uses ?.; pide al núcleo un campo siempre disponible.');
            if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken)
                fallo('LOGICA', n, 'Usa no(m.campo) en lugar de !x.');
            if (ts.isConditionalExpression(n))
                fallo('TERNARIO', n, 'Usa estados con cuando en lugar de un ternario.');
            if (ts.isBinaryExpression(n)) {
                if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind))
                    fallo('LOGICA', n, 'Usa es(campo, "valor") para comparar un enumerado.');
                if (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
                    fallo('LOGICA', n, 'No uses ??; pide al núcleo un campo con el valor por defecto ya aplicado.');
                if (n.operatorToken.kind === ts.SyntaxKind.CommaToken)
                    fallo('SINTAXIS', n, 'No uses el operador coma; escribe un solo valor literal o enlace por prop.');
                fallo(n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken ? 'LOGICA' : 'ARITMETICA', n, 'Usa visible/estados con cuando. Si necesitas calcular, pide el campo ya calculado al contrato del modelo.');
            }
            if (ts.isCallExpression(n)) {
                if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map')
                    fallo('MAP', n, 'Usa <Lista de={m.filas} clave="id"> con una función hija.');
                if (!ts.isIdentifier(n.expression) || !['no', 'es'].includes(n.expression.text))
                    fallo('LLAMADA', n, 'Solo se admiten no() y es(); pide al núcleo el valor ya calculado.');
            }
            if (ts.isIfStatement(n) || ts.isIterationStatement(n, false) || ts.isSwitchStatement(n))
                fallo('CONTROL', n, 'Usa Lista para repetir y estados/visible para condiciones.');
        });
        ts.forEachChild(n, revisar);
    }
    revisar(fuente);
    for (const sentencia of fuente.statements) {
        capturar(() => {
            if (ts.isEmptyStatement(sentencia))
                return;
            if (ts.isImportDeclaration(sentencia)) {
                if (!ts.isStringLiteral(sentencia.moduleSpecifier))
                    fallo('IMPORT', sentencia, 'Importa solo la API, tokens o el modelo generado.');
                const ruta = path.resolve(path.dirname(fichero), sentencia.moduleSpecifier.text).replace(/\.js$/, '.ts');
                const esApi = ruta === api;
                const esModelo = path.dirname(ruta) === generado && ruta.endsWith('.ts') && !ruta.endsWith('tokens.ts');
                if (!esApi && !esModelo)
                    fallo('IMPORT', sentencia, 'Importa solo receta/index.js o generado/<modelo>.js.');
                const bindings = sentencia.importClause?.namedBindings;
                if (!bindings || !ts.isNamedImports(bindings) || sentencia.importClause?.name)
                    fallo('IMPORT', sentencia, 'Usa imports con nombres, sin alias.');
                for (const b of bindings.elements) {
                    const esTipo = b.isTypeOnly || sentencia.importClause?.isTypeOnly;
                    const permitido = esApi ? (esTipo ? ['Estilo', 'Nodo', 'Transicion'] : ['Overlay', 'Caja', 'Texto', 'Lista', 'tokens', 'no', 'es']).includes(b.name.text) : b.name.text === 'm';
                    if (b.propertyName || !permitido)
                        fallo('IMPORT', b, 'Usa los nombres originales de la API o m del modelo generado.');
                }
                if (esModelo) {
                    if (modelo)
                        fallo('MODELO', sentencia, 'Importa un único modelo.');
                    modelo = path.basename(ruta, '.ts');
                    modeloNodo = sentencia.moduleSpecifier;
                }
            }
            else if (ts.isVariableStatement(sentencia)) {
                if (sentencia.modifiers?.length)
                    fallo('CONSTANTE', sentencia, 'No uses export const ni declare; exporta solo el Overlay por defecto.');
                if (!(sentencia.declarationList.flags & ts.NodeFlags.Const))
                    fallo('MUTABLE', sentencia, 'Usa const con literales; el modelo contiene los valores que cambian.');
                for (const d of sentencia.declarationList.declarations) {
                    if (!ts.isIdentifier(d.name) || !d.initializer)
                        fallo('CONSTANTE', d, 'Usa const nombre = literal.');
                    constantes.set(d.name.text, d.initializer);
                }
            }
            else if (ts.isExportAssignment(sentencia) && !sentencia.isExportEquals) {
                if (raiz)
                    fallo('SINTAXIS', sentencia, 'Exporta un único Overlay por defecto.');
                raiz = sentencia.expression;
            }
            else
                fallo('SINTAXIS', sentencia, 'Usa solo imports, const literales y export default <Overlay> están permitidos.');
        });
    }
    const contrato: Contrato | undefined = capturar(() => {
        try {
            return leerContrato(path.resolve(generado, '../../modelos', modelo + '.modelo.json'));
        }
        catch (error) {
            return fallo('MODELO', modeloNodo, error instanceof Error ? error.message : String(error));
        }
    });
    const alias = new Map<string, Campos>();
    function enlace(n: ts.Expression, esperado?: 'bool' | 'enum' | 'lista' | 'texto' | 'numero'): {
        ruta: string;
        campo: Campo;
    } {
        if (!ts.isPropertyAccessExpression(n))
            return fallo('MODELO', n, 'Usa un acceso directo al modelo, como m.titulo o fila.piloto.');
        const partes: string[] = [];
        let actual: ts.Expression = n;
        while (ts.isPropertyAccessExpression(actual)) {
            if (actual.questionDotToken)
                fallo('SINTAXIS', actual, 'No uses ?.; pide al núcleo un campo siempre disponible.');
            partes.unshift(actual.name.text);
            actual = actual.expression;
        }
        if (!ts.isIdentifier(actual))
            return fallo('MODELO', n, 'Usa m.campo o el parámetro de Lista.');
        const inicio = actual.text;
        let campos = inicio === 'm' ? contrato?.campos : alias.get(inicio);
        let campo: Campo | undefined;
        for (const parte of partes) {
            if (!campos || !Object.hasOwn(campos, parte))
                fallo('MODELO', n, `La ruta ${n.getText(fuente)} no existe en el contrato JSON. Pide el campo al núcleo; no uses propiedades JS como length.`);
            campo = campos[parte];
            campos = undefined; // Una lista solo se abre mediante Lista, nunca por .length o índices.
        }
        if (!campo)
            return fallo('MODELO', n, 'Usa un campo declarado en el contrato.');
        const valido = esperado === undefined || esperado === 'texto' && (campo === 'texto' || campo === 'numero' || typeof campo === 'object' && 'enum' in campo) || esperado === 'enum' && typeof campo === 'object' && 'enum' in campo || esperado === 'lista' && typeof campo === 'object' && 'lista' in campo || campo === esperado;
        if (!valido)
            fallo('TIPO', n, `Este enlace necesita ${esperado}. Usa un campo de ese tipo declarado en el contrato JSON.`);
        return { ruta: (inicio === 'm' ? [] : [inicio]).concat(partes).join('.'), campo };
    }
    function condicion(n: ts.Expression): string {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
            if (n.expression.text === 'no' && n.arguments.length === 1) {
                const p = n.arguments[0];
                return '!' + enlace(p, 'bool').ruta;
            }
            if (n.expression.text === 'es' && n.arguments.length === 2 && ts.isStringLiteral(n.arguments[1])) {
                const resuelto = enlace(n.arguments[0], 'enum');
                if (typeof resuelto.campo !== 'object' || !('enum' in resuelto.campo) || !resuelto.campo.enum.includes(n.arguments[1].text))
                    fallo('TIPO', n.arguments[1], 'Usa un valor declarado en el enum del contrato.');
                return resuelto.ruta + '=' + n.arguments[1].text;
            }
            fallo('LLAMADA', n, 'Usa no(booleano) o es(enumerado, "valor").');
        }
        return enlace(n, 'bool').ruta;
    }
    const resolviendo = new Set<string>();
    function valor(n: ts.Expression, campo = '', soloLiteral = false): Json {
        if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n))
            return valor(n.expression, campo, soloLiteral);
        if (!soloLiteral && (campo === 'cuando' || campo === 'visible'))
            return condicion(n);
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
            if (ts.isStringLiteral(n) && ts.isJsxAttribute(n.parent) && n.text.includes('&'))
                fallo('SINTAXIS', n, 'No uses entidades en atributos JSX. Usa una cadena explícita: nombre={"…"}.');
            return sinLlaves(n.text, n);
        }
        if (ts.isNumericLiteral(n))
            return Number(n.text);
        if (n.kind === ts.SyntaxKind.TrueKeyword)
            return true;
        if (n.kind === ts.SyntaxKind.FalseKeyword)
            return false;
        if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand))
            return -Number(n.operand.text);
        if (ts.isObjectLiteralExpression(n)) {
            const propiedades: Record<string, string[]> = {
                estilo: ['ancho', 'alto', 'min_ancho', 'max_ancho', 'direccion', 'alinear', 'justificar', 'hueco', 'relleno', 'crecer', 'encoger', 'posicion', 'arriba', 'izquierda', 'derecha', 'abajo', 'fondo', 'borde', 'radio', 'sombra', 'opacidad', 'tipo', 'color', 'alinear_texto'],
                estados: ['cuando', 'estilo', 'bucle'], bucle: ['cuando', 'propiedad', 'valores', 'duracion'],
                transiciones: ['opacidad', 'x', 'y', 'escala', 'giro', 'fondo', 'color', 'borde'],
                entrada: ['desde', 'transicion'], salida: ['hacia', 'transicion'],
                desde: ['opacidad', 'x', 'y', 'escala', 'giro'], hacia: ['opacidad', 'x', 'y', 'escala', 'giro'],
                borde: ['ancho', 'color'], fondo: ['lineal'], lineal: ['angulo', 'paradas'],
                muelle: ['rigidez', 'amortiguacion'],
            };
            const permitidas = propiedades[campo] ?? ['duracion', 'curva', 'retardo', 'muelle'];
            const salida: Objeto = {};
            for (const p of n.properties) {
                capturar(() => {
                    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
                        fallo('SINTAXIS', p, 'Usa propiedades explícitas sin spread ni métodos.');
                    if (!soloLiteral && !permitidas.includes(p.name.text))
                        fallo('SINTAXIS', p, `Propiedad no admitida en ${campo}. Usa solo: ${permitidas.join(', ')}.`);
                    if (Object.hasOwn(salida, p.name.text))
                        fallo('SINTAXIS', p, 'No repitas una propiedad.');
                    if (['__proto__', 'constructor', 'prototype'].includes(p.name.text))
                        fallo('SINTAXIS', p, 'Usa solo las propiedades documentadas del objeto.');
                    salida[p.name.text] = valor(p.initializer, p.name.text, soloLiteral);
                });
            }
            return salida;
        }
        if (ts.isArrayLiteralExpression(n))
            return n.elements.flatMap(e => { const v = capturar(() => valor(e, campo, soloLiteral)); return v === undefined ? [] : [v]; });
        if (ts.isIdentifier(n) && constantes.has(n.text)) {
            if (resolviendo.has(n.text))
                fallo('CONSTANTE', n, 'Evita referencias circulares entre constantes.');
            resolviendo.add(n.text);
            const resultado = valor(constantes.get(n.text)!, campo, soloLiteral);
            resolviendo.delete(n.text);
            return resultado;
        }
        if (ts.isPropertyAccessExpression(n)) {
            if (['id', 'clave', 'nombre', 'modelo', 'capa'].includes(campo))
                fallo('MODELO', n, `La prop ${campo} debe ser literal, nunca un enlace ni un token. Usa un valor fijo.`);
            let base: ts.Expression = n;
            while (ts.isPropertyAccessExpression(base))
                base = base.expression;
            const simbolo = ts.isIdentifier(base) ? checker.getSymbolAtLocation(base) : undefined;
            if (simbolo?.declarations?.some(d => ts.isImportSpecifier(d) && d.name.text === 'tokens')) {
                const tipo = checker.getTypeAtLocation(n);
                if (!tipo.isStringLiteral())
                    fallo('TIPO', n, 'Selecciona un token final, no una familia de tokens.');
                return tipo.value;
            }
            if (soloLiteral)
                fallo('CONSTANTE', n, 'Las constantes solo contienen literales y tokens. Enlaza el modelo directamente en JSX.');
            if (!['texto', 'opacidad', 'crecer', 'encoger'].includes(campo))
                fallo('MODELO', n, `La prop ${campo} necesita un literal. Enlaza el modelo solo en texto, condiciones o estilos numéricos permitidos.`);
            return '{' + enlace(n, campo === 'texto' ? 'texto' : 'numero').ruta + '}';
        }
        if (ts.isTemplateExpression(n)) {
            if (soloLiteral)
                fallo('CONSTANTE', n, 'Las constantes solo contienen literales y tokens. Usa la plantilla directamente en Texto.');
            if (campo !== 'texto' && !(['fondo', 'color'].includes(campo) && n.head.text.startsWith('$color.')))
                fallo('MODELO', n, 'Usa plantillas solo en Texto o en tokens de color enlazados a un enum.');
            return sinLlaves(n.head.text, n.head) + n.templateSpans.map(s => '{' + enlace(s.expression, campo === 'texto' ? 'texto' : 'enum').ruta + '}' + sinLlaves(s.literal.text, s.literal)).join('');
        }
        return fallo('SINTAXIS', n, 'Usa literales, tokens, accesos al modelo o plantillas de texto.');
    }
    function sinLlaves(texto: string, n: ts.Node): string {
        if (/[{}]/.test(texto))
            fallo('MODELO', n, 'No escribas llaves de enlace en literales. Usa {m.campo} o una plantilla `${m.campo}`.');
        return texto;
    }
    function hijos(n: ts.JsxElement): (ts.JsxElement | ts.JsxSelfClosingElement | ts.Expression | string)[] {
        return n.children.flatMap<ts.Expression | string>(c => capturar((): (ts.Expression | string)[] => {
            if (ts.isJsxText(c)) {
                if (/[&\u00a0]/.test(c.text) || /[^ \t\r\n]/.test(c.text) && /[\r\n]/.test(c.text))
                    fallo('SINTAXIS', c, 'Para entidades, NBSP o texto multilínea usa una cadena explícita: {"…"}.');
                const t = /[\r\n]/.test(c.text) ? '' : c.text;
                return t ? [sinLlaves(t, c)] : [];
            }
            if (ts.isJsxExpression(c))
                return c.expression ? [c.expression] : [];
            return [c];
        }) ?? []);
    }
    function nodo(n: ts.Expression, esRaiz = false): Objeto {
        if (ts.isParenthesizedExpression(n))
            return nodo(n.expression, esRaiz);
        if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n))
            return fallo('SINTAXIS', n, 'Escribe un componente de la API.');
        const apertura = ts.isJsxElement(n) ? n.openingElement : n;
        const nombre = apertura.tagName.getText(fuente);
        if (!['Overlay', 'Caja', 'Texto', 'Lista'].includes(nombre))
            fallo('SINTAXIS', apertura, 'Usa Overlay, Caja, Texto o Lista.');
        if (nombre === 'Overlay' && !esRaiz)
            fallo('SINTAXIS', apertura, 'Overlay solo puede ser el export default. Usa Caja para agrupar dentro de él.');
        const comunes = ['id', 'estilo', 'estados', 'transiciones', 'capa', 'visible', 'bucle'];
        const permitidas = nombre === 'Overlay' ? ['nombre', 'modelo', 'visible', 'entrada', 'salida'] : comunes.concat(nombre === 'Lista' ? ['de', 'clave', 'entrada', 'salida', 'movimiento'] : []);
        const salida: Objeto = { tipo: nombre.toLowerCase() };
        for (const p of apertura.attributes.properties) {
            capturar(() => {
                if (!ts.isJsxAttribute(p) || !p.initializer)
                    fallo('SINTAXIS', p, 'Escribe cada prop explícitamente: capa={true}; sin spread.');
                const expr = ts.isJsxExpression(p.initializer) ? p.initializer.expression : p.initializer;
                if (!expr)
                    fallo('SINTAXIS', p, 'La prop necesita un valor.');
                if (!permitidas.includes(p.name.getText(fuente)))
                    fallo('SINTAXIS', p, `Prop no admitida en ${nombre}. Usa solo: ${permitidas.join(', ')}.`);
                if (Object.hasOwn(salida, p.name.getText(fuente)))
                    fallo('SINTAXIS', p, 'No repitas una prop.');
                if (p.name.getText(fuente) === 'children')
                    fallo('SINTAXIS', p, 'Escribe los hijos entre las etiquetas, no en una prop children.');
                salida[p.name.getText(fuente)] = p.name.getText(fuente) === 'de' ? enlace(expr, 'lista').ruta : valor(expr, p.name.getText(fuente));
                if (['id', 'clave', 'nombre', 'modelo'].includes(p.name.getText(fuente)) && typeof salida[p.name.getText(fuente)] !== 'string' || p.name.getText(fuente) === 'capa' && typeof salida.capa !== 'boolean')
                    fallo('TIPO', p, 'Usa un literal de cadena para id/clave/nombre/modelo y booleano para capa.');
                if (p.name.getText(fuente) === 'id' && (typeof salida.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(salida.id)))
                    fallo('SINTAXIS', p, 'Usa id con formato [a-z][a-z0-9_]*, por ejemplo panel_1.');
            });
        }
        const contenido = ts.isJsxElement(n) ? hijos(n) : [];
        if (nombre === 'Lista') {
            const fn = contenido[0];
            if (contenido.length !== 1 || typeof fn === 'string' || !ts.isArrowFunction(fn) || fn.parameters.length !== 1 || !ts.isIdentifier(fn.parameters[0].name) || ts.isBlock(fn.body))
                fallo('SINTAXIS', n, 'Lista necesita una función hija: {(fila) => <Caja>…</Caja>}.');
            const nombreFila = fn.parameters[0].name.text;
            if (fn.parameters[0].initializer || fn.parameters[0].dotDotDotToken || fn.parameters[0].questionToken)
                fallo('SINTAXIS', fn.parameters[0], 'Usa un parámetro simple sin valor por defecto, rest ni opcional.');
            if (nombreFila === 'm' || nombreFila === 'tokens' || Object.hasOwn(contrato?.campos ?? {}, nombreFila) || alias.has(nombreFila) || constantes.has(nombreFila))
                fallo('MODELO', fn, 'Usa un nombre de fila que no oculte otro enlace.');
            const propDe = apertura.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(fuente) === 'de');
            if (!propDe || !ts.isJsxAttribute(propDe) || !propDe.initializer || !ts.isJsxExpression(propDe.initializer) || !propDe.initializer.expression)
                fallo('MODELO', n, 'Usa de={m.lista} en Lista.');
            const campo = enlace(propDe.initializer.expression, 'lista').campo;
            if (typeof campo !== 'object' || !('lista' in campo))
                fallo('TIPO', n, 'de necesita una lista del contrato.');
            if (typeof salida.clave !== 'string' || !Object.hasOwn(campo.lista, salida.clave) || campo.lista[salida.clave] !== 'texto')
                fallo('MODELO', n, 'clave debe ser el nombre literal de un campo texto de la fila.');
            alias.set(nombreFila, campo.lista);
            salida.como = nombreFila;
            const cuerpo = fn.body;
            const plantilla = capturar(() => nodo(cuerpo));
            if (plantilla)
                salida.plantilla = plantilla;
            alias.delete(nombreFila);
        }
        else if (nombre === 'Texto') {
            salida.texto = contenido.map(c => typeof c === 'string' ? c : capturar(() => valor(c, 'texto')) ?? '').join('');
        }
        else {
            const nodos = contenido.flatMap(c => { const v = capturar(() => typeof c === 'string' ? fallo('SINTAXIS', n, 'Coloca el texto dentro de Texto.') : nodo(c)); return v ? [v] : []; });
            if (nombre === 'Overlay') {
                if (nodos.length !== 1)
                    fallo('SINTAXIS', n, 'Overlay necesita exactamente una raíz.');
                salida.receta = 1;
                salida.raiz = nodos[0];
            }
            else if (ts.isJsxElement(n))
                salida.hijos = nodos;
        }
        return salida;
    }
    if (!raiz || !modelo)
        capturar(() => fallo('MODELO', fuente, 'Importa m del contrato generado y exporta por defecto un Overlay.'));
    for (const [nombre, expr] of constantes)
        capturar(() => { valor(expr, '', true); if (nombre === 'm' || nombre === 'tokens')
            fallo('CONSTANTE', expr, 'No ocultes m ni tokens.'); });
    const exportado = raiz;
    const resultado = exportado ? capturar(() => nodo(exportado, true)) : undefined;
    if (exportado && resultado)
        capturar(() => {
            if (resultado.tipo !== 'overlay')
                fallo('SINTAXIS', exportado, 'La raíz debe ser Overlay.');
            if (resultado.modelo !== contrato?.modelo)
                fallo('MODELO', exportado, 'Usa el nombre y versión exactos del contrato JSON importado.');
        });
    const diagnosticos = ts.sortAndDeduplicateDiagnostics([
        ...builder.getOptionsDiagnostics(), ...builder.getGlobalDiagnostics(),
        ...builder.getSyntacticDiagnostics(), ...builder.getSemanticDiagnostics(),
    ]);
    const tipos = diagnosticos.map(d => {
        const f = d.file ?? fuente;
        const sugerencia = d.code === 2322 ? 'Usa el tipo indicado por el contrato; para colores y medidas usa tokens, y para tuplas compartidas usa satisfies Estilo.' : [2746, 2747].includes(d.code) ? 'Coloca texto solo dentro de Texto; usa una plantilla para combinar enlaces.' : [2740, 2741].includes(d.code) ? 'Añade los campos obligatorios indicados por el contrato.' : 'Corrige el marcado usando los tipos y campos declarados en el contrato.';
        return new ErrorTraduccion('TIPO', f.fileName, f.getLineAndCharacterOfPosition(d.start ?? 0), ts.flattenDiagnosticMessageText(d.messageText, '\n') + ' ' + sugerencia, d.code);
    });
    const porPosicion = new Map<string, ErrorTraduccion>();
    for (const error of errores) {
        const clave = `${error.fichero}:${error.linea}:${error.columna}`;
        if (!porPosicion.has(clave))
            porPosicion.set(clave, error);
    }
    const unicos = [...porPosicion.values()];
    if (unicos.length)
        throw new ErroresTraduccion([...unicos, ...tipos]);
    if (tipos.length)
        throw new ErroresTipo(tipos);
    if (!resultado)
        throw new Error('No se pudo generar la receta. Corrige los errores de marcado.');
    return resultado;
}
