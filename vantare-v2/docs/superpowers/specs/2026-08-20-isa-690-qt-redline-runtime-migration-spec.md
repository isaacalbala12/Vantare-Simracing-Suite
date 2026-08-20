# Spec (SDD · SPECIFY): migración gradual del runtime ingame Redline a Qt Quick

Fecha: 2026-08-20. Issue: [#690](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/690) (`OS-QT-01`). Proyecto: GitHub Project **Vantare**, estado **In Progress**. Rama: `vantareapp/isa-690-sdd-migracion-qt-redline`. Base: `origin/nightly@64a33318a8a852c0e089b221357b8e4e8e3c442c`.

Estado SDD: **SPECIFY y PLAN aprobados explícitamente por Isaac el 2026-08-20; TASKS P0/P1 autorizadas**. No autoriza promoción, release, ampliación de alcance ni continuar tras un resultado STOP.

---

## 1. Decisión que esta spec propone

Construir un segundo runtime **solo para el overlay ingame de escritorio** que
renderice con Qt Quick los diseños de la familia **Vantare Endurance Redline**:

- Standings — `standings-endurance-redline`;
- Relative Mirror — `relative-endurance-redline-mirror`;
- Relative Proximity — `relative-endurance-redline-proximity`;
- Relative Traffic — `relative-endurance-redline-traffic`;
- Delta — `delta-endurance-redline`;
- Pedals — `pedals-endurance-redline`.

No se migran todos los diseños ni todos los widgets. El runtime Wails/WebView2
permanece productivo, fuente de comparación y fallback. Studio, Workshop, OBS y
las previews continúan usando `WidgetVisualHost` y los renderers TSX/CSS.

La migración será por gates y reversible. En ningún momento dos motores deben
dibujar simultáneamente el mismo perfil.

## 2. Objetivo de producto

Reducir el coste del overlay ingame sin perder la identidad visual, las
animaciones ni el comportamiento operativo actual:

1. conservar el diseño Redline completo en sus cuatro tipos de widget y tres
   variantes de Relative;
2. reducir RAM, CPU y GPU frente al runtime Wails medido en la misma máquina y
   con el mismo perfil;
3. conservar transparencia alpha por píxel, topmost, no-focus y click-through;
4. preservar DPI, multimonitor, ultrawide, captura OBS y lifecycle del overlay;
5. consumir contratos estables de producto, sin depender de las estructuras
   internas del Telemetry Core que están siendo simplificadas;
6. permitir rollback inmediato a Wails sin migrar ni reescribir perfiles;
7. mantener la solución lo más pequeña posible: un sidecar, un protocolo
   acotado, un selector y una única implementación QML Redline.

## 3. Evidencia de partida

### 3.1 Benchmark ISA-370 / issue #659

El benchmark aislado no autoriza una migración, pero sí justifica el spike:

| Runtime, renderer activo | CPU mediana | RAM privada | GPU 3D | Arranque HWND |
| --- | ---: | ---: | ---: | ---: |
| Qt Quick | 0,37 % | 109,0 MiB | 0,38 % | 206,6 ms |
| Wails/WebView2 | 0,90 % | 250,1 MiB | 0,83 % | 493,2 ms |
| Direct2D | 0,73 % | 65,4 MiB | 2,70 % | 183,6 ms |

En el pipeline Go del benchmark, Qt mantuvo la ventaja observada: 0,51 % CPU,
125,0 MiB privados y 0,45 % GPU frente a 1,20 %, 268,4 MiB y 0,83 % de Wails.
Qt pasó los gates físicos de alpha, topmost/no-focus y click-through, y el gate
visual cross-engine de las escenas iniciales. Quedaron pendientes iGPU/híbrida,
DPI/multimonitor, OBS, anti-cheat y soak.

### 3.2 Spike Redline completo

El spike local posterior construyó la familia visual completa en Qt Quick:
Standings, Relative Mirror/Proximity/Traffic, Delta y Pedals. Validó Qt 6.10.2,
QML, modelos keyed, replay determinista y shell de ventana.

Límite abierto y vinculante: Standings mostró un coste síncrono de actualización
QML cercano a 30 ms p95 en el caso medido. Un intento con `Qt.callLater`
desplazó el trabajo pero empeoró la primera respuesta física; fue revertido.
Por tanto, el spike prueba viabilidad visual, no paridad temporal productiva.

### 3.3 Runtime actual en `origin/nightly`

- `OverlayController` posee una sola ventana de overlay por perfil.
- `wailsOverlayFactory` crea una ventana fullscreen transparente y aplica
  click-through mediante `window.Manager`.
- `DesktopOverlayRuntime` usa `RuntimeOverlaySurface` y un
  `RuntimeWidgetFrame` por widget.
- `WidgetVisualHost` construye el ViewModel y selecciona el renderer visual.
- La misma frontera visual sirve a Studio, Desktop, OBS y Workshop por ADR 0003.
- El modo edición in-place se aplica a la ventana activa sin recrearla.
- El frame Overlay v2 existe en Go, pero #677 aún gobierna su cutover y varias
  capacidades necesarias para Redline siguen en shadow o declaradas ausentes.

Conclusión: sustituir `WidgetVisualHost` globalmente rompería consumidores que
no están en alcance. La selección debe ocurrir antes de crear la ventana
desktop y debe conservar Wails para cualquier perfil o función no soportada.

## 4. Supuestos propuestos

Estos supuestos son parte de la aprobación de SPECIFY:

1. **Solo ingame desktop.** OBS sigue siendo la superficie web actual. Que OBS
   capture la ventana Qt es un gate operativo, no una migración de OBS a Qt.
2. **Solo Redline.** Track Map, Broadcast Tower, Engineer, flags y cualquier
   otro diseño o tipo de widget fuerzan Wails.
3. **Perfil completo, un motor.** Qt solo es elegible si todos los widgets que
   pueden aparecer en cualquier layout del perfil son compatibles.
4. **Wails sigue siendo autoridad visual.** TSX/CSS productivo define el aspecto
   y el comportamiento; QML es un porte ingame manual y acotado.
5. **Overlay v2 es la frontera de datos.** Qt no importa `telemetry/core`,
   drivers, reducer, `lmu`, stores del frontend ni `TelemetrySnapshot` legacy.
6. **Sin generador visual.** No se crea DSL, compilador CSS→QML ni sistema de
   plugins. La paridad se mantiene con fixtures, replays y gates.
7. **Sidecar separado.** Qt vive en un único proceso hijo x64; no se embebe Qt
   por cgo ni se carga dentro del proceso Wails.
8. **Sin retirada de Wails en este programa.** Convertir Qt en default o borrar
   el fallback exige otra decisión y otra issue después del soak en testers.

## 5. Alcance

### Incluido en el programa posterior a esta spec

- ADR que enmiende de forma estrecha ADR 0003 para el runtime ingame Redline.
- Sidecar Qt Quick x64 empaquetado con la aplicación Windows.
- Selector `wails | qt-redline` con default Wails y resultado efectivo
  observable.
- Elegibilidad fail-closed por perfil completo.
- Supervisión del proceso, pipe acotado, handshake, shutdown y fallback.
- Consumo del contrato público Overlay v2 y de la configuración V3 del perfil.
- Familia visual Redline completa y sus animaciones productivas.
- Fuente Barlow Semi Condensed empaquetada y versionada para raster estable.
- Gates visuales, motion, funcionales, rendimiento, hardware y soak.
- Toggle experimental para Nightly/Testers y rollback a Wails.
- Packaging, licencias de terceros, CI, diagnósticos y documentación.

### Fuera de alcance

- Migrar Original, Crystal, Neo u otros diseños Endurance.
- Track Map o widgets distintos de Standings, Relative, Delta y Pedals.
- Migrar Studio, Workshop, preview, in-place editor u OBS renderer a Qt.
- Cambiar la semántica de Telemetry Core o resolver deuda de #677 dentro de
  esta migración.
- Shared memory, GPU interop, custom scene graph nodes o un motor de animación
  propio antes de demostrar que Qt Quick estándar no alcanza el gate.
- Hot reload productivo entre TSX y QML, codegen visual o sincronización
  automática de estilos.
- Soporte Linux/macOS, ARM64 o un segundo simulador en el primer corte.
- Eliminar WebView2, Wails o `WidgetVisualHost`.
- Promover a `nightly`, `testers` o `master`, ni publicar una release, sin la
  autorización separada de Isaac.

## 6. Arquitectura propuesta

```text
TelemetryEngine / Overlay Projection v2 (Go, autoridad)
                    │
             OverlayUpdateV2
                    │
     ┌──────────────┴──────────────┐
     │ selector de runtime (Go)    │
     │ perfil + preferencia + gate │
     └──────────────┬──────────────┘
             ┌──────┴──────┐
             │             │
     Wails/WebView2    Qt Redline sidecar
     fallback actual   pipe JSON enmarcado
             │             │
     WidgetVisualHost   C++ modelos keyed
     TSX/CSS Redline    QML Redline
```

### 6.1 Proceso Qt

Un único ejecutable, por ejemplo `vantare-redline-renderer.exe`, contiene C++,
QML, fuentes y recursos. No abre red, no lee perfiles del disco, no consulta
licencias y no conoce el simulador. Recibe por argumentos únicamente:

- identificador de protocolo;
- rectángulo del monitor y escala DPI inicial;
- handles heredados del canal de entrada y, si se necesita, del canal de
  diagnóstico;
- un identificador de ejecución no sensible.

Go es dueño de creación, parada, timeout, crash y rollback. Solo existe un
sidecar por overlay activo.

### 6.2 Protocolo mínimo

Se usa JSON UTF-8 con framing de longitud fija (4 bytes little-endian + payload)
y máximo 1 MiB por mensaje. No se introduce protobuf, RPC ni shared memory.

Mensajes permitidos en v1:

```go
type RedlineMessageKind string

const (
    RedlineInit     RedlineMessageKind = "init"
    RedlineFrame    RedlineMessageKind = "frame"
    RedlineShutdown RedlineMessageKind = "shutdown"
)

type RedlineInitV1 struct {
    ProtocolVersion uint16
    ProfileRevision string
    Document        config.ProfileDocumentV3
    OverlayContract uint16
}

type RedlineFrameV1 struct {
    ProtocolVersion uint16
    Update          overlayv2.UpdateV2
}
```

Los nombres son orientativos para PLAN; la semántica es vinculante:

- `init` aparece exactamente una vez y debe validar perfil, versión y límites;
- `frame` solo aparece después de `init` y conserva epoch/sequence/quality;
- `shutdown` permite cierre limpio; EOF también cierra;
- longitud inválida, JSON inválido, versión desconocida, secuencia regresiva o
  perfil incompatible cierran el sidecar con diagnóstico tipado;
- el productor mantiene como máximo un frame pendiente: latest-wins;
- el canal nunca transporta telemetría cruda ni structs internas del Core.

Un cambio del documento o de modo reinicia el runtime. El primer corte no añade
un protocolo de hot-reload: recrear de forma limpia es más pequeño y auditable.

### 6.3 Modelo de datos y dependencia de #677

El sidecar consume el producto estable que también alimentará al frontend tras
el cutover de Telemetry Core. No crea una segunda proyección.

Antes de habilitar Qt, Overlay v2 debe publicar o declarar explícitamente todos
los datos que los cuatro widgets necesitan. Como mínimo:

| Widget | Datos requeridos del contrato de producto |
| --- | --- |
| Standings | sesión/tipo/tiempo, filas ordenadas, identidad, posición general y de clase, clase, piloto, dorsal si existe, pit, gap/laps, interval, mejor vuelta, líder/player y calidad |
| Relative | identidad, jugador, lado, gap nullable, clase, autoridad, orden estable y calidad |
| Delta | valor, referencia solicitada/efectiva, referencias disponibles, mejor vuelta visible y calidad |
| Pedals | throttle, brake, clutch e historial/tiempo suficiente para peak, con calidad |

Cuando un campo no existe, el contrato lo declara `missing`; Qt no lo inventa.
Las reglas de dominio —orden, selección de Relative, referencia de Delta,
identidad y pit— pertenecen a Go. QML conserva formato, redondeo, color, layout,
interpolación y animación.

Dependencia: PLAN puede avanzar en infraestructura y fixtures, pero el opt-in
productivo queda bloqueado hasta que #677 cierre la matriz Redline y el gate de
estabilidad de Overlay v2 para estas features.

### 6.4 Selector y elegibilidad

Preferencia persistida:

```text
wails       → fuerza el runtime actual
qt-redline  → intenta Qt; vuelve a Wails si no es elegible o falla
```

No se añade `auto` en el primer corte. Evita cambiar silenciosamente el motor a
usuarios que no lo han elegido. Nightly/Testers muestran el motor solicitado y
el efectivo.

Un perfil es elegible solo cuando:

1. `displayMode == racing`;
2. todos los widgets habilitados de todos sus layouts son uno de los seis
   diseños oficiales listados en §1;
3. `systemVersion`, `configVersion` y `templateId` coinciden con la versión que
   declara soportar el bundle Qt;
4. no contiene widgets legacy preservados ni diseños desconocidos;
5. no requiere subtítulos de Engineer, banner de calendario u otra capa global
   que el sidecar aún no implemente;
6. Overlay v2 declara disponibles las features requeridas;
7. el artefacto Qt y su manifiesto de despliegue están presentes y válidos.

La evaluación es pura y devuelve una causa observable. No existe selección por
widget ni dos ventanas superpuestas.

### 6.5 Edición in-place y cambios de perfil

Qt no implementa el editor. Al solicitar `ModeEdit`, guardar un perfil activo o
activar una capa global no soportada, el controlador:

1. detiene Qt;
2. crea la ventana Wails con el mismo documento;
3. aplica el modo solicitado;
4. actualiza el motor efectivo y emite un diagnóstico.

Volver a racing no reactiva Qt automáticamente durante esa sesión. El usuario
puede reiniciar el overlay si quiere volver a intentarlo. Esto evita un bucle de
ventanas y mantiene el rollback predecible.

### 6.6 Fallo y rollback

Fuerzan fallback una única vez por arranque:

- sidecar ausente o hash/manifest inválido;
- handshake o primer frame fuera de timeout;
- salida inesperada o pipe roto;
- protocolo, perfil o frame inválido;
- dispositivo gráfico perdido sin recuperación acotada;
- petición de modo o superficie no soportada.

Tras el fallback no se relanza Qt automáticamente. Wails permanece hasta que el
usuario reinicia el overlay. No se escriben perfiles ni se cambian diseños.

## 7. Autoridad visual y motion

### 7.1 Fuente de verdad

La fuente visual sigue siendo:

- `frontend/src/overlay/design-systems/vantare-endurance/**`;
- `frontend/src/overlay/design-systems/vantare-endurance/tokens.css`;
- fixtures y escenas productivas de Workshop;
- ViewModels y motion derivado productivos.

QML se organiza por la familia Redline, no por un framework genérico:

```text
native/qt-redline/
  CMakeLists.txt
  src/                 proceso, protocolo, modelos, lifecycle
  qml/
    theme/             tokens Redline
    common/            panel, status, slot
    standings/
    relative/
    delta/
    pedals/
  resources/fonts/     Barlow Semi Condensed + licencia
  tests/               contrato, QtTest, QML, protocolo
```

Se permiten componentes comunes solo cuando ya existen en dos widgets y
conservan la semántica observable. No se crea un renderer genérico, árbol CSS,
DSL ni registro extensible.

### 7.2 Escenas obligatorias

El replay de paridad se deriva de los ViewModels productivos y queda fijado por
manifest/hashes. Debe cubrir las 15 escenas Redline existentes:

- Standings: overtake, battle, fastest, tire, delta chip, car enter,
  retirement, final minutes y full;
- Relative: cross y enter en sus tres variantes cuando aplique;
- Delta: cross-zero y new-best;
- Pedals: input/peak/saturation.

Además se prueban los estados `ready`, `disconnected`, `missing`, `stale` y
`error`, encabezados opcionales y configuración visible de cada diseño.

### 7.3 Contrato motion

La implementación usa animaciones estándar de Qt Quick. Antes de añadir un
motor propio se debe demostrar, con perfil, que un gate no puede alcanzarse.

Requisitos:

- identidad keyed: un update no resetea listas completas;
- roster add/move/remove causal, no animación al montar un snapshot inicial;
- mismas duraciones, easings, límites y presupuestos de eventos que TSX/CSS;
- `reducedMotion` reproduce la conducta productiva, incluida cualquier
  asimetría intencional;
- un frame de telemetría no bloquea el hilo UI durante más de un frame;
- no se usa `Qt.callLater` como parche sin prueba física de mejora.

### 7.4 Contrato de mantenimiento visual

Una modificación futura de Redline sigue este orden:

1. cambia el renderer TSX/CSS productivo y sus fixtures;
2. actualiza el porte QML en la misma issue o declara Qt temporalmente no
   elegible para esa versión del diseño;
3. ejecuta los gates estático y motion afectados;
4. actualiza la versión soportada que anuncian el selector y el sidecar.

La elegibilidad comprueba `systemId`, `systemVersion`, `configVersion`,
`templateId` y las capacidades visibles del bundle Qt. Un bundle atrasado no
intenta aproximar un diseño nuevo: selecciona Wails. Así Studio conserva HMR y
autoría rápida sin convertir QML en otra fuente de verdad silenciosa.

## 8. Rendimiento y presupuestos

Los números del benchmark son baseline, no promesa. Los gates se repiten con el
perfil Redline completo y el mismo binario Go.

### 8.1 Gate por actualización

Perfil de estrés: Standings 104 filas + Relative + Delta + Pedals.

| Métrica Qt | Objetivo | Hard gate inicial |
| --- | ---: | ---: |
| Aplicación de un frame, p95 | ≤ 5 ms | ≤ 8 ms |
| Aplicación de un frame, máximo sostenido | ≤ 12 ms | ≤ 16,67 ms |
| Cola pendiente | latest-wins, 0 crecimiento | máximo 1 frame |
| UI hitch atribuible al update | 0 | 0 > 50 ms |

El Standings spike (~30 ms p95) no pasa. La primera corrección permitida es
incremental: actualizar solo filas y roles modificados, sin reset del modelo ni
recrear el árbol QML. Si eso no basta, se vuelve a SPECIFY antes de introducir
threads, render nodes o buffers complejos.

### 8.2 Gate del árbol completo

Misma máquina, orden rotado, Release x64, tres repeticiones por caso y raw
custodiado:

| Métrica | Qt objetivo | Gate frente a Wails |
| --- | ---: | ---: |
| RAM privada activa | ≤ 150 MiB | al menos 35 % menor |
| CPU activa | ≤ 1,0 % en baseline ISA-370 | no peor que Wails +10 % relativo |
| GPU 3D activa | ≤ 1,0 % en baseline ISA-370 | no peor que Wails +10 % relativo |
| Arranque hasta primer frame | ≤ 350 ms | mejor que Wails |
| Procesos residuales al cerrar | 0 | 0 |

Si el hardware o el perfil real invalidan un umbral absoluto, cambiarlo exige
decisión humana con datos Wails/Qt de la misma corrida; nunca se rebaja para
hacer verde un resultado aislado.

## 9. Gates de paridad y funcionamiento

### Gate A — contrato y runtime headless

- protocolo fail-closed y límites;
- corpus de escenas exacto y hashes;
- modelos keyed con insert/move/remove/dataChanged sin reset;
- 15 escenas cargan en Qt 6.10.2;
- build Release `/W4 /WX`, QtTest, CTest y `qmllint` verdes;
- ningún import de Telemetry Core interno, Wails, red o persistencia.

### Gate B — estático visual

Para cada widget/variante/estado, a tamaño canónico y con la misma fuente:

- texto, filas, roles y features exactos;
- geometría: desviación máxima 1 px;
- mismatch cross-engine ≤ 8 % con tolerancia 12 por canal;
- mean absolute RGB ≤ 5,0;
- alpha exterior exactamente 0 y sin fondo del escenario dentro del widget.

### Gate C — motion físico

Primero se fija ruido Wails/Wails. Después, tres corridas Qt/Qt y tres
Wails/Qt por escena para el PR; diez corridas quedan reservadas al gate de
promoción, no a cada cambio local.

- onset lógico p95 dentro de ±16,67 ms;
- primera respuesta física frente a Wails dentro de ±16,67 ms;
- duración: diferencia ≤ max(16,67 ms, 5 %);
- trayectoria visual: RMSE ≤ 1 px y máximo ≤ 2 px;
- eventos/subjects exactos, sin eventos omitidos ni adicionales;
- stable frames y motion matte dentro del ruido Wails/Wails;
- pacing medido con PresentMon; WGC se usa para píxeles, no para contar presents.

### Gate D — ventana real

- alpha black/white reconstruido en card, shadow y exterior;
- click-through físico cross-process en contenido, sombra y exterior;
- topmost y ausencia de focus steal;
- cierre, restart y crash fallback sin ventanas fantasma;
- racing→edit cambia a Wails y conserva el perfil;
- 10 ciclos start/stop con residual 0.

### Gate E — hardware y captura

- Windows 10 y 11;
- DPI 100/125/150 %;
- 1080p, 1440p, 4K y 32:9;
- monitor primario/secundario, coordenadas negativas y hot-plug controlado;
- dGPU, iGPU y GPU híbrida cuando haya hardware disponible;
- OBS Window/Game Capture con alpha/composición documentados;
- LMU con anti-cheat: el juego arranca, corre y cierra sin incidente atribuible
  al sidecar Qt.

### Gate F — soak y rollback

- ≥2 horas con sesión real o replay productivo equivalente;
- reconnect de telemetría, ventana abierta tarde y cambio de sesión;
- memoria sin crecimiento sostenido y cero deadlock/crash;
- matar el sidecar produce Wails funcional una sola vez;
- artefacto Qt ausente/corrupto produce Wails y diagnóstico;
- preferencia `wails` desactiva completamente Qt sin reinstalar.

## 10. Rollout propuesto

Cada etapa se entrega en issue y PR propios. Ninguna etapa implica la siguiente.

1. **R0 — documentación y ADR.** Aprobar esta spec, PLAN/TASKS y una enmienda
   estrecha de ADR 0003. Sin código runtime.
2. **R1 — candidate actualizado.** Portar el spike Redline a la punta de
   `nightly`, empaquetar replay/fuente y cerrar Gate A. No se conecta al producto.
3. **R2 — supervisor dev-only.** Sidecar, protocolo, selector puro y fallback
   detrás de variable de desarrollo; default Wails.
4. **R3 — integración Overlay v2.** Conectar solo cuando la matriz de datos de
   #677 esté completa; perfil Redline íntegro; Gate B/D.
5. **R4 — motion y rendimiento.** Resolver incrementalmente el coste Standings;
   cerrar Gate C y presupuestos. Sin nueva arquitectura si no hay evidencia.
6. **R5 — Nightly opt-in.** Toggle experimental, default Wails, diagnósticos y
   rollback; cerrar Gate E/F con testers internos.
7. **R6 — Testers opt-in.** Cohorte acotada, ≥2 ciclos, resultados y decisión
   humana. Wails sigue instalado y accesible.
8. **R7 — decisión separada.** Solo con evidencia: mantener opt-in, convertir
   Qt en preferencia por defecto para perfiles elegibles o detener la migración.

No existe una etapa de “borrar Wails” dentro de #690.

## 11. Issue map propuesto para PLAN

No se crean estas issues hasta aprobar SPECIFY y PLAN:

| Ola | Issue propuesta | Depende de | Resultado |
| --- | --- | --- | --- |
| 0 | ADR runtime Redline dual | #690 | excepción estrecha a ADR 0003 |
| 1 | Qt Redline candidate sobre nightly | ADR, #659 | Gate A y corpus portable |
| 2 | Supervisor/protocolo/selector dev-only | ola 1 | sidecar reversible, default Wails |
| 3 | Contrato Overlay v2 Redline completo | #677 | matriz de datos sin legacy |
| 4 | Integración profile/runtime | olas 2–3 | perfil Redline en Qt detrás de flag |
| 5 | Motion/performance Standings | ola 4 | Gate C y presupuestos |
| 6 | Packaging/CI/terceros | olas 1–5 | instalador reproducible |
| 7 | Nightly opt-in y hardware | olas 5–6 | Gates D/E/F |
| 8 | Testers y decisión | ola 7 | aceptar, mantener opt-in o abortar |

## 12. Estructura objetivo orientativa

```text
internal/app/overlayruntime/
  selector.go                 elegibilidad pura y causa
  controller.go               lifecycle/fallback sobre OverlayController
  protocol.go                 framing y mensajes acotados
  qt_process_windows.go       proceso hijo/handles/timeout
  *_test.go

native/qt-redline/
  CMakeLists.txt
  src/
  qml/{theme,common,standings,relative,delta,pedals}/
  resources/fonts/
  tests/

frontend/src/overlay/
  design-systems/vantare-endurance/**   autoridad visual, sin duplicar host

tools/overlay-redline-parity/
  manifest/replay y runner físico reutilizable, no runtime
```

PLAN debe confirmar nombres contra la estructura vigente. Se evita un paquete
`utils`, una interfaz genérica de renderers o mover código Wails no relacionado.

## 13. Estilo de implementación

Go simple, errores tipados, límites visibles y ownership explícito:

```go
type EligibilityReason string

const (
    EligibleRedline       EligibilityReason = "eligible-redline"
    IneligibleWidget      EligibilityReason = "unsupported-widget"
    IneligibleDisplayMode EligibilityReason = "unsupported-display-mode"
)

type RuntimeDecision struct {
    Requested string
    Effective string
    Reason    EligibilityReason
}

func SelectRuntime(document *config.ProfileDocumentV3, requested string) RuntimeDecision {
    // Función pura: no crea procesos, no escribe settings y nunca panic.
}
```

C++/QML:

- RAII para handles y recursos;
- modelos keyed, tipos explícitos y cero singletons mutables;
- `required property` en QML cuando el dato sea obligatorio;
- timers/animaciones con teardown y reduced motion;
- ninguna excepción cruzando callbacks Qt;
- no se ignoran errores de parseo ni versiones.

## 14. Estrategia de pruebas

### Unitarias

- tabla de elegibilidad por diseño/layout/modo/capability;
- framing parcial, oversize, orden, EOF y versión desconocida;
- latest-wins y cierre sin goroutine/proceso residual;
- perfil no elegible y crash → Wails exactamente una vez;
- modelos keyed y projection mapping por widget;
- reglas motion puras con prev→next.

### Integración

- Go lanza un sidecar falso para timeout/crash/handshake;
- Qt consume `init + frames + shutdown` reales;
- 15 escenas y estados en QtTest/QML;
- perfil completo cambia de sesión sin recrear widgets incorrectamente;
- edit/save/global-layer produce fallback controlado.

### Visual/física

- raster offscreen para feedback rápido;
- WGC para píxeles físicos y alpha;
- PresentMon para presents/pacing;
- probe Win32 cross-process para click-through/focus/topmost;
- pruebas seriales, run id único, ejecutable/manifiesto/fuentes hasheados y
  residual 0.

### Comandos de referencia

```powershell
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short

go test ./internal/app/... ./internal/telemetry/projection/... -count=1
go test ./... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint

powershell -NoProfile -ExecutionPolicy Bypass -File native/qt-redline/build-test.ps1
cmake --build native/qt-redline/build --config Release
ctest --test-dir native/qt-redline/build -C Release --output-on-failure
qmllint --max-warnings 0 native/qt-redline/qml/**/*.qml

python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly
git diff --check
```

Los comandos definitivos y sus paths pertenecen a PLAN/TASKS; no se copian
scripts del benchmark a producto sin review.

## 15. Packaging y distribución

- Qt queda fijado a una versión exacta aprobada; el spike usa Qt 6.10.2.
- `windeployqt` o un manifiesto equivalente produce una carpeta determinista.
- El instalador incluye solo DLL/plugins usados, QML compilado/recursos, fuente
  y avisos de licencia.
- CI verifica arquitectura, versión, hashes, plugins de plataforma y arranque
  headless antes de empaquetar.
- No se descarga Qt ni plugins en runtime.
- El sidecar se firma junto al binario principal en los canales que firman.
- El artefacto faltante no impide arrancar Vantare: selecciona Wails.
- La revisión de licencia/distribución de Qt y Barlow es gate previo al primer
  instalador compartido; esta spec no emite una conclusión legal.

## 16. Observabilidad

Solo métricas sanitizadas y acotadas:

- motor solicitado/efectivo y causa de fallback;
- tiempo de arranque/handshake/primer frame;
- frames enviados, coalescidos y rechazados;
- p50/p95/max de aplicación en Qt;
- salida/crash/device-lost del sidecar;
- versión de protocolo, Qt y artefacto;
- nunca payloads de telemetría, nombres de pilotos ni paths privados.

El diagnóstico del Hub debe decir “Wails” o “Qt Redline” y por qué hubo
fallback. No se añade telemetría remota en esta spec.

## 17. Límites de actuación (Always / Ask first / Never)

### Siempre

- rama/worktree aislados desde la última `origin/nightly`;
- issue GitHub y Project Vantare actualizados con estado real;
- cambios pequeños, tests causales, diff completo revisado y handoff vivo;
- Wails default/fallback hasta aprobación posterior;
- contrato Overlay v2 como única entrada de datos Qt;
- un solo motor y una sola ventana por perfil;
- fail-closed, límites de tamaño/tiempo y residual 0;
- comparar mismo perfil, máquina, binario Go y ventana temporal;
- conservar raw, hashes, versiones y límites de la evidencia;
- actualizar `docs/roadmap/plan.md` en el mismo PR cuando cambie el plan.

### Preguntar antes

- aceptar esta SPECIFY, PLAN o TASKS;
- cambiar ADR 0003 o aceptar el nuevo ADR;
- añadir Qt/SDK/fuentes como dependencia distribuida;
- cambiar el contrato Overlay v2 o los presupuestos;
- introducir threads de render, custom scene graph, shared memory o un protocolo
  distinto del framing JSON mínimo;
- aceptar una divergencia visual/motion;
- habilitar el toggle a usuarios, cambiar el default o retirar Wails;
- push, PR, promoción, release o anuncio.

### Nunca

- leer el simulador desde Qt;
- importar structs internas del Core o usar `map[string]any` como contrato;
- ejecutar Qt y Wails simultáneamente para el mismo perfil;
- migrar perfiles para que solo funcionen en Qt;
- ocultar un fallo Qt o relajar gates para hacerlo pasar;
- duplicar Studio/Workshop/OBS en QML;
- crear un DSL/codegen visual, bus genérico o framework de plugins;
- descargar dependencias en runtime;
- borrar Wails, legacy o evidencia desde este programa;
- editar `docs/roadmap/roadmap.json` manualmente.

## 18. Criterios de éxito

El programa puede considerarse listo para una decisión de default solo si:

1. los seis diseños oficiales de §1 se renderizan en Qt;
2. perfiles con cualquier otro contenido usan Wails sin pérdida;
3. Overlay v2 cubre la matriz Redline y no hay lectura legacy en Qt;
4. Studio, Workshop y OBS conservan `WidgetVisualHost` sin divergencia funcional;
5. Gate A–F pasan con evidencia auditable;
6. Standings cierra el p95 de update y el onset físico sin workaround opaco;
7. Qt conserva alpha/click-through/topmost/no-focus en hardware objetivo;
8. RAM mejora al menos 35 % y CPU/GPU no empeoran frente a Wails;
9. crash, artefacto ausente, edit mode y perfil incompatible vuelven a Wails;
10. no hay procesos, ventanas, handles o memoria crecientes tras soak;
11. instalador, licencias, firma y CI están verificados;
12. ≥2 ciclos Nightly y la cohorte Testers revisan métricas y visuales;
13. Isaac aprueba explícitamente cualquier cambio de default.

El resultado válido también puede ser **STOP**: si Qt no cierra motion,
hardware, packaging o mantenimiento sin aumentar claramente la complejidad, se
conserva Wails y se archiva el candidate con la evidencia.

## 19. Decisiones aprobadas por Isaac para cerrar SPECIFY

Isaac aprobó explícitamente esta propuesta el 2026-08-20:

1. aprobar el alcance **ingame desktop + solo Redline**;
2. aprobar selección **por perfil completo**, nunca por widget;
3. aprobar **sidecar Qt + pipe JSON enmarcado** como arquitectura mínima;
4. mantener **Wails default y fallback** durante Nightly/Testers;
5. bloquear el cutover Qt en el contrato Overlay v2 estable de #677;
6. aceptar que edit mode y capas globales no soportadas provoquen fallback a
   Wails durante la sesión;
7. aprobar los gates y presupuestos de §§8–9 como punto de partida;
8. exigir una nueva aprobación tras PLAN y otra tras TASKS antes de implementar.

La fase PLAN puede redactarse. Debe someterse a otra aprobación explícita antes
de redactar TASKS, y TASKS necesita una aprobación adicional antes de modificar
código de producto desde #690.
