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
| hardware-off-no-gpu | 390,07 [387,32–501,78]; MAD 2,75 → 359,12 [358,07–362,48]; MAD 1,05 | -31,06 [-139,29–-28,20]; MAD 2,86 | 2041,24 [1137,89–2647,16]; MAD 116,40 → 2398,98 [1372,58–3866,97]; MAD 884,70 | 252,41 [-552,26–1825,73]; MAD 804,66 | 1 → 1 |
| media-keys-off | 389,50 [387,70–390,60]; MAD 0,50 → 387,91 [385,71–394,87]; MAD 1,34 | -1,45 [-2,30–4,87]; MAD 0,55 | 894,20 [862,97–1132,12]; MAD 12,98 → 841,93 [809,75–1162,22]; MAD 32,18 | -50,06 [-290,19–257,46]; MAD 234,90 | 1 → 1 |
| media-router-off | 388,33 [383,26–391,83]; MAD 3,01 → 389,97 [388,76–415,04]; MAD 1,21 | 0,43 [-1,66–26,84]; MAD 2,10 | 1033,79 [837,32–8125,99]; MAD 196,47 → 1139,32 [896,56–3985,64]; MAD 217,18 | 84,83 [-6847,05–1545,86]; MAD 104,00 | 1 → 1 |
| renderer-limit | 387,72 [372,97–394,30]; MAD 1,50 → 388,93 [383,11–394,78]; MAD 2,44 | 1,20 [-5,82–18,39]; MAD 0,74 | 1316,66 [813,14–2246,76]; MAD 275,70 → 1333,24 [857,58–1502,16]; MAD 119,77 | 16,57 [-1024,74–408,34]; MAD 106,77 | 1 → 1 |

## Memoria, CPU y heap

| Opción / condición | Vista | WS MiB | Privada comprometida MiB | Privada residente MiB | Heap JS usado MiB | CPU % un núcleo |
| --- | --- | --- | --- | --- | --- | --- |
| hardware-off / baseline | settings | 392,86 [385,20–398,00]; MAD 5,14 | 360,30 [232,61–367,93]; MAD 2,92 | 159,44 [152,76–162,91]; MAD 2,35 | 8,68 [7,84–8,73]; MAD 0,02 | 0,00 [0,00–0,00]; MAD 0,00 |
| hardware-off / baseline | home | 405,92 [400,37–410,28]; MAD 0,87 | 378,25 [374,16–380,32]; MAD 2,06 | 170,87 [167,93–173,38]; MAD 1,61 | 7,98 [7,95–9,36]; MAD 0,02 | 0,00 [0,00–0,00]; MAD 0,00 |
| hardware-off / variant | settings | 366,66 [361,31–398,73]; MAD 5,35 | 140,83 [137,21–142,54]; MAD 1,71 | 109,18 [105,48–110,54]; MAD 1,36 | 8,74 [8,70–9,54]; MAD 0,04 | 0,00 [0,00–0,31]; MAD 0,00 |
| hardware-off / variant | home | 365,84 [364,41–396,99]; MAD 1,43 | 149,78 [145,31–151,54]; MAD 1,27 | 117,45 [112,72–117,77]; MAD 0,32 | 7,98 [7,93–8,16]; MAD 0,05 | 0,00 [0,00–0,00]; MAD 0,00 |
| hardware-off-no-gpu / baseline | settings | 390,07 [387,32–501,78]; MAD 2,75 | 361,87 [360,86–446,93]; MAD 1,02 | 157,66 [157,29–209,12]; MAD 0,38 | 8,73 [7,61–8,75]; MAD 0,02 | 0,00 [0,00–0,61]; MAD 0,00 |
| hardware-off-no-gpu / baseline | home | 403,27 [399,49–514,96]; MAD 3,78 | 376,46 [373,77–454,03]; MAD 2,27 | 170,28 [167,32–218,80]; MAD 1,28 | 7,95 [6,09–8,00]; MAD 0,05 | 0,00 [0,00–0,30]; MAD 0,00 |
| hardware-off-no-gpu / variant | settings | 359,12 [358,07–362,48]; MAD 1,05 | 135,97 [134,56–139,36]; MAD 0,32 | 105,09 [103,65–108,79]; MAD 0,18 | 8,72 [8,72–9,59]; MAD 0,01 | 0,00 [0,00–0,30]; MAD 0,00 |
| hardware-off-no-gpu / variant | home | 360,41 [357,41–363,78]; MAD 1,97 | 146,41 [142,27–149,35]; MAD 1,67 | 115,00 [111,51–118,81]; MAD 1,69 | 7,94 [6,10–8,16]; MAD 0,23 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-keys-off / baseline | settings | 389,50 [387,70–390,60]; MAD 0,50 | 364,19 [355,86–365,62]; MAD 1,13 | 159,50 [157,55–160,37]; MAD 0,71 | 8,75 [8,60–9,65]; MAD 0,15 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-keys-off / baseline | home | 401,16 [399,65–403,06]; MAD 1,31 | 374,71 [371,23–378,51]; MAD 2,54 | 168,10 [166,94–170,29]; MAD 1,16 | 7,98 [7,89–8,64]; MAD 0,09 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-keys-off / variant | settings | 387,91 [385,71–394,87]; MAD 1,34 | 363,08 [360,00–370,34]; MAD 2,11 | 157,80 [155,69–162,89]; MAD 1,41 | 8,72 [8,66–9,65]; MAD 0,06 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-keys-off / variant | home | 402,32 [400,18–407,00]; MAD 1,60 | 375,29 [372,67–383,48]; MAD 1,61 | 169,66 [167,38–172,55]; MAD 1,57 | 7,99 [7,95–8,70]; MAD 0,04 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-router-off / baseline | settings | 388,33 [383,26–391,83]; MAD 3,01 | 361,62 [229,96–368,38]; MAD 5,64 | 157,98 [153,09–161,16]; MAD 2,35 | 9,15 [8,71–9,56]; MAD 0,40 | 0,00 [0,00–0,27]; MAD 0,00 |
| media-router-off / baseline | home | 404,58 [401,41–405,32]; MAD 0,74 | 376,48 [375,97–381,43]; MAD 0,51 | 171,26 [167,54–172,68]; MAD 0,80 | 8,10 [7,91–8,78]; MAD 0,18 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-router-off / variant | settings | 389,97 [388,76–415,04]; MAD 1,21 | 361,19 [358,58–363,96]; MAD 0,79 | 159,64 [155,97–160,18]; MAD 0,55 | 8,70 [8,40–8,73]; MAD 0,03 | 0,00 [0,00–0,00]; MAD 0,00 |
| media-router-off / variant | home | 403,38 [393,69–428,58]; MAD 2,95 | 371,85 [234,18–379,47]; MAD 5,31 | 167,56 [161,23–170,99]; MAD 3,21 | 7,96 [7,91–9,93]; MAD 0,01 | 0,00 [0,00–0,00]; MAD 0,00 |
| renderer-limit / baseline | settings | 387,72 [372,97–394,30]; MAD 1,50 | 360,16 [208,00–363,57]; MAD 2,82 | 156,17 [144,23–158,22]; MAD 1,38 | 9,09 [8,69–9,68]; MAD 0,37 | 0,00 [0,00–0,00]; MAD 0,00 |
| renderer-limit / baseline | home | 401,83 [398,65–409,42]; MAD 2,80 | 373,69 [372,61–377,39]; MAD 1,09 | 167,75 [167,45–169,93]; MAD 0,30 | 8,54 [6,10–8,81]; MAD 0,27 | 0,00 [0,00–0,92]; MAD 0,00 |
| renderer-limit / variant | settings | 388,93 [383,11–394,78]; MAD 2,44 | 361,97 [359,35–403,99]; MAD 2,62 | 158,94 [154,32–162,78]; MAD 2,72 | 8,72 [8,68–9,79]; MAD 0,03 | 0,00 [0,00–0,00]; MAD 0,00 |
| renderer-limit / variant | home | 403,51 [398,40–405,43]; MAD 1,21 | 376,32 [239,53–380,61]; MAD 0,47 | 170,16 [167,08–172,54]; MAD 0,75 | 7,97 [7,91–8,75]; MAD 0,07 | 0,00 [0,00–0,00]; MAD 0,00 |

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
| hardware-off-no-gpu / baseline | settings | host | 8,73 [8,70–8,76]; MAD 0,02 | 1,64 [1,59–1,66]; MAD 0,02 |
| hardware-off-no-gpu / baseline | settings | main | 103,84 [102,39–210,60]; MAD 1,25 | 48,54 [48,04–123,61]; MAD 0,50 |
| hardware-off-no-gpu / baseline | settings | gpu-process | 127,77 [127,28–130,45]; MAD 0,27 | 247,59 [246,41–251,20]; MAD 0,51 |
| hardware-off-no-gpu / baseline | settings | utility | 43,45 [43,07–44,51]; MAD 0,16 | 11,25 [11,16–11,43]; MAD 0,09 |
| hardware-off-no-gpu / baseline | settings | renderer | 105,65 [104,84–111,58]; MAD 0,81 | 53,22 [51,37–59,26]; MAD 0,64 |
| hardware-off-no-gpu / baseline | home | host | 8,85 [8,82–8,89]; MAD 0,01 | 1,66 [1,62–1,74]; MAD 0,04 |
| hardware-off-no-gpu / baseline | home | main | 104,03 [100,55–212,19]; MAD 0,95 | 48,21 [45,98–124,80]; MAD 0,85 |
| hardware-off-no-gpu / baseline | home | gpu-process | 134,71 [134,55–138,77]; MAD 0,16 | 255,96 [255,31–256,53]; MAD 0,13 |
| hardware-off-no-gpu / baseline | home | utility | 43,50 [43,35–44,53]; MAD 0,09 | 11,30 [11,18–11,44]; MAD 0,09 |
| hardware-off-no-gpu / baseline | home | renderer | 112,33 [111,64–116,33]; MAD 0,69 | 58,72 [57,22–60,91]; MAD 1,50 |
| hardware-off-no-gpu / variant | settings | host | 8,71 [8,66–8,72]; MAD 0,02 | 1,61 [1,57–1,62]; MAD 0,01 |
| hardware-off-no-gpu / variant | settings | main | 101,46 [99,34–103,05]; MAD 0,89 | 47,13 [45,46–48,14]; MAD 0,64 |
| hardware-off-no-gpu / variant | settings | gpu-process | 78,16 [77,89–78,45]; MAD 0,27 | 17,57 [17,55–17,63]; MAD 0,02 |
| hardware-off-no-gpu / variant | settings | utility | 43,39 [43,29–43,49]; MAD 0,07 | 11,34 [11,25–11,39]; MAD 0,05 |
| hardware-off-no-gpu / variant | settings | renderer | 127,16 [126,56–131,46]; MAD 0,60 | 57,50 [57,23–61,81]; MAD 0,27 |
| hardware-off-no-gpu / variant | home | host | 8,84 [8,79–8,84]; MAD 0,00 | 1,64 [1,60–1,66]; MAD 0,02 |
| hardware-off-no-gpu / variant | home | main | 102,14 [100,78–103,48]; MAD 1,11 | 46,93 [46,45–47,85]; MAD 0,48 |
| hardware-off-no-gpu / variant | home | gpu-process | 72,69 [72,25–73,00]; MAD 0,18 | 17,64 [17,58–17,68]; MAD 0,04 |
| hardware-off-no-gpu / variant | home | utility | 43,46 [43,35–43,56]; MAD 0,05 | 11,34 [11,30–11,48]; MAD 0,04 |
| hardware-off-no-gpu / variant | home | renderer | 134,80 [131,11–137,09]; MAD 2,29 | 69,39 [64,59–70,98]; MAD 1,59 |
| media-keys-off / baseline | settings | host | 8,71 [8,67–8,73]; MAD 0,00 | 1,62 [1,58–1,64]; MAD 0,01 |
| media-keys-off / baseline | settings | main | 103,95 [103,05–106,60]; MAD 0,75 | 48,16 [47,43–51,13]; MAD 0,73 |
| media-keys-off / baseline | settings | gpu-process | 127,82 [127,70–128,11]; MAD 0,12 | 247,57 [242,75–250,96]; MAD 3,09 |
| media-keys-off / baseline | settings | utility | 43,29 [43,16–43,40]; MAD 0,10 | 11,20 [11,14–11,44]; MAD 0,05 |
| media-keys-off / baseline | settings | renderer | 105,53 [103,34–106,71]; MAD 1,16 | 53,68 [51,57–54,89]; MAD 1,21 |
| media-keys-off / baseline | home | host | 8,86 [8,83–8,87]; MAD 0,02 | 1,67 [1,64–1,69]; MAD 0,02 |
| media-keys-off / baseline | home | main | 102,55 [102,29–105,38]; MAD 0,17 | 46,29 [45,87–49,23]; MAD 0,42 |
| media-keys-off / baseline | home | gpu-process | 134,66 [134,53–134,95]; MAD 0,13 | 258,39 [254,55–260,06]; MAD 1,67 |
| media-keys-off / baseline | home | utility | 43,41 [43,28–43,50]; MAD 0,09 | 11,30 [11,17–11,45]; MAD 0,02 |
| media-keys-off / baseline | home | renderer | 111,25 [110,42–113,09]; MAD 0,79 | 57,11 [56,75–59,79]; MAD 0,36 |
| media-keys-off / variant | settings | host | 8,70 [8,68–8,73]; MAD 0,02 | 1,61 [1,61–1,64]; MAD 0,01 |
| media-keys-off / variant | settings | main | 103,60 [101,27–106,52]; MAD 1,08 | 48,20 [45,42–50,87]; MAD 0,90 |
| media-keys-off / variant | settings | gpu-process | 127,57 [126,91–128,14]; MAD 0,40 | 248,84 [247,60–251,92]; MAD 1,24 |
| media-keys-off / variant | settings | utility | 43,36 [43,12–43,39]; MAD 0,04 | 11,29 [11,12–11,31]; MAD 0,03 |
| media-keys-off / variant | settings | renderer | 104,41 [104,18–108,12]; MAD 0,23 | 54,27 [51,46–54,65]; MAD 0,38 |
| media-keys-off / variant | home | host | 8,85 [8,83–8,86]; MAD 0,01 | 1,67 [1,65–1,69]; MAD 0,02 |
| media-keys-off / variant | home | main | 102,79 [102,37–106,22]; MAD 0,42 | 46,55 [46,28–50,34]; MAD 0,27 |
| media-keys-off / variant | home | gpu-process | 134,67 [134,10–135,11]; MAD 0,09 | 256,19 [253,74–261,32]; MAD 1,88 |
| media-keys-off / variant | home | utility | 43,45 [43,18–43,49]; MAD 0,05 | 11,33 [11,19–11,38]; MAD 0,05 |
| media-keys-off / variant | home | renderer | 111,03 [110,46–113,34]; MAD 0,56 | 58,79 [57,29–59,99]; MAD 0,46 |
| media-router-off / baseline | settings | host | 8,73 [8,66–8,73]; MAD 0,01 | 1,62 [1,55–1,69]; MAD 0,02 |
| media-router-off / baseline | settings | main | 104,70 [102,51–106,87]; MAD 1,08 | 49,23 [46,64–51,52]; MAD 1,23 |
| media-router-off / baseline | settings | gpu-process | 127,71 [121,59–128,13]; MAD 0,42 | 248,39 [115,24–251,16]; MAD 2,75 |
| media-router-off / baseline | settings | utility | 43,34 [43,29–43,36]; MAD 0,02 | 11,34 [11,22–11,39]; MAD 0,04 |
| media-router-off / baseline | settings | renderer | 104,84 [102,73–109,71]; MAD 1,44 | 51,15 [50,21–57,64]; MAD 0,94 |
| media-router-off / baseline | home | host | 8,84 [8,78–8,84]; MAD 0,01 | 1,65 [1,59–1,66]; MAD 0,01 |
| media-router-off / baseline | home | main | 105,37 [103,01–105,69]; MAD 0,32 | 49,13 [47,07–49,95]; MAD 0,81 |
| media-router-off / baseline | home | gpu-process | 134,83 [134,27–136,26]; MAD 0,48 | 257,37 [255,05–259,75]; MAD 1,73 |
| media-router-off / baseline | home | utility | 43,38 [43,33–43,45]; MAD 0,03 | 11,36 [11,23–11,40]; MAD 0,04 |
| media-router-off / baseline | home | renderer | 111,88 [110,59–114,23]; MAD 0,68 | 57,22 [57,05–61,11]; MAD 0,17 |
| media-router-off / variant | settings | host | 8,71 [8,67–8,73]; MAD 0,02 | 1,63 [1,55–1,63]; MAD 0,00 |
| media-router-off / variant | settings | main | 103,81 [103,26–109,47]; MAD 0,55 | 48,02 [45,38–51,11]; MAD 1,01 |
| media-router-off / variant | settings | gpu-process | 128,13 [127,26–128,77]; MAD 0,56 | 247,50 [242,11–248,49]; MAD 0,99 |
| media-router-off / variant | settings | utility | 43,26 [43,14–54,33]; MAD 0,11 | 11,14 [11,10–11,35]; MAD 0,05 |
| media-router-off / variant | settings | renderer | 107,19 [103,77–114,22]; MAD 2,82 | 54,73 [51,66–55,23]; MAD 0,50 |
| media-router-off / variant | home | host | 8,83 [8,80–8,86]; MAD 0,03 | 1,64 [1,60–1,68]; MAD 0,04 |
| media-router-off / variant | home | main | 103,12 [102,30–110,87]; MAD 0,82 | 46,44 [46,29–49,48]; MAD 0,15 |
| media-router-off / variant | home | gpu-process | 134,96 [126,13–135,18]; MAD 0,04 | 255,46 [114,91–257,95]; MAD 1,78 |
| media-router-off / variant | home | utility | 43,36 [43,30–54,50]; MAD 0,05 | 11,31 [11,12–11,36]; MAD 0,04 |
| media-router-off / variant | home | renderer | 113,13 [110,26–119,45]; MAD 2,53 | 58,87 [56,42–60,29]; MAD 1,42 |
| renderer-limit / baseline | settings | host | 8,68 [8,65–8,72]; MAD 0,03 | 1,57 [1,53–1,63]; MAD 0,04 |
| renderer-limit / baseline | settings | main | 101,90 [100,48–104,14]; MAD 1,29 | 47,10 [46,14–47,95]; MAD 0,57 |
| renderer-limit / baseline | settings | gpu-process | 127,28 [119,66–131,13]; MAD 0,57 | 247,54 [101,11–250,07]; MAD 2,03 |
| renderer-limit / baseline | settings | utility | 43,35 [43,24–44,55]; MAD 0,11 | 11,30 [11,16–11,37]; MAD 0,07 |
| renderer-limit / baseline | settings | renderer | 105,19 [100,67–107,65]; MAD 0,63 | 51,71 [47,77–53,71]; MAD 1,25 |
| renderer-limit / baseline | home | host | 8,86 [8,81–8,87]; MAD 0,01 | 1,67 [1,61–1,69]; MAD 0,02 |
| renderer-limit / baseline | home | main | 102,97 [100,79–105,04]; MAD 1,80 | 47,02 [46,21–48,82]; MAD 0,82 |
| renderer-limit / baseline | home | gpu-process | 134,76 [134,37–138,35]; MAD 0,16 | 257,46 [255,21–258,09]; MAD 0,62 |
| renderer-limit / baseline | home | utility | 43,43 [43,30–44,57]; MAD 0,13 | 11,29 [11,16–11,38]; MAD 0,09 |
| renderer-limit / baseline | home | renderer | 112,20 [110,46–112,75]; MAD 0,55 | 57,41 [57,18–58,21]; MAD 0,08 |
| renderer-limit / variant | settings | host | 8,70 [8,63–8,73]; MAD 0,00 | 1,61 [1,52–1,64]; MAD 0,01 |
| renderer-limit / variant | settings | main | 101,71 [99,91–106,59]; MAD 1,37 | 47,63 [45,50–50,74]; MAD 0,88 |
| renderer-limit / variant | settings | gpu-process | 127,35 [126,79–129,84]; MAD 0,54 | 249,30 [243,36–287,87]; MAD 2,30 |
| renderer-limit / variant | settings | utility | 43,39 [43,22–43,46]; MAD 0,07 | 11,27 [11,13–11,38]; MAD 0,11 |
| renderer-limit / variant | settings | renderer | 108,08 [104,31–108,88]; MAD 0,80 | 54,46 [52,38–55,80]; MAD 1,34 |
| renderer-limit / variant | home | host | 8,84 [8,75–8,86]; MAD 0,02 | 1,66 [1,55–1,67]; MAD 0,02 |
| renderer-limit / variant | home | main | 103,25 [101,48–105,22]; MAD 1,63 | 49,06 [46,75–49,51]; MAD 0,45 |
| renderer-limit / variant | home | gpu-process | 134,49 [133,66–135,63]; MAD 0,70 | 255,93 [122,92–259,16]; MAD 1,46 |
| renderer-limit / variant | home | utility | 43,42 [43,30–43,47]; MAD 0,05 | 11,25 [11,21–11,39]; MAD 0,01 |
| renderer-limit / variant | home | renderer | 113,51 [111,00–114,88]; MAD 1,37 | 58,38 [56,94–60,58]; MAD 0,91 |

## Fluidez: ejercicio reproducible, no juicio humano

Después de las medidas de reposo a 1440×900, se redimensiona a 1440×720 para que Apariencia tenga desplazamiento real. Se ejecutan tres scrolls suaves y dos cambios del raíl. Los intervalos de callback rAF no son FPS presentados por el compositor; este servidor remoto no permite certificar fluidez percibida. Las capturas nativas y los desplazamientos medidos descartan una ventana negra o un scroll que no se movió. No se vende una mejora de memoria si la vista no se pinta.

| Opción | p95 intervalo callback scroll ms A → B | Duración total de scroll ms A → B |
| --- | --- | --- |
| hardware-off | 17,30 [16,90–75,90]; MAD 0,40 → 17,60 [17,50–18,10]; MAD 0,10 | 409,90 [402,20–417,00]; MAD 4,70 → 406,40 [402,20–408,40]; MAD 1,90 |
| hardware-off-no-gpu | 67,90 [17,00–72,50]; MAD 4,60 → 17,70 [17,40–18,10]; MAD 0,10 | 419,80 [404,20–421,00]; MAD 1,20 → 395,40 [393,30–401,20]; MAD 2,10 |
| media-keys-off | 17,10 [16,80–17,70]; MAD 0,30 → 17,10 [16,80–24,00]; MAD 0,30 | 405,20 [404,70–410,50]; MAD 0,50 → 407,00 [394,80–416,20]; MAD 0,80 |
| media-router-off | 17,60 [17,00–75,60]; MAD 0,60 → 69,30 [17,20–75,00]; MAD 5,70 | 410,90 [404,40–418,60]; MAD 6,50 → 415,40 [409,60–419,50]; MAD 0,80 |
| renderer-limit | 17,00 [16,80–73,20]; MAD 0,20 → 17,20 [16,90–18,70]; MAD 0,20 | 409,30 [406,60–422,40]; MAD 1,10 → 411,90 [405,40–424,10]; MAD 6,30 |

## Coste de integridad

| Opción | Inventario + hash ms A → B | Primer recorrido ms A → B | Verificación/hash ms A → B |
| --- | --- | --- | --- |
| hardware-off | 370,94 [354,40–440,32]; MAD 16,54 → 384,42 [354,71–471,85]; MAD 20,86 | 7,72 [7,13–10,90]; MAD 0,59 → 7,36 [6,73–18,75]; MAD 0,63 | 363,22 [347,28–430,36]; MAD 15,94 → 377,69 [347,36–453,10]; MAD 21,06 |
| hardware-off-no-gpu | 371,50 [355,75–448,92]; MAD 7,82 → 439,47 [367,06–542,52]; MAD 43,24 | 7,31 [6,64–10,22]; MAD 0,54 → 9,74 [6,89–11,19]; MAD 1,45 | 364,86 [348,99–438,70]; MAD 8,95 → 429,07 [357,32–531,34]; MAD 40,14 |
| media-keys-off | 361,59 [355,64–383,20]; MAD 0,98 → 356,67 [351,44–390,95]; MAD 4,45 | 7,09 [6,76–9,02]; MAD 0,33 → 6,81 [6,57–8,46]; MAD 0,21 | 354,35 [348,55–375,44]; MAD 0,81 → 349,82 [344,62–382,49]; MAD 4,69 |
| media-router-off | 365,68 [354,20–423,63]; MAD 11,48 → 389,36 [363,53–504,55]; MAD 10,97 | 7,44 [6,68–8,90]; MAD 0,25 → 8,02 [7,00–10,03]; MAD 1,02 | 358,17 [347,52–414,73]; MAD 10,65 → 381,35 [356,53–495,46]; MAD 10,33 |
| renderer-limit | 355,96 [352,34–613,10]; MAD 3,62 → 359,31 [356,73–518,23]; MAD 2,58 | 7,19 [6,65–11,07]; MAD 0,54 → 9,69 [6,65–10,68]; MAD 0,99 | 349,25 [345,69–602,02]; MAD 3,56 → 350,54 [349,49–507,55]; MAD 1,04 |

## Trazabilidad y exclusiones

Datos crudos, hashes del banco, generación, versión de Node, memoria libre inicial y orden de cada pareja están en `paired-*/provenance.json`, `samples.json` y JSON por vista. `statistics.json` incluye todas las series completas N=5 y excluye pilotos/series interrumpidas; no se escoge el mejor resultado.

- paired-hardware-off-4ed8aec3: incomplete series.
- paired-media-router-off-2d7364a0: incomplete series.
- pilot-hardware-off-48769692: incomplete series.
- pilot-hardware-off-f11da39a: pilot, not N=5.
- pilot-trace-d570cfc4: pilot, not N=5.
- pilot-trace-e496fce8: incomplete series.
