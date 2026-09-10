# ISA-1097 — Acceso y marca por widget

Isaac autoriza el 2026-09-10 continuar y comprobar las dos entregas juntas al
terminar. Rama `vantareapp/isa-1097-widget-access-branding`, worktree
`C:/tmp/vantare-isa1097`, base apilada `87cef39a` de ISA-1083. La promoción
conserva el orden ISA-1083 → Nightly, ISA-1097 → Nightly tras la revisión conjunta.
No se integra ni publica durante este desarrollo.

## Decisiones

- Efficiency/Eficiencia contiene Signature y Broadcast; los IDs existentes se conservan.
- Free: Standings y Pedals; Delta y los demás premium requieren sus derechos.
- Crystal/Efficiency: marca obligatoria en Free; oculta por defecto en pago,
  activable por preferencia. Original mantiene su presentación.
- Al perder acceso se preservan todos los ajustes del perfil. El widget premium
  deja de ejecutarse y puede eliminarse. Cambiar la licencia actualiza las superficies.
- La licencia verificada existente es la autoridad. La presentación no lee
  permisos, almacenamiento, Wails ni SSE. No se toca facturación ni secretos.

## Cortes y verificación (estado FINAL nativo 2026-09-10; revisor aprobó)

1. [x] Regresión de Delta premium y eliminación/guardado tras downgrade
   (frontend: `widget-definition.ts`, `studio-access.ts/test`; 23/23 PASS,
   typecheck/build/lint PASS sobre este árbol).
2. [x] Política nativa y contrato de presentación usando el transporte de
   licencia existente. Historia: el primer borrador NO fue aceptado para
   conectar consumidores; la revisión exigió derechos por feature
   (Pro/Launch firmados, roles válidos, engineer.ai separado), secuencia de
   revisión estable, expiración nativa con plazos verificados, snapshots sin
   referencias mutables y commit atómico de caché. Todo corregido con
   regresiones y cerrado por el revisor.
3. [x] Guardado nativo (Studio V3, Hub legacy, Profile legacy) e importación
   admitida preservada contra la decisión común. Transporte: snapshot y
   eventos Wails + SSE OBS con snapshot/reconexión.
4. [ ] Marca integrada con cabecera oculta y preferencia en pago → lo ejecuta
   #1105 (issue/rama/worktree propios) sobre contrato exacto publicado abajo.
   Preferencias nunca conceden acceso ni evitan marca obligatoria.
5. [x] Tests de Free/pago/expiración/gracia vigente, perfiles previos y varios
   widgets en nativo (ver Evidencia); frontend completo lo cierra #1105.
6. [ ] Comprobación física conjunta de ambas entregas, pospuesta por Isaac.

Archivos previstos: política de licencia y wire Go, servicio de perfiles y
composición nativa/HTTP; contexto de acceso, Studio y superficies runtime;
presentación de marca del host/Crystal/Efficiency y sus controles, traducciones
y tests. No se modifica el canvas espacial ni se añade un renderer o dependencia.

Rollback: revertir esta entrega mantiene los perfiles y diseños de ISA-1083;
una preferencia de marca desconocida no elimina widgets ni telemetría.

## Evidencia

Primer corte: cuatro regresiones fallaban antes del cambio (Delta y eliminación
premium). Tras corregir la matriz y permitir eliminación, 23/23 tests de acceso
pasan. No es aún la política nativa ni certifica el runtime.

> HISTÓRICO SUPERADO 2026-09-10 (alcance: contrato intermedio; fecha de
> superación: mismo día tras correcciones + transporte + guards + wiring).
> Se conserva como evidencia del proceso; el estado vigente está en
> "Cortes y verificación", "Contrato exacto" y "Cierre nativo Go".
>
> Segundo corte (contrato CORREGIDO entonces pendiente de revisión): el
> borrador anterior NO se aceptó para conectar consumidores. La revisión del
> orquestador encontró discrepancias y quedaron corregidas en el worktree:
> derechos por feature, roles válidos desde la autoridad, secuencia de
> revisión estable, expiración nativa con plazos verificados y commit
> atómico de caché. 21 tests nuevos RED→GREEN más 2 de emisor actualizados;
> paquete `license` PASS, `go vet` limpio. Lo que entonces faltaba
> (transporte OBS/SSE, guards, wiring) se implementó y cerró después; ver
> "Cierre nativo Go".
>
> Análisis independiente HISTÓRICO (motivó el corte de transporte, hoy
> implementado): OBS no recibía la licencia y los plazos firmados se
> descartaban al validar; hizo falta conservar plazos verificados, derivar
> política sin datos personales y exponer el mismo snapshot a
> Studio/Desktop y OBS, con logout/expiración desde la autoridad efectiva,
> anónimo inconcluyente sin degradar, y guardado contra perfil nativo.
>
> ISA-1103 HISTÓRICO: banderas e info de sesión en Efficiency en otro
> worktree; quedó APROBADO (todos los gates en verde) y sus renderer/CSS no
> se tocaron desde aquí. La marca integrada la ejecuta #1105.

## Contrato exacto para consumidores (frontend #1105)

Sin bindings de métodos: el frontend solo usa eventos Wails (`Events`), como
todo el repo. No existe ni hace falta binding generado.

- Snapshot Studio/Desktop: `Events.Emit("widget-policy:get", {})` →
  respuesta `widget-policy:snapshot` con `WidgetPolicyWire`. Regla matizada:
  aplicar si no hay revisión aplicada o si `revision` no es menor que la
  aplicada; el reinicio de autoridad recarga el frontend y deja la revisión
  sin fijar, así que el snapshot inicial siempre entra. Un snapshot
  retrasado de la misma instancia nunca pisa un changed con mayor revisión.
- Push Studio/Desktop: `widget-policy:changed` con `WidgetPolicyWire`.
  Aplicar solo si `revision` es mayor que la aplicada; la emisión sale fuera
  del lock y puede llegar desordenada: descartar lo viejo por revisión.
- Nativo tras ambas respuestas: `(*license.Service).CurrentWidgetPolicy()`.
- OBS: `GET /api/widget-policy/stream`, solo loopback, SSE. Primer mensaje
  de cada conexión `widget-policy:snapshot` (aplica siempre en esa conexión:
  el orden TCP impide que un snapshot retrasado del mismo stream pise un
  changed posterior, y el reinicio de autoridad se detecta por revisión
  menor al reconectar); después `widget-policy:changed` solo si revisión
  mayor. Sin PII en el cable por construcción (test específico).
- DTO `WidgetPolicyWire`: `{revision: number, overlaysBasic: bool,
  overlaysAdvanced: bool, engineerAI: bool, brandCrystal/brandEfficiency/
  brandOriginal: "required"|"optional"|"none", validUntil?: RFC3339}`.
  Sin userId/email/entitlements/capabilities/roles/tokens.
- Guardado Studio V3: ediciones que escalen privilegios sobre widgets
  bloqueados se rechazan con `studio:profile:error` y los IDs; el payload
  tipado añade `code: "widget-access-denied"` + `widgetIds` (vía `errors.As`,
  `requestId`/`operation`/`message` intactos) para que #1105 use su aviso
  localizado sin comparar strings. Mover, borrar y conservar siempre
  permitido; importar admite preservado/inactivo (la ejecución la filtra el
  runtime). Preferencia de marca: presentación.

## Congelación FINAL (revisión, 2026-09-10; main.go descongelado solo para el
cableado autorizado y revuelto a congelar)

Conjunto congelado completo:
`internal/license/types.go`, `credential.go`, `service.go`,
`telemetry_analysis_policy.go`, `widget_policy.go`, `widget_policy_test.go`,
`widget_policy_service_test.go`, `emitter_test.go`,
`internal/server/widget_policy_sse.go`, `widget_policy_sse_test.go`,
`server.go`,
`internal/app/widget_policy_guard.go`, `widget_policy_guard_test.go`,
`studio_profile_service.go`, `studio_profile_runtime.go`, `hub_service.go`,
`profile_service.go`,
`cmd/vantare/main.go` (getter `widget-policy:get`, ruta OBS y
`wireWidgetPolicySources` con las 3 llamadas),
`cmd/vantare/widget_policy_wiring.go`, `widget_policy_wiring_test.go`,
`docs/analysis/ISA-1097-widget-access-branding.md`,
`docs/vantare-program/handoffs/overlays-launcher-hub.md` (sección ISA-1097).
Evidencia contrato/transporte: paquete `license` completo PASS (incluye
`-race` en política), paquete `server` completo PASS, `go vet` limpio.
Evidencia guards: 25/25 PASS (detalle abajo) + wiring 3/3 PASS.

## Cierre nativo Go (2026-09-10; sin pendientes en nativo)

- Guards: `internal/app/widget_policy_guard.go` (V3 + legacy, misma
  semántica de preservación; import admite, edición que escala privilegios
  deniega con IDs); hook en `savePath` (Save/SaveInPlace/
  HandleSave/edit-layout), `HubService.SaveProfile`,
  `ProfileService.SaveProfile/SaveProfileState` con fuente inyectable
  (nil = legacy). `SaveProfileAsOwnCopy`/`CreateProfile` admiten
  (import/plantilla; el runtime filtra ejecución).
- Detalle: 11 V3 puros (incl. import-nil) + 3 servicio V3 + 8 legacy puros +
  2 servicio Hub + 1 servicio ProfileState = 25 tests de guard.
- Cableado composición: `wireWidgetPolicySources(hubSvc, profileSvc,
  studioProfileSvc, licenseSvc)` en `main.go` + 3 tests de wiring PASS con
  control sin cablear que prueba la sensibilidad (si se quita una llamada,
  el save forjado pasa y el test falla).
- Checks: `go test ./...` exit 0 sin ningún FAIL; `go build ./cmd/vantare`
  exit 0 (tras `pnpm --dir frontend build` para embed; warning heredado de
  chunks >500kB); `pnpm --dir frontend typecheck` exit 0; `go vet` limpio.
  Fuentes frontend en esta entrega: 3 ediciones iniciales de matriz/acceso
  (`widget-definition.ts`, `studio-access.ts/test`) + ajustes SOLO de
  fixtures/aserciones en 4 archivos de test (acceso de pago explícito donde
  el propósito es edición/guardado premium; las regresiones Free→bloqueo/
  mover/borrar se conservan). Cero frontend productivo adicional (lo ejecuta #1105).
- Suite frontend completa sobre este árbol: 424/424 archivos,
  3360 PASS + 2 omitidos, exit 0
  (`frontend/design-evidence/isa1097/frontend-full.log`, ignorado por git).
  El log contiene además `DOMException [AbortError]` de happy-dom al abortar
  fetch en teardown: ruido en stderr con los tests en verde, registrado tal
  cual sin declararlo limpio ni heredado (no reproducido en base) y sin
  arreglar happy-dom en este alcance.
  Los 6 fallos iniciales del full eran aserciones codificando Delta-como-Free
  (matriz anterior), no heredados: se ajustaron fixtures en
  `studio-catalog.test.ts`, `AddWidgetDialog.test.tsx`,
  `StudioOrbitLayout.test.tsx` y `studio-store.test.tsx` (#1105 conserva la
  intención al migrar a política nativa; detalle de archivos al cierre).
- Integración: #1098 preparará el candidato conjunto desde Nightly
  `a9b8dd36`, preservando los commits de #1083/#1103/#1097/#1105 y Redline
  Tower, antes de la prueba conjunta y la promoción (#1098 ya es
  `roadmap:required` para el candidato agregado).
- Nota de atribución RED: los RED puros fueron deterministas (símbolos
  indefinidos + aserciones que fallaban antes del fix; caso 11/12 en guard
  V3). El RED del test concurrente de intercalado sobre código con carrera
  es probabilístico por naturaleza (estrés con barrera, no garantizado en
  una sola corrida); su veredicto en código corregido sí es determinista
  por construcción + `-race` limpio.
- Higiene de reloj en tests (solo tests, sin cambio productivo): un test de
  caché usaba deadline fijo con `policyClock` real y empezó a fallar al
  cruzar el reloj la hora del fixture (14:27 UTC > 13:00); ahora controla
  `policyNow` como el resto. La producción siempre usó el reloj correcto.
