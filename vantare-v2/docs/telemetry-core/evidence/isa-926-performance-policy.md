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
`rafCap`, por lo que banderas y avisos se sirven en el siguiente rAF. Los
monitores del nivel 1 no llevan entrada y `rafCap: null` conserva el
comportamiento visual previo.

Un frame anterior al rollout, sin `capabilities.performance`, se acepta y se
normaliza a nivel 1, sin `rafCap` ni techos, con `reason: "unavailable"`. Si el
campo está presente, el decoder valida estrictamente su forma. `reason` es el
enum cerrado `cpu | frametime | user | vr | unavailable`. `sourceHz` se mide en
el runtime sobre una ventana móvil de dos segundos de frames aceptados del
driver; no procede de Ajustes.

## Resolución y aplicación

El ajuste de aplicación por defecto es `{mode: "level", level: 1}` hasta que
ISA-924 supere el gate 12.2. Una
preferencia de perfil puede reemplazarlo cuando exista ese contrato; ISA-926 no
cambia todavía el perfil v3. `custom` conserva overrides válidos y `auto` se
acepta, pero resuelve en nivel 3 con `reason: "unavailable"`.

El runtime resuelve la política al arrancar y después de guardar ajustes. Antes
de cada proyección entrega a `SectionScheduler` la cadencia del nivel vigente;
un cambio caliente queda pendiente y se aplica al comienzo del siguiente tick.
`session` y `spotter` conservan sus intervalos base en todos los niveles; un
cambio de bandera o aviso marca dirty de seguridad y fuerza su reconstrucción
en el tick inmediatamente siguiente.

## Gates locales

- `go build ./...`: PASS, sin salida.
- `go test ./internal/app/... ./internal/telemetry/... ./cmd/...`: PASS.
- `corepack pnpm --dir frontend test`: PASS, 421 ficheros y 3198 tests.
- `corepack pnpm --dir frontend typecheck`: PASS.
- `corepack pnpm --dir frontend lint`: PASS.
- `corepack pnpm --dir frontend build`: PASS, 1091 módulos.
- `wails3 task build`: PASS; generó `bin/vantare.exe` y limpió temporales.
- `go run ./tools/telemetry-contract-gen -check`: PASS, sin salida.
- `git diff --check`: PASS.
- `git merge-base --is-ancestor origin/nightly HEAD`: PASS, código 0.

No se ejecutó LMU ni se obtuvo evidencia física de WebView2. Esta entrega se
verifica con contratos, goldens, tests y builds locales.
