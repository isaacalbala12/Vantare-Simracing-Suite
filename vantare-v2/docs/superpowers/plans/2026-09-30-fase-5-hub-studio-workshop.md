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
- `native/runtime/src/bin/vantare/`: launcher propietario de procesos; otro
  worker mantiene runtime. Un botón o EOF no demuestra entrada automática al
  juego. El cierre integrado requiere coordinación con ese propietario.

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
3. **Studio local.** Documento nativo versionado, instancias, selección,
   colocación, orden, visibilidad/bloqueo, undo/redo y persistencia protegida ante
   fallo/conflicto, mismo `Overlay`. Inspector con preferencias de formato
   compartidas. Tests de edición/undo/roundtrip/conflictos. No migrar ni
   sobrescribir documentos Go V4. Consumo del layout por overlays: depende del
   comando de configuración de otras fases.
4. **Servicios restantes por contrato.** Registrar gates y dependencias por
   sección; implementar solo operaciones locales cuyo contrato exista sin
   inventar autoridad, simulaciones de cuenta ni trabajadores ficticios.
   Cuenta/licencias, calendario/Discord remoto y roadmap requieren integración
   de servicios y verificación autenticada fuera de esta ejecución. Strategy
   necesita conservar el documento V2 entero y coordinar solver/storage; análisis,
   Engineer y Testing Center dependen de sus workers/IPC. Continuar con cortes
   independientes; dejar una pregunta concreta por cada bloqueo.
5. **Cierre al juego y checklist.** Guardado antes del cierre, EOF desde el
   propietario; pruebas reales de proceso hijo. La entrada automática al juego,
   ausencia de reinicio del Hub, liberación de memoria, DPI/OBS/LMU y paridad
   completa son gates físicos/de integración, no se sustituyen por un test puro.

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

- **Bloqueo contenido/apariencia completos:** el host actual acepta snapshot y
  `Preferences`, no contrato de configuración por widget. ¿Qué API común y
  tipada expondrá fase 2 para rowCount, columnas, contenido, opacidad/escala y
  comportamiento sin duplicar renderer? Hasta ella no etiquetar Studio completo.
- **Bloqueo configuración de overlays:** ¿qué mensaje versionado y confirmación
  usa el propietario para aplicar un layout? No conectar a runtime por dependencia.
- **Bloqueo cierre automático:** ¿qué señal del propietario indica entrar al
  juego, y qué política evita relanzar Hub tras salida deliberada? Debe verificar
  el orquestador en el launcher, no inferirse de una sesión Race en un replay.
- **Bloqueo servicios:** ¿qué worker/DTO expone auth/entitlements, calendario,
  Strategy V2, notifications, análisis y Testing Center? Validación autenticada
  y física requiere Isaac; la restricción de red impide probarla aquí.
- Riesgos: API GPUI fijada pero inestable, captura/DPI, escritura fallida o
  concurrencia, snapshots grandes, catálogo parcial, paridad visual/funcional
  sin referencia de Hub aprobada. La fase permanece parcial hasta cerrar gates.

## Evidencia por corte

Pendiente de implementación. Este documento se actualiza en cada hito con
checks, omisiones y límites comprobados; revisión final reservada a Opus.
