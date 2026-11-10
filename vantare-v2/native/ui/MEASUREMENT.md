# Medición VANTA-139 — método Release v2 en preparación

Las campañas anteriores son **solo dev**, no una línea base. Sus conclusiones de rendimiento se han retirado de #2001 y #2009. El informe histórico se conserva en [measurements/SOLO-DEV.md](measurements/SOLO-DEV.md); no usar sus tablas para comparar motores.

La nueva campaña usa el perfil `--release` de distribución, sin cambiar LTO ni codegen-units: valores Cargo por defecto (`opt-level=3`, `lto=false`, `codegen-units=16`). Cada ejecutable expone `--measurement-info` con SHA compilado, perfil, optimización y features. El recolector rechaza dev. Se conserva el hash del binario, núcleo y grabación.

CPU: QueryProcessCycleTime, ciclos por segundo estable y por foto IPC recibida. Nunca convertir ciclos a segundos de CPU ni usar TotalProcessorTime. La frecuencia nominal/actual de CPU se anota como contexto; QPC proporciona la duración estable. Se mide UI y DWM por separado.

La ventana estable se alinea con `Snapshot.origin.received_at` del replay (posición del reloj del núcleo sobre la grabación), desde 5 segundos hasta duración menos 5. Los contadores acumulados se interpolan a esos mismos extremos QPC. La duración solicitada debe coincidir con el manifiesto (100 ms de redondeo).

Se guardan intervalos individuales entre llamadas Present y su p99, latencia local recepción→pintado y recepción→retorno de Present. No son tiempos de visualización física. Las fases se filtran por inicio y fin dentro de la ventana estable; son anidadas y no se suman. Decode JSON se informa separado del feed IPC que incluye espera.

PresentMon no aparece en PATH. Se usan los contadores Windows GPU Engine y GPU Process Memory para UI y DWM; las sumas de motores pueden exceder 100%. VRR activo se registra desconocido: estos contadores no permiten verificarlo. Presentación declarada por el backend: DirectComposition, FLIP_SEQUENTIAL, Present(0,0), sin flag tearing. La comprobación física del PC de juego sigue pendiente del paso 5.

La traza se acumula en memoria acotada y se vuelca tras cerrar el host; un overflow invalida la pasada. Se reserva la cola de compilación con plazo máximo, se registra plan de energía, prioridad Normal y carga total del sistema. Una compilación ajena o carga por encima del umbral descarta la pasada.

Pendiente antes de aceptar cifras: verificar la implementación, ejecutar al menos cinco pasadas alternadas de cada configuración (1/4/22 widgets, con y sin Phases), publicar mediana y rango, y completar los checks. No hay aún una línea base Release aceptada.
