# ISA-926 — Política de rendimiento

## Contrato publicado

Cada `OverlayFrameV2` publica `capabilities.performance` con el nivel efectivo,
modo, efectos, `rafCap`, `widgetHz`, `sourceHz` y, cuando procede, el motivo de
resolución. El tipo TypeScript se genera desde Go. La sección pertenece al tier
slow y se marca dirty cuando cambia la política.

Los valores numéricos de `widgetHz` son techos de repintado. `dirty` repinta al
cambiar la sección y fuerza como máximo una entrega al alcanzar el techo de un
segundo para una misma secuencia/firma; queda satisfecho hasta que exista un
cambio nuevo. `event` solo repinta al cambiar su fuente y queda exento de
`rafCap`. D8 está demostrado para spotter por su ruta canónica real. Banderas
no tiene todavía señal canónica en OverlayFrame v2; se verificará en #893. Los
monitores del nivel 1 no llevan entrada y `rafCap: null` conserva el
comportamiento visual previo.

Un frame anterior al rollout, sin `capabilities.performance`, se acepta y se
normaliza a nivel 1, sin `rafCap` ni techos, con `reason: "unavailable"`. Si el
campo está presente, el decoder valida estrictamente su forma. `reason` es el
enum cerrado `cpu | frametime | user | vr | unavailable`. `sourceHz` se mide en
el runtime sobre una ventana móvil de dos segundos de frames aceptados del
driver; no procede de Ajustes.

Hasta que Isaac entregue las variantes de Endurance, los niveles 3–5 publican
`effects: "full"`. El runtime registra el diagnóstico `variante no disponible`
cuando se activa explícitamente uno de esos niveles.

## Resolución y aplicación

El ajuste de aplicación por defecto es `{mode: "level", level: 1}` hasta que
ISA-924 supere el gate 12.2. Una
preferencia de perfil puede reemplazarlo cuando exista ese contrato; ISA-926 no
cambia todavía el perfil v3. `custom` conserva overrides válidos y `auto` se
acepta, pero resuelve en nivel 3 con `reason: "unavailable"`.

El runtime resuelve la política al arrancar y después de guardar ajustes. Antes
de cada proyección entrega a `SectionScheduler` la cadencia del nivel vigente;
un cambio caliente queda pendiente y se aplica al comienzo del siguiente tick.
`session` y `spotter` conservan sus intervalos base en todos los niveles. Un
aviso real de spotter marca dirty de seguridad y fuerza su reconstrucción en el
tick inmediatamente siguiente. El mecanismo equivalente para `session` queda
preparado, pero no puede activarse hasta que exista la señal canónica de bandera.

## Gobierno real de renders

Cada setup de los efectos Desktop y OBS crea una generación completa, siguiendo
el lifecycle de #896. Una única suscripción imperativa une el store V2 de esa
generación con su coordinador; el frame crudo ya no se propaga por props ni
provoca un render de la superficie por tick. Cada `RuntimeWidgetFrame` está
memoizado con props estables y obtiene `snapshot`, frame V2 y estado de fuente
desde su suscripción al coordinador. Presentaciones/subtítulos del ingeniero y
diagnósticos conservan sus stores propios.

La integración `store → RuntimeOverlaySurface → renderer` inyecta 60 frames en
un segundo y cuenta ejecuciones reales del pipeline de Standings:

- nivel 5 (`standings: 2`): 2 renders;
- nivel 1 (paridad): 60 renders;
- cambio de perfil/layout: 1 render inmediato, sin esperar un tick.

## Smoke Wails real

Se compiló `bin/vantare-isa926-smoke.exe` y se lanzó con user-data propio y
`VANTARE_WEBVIEW_DEBUG_PORT=9242`. La primera ventana pintó cuatro
`runtime-widget-frame`. `overlay:stop` retiró su target CDP y
`overlay:start-active` creó el target nuevo
`818D15F5429479E519E3D4B52E6D33C1`, que volvió a pintar cuatro widgets.
`__vantareOverlayV2Diagnostics` estuvo presente y no contenía `disposed`.
Finalmente se cerró solo el PID 40756 de esa build y el puerto 9242 dejó de
escuchar. LMU no se abrió ni se tocó.

## Gates locales

- `go build ./...`: PASS, sin salida.
- `go test ./internal/app/... ./internal/telemetry/... ./cmd/...`: PASS.
- `corepack pnpm --dir frontend test`: PASS, 422 ficheros y 3206 tests.
- `corepack pnpm --dir frontend typecheck`: PASS.
- `corepack pnpm --dir frontend lint`: PASS.
- `corepack pnpm --dir frontend build`: PASS, 1092 módulos.
- `wails3 task build`: PASS; generó `bin/vantare.exe` y limpió temporales.
- `go run ./tools/telemetry-contract-gen -check`: PASS, sin salida.
- `python ../.github/scripts/roadmap_digest.py --repo .. --ref origin/nightly --check`:
  PASS, `sin cambios`.
- `git diff --check`: PASS.
- `git merge-base --is-ancestor origin/nightly HEAD`: PASS, código 0.

No se ejecutó LMU. La prueba WebView2 es un smoke corto de lifecycle y pintado,
no una medición física del banco #924.
