# Resultados Release v3 — 10 de noviembre de 2026

## Referencia exacta de nightly

Ejecutables compilados desde **acc6619b1eb34b39bb4367c066f33d03b5492d9b**, limpios,
Release `opt-level=3`, `lto=false`, `codegen-units=16`, `debug=false`, feature
`paint-stats`. Colector uniforme **835783d259919ef2f305d90e077d3a230858d40b**.
Cinco pasadas alternadas por configuración, 30 observaciones completas. La memoria
de referencia es working set; la privada incluye el buffer reservado de traza.

| Widgets | Fases | Ciclos UI/s: mediana [mín.–máx.] | Working set medio: mediana MiB |
|---|---|---:|---:|
| 1 | No | 18.796.526 [18.012.046–19.281.574] | 44,74 |
| 1 | Sí | 18.871.820 [18.302.294–19.523.552] | 44,82 |
| 4 | No | 123.723.435 [122.000.006–132.608.305] | 45,59 |
| 4 | Sí | 127.670.824 [119.285.447–134.269.946] | 46,63 |
| 22 | No | 220.025.608 [215.505.019–241.868.045] | 48,29 |
| 22 | Sí | 221.636.638 [218.404.519–226.655.989] | 51,67 |

Con 22 widgets y sin fases: mediana 21,21 presents/s, p99 entre presents
93,23 ms, latencia local recepción→retorno de Present 21,45 ms, motor GPU más
ocupado 2,159 %, VRAM dedicada 33,34 MiB. Con un widget quieto: cero presents/s.
La cadencia de la grabación determina estos intervalos: no prueban rapidez del
motor. GPU/DWM proceden de la sesión remota de 59 Hz y son contexto. VRR sigue
sin verificar; la prueba física está aplazada por Isaac y no bloquea preparar
el procedimiento. Sí bloquea la aprobación final de compatibilidad VRR.

[baseline-acc6619b1.json](baseline-acc6619b1.json) contiene las cinco pasadas,
medianas/rangos, fases, DWM, hashes y procedencia. Datos brutos en
`D:\VantareServer\evidence\isa-1996\release-baseline-acc6619b1-v3-attempt3`.
Los intentos previos fallidos no se reutilizaron.

## Coste del muestreo: control pareado real

24/24 observaciones, seis rondas ABBA/BAAB, mismo ejecutable A, Full frente a
Light. Prioridad AboveNormal, afinidad 240, plan Sapphire, fases desactivadas,
22 widgets y cadencia normal. Colector **14fa0dd6785691fdcb72d5efbe314a25c5983401**.

Ratio Light/Full geométrico **0,980906**, IC t95 **[0,936635–1,027271]**; mediana
0,975456, rango 0,919677–1,051184, CV de ratios **4,4167 %**. No demuestra una
diferencia ni permite afirmar coste cero. Es informativo y no cambia la métrica
principal del estudio de motores, que permanece con Full.
[sampler-overhead.json](sampler-overhead.json) conserva cada ratio, tiempos
estables, coste directo del colector y procedencia. Brutos en
`D:\VantareServer\evidence\isa-1996\sampler-overhead-v3-attempt2`.

## Comparación GPUI actual → Kit/Pre: bloqueada

Métrica predeclarada: ciclos UI/s en ventana estable, 22 widgets, cadencia
normal, sin fases, ocho rondas completas A/A–A/B intercaladas. Umbral A/A
**2,5 %**, sin relajar. A: fuente **835783d25**; B: **0d8dd4bca**; mismo Core
acc6619b1, mismas opciones Release y capacidades de instrumentación.

| Intento | Observaciones válidas / 64 | Resultado |
|---|---:|---|
| 1 | 5 | Timeout al salir B; traza completa. No se reutiliza. |
| 2 | 38 | Cargo activo sin argumentos verificables durante una captura; descartada. |
| 3 | 4 | Primera captura A/B: 3.550/3.839 eventos; reproducción incompleta, descartada. |

El intento 2 ya tenía un bloque A/A con ratio **1,029647** (+2,965 %), fuera
del gate. En el último intento se fijó una CPU lógica (máscara 16) para reducir
migraciones, manteniendo el resto del método. Su único bloque A/A completo
dio ratio **1,054841** (+5,484 %), CV entre sus cuatro observaciones **4,9383 %**.
No resolvió el ruido. No hay ocho rondas completas, intervalo de campaña ni
ratio A/B válido. Estos bloques parciales son diagnóstico y no se combinan
entre intentos. Tampoco establecen un suelo estadístico definitivo de ruido.

La primera captura A/B del último intento cerró el Core en la posición de
grabación **56,467 s**, con `trace_end events=3550`. La causa precisa del retraso
no está demostrada. No se cambió la validación para aceptar una traza truncada.
El registro agotó sus **tres intentos**: no se inicia un cuarto ni otra familia
para eludirlo. Se necesita resolver la captura completa y reservar una ventana
de servidor sin compilaciones antes de autorizar otro protocolo de medición.

[engine-attempts-diagnostic.json](engine-attempts-diagnostic.json) publica cada
bloque A/A completo por separado, costes, tiempos y fuentes.
[attempts.jsonl](attempts.jsonl) conserva todos los intentos y motivos,
incluidos los fallidos de referencia y control. Brutos en
`D:\VantareServer\evidence\isa-1996\kit-vs-native-v3-attempt{1,2,3}`.

| Paso | Antes → después verificable |
|---|---|
| Referencia | Dev retirado → Release exacto de nightly, 30/30 observaciones |
| Método | Una pasada → ocho rondas previstas con control A/A y límite de intentos; estudio completo pendiente |
| Muestreo | Coste desconocido → control pareado real publicado; IC incluye 1 |
| Kit/Pre | Comparación pendiente → sigue sin ratio válido; no se acepta una ganancia |
| gpui-fast | Pendiente: no se avanza sin comparación válida de Kit/Pre |
| Captura visual / VRR | Procedimiento preparado; validación física VRR aplazada |

Los pilotos de estrés A/B superaron 2.200 llamadas Present/s y comprobaron las
consultas D3D11 sin muestras disjoint. Son una prueba funcional por motor, no
una campaña estadística ni frecuencia física de pantalla. La CI de ambos PR
estaba verde antes de publicar este informe; el estado del nuevo HEAD se debe
verificar por separado. No hubo merge, release ni ejecución en el PC de juego.
