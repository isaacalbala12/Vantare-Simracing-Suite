# Memoria y arranque: diagnóstico antes de optimizar

Fecha: 2026-11-11. VANTA-138 / #1995. **Informe de solo lectura: no se ha cambiado ningún flag, proceso ni comportamiento del producto.** Las propuestas de ahorro son hipótesis para pruebas futuras, no resultados de optimización.

## Conclusión

El heap JavaScript usado del renderer está en 8–10 MiB, por debajo del objetivo de 60 MB. El mayor bloque es Chromium nativo: main, GPU y renderer. Hay un único renderer y un utility de NetworkService; no hay una ventana por pantalla. El anfitrión Rust aporta menos de 9 MiB residentes.

La mediana validada de cinco pares sigue siendo **390,56 MiB de suma de working sets en Ajustes** y **403,20 MiB en Inicio**, frente a GPUI 94,79 y 95,72 MiB. El objetivo de 250 MB decimales equivale a 238,42 MiB: faltan 152,14 MiB en Ajustes; incluso interpretándolo como 250 MiB faltan 140,56 MiB. No hay evidencia de que unas pocas opciones de Chromium vayan a cerrar esa distancia.

## Método del desglose

Una ejecución suplementaria del MISMO candidato QA del A/B (UI 9401501ea, anfitrión Release y hashes de binaries.json), con puente Rust real y los mismos peers locales de lectura. Perfil nuevo en D:, Ajustes → Inicio, tres segundos de asentamiento y cinco segundos de CPU por pantalla. Ventana real 1440×900; cerrojo global y ninguna compilación propia simultánea. Capturas en memory-profile/. No hubo cuentas reales, red del Hub, cambios al instalador ni al supervisor.

Son lecturas consecutivas por PID en reposo, no una instantánea atómica. Cada PID se clasifica por Win32_Process del árbol propio: nombre del anfitrión y --type de Electron; el subtipo utility se conserva sin volcar la línea de órdenes. Se contrasta con CDP SystemInfo.getProcessInfo. Solo se leen procesos del candidato. Las métricas Windows se toman antes de las consultas suplementarias de heap/DOM por CDP. La ejecución cerró con cero descendientes; no se incluye a los peers QA externos.

Es **una instantánea adicional por pantalla**, no una mediana por rol de los cinco pares originales, que no guardaban --type. No se asignan retrospectivamente roles a aquellos PID por su orden o por su memoria. El servidor es compartido y ruidoso. En esta repetición varía especialmente el compromiso privado de GPU (111 → 259 MiB); por eso no reemplaza las medianas anteriores ni prueba una fuga.

## Desglose real por proceso

MiB = 2^20 bytes. Privada comprometida = Get-Process.PrivateMemorySize64; working set = WorkingSet64; residente privada = Win32_PerfRawData_PerfProc_Process.WorkingSetPrivate. Son conceptos distintos.

| Pantalla    | Rol                      |        PID | Privada comprometida MiB | Working set MiB | Residente privada MiB |
| ----------- | ------------------------ | ---------: | -----------------------: | --------------: | --------------------: |
| Ajustes     | host                     |      10136 |                     1.59 |            8.72 |                  1.12 |
| Ajustes     | main                     |       8200 |                    51.03 |          105.22 |                 39.90 |
| Ajustes     | gpu-process              |       9380 |                   111.32 |          120.26 |                 63.03 |
| Ajustes     | utility · NetworkService |       1636 |                    11.29 |           43.26 |                  7.03 |
| Ajustes     | renderer                 |       5916 |                    58.97 |          109.09 |                 45.84 |
| **Ajustes** | **Total**                | 5 procesos |               **234.20** |      **386.55** |            **156.91** |
| Inicio      | host                     |      10136 |                     1.62 |            8.84 |                  1.15 |
| Inicio      | main                     |       8200 |                    51.50 |          106.05 |                 40.34 |
| Inicio      | gpu-process              |       9380 |                   259.28 |          135.45 |                 78.11 |
| Inicio      | utility · NetworkService |       1636 |                    11.29 |           43.27 |                  7.03 |
| Inicio      | renderer                 |       5916 |                    66.03 |          118.77 |                 53.67 |
| **Inicio**  | **Total**                | 5 procesos |               **389.72** |      **412.37** |            **180.30** |

La suma de working sets cuenta también páginas compartidas en cada proceso. En esta instantánea, 156,91/180,30 MiB son residentes privados; **eso no convierte el consumo total en 157/180 MiB**, porque faltan las páginas compartidas únicas. No se cambia la definición del objetivo para declararlo cumplido. La memoria GPU dedicada del adaptador tampoco está incluida como VRAM en estas cifras de RAM. Véanse las [definiciones oficiales de memoria](https://www.electronjs.org/docs/latest/api/structures/memory-info).

## Heap y composición

| Pantalla | Heap JS usado MiB | Heap JS reservado MiB | Heap del embedder MiB | Nodos DOM | Listeners JS |
| -------- | ----------------: | --------------------: | --------------------: | --------: | -----------: |
| Ajustes  |              9.11 |                 14.07 |                  6.30 |      2142 |          998 |
| Inicio   |              8.21 |                 10.82 |                  8.57 |      2669 |         1089 |

Runtime.getHeapUsage y Memory.getDOMCounters son lecturas posteriores al reposo; no se forzó GC. Los heaps JS y del embedder no se suman a las columnas Windows: ya están contenidos en la memoria de su proceso. El contador de documentos pasa de 2 a 14; no se ha atribuido cada documento a un SVG o a otra fuente. Un solo salto Ajustes → Inicio no permite diagnosticar retención ni fugas.

La GPU figura con composición, rasterización, WebGL, WebGPU y vídeo habilitados. Solo existe un proceso utility, network.mojom.NetworkService; su existencia no significa que el Hub haga peticiones HTTP, y no autoriza habilitarlas. No se recogieron credenciales ni líneas de órdenes completas.

## Qué ya está hecho

- RegisteredScreen usa import.meta.glob y React.lazy; las páginas de Ajustes también se cargan de forma diferida. No proponer otra vez «lazy-load de todas las pantallas» como si faltara.
- security.ts ya fija spellcheck=false, backgroundThrottling=true, sandbox=true, nodeIntegration=false y webviewTag=false. main ya usa Menu.setApplicationMenu(null).
- El paquete medido contiene cero sourcemaps y solo es.pak / en-US.pak. Las nueve caras TTF suman 393.748 bytes (0,376 MiB) en disco; los pesos y las familias son requisito de paridad.
- El empaquetado trae el snapshot estándar de V8. v8CacheOptions no se sobrescribe: la política predeterminada ya es code. Cada perfil nuevo del A/B pierde su caché de código propia; no es una medición de perfil persistente caliente. [Política oficial de caché](https://www.electronjs.org/docs/latest/api/structures/web-preferences).

## Propuestas de memoria, en orden

Los rangos siguientes son **presupuestos de experimentación**, no ahorros medidos ni aditivos. El cero está incluido porque el coste puede trasladarse a otro proceso. Repetir después el mismo A/B y la paridad; mantener sandbox, aislamiento, CSP, lista cerrada y verificación de integridad.

| Prioridad  | Prueba concreta futura                                                                                                      | Ahorro neto estimado en suma de working sets | Fundamento y condición                                                                                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1         | A/B de app.disableHardwareAcceleration() antes de ready, sin cambiar el número de ventanas                                  |                     0–60 MiB; puede empeorar | GPU ocupa 120–135 MiB residentes, de ellos 63–78 privados, pero superficies y raster pueden pasar al renderer o seguir en software. Probar Windows real y más escalas; medir CPU, scroll, fuentes, arrastre y cierre. No confundir apagar aceleración con garantizar que desaparezca el proceso GPU. |
| P1         | Traza de memoria GPU/superficies en Ajustes e Inicio; revisar capas compositadas y caché de imágenes antes de tocar sombras |                                     0–20 MiB | Los SVG/vistas previas y las superficies nativas son candidatos; falta atribución de recursos. Conservar el aspecto: no quitar sombras o tarjetas a ciegas. Puede solaparse con el ahorro de la prueba anterior.                                                                                     |
| P2         | Separar del grafo inicial de main los módulos de mock/datos QA que hoy se importan estáticamente en host.ts                 |                                      0–5 MiB | Optimización del arranque/importación, no del protocolo. El candidato QA usa puente real, pero el módulo simulado sigue en el grafo de main. Medir también una build de distribución idéntica y segura; no atribuir todo el main de 105 MiB al mock.                                                 |
| P2         | Perfilar imports compartidos y módulos que sí se cargan con General; aplazar solo lo que la traza demuestre innecesario     |                                     0–10 MiB | Ya hay lazy-load por pantalla; no hay cientos de MiB de heap JS por retirar. No destruir proveedores/borradores para descargar páginas.                                                                                                                                                              |
| P3         | A/B de funciones Chromium no usadas, una por vez (p. ej. MediaRouter/HardwareMediaKeyHandling si la versión las reconoce)   |                            0–3 MiB en reposo | Hoy solo se observa un utility. Un flag ignorado o una función nunca instanciada ahorra cero. No desactivar NetworkService por flag ni moverlo dentro de main para ocultar un proceso.                                                                                                               |
| P3         | Revisar cuándo se solicitan los pesos de fuente, manteniendo las nueve caras y su rasterizado                               |                                      0–2 MiB | Solo 0,376 MiB de archivos; la caché decodificada no está atribuida. Reducir caras o sustituirlas rompe la paridad y no resuelve 140–152 MiB.                                                                                                                                                        |
| Sin acción | Quitar sourcemaps/locales ya recortados, spellchecker o menú ya desactivados                                                |         0 MiB de ahorro adicional demostrado | No hay mapas y estas opciones ya se aplican. El tamaño de un archivo en disco no equivale a memoria residente.                                                                                                                                                                                       |

Incluso la hipótesis extrema e irreal de eliminar todos los 120,26 MiB del proceso GPU de Ajustes sin trasladar nada dejaría 266,29 MiB en esta instantánea: todavía por encima de 250 MiB. No se promete cumplir el objetivo con una sola palanca. No propongo --single-process, --in-process-gpu o --no-sandbox como trucos para reducir el recuento; cambiarían aislamiento o esconderían el coste.

La API de [aceleración y métricas de Electron](https://www.electronjs.org/docs/latest/api/app) permite la prueba; la [guía de rendimiento](https://www.electronjs.org/docs/latest/tutorial/performance) recomienda atribuir con trazas y diferir trabajo probado innecesario. No se ha ejecutado ninguna variante de flags en este encargo.

## Arranque e inventario

Mediana de cinco pares: GPUI visible 343,88 ms, Hub nuevo 987,62 ms. Interacción comprobada con ida y vuelta Apariencia → General: 1.586,07 frente a 2.406,91 ms; son límites instrumentados con sondas distintas. La caché del sistema no se controla: no se certifica frío/caliente ni se usa esta tanda para declarar cumplido ≤900/≤600 ms.

Inventario total: **375,67 ms** de mediana (354,51–413,54). Primer recorrido: 7,73 ms; verificación con segundo recorrido y hashes: 367,87 ms. Ese segundo bloque no es un cronómetro puro de SHA-256. El cociente de medianas inventario/visible es aproximadamente el 38 %; no se suman o restan medianas como prueba causal.

| Repetición Electron | Ventana visible ms | Inventario y hashes ms | Resto observado ms |
| ------------------- | -----------------: | ---------------------: | -----------------: |
| 1                   |            7065,04 |                 413,54 |            6651,50 |
| 2                   |             968,89 |                 383,87 |             585,03 |
| 3                   |             987,62 |                 375,67 |             611,96 |
| 4                   |            1086,65 |                 354,51 |             732,14 |
| 5                   |             812,37 |                 357,12 |             455,25 |

Resto es la resta de ambos cronómetros de la misma repetición, no una medición de Electron aislado. El primer arranque de la generación tiene el pico de 7,1 s, pero su inventario solo sube a 414 ms: el hash no explica ese pico. Falta traza de E/S, planificación y análisis antivirus; no se atribuye el pico a una causa concreta sin ETW/traza.

El candidato suma 331.668.788 bytes (316,30 MiB). Electron.exe aporta 249.832.448 bytes, alrededor de tres cuartas partes; siguen dxcompiler.dll (25.779.200), resources.pak (13.371.578) e icudtl.dat (10.824.576). Minificar unos KB de React no elimina el coste de hashear esos binarios. El primer recorrido no vuelve a hashear los 330 MB: identifica/valida el inventario; la verificación posterior es la que incluye hashes.

## Propuestas de arranque, en orden

| Prioridad                    | Acción futura                                                                                                                              |                                       Ahorro de tiempo estimado | Condición                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 · diagnóstico             | Trazar primero un arranque de generación y varios de perfil persistente, marcando host/inventario/CreateProcess/app.ready/renderer/visible |                                                0 ms por sí sola | Explica el pico de 7 s y separa el perfil nuevo de un uso diario caliente. Misma máquina sin compilaciones propias; ninguna exclusión de antivirus ni cambio del supervisor.                                                                                          |
| P2                           | Evitar un recorrido duplicado manteniendo todas las comprobaciones, hashes, ficheros extra y rechazo de enlaces                            |                                             0–8 ms orientativos | La cota útil la da el primer recorrido de 7,73 ms; no esperar cientos de ms de este refactor. Necesitaría revisión propia del límite de integridad y de sus negativos; no se modifica aquí el instalador.                                                             |
| P2                           | Perfil persistente y trazas de compilación de scripts; después A/B de la política de code cache existente                                  |                                            0–50 ms orientativos | code ya es la política por defecto. No activar eager compile o un snapshot de aplicación sin medir: puede trasladar trabajo al arranque y aumentar tamaño. La tanda actual usa perfiles nuevos.                                                                       |
| P2                           | Diferir imports QA y trabajo inicial que la traza atribuya realmente a main/renderer                                                       |                                            0–30 ms orientativos | main y renderer tienen poco heap de aplicación frente a Chromium; no atribuirles sin traza todo el resto de 612 ms. Mantener ventana lista y puente antes de declarar interacción.                                                                                    |
| P3                           | Evaluar snapshot V8 específico solo después de la traza y una medición con perfil persistente                                              |                                    No estimable con estos datos | Ya existe el snapshot estándar de Electron. No introducir otra herramienta o dependencia ni complejidad de empaquetado para ahorrar un tiempo de parseo aún no atribuido.                                                                                             |
| Requiere diseño de seguridad | Caché de verificación entre procesos para generaciones inmutables                                                                          | Techo observado del bloque: 355–414 ms; ahorro real no estimado | mtime+tamaño por sí solos NO acreditan integridad. Sería otro diseño con identidad estable, generación protegida y evidencias de que no cambió; requiere aprobación y revisión. No se omite la verificación previa a lanzar ni se propone lanzar y verificar después. |

No tocar el manifiesto para dejar fuera Electron.exe, DLL, locales o app.asar. El fuse de integridad de ASAR sigue activo y no sustituye el inventario completo del anfitrión. Tampoco se justifica paralelizar lecturas sobre D: mecánico sin medir: puede añadir búsquedas y empeorar el resultado.

## Evidencia y reproducción

- Informe de cinco pares: INFORME.md, statistics.json y samples.json (sin roles retrospectivos).
- Nuevo desglose: memory-profile/roles-settings.json y roles-home.json, con PID/parentPID, campos de memoria y CDP. provenance.json identifica exactamente generación, binarios y fuente de UI; su texto de método dice explícitamente que es una única ejecución suplementaria.
- Capturas: memory-profile/electron-settings-0.png y electron-home-0.png; samples.json verifica cierre sin supervivientes.
- Herramientas QA suplementarias conservadas fuera del producto: D:/VantareServer/qa/isa-1995-memoria/profile-memory.ts y profile-window.ps1. Son una copia acotada del banco A/B a una ejecución Electron y metadatos de roles; no cambian los cinco pares ni se suman a sus estadísticas. Rutas y cachés en D:, cerrojo global, sin datos reales.
- Resource Timing no ofreció tamaños de recursos en este origen: no se usan sus ceros como prueba de que no haya fuentes/JS cargados. Los tamaños de fuentes y sourcemaps proceden de los archivos del paquete.

**No se ha aplicado ninguna optimización de producto ni se ha sustituido el Hub GPUI distribuido.** Las primeras pruebas a autorizar serían GPU y una traza de arranque; todo ahorro de la lista queda por demostrar.
