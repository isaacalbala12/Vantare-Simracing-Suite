# Medición Release v3 · VANTA-139

Estado: implementación y validación en curso. **Sin A/A real ni mejora de motor aceptados todavía.** Los tests sintéticos no son mediciones. Las pasadas de 5104 y las siete pasadas parciales con el colector v2 quedan como diagnóstico, no referencia final.

## Declaración previa y veredicto

La única métrica para decidir CPU de servidor es **ciclos de proceso UI por segundo estable**, con **22 widgets, cadencia original, fases desactivadas y colector completo**. El resto es informativo: ciclos/foto recibida, normalización por Present, memoria, componentes de render y estrés. No se escoge después el escenario favorable.

`verdict` es `improvement`, `regression`, `inconclusive` o `invalid_noise`; `accepted` indica solo que la afirmación de mejora CPU principal supera el criterio estadístico. **No aprueba el motor para el PC de juego**: el [gate VRR](VRR-GATE.md) queda separado y pendiente.

## Secuencia pareada

Ocho rondas como mínimo, pares hasta 24. Cada ronda intercala un bloque A/A y otro A/B; en rondas pares se invierte su orden. A/A usa el binario A en ambos papeles. Los bloques alternan **ABBA / BAAB** para compensar curvatura, además de la deriva lineal.

Cada observación arranca procesos nuevos. El instante de análisis es el **punto medio QPC de la ventana estable**, no la hora de invocación ni la espera de la cola. Se ajusta log(coste) por tiempo y pertenencia a B dentro de cada bloque. Con intervalos iguales, la razón es la media geométrica B dividida por A.

Se publican razones por ronda, mediana, rango, CV y un **intervalo t bilateral del 95 % sobre log-ratios**, con rondas completas como unidades; nunca frames como repeticiones. Los valores críticos provienen de [NIST](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm). Se necesitan estabilidad e independencia aproximada entre rondas; el intervalo no arregla cambios de entorno.

El máximo desvío logarítmico A/A conserva el límite **2,5 %**, sin relajarlo. Mejora exige intervalo A/B por debajo de 1 y efecto mayor que ese suelo; regresión usa el criterio simétrico. Si falla A/A, no hay afirmación comparativa válida. Ocho rondas dan 32 observaciones por experimento y permiten contrabalancear los dos órdenes; es un mínimo, no una promesa de potencia bajo cualquier ruido.

## Intentos, capacidades y entorno

`overlay-campaign-attempts.jsonl` registra inicio, configuración completa, fallos y final antes de medir. Hay **máximo tres intentos por familia**; repetir exige motivo previo. No hay reintentos automáticos ni se borran intentos fallidos. Cambiar prioridad/afinidad o cantidad de rondas debe quedar declarado y consume otro intento; no cambiar el nombre para resetear el límite.

Antes de cualquier observación se comprueban Release limpio, SHA, `PAINT_STATS` y **capacidades iguales de A/B**. Los hashes observados deben coincidir con la declaración. Se rechaza mezclar colector, configuración, núcleo o grabación.

Plan de energía registrado y comprobado sin cambios por pasada. Prioridad y afinidad son parámetros declarados (`Normal`, todos los procesadores, por defecto). Si el ruido no permite comparar, investigar frecuencia/carga, fijar afinidad o prioridad y repetir de forma limitada, conservando el suelo real. La cola está reservada durante cada medición; no se compila en paralelo con ella.

Un `cargo fmt` ajeno no es una compilación: se registra y se permite, manteniendo los controles de carga. El colector exige su propio worktree limpio y el mismo HEAD al principio y al final; una mutación propia invalida la observación. Se conservan los intentos anteriores abortados por la clasificación demasiado conservadora. Si otra captura ocupa el mutex visual, se liberan las reservas de compilación antes de esperar, con el mismo plazo máximo, y se vuelven a comprobar ambos recursos.

## Reproducción y estrés

Python **3.11+** y PowerShell 7. Desde `vantare-v2`, con ejecutables instrumentados congelados y una carpeta nueva:

```powershell
pwsh -NoProfile -File native/scripts/measure-overlay-ab.ps1 -ComparisonName kit-vs-native -A <A.exe> -B <B.exe> -Core <core-fijo.exe> -Recording testdata/rust-port/lmu47-high-rate-60s.tar.gz -Out <evidencia-nueva> -Widgets 22 -Rounds 8
```

`-Stress` invalida todos los widgets y la pantalla en cada oportunidad de dibujo, sin esperar la siguiente foto. Es **el peor caso sin caché de entidades**. Con la capacidad `render_load_uncapped`, el backend instrumentado omite `DwmFlush` y cede el turno al planificador sin temporizador: no impone la cadencia de telemetría ni la del compositor. Windows/GPU pueden limitar el resultado. El hilo de pulsos queda deliberadamente saturado y suma CPU del proceso; los spans CPU/GPU de render lo separan. Nunca se aplica al producto sin la feature y variable.

Se exige **≥30 presents/s** y notificaciones de estrés; queda informativo. El piloto anterior, todavía con `DwmFlush`, produjo unos 22 presents/s y fue **rechazado**, sin bajar ese umbral. Sus 1.459 timestamps GPU válidos verifican las consultas, pero no convierten la pasada en una comparación de estrés aceptada. `-QuietControl -Widgets 1` exige **≤0,1 presents/s** en el widget quieto. Cada control tiene su declaración y registro.

La aceleración de reproducción no se usa para aislar render: cambia decode/IPC y acorta la ventana. La comparación mantiene velocidad 1. p99 entre presents y latencia local de esa reproducción dependen de la entrada; no prueban velocidad del motor. La normalización por Present se publica como contexto; incluye trabajo ajeno al pintado.

## Separar render, CPU y GPU

Las fases CPU conservan decode, feed IPC, proyección, layout, paint GPUI y envío D3D por separado. Se publican ciclos por llamada de cada fase; son anidadas y no se suman. Present incluye HWND para no mezclar intervalos entre ventanas.

Con fases, los binarios compatibles usan consultas D3D11 timestamp/disjoint alrededor del render, antes de Present. Ocho slots, DONOTFLUSH y lectura explícita de S_FALSE evitan espera y datos sin completar. Los resultados conservan el QPC original. **Disjoint descarta esa muestra**, no la campaña CPU; se publican muestras, cobertura, omitidas y duración GPU válida. Este tiempo excluye Present, DWM y pantalla física.

PresentMon/WPA/xperf no están en PATH del servidor; no se instala nada. Los contadores GPU/DWM de la sesión remota a 59 Hz son contexto. La referencia exacta acc6619b1 carece de timestamps GPU propios; su estado se informa como no disponible. A/B usa la misma instrumentación en ambos motores y sus SHA reales.

## Memoria, frecuencia y coste del colector

La memoria de referencia es **working set**. La privada incluye unos **137 MiB reservados para la traza**; no equivale a memoria de producto. Se guardan ambas y se comparan con la misma instrumentación.

En este servidor los ciclos se describen como ticks TSC de aproximadamente **3,49 GHz**. La frecuencia WMI nominal no representa turbo ni una conversión universal. No convertirlos a segundos de CPU, núcleos o ms. `frequency.csv` se lee para publicar mediana/rango, validez, rendimiento y límites; las zonas térmicas se conservan sin asumir que son temperatura del paquete CPU.

`sampler.csv` mide ticks directos del proceso colector, ciclos/s y duración de iteración. Para la perturbación completa usar **control pareado**: el mismo UI con muestreo completo frente a ligero, alternando ABBA/BAAB. El ligero mantiene procesos/QPC y carga por GetSystemTimes, pero omite PDH y WMI periódicos; las reservas de compilación permanecen. No se inventan contadores GPU ausentes. Esa comparación es informativa y no decide el motor.

```powershell
pwsh -NoProfile -File native/scripts/measure-overlay-ab.ps1 -ComparisonName sampler-overhead -SamplingControl -A <A.exe> -B <el-mismo-A.exe> -Core <core-fijo.exe> -Recording testdata/rust-port/lmu47-high-rate-60s.tar.gz -Out <control-nuevo> -Widgets 22 -Rounds 6
```

## Línea base y procedencia

La referencia final se construye desde **nightly acc6619b1** y se mide con un colector v3 uniforme. Se guardan hashes de binarios, fuente compilada, perfil/features, colector y analizador. El UI se prepara y se toma una muestra inicial **antes** de iniciar el núcleo: la caracterización detectó un primer muestreo 0,9 s posterior al comienzo estable con el orden anterior. No se desplaza la ventana para salvarlo.

La referencia final ya completó **30/30 observaciones** con colector `835783d25`, cinco por configuración. Su registro conserva también los dos intentos previos fallidos. El primer intento A/A–A/B se detuvo tras cinco observaciones válidas: B no terminó dentro del plazo de proceso de cinco segundos, aunque su traza tenía `trace_end`. No se atribuye una causa no demostrada ni se reutilizan esas observaciones para otro intento.

La guarda distingue ahora **ventanas visibles cerradas en cinco segundos** de **vaciado de traza y salida del proceso**, acotado a treinta segundos en total; si las ventanas ya se cerraron, detiene también el productor terminado antes de esperar el drenaje IPC. Todo ocurre después de grabación+4 s, fuera de la ventana estable. No cambia el código de producto, los binarios congelados ni la referencia capturada. Tres caracterizaciones B/22 declaradas de antemano, con colector `ce817b324`, terminaron correctamente en **123, 66 y 68 ms**, sin necesitar ese drenaje adicional. El timeout anterior sigue registrado como fallo aislado.

La campaña provisional de 5104 tuvo una subida de 123,639 a 130,351 millones de ticks/s entre rondas 1 y 5 con 4 widgets sin fases. El working set fue 45,57 → 45,59 MiB y cada proceso reservó un buffer nuevo; no hubo crecimiento acumulado entre pasadas. Los misses nativos de texto fueron cero en la ventana estable. No se registró temperatura/frecuencia por intervalo y no se atribuye retrospectivamente una causa. El diseño intercalado, órdenes contrabalanceados y A/A cuantifican el residuo.

Antes de compilar instrumentación, fijar `$env:VANTARE_MEASUREMENT_SOURCE_SHA = (git rev-parse HEAD).Trim()`. El helper lo valida contra Git y lo usa como entrada de invalidación de Cargo. Tras compilar, exigir SHA correcto y limpio de `--measurement-info`. Un ejecutable con código nuevo y metadatos acc reutilizados se rechazó antes de medir. `test-measurement-provenance.ps1` prueba build correcto → SHA incorrecto rechazado sobre caché → correcto restaurado.

`test-overlay-campaign.ps1` ejecuta el orquestador con observaciones sintéticas y el agregador real: verifica orden, A/A usando solo A, capacidades antes de muestrear y límite de intentos. Es prueba de software, no evidencia A/A real.
