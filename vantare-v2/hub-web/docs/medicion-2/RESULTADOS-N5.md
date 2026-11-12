# Medición-2 · experimentos de memoria y arranque

VANTA-138 · #1995. Solo QA. Ningún valor por defecto del producto, instalador, supervisor ni paquete distribuido cambia. No hay cuentas ni servicios reales ni dependencias nuevas.

## Método y límites

Se reutiliza el candidato de medición-1: UI `9401501ea38f2e8fe65584511f27844c7efd157a`, Electron 45.2.3 y anfitrión Release. Cada condición usa el mismo ASAR instrumentado y la misma integridad sellada; solo cambia una opción cerrada en datos QA. Sandbox, CSP, contextIsolation, navegación, siete fuses e inventario siguen activos. El banco deniega red externa y comprueba que no hubo intentos. Los servicios son dobles locales.

Cinco pares por experimento, orden A/B alternado (y primer orden alternado entre experimentos), perfiles nuevos, mismo equipo, caché natural de Windows. No son cinco arranques fríos certificados. Servidor compartido y ruidoso; no se ejecutan compilaciones propias y se mantiene captura.lock. Cada pareja mide Ajustes y después Inicio, tras 3 s de estabilización y 5 s de CPU. El control comprueba interacción real y capturas nativas no vacías. Tras cada cierre se exige cero procesos supervivientes.

Working set total suma páginas compartidas de varios procesos: no equivale a memoria física única. Se presenta también memoria privada comprometida y privada residente; no se cambia la métrica para aparentar cumplir 250 MiB. Heap usado proviene de Runtime.getHeapUsage del renderer real. CPU se expresa como porcentaje de un núcleo (no del total de la máquina).

Formato: mediana [mínimo–máximo]; MAD = desviación absoluta mediana. Las diferencias pareadas se calculan B−A de cada iteración; no equivalen necesariamente a restar medianas.

## Resultado por experimento

| Opción aislada | Ajustes WS MiB A → B | Δ pareada MiB | Ventana visible ms A → B | Δ pareada ms | GPU A → B |
| --- | --- | --- | --- | --- | --- |
| hardware-off | 392,86 [385,20–398,00]; MAD 5,14 → 366,66 [361,31–398,73]; MAD 5,35 | -26,42 [-36,69–13,53]; MAD 10,27 | 941,30 [807,01–3879,72]; MAD 134,29 → 990,21 [804,86–1845,43]; MAD 141,26 | -92,35 [-2034,30–183,20]; MAD 275,55 | 1 → 1 |

## Memoria, CPU y heap

| Opción / condición | Vista | WS MiB | Privada comprometida MiB | Privada residente MiB | Heap JS usado MiB | CPU % un núcleo |
| --- | --- | --- | --- | --- | --- | --- |
| hardware-off / baseline | settings | 392,86 [385,20–398,00]; MAD 5,14 | 360,30 [232,61–367,93]; MAD 2,92 | 159,44 [152,76–162,91]; MAD 2,35 | 8,68 [7,84–8,73]; MAD 0,02 | 0,00 [0,00–0,00]; MAD 0,00 |
| hardware-off / baseline | home | 405,92 [400,37–410,28]; MAD 0,87 | 378,25 [374,16–380,32]; MAD 2,06 | 170,87 [167,93–173,38]; MAD 1,61 | 7,98 [7,95–9,36]; MAD 0,02 | 0,00 [0,00–0,00]; MAD 0,00 |
| hardware-off / variant | settings | 366,66 [361,31–398,73]; MAD 5,35 | 140,83 [137,21–142,54]; MAD 1,71 | 109,18 [105,48–110,54]; MAD 1,36 | 8,74 [8,70–9,54]; MAD 0,04 | 0,00 [0,00–0,31]; MAD 0,00 |
| hardware-off / variant | home | 365,84 [364,41–396,99]; MAD 1,43 | 149,78 [145,31–151,54]; MAD 1,27 | 117,45 [112,72–117,77]; MAD 0,32 | 7,98 [7,93–8,16]; MAD 0,05 | 0,00 [0,00–0,00]; MAD 0,00 |

## Desglose por proceso

| Opción / condición | Vista | Proceso | WS MiB | Privada MiB |
| --- | --- | --- | --- | --- |
| hardware-off / baseline | settings | host | 8,71 [8,67–8,77]; MAD 0,02 | 1,61 [1,55–1,68]; MAD 0,02 |
| hardware-off / baseline | settings | main | 105,07 [103,84–106,20]; MAD 0,66 | 49,08 [47,77–50,66]; MAD 0,53 |
| hardware-off / baseline | settings | gpu-process | 127,23 [121,67–131,09]; MAD 0,29 | 245,57 [116,07–249,10]; MAD 1,39 |
| hardware-off / baseline | settings | utility | 43,25 [43,12–44,74]; MAD 0,13 | 11,18 [11,10–11,41]; MAD 0,02 |
| hardware-off / baseline | settings | renderer | 107,41 [104,21–109,21]; MAD 1,63 | 54,45 [52,08–55,77]; MAD 0,89 |
| hardware-off / baseline | home | host | 8,84 [8,81–8,89]; MAD 0,02 | 1,65 [1,60–1,71]; MAD 0,02 |
| hardware-off / baseline | home | main | 103,71 [102,91–106,30]; MAD 0,80 | 47,59 [45,95–50,11]; MAD 1,64 |
| hardware-off / baseline | home | gpu-process | 135,10 [134,63–138,14]; MAD 0,46 | 256,94 [256,39–259,50]; MAD 0,55 |
| hardware-off / baseline | home | utility | 43,36 [43,20–44,76]; MAD 0,16 | 11,19 [11,16–11,42]; MAD 0,04 |
| hardware-off / baseline | home | renderer | 113,28 [110,75–115,00]; MAD 1,72 | 59,56 [57,67–60,41]; MAD 0,86 |
| hardware-off / variant | settings | host | 8,70 [8,67–8,76]; MAD 0,03 | 1,61 [1,58–1,67]; MAD 0,03 |
| hardware-off / variant | settings | main | 105,00 [101,84–111,18]; MAD 2,35 | 47,91 [46,83–51,70]; MAD 1,08 |
| hardware-off / variant | settings | gpu-process | 80,29 [80,02–89,55]; MAD 0,27 | 19,66 [19,62–19,70]; MAD 0,04 |
| hardware-off / variant | settings | utility | 43,30 [43,19–54,61]; MAD 0,11 | 11,20 [11,11–11,33]; MAD 0,08 |
| hardware-off / variant | settings | renderer | 129,27 [127,18–134,69]; MAD 2,08 | 57,97 [57,93–62,32]; MAD 0,04 |
| hardware-off / variant | home | host | 8,84 [8,80–8,87]; MAD 0,01 | 1,67 [1,63–1,70]; MAD 0,02 |
| hardware-off / variant | home | main | 104,69 [103,18–110,39]; MAD 1,50 | 48,80 [47,15–50,11]; MAD 0,97 |
| hardware-off / variant | home | gpu-process | 75,15 [74,66–84,22]; MAD 0,50 | 19,73 [19,69–19,77]; MAD 0,02 |
| hardware-off / variant | home | utility | 43,38 [43,26–54,66]; MAD 0,12 | 11,21 [11,16–11,35]; MAD 0,06 |
| hardware-off / variant | home | renderer | 135,07 [133,74–138,89]; MAD 1,22 | 68,19 [65,36–68,66]; MAD 0,24 |

## Fluidez: ejercicio reproducible, no juicio humano

Después de las medidas de reposo a 1440×900, se redimensiona a 1440×720 para que Apariencia tenga desplazamiento real. Se ejecutan tres scrolls suaves y dos cambios del raíl. Los intervalos de callback rAF no son FPS presentados por el compositor; este servidor remoto no permite certificar fluidez percibida. Las capturas nativas y los desplazamientos medidos descartan una ventana negra o un scroll que no se movió. No se vende una mejora de memoria si la vista no se pinta.

| Opción | p95 intervalo callback scroll ms A → B | Duración total de scroll ms A → B |
| --- | --- | --- |
| hardware-off | 17,30 [16,90–75,90]; MAD 0,40 → 17,60 [17,50–18,10]; MAD 0,10 | 409,90 [402,20–417,00]; MAD 4,70 → 406,40 [402,20–408,40]; MAD 1,90 |

## Coste de integridad

| Opción | Inventario + hash ms A → B | Primer recorrido ms A → B | Verificación/hash ms A → B |
| --- | --- | --- | --- |
| hardware-off | 370,94 [354,40–440,32]; MAD 16,54 → 384,42 [354,71–471,85]; MAD 20,86 | 7,72 [7,13–10,90]; MAD 0,59 → 7,36 [6,73–18,75]; MAD 0,63 | 363,22 [347,28–430,36]; MAD 15,94 → 377,69 [347,36–453,10]; MAD 21,06 |

## Trazabilidad y exclusiones

Datos crudos, hashes del banco, generación, versión de Node, memoria libre inicial y orden de cada pareja están en `paired-*/provenance.json`, `samples.json` y JSON por vista. `statistics.json` incluye todas las series completas N=5 y excluye pilotos/series interrumpidas; no se escoge el mejor resultado.

- paired-hardware-off-4ed8aec3: incomplete series.
- pilot-hardware-off-48769692: incomplete series.
- pilot-hardware-off-f11da39a: pilot, not N=5.
- pilot-trace-d570cfc4: pilot, not N=5.
- pilot-trace-e496fce8: incomplete series.
