# Medición-2 · informe parcial y bloqueo tras el reinicio

**Estado: cinco experimentos de optimización completos, N=5 pares alternados cada uno (50 arranques válidos). La serie N=5 con traza NO está completa. No hay optimizaciones aplicadas al producto.**

VANTA-138 / #1995 · 12-11-2026. Candidato exacto de medición-1: UI `9401501ea38f2e8fe65584511f27844c7efd157a`, Electron 45.2.3 y anfitrión Release QA. No es una medición de nightly actual. El paquete distribuido, instalador y supervisor no cambian.

## Serie pendiente y exclusiones actualizadas

La serie completa N=5 por fases está esperando un minuto sin compilaciones, con captura.lock reservado. Los cinco experimentos anteriores siguen siendo los únicos resultados completos que se tabulan. No se mezclan sus bases con las nuevas tomadas después de reparar D:.

Los pilotos del grabador nativo de Chromium no terminaron stopRecording en 20 s. Se conservan incompletos. La nueva serie usa una traza de marcas explícitas del main y Paint Timing del renderer para creación, carga, handshake, FCP y show; no es un perfil de CPU V8 ni permite estimar ahorro de snapshot.

La tanda paired-trace-6e40e1b0 quedó excluida entera: Cargo PID 8948 arrancó a las 23:36:49 CET, durante la reserva iniciada a las 23:35:46. Tenía hijos sccache de compilación. Se interrumpieron solo los procesos propios; no quedaron Hub/Electron propios y se liberó su cerrojo. La reserva de repetición exige un minuto estable sin builds y registra siete comprobaciones de quietud por arranque; cualquier compilación invalida toda la serie. No se cancelan procesos ajenos.

Los fallos previos de ventana visible, cierre y mantenimiento también se conservan como incompletos, sin reinterpretarlos como tiempos válidos ni atribuirles una causa no demostrada. La supervisión QA confirma hub-ready antes de retirar boot-pending, conservando la protección nativa y sin imprimir el nonce.

## Resultado antes → después

Mediana [mínimo–máximo]. Δ pareada = mediana de B−A por pareja. Cada fila tiene su propia base; no comparar directamente bases tomadas a horas distintas.

| Variante aislada | Ajustes WS MiB A → B | Δ pareada MiB | Visible ms A → B | GPU A → B |
| --- | --- | --- | --- | --- |
| hardware-off | 392,86 [385,20–398,00] → 366,66 [361,31–398,73] | -26,42 [-36,69–13,53] | 941,30 [807,01–3879,72] → 990,21 [804,86–1845,43] | 1 → 1 |
| hardware-off-no-gpu | 390,07 [387,32–501,78] → 359,12 [358,07–362,48] | -31,06 [-139,29–-28,20] | 2041,24 [1137,89–2647,16] → 2398,98 [1372,58–3866,97] | 1 → 1 |
| media-keys-off | 389,50 [387,70–390,60] → 387,91 [385,71–394,87] | -1,45 [-2,30–4,87] | 894,20 [862,97–1132,12] → 841,93 [809,75–1162,22] | 1 → 1 |
| media-router-off | 388,33 [383,26–391,83] → 389,97 [388,76–415,04] | 0,43 [-1,66–26,84] | 1033,79 [837,32–8125,99] → 1139,32 [896,56–3985,64] | 1 → 1 |
| renderer-limit | 387,72 [372,97–394,30] → 388,93 [383,11–394,78] | 1,20 [-5,82–18,39] | 1316,66 [813,14–2246,76] → 1333,24 [857,58–1502,16] | 1 → 1 |

![Working sets de Ajustes: medianas por condición](memoria.svg)

## Memoria y heap: aceleración desactivada

| Vista / condición | WS total MiB | Privada comprometida MiB | Privada residente MiB | Heap JS usado MiB | CPU % un núcleo |
| --- | --- | --- | --- | --- | --- |
| settings / baseline | 392,86 [385,20–398,00] | 360,30 [232,61–367,93] | 159,44 [152,76–162,91] | 8,68 [7,84–8,73] | 0,00 [0,00–0,00] |
| home / baseline | 405,92 [400,37–410,28] | 378,25 [374,16–380,32] | 170,87 [167,93–173,38] | 7,98 [7,95–9,36] | 0,00 [0,00–0,00] |
| settings / variant | 366,66 [361,31–398,73] | 140,83 [137,21–142,54] | 109,18 [105,48–110,54] | 8,74 [8,70–9,54] | 0,00 [0,00–0,31] |
| home / variant | 365,84 [364,41–396,99] | 149,78 [145,31–151,54] | 117,45 [112,72–117,77] | 7,98 [7,93–8,16] | 0,00 [0,00–0,00] |

El working set total suma páginas compartidas en varios procesos; no equivale a RAM física única. Private Bytes mide compromiso, no residencia. No se cambia de métrica para aparentar cumplir 250 MiB. El objetivo de 250 MiB de working sets no se alcanza. Desactivar aceleración tampoco elimina gpu-process; aun con disable-gpu y disable-software-rasterizer, Chromium conserva uno y declara composición por software.

| Proceso en Ajustes | WS MiB base → sin aceleración | Privada MiB base → sin aceleración |
| --- | --- | --- |
| host | 8,71 [8,67–8,77] → 8,70 [8,67–8,76] | 1,61 [1,55–1,68] → 1,61 [1,58–1,67] |
| main | 105,07 [103,84–106,20] → 105,00 [101,84–111,18] | 49,08 [47,77–50,66] → 47,91 [46,83–51,70] |
| gpu-process | 127,23 [121,67–131,09] → 80,29 [80,02–89,55] | 245,57 [116,07–249,10] → 19,66 [19,62–19,70] |
| utility | 43,25 [43,12–44,74] → 43,30 [43,19–54,61] | 11,18 [11,10–11,41] → 11,20 [11,11–11,33] |
| renderer | 107,41 [104,21–109,21] → 129,27 [127,18–134,69] | 54,45 [52,08–55,77] → 57,97 [57,93–62,32] |

## Arranque: cinco bases sin traza

Relojes epoch y marcas explícitas, sin sumar medianas de intervalos para reproducir una mediana total. El FCP puede suceder después de hacerse visible el HWND. La comprobación posterior de interacción incluye automatización; no se presenta como tiempo puro de interactividad.

| Fase | ms, mediana [mínimo–máximo] |
| --- | --- |
| Anfitrión → creación de Electron (incluye integridad) | 394,10 [373,26–589,44] |
| Creación de Electron → primera marca de main | 272,23 [208,27–785,09] |
| Espera app.ready | 29,12 [22,18–64,33] |
| Handshake hello | 26,99 [13,35–637,01] |
| Constructor de BrowserWindow | 42,16 [37,40–50,09] |
| Inicio de carga → DOM listo | 143,19 [110,41–2352,05] |
| DOM listo → show | 29,29 [18,17–39,85] |
| Anfitrión → primer contenido pintado | 1083,30 [937,70–3960,70] |
| Anfitrión → HWND visible | 941,30 [807,01–3879,72] |

Inventario y hash: 370,94 [354,40–440,32] ms; primer recorrido 7,72 [7,13–10,90], verificación/hash 363,22 [347,28–430,36]. El trabajo se conserva, no se salta en ningún experimento.

Hay grabaciones parciales reales de contentTracing en los directorios de pilotos/series incompletas; Electron 45 emite Perfetto binario aunque el nombre inicial terminase en .json. No se inventan totales de CPU V8 ni se presenta una grabación parcial como cinco trazas válidas. ContentTracing solo puede iniciar tras app.ready; el tramo anterior se cubre con marcas explícitas.

## Fluidez y bundle

Después de medir reposo a 1440×900, el ejercicio usa Apariencia a 1440×720, tres desplazamientos suaves y dos cambios de raíl. Solo entonces se fija prefers-reduced-motion: no-preference. El raíl tiene transición CSS 0s: se verifica tamaño, no una animación que no existe. Se han inspeccionado capturas nativas de las variantes por software; el banco rechaza imágenes vacías o negras.

En hardware-off el p95 de intervalos de callbacks de scroll pasa de 17,30 [16,90–75,90] a 17,60 [17,50–18,10] ms. **No son FPS presentados ni certificación de fluidez percibida** en una sesión remota. La percepción en un PC representativo sigue siendo una comprobación necesaria antes de cambiar defaults.

El chunk principal sellado ocupa 396,79 KiB; todos sus JS 1204,13 KiB. Los tamaños de assets son exactos; las contribuciones de módulos de la reconstrucción offline son estimaciones renderedLength, no heap ni tamaño comprimido. El paquete es QA y contiene sus escenas/dobles; el puente medido usa Rust y peers locales.

| Grupo | Contribución renderedLength KiB (estimación) |
| --- | --- |
| application | 1012,94 |
| @base-ui/react | 668,72 |
| react-dom | 524,38 |
| @tanstack/query-core | 64,32 |
| @tanstack/virtual-core | 55,96 |
| @base-ui/utils | 32,99 |
| @floating-ui/dom | 17,96 |
| react | 17,03 |
| @floating-ui/core | 15,74 |
| scheduler | 9,13 |

Ya hay lazy-load por pantalla, un renderer, spellcheck desactivado, cero sourcemaps, dos locales y fuentes recortadas. El snapshot estándar de V8 y la política code de caché ya existen. No se proponen como trabajo pendiente ni se atribuyen cientos de MiB al heap JS.

## Recomendación provisional por ahorro/riesgo

1. **Hardware-off merece una validación QA adicional**, solo si Isaac decide convertirlo en PR. Ahorro pareado mediano de 26,42 MiB de working sets en Ajustes; compromiso privado mucho menor. Riesgo medio: rasterizado a CPU y posible impacto en vídeo/futuros lienzos y animaciones. No aplicarlo por defecto a partir de este servidor.

2. **No adoptar los flags adicionales de GPU por unos MiB**, ni renderer-process-limit/MediaRouter/media keys: el renderer ya es único y las diferencias pequeñas no demuestran una mejora repetible. Ninguna variante consigue cero procesos GPU.

3. **Arranque: investigar integridad en un diseño aparte**, sin omitirla. El bloque medido es una cota de trabajo presente, no ahorro garantizado; mtime+tamaño no acreditan integridad. Evitar el primer recorrido solo puede recuperar su pequeño coste, no todo el hash.

4. **Perfilar imports iniciales**, sin repetir una migración general a lazy-load que ya existe. Carga→DOM incluye más que parseo JS; falta atribución para prometer un ahorro. El heap ya está bajo 60 MiB.

5. **No justificar todavía un snapshot V8 propio ni mostrar una ventana vacía antes.** La traza completa y un perfil persistente deben demostrar un coste relevante; adelantar “visible” no garantiza adelantar interactividad.

## Método y límites

Cada experimento completo tiene cinco pares A/B alternados, perfiles nuevos, mismo equipo y ASAR por pareja, Ajustes y luego Inicio. Tres segundos de estabilización y cinco de CPU por vista. La medida de CPU pertenece a toda la familia y se expresa como porcentaje de un núcleo. No son cinco arranques fríos certificados: hay caché natural de Windows. El servidor es compartido y ruidoso.

No hubo compilación propia durante las medidas; **no quedó registrado el estado global de la cola durante las cinco series anteriores al reinicio**, así que no se certifica ausencia de carga ajena. Los resultados son exploratorios; el bloqueo actual impide una comparación controlada posterior. Se publican rangos y MAD, sin escoger el mejor lanzamiento ni ocultar extremos. Algunas ventanas no consiguieron primer plano y ese dato queda en bruto.

Sandbox, contextIsolation, CSP, navegación, fuses, locales e integridad de ASAR/manifiesto se conservan. No se añade red externa, cuentas reales, dependencias ni una nueva configuración de producto. El banco deniega peticiones externas y comprueba cero intentos. Cero supervivientes en los 50 arranques válidos de las cinco series; los fallos y pilotos se excluyen. La revisión nueva del banco espera además la salida de descendientes por handles (máximo 5 s) y mantiene la guarda de cero, para no confundir salida del padre con finalización del cierre del Job Object.

[Tablas completas, dispersión, CPU, procesos y exclusiones](RESULTADOS-N5.md). Datos: statistics.json, startup-phases.json, bundle-analysis.json y paired-*/samples.json; cada provenance.json identifica generación, binarios, hashes del banco y orden. Se conserva el log del reinicio y cada intento fallido. La rama de respaldo es vantareapp/isa-1995-medicion-2; sin PR de optimización ni merge.

### Ejecuciones excluidas

- paired-hardware-off-4ed8aec3: incomplete series.
- paired-media-router-off-2d7364a0: incomplete series.
- paired-trace-1ce564c3: incomplete series.
- paired-trace-1de26582: incomplete series.
- paired-trace-4758f33d: incomplete series.
- paired-trace-61887605: incomplete series.
- paired-trace-d2775be4: incomplete series.
- paired-trace-e4075fa4: incomplete series.
- pilot-hardware-off-48769692: incomplete series.
- pilot-hardware-off-f11da39a: pilot, not N=5.
- pilot-trace-d570cfc4: pilot, not N=5.
- pilot-trace-e496fce8: incomplete series.
