# Deuda tecnica

Documento vivo para centralizar deuda tecnica aceptada, P2/P3 diferidos y follow-ups de reviews.

## Reglas

- Todo P0/P1 debe corregirse antes de cerrar la tarea afectada.
- Todo P2 debe corregirse antes de cerrar la tarea o quedar listado aqui con owner, release objetivo y motivo.
- Todo P3 puede quedar aqui si no bloquea el avance, pero debe tener una decision clara: ignorar, agrupar, corregir en release concreta o revisar en auditoria global.
- No usar este documento como sustituto de tests o reviews. Solo registra deuda aceptada.
- Al cerrar una deuda, moverla a "Cerrado" con fecha y commit si existe.

## Formato

```md
### TD-000 - Titulo corto

- Severidad: P2/P3
- Area: release/frontend/go/docs/preview/licensing/updater/ci
- Origen: review/tarea/documento
- Estado: abierto/en progreso/cerrado
- Release objetivo: R03/R04/R15/post-release
- Motivo para diferir:
- Fix esperado:
- Riesgo si se ignora:
```

## Abierto

### TD-002 - Verificacion de checksums sidecar

- Severidad: P3
- Area: release
- Origen: review R03.B/R03.C
- Estado: abierto
- Release objetivo: R03.D/R03.E o antes de release publico
- Motivo para diferir: el pipeline canonico recalcula los checksums en cada `release:artifacts`; no bloquea beta privada.
- Fix esperado: anadir tarea `release:checksums:verify` que lea los `.sha256` y compare contra los artefactos actuales.
- Riesgo si se ignora: flujos manuales parciales podrian dejar checksums stale sin aviso.

### TD-003 - GitHub Release idempotente

- Severidad: P3
- Area: ci/release
- Origen: review R03.C
- Estado: abierto
- Release objetivo: R03.E o antes de primer tag publico estable
- Motivo para diferir: un re-run sobre una release ya creada falla de forma visible, no corrompe artefactos.
- Fix esperado: usar `gh release view` + `gh release upload --clobber`, o estrategia equivalente.
- Riesgo si se ignora: reintentos de CI sobre tags existentes quedan en rojo y requieren intervencion manual.

### TD-004 - Publicacion explicita de assets de release

- Severidad: P3
- Area: ci/release
- Origen: review R03.C
- Estado: abierto
- Release objetivo: R03.E o antes de release publico
- Motivo para diferir: el artifact actual contiene exactamente los 6 archivos oficiales.
- Fix esperado: enumerar los 6 assets esperados en `gh release create/upload` en vez de usar glob amplio.
- Riesgo si se ignora: un archivo extra futuro en `bin/` podria publicarse sin decision explicita.

### TD-005 - Verificacion estricta de version NSIS en CI

- Severidad: P3
- Area: ci/release
- Origen: review R03.C
- Estado: abierto
- Release objetivo: R03.E o antes de release publico
- Motivo para diferir: Chocolatey instala version pinned y el wrapper localiza `makensis`; riesgo bajo.
- Fix esperado: ejecutar `makensis /VERSION` y fallar si no coincide con la version esperada.
- Riesgo si se ignora: drift de version en `windows-latest` podria cambiar salida del instalador.

### TD-006 - Re-renderizado completo de React a 30Hz desde raiz (PERF-H1)

- Severidad: P2
- Area: frontend/performance
- Origen: auditoria `docs/overlay-performance-audit.md`
- Estado: abierto
- Release objetivo: R04 o pre-release polish
- Motivo para diferir: la app funciona porque los widgets usan `useRef` + escritura directa DOM; el impacto es CPU de reconciliacion, no funcional. No bloquea beta.
- Fix esperado: desacoplar la suscripcion rapida de telemetria de React; usar hook que escuche solo cambios de visibilidad discretos en vez de re-renderizar desde `ObsOverlayApp`/`CompositeApp` en cada tick.
- Riesgo si se ignora: sobrecarga de CPU en escenas con muchos widgets activos simultaneamente.

### TD-007 - Normalizacion de variantes en cada render/tick (PERF-H2)

- Severidad: P2
- Area: frontend/performance
- Origen: auditoria `docs/overlay-performance-audit.md` + current-plan hallazgos P3 #2
- Estado: abierto
- Release objetivo: R04 o pre-release polish
- Motivo para diferir: el impacto es GC pressure por objetos temporales; no bloquea funcionalidad ni beta.
- Fix esperado: pre-calcular y memoizar variantes enriquecidas al cargar/guardar el perfil, no en cada render de `ObsOverlayApp`/`CompositeApp`.
- Riesgo si se ignora: saturacion del GC con perfiles de muchos widgets, especialmente en OBS (rendimiento reducido).

### TD-008 - Harness visual/browser con Playwright ausente

- Severidad: P3
- Area: frontend/testing
- Origen: current-plan hallazgos P3 #4 + widget-preview-bug-log.md
- Estado: abierto
- Release objetivo: R04 o primera auditoria global (post-R03)
- Motivo para diferir: JSDOM cubre logica, no layout visual real. No bloquea desarrollo actual.
- Fix esperado: crear suite de tests visuales con Playwright que detecte regresiones de centrado, clipping y cajas invisibles en previews.
- Riesgo si se ignora: regresiones visuales de preview solo detectables mediante verificacion manual prolongada.

### TD-009 - `mockSessionScenario` propagado a widgets no-standings

- Severidad: P3
- Area: frontend/widgets
- Origen: current-plan hallazgos P3 #7
- Estado: abierto
- Release objetivo: R03/R04
- Motivo para diferir: sin impacto funcional; solo `Standings` consume el escenario.
- Fix esperado: acotar `mockSessionScenario` al widget que lo necesita en lugar de propagarlo a todos.
- Riesgo si se ignora: confusion en futuros widgets que podrian depender erroneamente de este contexto compartido.

### TD-010 - Multiples bucles rAF concurrentes sin centralizar (PERF-H3)

- Severidad: P3
- Area: frontend/performance
- Origen: auditoria `docs/overlay-performance-audit.md`
- Estado: abierto
- Release objetivo: R04
- Motivo para diferir: cada widget gestiona su propio rAF con cancelacion correcta; funcionalmente correcto.
- Fix esperado: centralizar bucles de dibujado en un unico rAF global compartido por layout (Unified Paint Loop).
- Riesgo si se ignora: desalineacion de fotogramas entre widgets y mayor numero de contextos rAF del necesario.

### TD-011 - Test de regresion Ctrl+S con autosave:false ausente

- Severidad: P3
- Area: frontend/testing
- Origen: current-plan hallazgos P3 #8 (S4.6)
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: el handler no cambio y GLM no lo considera bloqueante.
- Fix esperado: anadir test que verifique que Ctrl+S no persiste cuando `autosave:false`.
- Riesgo si se ignora: una regresion futura en el shortcut podria persistir cambios no deseados sin cobertura de test.

### TD-012 - Selector mock usa clase CSS en vez de aria-pressed

- Severidad: P3
- Area: frontend/testing
- Origen: current-plan hallazgos P3 #5 (S4.5)
- Estado: abierto
- Release objetivo: R03/R04
- Motivo para diferir: el selector funciona correctamente; el test pasa. Mejora de robustez de testing.
- Fix esperado: cambiar test de `className` a `aria-pressed` para alinearse con el enfoque accesible del rework UI/S5.
- Riesgo si se ignora: tests fragiles ante cambios de estilos CSS.

### TD-013 - `columns: []` se normaliza a defaults ambiguo

- Severidad: P3
- Area: frontend/schema
- Origen: current-plan hallazgos P3 #1
- Estado: abierto
- Release objetivo: post-release / schema v3
- Motivo para diferir: funciona porque el codigo trata `[]` como "usar defaults". Sin quejas funcionales.
- Fix esperado: definir comportamiento explicito para array vacio (p.ej. error de schema o default explicto) en lugar de normalizacion silenciosa.
- Riesgo si se ignora: ambiguedad para futuros cortes de schema o migraciones.

### TD-014 - `version:sync` dirty detection ausente

- Severidad: P3
- Area: release
- Origen: R03.B completado, current-plan linea 75
- Estado: abierto
- Release objetivo: R03.D/E
- Motivo para diferir: ejecutar `version:sync` sobre un working tree sucio podria sobrescribir cambios no commiteados.
- Fix esperado: anadir precondicion en `version:sync` que detecte cambios sin commit y advierta/falle antes de sincronizar.
- Riesgo si se ignora: un developer podria perder cambios locales al ejecutar `release:artifacts` sin commitear primero.

### TD-015 - Auth/licencias requieren review de seguridad real

- Severidad: P2
- Area: security/auth
- Origen: `docs/release-documentation-audit-2026-06-26.md`
- Estado: abierto
- Release objetivo: R02 final o R14/R15 antes de release publico
- Motivo para diferir: el flujo basico funciona con Supabase; la beta privada no expone datos sensibles reales.
- Fix esperado: ejecutar threat model, validacion de webhooks Stripe idempotentes, device binding y reset flow, storage de tokens, revocation y grace period, logs sin secretos/PII, tests de concurrencia y reintentos.
- Riesgo si se ignora: brecha de seguridad, perdida de licencias, tokens expuestos o device binding vulnerable en produccion.

### TD-016 - Densidad visual con bestLap/lastLap en widgets pequenos

- Severidad: P3
- Area: frontend/ux
- Origen: current-plan hallazgos P3 #3
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: parcialmente mitigado con ancho intrinseco y recorte de nombre explicito.
- Fix esperado: definir comportamiento de overflow o escalado cuando columnas opcionales no caben en el widget.
- Riesgo si se ignora: widgets visualmente apretados si el usuario activa todas las columnas en espacio reducido.

### TD-017 - Selector mock usa paleta neutral en vez de UI consistente

- Severidad: P3
- Area: frontend/ux
- Origen: current-plan hallazgos P3 #6 (S4.5)
- Estado: abierto
- Release objetivo: R03/R04
- Motivo para diferir: el rework UI/S5 aplicara la paleta consistente; hasta entonces es funcional.
- Fix esperado: alinear el selector mock con la paleta del rework UI (estilo oscuro/denso del `WidgetStudio`).
- Riesgo si se ignora: incoherencia visual temporal entre el selector mock y el resto de la UI.

### TD-018 - Smoke test end-to-end del updater

- Severidad: P3
- Area: updater/testing
- Origen: cierre R03.D
- Estado: abierto
- Release objetivo: antes de declarar Release 03 completo
- Motivo para diferir: requiere un tag pre-release real o un mock de servidor de release; no bloquea el cierre del runtime.
- Fix esperado: validar descarga e instalacion (o intento de instalacion controlado) desde una Release real o un servidor de staging.
- Riesgo si se ignora: un bug de integracion real entre el updater y GitHub Releases solo se detectaria en produccion.

### TD-019 - Validacion con `go test -race` del lifecycle del updater

- Severidad: P3
- Area: updater/testing
- Origen: cierre R03.D
- Estado: abierto
- Release objetivo: R03.D/E o auditoria global
- Motivo para diferir: el entorno Windows actual no tiene CGO habilitado (`-race` requiere `CGO_ENABLED=1`).
- Fix esperado: ejecutar `go test -race ./internal/updater/... ./internal/app/...` en un entorno con CGO (Linux/macOS o Windows con toolchain adecuada).
- Riesgo si se ignora: posibles condiciones de carrera no detectadas en la goroutine de startup y el service.

### TD-020 - UX de update fragmentada

- Severidad: P2
- Area: frontend/ux
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.F
- Motivo para diferir: requiere unificar el flujo de `UpdateBanner` y `SettingsPage`; no se toco frontend en esta tarea.
- Fix esperado: decidir un unico camino de update (instalacion verificada in-app) y actualizar `UpdateBanner` para usarlo.
- Riesgo si se ignora: usuarios confundidos por dos caminos para actualizar.

### TD-021 - Sin consumo de portable zip desde el updater

- Severidad: P2
- Area: updater/ux
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.E/F
- Motivo para diferir: requiere decision de UX sobre selector de artifact; no bloquea el flujo de installer verificado.
- Fix esperado: anadir selector de artifact (installer vs portable zip) o descarga directa del portable zip en `SettingsPage`.
- Riesgo si se ignora: usuarios que prefieren portable no pueden actualizar desde la app.

### TD-022 - `UpdateBanner` no muestra release notes

- Severidad: P3
- Area: frontend/ux
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.F
- Motivo para diferir: mejora de UX no bloqueante; se abordara si se unifica la UI de update.
- Fix esperado: mostrar un resumen del cuerpo del release en el banner o en un modal.
- Riesgo si se ignora: menor contexto para el usuario al decidir actualizar.

### TD-023 - `Info.IsDowngrade` duplica logica de UI

- Severidad: P3
- Area: frontend/go
- Origen: review R03.D (fuera de alcance R03.D-updater)
- Estado: abierto
- Release objetivo: R03.F o auditoria global
- Motivo para diferir: duplicacion leve de logica; no impacta funcionalidad.
- Fix esperado: usar unica fuente de verdad para el flag de downgrade (backend o frontend, no ambos).
- Riesgo si se ignora: inconsistencia menor si la logica diverge en el futuro.

### TD-024 - Validacion real de workflows Discord en GitHub Actions

- Severidad: P3
- Area: ci/discord
- Origen: cierre R03.E
- Estado: abierto
- Release objetivo: antes de declarar Release 03 completo
- Motivo para diferir: el entorno local no permite ejecutar workflows reales de GitHub Actions ni enviar webhooks reales a Discord.
- Fix esperado: ejecutar `discord-release.yml`, `discord-build-available.yml` (con `release_tag`), `discord-beta-progress.yml` y `discord-known-issues.yml` en GitHub Actions con webhooks de Discord configurados; verificar que no haya duplicados y que 403/429 se manejen correctamente.
- Riesgo si se ignora: un error en la logica de envio o extraccion de assets solo se detectaria en produccion.

### TD-025 - Dependencia de `gh` CLI en `discord-build-available.yml`

- Severidad: P3
- Area: ci/discord
- Origen: cierre R03.E
- Estado: abierto
- Release objetivo: R03.E o R03.F
- Motivo para diferir: `gh` viene pre-instalado en `ubuntu-latest` y el fallback manual (`download_url` + `sha256`) sigue funcionando si `gh` falla.
- Fix esperado: opcionalmente reemplazar `gh release view` por llamadas directas a la API REST de GitHub con `curl` + `GITHUB_TOKEN` para reducir dependencias.
- Riesgo si se ignora: si `gh` deja de estar disponible o cambia su salida JSON, el modo automatico de `release_tag` fallara.

### TD-026 - Idempotencia de Discord no cubre dispatch repetido desde cero

- Severidad: P3
- Area: ci/discord
- Origen: cierre R03.E
- Estado: abierto
- Release objetivo: post-release / auditoria global
- Motivo para diferir: la idempotencia actual usa `github.run_attempt`, que solo cubre re-runs del mismo workflow run. No evita que un operador dispare el mismo workflow dos veces con los mismos inputs.
- Fix esperado: anadir un mecanismo de deduplicacion basado en contenido (p. ej. buscar el mensaje reciente via Discord bot API o guardar un marker file/hash).
- Riesgo si se ignora: mensajes duplicados si un operador dispara manualmente varias veces seguidas.

### TD-001 - Gate de tests en workflow de release

- Cerrado: 2026-06-27
- Cierre: corregido en R03.C antes del commit.
