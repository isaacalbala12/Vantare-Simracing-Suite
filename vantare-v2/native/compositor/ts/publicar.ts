import { writeFileSync, renameSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
export function mismaRuta(a: string, b: string): boolean {
    const canonica = (p: string): string => {
        const resuelta = existsSync(p) ? realpathSync(p) : path.resolve(realpathSync(path.dirname(path.resolve(p))), path.basename(p));
        return process.platform === 'win32' ? resuelta.toLowerCase() : resuelta;
    };
    return canonica(a) === canonica(b);
}
function codigo(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
const operaciones = { escribir: writeFileSync, renombrar: renameSync, borrar: unlinkSync, existe: existsSync, esperar: () => setTimeout(20) };
export async function publicar(salida: string, json: string, io = operaciones): Promise<void> {
    const temporal = salida + '.tmp';
    try {
        io.escribir(temporal, json);
        for (let intento = 0;; intento++) {
            try {
                io.renombrar(temporal, salida);
                return;
            }
            catch (error) {
                if (!['EPERM', 'EBUSY'].includes(codigo(error) ?? '') || intento >= 4)
                    throw error;
                await io.esperar();
            }
        }
    }
    catch (error) {
        let limpieza = '';
        try {
            if (io.existe(temporal))
                io.borrar(temporal);
        }
        catch (fallo) {
            limpieza = ` No se pudo borrar ${temporal}: ${String(fallo)}.`;
        }
        throw new Error(`No se pudo publicar ${salida}: ${String(error)}.${limpieza} Se conserva el JSON anterior; cierra el lector que lo bloquea y vuelve a guardar.`);
    }
}
