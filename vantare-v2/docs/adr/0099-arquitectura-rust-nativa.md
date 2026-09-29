# ADR 0099 — Arquitectura Rust nativa: núcleo neutral, tres flujos y UI GPUI

Fecha: 2026-09-29. Issue: [#1419](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1419).
Plan: [arquitectura Rust nativa por fases](../superpowers/plans/2026-09-29-arquitectura-rust-nativa.md).

## Estado

Consenso entre Opus 5.5 (orquestador) y GPT-6 Astra (advisor) tras dos rondas
de debate; pendiente de aceptación de Isaac. Ningún código se escribe bajo esta
ADR hasta que Isaac la acepte y autorice la fase correspondiente.

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
- Prioridades de Isaac: el rendimiento importa mucho, pero **dentro de
  presupuestos de producto aceptados manda la mantenibilidad a largo plazo**;
  una mejora marginal no justifica complejidad adicional.

## Decisión

### 1. Capas y neutralidad

1. **Adaptador por simulador.** Traduce protocolo, identidad y rarezas del
   simulador a observaciones tipadas comunes y **declara capacidades**. Nada
   específico de un simulador cruza esta frontera, salvo grabación diagnóstica
   explícita de datos crudos. El adaptador es la única abstracción con trait
   prevista inicialmente (tiene sustitución real: LMU, replay, segundo
   simulador); cualquier otra exige una necesidad concreta de sustitución.
2. **Núcleo neutral, un único propietario del estado.** Estado canónico en
   unidades SI, época de sesión, identidad de pilotos y coches, tiempos de
   origen y de recepción. Fusión y derivaciones (gaps, deltas, combustible,
   stints) se calculan una vez para todos los simuladores. Cada valor lleva
   calidad y procedencia. La preferencia entre dato nativo y derivado se decide
   por reglas por señal: un dato nativo obsoleto no gana automáticamente.
3. **Capacidades en tres niveles:** el simulador lo soporta, hay dato ahora, el
   dato está fresco. Se declaran en el adaptador; no se deducen del transporte.
4. **Modelo común extensible:** banderas tipadas, combinables y con ámbito
   (sesión, sector, coche), con valor "otra/desconocida" que conserva el
   original; sectores sin límite conceptual de tres; clases y multiclase de
   primer nivel.
5. **Proyecciones por familia de widget** según necesidad semántica y
   cadencia. Los cinco sistemas de diseño consumen los mismos ViewModels.
6. **Presentación compartida:** unidades, redondeo, idioma y formato son
   preferencias del usuario que entran como parámetros a un formateador puro,
   nunca se resuelven dentro de un widget.
7. **Widgets** declaran datos obligatorios y opcionales, no tienen ramas por
   simulador y degradan con honestidad (guion, ocultar, aviso).
8. **Replay es un adaptador más**, con reloj determinista.
9. **Conformidad por adaptador** con capturas reales de su simulador. Las
   restricciones de dependencias demuestran la separación de código; la
   neutralidad semántica solo la demuestra la conformidad con fuentes
   realmente distintas.

### 2. Tres flujos del núcleo

Comparten sesión, época, secuencia y un punto de corte coherente. Tres flujos
semánticos no implican tres buses ni tres almacenes.

1. **Foto actual (latest-wins).** Snapshot inmutable; los consumidores leen la
   última. Para widgets y estado actual de Engineer/Strategy.
2. **Eventos ordenados** con cursor por consumidor, ACK y deduplicación.
   - Con **recording desactivado** (por defecto, según
     `product-contract.md`), el journal vive **solo en memoria**, acotado a la
     sesión. Si se reinicia un consumidor, recupera desde su cursor mientras el
     núcleo conserve los eventos. Si se reinicia el núcleo o se agota la
     retención, se **declara un hueco**, se establece una base coherente nueva
     y el consumidor reconstruye su estado desde el snapshot. Ningún
     consumidor deduce hechos (adelantamientos, boxes, fin de stint) a través
     de un hueco.
   - Con **recording activado** por el usuario, un evento es durable solo tras
     su persistencia efectiva; disco lleno produce degradación explícita.
3. **Series temporales por vuelta.** Bloques publicados durante la vuelta (la
   vuelta es un índice, no hace falta esperar a que termine) y sellados al
   cerrarla. Grabación, análisis histórico y análisis en directo comparten
   esquema y bloques.

Colas acotadas, escritura fuera del hilo de adquisición y **huecos explícitos**
ante saturación o disco lleno: no se promete a la vez memoria finita, cero
bloqueo y cero pérdida.

### 3. Procesos

Topología por defecto (**B**):

- **Núcleo sin UI**: adaptador activo, estado, derivaciones, flujos y
  validación local de licencia firmada.
- **Proceso de overlays**: todas las ventanas de overlay GPUI, que comparten
  una única copia del snapshot.
- **Proceso Hub** (Hub, Overlay Studio, Workshop): se cierra por completo al
  entrar al juego.
- **Bajo demanda**: Engineer/voz, almacenamiento y grabación, análisis, render
  3D y una salida remota opcional autenticada y cifrada.
- **Temporal**: actualizador.

La alternativa **A** (overlays dentro del núcleo) se mide una vez en una
campaña comparativa intercalada para cuantificar el precio del aislamiento y
después se retira. Se elige A solo si B incumple un presupuesto relevante sin
una corrección sencilla, aceptando perder la contención de fallos.

**Ciclo de vida**: un propietario del arranque y cierre, instancia única,
cancelación con plazos, cambios de configuración que no bloquean la
adquisición y reconexión con época nueva.

### 4. Transporte

- Dentro de un proceso: snapshot compartido con `Arc` e intercambio atómico
  (tipo `ArcSwap`), notificaciones coalescidas y render limitado por widget.
  Sin ECS ni memoria compartida inicialmente.
- Entre procesos: named pipes con ACL, identificación del par, límites y
  negociación de versión. **DTO versionado con serde**; los tipos internos no
  son ABI entre procesos. Se empieza con JSON por simplicidad y depuración y
  se cambia de codec cuando un perfil representativo lo justifique. Se
  decodifica una vez por proceso; ningún widget serializa.

### 5. Overlay V2

Se conserva su **semántica y su corpus** como contrato comprobable (estados de
fuente, frescura, calidad, revisión única y creciente, límites de 104 coches).
Deja de ser el wire obligatorio. Cualquier diferencia de semántica frente a
Overlay V2 se documenta y se prueba; no se hereda en silencio.

### 6. Organización del código

- Workspace `native/` con cuatro paquetes: `domain` (modelo común,
  derivaciones, proyecciones y formateador; puro, sin simuladores ni GPUI),
  `runtime` (adaptadores como módulos privados, núcleo, flujos, ciclo de vida),
  `ipc` (DTO y transporte) y `ui` (biblioteca visual y binarios de overlays y
  Hub). Se añaden paquetes solo por aislamiento demostrado, nunca por widget,
  estilo o servicio.
- Rust concreto: structs y enums, funciones puras, `Result`; sin
  abstracciones especulativas.
- **GPUI se usa directamente.** La capa propia solo reúne la integración con
  Windows (transparencia, click-through, foco, DPI) y las primitivas visuales
  del producto; no reproduce la API del framework. Revisión de Zed fijada y un
  responsable de sus actualizaciones.
- Dependencias mantenidas para GPUI/Win32, serialización, red y persistencia
  cuando hagan falta, justificando coste, licencia y actualización.

### 7. Servicios que hoy están en Go

| Servicio | Ubicación |
|---|---|
| Adaptador activo, estado, derivaciones, licencia local | Núcleo |
| Cuenta/Supabase, renovación, calendario, Discord/notificaciones | Hub |
| Planes de Strategy (edición y persistencia) | Hub |
| Engineer/Spotter y voz | Worker bajo demanda (foto + eventos) |
| Grabación y almacén (DuckDB con un único propietario) | Worker de almacenamiento |
| Análisis live e histórico, solver Strategy pesado | Worker bajo demanda, fuera de la escritura crítica |
| Testing Center | Trabajos fuera del núcleo |
| Render 3D, salida remota | Extensiones opcionales, fuera de la sustitución |
| Actualizador/instalador | Proceso temporal, fuera de carrera, con rollback compatible con datos persistidos |

### 8. Reutilización de ISA-1403

Se reutilizan solo piezas de dominio que superen **revisión independiente al
portarlas**: parser y admisión LMU, reglas de calidad, reducer transaccional,
matemáticas genéricas y el corpus real con sus hashes. Nada hereda aprobación
por estar terminado. Proyecciones, capacidades, engine especializado, log de
facts y ciclo de vida se rediseñan. Go, Wails, el proceso hijo y el SSE/HTTP
para OBS no se trasladan. OBS usa captura de ventana.

## Relación con otras ADR

- **Sustituye** a ADR 0097 (proceso hijo Rust con host Go) y a los dos
  borradores numerados 0098 de las ramas `isa-1403` (distribución live en
  Rust con host Go) e `isa-1414` (frontend egui). El número 0099 rompe esa
  colisión.
- **Conserva** los principios de ADR 0004 (driver único activo, datos crudos
  confinados al driver, autoridad por campo, reducer single-writer sin I/O,
  derivaciones ordenadas, estado continuo y hechos en canales distintos,
  productos sobre proyecciones versionadas) y retira de ella la ubicación en Go.
- **Retira**, en la fase de corte, la frontera `WidgetVisualHost` + HMR/TSX de
  `AGENTS.md`; hasta entonces el producto Wails sigue siendo el distribuido y
  sus reglas siguen vigentes.

## Consecuencias

- Se pierde el camino gradual de ISA-1403 y parte de su integración.
- La UI, el Workshop y los flujos de diseño se rehacen en Rust; el diseño
  visual deja de ser HTML/CSS.
- GPUI no tiene API estable: revisión fijada, capa propia mínima y pruebas de
  captura.
- El producto Wails actual se sigue distribuyendo hasta el corte; la nueva
  aplicación vive en paralelo en el repositorio.

## Qué refutaría esta decisión

- Un segundo adaptador real obliga a introducir `if simulador` en núcleo,
  proyecciones o widgets, o pierde información necesaria: el modelo común está
  mal y se revisa antes de seguir portando.
- La arquitectura nativa no cumple de forma reproducible los presupuestos
  relativos y absolutos de CPU total (incluidos driver y DWM), memoria privada
  y frame time del juego fijados en la fase 0.
- GPUI no sostiene las ventanas requeridas (transparencia, click-through, DPI
  mixto, multimonitor, captura OBS) en Windows.
