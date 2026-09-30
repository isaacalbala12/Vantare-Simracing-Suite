# Fase 5 — Hub, Studio y Workshop: microplan y evidencia

Issue: [#1430](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430).
Decisión: [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md), fase 5 del
[plan aceptado](2026-09-29-arquitectura-rust-nativa.md).
Worker: Codex; revisión completa y diseño visual: Claude Opus 5.5.
Base asignada: `abcf10acdbb6500eabdbb88f20e6ed568bb484e4`, integración de fase 2,
rama `vantareapp/isa-1430-fase5-hub-studio`, worktree `C:/tmp/vf-fase5` limpio.
No se cambia esa base ni se obtiene otra rama: el encargo pide desarrollar en
paralelo desde la integración de fase 2. No hay push, PR, merge ni release.

## Autoridad y límites de esta ejecución

Isaac autoriza expresamente en el encargo trabajar sin Notion. No se ha leído
ni actualizado Notion; la excepción no declara completado su seguimiento.
Se leyó el cuerpo de GitHub #1430: alcance/aceptación remiten a fase 5 y
autorizan el microplan antes de implementar. Ninguna llamada a servicios de
producto, credenciales, `.env*`, pagos ni autenticación real. Las mediciones
físicas, capturas y comparación de rendimiento las realiza el orquestador en
serie. Tests y compilación locales no sustituyen esa aceptación.

## Inventario mínimo del producto distribuido (rutas:líneas en la base)

| Sección / función | Datos, backend y contrato actual | Evidencia |
|---|---|---|
| Shell e Inicio | Diez vistas, selección, gates por plan y canal, actualización, estado de simulador; Wails/events | `frontend/src/hub/navigation.ts:1`, `frontend/src/hub/orbit/views.ts:8`, `frontend/src/hub/orbit/views.ts:78`, `frontend/src/hub/HubApp.tsx:115` |
| Cuenta y licencias | Login, sesión Supabase protegida por SO; credencial firmada, fingerprint, validación/renovación/reset de dispositivo. El Hub no concede licencia local al núcleo | `frontend/src/hub/HubApp.tsx:21`, `internal/authsession/store.go:17`, `internal/license/supabase_client.go:30`, `internal/license/supabase_client.go:79`, `internal/license/service.go:372` |
| Studio y perfiles | Documento V4 persistido con compatibilidad V3, layout/contenido/comportamiento/apariencia, revisión optimista, backups y límite 5 MiB. Canvas separado del inspector; render común Desktop/Studio/Workshop | `frontend/src/hub/overlay-studio/OverlayStudioV3.tsx:1`, `frontend/src/overlay/core/profile-document.ts:1`, `internal/app/studio_profile_service.go:26`, `internal/app/studio_profile_service.go:87`, `pkg/config/profile_v3_store.go:15`, `pkg/config/profile_v3_store.go:49`, `pkg/config/profile_v3_store.go:79` |
| Workshop | Registro, estados/escenas, dimensiones y superficie, replay, play/pausa/loop/step, comparación; renderer productivo, no uno alternativo | `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx:114`, `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx:175`, `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx:217`, `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx:399` |
| Launcher | Catálogo, aplicaciones/perfiles, discovery, cadena de arranque/cancelación, Steam/hotkeys y ventanas Win32 | `frontend/src/hub/launcher-orbit/LauncherOrbitPage.tsx:1`, `internal/app/launcher/apps.go:70`, `internal/app/launcher/apps.go:320`, `internal/app/launcher/chain.go:1`, `internal/app/launcher/trigger.go:1` |
| Calendario/Carreras | Agenda y series oficiales, importación/curación, timezone, seguimiento y recordatorios persistidos. Discord para publicación/avisos; calendario local independiente de red | `internal/calendar/calendar_service.go:51`, `internal/calendar/calendar_service.go:150`, `internal/calendar/calendar_service.go:257`, `internal/calendar/calendar_service.go:440`, `internal/calendar/calendar_service.go:501`, `internal/calendar/calendar_service.go:604`, `internal/calendar/discordbot/discordbot.go:1`, `internal/app/calendar_bridge.go:1` |
| Notificaciones | Centro acotado con fuente/severidad, dedupe, unread/read/clear y acciones, política por canal. No equivale a toast ni registro de errores | `frontend/src/hub/notifications/NotificationCenter.tsx:1`, `internal/notify/center.go:71`, `internal/notify/center.go:208`, `internal/notify/center.go:289`, `internal/notify/center.go:325` |
| Strategy | Documento V2, eventos/variantes, provenance/confidence/evidence, escenarios de clima, edición/persistencia; solver y análisis fuera del núcleo | `frontend/src/hub/strategy-orbit/StrategyOrbitPage.tsx:1`, `internal/strategy/document/document.go:59`, `internal/strategy/document/document.go:93`, `internal/strategy/document/document.go:359`, `internal/app/strategy_application_bridge.go:55`, `internal/strategy/solver/solver_v2.go:1` |
| Engineer/Spotter | Ajustes/estado, audio/TTS/radio y worker bajo demanda, consumo de eventos (fase 3) | `frontend/src/hub/engineer-orbit/engineer-orbit-bridge.ts:1`, `internal/app/engineer_settings.go:1`, `internal/engineer/`, `internal/tts/` |
| Telemetría y análisis | Fuente/recording/live/histórico, selección de sesión y proyecciones; DuckDB con propietario único (fase 4), no lectura directa por Hub | `frontend/src/hub/telemetry-orbit/telemetry-orbit-source.ts:1`, `internal/app/telemetry_analysis_service.go:1`, `internal/telemetryanalysis/`, `internal/storage/` |
| Testing Center | Diagnóstico sanitizado, draft de report, cancelación, captura contextual y canal; trabajos fuera del núcleo. Automatización inerte | `frontend/src/hub/testing-center-orbit/TestingCenterOrbitPage.tsx:1`, `internal/app/testing_center_report_bridge.go:56`, `internal/app/testing_center_report_bridge.go:150`, `internal/app/testing_center_diagnostic_bridge.go:1`, `internal/testingcenter/reportdraft/store.go:75` |
| Roadmap | Publicación versionada compartida en Supabase; lectura RPC; no inventar un roadmap local editable | `frontend/src/hub/roadmap-orbit/roadmap-contract.ts:1`, `internal/roadmap/service.go:38`, `internal/roadmap/service.go:95`, `internal/roadmap/service.go:113` |
| Ajustes | Cuenta, aplicación, apariencia, rendimiento, updates, hotkeys, privacidad, diagnóstico, schedule; persistencia local y efectos en procesos/servicios | `frontend/src/hub/orbit/views.ts:123`, `frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx:1`, `internal/app/settings_service.go:37`, `internal/app/settings_service.go:101` |

No existen `app*.go` de la aplicación en la raíz de este checkout: las fachadas
vigentes viven en `internal/app/`. No se porta un camino histórico inexistente.
Leídos el expediente y el handoff de overlays/launcher/hub; sus entregas Wails
no constituyen aceptación del Hub nativo.

## Fronteras nativas observadas

- `native/ui/src/registry.rs:61`: 18 tipos en esta base, no 22. Los nuevos se
  incorporan consumiendo `Kind::ALL`; no se copia el catálogo ni se tocan widgets.
- `native/ui/src/app.rs:54`: `Overlay` ya es el renderer productivo. Exponer
  únicamente su constructor/tamaño y reexportar el tipo permite incrustarlo.
- `native/ui/src/efficiency/`: fuentes y tokens ya públicos; reutilizarlos sin
  editar ese kit. `ui/src/workshop.rs:18` ya retiene la última foto válida.
- `native/ipc/`: wire de snapshots existente; no hay contrato aprobado de
  comandos Hub → núcleo para layout/licencias/trabajos. No añadirlo por aquí.
- `native/runtime/src/bin/vantare/`: propietario de core/overlays, mantenido
  por otro worker. Hub no es su hijo. El Hub usa Subscriber y termina por flanco;
  EOF opcional solo sirve al ciclo de desarrollo. El test de pipe no demuestra
  entrada física al juego ni memoria liberada en un escenario LMU/OBS.

## Objetivo y cortes por valor (cada uno con commit ISA-1430)

1. **Shell GPUI independiente.** Crate `native/hub/`, navegación de todas las
   secciones, estados de disponibilidad explícitos, un proceso sin runtime ni
   servicios de red. Cerrar ventana sale del proceso; EOF supervisado opcional.
   Test de navegación/grafo y smoke de argumentos. Medir apertura/cierre/RSS
   por el orquestador. No afirmar paridad de una sección con un panel pendiente.
2. **Workshop sobre renderer compartido.** Selección de todos los tipos
   disponibles, capturas reales versionadas, carga/reload sin destruir la última
   foto válida, secuencia de snapshots real con play/pausa/step/loop y persistir
   selección. Recompilar/reabrir manteniendo estado con script local. Tests de
   JSON inválido, límites, secuencia y conservación; captura visual por Opus.
3. **Studio sobre layout común.** Consumir `vantare_ui::layout` de fase 2:
   `Layout { version, instances }`, IDs de texto, coordenadas globales (también
   negativas), visibilidad, opacidad 0..1, Settings por kind, vector = pintado.
   Selección/undo/redo son estado del editor, no campos del documento. Sin
   proyectos múltiples, filtros propios, bloqueo ni escala. Mientras la API
   no está en esta base: editor de preview en memoria, funciones load/save
   pequeñas con TODO; ninguna escritura de layout ni migración V4.
4. **Servicios restantes por contrato.** Registrar gates y dependencias por
   sección; implementar solo operaciones locales cuyo contrato exista sin
   inventar autoridad, simulaciones de cuenta ni trabajadores ficticios.
   Cuenta/licencias, calendario/Discord remoto y roadmap requieren integración
   de servicios y verificación autenticada fuera de esta ejecución. Strategy
   necesita conservar el documento V2 entero y coordinar solver/storage; análisis,
   Engineer y Testing Center dependen de sus workers/IPC. Continuar con cortes
   independientes; dejar una pregunta concreta por cada bloqueo.
5. **Cierre al juego y checklist.** Hub independiente, Subscriber del pipe
   de fotos; flanco no-Live→Live, primera foto Live no cierra. Exigir también
   SourceState::Live cuando se integre DTO v4. Prueba con dos suscriptores.
   Persistir cada edición confirmada mediante ui::layout al integrar su API.
   EOF queda únicamente para el ciclo de desarrollo, no para supervisión del
   launcher. Liberación de memoria, DPI/OBS/LMU siguen siendo gates físicos.

## Dependencias y alcance de archivos

Propiedad: `native/hub/**`, este microplan. Wiring mínimo:
`native/Cargo.toml`, `native/Cargo.lock`, reexport/visibilidad en
`native/ui/src/lib.rs` y `native/ui/src/app.rs`. No editar domain/model,
IPC, runtime/core, adaptadores, widgets, kit Eficiencia, frontend o Go.

Nuevo crate Hub expresamente encargado para aislar el proceso y sus datos de
edición de overlays. Alternativa: binario en ui, prevista originalmente en
ADR; el encargo de fase permite el crate separado por este aislamiento.
GPUI y gpui_platform: **misma revisión**
`72d28c32c2ba77a579e1c02f984654518552124b`. `vantare-ui`, `vantare-domain`,
`vantare-ipc`: reutilización local. `serde`/`serde_json` ya fijadas en el lock,
para documento local; alternativa de parser manual aumenta código/riesgo.
No framework UI, async runtime, HTTP, DB ni crate Win32 nuevos. Persistencia
con standard library y archivos independientes, sin tocar datos del distribuido.

## Gates, riesgos y preguntas de integración

Antes de cada commit con Rust, en native: `cargo fmt --check`,
`cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings`,
`cargo test --offline --workspace -j 2`. Offline impide descargar dependencias;
fmt no tiene flag jobs. Registrar resultado, tiempo observado y fallos sin
ocultarlos. Builds concurrentes no sirven de benchmark incremental.

- **Bloqueo contenido/apariencia completos:** Settings tipado por widget,
  default/normalized/kind ya está decidido en fase 2. Falta integrar su API;
  no etiquetar Studio/Workshop completos ni implementar escala (excluida).
- **Configuración de overlays resuelta por el orquestador:** archivo común
  `%LOCALAPPDATA%/Vantare/native/layout.json`, vigilancia en overlays y reutilización
  de ventanas por monitor. No añadir un comando IPC ni otro formato.
- **Cierre decidido:** Subscriber, flanco Live. Esta base DTO v3 carece de
  `state.source_state` (fase 2 añade SourceState Waiting/Live/Stale en DTO v4).
  La implementación provisional solo discrimina SourceKind. Falta integrar
  ese campo y probar Waiting→Live/Stale→Live antes de dar el gate por cerrado.
- **Bloqueo servicios:** ¿qué worker/DTO expone auth/entitlements, calendario,
  Strategy V2, notifications, análisis y Testing Center? Validación autenticada
  y física requiere Isaac; la restricción de red impide probarla aquí.
- Riesgos: API GPUI fijada pero inestable, captura/DPI, escritura fallida o
  concurrencia, snapshots grandes, catálogo parcial, paridad visual/funcional
  sin referencia de Hub aprobada. La fase permanece parcial hasta cerrar gates.

## Evidencia por corte

### Corte 1 — shell independiente

Implementado: crate Hub, 14 entradas de navegación (las diez vistas más
Workshop, cuenta, licencias y notificaciones), estados pendientes explícitos,
fuentes/tokens Eficiencia, cierre de ventana y EOF opcional. Sin llamadas de
producto ni dependencia de runtime. GPUI/serde reutilizan exclusivamente el
lock existente; la única entrada nueva de Cargo.lock es `vantare-hub`.

Gates: fmt PASS; clippy workspace/all-targets `-j 2 -D warnings` PASS;
test workspace `-j 2` PASS, incluidos tres tests de Hub (grafo, navegación,
CLI inválida en proceso real). Cuatro tests físicos heredados se omiten por
requerir LMU/ACC; no se han habilitado ni se afirma prueba física.
La compilación fría de tests observó 5m26s; no es un benchmark incremental.
La revisión visual, DPI, teclado y liberación real de memoria quedan para Opus.

No se han actualizado Notion ni GitHub de forma remota. Este documento se
actualiza en cada hito; revisión final reservada a Opus.

### Corte 2 — Workshop local compartido

Implementado: catálogo vigente sin duplicación, selección de snapshots y
JSONL, validación de orden/época/timestamps, play/pausa/step/inicio/loop,
unidades/idioma, fondo de escenario, comparación fijada, recarga a 150 ms y
última foto válida ante error. Persistencia independiente y atómica de
selección con conflicto por bytes/lock, rechazo de archivos `.env*`, lectura
acotada a 16 MiB/512 fotos. La reproducción usa tiempos de recepción de los
DTO, no inventa señales. Los tests de lógica manipulan timestamps declarados;
no se presentan como un corpus temporal físico.

`ui` solo cambia el reexport de `Overlay` y visibilidad de `new`/`wanted_size`.
No cambia widgets ni Eficiencia. `hub/dev.ps1` recompila con dos jobs y usa
una copia del exe de su propia sesión para evitar el bloqueo del binario.
Compila antes de cerrar; un error de compilación conserva la ventana anterior.
Cierre y guardado por EOF, sin iniciar núcleo ni juego.

Gates: fmt PASS; clippy workspace/all-targets PASS; tests workspace PASS,
incluidos nueve tests Hub (cuatro de archivos/escenas, uno CLI, cuatro de
integración/arquitectura). Cuatro pruebas físicas heredadas omitidas. Parser
PowerShell del script PASS; watch/reapertura y paridad visual aún no ejecutados
con interacción física. Compilación de tests observada 34,59 s, sin comparación
de rendimiento (otros workers activos).

**Workshop completo: bloqueado parcialmente** por configuración de contenido
de los widgets, cuatro tipos pendientes de fase 2 y edición de escenas/captura
con aceptación visual. Captura/paridad siguen disponibles en `ui`; no se crea
otro pipeline. Continuar con la edición local independiente de Studio.

### Corte 3 — Studio: corrección vinculante del orquestador

El hito inicial `7cb67a96` tenía un documento propio. **Queda sustituido**:
se ha retirado `Project`, múltiples layouts, filtros de sesión, bloqueo y
preferencias por instancia. No se lee ni se escribe `native-layouts.json`.
`document.rs` es únicamente editor en memoria con la forma exacta de fase 2:
`version`, `instances { id: String, x, y, visible, opacity: f32, settings }`.
Settings se conservan como JSON opaco con kind y opciones hasta consumir el
enum compartido. No se inventan defaults de opciones; la preview usa el
constructor vigente por kind. Negativas son válidas para otros monitores.

Selección, orden, undo/redo (50 cambios) y preview de drag con un único cambio
al soltar se conservan. Guardar devuelve un bloqueo explícito. Preview en
memoria se pierde al cerrar; cerrar no intenta escribirla y no se afirma
edición durable. `load/save` apuntan con TODO a `vantare_ui::layout::Document`;
tras integración deberán guardar cada edición y revertir una que falle.
No se copia la escritura atómica del worker de layout. `files.rs` solo sirve
al estado local del Workshop y otros servicios locales, nunca a layouts.

API observada en el worktree del worker (solo lectura, sin incorporar su diff):
`C:/tmp/vw2-layout/vantare-v2/native/ui/src/layout.rs`, Layout/Instance y Document
open/layout/poll/save. El editor se ha ajustado a esos tipos sin depender de
un worktree ajeno en Cargo. Pendiente integrar API, Settings y aplicación;
no completar por duplicación. Paridad, drag físico/DPI y captura los valida Opus.

### Punto 4 de la decisión — cierre por IPC

Subscriber privado, sondeo no bloqueante a 100 ms, referencia inicial vacía.
`should_close` pura y test: primera foto Live no cierra, Replay→Live cierra,
Live→Live y Live→Replay no cierran. Workshop no alimenta ese suscriptor.
Prueba sobre pipe real con overlays+Hub, misma foto/cursor independiente,
y continuidad del suscriptor overlays tras Drop del Hub. No cambia IPC.

**Bloqueo preciso**: DTO v3 no tiene estado Waiting/Live/Stale. La función
lleva TODO para exigir `state.source_state == SourceState::Live` y almacenar
el booleano completo al integrar DTO v4. Por ahora solo cierra Replay→Live;
no detecta la entrada desde Waiting con kind Live. No se considera completada
la condición vinculante ni la persistencia antes del cierre hasta ambas APIs.

### Precisión del corte 4 antes de implementarlo

Se porta la lectura local del catálogo oficial UTC y el seguimiento local de
series, sin importar/publicar datos remotos. El seed actual vence
`2026-09-01T00:00:00Z`: se presenta como histórico, sin inventar próximas carreras.
Una agenda externa explícita puede ser vigente; se valida su ventana y recurrencia.
Las zonas distintas de UTC requieren el porte de la conversión de zonas, no
se aproximan con el offset de hoy. Publicación Owner, inbox Discord, eventos
manuales y generación de recordatorios completos quedan pendientes de su
contrato de servicio e integración autenticada.

`chrono = 0.4` pasa a dependencia directa de Hub, **ya resuelta** en Cargo.lock
por GPUI. Justificación: RFC3339, fecha/weekday y ventanas UTC del calendario.
Alternativa std no tiene parser/calendario civil; hacerlo a mano añade riesgo
en límites de fecha. No se añade chrono-tz ni otro paquete/versión resuelta.

Centro de notificaciones: conservar fuentes cerradas updater/launcher/system,
severidades, dedupe, unread, límite 50 y acciones allowlisted. Calendario y
Spotter NO entran en ese centro (`internal/notify/center.go:32`, `:105`);
los recordatorios son otra superficie. Solo errores locales reales alimentan
el Hub en este corte; los otros publishers y toasts esperan integración.

Gates de la corrección vinculante: fmt PASS; clippy workspace/all-targets -j 2 -D warnings PASS (3,01 s); test workspace -j 2 PASS (compilación 1m27s), 14 tests Hub. Cuatro tests físicos heredados omitidos. La dependencia chrono ya fijada queda declarada para el corte 4 descrito arriba; no hay paquete nuevo resuelto.

### Corte 4 — secciones con operaciones locales

Calendario: proyección de catálogo oficial UTC del seed Go, validación de
versión/ventana/IDs/recurrencias y expansión interval/weekly-slots con el
mismo anclaje año 1 y ventana exclusiva de Go. Seguimiento se guarda en
`calendar-following.json`; un fallo de escritura no cambia la selección.
`official-schedule.json` en data-dir se carga por botón, sin publicar ni
reescribir el catálogo; un JSON inválido conserva el anterior. Seed vencido
no genera próximas carreras. Solo una agenda local vigente ofrece 24 h de
salidas seguidas (máximo 20 en pantalla). Validación es de los campos de la
proyección, no reemplaza validación/publicación oficial del backend Go.

Notificaciones: fuentes updater/launcher/system cerradas, severidades,
acciones navigate allowlisted a launcher/settings:updates, dedupe por clave,
repetición conserva leído, firma cambiada vuelve a unread, retención 50,
lectura/vaciado y causa UTF-8 hasta 240 bytes. Se alimenta de errores reales
de guardado/formato/calendario. Historial de proceso, como Go; no se persiste
ni se añaden toasts. No se simulan publishers remotos.

Ajustes: formato del Workshop mediante su fuente de preferencias existente;
guardado inmediato, rollback si falla, sin segundo documento de ajustes.
Testing Center: contexto de la foto local del Workshop (simulador, origen,
época, secuencia, número de coches/fotos, error de escena), sin copiar nombres
de pilotos, rutas de cuenta ni credenciales. No es reporte ni diagnóstico
físico. Otros servicios siguen con su frontera explícita, sin autoridad nueva.

Tests: seed vencido y frontera exclusiva, recurrencia inválida/zona distinta
UTC/ID repetido, redondeo interval y weekday/slots UTC, seguimiento después de
reiniciar, fallo de guardado e importación conservan estado; notificaciones
repetidas/cambiadas, read/mute/retención, fuentes/acciones y truncado UTF-8.

| Sección pendiente | Dependencia / siguiente acción concreta |
|---|---|
| Inicio / estado real | Integrar DTO v4 para fuente Waiting/Live/Stale; no mostrar Workshop como juego vivo |
| Studio / Workshop completo | Integrar ui::Settings y ui::layout de fase 2; eliminar puente opaco, guardar edición común y aplicar mediante vigilancia de overlays |
| Launcher | Consumo del catálogo, descubrimiento y cadena del propietario; Hub nunca hijo ni servicio permanente |
| Calendario completo | Porte UTC/local de zonas y contratos de recordatorios/eventos/Discord; agenda publicada autenticada requiere Isaac |
| Cuenta | Worker de auth Supabase y almacén protegido; sin credenciales/red no verificar sesión real |
| Licencias | DTO validado por propietario, credenciales firmadas y acciones de dispositivo; Hub no concede permisos |
| Strategy | Documento V2 con evidencia completa más contrato de jobs solver/storage; no crear un documento reducido ni cálculos ficticios |
| Engineer | Estado/ajustes/eventos y audio de fase 3; sin canal de trabajos aprobado no ejecutar voz desde Hub |
| Análisis | Respuestas del único propietario DuckDB de fase 4; Hub no abre DB ni importa otra implementación |
| Testing Center completo | Contrato sanitizado de diagnóstico/draft/reportes y cancelación; automatización sigue inerte |
| Roadmap | Lectura de publicación Supabase vigente; sin copia local editable ni contenido inventado |
| Ajustes completos | API de hotkeys/actualizaciones/privacy/audio/rendimiento; formato local no equivale a estos efectos |
| Notificaciones completas | Publishers de updater/launcher y worker de toasts; local Center no demuestra esos emisores |

Hallazgo resuelto de corte 4: el primer run de tests falló en tres pruebas de
calendario porque camelCase de serde produce `timesUtc`, distinto del contrato
Go `timesUTC`. Se añadió rename explícito y se repitió la lectura del seed real,
los tests dirigidos y el workspace. Seguimiento valida IDs vacíos/repetidos y
límite 256 tanto al cargar como antes de guardar, con test de conservación.

Gates finales de corte 4: fmt PASS; clippy workspace/all-targets -j 2 -D warnings
PASS (3,29 s); tests workspace -j 2 PASS, incluidos 20 tests Hub y oráculos
LMU/ACC. Compilación observada 54,83 s; cuatro pruebas físicas heredadas
omitidas. La carga concurrente produjo tiempos variables, no son benchmark.

### Corte 5 — cierre y entrega aislada

Referencia del flanco es `Option<bool>`: `None` primera foto, después valor
completo de `is_live`. Al integrar DTO v4 basta exigir SourceState::Live en
ese predicado, y probar Waiting→Live/Stale→Live/primera Live. Hasta entonces
SourceKind solo permite observar Replay→Live. No inferir entrada al juego de
SessionKind ni de snapshots de Workshop. Subscriber se destruye al terminar
el Hub; la prueba de dos consumidores protege continuidad de overlays.

`--pipe NOMBRE` permite elegir el mismo pipe que core/overlays y aislar pruebas.
Sin argumento usa el nombre privado por usuario ya existente de IPC. Argumentos
vacíos/repetidos/incompletos fallan antes de abrir ventana. No es un nuevo
protocolo ni un canal de comandos.

`hub/verify-process.ps1`: copia del exe y datos temporales únicos, pipe único
sin productor, proceso GPUI vivo antes de EOF, guardado de selección y salida
completa con código 0. Limpia solo sus archivos, sin borrado recursivo ni
matar core/overlays/juegos. Esperas de arranque/salida son acotadas, no métricas
de rendimiento. El smoke abre una ventana GPUI, no hace interacción visual.

Checklist de integración para Opus (no completada por este worker):

1. Integrar primero Settings/ui::layout y DTO v4 de fase 2. Sustituir tipos
   puente por imports comunes, delegar load/save a Document, guardar cada
   edición/undo/redo confirmada y conservar anterior si falla. Retirar botón
   de guardado bloqueado. No reintroducir Project ni otro archivo de layout.
2. Completar is_live con SourceKind::Live && SourceState::Live; ampliar tests
   de Waiting/Stale y primera foto Live. Probar proceso real con core v4,
   además de overlays simultáneo, entrada a LMU/ACC y apertura con juego vivo.
3. Aplicación del layout pertenece al worker de ui: comprobar continuidad
   de ventanas/OBS al editar y ocultar todos, incluido fallo de escritura.
4. Revisión visual, teclado, DPI, multi-monitor, captura/paridad y presupuestos
   con juego/OBS y Hub cerrado. No sustituir ese gate por EOF o replay.
5. Conectar servicios pendientes mediante sus contratos de trabajos; pruebas
   autenticadas y de publicación requieren Isaac, credenciales bajo su control
   y autorización externa. No hay servicios de red en este diff.

Los cortes locales quedan revisables; **fase 5 completa sigue bloqueada** por
integración de APIs de fase 2, servicios y aceptación física. Preguntas abiertas
para la integración: DTO/endpoint de jobs Strategy, Engineer, análisis y
Testing Center; entrega de auth/licencias al Hub sin autoridad local; API de
publicación/calendario/recordatorios/roadmap y publishers/toasts. No hay una
decisión de arquitectura nueva para layout ni para cierre que pedir a Isaac.

Smoke de proceso ejecutado: `./hub/verify-process.ps1` PASS, PID 19844,
salida 0; proceso vivo antes de EOF, selección escrita y proceso terminado.
Duración total observada 2,40 s bajo carga concurrente (no benchmark). Parser
PowerShell PASS. No se inició core, overlays ni juego, ni se leyó una cuenta.

Gates finales de corte 5: `cargo fmt --check` PASS (salida vacía, código 0);
`cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings` PASS,
Finished dev en 8,81 s; `cargo test --offline --workspace -j 2` PASS, código 0,
20 tests Hub y suites/oráculos del workspace en verde. Compilación 56,15 s;
cuatro pruebas físicas heredadas ignoradas. No se ejecutaron pruebas físicas
LMU/ACC/OBS, DPI, teclado, watch de recompilación/reapertura ni benchmarks.
EOF sí se comprobó con proceso real; el pipe de dos consumidores con test.

## Integración local de fase 2 (2026-09-30)

Se integra `vantareapp/isa-1427-fase2` en `ecfbde31f5ec83f285f3e28882819f7a1f19c9d1`, por instrucción explícita del orquestador. Incluye DTO v4, layout común, Engineer y ACC. Los conflictos combinan miembros Hub/Engineer del workspace, lock y exports/constructor de Overlay. La única exposición adicional de UI es `Overlay::configured(&Settings, Preferences)` para que Studio use el mismo renderer configurado. No se modifican widgets ni el kit.

El corte Studio provisional queda sustituido por `ui::layout::Document`; el siguiente hito conecta edición transaccional, Settings tipados y conflictos por bytes. Las limitaciones históricas de DTO v3 y layout en memoria dejan de ser decisiones vigentes tras ese hito. Engineer exige revisar su contrato local antes de conectar ajustes/estado; no se crean servicios de red.

Incidencia de validación del merge: el primer `cargo test --offline --workspace -j 2` falló al enlazar por disco C: lleno (`no space on device`, LNK1318/PDB). Se verificó que `native/target` era directorio local, sin enlace, dentro de este worktree; `cargo clean` retiró 15,0 GiB de artefactos propios. Repetición con `CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`, `CARGO_INCREMENTAL=0` solo en el entorno de los gates; no se cambian perfiles ni pruebas. fmt PASS y Clippy completo PASS (3m37s tras reconstrucción). Resultado de tests a continuación.

Repetición de tests del merge: PASS, código 0, compilación 6m42s. Veinte pruebas Hub; seis omitidas heredadas (cuatro físicas y dos bloqueadas ACC/núcleo). fmt y Clippy completo PASS. Sin cambios a los tests importados ni a sus marcas ignored.
