import { watch, writeFileSync, renameSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { traducir } from './traductor.js';

const args = process.argv.slice(2);
const entrada = args[0];
const indice = args.indexOf('-o');
const salida = args[indice + 1];
if (!entrada || indice !== 1 || !salida || args.some((a, i) => i > 2 && a !== '--vigilar')) {
  console.error('Uso: node ts/dist/traducir.js <entrada.tsx> -o <salida.receta.json> [--vigilar]');
  process.exitCode = 1;
} else {
  let ultimo: string | undefined;
  function ejecutar(): void {
    const inicio = performance.now();
    try {
      const contenido = readFileSync(entrada, 'utf8');
      if (contenido === ultimo) return;
      ultimo = contenido;
      const receta = traducir(entrada);
      const temporal = salida + '.tmp';
      writeFileSync(temporal, JSON.stringify(receta, null, 2) + '\n');
      renameSync(temporal, salida);
      console.log(`OK ${salida} ${(performance.now() - inicio).toFixed(2)} ms`);
      process.exitCode = 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
  if (args.includes('--vigilar')) {
    // Vigilar el directorio sobrevive al reemplazo atómico del editor. La salida
    // se filtra para evitar que escribir el JSON vuelva a disparar la traducción.
    const vigilante = watch(path.dirname(path.resolve(entrada)), (_evento?: unknown, nombre?: unknown) => {
      if (String(nombre) === path.basename(entrada)) ejecutar();
    });
    const cerrar = (): void => { vigilante.close(); };
    process.on('SIGINT', cerrar); process.on('SIGTERM', cerrar);
  }
  ejecutar();
}
