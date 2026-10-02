# Pruebas y verificaciones

Ejecutar checks adecuados al cambio y reportar sus resultados reales. Un comando documentado no es un check ejecutado; los resultados antiguos no son el estado de la build actual.

## Comandos disponibles

Desde `vantare-v2`, tras la [preparación](operations.md):

```powershell
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
go test ./...
git diff --check
```

El build frontend precede a los checks Go que necesitan los assets embebidos. `typecheck` recorre los proyectos TypeScript con `tsc -b --noEmit`; no usar el `tsconfig.json` raíz como si contuviera fuentes.

## Selección por cambio

| Cambio | Verificación |
|---|---|
| Documentación | Contraste con código, rutas/enlaces y `git diff --check`; no requiere inventar tests de producto |
| Go o contratos compartidos | Tests del paquete y `go test ./...`; informar skips de fixtures y límites de plataforma |
| Frontend | Tests afectados, typecheck, build y lint aplicable |
| Studio/Widgets visuales | Protocolo de la tarea, capturas e interacción; revisar scripts actuales antes de invocar un harness |
| Runtime Windows/LMU/OBS | Evidencia en esa plataforma, con build y perfil identificados; mocks no la sustituyen |

Los scripts disponibles están en [package.json](../frontend/package.json). Por ejemplo:

```powershell
pnpm --dir frontend test -- src/hub/overlay-studio
pnpm --dir frontend test -- src/telemetry-transport
pnpm --dir frontend visual:orbit-studio
pnpm --dir frontend design-system:check
```

Workshop tiene [su protocolo](overlays-studio/overlay-workshop-authoring-guide.md). `visual:overlay-studio` ya no es un script del manifiesto de este corte; no copiarlo de planes de julio. Cada protocolo visual puede requerir su servidor/configuración y no equivale por sí solo a probar Wails real.

## Resultados y gates

Registrar comando, resultado, SHA, plataforma y cualquier omisión. No ocultar fallos ni rebajar tests; una deuda antigua debe seguir demostrándose antes de atribuirle un fallo nuevo. Los gates efectivos están en [branch-channel-gates.yml](../../.github/workflows/branch-channel-gates.yml), [release.yml](../../.github/workflows/release.yml) y los [contratos de canales](branch-channels.md).

La [verificación manual](manual-verification.md) complementa los checks. Ningún check autoriza una promoción de canal.
