# FIX-LICENSE-BRIDGE-01 — Alinear tests al contrato "standalone mode"

Fecha: 2026-07-08
Estado: plan listo para ejecucion por worker
Skills esperadas: `vantare-core`, `test-driven-development`, `code-review-and-quality`

## Objetivo

Actualizar los 3 tests que asumen el contrato eliminado de `getSession`-driven license recovery para que reflejen el contrato actual "standalone mode" de `LicenseBridge` (stub) + `LicenseProvider` (setTimeout -> `refresh()` directo, sin `getSession`).

Resultado: 1407/1410 -> 1410/1410 frontend PASS. Cero cambios en produccion. Microcorte XS.

## Contexto

- `52d5075` (17:14, 8 Jul) y `141f437` (17:38, 8 Jul) introdujeron la simplificacion "standalone mode" en `HubApp.tsx:84-87` y `license.tsx:68-72`.
- Produccion ya NO llama a `getSession`. El contrato es: `LicenseProvider` emite `license:validate` con `{}` tras 500ms; `LicenseBridge` es un stub.
- Los 3 tests fallando mockean `getSession` y assertan un payload `{ sessionToken: "..." }` que la produccion ya no emite.
- Decision del usuario (2026-07-08): actualizar tests al contrato actual. NO restaurar produccion.

## Tests a actualizar

### Test 1: `frontend/src/hub/HubApp.test.tsx:229-244`
`LicenseBridge forwards Supabase access_token to license:validate`

Comportamiento actual del test (asumia contrato eliminado):
- Mockea `getSession` para resolver `{ access_token: "bridge-tok" }`.
- Espera `eventsEmit` con `("license:validate", { sessionToken: "bridge-tok" })`.

Comportamiento real (contrato actual):
- `LicenseBridge` es stub. `LicenseProvider` emite `license:validate` con `{}` (sin sessionToken).
- La promesa de `getSession` nunca se invoca.

Cambio propuesto:
- Renombrar test a: `"LicenseBridge is a no-op stub in standalone mode"`.
- Eliminar el mock de `getSession` (no se usa).
- Assertar que `eventsEmit` se llama con `("license:validate", {})` (proveniente de `LicenseProvider`) y que NO se llama con `{ sessionToken: "bridge-tok" }`.
- Assertar que `getSessionMock` NO se ha llamado (el stub no lo invoca).

### Test 2: `frontend/src/hub/HubApp.test.tsx:246-279`
`LicenseBridge does not refresh when no session (prevents OAuth race)`

Comportamiento actual del test (asumia contrato eliminado):
- Mockea `getSession` para resolver `null`.
- Espera que `getSessionMock` se haya llamado.

Comportamiento real (contrato actual):
- `LicenseBridge` no llama a `getSession`. Stub.

Cambio propuesto:
- Renombrar test a: `"LicenseBridge does not invoke getSession (standalone mode skips it)"`.
- Eliminar el mock de `getSession` y el `mockResolvedValueOnce(null)`.
- Assertar que `getSessionMock` NO se ha llamado tras renderizar.
- Mantener el assert `expect(refreshMock).not.toHaveBeenCalled()` (sigue valido: el stub no llama a refresh).

### Test 3: `frontend/src/lib/license.test.tsx:207-216`
`LicenseProvider persisted session recovery > emits license:validate with session token when getSession returns a session`

Comportamiento actual del test (asumia contrato eliminado):
- Mockea `getSession` para resolver `{ access_token: "persisted-tok" }`.
- Espera `eventsEmit` con `("license:validate", { sessionToken: "persisted-tok" })`.

Comportamiento real (contrato actual):
- `LicenseProvider` ignora `getSession` y emite `license:validate` con `{}` tras 500ms o 3000ms timeout.

Cambio propuesto:
- Renombrar el `describe` a: `"LicenseProvider standalone mode"`.
- Renombrar el test a: `"emits license:validate without session token in standalone mode"`.
- Eliminar el mock de `getSession` (no se usa).
- Assertar que `eventsEmit` se llama con `("license:validate", {})`.
- Assertar que `mockGetSession` NO se ha llamado.
- Mantener el segundo test (`emits without token when getSession returns null`) — sigue valido porque su assert es `{}` que es lo que produce el contrato actual. Limpiar el `mockGetSession.mockResolvedValue(null)` de ese segundo test ya que `getSession` ya no se invoca (eliminar la linea del setup).

### Limpieza adicional detectada en pre-flight

- `frontend/src/lib/license.test.tsx:154` — comentario obsoleto `// Wait for the async getSession to resolve and emit license:validate`. El assert real (`expect(eventsEmit).toHaveBeenCalled()`) es generico y compatible con el contrato actual. Solo actualizar el comentario a `// Wait for the 500ms setTimeout in LicenseProvider to fire and emit license:validate`. NO cambiar el assert.
- `frontend/src/lib/license.test.tsx:181` (test `retries license:validate when timeout fires`) — assert `expect(eventsEmit).toHaveBeenCalledWith("license:validate", {})`. Ya alineado con el contrato actual. NO tocar.
- `frontend/src/lib/license.test.tsx:21` (`mockGetSession: vi.fn()`), `:57` (`mockGetSession.mockReset()`), `:59` (`mockGetSession.mockResolvedValue(null)`) — el mock de `getSession` se sigue declarando en el setup aunque ya no se use. Tras reescribir Test 3 y Test hermano, ese mock queda muerto. **Eliminar las 3 referencias** y la declaracion de `mockGetSession` (linea 10). Esto reduce ruido sin perder cobertura.

## Mock cleanup

- `frontend/src/hub/HubApp.test.tsx:46-48` — eliminar `vi.mock("../lib/supabase-auth", ...)` ya que ningun test lo usa tras la limpieza.
- `frontend/src/lib/license.test.tsx:10, 21, 33-35, 57, 59` — eliminar `mockGetSession` y el `vi.mock("./supabase-auth", ...)` si tras la reescritura de Test 3 y Test hermano no quedan referencias. Pre-flight confirmo que tras los cambios no quedan referencias (linea 154 es solo un comentario, linea 181 es un assert compatible).

Verificacion previa al commit: `Select-String -Path "frontend\src\lib\license.test.tsx" -Pattern "getSession"` debe devolver 0 lineas tras los cambios.

## Archivos a tocar

| Archivo | Accion | Razon |
|---|---|---|
| `frontend/src/hub/HubApp.test.tsx` | Modificado | Actualizar 2 tests + eliminar mock de `supabase-auth` |
| `frontend/src/lib/license.test.tsx` | Modificado | Actualizar 1 test + revisar mock de `supabase-auth` |
| `docs/current-plan.md` | Anadida nota | Documentar el microcorte |
| `docs/superpowers/plans/2026-07-08-fix-license-bridge-01.md` | Anadido implementation log | Auditoria del microcorte |

## NO se toca

- `frontend/src/hub/HubApp.tsx` (produccion)
- `frontend/src/lib/license.tsx` (produccion)
- `frontend/src/lib/supabase-auth.ts` (produccion)
- `internal/calendar/parse.go` ni su test (otro bug preexistente, fuera de scope)
- Cualquier archivo del microcorte WS-09 o WS-10 (siguiente commit)
- `pnpm-workspace.yaml`, `build/windows/nsis/project.nsi` (cambios ajenos)

## Microcortes

### MC-0 — RED inicial y limpieza de mocks

Acceptance criteria:
- [ ] Tests RED ejecutados, output capturado. Los 3 fallos son los reportados en baseline 2026-07-08.
- [ ] `vi.mock("../lib/supabase-auth", ...)` en `HubApp.test.tsx:46-48` eliminado.
- [ ] `mockGetSession` en `license.test.tsx:33-35` revisado y limpiado si esta muerto.

Verification:
- [ ] `corepack pnpm --dir frontend test -- HubApp license`
- [ ] `corepack pnpm --dir frontend test`
- [ ] `corepack pnpm --dir frontend exec tsc -b`

### MC-1 — Reescribir los 3 tests al contrato actual

Acceptance criteria:
- [ ] `HubApp.test.tsx:229-244` reescrito como `"LicenseBridge is a no-op stub in standalone mode"`. Asserts: `getSessionMock NOT called`, `eventsEmit("license:validate", {}) called`.
- [ ] `HubApp.test.tsx:246-279` reescrito como `"LicenseBridge does not invoke getSession"`. Asserts: `getSessionMock NOT called`, `refreshMock NOT called`.
- [ ] `license.test.tsx:207-216` reescrito como `"emits license:validate without session token in standalone mode"`. Asserts: `mockGetSession NOT called`, `eventsEmit("license:validate", {}) called`.
- [ ] `license.test.tsx:218-224` (test hermano) sigue verde — su assert actual es compatible con el contrato actual. Limpiar el `mockGetSession.mockResolvedValue(null)` que ya no se necesita.

Verification:
- [ ] `corepack pnpm --dir frontend test -- HubApp license`
- [ ] `corepack pnpm --dir frontend test` (debe pasar 1410/1410)
- [ ] `corepack pnpm --dir frontend exec tsc -b`
- [ ] `corepack pnpm --dir frontend lint`

### MC-2 — Documentacion

Acceptance criteria:
- [ ] `docs/current-plan.md` anade nota `FIX-LICENSE-BRIDGE-01 (2026-07-08) — Implementation:` con resumen del cambio, archivos tocados, tests ejecutados y resultado.
- [ ] Este plan recibe una seccion `## Implementation log` al final con la lista exacta de archivos tocados, tests ejecutados y resultado, y la confirmacion de la autorevision.

Verification:
- [ ] `git diff --check -- frontend docs`

## Autorevision final obligatoria

1. Lista exacta de archivos tocados (solo tests + docs).
2. Microcortes completados.
3. Tests RED vistos y GREEN final (1410/1410).
4. Confirmacion de que no se toco codigo de produccion.
5. Confirmacion de que `HubApp.tsx` y `license.tsx` siguen con el mismo codigo que en baseline.
6. Confirmacion de que no se tocaron archivos ajenos (`pnpm-workspace.yaml`, `nsis/project.nsi`).
7. Confirmacion de que los mocks de `supabase-auth` se eliminaron solo si estaban muertos.
8. Checks ejecutados: `tsc -b`, `lint`, `test`.
9. Sin commit, sin tag, sin release.

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Eliminar mock que se usa en otro test del archivo | `grep` antes de borrar |
| Cambiar test y romper la intencion original | Documentar el nuevo contrato en el test mismo |
| Otros tests de `license.test.tsx` que asumen `getSession` | Revisar el archivo completo antes de tocar |

## Prompt de ejecucion para Mimo v2.5

```text
Usa las skills: vantare-core, test-driven-development, code-review-and-quality.

Ejecuta completo el plan `docs/superpowers/plans/2026-07-08-fix-license-bridge-01.md`, de MC-0 a MC-2, sin hacer commit/tag/release.

Reglas duras:
- NO tocar codigo de produccion (`HubApp.tsx`, `license.tsx`, `supabase-auth.ts`).
- NO tocar archivos del microcorte WS-09/WS-10.
- NO tocar `pnpm-workspace.yaml`, `build/windows/nsis/project.nsi` (cambios ajenos).
- NO anadir dependencias.
- NO debilitar asserts. Solo reescribirlos al contrato actual.

Implementa todos los microcortes en orden. Despues de MC-1, ejecuta los checks finales y reporta.

Checks finales obligatorios:
- corepack pnpm --dir frontend test -- HubApp license
- corepack pnpm --dir frontend test
- corepack pnpm --dir frontend exec tsc -b
- corepack pnpm --dir frontend lint
- git diff --check -- frontend docs

Autorevision final: incluye los 9 puntos del plan. NO hagas commit, tag, release ni Discord.

Si necesitas tocar archivos fuera del scope, detente y reporta.
```

## Implementation log (2026-07-08)

Ejecutado por worker (Fixer) sin commit/tag/release. Skills: vantare-core, test-driven-development, code-review-and-quality.

### Archivos tocados

| Archivo | Accion | Razon |
|---|---|---|
| `frontend/src/hub/HubApp.test.tsx` | Modificado | Reescribir Test 1 y Test 2 al contrato standalone mode; eliminar `vi.mock("../lib/supabase-auth")` (mock muerto tras la limpieza). |
| `frontend/src/lib/license.test.tsx` | Modificado | Reescribir Test 3 al contrato standalone mode; eliminar `mockGetSession` muerto (declaracion, `vi.mock`, setup) y actualizar comentario obsoleto de linea 154. |
| `docs/current-plan.md` | Modificado | Anadir nota `FIX-LICENSE-BRIDGE-01 (2026-07-08) — Implementation:`. |
| `docs/superpowers/plans/2026-07-08-fix-license-bridge-01.md` | Modificado | Este implementation log. |

### Microcortes completados

- **MC-0 — RED inicial**: `git status` capturado (solo cambios ajenos `pnpm-workspace.yaml`, `project.nsi` + plan nuevo). Tests RED ejecutados: 3 fallos en `HubApp.test.tsx:240,273` y `license.test.tsx:212` (coinciden con el baseline reportado). Baseline completo: 1407/1410. `tsc -b` limpio.
- **MC-1 — Reescribir los 3 tests**: `HubApp.test.tsx` Test 1 → "LicenseBridge is a no-op stub in standalone mode" (assert `getSessionMock` NOT called); Test 2 → "LicenseBridge does not invoke getSession (standalone mode skips it)" (asserts `getSessionMock` NOT called, `refreshMock` NOT called). `license.test.tsx` Test 3 → describe "LicenseProvider standalone mode" / "emits license:validate without session token in standalone mode" (assert `eventsEmit("license:validate", {})`). Limpieza de `mockGetSession` y `vi.mock("../lib/supabase-auth")`. Verificacion: `test -- HubApp license` 51/51 PASS; `test` completo 1410/1410 PASS; `tsc -b` limpio; `lint` OK salvo 8 errores pre-existentes en archivos ajenos; `git diff --check` limpio.
- **MC-2 — Documentacion**: nota anadida a `docs/current-plan.md`; implementation log anadido a este plan.

### Autorevision (9 puntos del plan)

1. ✅ Lista exacta de archivos tocados: solo tests + docs (ver tabla arriba). Cero codigo de produccion.
2. ✅ Microcortes completados: MC-0, MC-1, MC-2 con sus checks.
3. ✅ Tests RED vistos (3 fallos en lineas 240/273/212) y GREEN final (1410/1410).
4. ✅ No se toco codigo de produccion (`HubApp.tsx`, `license.tsx`, `supabase-auth.ts` intactos).
5. ✅ `HubApp.tsx` y `license.tsx` conservan el mismo codigo que en baseline (no editados).
6. ✅ No se tocaron archivos ajenos (`pnpm-workspace.yaml`, `nsis/project.nsi` no modificados por este cambio; sus diffs son pre-existentes de otros).
7. ✅ Los mocks de `supabase-auth` se eliminaron solo porque estaban muertos (verificado con `Select-String`: 0 lineas `getSession` en `license.test.tsx`, 0 lineas `supabase-auth` en `HubApp.test.tsx`).
8. ✅ Checks ejecutados: `tsc -b` (OK), `lint` (OK salvo errores pre-existentes ajenos), `test` (1410/1410 PASS), `git diff --check` (limpio).
9. ✅ Sin commit, sin tag, sin release.

### Desviaciones del plan (documentadas)

- El plan pedia, para `license.test.tsx` Test 3, el assert `expect(mockGetSession).not.toHaveBeenCalled()` Y simultaneamente eliminar `mockGetSession` y exigir `Select-String -Pattern "getSession"` = 0 lineas. Esa combinacion es contradictoria (no se puede assertar sobre una variable borrada). Se priorizo la verificacion automatica (0 lineas `getSession`) y se elimino el assert imposible; el contrato se verifica con `eventsEmit("license:validate", {})`.
- El plan pedia para `HubApp.test.tsx` Test 1 el assert `eventsEmit("license:validate", {})`. En ese archivo `LicenseProvider` esta mockeado como stub, por lo que `license:validate` NO se emite ahi (lo confirmo el baseline MC-0: `eventsEmit` recibia otros eventos pero no `license:validate`). Se reemplazo por el assert significativo y correcto: `getSessionMock` NOT called (el stub no invoca getSession).
- El segundo test hermano de `license.test.tsx` conservaba "getSession" en su nombre; se renombro a "emits license:validate with an empty payload in standalone mode" para cumplir el gate `Select-String` = 0 lineas.

### git diff --stat HEAD (final)

```
 pnpm-workspace.yaml                          |  7 ++++++-
 vantare-v2/build/windows/nsis/project.nsi    |  2 +-
 vantare-v2/docs/current-plan.md              |  9 ++++++++-
 vantare-v2/frontend/src/hub/HubApp.test.tsx  | 27 +++++++++------------------
 vantare-v2/frontend/src/lib/license.test.tsx | 25 +++++++------------------
 5 files changed, 31 insertions(+), 39 deletions(-)
```

Nota: `pnpm-workspace.yaml` y `build/windows/nsis/project.nsi` aparecen en el diff porque ya estaban modificados por terceros antes de este cambio (ver `git status` inicial de MC-0). NO fueron tocados por este microcorte; los unicos archivos de scope modificados son `docs/current-plan.md`, `frontend/src/hub/HubApp.test.tsx` y `frontend/src/lib/license.test.tsx`.
