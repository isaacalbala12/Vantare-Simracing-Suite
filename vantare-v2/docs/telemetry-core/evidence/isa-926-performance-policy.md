# ISA-926 — Política de rendimiento

## Contrato publicado

Cada `OverlayFrameV2` publica `capabilities.performance` con el nivel efectivo,
modo, efectos, `rafCap`, `widgetHz`, `sourceHz` y, cuando procede, el motivo de
resolución. El tipo TypeScript se genera desde Go. La sección pertenece al tier
slow y se marca dirty cuando cambia la política.

Los valores numéricos de `widgetHz` son techos de repintado. `dirty` repinta al
cambiar la sección y tiene un techo de frescura de un segundo; `event` solo
repinta al cambiar su fuente. Los monitores del nivel 1 no llevan entrada y
`rafCap: null` conserva el comportamiento visual previo.

## Resolución y aplicación

El ajuste de aplicación por defecto es `{mode: "level", level: 3}`. Una
preferencia de perfil puede reemplazarlo cuando exista ese contrato; ISA-926 no
cambia todavía el perfil v3. `custom` conserva overrides válidos y `auto` se
acepta, pero resuelve en nivel 3 con `reason: "auto no disponible"`.

El runtime resuelve la política al arrancar y después de guardar ajustes. Antes
de cada proyección entrega a `SectionScheduler` la cadencia del nivel vigente;
un cambio caliente queda pendiente y se aplica al comienzo del siguiente tick.

## Gates locales

- `go build ./...`: PASS, sin salida.
- `go test ./internal/app/... ./internal/telemetry/... ./cmd/...`: PASS.
- `corepack pnpm --dir frontend test`: PASS, 421 ficheros y 3195 tests.
- `corepack pnpm --dir frontend typecheck`: PASS.
- `corepack pnpm --dir frontend build`: PASS, 1091 módulos.
- `wails3 task build`: PASS; generó `bin/vantare.exe` y limpió temporales.
- `git diff --check`: PASS.
- `corepack pnpm --dir frontend lint`: FAIL por deuda fuera del diff:
  `car-damage-numbers-view-model-v2.ts:93:39`, `_damage` no usado.

No se ejecutó LMU ni se obtuvo evidencia física de WebView2. Esta entrega se
verifica con contratos, goldens, tests y builds locales.
