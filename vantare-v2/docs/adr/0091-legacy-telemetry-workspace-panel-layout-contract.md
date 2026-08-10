# ADR-0091 (legacy): Contrato de panel y layout del workspace de análisis de telemetría

- Status: Legacy (renumerado desde ADR-0005 el 2026-08-10 para no colisionar con la secuencia activa de ADR; contenido original: Accepted 2026-08-08, revisado por Isaac + Sol)
- Date: 2026-08-08
- Deciders: Product (isaac); Advisors: Fable (Claude), Sol (GPT 5.6 Sol Pro)
- Depende de: ADR-0090 (legacy; modelo canónico de datos)

## Contexto

La sección de análisis de telemetría (ADR-0090) necesita una superficie de UI a la altura de MoTeC i2: múltiples visualizaciones sincronizadas sobre las mismas vueltas. Decisión de producto ya tomada: **workspace configurable por el usuario desde el día 1** — paneles dockables, redimensionables y recombinables, con ambición máxima de UX aunque el acabado visual sea provisional (la estética definitiva llegará a nivel de app; todo el estilo debe ser reemplazable vía tokens).

Restricciones del repo: renderers como ViewModels puros (patrón ADR-0003), sin dependencias nuevas sin justificación, rendimiento como requisito de producto (scrub a 60fps con cientos de miles de muestras).

## Decisión

### 1. Docking: dockview (pendiente de spike)

Se adopta **dockview** (MIT, TypeScript, sin dependencias de framework) como sistema de docking: splits anidados, tabs, paneles flotantes, popout a ventana, serialización JSON del layout, skinnable por CSS.

- Alternativas descartadas: golden-layout (mantenimiento dudoso), flexlayout-react (menos capaz), docking custom (meses de infraestructura que no son el valor diferencial).
- **Condición de entrada**: el spike (ver Preguntas abiertas) debe demostrar dockview dentro de WebView2/Wails, incluido si el popout vía `window.open` funciona.
- **Plan B de popout — multi-monitor es requisito, no nice-to-have**: si `window.open` cae, el plan B es una **ventana nativa Wails v3 adicional** hospedando paneles mediante un protocolo de panel desacoplado (el `syncHandle` cross-window del §3 y el registry lo permiten: la ventana secundaria monta ViewModels propios y se sincroniza por facetas). Los floating panels internos de dockview quedan como último recurso, asumiendo explícitamente la pérdida de multi-monitor.

### 2. Paneles como registry con ViewModels puros

Cada tipo de panel se registra en un **panel registry** (mismo patrón que `widget-registry.ts` del Overlay Studio):

```text
PanelDefinition {
  panelType        // id estable, ej. "trace-stack", "track-map", "lap-table"
  panelVersion     // entero; migraciones de config entre versiones
  displayName, icon
  createViewModel(config, dataApi, syncHandle) -> ViewModel   // independiente de React, dockview, transporte y persistencia
  Component        // React shell que monta el ViewModel (canvas/uPlot dentro)
  defaultConfig, configSchema
  migrate(oldConfig, fromVersion) -> config
}

ViewModel (ciclo de vida obligatorio) {
  activate()       // panel visible: reanuda suscripciones y render
  deactivate()     // tab oculta / panel no visible: suspende render y trabajo; estado se conserva
  resize(w, h)     // geometría nueva (throttled por el shell durante drag de splitters)
  abortPending()   // cancela peticiones de datos en vuelo
  dispose()        // liberación total: suscripciones, canvases, buffers — cero fugas
}
```

- Los ViewModels son **independientes** de React, dockview, transporte y persistencia (no "puros" en sentido estricto: consumen `dataApi`, que es I/O). Reciben datos por `dataApi` y sincronización por `syncHandle`.
- `dataApi` (contrato mínimo): consultas por **rango** (vuelta/tiempo/distancia) con **cancelación** (AbortSignal), **deduplicación y cache** de peticiones idénticas, invalidación por revisión de datos (re-derivación de canales → los paneles se enteran), y **estrategia de reducción por tipo de canal** delegada al servidor (M4 para continuos, preservación de transiciones para estados; ADR-0090).
- Un panel `deactivate`ado no renderiza ni consulta: la **suspensión de paneles invisibles es obligatoria**, no una optimización.
- Paneles de fase 1: stack de traces, mapa de trazado, rail/tabla de vueltas, tabla de zonas/curvas, informe de vuelta. Fases futuras (coach LLM, vista 3D, video/replay) = nuevas entradas del registry, cero cambios estructurales.

### 3. Sincronización por facetas, no singleton global

El estado compartido se divide en dos clases con destinos distintos:

- **PersistentContext** (serializable, va en el layout): vueltas cargadas (referencia + comparadas), eje activo (`distance` | `time`), rango de zoom/viewport.
- **RuntimeInteractionState** (efímero, **nunca se serializa**): cursor, hover, drag en curso.

La sincronización entre paneles es **por facetas independientes**, no por un grupo monolítico:

- `selection` (vueltas cargadas), `cursor`, `viewport` (zoom/rango), `axis`.
- Cada panel declara, por faceta, a qué grupo se vincula (por defecto todas al grupo "A") o `none` para desvincularse parcial o totalmente. Ej.: dos trace-stacks comparten `selection` y `cursor` pero cada uno con su propio `viewport` para mirar dos zonas del circuito a la vez.

Reglas:

- **El cursor va por fuera de React**: publicación imperativa (suscripción directa estilo `telemetry-ref.ts`) para el hover/scrub a 60fps; React solo ve los cambios "lentos" (selection, viewport, axis). Ningún movimiento de cursor puede provocar un render de React en cadena.
- El `syncHandle` que recibe el ViewModel abstrae el bus de facetas y **debe funcionar entre contextos JavaScript distintos** (ventana principal y popouts): la implementación del bus contempla transporte cross-window (BroadcastChannel o puente equivalente) desde el diseño, aunque fase 1 solo use la ventana principal.

### 4. Layouts versionados con migraciones

Un **Layout** serializado contiene:

```text
Layout {
  layoutVersion          // versión del esquema de layout completo
  dockviewVersion        // versión de la librería que serializó dockviewState
  name, id, createdAt
  dockviewState          // árbol serializado de dockview (geometría)
  panels: [{             // FUENTE DE VERDAD de identidad y config de paneles
    panelId, panelType, panelVersion,
    config,              // config propia del panel
    bindings,            // qué datos muestra, con seriesSlot semánticos (ver abajo)
    sync: { selection, cursor, viewport, axis }   // grupo o "none" por faceta
  }]
  contexts: { groupId -> PersistentContext }      // RuntimeInteractionState NUNCA se serializa
}
```

- **Única fuente de verdad**: `panels[]` manda sobre identidad, config y bindings; `dockviewState` solo aporta geometría. Al cargar se **reconcilian**: un panel presente en `dockviewState` pero ausente de `panels[]` (o viceversa) se resuelve determinísticamente (descartar huérfanos de geometría, recolocar huérfanos de config) — nunca estado divergente.
- **Persistencia atómica**: escritura a temporal + rename (patrón ya usado en `configs/`), jamás un layout a medio escribir.
- **`dockviewVersion` guardado**: la compatibilidad de serialización de dockview entre versiones no se asume; un upgrade de la librería exige migración o regeneración de la geometría desde `panels[]`.
- **Colores por `seriesSlot` semántico**: los bindings guardan slot (`reference`, `comparison-1`, `comparison-2`…), nunca colores reales; el tema activo resuelve slot→color. Cambiar el tema no altera ningún layout guardado.
- **Migraciones desde el día 1**: al cargar, se migra primero `layoutVersion` (estructura) y después cada panel vía `migrate()` si su `panelVersion` guardada es anterior. Un panel imposible de migrar se sustituye por un placeholder con aviso — un layout guardado jamás revienta la carga del workspace.
- **Layouts de fábrica** (read-only, clonables): "Pilotaje", "Frenos", "Neumáticos", "Energía". Resuelven el arranque en frío del usuario nuevo sin limitar al avanzado.
- Persistencia en JSON local (patrón `configs/` existente), separada de los perfiles de overlays.

### 5. Estética tokenizada

- Todo color, tipografía, radio, sombra y espaciado de la sección sale de **design tokens** (CSS variables) + un **tema de charts** centralizado (objeto que uPlot/canvas consumen). Cero valores hardcodeados en paneles.
- El re-skin global futuro de la app debe poder aplicarse cambiando tokens y tema de charts, sin tocar ningún panel.

## Consecuencias

- Nueva dependencia frontend: `dockview` (MIT). Requiere aprobación conforme a la política del repo; condicionada al spike.
- El contrato ViewModel/registry mantiene los paneles testeables sin dockview ni Wails (unit tests de ViewModel puros, como en Overlay Studio V3).
- La complejidad de estado se concentra en el bus de facetas y el PersistentContext con su serialización/reconciliación — es el componente a diseñar con más cuidado y el primero que se testea.
- Los layouts de usuario son datos versionados: cualquier cambio de esquema exige migración, nunca rotura silenciosa.

## Preguntas abiertas y criterios de aprobación del spike

Alcance: dockview + uPlot dentro de WebView2/Wails v3, matriz de **1/4/8/12 paneles** de canvas (~100k puntos cada uno), ejercitando cursor sincronizado, zoom, resize continuo de splitters, apertura/cierre repetido de paneles y tabs ocultas.

**Criterios de aprobación (medibles, no impresiones):**

1. Cursor sincronizado entre todos los paneles visibles con **p95 < 16,7 ms** por actualización (60fps sostenidos), en la matriz completa.
2. **Cero renders de React provocados por hover/scrub** (verificado con React DevTools profiler).
3. **Memoria estable** tras N ciclos de abrir/cerrar paneles (sin crecimiento monótono; heap vuelve a línea base tras GC).
4. **Suspensión completa de paneles invisibles**: una tab oculta no consume frames de render ni emite peticiones de datos.
5. Resize continuo de splitters sin degradación perceptible (estrategia de throttle de re-render de uPlot documentada).
6. Veredicto sobre popout: `window.open` funciona en WebView2 → A; si no, demo mínima del plan B (segunda ventana Wails + sync por facetas cross-window); floating interno solo como constancia del último recurso.
7. Serialización/deserialización del layout completo (incl. reconciliación `panels[]` ↔ `dockviewState`) sin pérdida.

El resultado del spike se documenta como apéndice de este ADR antes de pasar a código de producción.
