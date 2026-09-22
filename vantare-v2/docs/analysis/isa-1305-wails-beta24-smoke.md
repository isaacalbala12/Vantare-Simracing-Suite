# VAN-740 / ISA-1305 — actualización Wails beta.24

Fecha: 2026-09-22. Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1305

## Candidato

- Base: `1101f73579ddaa8798b7d9948bae8b4e2a77d850` (`origin/nightly`).
- Rama: `vantareapp/isa-1305-wails-beta24-smoke`.
- Worktree: `C:/tmp/vantare-isa1305`; modulo: `vantare-v2`.
- Actualización: Wails Go `alpha.98-tui` y runtime frontend `alpha.79` pasan ambos a `beta.24`.
- Tras `go get`, `go mod tidy` normaliza el grafo real de la app: elimina requisitos y sumas obsoletos del tooling anterior y conserva Wails beta.24. No se añaden librerías de producto elegidas manualmente.
- Sin cambios de código productivo. Tras la aceptación manual, se alinean los tres pins CLI de CI/release y se actualiza el hito `milestones:wails-v3-beta24`.
- Seguimiento principal: [VAN-740](https://app.notion.com/p/3e3e51695c6581f7a1aae9d4db50ee38).

## Resultado reproducido

| Check | Resultado |
|---|---|
| `pnpm --dir frontend build` | PASS; incluye `tsc -b` y bundle de produccion |
| `pnpm --dir frontend run test --maxWorkers=4` | PASS: 466 archivos, 3772 tests correctos, 2 omitidos; 164.48 s |
| `pnpm --dir frontend lint` | PASS |
| `CGO_ENABLED=0 go test ./... -timeout 90s` | PASS: 126 paquetes con tests |
| `CGO_ENABLED=0 go build -tags production -trimpath -buildvcs=false -o C:/tmp/vantare-isa1305/vantare-beta24.exe ./cmd/vantare` | PASS |
| `go version -m` sobre ese exe | Confirma Wails beta.24, production y CGO=0 |
| `git diff --check` | PASS |

La suite frontend imprime un `DOMException [AbortError]` durante el teardown de happy-dom, pero termina con codigo 0 y todos los tests anteriores correctos. No se atribuye ese mensaje a Wails ni se declara corregido. Muchos tests simulan el runtime: no son prueba fisica del bridge.

## Arranque nativo acotado

Se arranco exclusivamente el exe anterior con `-live=false -http 127.0.0.1:39305`, APPDATA y LOCALAPPDATA temporales bajo el worktree y directorio de trabajo `smoke-data`. No se copiaron credenciales, perfiles ni datos del usuario.

Evidencia: proceso vivo y responsive; WebView2 informa creacion correcta; proceso WebView2 hijo presente; `/overlay?profile=example-racing.json` devuelve HTTP 200; el frontend llama `license:validate` y el backend responde estado anonimo por ausencia de token. Telemetry Analysis declara configuracion ausente. No se obtuvo captura ni se inspecciono visualmente la UI.

Se solicito cierre normal mediante WM_CLOSE a las ventanas Vantare pertenecientes exclusivamente al PID de prueba. Se verifico despues la salida del exe y de sus hijos WebView2 y PresentMon. No se detuvieron aplicaciones ajenas.

Los logs de build/tests/arranque y el exe permanecen localmente en `C:/tmp/vantare-isa1305/`. Los tests regeneraron cinco capturas PNG versionadas; se restauraron solo esas salidas de esta prueba a HEAD.

## Build canónica configurada y aceptación

Se siguió la receta vigente de `docs/vantare-program/handoffs/overlays-launcher-hub.md`, sección «Smoke real de la aplicación que se ha verificado»: frontend configurado, generación temporal de `cmd/vantare/supabase_build.go`, backend production con versión `v0.1.0.7`, `CGO_ENABLED=0`, `-trimpath -buildvcs=false` y `-H windowsgui`; salida `bin/vantare.exe` y apertura desde `bin`.

Se reutilizaron las variables públicas existentes en el entorno (`VANTARE_SUPABASE_URL` y `VANTARE_SUPABASE_ANON_KEY`, con sus pares VITE). No se leyó ni copió `.env.local`, no se imprimieron valores y se eliminó el archivo Go temporal al finalizar. Frontend y backend: PASS.

- Binario: `C:/tmp/vantare-isa1305/vantare-v2/bin/vantare.exe`.
- SHA256: `23ADC67BE974DEDF7F5510A00C6565ED9764630B6BA612F071FE43E2A963A784`.
- `go version -m`: Wails beta.24, production y CGO=0 verificados.
- Apertura visible desde `bin`, PID 21924, proceso responsive y ruta exacta comprobados.
- Isaac confirmó el 2026-09-22: «va todo bien, puedes mergear». Aceptación manual y autorización de integración en Nightly.

## Límites y entrega

La aceptación corresponde a la build configurada anterior. No se inventa una matriz de flujos manuales: no hay mediciones de FPS, matriz completa LMU/OBS, instalador, CGO/race ni evidencia macOS. El spike macOS/Streams VAN-734 queda separado. El AbortError de teardown frontend sigue documentado; la suite terminó con código 0.

La entrega alinea también la CLI con beta.24 en los tres workflows operativos. CI del PR debe verificar el candidato final antes del squash autorizado a Nightly. Consultar VAN-740 y el PR enlazado desde GitHub #1305 para el SHA y estado remoto final; este informe recoge la evidencia previa a la integración. Sin promoción a testers/master ni release.

## Revisión y corrección de CI

Revisión independiente del candidato `3afeb0c0`: ACCEPT sin errores bloqueantes; pins/lockfile y comandos de Taskfile compatibles. El run de calidad `35737973003` detectó un único hallazgo nuevo: `go-mod-tidy`. Se reprodujo aplicando `go mod tidy`; una segunda ejecución con `-diff` terminó sin cambios. El grafo normalizado elimina dependencias antiguas del tooling y reconoce websocket como dependencia directa ya importada. El resto de analizadores tuvo cero hallazgos nuevos. Se mantiene la petición de revisión por los cinco archivos de política modificados; no se cambian controles ni baselines.
