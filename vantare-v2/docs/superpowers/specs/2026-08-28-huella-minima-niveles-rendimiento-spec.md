# Spec (SDD · SPECIFY): Huella mínima — niveles de rendimiento, sensor automático, banco objetivo y composición

Fecha: 2026-08-28. Issue: pendiente de crear (propuesta: `ISA-9xx · Huella mínima`). Base: `nightly` actual (`d717f732`).
Autores: Isaac (decisión), Fable (redacción, orquestación).
Estado SDD: **SPECIFY aprobado e IMPLEMENT autorizado por Isaac el 2026-08-28** ("puedes continuar"; P1–P12 respondidas en §14). #912 cerró su ciclo sin cortes finos viables (NO-GO ×2) y con la atribución hecha (PR #927). Issues abiertas: #924 (F0 banco), #926 (F1 policy). **D19 queda superada** (ver nota en D19): los frames v2 ya viajan por pull HTTP dirigido y Wails no tiene emisión dirigida; #925 cerrada. **La cadena #896 → #893 → #894 (lifecycle, cutover V2, retirada V1) entra en este plan** por decisión de Isaac: es el mayor ahorro de CPU pendiente (pull dual 1,3–1,8 ms vs V2-only 17 µs). El spike de composición (§10) está entregado y aparcado hasta el A/B.

Relación con trabajo en curso:
- **#912** (reducir coste renderer/host con profiling real) sigue siendo la dueña de los cortes finos dentro del renderer y de Go. Este spec **no** los repite; se apoya en su protocolo y en sus números.
- **#893/#894/#896** (cutover V2, retirada V1, lifecycle) son dependencias: el sensor y los niveles publican por `OverlayFrame v2`; no se cablea nada sobre V1.
- Sustituye la decisión "migrar a Qt" (#690, STOP 2026-08-21) por una dirección explícita: **el stack se queda; la huella se ataca con niveles, lifecycle y composición.**

---

## 1. Objetivo

Que un piloto con cualquier PC pueda usar Vantare ingame **sin notar pérdida de rendimiento**, y que Vantare pueda **demostrarlo con números públicos y reproducibles**. Concretamente:

1. Un ajuste único y comprensible ("Rendimiento") con 5 niveles + Personalizado + Automático, que sustituye al `updateHz` por widget del perfil.
2. Un sensor en Go que elige nivel solo, midiendo el host y el juego, con histéresis.
3. Un banco de medida objetivo (RAM/CPU/GPU por proceso + frametime del juego) que decide qué entra y qué no. Sin banco no se aprueba ningún nivel ni truco.
4. Lifecycle a coste cero: lo que no está en pantalla no consume.
5. Vía a **ganancia neta** frente al HUD del propio simulador (HUD swap), medida.
6. Evaluación, no adopción, de WebView2 en modo composición como techo del compositor.

## 2. Evidencia de partida

Medido en este PC (Ryzen 16 hilos, RX 7800 XT, 1080p@120) con LMU en sesión activa y una build actual de Vantare con Hub + Overlay abiertos (muestra pasiva de 9 s, 2026-08-28):

| Proceso | CPU % máquina | Privada MB | WS MB | GPU % |
|---|---|---|---|---|
| Le Mans Ultimate | 24,5 | 13.335 | 1.858 | 64,8 |
| Go host (`vantare.exe`) | 2,96 | 144 | 139 | — |
| WebView2 browser | 1,05 | 49 | 134 | — |
| WebView2 GPU process | 0,62 | 179 | 114 | 0,27 |
| Renderer overlay | 3,40 | 192 | 242 | — |
| Renderer hub | 0,25 | 86 | 141 | — |
| Utilities + crashpad | ~0,2 | 41 | 111 | — |
| **Total Vantare** | **≈8,4 % ≈ 1,35 cores** | **≈690** | **≈880** | **0,27** |

Coincide con la medición de #912 (Go 40 % de un core, renderer 35 %, browser 18 %; GPU 0,11-0,33 %; renderers con pendiente +22 MiB/min).

Conclusiones que condicionan el diseño:

- **La GPU no es el problema hoy** en GPU dedicada: 0,27 %. El compositor (ventana transparente a pantalla completa) importa en iGPU/portátiles y en VR; se mide ahí antes de tocarlo.
- **El problema es CPU (≈1,3 cores) y RAM (≈700-880 MB)**, repartidos entre Go, renderer overlay y procesos WebView2 que existen aunque el hub esté minimizado.
- El hub minimizado no libera nada: su renderer sigue vivo (86/141 MB) y su bundle es el mismo de 1,7 MB que carga el overlay (`frontend/src/AppShell.tsx:1-3`).
- `updateHz` por widget (`profile-document.ts:79-80, 98, 261, 343`) es un número por widget que el usuario no entiende, que no se aplica desde ISA-372 (`telemetry-rate-coordinator.ts:31-36`: "el argumento hz se acepta e ignora") y que Go regula por tiers propios (`cadence.go:110-122`). Dos fuentes de verdad, una muerta.

## 3. Decisión arquitectónica

```text
                 Ajustes › Rendimiento
   [1 Máximo] [2 Alto] [3 Equilibrado] [4 Ahorro] [5 Mínimo] [Personalizado] [Automático]
                          │ nivel elegido (o tabla propia)
                          ▼
   Go · PerformancePolicy (única fuente de verdad)
     ├─ sensor host: CPU total, CPU propio, RAM propia, frametime juego (si disponible)
     ├─ resuelve NivelEfectivo (manual = fijo; automático = sensor + histéresis)
     ├─ deriva: SectionCadence (fast/mid/slow/ceiling) → cadence.go
     │          EffectsBudget (blur, sombras, animaciones, rAF cap)
     │          WindowPolicy (superficie única / bounding box / clústeres)
     │          LifecyclePolicy (hub suspendido, ingeniero solo audio, EcoQoS)
     └─ publica en OverlayFrame v2 › capabilities.performance {level, effects, rafCap, reason}
                          │
        ┌─────────────────┼─────────────────────┐
        ▼                 ▼                     ▼
   overlay (widgets      hub (suspende/         ventana overlay
   leen capabilities,    reanuda, muestra        (tamaño, clústeres,
   cero lógica propia)   nivel y coste)          composición si se adopta)
```

Principios:

- **Go decide, la web obedece.** Ningún widget calcula su cadencia ni decide efectos: lee `capabilities.performance` y aplica. Mantiene la regla Go-first de ADR 0008 y la frontera `WidgetVisualHost` de #912.
- **Un solo número visible para el usuario** (el nivel). Personalizado expone la tabla, con coste explicado al lado de cada control.
- **Todo entra por medición.** Cada nivel, cada truco y cada cambio de ventana se acepta con el banco de §8 y los gates de §12.

## 4. Decisiones (D1–D18)

| ID | Decisión |
|---|---|
| D1 | Cinco niveles nominales: 1 Máximo · 2 Alto · 3 Equilibrado (defecto) · 4 Ahorro · 5 Mínimo. Más Personalizado y Automático. Siete opciones en UI. |
| D2 | El nivel 1 no limita rAF: pinta a la tasa del monitor. Niveles 2-5 limitan rAF a 60/40/30/20 respectivamente. El límite se aplica en el coordinador visual (`telemetry-rate-coordinator.ts`), no en Go. |
| D3 | `updateHz` desaparece del documento de perfil. Perfil **v4**: `behavior: { enabled }` únicamente; la cadencia es política global. Migración v3→v4 automática e irreversible con copia de seguridad del fichero v3. |
| D4 | **(Decisión Isaac, P1)** La política de rendimiento vive en el **perfil de overlay**: cada perfil tiene N widgets distintos y por tanto un coste distinto. Perfil v4: `performance: { mode: "inherit" \| "level" \| "custom", level?: 1..5, overrides?: { [widgetId]: { hz?: number \| "dirty", effects?: "full" \| "noBlur" \| "flat" } } }`. Los ajustes de la app guardan solo el **defecto** (`inherit` → nivel de la app, que por defecto es Automático). Mitigación del riesgo "perfil compartido con supuestos de otro PC": Automático siempre puede **bajar** por debajo de lo que pide el perfil; nunca subir por encima. |

En C2, `effects` queda reservado en el contrato v4 para la issue dedicada a las variantes Endurance `noBlur`/`flat`: Ajustes › Rendimiento solo ofrece overrides de Hz por widget y no promete coste GPU hasta que esas variantes lleguen al overlay.
| D5 | Go es la única fuente de verdad del nivel efectivo (`PerformancePolicy`). El frontend nunca infiere nivel; lo lee de `capabilities.performance` en cada frame v2 y de un evento `performance:level` para el hub. |
| D6 | Los tres tiers de `cadence.go` se conservan. El nivel escala los intervalos (tabla §6). No se añaden tiers ni se cambia la estructura de `SectionScheduler`. |
| D7 | **(Decisiones Isaac, P2/P3)** Automático es el **defecto de la app** y mide el frametime del juego: se usa PresentMon 2.x como servicio/librería (requiere elevación una vez, en la instalación); si el usuario la deniega, Automático funciona solo con CPU y lo muestra en Ajustes ("sin medida del juego"). Arranca en 3. Sube un nivel si durante 30 s el CPU total < 70 % y el frametime del juego no empeora > 3 %. Baja de inmediato (≤ 2 s) si CPU total > 90 % o el frametime empeora > 5 %. Histéresis: no vuelve a subir hasta 60 s después de bajar. Se mueve entre **2 y 5**; el nivel 1 es solo manual. |
| D8 | Banderas, eventos de carrera, avisos del spotter y audio del ingeniero **no se degradan en ningún nivel**: latencia mínima siempre. La seguridad no es negociable. |
| D9 | **(Decisión Isaac, P4)** Solo el design system **Vantare Endurance (Neo)** recibe variantes `full`, `noBlur`, `flat`; Original y Crystal desaparecen en breve y no se tocan. Las variantes las diseña Isaac. Hasta que existan, los niveles 3-5 aplican `full` y lo registran como diagnóstico ("variante no disponible"); el banco de F0 se ejecuta con Endurance `full`. |
| D10 | Lifecycle hub: al minimizar a bandeja en niveles 3-5, la ventana hub se **suspende** (`CoreWebView2.TrySuspend`, requiere ventana oculta) y, si Wails no lo expone, se **destruye** y se recrea al abrir. Nivel 5 siempre destruye. Niveles 1-2 no tocan el hub. |
| D11 | El overlay tiene **entry propio** (`overlay.html` → chunk sin Hub, Supabase, motion, Studio). Fuentes en woff2 subseteadas. Independiente del nivel. |
| D12 | Ventana overlay: en niveles 3-5 se dimensiona al **bounding box** de los widgets habilitados (+margen), no al monitor. Cambia solo al editar el perfil. En 1-2, monitor entero (sin cambio funcional). |
| D13 | Ingeniero: en niveles 4-5 sin subtítulos ni presentación visual; audio (Kokoro en Go, `internal/tts`) igual. |
| D14 | Go en niveles 4-5 entra en **EcoQoS** (`PROCESS_POWER_THROTTLING`) y prioridad below-normal; el renderer del overlay no se toca. Se revierte al subir de nivel. |
| D15 | HUD swap: capacidad del producto, no truco de laboratorio. Perfil "Sustituir HUD de LMU" + asistente que documenta/ejecuta la desactivación del HUD del sim. Se mide en §8 como condición propia. |
| D16 | Composición (WebView2 `CompositionController` + DirectComposition + `WS_EX_NOREDIRECTIONBITMAP`): **spike fuera del producto** (§10). Se adopta solo si gana en §12 en al menos dos de tres escenarios (dGPU, iGPU, VR). Nunca por arquitectura. |
| D17 | Clústeres (N documentos): no se implementan en producto hasta que el spike mida 1 vs 3 vs 7 y 3 gane con margen en iGPU. Si no gana, se archiva la idea. |
| D18 | **(Decisión Isaac, P7)** Widget "Coste de Vantare" **para todos** (RAM/CPU/GPU/nivel en vivo) e informe post-sesión. Ambos leen del sensor de Go, no miden en la web. Muestran la **comparación con el HUD de LMU** ("estás ahorrando X ms/frame frente al HUD del sim") **solo** si el gate 12.6 se ha superado en este hardware; si no, muestran el coste propio sin comparar. |
| D19 | **SUPERADA (2026-08-28, #925 cerrada).** Verificado por el worker: los frames v2 ya viajan por **pull HTTP dirigido** (`/telemetry/overlay-v2/projection`, ISA-879/#891) y en Wails alpha.98 `WebviewWindow.EmitEvent` termina en `globalApplication.Event.EmitEvent` (también difunde a todas las ventanas). Solo V1 y `status` siguen por eventos. El coste residual del transporte se elimina con la cadena **#896 → #893 → #894** (lifecycle → cutover V2 → retirada V1), que forma parte de este plan. |

## 5. Niveles

| Nivel | rAF | Cadencias | Efectos (variante del design system) | Ventana overlay | Hub al minimizar | Ingeniero | Go | Texto en UI |
|---|---|---|---|---|---|---|---|---|
| 1 Máximo | tasa del monitor | ×1,0 (tope de §6) | `full` (blur, sombras Neo, animaciones) | monitor | vivo | subtítulos | normal | "Sin recortes. Todo a la máxima frescura. Para PCs sobrados." |
| 2 Alto | 60 | ×1,0 | `full` sin animaciones continuas | monitor | vivo | subtítulos | normal | "Frescura máxima. Sin animaciones de adorno." |
| 3 Equilibrado | 40 | ×1,5 | `noBlur` (sombras de una capa) | bounding box | suspendido | subtítulos | normal | "Recorta lo que el ojo no distingue. Sin cristal vivo. Recomendado." |
| 4 Ahorro | 30 | ×2,0 | `flat` | bounding box | suspendido | solo audio | EcoQoS | "Solo datos, sin efectos. Para portátiles y gráficas integradas." |
| 5 Mínimo | 20 | ×3,0 + dirty en slow | `flat` | bounding box | destruido | solo audio | EcoQoS + below-normal | "Vantare casi invisible para el sistema. Para VR, streaming en el mismo PC o PCs apurados." |
| Personalizado | elegible | por widget | por widget | elegible | elegible | elegible | elegible | cada control muestra su coste: "+CPU", "+GPU", "+RAM" |
| Automático | según nivel | según nivel | según nivel | según nivel | según nivel | según nivel | según nivel | "Vantare mide tu PC en carrera y se ajusta solo (entre 2 y 5)." |

### 5.1 Nombres (P6 · decisión final de Isaac, 2026-08-28)

Se descartan los nombres de jerga de carrera (PUSH/PACE/FCY…): lo más cómodo para el cliente son nombres directos. Los números 1-5 se mantienen internamente (`level: 1..5`); el nombre visible se traduce en los cuatro idiomas.

| Nivel | Nombre | Subtítulo en UI |
|---|---|---|
| 1 | **Máximo** | "Sin recortes. Todo a la tasa de tu monitor. Para PCs sobrados." |
| 2 | **Alto** | "Frescura máxima. Sin animaciones de adorno." |
| 3 | **Equilibrado** | "Recorta lo que el ojo no distingue. Recomendado." |
| 4 | **Ahorro** | "Solo datos, sin efectos. Para portátiles y gráficas integradas." |
| 5 | **Mínimo** | "Vantare casi invisible para el sistema. Para VR, streaming en el mismo PC o PCs apurados." |
| Personalizado | **Personalizado** | "Elige cadencia y efectos widget a widget; cada control muestra su coste." |
| Automático | **Automático** | "Vantare mide tu PC en carrera y se ajusta solo (entre Alto y Mínimo)." |

El widget "Coste de Vantare" muestra el nombre del nivel como chip con el tratamiento de los chips de clase de Neo. Cuando el sensor cambia de nivel lo anuncia como mensaje de radio del Ingeniero ("Pasamos a Ahorro, el PC va justo").

## 6. Cadencia por widget y nivel (Hz)

Base = tier de `cadence.go` (Fast 50 ms, Mid 100 ms, Slow 250 ms, techo 1 s). El multiplicador del nivel escala los intervalos; los valores abajo son los Hz resultantes **por widget** que el coordinador visual usa como techo por widget (un widget nunca pinta más rápido que su fila aunque el frame llegue). "d" = solo por cambio, techo 1 s. Borrador para ajuste de Isaac tras el banco.

| Widget | Tier | 1 | 2 | 3 | 4 | 5 (suelo) |
|---|---|---|---|---|---|---|
| pedals · pedals-telemetry · pedals-telemetry-compact | fast | monitor | 60 | 40 | 30 | 20 |
| input-telemetry | fast | monitor | 60 | 40 | 30 | 20 |
| delta · delta-advanced | fast | 60 | 30 | 20 | 15 | 10 |
| delta-trace | fast | 60 | 30 | 20 | 10 | 5 |
| track-map | fast | 60 | 30 | 20 | 10 | 5 |
| relative · multiclass-relative · head-to-head | mid | 30 | 20 | 15 | 10 | 5 |
| standings | slow | 20 | 10 | 5 | 4 | 2 + d |
| broadcast-tower | slow | 10 | 5 | 4 | 2 | d |
| fuel-strategy | slow | 5 | 2 | 1 | d | d |
| race-schedule | slow | 2 | 1 | d | d | d |
| car-damage-numbers · car-damage-visual | slow | 5 | 2 | 1 | d | d |
| track-weather | slow | 1 | 1 | d | d | d |
| racing-flags | evento | evento | evento | evento | evento | evento |
| engineer-radio | evento | evento + subtítulos | idem | idem | solo audio | solo audio |

Nota: los Hz del tier fast por encima de 20 dependen de que el driver entregue a esa tasa (LMU SM 60 Hz; sesión 5 Hz). El sensor publica también `sourceHz` para que el widget "Coste" no prometa lo que el sim no da.

## 7. Contratos

### 7.1 `OverlayFrame v2 › capabilities.performance` (nuevo, Go → web)

```ts
performance: {
  level: 1 | 2 | 3 | 4 | 5;          // nivel efectivo
  mode: "manual" | "custom" | "auto";
  effects: "full" | "noBlur" | "flat";
  rafCap: number | null;             // null = tasa del monitor
  widgetHz: { [widgetType: string]: number | "dirty" | "event" };
  reason?: "cpu" | "frametime" | "user" | "vr" | "unavailable";  // por qué está en este nivel (auto)
  sourceHz: number;                  // tasa real del driver
}
```

Se publica dentro del frame para que el widget no necesite otra suscripción (regla #912: no más stores). Cambia solo cuando cambia el nivel; el `SectionScheduler` lo trata como sección slow con dirty.

Sin sensor o juego disponible, Automático se mantiene en nivel 3 y publica `reason: "unavailable"`.

### 7.2 Evento `performance:level` (Go → hub)

Payload igual a 7.1 más `host: { cpuPct, vantareCpuPct, vantareRamMB, gpuPct, gameFrametimeMs? }`, a 1 Hz, solo mientras el hub está visible.

### 7.3 Ajustes (`settings_service.go`)

```go
Performance struct {
  Mode      string            // "level" | "custom" | "auto"
  Level     int               // 1..5 (si Mode == "level"; nivel inicial si "auto")
  Overrides map[string]Override // si Mode == "custom"
}
```

`CpuSampling` existente (`settings_service.go:48`) pasa a ser obligatorio en modo `auto` (se activa solo).

### 7.4 Perfil v4

`WidgetInstanceV4.behavior = { enabled: boolean }`. Lector v3 → v4: descarta `updateHz`; si un perfil v3 tenía valores atípicos (por ejemplo 1-4 Hz en un widget fast) se registra en el log de migración para que el usuario lo vea en Ajustes, no se intenta reinterpretar.

## 8. Banco de medida (obligatorio antes de aceptar nada)

Reutiliza el protocolo de #912 y lo extiende con el juego.

- **Condiciones**: (a) sin Vantare · (b) HUD nativo de LMU · (c) Vantare nivel 1..5 con HUD nativo apagado · (d) Vantare ventana actual vs composición (cuando exista el spike) · (e) hub visible / minimizado.
- **Sesión (Decisión Isaac, P12)**: LMU no soporta repetición de 104 coches. Escena fija: **coche parado en pista** (fuera de boxes, motor en marcha) con parrilla máxima de IA rodando, mismo circuito, hora y clima; 3 minutos por condición, ×3 repeticiones. Se acepta ruido ≤ 5 %; si es mayor, se repite. Limitación asumida: standings/relative cambian menos que en carrera; se complementa con una condición "en vivo" no comparable, solo para detectar fugas.
- **Higiene (decisión de protocolo)**: se permiten y registran como `systemWebView2` los perfiles bajo `AppData\Local\Packages\Microsoft*` porque tienen browser/GPU process propios; cualquier otro Edge, WebView2 o `vantare*.exe` ajeno bloquea la corrida (o `-Forzar` la marca no publicable). Radeon Software mantiene su propia sesión ETW (PresentMon "RSXTraceSession"): se documenta y, si conflictúa con la captura, se cierra también.
- **Herramientas (Decisión Isaac, P10)**: PresentMon 2.x se instala en PATH en el momento de arrancar F0, no antes.
- **Coste del overlay Wails por diferencia**: el overlay no es proceso propio (otra `WebviewWindow` de `vantare.exe`). Se mide A0 (app, overlay detenido) y A1 (overlay activo); coste = A1 − A0. El spike sí es proceso propio y se mide directo.
- **Paridad del spike**: mismo `RasterizationScale`, mismos `AdditionalBrowserArgs`, `--count 1` con el overlay entero es la comparación válida; `--count 3/7` solo informa del coste de fragmentar.
- **Métricas**: por proceso Private Bytes, WS, CPU %, GPU Engine % (contadores `GPU Engine(*)`), memoria GPU; juego: frametime p50/p95/p99 y frames perdidos (PresentMon; ver pregunta P2 sobre la sesión ETW que abre Radeon Software).
- **Escenarios de hardware**: este PC (dGPU), un portátil con iGPU, y VR (Meta). Sin iGPU no se aprueban los niveles 4-5 ni se decide composición.
- **Salida**: CSV crudo + tabla resumen en `docs/analysis/huella-minima-<fecha>.md`. La misma tabla, con el script, es el material público de §1.3.

## 9. Sensor (Go)

- Muestreo 1 Hz de CPU total (`GetSystemTimes`), CPU y RAM propios (árbol Go + procesos WebView2 propios, identificados por `--user-data-dir`), GPU opcional por contador.
- Frametime del juego: preferido PresentMon como librería o servicio (2.x); alternativa ETW propia. Si no hay permiso, Automático funciona solo con CPU y lo indica en UI ("sin medida del juego").
- Detección de foreground: si el sim no está en primer plano, el overlay se oculta (rAF a 0) sin cambiar de nivel.
- Todo el sensor vive en `internal/app/performance/`; publica por `PerformancePolicy`. Sin dependencia nueva de terceros.

## 10. Spike de composición (fuera del producto)

Ubicación: `..\spikes\webview2-composition-spike` (Rust, `windows-rs` + `webview2-com`). Entrega: HWND `WS_EX_NOREDIRECTIONBITMAP` + DComp + `CompositionController` navegando a la URL del overlay de OBS; flag `--count N`; script de medida A/B. Sin reenvío de input.

Hipótesis a contrastar (H1-H3), cada una con su número:
- H1: sin bitmap de redirección baja la memoria del GPU process y el coste de composición en iGPU (esperado); en dGPU, cambio no medible (esperado).
- H2: 3 documentos en clústeres vs 1 documento: menor coste solo en iGPU; en dGPU peor por overhead de documentos.
- H3: 7 documentos: peor en todo.

Si H1 se confirma en iGPU/VR y el coste de mantenimiento se acepta, producción como **cdylib** cargada por Go vía `syscall` (sin cgo) o port a Go puro por COM. Decisión posterior, con ADR propio.

## 11. Alcance y fuera de alcance

Dentro: D1-D18, contratos §7, banco §8, sensor §9, spike §10, UI de Ajustes › Rendimiento, widget "Coste de Vantare", informe post-sesión, migración perfil v4, entry propio del overlay, variantes de design system.

Fuera: cortes finos de renderer/Go (#912); cutover/retirada V1 (#893/#894); lifecycle StrictMode (#896); reescritura de widgets o de la UI en otro stack; Qt; cambios visuales de los widgets más allá de las variantes `noBlur`/`flat`, que diseña Isaac.

## 12. Gates

1. Ningún nivel se publica sin la tabla de §8 en las tres condiciones de hardware (o dos si VR no está disponible, indicándolo).
2. Nivel 3 debe ser ≥ 25 % mejor que hoy en CPU total de Vantare y ≥ 20 % en RAM privada con hub minimizado (medido 423,13 MiB, −24,71 % vs 562 MiB, 2026-08-30), sin empeorar frametime del juego. Este gate no promociona el nivel 3: el default productivo sigue en nivel 1 mientras esa decisión permanezca abierta.
3. Nivel 5 debe dejar Vantare ≤ 0,5 cores y ≤ 250 MB privados con overlay activo.
4. Automático no puede oscilar: ≤ 2 cambios de nivel en 10 minutos de sesión estable.
5. Ningún evento de seguridad (banderas, spotter, avisos) aumenta su latencia p99 en ningún nivel (> 50 ms sobre nivel 1 es fallo).
6. HUD swap: se publica "ganancia" solo si el frametime p99 del juego con Vantare + HUD apagado es ≤ que con HUD nativo, en ≥ 2 de 3 repeticiones y en ≥ 2 escenarios de hardware.
7. Cada PR con evidencia antes/después y SHA, como en #912.

## 13. Riesgos

- **Variantes `flat`/`noBlur` por sistema**: coste de diseño real (Neo tiene sombras de tres niveles; Crystal es cristal). Lo hace Isaac; sin ellas, los niveles 4-5 no existen para esos sistemas.
- **PresentMon/ETW**: permisos y conflicto con otras sesiones ETW (Radeon Software mantiene una). Riesgo de que Automático quede "solo CPU" en muchos PCs.
- **Suspender/destruir el hub**: estado en curso (Studio con cambios sin guardar, OAuth) debe persistir; regla: nunca suspender con cambios sin guardar; avisar y no suspender.
- **Bounding box de ventana**: widgets en esquinas opuestas anulan el ahorro; documentarlo en Studio ("esta disposición ocupa toda la pantalla").
- **Migración v4**: perfiles compartidos por la comunidad con `updateHz`; el lector v3 debe seguir aceptándolos indefinidamente.
- **Falsa promesa de ganancia**: si HUD swap no gana, no se comunica como ganancia. El gate 6 lo impide.

## 14. Preguntas y respuestas de Isaac (2026-08-28)

| # | Pregunta | Respuesta | Dónde aplica |
|---|---|---|---|
| P1 | ¿Personalizado en ajustes de app o en el perfil? | **En el perfil**: cada perfil tiene N widgets y rendimiento distinto. | D4, §7.4 |
| P2 | ¿Automático mide el frametime del juego (permisos) o solo CPU? | **Automático** (con medida del juego). | D7, §9 |
| P3 | ¿Nivel 1 solo manual? | **Sí.** | D7 |
| P4 | ¿Variantes para todos los design systems? | **Solo Endurance**; los demás desaparecen pronto. | D9 |
| P5 | ¿Nivel 5 destruye el hub (~1 s al abrir)? | **Sí, totalmente.** | D10 |
| P6 | ¿Nombres genéricos o con marca? | Se probó jerga de carrera (PUSH/PACE/FCY); Isaac decide **nombres directos**: Máximo · Alto · Equilibrado · Ahorro · Mínimo · Personalizado · Automático. | §5.1 |
| P7 | ¿Widget "Coste" para todos? | **Para todos**, con comparación frente al HUD de LMU si somos mejores. | D18, gate 12.6 |
| P8 | ¿Transporte dirigido dentro de #912 o issue propia? | **Issue propia.** | D19 |
| P9 | ¿Atribución (pprof/heap) ahora? | **Esperar** a que termine la optimización de #912; si llega a un óptimo se valora, si no se sigue con este plan. | §15 F0 |
| P10 | ¿Instalo PresentMon? | **Sí**, al arrancar F0. | §8 |
| P11 | ¿Cerrar Edge/WebView2 ajenos al medir? | **Sí, cerrar todo.** | §8 |
| P12 | ¿Escena del A/B? | **Coche en pista parado.** | §8 |
| P13 | ¿Se acepta el gate RAM de F2 con el resultado de #940? | **Sí, ≥ 20 %.** El −30 % original requería el Hub a cero y además recortar GPU process/renderer del overlay; ese trabajo continúa en [#951](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/951). | §12.2, #951 |

Pendiente de Isaac: elegir el juego de nombres de §5.1 y diseñar las variantes `noBlur`/`flat` de Endurance (D9).

Nota: el re-render de raíz por frame (`CompositeApp.tsx:43` → `RuntimeOverlaySurface.tsx:176`) está **resuelto en una rama sin mergear** (Isaac, 2026-08-28); este spec lo da por hecho y no lo repite.

## 15. PLAN (fases; cada una con issue propia y gate)

| Fase | Contenido | Gate |
|---|---|---|
| F0 | Banco §8 sobre la build actual (baseline por hardware) + script público | Tabla baseline en `docs/analysis` |
| F1 | `PerformancePolicy` + ajustes + `capabilities.performance` + niveles manuales; widgets leen el techo; migración v4 | Gate 12.1-12.3 con niveles manuales |
| F2 | Lifecycle: entry propio del overlay, hub suspendido/destruido, bounding box, EcoQoS, ingeniero solo audio | Gate 12.2 con hub minimizado |
| F3 | Sensor + Automático + histéresis | Gate 12.4 |
| F4 | Variantes `noBlur`/`flat` (Isaac) + Personalizado + widget "Coste" + informe post-sesión | Gate 12.5, P4, P7 |
| F5 | HUD swap: perfil + asistente + medida | Gate 12.6 |
| F6 | Decisión composición con resultados del spike (§10); ADR | Gate 12.1 en iGPU/VR |

Condición de arranque (P9): **F0 no empieza hasta que #912 cierre su ciclo de optimización y publique su medida.** Si su resultado es óptimo, se revisa este spec; si no, F0 arranca sobre ese SHA.

## 16. TASKS · primera ola (F0 + F1), redactadas, no autorizadas

Issues a crear cuando se autorice (nombres provisionales, rama `vantareapp/isa-<n>-…` cada una):

**Issue A · Huella mínima — banco y baseline (F0)**
- T0.1 Instalar PresentMon 2.x en PATH; verificar que convive con la sesión ETW de Radeon Software; documentar en `docs/analysis`.
- T0.2 Script `scripts/bench/huella.ps1`: cierra Edge/WebView2 ajenos, lanza la app con `VANTARE_WEBVIEW_DEBUG_PORT`, muestrea 1 Hz durante 180 s Private Bytes/WS/CPU/GPU por proceso (árbol Go + WebView2 propios por `--user-data-dir`), captura PresentMon del proceso del juego, escribe CSV + resumen Markdown. Condiciones A0/A1/hub visible/minimizado.
- T0.3 Perfil de referencia: Endurance `full`, 3 widgets (standings, relative, delta) y perfil "completo" (todos los widgets de §6). Escena: coche parado en pista, parrilla IA máxima.
- T0.4 Ejecutar baseline ×3 en este PC; publicar `docs/analysis/huella-minima-baseline-<fecha>.md`. Gate: ruido ≤ 5 %.
- T0.5 Atribución: `net/http/pprof` en builds sin `-tags production`; perfil CPU y heap de 30 s en A1; dos heap snapshots CDP a 10 min para la fuga de +22 MiB/min. Entregable: tabla "dónde se va cada core y cada MB".

**Issue B · Transporte dirigido por ventana (D19, dependencia de F1)**
- T B.1 `Publisher` emite con `window.EmitEvent` solo a la ventana overlay; hub recibe `status` a 1 Hz.
- T B.2 Payload como string y `JSON.parse` en el store v2; medir compilación de literal vs parse.
- T B.3 Spike: overlay consumiendo el SSE local en vez de `ExecJS`; comparar browser process y renderer. Adoptar solo si gana ≥ 10 % (gate #912).

**Issue C · PerformancePolicy y niveles manuales (F1)**
- T1.1 `internal/app/performance/policy.go`: tipos de §7, resolución de nivel efectivo (perfil `inherit`/`level`/`custom` + defecto de app), mapeo nivel → `SectionCadence` (multiplicadores §5) y `EffectsBudget`.
- T1.2 Publicar `capabilities.performance` en `OverlayFrame v2` (sección slow + dirty); tests golden 1/20/44/104 actualizados.
- T1.3 Ajustes › Rendimiento en el hub: 5 niveles + Personalizado + Automático (Automático deshabilitado hasta F3, muestra "próximamente"); textos de §5; nombres de §5.1 según elección.
- T1.4 Perfil v4: `performance` en el documento; lector v3 → v4 (descarta `updateHz`, registra atípicos); Studio muestra el nivel del perfil y el override.
- T1.5 Coordinador visual: `rafCap` por nivel y techo por widget desde `widgetHz`; widgets no calculan nada.
- T1.6 Endurance: puntos de extensión `data-effects="full|noBlur|flat"` en el design system para que Isaac diseñe las variantes (D9) sin tocar lógica.
- T1.7 Banco A/B con niveles 1, 3 y 5 manuales frente a baseline. Gate 12.1-12.3.

Paridad obligatoria: cualquier atajo o control nuevo con teclado, ratón y OBS; i18n en los cuatro idiomas; evidencia antes/después con SHA en cada PR.
