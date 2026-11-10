# Medición VANTA-139 — método Release v2 en preparación

La comparación entre motores requiere [A/A y ABBA](MEASUREMENT-AB.md) y el
[gate físico VRR](VRR-GATE.md). Las pasadas Release de `5104c1bbf` son solo
diagnóstico provisional. La referencia final debe construirse desde el SHA
fusionado de #2001. La memoria de referencia es el working set; la privada
incluye unos 137 MiB reservados para la traza.

Las campañas anteriores son **solo dev**, no una línea base. Sus conclusiones de rendimiento se han retirado de #2001 y #2009. El informe histórico se conserva en [measurements/SOLO-DEV.md](measurements/SOLO-DEV.md); no usar sus tablas para comparar motores.

La nueva campaña usa el perfil `--release` de distribución, sin cambiar LTO ni codegen-units: valores Cargo por defecto (`opt-level=3`, `lto=false`, `codegen-units=16`). UI y núcleo instrumentados exponen `--measurement-info` con SHA compilado, perfil, optimización y features. El recolector rechaza dev y binarios compilados con cambios locales sin commit. Se conserva el hash del binario, núcleo y grabación.

CPU: QueryProcessCycleTime, ciclos por segundo estable y por foto IPC recibida. Nunca convertir ciclos a segundos de CPU ni usar TotalProcessorTime. La frecuencia nominal/actual de CPU se anota como contexto; QPC proporciona la duración estable. Se mide UI y DWM por separado.

La ventana estable se alinea con `ReplayEvent.at`, posición original del suceso en la grabación, desde 5 segundos hasta duración menos 5. El núcleo registra esa posición junto a QPC sin cambiar el snapshot ni el contrato IPC. Se resta el segundo de preludio que añade el lector UTC (`adapter/lmu/open.rs`, `Clock::at`) y se conserva el desplazamiento del primer suceso respecto a startedAtUtc; no se cuenta ese preludio como parte de la grabación. El número de sucesos debe coincidir con el manifiesto. No usar `origin.received_at` para esta alineación: el piloto mostró unos tres segundos de retraso acumulado del reloj del núcleo respecto a los sucesos originales. Los contadores acumulados se interpolan a esos mismos extremos QPC. La duración solicitada debe coincidir con el manifiesto (100 ms de redondeo).

Se guardan intervalos individuales entre llamadas Present y su p99, latencia local recepción→pintado y recepción→retorno de Present. No son tiempos de visualización física. Las fases se filtran por inicio y fin dentro de la ventana estable; son anidadas y no se suman. Decode JSON se informa separado del feed IPC que incluye espera.

PresentMon no aparece en PATH. Se usan los contadores Windows GPU Engine y GPU Process Memory para UI y DWM; las sumas de motores pueden exceder 100%. VRR activo se registra desconocido: estos contadores no permiten verificarlo. Presentación declarada por el backend: DirectComposition, FLIP_SEQUENTIAL, Present(0,0), sin flag tearing. La comprobación física del PC de juego sigue pendiente del paso 5.

La traza se acumula en memoria acotada y se vuelca tras cerrar el host; un overflow invalida la pasada. Se reserva la cola de compilación con plazo máximo, se registra plan de energía, prioridad Normal y carga total del sistema. Una compilación ajena o carga por encima del umbral descarta la pasada.

Pendiente antes de aceptar cifras: verificar la implementación, ejecutar al menos cinco pasadas alternadas de cada configuración (1/4/22 widgets, con y sin Phases), publicar mediana y rango, y completar los checks. No hay aún una línea base Release aceptada.

## Repetir la campaña

Desde `vantare-v2`, con el código confirmado en Git y sin overrides de perfil:

```powershell
$env:CARGO_TARGET_DIR = 'D:\VantareServer\targets\isa-1996-medicion'
$env:CARGO_BUILD_JOBS = '4'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --locked --release -p vantare-runtime --bin vantare-core --features paint-stats -j 4
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --locked --release -p vantare-ui --example overlay-replay --features paint-stats -j 4
pwsh -NoProfile -File native/scripts/measure-overlay-campaign.ps1 -UI "$env:CARGO_TARGET_DIR/release/examples/overlay-replay.exe" -Core "$env:CARGO_TARGET_DIR/release/vantare-core.exe" -Recording testdata/rust-port/lmu47-high-rate-60s.tar.gz -Out D:/VantareServer/evidence/isa-1996/release-campaign-NEW -Runs 5
```

No envolver la campaña en `compilar.ps1`: el recolector reserva la cola por sí mismo. Conservar el mismo núcleo y su hash en todas las variantes; su CPU no se atribuye al overlay. Cada salida debe ser nueva. Un fallo interrumpe la campaña y conserva la evidencia descartada, sin convertirla en una pasada válida.

Cada pasada guarda `metadata.json`, `process.csv`, `dwm.csv`, `system.csv`, `gpu.csv`, los contadores GPU por motor en `gpu-counters.csv`, muestras PDH inválidas en `invalid-counters.csv`, logs, `complete.txt` y `summary.json`. Si la UI termina durante la última lectura PDH de drenaje, se cierra el muestreo sin atribuir esos contadores a la ventana estable. Una muestra inválida de un proceso ajeno puede aparecer si éste destruye un motor entre las lecturas PDH; no invalida los contadores propios. Un contador inválido de UI, DWM o carga total sí descarta la pasada. Una traza truncada o desbordada también se rechaza.

`campaign.json` agrega las seis configuraciones por separado, con número de pasadas, mediana, mínimo y máximo. No mezcla binarios UI, núcleo o grabaciones distintos. Los intervalos y latencias individuales se conservan en cada `summary.json`.

La memoria privada incluye el buffer de diagnóstico reservado, cuyo tamaño exacto aparece en `compiled_build.trace_capacity_bytes`; no equivale al consumo del producto sin instrumentación. Los controles sin Phases conservan las marcas mínimas de recepción, cambio de widget y presentación y reservan la misma capacidad, para medir el coste adicional de las fases. No sumar VRAM de UI y DWM: hay superficies compartidas.

Fuentes primarias consultadas para el método: [QueryProcessCycleTime](https://learn.microsoft.com/en-us/windows/win32/api/realtimeapiset/nf-realtimeapiset-queryprocesscycletime) suma ciclos de todos los hilos, en usuario y kernel; [Microsoft DirectX: GPU en Task Manager](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/) explica motores independientes y memoria por proceso. La utilización principal de GPU usa el motor más ocupado por muestra; se conserva además la suma y cada contador bruto. La VRAM de UI y DWM se informa por separado porque las superficies compartidas pueden contabilizarse en ambos procesos.

## Propagación de cambios

El host recibe una `Photo`, verifica la demanda y conserva la última foto.
`LiveScreens::ingest` actualiza visibilidad/sesión de cada entidad y aplica su
cadencia. `Overlay::ingest` proyecta el snapshot y notifica **su propia entidad**
solo cuando cambió la proyección. `Screen` contiene entidades cacheadas: GPUI
reutiliza las primitivas de las que no se invalidaron. Un cambio de anchura de
widget notifica también a `Screen`. Configuración/layout, estado de conexión,
derechos y animaciones tienen sus propios despertares.

La marca de traza `notify` identifica widget/época/secuencia de cada notificación por datos;
la marca `data_paint` identifica el último snapshot pintado. El resumen distingue
widgets notificados por snapshot cambiado y widgets pintados por snapshot
pintado. GPUI puede coalescer fotos y las animaciones pueden pintar sin una
foto nueva: esos cocientes no son intercambiables. Los contadores `paint` por
widget incluyen las animaciones. Dos Standings son dos entidades, aunque el
contador por tipo las agregue.

El workload conserva el banco original: 1 Standings; 4 widgets en secuencia Standings/Radar/Pedals/Standings; 22 repiten ese ciclo de tres tipos en una ventana. La grabación es real; esta configuración no pretende representar los 19 tipos distintos a la vez.

El resumen informa memoria privada y working set por separado; ambas incluyen la instrumentación. El buffer reservado puede elevar la privada aunque sus páginas todavía no sean residentes. No se presenta ese presupuesto como consumo del producto sin diagnóstico.

`native_text_layout` distingue medición disponible, fases apagadas y backend sin instrumentar. Una caché caliente puede tener cero llamadas nativas durante la ventana y llamadas durante el arranque: ese cero no significa que el texto no cueste CPU; la consulta de caché y el pintado de glifos están dentro de paint. Las fases anidadas no se suman. Los contadores de proceso se interpolan desde muestras aproximadamente cada segundo a los extremos QPC comunes; esa interpolación limita su precisión temporal.

El selector de crates de #2003 ejecuta `cargo metadata` antes de entrar en la cola. El guard distingue solo esa consulta de lectura, registrada por PID/QPC en `readonly-cargo.csv`, de compilaciones, Clippy, Nextest y comandos desconocidos, que descartan la pasada. El límite de carga total sigue activo. Los procesos que provocan contención quedan registrados por nombre/PID, sin publicar sus argumentos. `collector_sha` y los hashes del script/guard identifican el método usado; `sha` sigue siendo exclusivamente el SHA compilado del ejecutable UI.
