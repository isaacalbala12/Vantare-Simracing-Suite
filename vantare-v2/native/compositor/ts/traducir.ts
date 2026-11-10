import { watch, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Traductor } from './traductor.js';
import { mismaRuta, publicar } from './publicar.js';
const args = process.argv.slice(2);
const entrada = args[0];
const indice = args.indexOf('-o');
const salida = args[indice + 1];
if (!entrada || indice !== 1 || !salida || args.some((a, i) => i > 2 && a !== '--vigilar')) {
    console.error('Uso: node ts/dist/traducir.js <entrada.tsx> -o <salida.receta.json> [--vigilar]');
    process.exitCode = 1;
}
else {
    try {
        if (mismaRuta(entrada, salida) || mismaRuta(entrada, salida + '.tmp'))
            throw new Error('La salida y su temporal .tmp deben ser distintas de la entrada. Usa otra ruta para el JSON.');
        const traductor = new Traductor();
        const vigilantes: ReturnType<typeof watch>[] = [];
        let cerrado = false;
        let trabajando = false;
        let pendiente = false;
        let revision = 0;
        let ultimo: {
            texto: string;
            revision: number;
        } | undefined;
        const cerrar = (): void => { cerrado = true; vigilantes.forEach(v => v.close()); };
        async function procesar(): Promise<void> {
            if (trabajando)
                return;
            trabajando = true;
            try {
                while (pendiente && !cerrado) {
                    pendiente = false;
                    const inicio = performance.now();
                    try {
                        const texto = readFileSync(entrada, 'utf8');
                        const version = revision;
                        if (ultimo?.texto === texto && ultimo.revision === version)
                            continue;
                        const receta = traductor.traducir(entrada, texto);
                        await publicar(salida, JSON.stringify(receta, null, 2) + '\n');
                        if (cerrado)
                            return;
                        ultimo = { texto, revision: version };
                        console.log(`OK ${salida} ${(performance.now() - inicio).toFixed(2)} ms`);
                        process.exitCode = 0;
                    }
                    catch (error) {
                        console.error(error instanceof Error ? error.message : String(error));
                        process.exitCode = 1;
                    }
                }
            }
            finally {
                trabajando = false;
            }
        }
        const solicitar = (dependencia = false): void => {
            if (dependencia)
                revision++;
            pendiente = true;
            // procesar captura los errores y siempre libera la cola.
            void procesar();
        };
        if (args.includes('--vigilar')) {
            const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
            const directorios = [path.dirname(path.resolve(entrada)), path.resolve(base, 'generado'), path.resolve(base, 'receta'), path.resolve(base, '../modelos'), path.resolve(base, '../sistemas')];
            try {
                for (const directorio of new Set(directorios)) {
                    const v = watch(directorio, (_evento, nombre) => {
                        if (directorio !== directorios[0] || nombre === null || String(nombre) === path.basename(entrada))
                            solicitar(directorio !== directorios[0]);
                    });
                    v.on('error', error => { console.error(`Falló la vigilancia de ${directorio}: ${error.message}. Reinicia --vigilar.`); process.exitCode = 1; cerrar(); });
                    vigilantes.push(v);
                }
            }
            catch (error) {
                cerrar();
                throw error;
            }
            process.on('SIGINT', cerrar);
            process.on('SIGTERM', cerrar);
        }
        solicitar();
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
