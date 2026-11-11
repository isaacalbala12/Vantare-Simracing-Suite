# Primera medición A/B del Hub en este servidor

Cinco pares alternados A/B: GPUI → Electron, Electron → GPUI, repetido hasta completar cinco arranques válidos de cada uno. Mismo servidor, Microsoft Windows 11 Pro (kernel 10.0.22631), 8 procesadores lógicos y 16,0 GiB de RAM. **Servidor compartido y ruidoso; no es un banco aislado ni una prueba de Windows 10.** No hubo compilaciones propias ni procesamiento pesado de imágenes durante las muestras. Cerrojo global tomado durante la tanda.

UI de QA construida una sola vez desde nightly `9401501ea38f2e8fe65584511f27844c7efd157a`; anfitrión Release con puente real y peers locales de lectura. GPUI es el banco Release ya compilado (12ff03f49697ee9bff773f2c10529f14ef99f284). No hay cuentas ni servicios reales, instalador o supervisor productivo, ni sustitución del Hub distribuido.

## Resultado

Cada celda muestra **mediana (mínimo–máximo; MAD)** de cinco medidas; MAD es la mediana de las desviaciones absolutas. La memoria suma todos los procesos descendientes del anfitrión, incluido GPU/utility/renderer; GPUI usa su árbol completo.

| Métrica                                                              |                         Hub GPUI |        Anfitrión Rust + Electron |
| -------------------------------------------------------------------- | -------------------------------: | -------------------------------: |
| Inicio de proceso → ventana visible (ms)                             |    343,9 (293,4–591,0; MAD 50,5) |   987,6 (812,4–7065,0; MAD 99,0) |
| Inicio de proceso → WM_NULL respondido (ms)                          |    364,0 (310,6–599,3; MAD 53,3) |  998,0 (818,8–7072,5; MAD 111,6) |
| Inicio de proceso → interacción Apariencia → General verificada (ms) | 1586,1 (1521,8–1807,4; MAD 64,2) | 2406,9 (2233,5–7903,4; MAD 57,3) |
| Ajustes · memoria privada comprometida (MiB)                         |     109,4 (109,2–109,4; MAD 0,0) |     366,4 (363,8–401,2; MAD 2,6) |
| Ajustes · suma de working sets (MiB)                                 |        94,8 (94,7–94,8; MAD 0,0) |     390,6 (389,2–399,1; MAD 1,4) |
| Ajustes · CPU de un núcleo (%)                                       |   0,000 (0,000–0,307; MAD 0,000) |   0,000 (0,000–0,306; MAD 0,000) |
| Inicio · memoria privada comprometida (MiB)                          |     110,5 (110,3–110,6; MAD 0,1) |     375,2 (370,5–382,4; MAD 4,6) |
| Inicio · suma de working sets (MiB)                                  |        95,7 (95,4–95,8; MAD 0,1) |     403,2 (400,4–410,8; MAD 2,8) |
| Inicio · CPU de un núcleo (%)                                        |   0,000 (0,000–0,000; MAD 0,000) |   0,000 (0,000–0,000; MAD 0,000) |

| Tamaño lógico descomprimido                         |                       Medido |
| --------------------------------------------------- | ---------------------------: |
| GPUI · ejecutable del banco, recursos embebidos     |   38,68 MiB (40556032 bytes) |
| Candidato · anfitrión + hub-ui y sus sidecars       | 316,30 MiB (331668788 bytes) |
| Peers de IPC de QA, excluidos de la memoria del Hub |     2,57 MiB (2698401 bytes) |
| Generación QA completa sellada, sin datos mutables  | 318,88 MiB (334373620 bytes) |

## Objetivos del diseño

| Objetivo                                          | Resultado de esta primera tanda                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Ventana visible ≤ 900 ms frío / ≤ 600 ms caliente | No se certifica: caché del sistema sin controlar y N=5; arriba se publica la latencia observada. |
| Working set total ≤ 250 MB en Ajustes             | No cumple: mediana 390,6 MiB.                                                                    |
| Heap JS ≤ 60 MB                                   | No medido en este primer A/B; no confundir con la memoria privada del proceso.                   |
| Cero procesos de Electron al entrar en pista      | Fuera de esta tanda de solo lectura; sí se verifican diez cierres con cero descendientes.        |
| Windows 10 real                                   | Pendiente de máquina o VM; este servidor es Windows 11.                                          |

## Serie completa anterior

La serie anterior también tiene cinco pares completos de arranque y memoria. Su sonda .NET de CPU no superó la comprobación de carga; se conserva esta serie aparte y no se combina con la repetición PerfProc. Incluye el arranque de Electron de 7814,7 ms. Celdas: mediana (mínimo–máximo).

| Métrica                      |               Hub GPUI | Anfitrión Rust + Electron |
| ---------------------------- | ---------------------: | ------------------------: |
| Ventana visible (ms)         |    320,7 (294,6–687,7) |      893,7 (798,0–7814,7) |
| Interacción verificada (ms)  | 1603,2 (1514,9–2518,7) |    2163,5 (2086,7–8630,6) |
| Working set de Ajustes (MiB) |       94,8 (94,6–94,9) |       389,6 (388,4–391,9) |
| Working set de Inicio (MiB)  |       95,7 (95,5–95,7) |       402,3 (400,5–404,6) |

## Método y límites

- Reloj monotónico desde antes de Process.Start. Ventana visible: IsWindowVisible sobre un HWND del árbol propio. WM_NULL: SendMessageTimeout al mismo HWND. Interacción: ida y vuelta real Apariencia → General; GPUI mediante entradas Win32 y lectura de subrayado/pintura, Electron mediante Playwright y foco de un control. Es un límite superior instrumentado, con sondas distintas; se conservan las tres latencias para no confundirlas.
- Perfiles QA nuevos, con los mismos ajustes y un layout de fixture, antes de cada arranque. Privacidad decidida en no enviar. Caché del sistema natural y previamente calentada por la preparación y pruebas descartadas: **no se mide arranque en frío**. No se extrapola este N=5 a los objetivos frío/caliente del diseño.
- Reposo: tres segundos de asentamiento y cinco segundos de espera entre instantáneas PerfProc por pantalla; el intervalo real de sus timestamps se conserva por PID y se usa en el cálculo. Siempre Ajustes y después Inicio en el mismo proceso. CPU expresada respecto a un núcleo; dividir por 8 para porcentaje de toda la máquina. Se contrastó PerfProc con process.cpuUsage de Node en una carga controlada (cpu-counter-native-sanity.json). La sonda .NET daba cero durante esa carga y no se usa. Un cero de la nueva sonda es solo la observación de ese intervalo. Memoria privada es PrivateMemorySize64 (comprometida); working set suma residentes y puede contar páginas compartidas más de una vez. MiB = 2^20 bytes.
- El candidato QA conserva validación de inventario antes de lanzar. Su recorrido inicial cuesta mediana 7,7 ms; verificación, segundo recorrido y hashes 367,9 ms; total 375,7 ms (354,5–413,5). Incluye los pequeños peers QA sellados junto al anfitrión; no es una optimización del instalador.
- Hub nuevo: CDP de QA activado para comprobar interacción. GPUI: ventana normal --qa-measure con VANTARE_CAPTURE_POLICY=ipc, sin escena visual congelada ni demo. Los peers del anfitrión son procesos externos y se excluyen; en el banco GPUI los replies locales viven dentro del proceso. Es una limitación del banco, documentada para interpretar memoria y CPU.
- Las capturas de Inicio no tienen carga visual idéntica: GPUI muestra «Prepara tu overlay» sin vista previa y Electron muestra el layout local de dos widgets con SVG. Se entregó el mismo fichero de layout de fixture, pero el banco y la pantalla nueva no lo representan igual en modo normal. La comparación de memoria/CPU de Inicio es orientativa para esos estados reales y no aísla el coste del framework.
- Se revisan las capturas de ambas pantallas para evitar medir una puerta protegida. Diez cierres controlados, cero descendientes supervivientes en todos. Esto comprueba el cierre de la medición; no se atribuye a una prueba de entrada en pista.
- Cinco intentos previos incompletos se descartaron: uno por política no verificada, dos por la sonda UIAutomation, uno por entrega de entradas y otro por un bloqueo al renombrar el perfil. Cada ejecución usa ahora una ruta nueva sin mover cachés. Sus muestras y diagnósticos se conservan en invalid-*/. UIAutomation se sustituyó por interacción y pintura verificables. La cuarta serie completa se publica arriba sin CPU y se conserva en invalid-cpu-trial-4/; la tabla principal pertenece solo a la repetición completa con PerfProc.

## Evidencia y reproducción

Muestras sin agregar en samples.json; cifras derivadas en statistics.json; SHA y procedencia en provenance.json y la generación QA indicada. Capturas gpui/electron-settings/home-0…4.png y stderr por proceso. La suma lógica no es el espacio físico asignado por NTFS ni incluye los datos de usuario.

Desde hub-web, definir VANTARE_HUB_QA_ROOT, VANTARE_HUB_EVIDENCE, VANTARE_HUB_GPUI_BANK, VANTARE_HUB_HOST_BINARY (Release qa-e2e), VANTARE_HUB_MEASURE_PEER y VANTARE_HUB_UI_PACKAGE; ejecutar scripts/measure.ps1. El wrapper toma y libera captura.lock. Generar el informe con node --experimental-strip-types scripts/measure-report.ts <evidencia> y formatear la copia versionada con Biome. Sin dependencias nuevas.
