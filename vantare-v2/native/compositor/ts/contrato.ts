import { readFileSync } from 'node:fs';
export type Campo = 'bool' | 'texto' | 'numero' | {
    enum: string[];
} | {
    lista: Campos;
};
export interface Campos {
    [nombre: string]: Campo;
}
export interface Contrato {
    modelo: string;
    campos: Campos;
}
function objeto(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function campo(v: unknown): v is Campo {
    return v === 'bool' || v === 'texto' || v === 'numero' || objeto(v) && (Object.keys(v).length === 1 && (Array.isArray(v.enum) && v.enum.length > 0 && v.enum.every(x => typeof x === 'string') || campos(v.lista)));
}
function campos(v: unknown): v is Campos { return objeto(v) && Object.values(v).every(campo); }
export function leerContrato(fichero: string): Contrato {
    let texto: string;
    try {
        texto = readFileSync(fichero, 'utf8');
    }
    catch {
        throw new Error(`No se puede leer el contrato ${fichero}. Comprueba que existe y que tienes permiso de lectura.`);
    }
    let v: unknown;
    try {
        v = JSON.parse(texto);
    }
    catch {
        throw new Error(`JSON inválido en ${fichero}. Corrige la sintaxis y regenera los tipos.`);
    }
    if (!objeto(v) || typeof v.modelo !== 'string' || !campos(v.campos))
        throw new Error(`Contrato inválido en ${fichero}. Usa modelo y campos con tipos bool, texto, numero, enum o lista.`);
    return { modelo: v.modelo, campos: v.campos };
}
