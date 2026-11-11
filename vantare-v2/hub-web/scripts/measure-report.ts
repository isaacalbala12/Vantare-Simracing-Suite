import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fiveSampleStats } from "./measure-summary.ts";

const evidence = resolve(
  process.argv[2] ?? "D:/VantareServer/evidence/hub-web/medicion-1",
);
const samples = JSON.parse(
  await readFile(join(evidence, "samples.json"), "utf8"),
) as {
  phase: string;
  app: string;
  iteration: number;
  section?: string;
  visibleMs?: number;
  responsiveMs?: number;
  verifiedMs?: number;
  privateBytes?: number;
  workingSetBytes?: number;
  cpuOneCorePercent?: number;
  cpuSource?: string;
  survivors?: number[];
  stderr?: string;
}[];
const provenance = JSON.parse(
  await readFile(join(evidence, "provenance.json"), "utf8"),
);
const environment = JSON.parse(await readFile(join(evidence,"environment.json"),"utf8").catch(()=>"{}"));
assert.ok(samples.filter(sample=>sample.phase==="idle").every(sample=>sample.cpuSource==="CIM PerfProc raw"),"CPU source was not validated PerfProc");
const closed = samples.filter((sample) => sample.phase === "closed");
assert.equal(closed.length, 10, "Incomplete paired run");
assert.ok(closed.every((sample) => sample.survivors?.length === 0));
for (let iteration = 0; iteration < 5; iteration++) {
  assert.deepEqual(
    samples
      .filter(
        (sample) => sample.phase === "before" && sample.iteration === iteration,
      )
      .map((sample) => sample.app),
    iteration % 2 ? ["electron", "gpui"] : ["gpui", "electron"],
  );
}
const statistics: Record<string, ReturnType<typeof fiveSampleStats>> = {};
const rows: string[] = [];
const format = (value: number, digits: number) =>
  value.toFixed(digits).replace(".", ",");
function row(
  label: string,
  key: string,
  phase: string,
  field: keyof (typeof samples)[number],
  section?: string,
  divisor = 1,
  digits = 1,
) {
  const cells = [];
  for (const app of ["gpui", "electron"]) {
    const values = samples
      .filter(
        (sample) =>
          sample.phase === phase &&
          sample.app === app &&
          (!section || sample.section === section),
      )
      .map((sample) => { const value=sample[field]; assert.ok(typeof value==="number" && Number.isFinite(value)); return value / divisor; });
    const result = fiveSampleStats(values);
    statistics[`${app}.${key}`] = result;
    cells.push(
      `${format(result.median, digits)} (${format(result.min, digits)}–${format(result.max, digits)}; MAD ${format(result.mad, digits)})`,
    );
  }
  rows.push(`| ${label} | ${cells.join(" | ")} |`);
}
row(
  "Inicio de proceso → ventana visible (ms)",
  "visibleMs",
  "visible",
  "visibleMs",
);
row(
  "Inicio de proceso → WM_NULL respondido (ms)",
  "responsiveMs",
  "visible",
  "responsiveMs",
);
row(
  "Inicio de proceso → interacción Apariencia → General verificada (ms)",
  "interactiveMs",
  "idle",
  "verifiedMs",
  "settings",
);
for (const [section, label] of [
  ["settings", "Ajustes"],
  ["home", "Inicio"],
]) {
  row(
    `${label} · memoria privada comprometida (MiB)`,
    `${section}.privateMiB`,
    "idle",
    "privateBytes",
    section,
    1024 * 1024,
  );
  row(
    `${label} · suma de working sets (MiB)`,
    `${section}.workingSetMiB`,
    "idle",
    "workingSetBytes",
    section,
    1024 * 1024,
  );
  row(
    `${label} · CPU de un núcleo (%)`,
    `${section}.cpuOneCorePercent`,
    "idle",
    "cpuOneCorePercent",
    section,
    1,
    3,
  );
}
const integrity = closed
  .filter((sample) => sample.app === "electron")
  .map((sample) => {
    const match = sample.stderr?.match(
      /first_walk_us=(\d+) verify_walk_and_hash_us=(\d+)/,
    );
    assert.ok(match, "Missing real integrity timing");
    return {
      walk: Number(match[1]) / 1000,
      verify: Number(match[2]) / 1000,
      total: (Number(match[1]) + Number(match[2])) / 1000,
    };
  });
for (const key of ["walk", "verify", "total"] as const)
  statistics[`integrity.${key}Ms`] = fiveSampleStats(
    integrity.map((sample) => sample[key]),
  );
const size = (bytes: number) =>
  `${format(bytes / (1024 * 1024), 2)} MiB (${bytes} bytes)`;
const previous=JSON.parse(await readFile(join(evidence,"invalid-cpu-trial-4/samples.json"),"utf8")) as typeof samples;
const earlierRows=[];
for(const [label,phase,field,section,divisor] of [
  ["Ventana visible (ms)","visible","visibleMs",null,1],
  ["Interacción verificada (ms)","idle","verifiedMs","settings",1],
  ["Working set de Ajustes (MiB)","idle","workingSetBytes","settings",1024*1024],
  ["Working set de Inicio (MiB)","idle","workingSetBytes","home",1024*1024],
] as const) {
  const cells=["gpui","electron"].map(app=>{
    const values=previous.filter(sample=>sample.app===app && sample.phase===phase && (!section || sample.section===section)).map(sample=>{const value=sample[field];assert.ok(typeof value==="number");return value/divisor;});
    const result=fiveSampleStats(values);return `${format(result.median,1)} (${format(result.min,1)}–${format(result.max,1)})`;
  });
  earlierRows.push(`| ${label} | ${cells.join(" | ")} |`);
}
const report = `# Primera medición A/B del Hub en este servidor

Cinco pares alternados A/B: GPUI → Electron, Electron → GPUI, repetido hasta completar cinco arranques válidos de cada uno. Mismo servidor, ${environment.Caption ?? "Windows"} (kernel ${provenance.os}), ${provenance.logicalCpus} procesadores lógicos y ${format(provenance.totalMemory / 1024 ** 3, 1)} GiB de RAM. **Servidor compartido y ruidoso; no es un banco aislado ni una prueba de Windows 10.** No hubo compilaciones propias ni procesamiento pesado de imágenes durante las muestras. Cerrojo global tomado durante la tanda.

UI de QA construida una sola vez desde nightly \`${provenance.uiProductSource}\`; anfitrión Release con puente real y peers locales de lectura. GPUI es el banco Release ya compilado (${provenance.gpuiBank.source_commit}). No hay cuentas ni servicios reales, instalador o supervisor productivo, ni sustitución del Hub distribuido.

## Resultado

Cada celda muestra **mediana (mínimo–máximo; MAD)** de cinco medidas; MAD es la mediana de las desviaciones absolutas. La memoria suma todos los procesos descendientes del anfitrión, incluido GPU/utility/renderer; GPUI usa su árbol completo.

| Métrica | Hub GPUI | Anfitrión Rust + Electron |
|---|---:|---:|
${rows.join("\n")}

| Tamaño lógico descomprimido | Medido |
|---|---:|
| GPUI · ejecutable del banco, recursos embebidos | ${size(provenance.gpuiBank.bytes)} |
| Candidato · anfitrión + hub-ui y sus sidecars | ${size(provenance.payloadBytes)} |
| Peers de IPC de QA, excluidos de la memoria del Hub | ${size(provenance.peerBytes)} |
| Generación QA completa sellada, sin datos mutables | ${size(provenance.totalGenerationBytes)} |

## Serie completa anterior

La serie anterior también tiene cinco pares completos de arranque y memoria. Su sonda .NET de CPU no superó la comprobación de carga; se conserva esta serie aparte y no se combina con la repetición PerfProc. Incluye el arranque de Electron de 7814,7 ms. Celdas: mediana (mínimo–máximo).

| Métrica | Hub GPUI | Anfitrión Rust + Electron |
|---|---:|---:|
${earlierRows.join("\n")}

## Método y límites

- Reloj monotónico desde antes de Process.Start. Ventana visible: IsWindowVisible sobre un HWND del árbol propio. WM_NULL: SendMessageTimeout al mismo HWND. Interacción: ida y vuelta real Apariencia → General; GPUI mediante entradas Win32 y lectura de subrayado/pintura, Electron mediante Playwright y foco de un control. Es un límite superior instrumentado, con sondas distintas; se conservan las tres latencias para no confundirlas.
- Perfiles QA nuevos, con los mismos ajustes y un layout de fixture, antes de cada arranque. Privacidad decidida en no enviar. Caché del sistema natural y previamente calentada por la preparación y pruebas descartadas: **no se mide arranque en frío**. No se extrapola este N=5 a los objetivos frío/caliente del diseño.
- Reposo: tres segundos de asentamiento y cinco segundos de espera entre instantáneas PerfProc por pantalla; el intervalo real de sus timestamps se conserva por PID y se usa en el cálculo. Siempre Ajustes y después Inicio en el mismo proceso. CPU expresada respecto a un núcleo; dividir por ${provenance.logicalCpus} para porcentaje de toda la máquina. Se contrastó PerfProc con process.cpuUsage de Node en una carga controlada (cpu-counter-native-sanity.json). La sonda .NET daba cero durante esa carga y no se usa. Un cero de la nueva sonda es solo la observación de ese intervalo. Memoria privada es PrivateMemorySize64 (comprometida); working set suma residentes y puede contar páginas compartidas más de una vez. MiB = 2^20 bytes.
- El candidato QA conserva validación de inventario antes de lanzar. Su recorrido inicial cuesta mediana ${format(statistics["integrity.walkMs"].median, 1)} ms; verificación, segundo recorrido y hashes ${format(statistics["integrity.verifyMs"].median, 1)} ms; total ${format(statistics["integrity.totalMs"].median, 1)} ms (${format(statistics["integrity.totalMs"].min, 1)}–${format(statistics["integrity.totalMs"].max, 1)}). Incluye los pequeños peers QA sellados junto al anfitrión; no es una optimización del instalador.
- Hub nuevo: CDP de QA activado para comprobar interacción. GPUI: ventana normal --qa-measure con VANTARE_CAPTURE_POLICY=ipc, sin escena visual congelada ni demo. Los peers del anfitrión son procesos externos y se excluyen; en el banco GPUI los replies locales viven dentro del proceso. Es una limitación del banco, documentada para interpretar memoria y CPU.
- Se revisan las capturas de ambas pantallas para evitar medir una puerta protegida. Diez cierres controlados, cero descendientes supervivientes en todos. Esto comprueba el cierre de la medición; no se atribuye a una prueba de entrada en pista.
- Tres intentos previos incompletos se descartaron: uno por política no verificada y dos por la sonda UIAutomation. Sus muestras y diagnósticos se conservan en invalid-*/. UIAutomation se sustituyó por interacción y pintura verificables. La cuarta serie completa se publica arriba sin CPU y se conserva en invalid-cpu-trial-4/; la tabla principal pertenece solo a la repetición completa con PerfProc.

## Evidencia y reproducción

Muestras sin agregar en samples.json; cifras derivadas en statistics.json; SHA y procedencia en provenance.json y la generación QA indicada. Capturas gpui/electron-settings/home-0…4.png y stderr por proceso. La suma lógica no es el espacio físico asignado por NTFS ni incluye los datos de usuario.

Desde hub-web, definir VANTARE_HUB_QA_ROOT, VANTARE_HUB_EVIDENCE, VANTARE_HUB_GPUI_BANK, VANTARE_HUB_HOST_BINARY (Release qa-e2e), VANTARE_HUB_MEASURE_PEER y VANTARE_HUB_UI_PACKAGE; ejecutar scripts/measure.ps1. El wrapper toma y libera captura.lock. Generar el informe con node --experimental-strip-types scripts/measure-report.ts <evidencia> y formatear la copia versionada con Biome. Sin dependencias nuevas.
`;
await mkdir("docs/medicion-1", { recursive: true });
await writeFile(
  join(evidence, "statistics.json"),
  JSON.stringify(statistics, null, 2),
);
await writeFile(join(evidence, "INFORME.md"), report);
await writeFile("docs/medicion-1/INFORME.md", report);
await writeFile(
  "docs/medicion-1/statistics.json",
  JSON.stringify(statistics, null, 2),
);
await writeFile(
  "docs/medicion-1/samples.json",
  JSON.stringify(samples, null, 2),
);
await writeFile(
  "docs/medicion-1/provenance.json",
  JSON.stringify(provenance, null, 2),
);
console.log(JSON.stringify(statistics, null, 2));
