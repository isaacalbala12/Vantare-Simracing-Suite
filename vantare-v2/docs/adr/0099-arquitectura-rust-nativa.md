# ADR 0099 — Arquitectura Rust nativa: núcleo neutral, tres flujos y UI GPUI

Fecha: 2026-09-29. Issue: [#1419](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1419).
Plan: [arquitectura Rust nativa por fases](../superpowers/plans/2026-09-29-arquitectura-rust-nativa.md).

## Estado

Propuesta en debate entre Opus 5.5 (orquestador) y GPT-6 Astra (advisor);
pendiente de aceptación de Isaac. Ningún código se escribe bajo esta ADR hasta
que Isaac la acepte y autorice la fase correspondiente.

## Contexto

- Isaac ha decidido retirar Go por completo y reescribir la UI en Rust + GPUI.
  La elección de GPUI sale de una paridad 1:1 del widget Standings Eficiencia
  frente a Wails, Qt Quick, Slint y Ultralight (ramas
  `vantareapp/isa-1410-parity-*`): GPUI dio la mayor fidelidad (3,7–4,9 % de
  píxeles distintos), ~50 MiB de working set y 45–52 MiB privados, frente a
  ~440 MiB y 9–11 % de CPU de Wails. GPUI dibuja con DirectX 11; wgpu
  (Vulkan/DX12) hace girar un hilo del driver AMD al 100 % y queda descartado
  para ventanas de producto.
- ISA-1403 portó la telemetría a un proceso hijo Rust manteniendo un host
  Go/Wails. Su propia medición de la ruta mixta Rust+Go fue ~2,3× la CPU de
  Go, y su revisión encontró: oráculo Go no congelado, tests de paridad que
  pasan sin corpus, contadores de revisión incompatibles con el cliente,
  entrega de facts sin garantía, proyecciones acopladas a tipos LMU y ausencia
  de hashes de binarios medidos. Esa ruta queda pausada en `3ced668f`.
- Isaac fija la premisa rectora: **los widgets no se adaptan a cada
  simulador**; solo conocen el tipo de dato (velocidad, bandera, gap). La
  telemetría soporta varios simuladores, uno a la vez. El resto del producto
  se segmenta con la misma regla.
- Consumidores previstos: overlays en carrera, Engineer/Spotter con voz,
  Strategy, grabación, análisis histórico y **análisis de carrera en directo**
  (posiblemente en otra pantalla o dispositivo), y un render 3D aparte.

## Decisión

### 1. Capas y neutralidad

1. **Adaptador por simulador.** Traduce protocolo, identidad y rarezas del
   simulador a observaciones tipadas comunes y **declara capacidades**. Nada
   específico de un simulador cruza esta frontera, salvo grabación diagnóstica
   explícita de datos crudos.
2. **Núcleo neutral, un único propietario del estado.** Estado canónico en
   unidades SI, época de sesión, identidad de pilotos y coches, tiempos de
   origen y de recepción. Fusión y derivaciones (gaps, deltas, combustible,
   stints) se calculan una vez para todos los simuladores. Cada valor lleva
   calidad y procedencia. La preferencia entre dato nativo y derivado se decide
   por reglas por señal: un dato nativo obsoleto no gana automáticamente.
3. **Capacidades en tres niveles:** el simulador lo soporta, hay dato ahora, el
   dato está fresco. Las capacidades se declaran en el adaptador; no se
   deducen del transporte.
4. **Modelo común extensible:** banderas tipadas, combinables y con ámbito
   (sesión, sector, coche), con valor "otra/desconocida" que conserva el
   original; sectores sin límite conceptual de tres; clases y multiclase de
   primer nivel.
5. **Proyecciones por familia de widget** según necesidad semántica y
   cadencia. Los cinco sistemas de diseño consumen los mismos ViewModels.
6. **Presentación compartida:** unidades, redondeo y formato son preferencias
   del usuario aplicadas por un formateador común, nunca dentro de un widget.
7. **Widgets** declaran datos obligatorios y opcionales, no tienen ramas por
   simulador y degradan con honestidad (guion, ocultar, aviso).
8. **Replay es un adaptador más**, con reloj determinista.
9. **Conformidad por adaptador:** cada adaptador pasa una batería con capturas
   reales de su simulador y el estado canónico esperado.

### 2. Tres flujos del núcleo

Comparten sesión, época, secuencia y un punto de corte coherente.

1. **Foto actual (latest-wins).** Snapshot inmutable; los consumidores leen la
   última. Para widgets y estado actual de Engineer/Strategy.
2. **Eventos ordenados.** Cursor por consumidor, ACK, deduplicación y journal
   persistente. La garantía de no pérdida empieza cuando el evento está
   confirmado en el journal. Para Engineer, grabación y análisis.
3. **Series temporales por vuelta.** Bloques publicados durante la vuelta
   (la vuelta es un índice, no hace falta esperar a que termine) y sellados al
   cerrarla. Grabación, análisis histórico y análisis en directo usan el mismo
   esquema y almacén.

Colas acotadas, escritura fuera del hilo de adquisición y **huecos explícitos**
ante saturación o disco lleno: no se promete a la vez memoria finita, cero
bloqueo y cero pérdida.

### 3. Procesos

Fijo: el **Hub** (Hub, Overlay Studio, Workshop) es un proceso propio que se
cierra por completo al entrar al juego. El **render 3D**, la **voz del
Engineer** si su modelo es pesado, el **análisis** pesado y una **salida remota**
opcional, autenticada y cifrada, son procesos bajo demanda. El **actualizador**
es un proceso temporal.

Pendiente de medir en la fase 0: si los **overlays** viven dentro del proceso
del núcleo (sin IPC en el camino caliente) o en un proceso propio (un fallo de
UI no tumba la adquisición). Presupuestos y criterio de decisión se fijan
**antes** del ensayo. El resto de fronteras de dominio no cambia con el
resultado.

### 4. Transporte

- Dentro de un proceso: snapshot compartido con `Arc` e intercambio atómico
  (tipo `ArcSwap`), notificaciones coalescidas y render limitado por widget.
  Sin ECS ni memoria compartida inicialmente.
- Entre procesos: named pipes con ACL, identificación del par, límites,
  negociación de versión y **DTO versionado con codec explícito**. Los tipos
  Rust internos no son ABI entre procesos. Se decodifica una vez por proceso.
- JSON solo para herramientas, tests y replays.

### 5. Overlay V2

Se conserva su **semántica y su corpus** como contrato comprobable (estados de
fuente, frescura, calidad, límites de 104 coches). Deja de ser el wire
obligatorio: dentro de Rust es un tipo interno; entre procesos viaja con el
codec versionado. Cualquier diferencia de semántica frente a Overlay V2 se
documenta y se prueba; no se hereda en silencio.

### 6. Servicios que hoy están en Go

| Servicio | Ubicación |
|---|---|
| Adaptador activo, estado, derivaciones | Núcleo |
| Validación local de licencia firmada | Núcleo (no depende del Hub) |
| Cuenta/Supabase, renovación, calendario, Discord/notificaciones | Hub |
| Planes de Strategy (edición y persistencia) | Hub |
| Engineer/Spotter y voz | Worker bajo demanda que consume foto + eventos |
| Grabación y almacén (DuckDB con un único propietario) | Worker de almacenamiento |
| Análisis live e histórico, solver Strategy pesado | Worker bajo demanda, fuera de la escritura crítica |
| Testing Center | Trabajos fuera del núcleo |
| Render 3D, salida remota | Procesos opcionales |
| Actualizador/instalador | Proceso temporal, fuera de carrera, con rollback compatible con datos persistidos |

### 7. Reutilización de ISA-1403

Se reutilizan solo piezas de dominio que superen **revisión independiente al
portarlas**: parser y admisión LMU, reglas de calidad, reducer transaccional,
matemáticas genéricas y el corpus real con sus hashes. Nada hereda aprobación
por estar terminado. Proyecciones, capacidades, engine especializado, log de
facts y ciclo de vida del proceso se rediseñan. Go, Wails, el proceso hijo y
el SSE/HTTP para OBS no se trasladan. OBS usa captura de ventana.

## Relación con otras ADR

- **Sustituye** a ADR 0097 (proceso hijo Rust con host Go) y a los dos
  borradores numerados 0098 de las ramas `isa-1403` (distribución live en
  Rust con host Go) e `isa-1414` (frontend egui). Esta ADR usa el número 0099
  para romper esa colisión.
- **Conserva** los principios de ADR 0004 (driver único activo, datos crudos
  confinados al driver, autoridad por campo, reducer single-writer sin I/O,
  derivaciones ordenadas, estado continuo y hechos en canales distintos,
  productos sobre proyecciones versionadas) y retira de ella la ubicación en Go.
- **Retira**, cuando llegue su fase, la frontera `WidgetVisualHost` +
  HMR/TSX de `AGENTS.md`; hasta entonces el producto Wails sigue siendo el
  distribuido y sus reglas siguen vigentes.

## Consecuencias

- Se pierde el camino gradual de ISA-1403 y parte de su integración.
- La UI, el Workshop y los flujos de diseño se rehacen en Rust; el diseño
  visual deja de ser HTML/CSS.
- GPUI no tiene API estable: se fija un commit de Zed, se aísla detrás de una
  capa propia fina y se protege con pruebas de captura.
- El producto Wails actual se sigue distribuyendo hasta el corte; la nueva
  aplicación vive en paralelo en el repositorio hasta alcanzarlo.

## Qué refutaría esta decisión

- Un segundo adaptador real obliga a introducir `if simulador` en núcleo,
  proyecciones o widgets, o pierde información necesaria: el modelo común está
  mal y se revisa antes de seguir portando.
- La arquitectura nativa no mejora de forma reproducible CPU total (incluidos
  driver y DWM), memoria privada y frame time del juego frente al producto
  actual con el mismo trabajo, dentro de los presupuestos fijados en la fase 0.
- GPUI no sostiene las ventanas requeridas (transparencia, click-through, DPI
  mixto, multimonitor, captura OBS) en Windows.
