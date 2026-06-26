# Plan actual

Ultima actualizacion: 2026-06-26.

## Estado operativo principal

La app actual se considera base de beta publica para testers. A partir de ahora, el desarrollo planificado apunta al release oficial.

Fuente operativa principal:

- `docs/release-roadmap-execution-index.md`
- `docs/superpowers/plans/2026-06-26-release-*.md`

Los roadmaps anteriores (`docs/master-feature-plan.md` y `docs/roadmap-execution-board.md`) se mantienen como contexto/historial, pero no deben contradecir el indice de release.

Siguiente trabajo recomendado:

1. `Release 01 - Beta baseline, recomendados y presets`.
2. `Release 02 - Stripe, Supabase, auth y licencias`.
3. `Release 03 - Autoupdater y distribucion`.
4. `Release 04 - Preview avanzada y LayoutStudio profesional`.

Regla de orquestacion: el agente principal no edita codigo salvo necesidad estricta; genera prompts, revisa reportes y actualiza documentacion. Workers implementan. GLM revisa P0/P1/P2 y cualquier cambio de Go debe exigir las skills de Go indicadas en `docs/release-roadmap-execution-index.md`.

Decisiones de release ya cerradas:

- Stripe directo + Supabase + login obligatorio.
- Licencia online con gracia de 24h y 1 PC activo.
- Assetto Corsa e iRacing entran en release como simuladores.
- Assetto Corsa Lua/CSP Overlay Pack es producto separado.
- Autoupdater entra en release.
- OBS LAN/doble PC entra en release.
- Track Map e Input Telemetry/Trace entran en release con estado `stable`/`tester`/`experimental` segun datos.
- Community layouts/marketplace, cloud sync completo, companion app y plugin system quedan post-release.

## Estado actual

Vantare v2 se documenta desde ahora como una suite local para sim racing, no solo como una app de overlays. Los modulos internos actuales son:

- `Overlays Studio`: perfiles, widgets, layouts, overlay desktop y OBS.
- `Ingeniero`: spotter/ingeniero determinista, historial y notificaciones.
- `Telemetria`: fuente compartida live/mock/demo.
- `Setup`: configuracion local.

Documento base: `docs/vantare-suite-architecture.md`.

P3 - Pedals compact render completado (2026-06-25):
- Implementado el nuevo `PedalsWidget` compacto basado en el diseño aprobado por GLM: Mock V4 broadcast minimal.
- Rediseñado a 3 barras verticales (`CLT`, `BRK`, `THR`), fondo transparente por defecto y track de barra `#0a0a0a` fijo.
- Eliminados del widget pedals heredado: marcha, velocidad, volante animado ficticio, canvas de historial gráfico, `BAKED_PANEL_BG`, `HISTORY_SIZE`.
- Creado helper puro `pedals-format.ts` para clamping estricto en el rango `0..100` y fallbacks seguros ante valores negativos, `NaN`, `Infinity`, `undefined` y nulos (con tests table-driven).
- Modificados los defaults del style catalog a la paleta de Mock V4: embrague `#3aa6c8`, freno `#e63946`, acelerador `#34d399` y fondo `transparent`.
- Actualizado el widget pedals en perfiles default y recomendados (`example-racing.json` y `recommended-profiles.ts`) al tamaño base recomendado de `90x100`.
- No se modificó `widget-base-size.ts`, schema, backend en Go, ni otros widgets (`Relative`/`Standings`/`Delta`/`Engineer`).
- Cobertura total de tests y checks pasados con éxito: 445 tests frontend, build, lint y `git diff --check` OK.

P4 - Pedals configuración visual básica completado (2026-06-26):
- Creado helper puro `pedals-settings.ts` para leer y normalizar la apariencia de pedals con defaults seguros, incluyendo tests table-driven y test de sincronía con style-catalog.
- Creada sección dedicada `PedalsSettingsSection` en Overlays Studio para editar visualmente el color de acelerador (throttle), freno (brake) y embrague (clutch).
- Implementado toggle de "Fondo transparente" que guarda `"transparent"` en `backgroundColor`, y un color picker de fondo personalizado visible solo cuando el toggle está desactivado.
- Integrada la sección en `WidgetSettingsPanel` de forma segura (retorna null para otros widgets), preservando la separación de responsabilidades y la inmutabilidad de los perfiles.
- Cobertura total de tests para el helper, la sección de UI, y test de integración en el panel de ajustes pasados con éxito.

P5 - Adición de widgets en LayoutStudio completado (2026-06-26):
- Creado helper puro `widget-factory.ts` con todos los tipos de widgets soportados, Hz e intervalos óptimos de refresco y dimensiones recomendadas (incluyendo pedals en `90x100` y `30` Hz, standings en `340x420` y `15` Hz, etc.).
- El helper genera IDs únicos de forma determinista ante colisiones en el perfil (ej. `pedals`, `pedals-2`, `pedals-3`).
- Extendido el hook moderno `useOverlayStudioState.ts` con la función `addWidget(type)` que añade el widget a `profile.widgets`, lo selecciona automáticamente, lo marca como dirty y mantiene sincronizado de forma reactiva `layouts.general.widgets` (schema v2) si está definido.
- Modificado `StudioWidgetList.tsx` para admitir de forma opcional la prop `onAddWidget`. Si se suministra, muestra un botón "+ Añadir widget" con un formulario denso, oscuro y mono tipo UI2; si no se suministra (como en `WidgetStudio.tsx`), se oculta protegiendo la separación de responsabilidades.
- Conectado el flujo de adición de widgets en `LayoutStudio.tsx` y `OverlaysStudioPage.tsx`.
- Cobertura total de tests automatizados agregados (para el factory, el hook de estado, la lista de widgets y el lienzo de edición); suite completa de frontend de 476 tests en verde.
- Tipo, lint, build y checks de git en verde al 100%.

EN3-EN5 - UI Ingeniero + Bus de notificaciones + Widget de overlays completado:
- Creada la nueva sección de `Ingeniero` en el Hub para gestionar el estado, spotter, sensibilidad, y ver el historial de mensajes de forma reactiva.
- Implementado el bus de notificaciones de Ingeniero que alimenta en tiempo real a Wails (Hub/Desktop) y a OBS a través de un nuevo stream SSE (`/engineer/stream`).
- Creado el widget `engineer-notifications` y registrado en el pipeline de renderizado de `WidgetRenderer`, `CompositeApp`, `ObsOverlayApp` y `WidgetList`.
- Validadas las reglas de negocio: el widget es invisible en runtime cuando no hay notificaciones activas, muestra un placeholder premium en modo edición, e ignora/oculta mensajes expirados basándose en `expiresAt`.
- Tests automatizados (400/400 de frontend y todos los de Go) y checks de linter, compilación y formato en verde al 100%.
- Review GLM de fixes EN0-EN5: ACCEPT WITH P3. No quedan P0/P1/P2 conocidos.
- EN6 (`Ingeniero` con LMU live real) queda preparado a nivel de analisis en `docs/engineer-live-lmu-adapter-analysis.md`, pero aparcado hasta que pueda validarse con datos live.

A8 - Checklist alpha privada completado:
- Auditoria integral de preparacion para alpha privada: PASS.
- 18/18 areas evaluadas como PASS para alpha privada automatizada.
- Checklist versionado en `docs/alpha-private-checklist.md`.
- Queda pendiente smoke manual antes de distribuir a testers cercanos.
- Completada la preparación de `B1 - Build compartible e instrucciones` con inventario de build, verificación de empaquetado y la creación de la guía para testers (`docs/tester-build-instructions.md`).


PREVIEW2 - WidgetStudio intrinsic width contract:
- Corregido el espacio vacio a la derecha en la preview aislada de `WidgetStudio`.
- Los widgets configurables (`relative`, `standings`) usan ancho intrinseco en el sandbox de `WidgetStudio`, envolviendo el contenido real, sea menor o mayor que `position.w`.
- `position.h` sigue usandose para la altura en modo fill.
- `WidgetRenderer` propaga un contexto interno runtime `__previewFillHost` a los widgets; no se persiste en schema.
- `LayoutStudio` y overlays runtime siguen usando `position.w/h` como contrato de layout; sin cambios.
- Bug log actualizado: `docs/widget-preview-bug-log.md` (entrada 8).
- Plan ejecutado: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`.

Vantare v2 es una suite local para sim racing construida con Go/Wails y React/TypeScript.

Version estable actual de runtime/build: `v0.3.10.0`.
Ultimo checkpoint de roadmap confirmado: beta privada inicial B1-B6, con tag/version funcional.

Base de schema v2 para perfiles preparada:
- `schemaVersion: 2` permite layouts por sesion y variantes de widgets.
- `layouts.general.widgets` existe como layout obligatorio en perfiles v2.
- `widgets` se mantiene como espejo de compatibilidad durante la transicion.
- Los perfiles legacy sin `schemaVersion` siguen cargando sin migracion silenciosa.

Primer corte configurable de `Relative` preparado:
- Existe catalogo frontend para metricas/columnas del `Relative` inicial.
- `bestLap` y `lastLap` se modelan como columnas opcionales persistentes en variantes schema v2.
- `WidgetStudio` puede activar/desactivar esas columnas sin tocar posicion ni tamano.
- Preview, overlay desktop y OBS leen la variante referenciada por cada widget.

Formatos iniciales de columnas de `Relative` preparados (Task 6):
- El nombre de piloto ya no se recorta automaticamente al activar columnas opcionales.
- El recorte de nombre es una opcion explicita de la variante.
- `bestLap` y `lastLap` soportan formato completo/compacto, decimales, ancho, color y alineacion.
- La preview aislada de `WidgetStudio` usa el ancho intrinseco del `Relative` cuando las columnas requieren mas espacio.
- Verificacion manual aprobada: las columnas se activan, se guardan, se expanden sin recortar y mantienen alineacion por filas.

Filtros iniciales de `Relative` preparados:
- `rangeAhead` y `rangeBehind` son configurables desde `WidgetStudio`.
- El filtro de clase permite mostrar todas las clases o solo la misma clase del jugador.
- El coche del jugador puede mostrarse u ocultarse.
- Los filtros se guardan en `variant.filters`.
- Los perfiles legacy con `props.rangeAhead` y `props.rangeBehind` siguen funcionando.

Catalogo inicial de `Standings` preparado (S2):
- `frontend/src/overlay/widgets/standings-catalog.ts` define metricas y columnas sin UI ni render.
- Columnas default estables: `position`, `driverNumber`, `driverName`, `gap` habilitadas; `vehicleClass`, `currentLap`, `interval`, `bestLap`, `lastLap` deshabilitadas.
- Metrica `playerHighlight` disponible como stable no-columna para futuro resaltado.
- Metricas `pitInfo`, `distance` y `deltaLapTime` quedan como `tester` sin habilitar por defecto.
- No se incluyen multiclass ni metricas no confirmadas en el primer corte.
- Tests focalizados pasan; TypeScript pasa.

Variantes y persistencia frontend de `Standings` preparadas (S3, aprobada por GLM):
- `withDefaultWidgetVariants`, `toggleStandingsColumn`, `enrichWidgetPropsWithVariant` y `normalizeStandingsVariant` soportan `widget.type === "standings"`.
- Standings reusa el sistema de variantes schema v2 ya usado por `Relative`.
- Legacy sin `variantId`/`variants`/`schemaVersion` se normaliza a `variant-${widget.id}-default` con columnas default.
- `normalizeStandingsVariant` preserva overrides de usuario (width, format, style) y descarta columnas desconocidas.
- Idempotencia por identidad garantizada (con `deepEqual`) tanto para Relative como Standings.
- `enrichWidgetPropsWithVariant` no fuerza `templateId` para tipos no relative/standings (queda undefined si el variant no lo define).
- 37 tests focalizados pasan; suite completa 267/267; tsc y build OK.
- No se toco renderer, UI, backend, schema ni configs.

Render configurable de `Standings` en preview/desktop/OBS preparado (S4, aprobada por GLM):
- `StandingsWidget` lee `props.variant.columns` y renderiza solo columnas habilitadas en orden de catálogo.
- `standings-format.ts` aporta helpers puros: width/color/align, truncado de nombre, formato de tiempo de vuelta (full/compact, decimals 0-3), ancho intrinseco.
- Sin variant, cae a `createDefaultStandingsColumns()` (legacy identico a antes).
- `playerHighlight` nunca se renderiza como columna (es metrica no-columna).
- Pit label, tire badge y FASTEST quedan como decoraciones de fila en el area de gap.
- Brand cell standalone restaurado como decoracion (no columna): la marca de equipo es visible aunque `driverNumber` este deshabilitado.
- Fingerprint actualizado para incluir config de columnas (re-renderiza al cambiar variant).
- Tests: 36 nuevos/ajustados (standings-format + StandingsWidget); suite completa 293/293; tsc, build, lint y git diff --check OK.
- `.gitattributes` preparado para normalizar line endings al pasar por git; `git diff --check` no reporta errores bloqueantes, aunque pueden aparecer warnings CRLF en archivos ya modificados en working copy.
- No se toco UI (`hub/**`), `WidgetRenderer`, `PreviewScaler`, `WidgetSandboxPreview`, `PreviewWidgetFrame`, backend, schema ni configs.
- Validacion manual detecto una ambiguedad visual: en practice/qualy, la columna default `gap` muestra tiempos de vuelta por comportamiento legacy y puede parecer `bestLap`.
- S4.5 fue aprobada por GLM con P3: la preview de `Standings` permite elegir escenarios mock `Practica`, `Qualy` y `Carrera`, default `Carrera`, sin persistir en perfil/layout/config.

La Fase A de `Overlays Studio` se encuentra completada:
- La navegacion visible unifica `Overlays` y `Preview` bajo `Overlays Studio`.
- `Overlays Studio` sustituye la antigua entrada visible a `Preview` como flujo principal de edicion.
- `WidgetStudio` permite editar aspecto/comportamiento de widgets.
- `LayoutStudio` contiene la edicion de layout, colocacion y tamano.
- `Widgets` no expone posicion/tamano/eliminar (responsabilidad exclusiva de `LayoutStudio`).

Fase A2 de Overlays Studio completada:
- Home convertida en cuatro paneles grandes clicables: `Widgets`, `Mis perfiles`, `Recomendados por Vantare`, `Comunidad`.
- Cada panel es un `button` con aria-label, hover/focus states y toda la tarjeta como target de click.
- `Widgets` panel abre el editor de widgets existente.
- `Mis perfiles` abre una subpantalla propia con perfiles y previews reales renderizadas.
- `Recomendados por Vantare` abre una subpantalla propia con previews reales y guardado como perfil propio.
- `Comunidad` abre una pantalla dedicada de `Proximamente`.
- Todas las subpantallas usan `← Volver a Overlays Studio`.
- `ProfilePreview` reutiliza `PreviewWidgetFrame` existente para renderizar widgets reales en miniatura de forma responsive.
- Backend `hub:list` ahora incluye `Profile` completo en cada `ProfileEntry` para permitir previews de perfiles propios.

Fase B de Overlays Studio (Widget Previews) estabilizada:
- `WidgetPreviewPanel` ya no usa `PreviewWidgetFrame`.
- `WidgetStudio` usa una preview aislada basada en `WidgetRenderer`, `PreviewScaler` y `WidgetSandboxPreview`.
- `PreviewWidgetFrame` queda reservado para layout/profile previews.
- `Relative` compacto fue validado manualmente: sin clipping, sin espacio vacio derecho y centrado en el checkerboard.
- Los hallazgos y antipatrones quedan documentados en `docs/widget-preview-bug-log.md`.
- Plan ejecutado: `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`.

Controles live restaurados dentro de Overlays Studio:
- `Mis perfiles` muestra `Abrir overlay` / `Detener overlay` por perfil.
- `LayoutStudio` muestra `Abrir overlay` / `Detener overlay` para el perfil activo.
- `WidgetStudio` no muestra controles live de forma intencionada.
- El inicio y parada reutilizan los eventos Wails existentes: `overlay:start`, `overlay:stop`, `overlay:status`.
- `Abrir overlay` se deshabilita mientras el layout tiene cambios sin guardar o se está guardando.

## Objetivo actual

Checkpoint funcional `v0.3.9.1` cerrado:

- `WidgetStudio` visual rework validado manualmente.
- PREVIEW2 validado manualmente: `Relative` y `Standings` se ajustan al ancho intrinseco en la preview aislada sin espacio vacio a la derecha.
- `LayoutStudio` drag/resize/save estabilizado.
- `Relative` y `Standings` redimensionan proporcionalmente en `LayoutStudio`, runtime desktop y OBS.
- Los frames visuales se normalizan desde el primer render para perfiles legacy deformados, sin mutar ni guardar automaticamente.
- Recomendados de Vantare pueden guardarse como copia propia editable.
- `SaveProfileAsOwnCopy` genera IDs unicos, convierte a schema v2 y no muta el perfil de entrada.
- Version runtime/build actualizada a `v0.3.9.1`.
- No se haran mas reworks visuales completos hasta cerrar la mayoria de features core.

Checkpoint funcional `v0.3.9.2` cerrado:

- A6+A7 mock/live/demo UX ejecutado como lote rapido.
- El flujo source-state queda documentado en `docs/mock-live-demo-ux.md`.
- El chip global de fuente de telemetria en Topbar tiene `title` y `aria-label`.
- El selector mock de `Standings` se valida por `aria-pressed`.
- Changelog publico y publicacion automatica a Discord por tags `v*` preparados.
- Version runtime/build actualizada a `v0.3.9.2`.

Checkpoint funcional `v0.3.10.0` preparado para cierre:

- B1 build compartible e instrucciones para testers completado.
- B2 known issues y protocolo de feedback completado.
- B3 OBS setup local documentado y B3.1 corregido para usar perfiles reales en la URL de Ajustes.
- B4 hotkeys basicas endurecidas en Windows con stub multiplataforma.
- B5 inventario Delta best live completado.
- B6 Delta best live implementado: backend prioriza `DeltaBest` nativo de LMU, fusion acepta deltas negativos, `DeltaWidget` muestra `Target` y `Lap` desde telemetria.
- Reviews GLM de B4/B6 aceptadas sin P0/P1/P2.
- Ingeniero queda integrado como modulo de suite, con EN6 live LMU aparcado hasta validacion real.
- Queda pendiente verificacion manual prolongada de Delta live con LMU.

Trabajo posterior al checkpoint `v0.3.10.0`:

1. `A8 - Checklist alpha privada` completado con PASS;
2. `B1 - Build compartible e instrucciones` completado con la guía del tester;
3. `B2 - Known issues y canal feedback` completado con la definición de canales de Discord y plantilla de bug report;
4. `B3 - OBS setup local sencillo` completado con la guía de OBS local;
5. `B4 - Hotkeys basicas` completado;
6. `B5 - Delta best live inventario` completado;
7. `B6 - Delta best live implementacion` completado a nivel automatico y pendiente de prueba live prolongada;
8. mantener EN6 aparcado hasta poder validar LMU live;
9. no iniciar nuevos reworks visuales completos hasta cerrar mas features core.
10. `P1 - Pedals inventario datos/diseño actual` completado.
11. `P2 - Pedals nuevo diseño pequeño` completado como plan visual aprobado.
12. `P3 - Pedals compact render` completado con el nuevo render compacto `CLT`/`BRK`/`THR`.
13. `P4 - Pedals configuracion visual basica` completado con la sección dedicada en WidgetStudio y color pickers.
14. `P5 - Adición de widgets en LayoutStudio` completado y commiteado (commit `3db203a`): widget-factory, addWidget en useOverlayStudioState, botón `+ Añadir widget` en StudioWidgetList, PedalsSettingsSection y pedals-settings helper.
15. Aprobado para beta testers: `P6 - Widget Preset Gallery` (Galería de presets de widgets), planificada justo después de `P5` y antes del smoke test de la fase (ahora `P7`).

Release 01 - Task 1 (Recommended profiles audit + rename) completado (2026-06-26, commit `3db203a`):
- Reemplazados los 3 perfiles recomendados antiguos (Racing Básico, Streamer Clean, Minimal Telemetry) por 2 oficiales: `Clean Overlay` y `Le Mans Ultimate - Basic`.
- `configs/custom-hfg.json`: renombrados id/name a `vantare-clean-overlay`/`Clean Overlay`. Filename físico conservado para no romper `embed.go`/`main.go`. Positions originales preservadas.
- `configs/custom-1.json`: nuevo config (no embebido), renombrados id/name a `vantare-lmu-basic`/`Le Mans Ultimate - Basic`.
- `recommended-profiles.ts`: ambos perfiles en schema v2 con `layouts.general.widgets`. Clean Overlay conserva `variant-relative-default`; LMU Basic incluye pedals deshabilitado.
- Tests reales añadidos: ids/nombres exactos, widgets por perfil, schemaVersion 2, layouts.general, variantId, inmutabilidad del clone.
- Review adversarial GLM (2 ciclos): NEEDS FIXES → ACCEPT WITH P3. P1 (positions sin autorizar, diff mezclado no reportado) y P2 (tests débiles, test P5 en diff, schema inconsistente) resueltos. P3 no bloqueantes documentados (custom-1.json huérfano, pedals enabled:false, id≠filename).
- Checks: 480 tests frontend OK, build OK, lint OK, `go test ./pkg/config ./internal/app` OK, `git diff --check` OK.
- Verificación manual pendiente: abrir app, confirmar 2 perfiles en Recomendados, guardar copias, abrir en LayoutStudio.

Release 01 - Task 4 (Widget Preset Implementation) completado (2026-06-26):
- Creado `PresetService` en Go para persistir presets a `{cfgDir}/widget-presets.json`.
- Implementado generador nativo de UUID v4 con `crypto/rand` sin dependencias adicionales.
- Registrado `PresetService` en Wails y conectado su ciclo de vida y handlers en `main.go`.
- Creado helper puro `widget-presets.ts` para extraer y aplicar configuraciones estéticas e internas de un widget sin tocar propiedades de diseño ni runtime.
- Creado `widget-presets-store.ts` para conectar reactivamente la UI con los eventos de Wails.
- Creado componente UI `WidgetPresetSection.tsx` en `WidgetSettingsPanel` con controles oscuros densos para guardar, aplicar, renombrar y eliminar presets.
- Corregidos 75/75 archivos de pruebas unitarias de frontend e integración (incluyendo mocks de Wails para JSDOM).
- Review GLM fixes P1: resueltos los 4 P1 (race condition en `listPresets` vía correlation ID, errores silenciosos del backend, variantes huérfanas al aplicar preset, aliasing por referencia compartida).
- Minifix P3 del orquestador: añadido timeout de 10s en `listPresets` con reject controlado; handlers Go ahora emiten error también con payload `nil`; tests añadidos.
- Review GLM minifix: ACCEPT (ningún P0/P1/P2 nuevo; 3 P3 residuales menores documentados).
- Checks: Go tests OK, frontend tests OK (504 tests), frontend build y lint OK, git diff check OK (salvo warning CRLF en `pnpm-workspace.yaml` de otro agente).
- Siguiente operativo: commit de Release 01 Task 4 o smoke manual, según decisión de Isaac.




Ultimo miniplan completado y aprobado por GLM:
- `docs/superpowers/plans/2026-06-22-s4-standings-render-configurable.md`
  - Renderer de `Standings` configurable por variantes (enabled/width/format/style).
  - Helpers puros en `standings-format.ts`; brand cell restaurado como decoracion.
  - Tests TDD pasando; suite completa 293/293 verde; tsc, build, lint y diff --check OK.
  - Sin cambios en UI, backend, schema ni configs.
  - Review GLM: ACCEPT WITH P3 FOLLOW-UPS; P3 resueltos por el orquestador (alineamiento con relative-format, test carry-over corregido, brand cell restaurado, test de posicion reforzado, line endings normalizados).

Miniplan implementado tecnicamente:
- `docs/superpowers/plans/2026-06-22-widget-sandbox-preview-architecture.md`
  - `WidgetRenderer` extraido y reutilizable; `PreviewWidgetFrame` reducido a chrome de layout.
  - `PreviewScaler` creado como componente generico sin logica de widgets.
  - `WidgetSandboxPreview` creado como sandbox aislado para `WidgetStudio`.
  - `WidgetPreviewPanel` ahora delega en `WidgetSandboxPreview` y deja de usar `PreviewWidgetFrame`.
  - `position.x/y` se ignoran en el sandbox; `position.w/h` no se modifican.
  - Ajustes P1 de review corregidos: compact mode mide altura/ancho real sin conservar `position.h/w` como minimo visual, y `WidgetRenderer` llena el host por defecto.
  - Validacion manual aprobada: Relative compacto queda centrado, sin espacio vacio derecho y con columnas alineadas.
  - Bug log: `docs/widget-preview-bug-log.md`.

UI de `Standings` en `WidgetStudio` preparada (S5):
- Controles de columnas opcionales y formatos conectados a variantes schema v2.
- Defaults de UI leidos desde el catalogo de `Standings`.
- Inputs numericos con clamp en UI.
- Sin controles de posicion/tamano/eliminar.
- Checks reportados por worker: suite frontend completa, TypeScript, build, lint y `git diff --check` en verde.
- P3 iniciales revisados y corregidos salvo refactors compartidos fuera de alcance.

S6 - Standings verificacion completa y docs ejecutada (2026-06-23):
- Worker: Deepseek V4 Flash.
- Todos los checks automaticos pasaron (322 tests frontend, tsc, build, lint, Go tests, `git diff --check` sin errores; warnings CRLF no bloqueantes en working copy).
- Checklist manual creada en `docs/standings-manual-verification.md`.
- Review GLM: `ACCEPT WITH P3`; se corrigieron los P2 documentales antes de avanzar a UI1.
- Release/tag publicado: `v0.3.6.1`.

UI1 - Analisis visual de `WidgetStudio` completado (2026-06-23):
- Worker: Minimax M3.
- Documento creado: `docs/overlays-studio-visual-analysis-ui1.md`.
- Alcance: solo `WidgetStudio`, no Home, `LayoutStudio`, perfiles, recomendados, comunidad ni navegacion global.
- No se toco codigo, tests, configs, schema ni backend.
- Checkpoint documental: sin tag/version propia; se agrupara bajo la siguiente version funcional.

UI2 - WidgetStudio Visual Rework ejecutado (2026-06-23):
- Worker: Minimax M3.
- Cambios solo en `WidgetStudio`, `WidgetSettingsPanel`, `StudioWidgetList`, `RelativeSettingsSection`, `StandingsSettingsSection` y componentes locales nuevos `studio-controls.tsx`.
- Cabecera global minima (back, titulo, estado con dot rojo, Guardar); widget metadata movida al sticky header del panel derecho.
- Secciones Relative/Standings reordenadas y compactadas; controles en filas densas con tipografia mono y label oculto de cabecera de seccion.
- Lista de widgets compacta con tabs pill, busqueda con icono y dot rojo de seleccion.
- Selector mock `Práctica` / `Qualy` / `Carrera` reestilizado como segmented control con `aria-pressed`.
- Tests focales y de pagina actualizados a los nuevos textos; anadidos tests para sticky header y studio-controls.
- Sin cambios en LayoutStudio, backend, schema, configs, build config ni versionado.
- Checks: 328/328 tests frontend, `tsc -b`, `pnpm build`, `pnpm lint` y `git diff --check` sin errores (warnings CRLF conocidos no bloqueantes).
- Verificacion manual: aprobada por el usuario tras PREVIEW2.

PREVIEW2 - `WidgetStudio Intrinsic Width` completado (2026-06-23):
- Documento: `docs/superpowers/plans/2026-06-23-preview2-widgetstudio-intrinsic-width.md`.
- Alcance: corregir el espacio vacio derecho en la preview de `WidgetStudio` haciendo que `Relative` y `Standings` usen ancho intrinseco en sandbox.
- Decision: `WidgetStudio` no edita tamano, por lo tanto la preview debe envolver el contenido; `LayoutStudio` y overlay runtime siguen usando `position.w/h`.
- Review GLM: `NEEDS FIXES` inicial por altura fill de `Relative`; P2 corregido.
- Verificacion manual: aprobada por el usuario; `Relative` y `Standings` se ajustan correctamente sin espacio vacio derecho.
- Version objetivo: `v0.3.9.0`.

UI2 - Miniplan `WidgetStudio Visual Rework` creado (2026-06-23):
- Documento: `docs/superpowers/plans/2026-06-23-ui2-widgetstudio-visual-rework.md`.
- Alcance: rework visual de `WidgetStudio` con densidad alta tipo RaceLabs y margen creativo para el worker UI/UX.
- Estado: ejecutado y validado como parte de `v0.3.9.0`.

A4+A5 - Recomendado -> copia editable implementado (2026-06-25):
- Inventario: el flujo `OverlaysStudioPage` ya emitía `hub:save-own-copy`; `HubService.SaveProfileAsOwnCopy` persistía copias pero fallaba con duplicados y no convertía a schema v2.
- Cambios:
  - `frontend/src/hub/overlays/recommended-profiles.ts`: `cloneRecommendedProfile` guarda metadata `source` (`kind: recommended`, `profileId` y `name` originales) y elimina cualquier identidad de solo lectura.
  - `frontend/src/hub/pages/OverlaysStudioPage.tsx`: el prompt de copia usa `${nombre} (copia)` por defecto para diferenciar la copia.
  - `internal/app/hub_service.go`: `SaveProfileAsOwnCopy` genera un id de archivo único ante colisiones, convierte el perfil a schema v2 si aplica (layouts/variants) y persiste el perfil completo.
- Tests añadidos/ajustados en `recommended-profiles.test.ts`, `OverlaysStudioPage.test.tsx` e `internal/app/hub_service_test.go` (copia, id único, conversión v2, preservación de layouts/variants, error paths).
- Checks pasados: 358 tests frontend, `tsc -b`, `pnpm build`, `pnpm lint`, `go test ./pkg/config ./internal/app`, `git diff --check` sin errores bloqueantes (warnings CRLF conocidos).
- Review y verificacion manual aprobadas; A5 queda cerrado en `v0.3.9.1`.

### Reconexión live-first aprobada para overlays

- Al pulsar `Abrir overlay`, la app intenta reconectar con LMU antes de abrir la ventana.
- Si LMU no está disponible, el overlay sigue abriendo con datos mock como fallback visual.
- `-live=false` queda como modo explícito de desarrollo/testing.
- La barra superior muestra el estado de la fuente (`LMU conectado`, `Esperando LMU` o `Mock`).

## Proximas tareas pequenas

1. `A6+A7 - Mock/live/demo UX: inventario + fixes`: ejecutado (2026-06-25).
   - Inventario: flujo source-state correcto; Topbar muestra `LMU conectado` / `Esperando LMU` / `Mock` / `Fuente pendiente`.
   - WidgetStudio mock scenario selector es preview-only y no marca dirty (verificado por test existente).
   - Fixes aplicados:
     - Topbar source chip: añadidos `title` y `aria-label`.
     - Creado `Topbar.test.tsx` con 7 tests de source status.
     - Tests de mock scenario: cambiados de className a `aria-pressed`.
   - Documento de hallazgos: `docs/mock-live-demo-ux.md`.
   - No se tocó telemetría, preview/layout, schema, backend Go ni configs.
2. `A8 - Checklist alpha privada`: ejecutado y documentado en `docs/alpha-private-checklist.md`.
3. `B1 - Build compartible e instrucciones`: completado.
4. `B2 - Known issues y canal feedback`: completado.
5. `B3 - OBS setup local sencillo`: completado.
6. `B4 - Hotkeys basicas`: Fase B4.1 (Hardening de atajos, stubs multiplataforma y documentación para testers) completada y validada mediante tests. Listo para siguientes fases de UX.
7. `B5 - Delta best live inventario`: completado. Viabilidad YES, detectado bug crítico de fusión de Go.
8. `B6 - Delta best live implementacion`: completado. Backend y frontend listos; queda smoke manual live con LMU para recopilar feedback real.
9. mantener EN6 aparcado hasta poder validar LMU live.
10. No iniciar mas reworks visuales completos hasta cerrar la mayoria de features core.
11. `P1 - Pedals inventario datos/diseño actual` completado.
12. `P3 - Pedals compact render` completado.
13. `P4 - Pedals configuracion visual basica` completado.
14. Siguiente operativo: `P5 - Recomendados beta pulidos`.
15. Aprobado para beta testers: `P6 - Widget Preset Gallery` (Galería de presets de widgets), programada antes del smoke test (ahora `P7`).
16. Ejecutar REL1/Discord release al pushear el tag funcional.




## Riesgos actuales

- Hay cambios abiertos en git de otros agentes; no mezclar tareas nuevas con ellos sin revisar.
- El README principal puede estar desactualizado respecto a `Overlays Studio`.
- Parte de la documentacion historica vive fuera de `vantare-v2`.
- Los agentes pueden confundir `Widgets` con `LayoutStudio`; mantener separacion estricta.
- Modificar `PreviewWidgetFrame` puede impactar a los mini-previews de perfiles creados en la Fase A2 si no se maneja bien la propiedad de "aislamiento" o "escala".
- La preview aislada de `WidgetStudio` ya esta separada de `PreviewWidgetFrame`; mantener esta separacion y consultar `docs/widget-preview-bug-log.md` antes de tocarla.
- Bugs importantes ya cerrados viven en `docs/resolved-bugs.md`; consultarlo antes de reabrir trabajo de preview, guardado o variantes legacy.
- La app ya tiene el flujo principal de edicion, el plan maestro vive en `docs/master-feature-plan.md` y el tablero orquestable vive en `docs/roadmap-execution-board.md`.
- Hallazgos P3 pendientes de resolver (documentados para follow-up):
  1. `columns: []` se normaliza a defaults, lo cual es ambiguo para futuros cortes.
  2. `enrichWidgetPropsWithVariant` normaliza variantes en cada render/tick (impacto menor de rendimiento).
  3. Densidad visual si se activan `bestLap` y `lastLap` en widgets muy pequeños (parcialmente mitigado al usar ancho intrínseco y recorte de nombre explícito).
  4. Queda pendiente crear un harness visual/browser con Playwright para detectar regresiones visuales que JSDOM no cubre.
  5. P3 S4.5: un test usa clase CSS para comprobar estado activo del selector mock; preferir `aria-pressed` en un futuro rework.
  6. P3 S4.5: el selector mock usa paleta neutral; conviene alinearlo con el rework UI/S5.
  7. P3 S4.5: `mockSessionScenario` se propaga a todos los widgets aunque solo `Standings` lo consume; sin impacto funcional.
  8. P3 S4.6: falta test de regresion para Ctrl+S con `autosave:false`; el handler no cambio y GLM no lo considera bloqueante.

## Decisiones pendientes

- Si los planes externos deben copiarse, moverse o archivarse dentro de `vantare-v2/docs`.
- Si la antigua ruta/pagina `Preview` debe eliminarse definitivamente o mantenerse como compatibilidad interna.
- Que decision ejecutar primero del plan maestro: separar/verificar responsabilidades, inventario de `Standings`, `LayoutStudio` drag/resize, mock/live/demo o rework UI.
- Cuando crear un harness visual/browser para previews con Playwright tras estabilizar `WidgetSandboxPreview`.

## No cambiar sin aprobacion

- Stack principal Go + Wails + React/TypeScript.
- Separacion `Widgets` vs `LayoutStudio`.
- Configuracion de build/package.
- Dependencias.
- Formato de perfiles JSON.
- Arquitectura de telemetria LMU.
