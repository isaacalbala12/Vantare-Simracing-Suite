# ISA-1318 — Desarrollo local sin sesión comercial

Fecha: 2026-09-22. [Issue](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1318). Rama `vantareapp/isa-1318-local-development`, base `e304ab26f4d0c0e2462bbfdfb2957639d141462b` de ISA-1314. Implementación GPT-6 Sol medium; revisión, documentación y prueba nativa por el orquestador.

## Resultado

La build `vantare_localdev && !production` entra al Hub sin login ni licencia comercial. Su resultado de acceso existe sólo en memoria y reutiliza Bundle/Pro, sin roles, credenciales firmadas ni validación online. `production` prevalece al combinar tags. No se modifican las políticas comerciales, el solver o el lector.

Se evita restaurar, rotar o borrar sesiones comerciales y no se carga la caché de licencia. El servidor local no registra callbacks/token de autenticación. WebView usa por defecto `webview_localdev`; la ventana identifica el desarrollo local. El helper no lee `.env` ni cierra procesos. [Receta y límites](../local-development.md).

## Checks

| Check | Resultado |
|---|---|
| `go test ./...` | PASS, exit 0 |
| Tests cmd/vantare con tag `vantare_localdev` y servidor | PASS; autoridad local, servicios nativos y callback HTTP deshabilitado |
| Tests cmd/vantare sin tag | PASS; acceso local inactivo |
| Tests cmd/vantare con `production,vantare_localdev` | PASS; acceso local inactivo |
| `pnpm --dir frontend test` | PASS, exit 0; 489 archivos, 4262 pruebas aprobadas y 2 omitidas |
| Typecheck / lint / auditoría i18n | PASS; 0 claves ausentes y 0 huérfanas |
| Helper frontend local y ejecutable Windows | PASS |
| Build frontend normal (`pnpm --dir frontend build`) | PASS, exit 0 |
| Roadmap: digest y contrato | 44 tests PASS; regeneración canónica y `--check` sin cambios |
| Runtime lector | PASS: 5 miembros, DuckDB v1.5.5, manifest SHA-256 `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869` |

Vitest imprime un Happy DOM AbortError durante teardown y finaliza con exit 0; se conserva la traza, no se oculta. Logs de cada check en `C:/tmp/isa1318-*.log`. La suite comercial remota, CI y canales no se han probado en esta entrega local.

## Evidencia nativa

Ejecutable `C:/tmp/vantare-isa1318/vantare-v2/bin/vantare-localdev.exe`, PID inicial 18532, mismo directorio de trabajo. Se cerró exclusivamente la build anterior propia de ISA-1314 (PID 21588, ruta verificada). LMU siguió abierto.

Computer Use observó la ventana «Vantare — Desarrollo local», completó la bienvenida local y abrió Strategy. Sin login ni tokens, se descubrieron sesiones del equipo; COTA pasó a disponible tras su comprobación de estabilidad. Al abrirla, los servicios reales identificaron Circuit of the Americas y Isotta TIPO6 2024 #11:LM y entraron en la mesa de preparación con la fuente aplicada.

Original `Circuit of the Americas_P_2026-09-09T18_43_03Z.duckdb`: SHA-256 antes/después `B6F8AFFFDF59066B13210499DA9B23524C8F72944B40F5193EFA96ACFAD60F34`. No se modifica ni se copia el original para esta prueba. Capturas locales: `C:/tmp/isa1318-native-menu.png`, `C:/tmp/isa1318-native-duckdb.png`, `C:/tmp/isa1318-native-duckdb-wide.png`. Se mantiene abierta la app para revisión del usuario.

Esta pasada demuestra acceso local y apertura real, no cálculo completo ni T22. En el QA de ISA-1314 quedan por revisar controles de combinación recortados en la columna izquierda y ventanas de consola transitorias del arranque/lector. El usuario interactuó con la app; se refrescó el estado y no se continuó con entradas automatizadas durante su revisión.

## Archivos y entrega

Cambios de código: `cmd/vantare/main.go`, cuatro archivos `cmd/vantare/local_development*.go`, `internal/server/server.go`, su test, `frontend/vite.config.ts`, `scripts/build-local-development.ps1`. Documentación: guía, operaciones, este informe, ambos handoffs y hito `local-development-profile` con roadmap generado.

Los datos creados por el runtime bajo `data/` son locales y quedan fuera del commit. Sin dependencias nuevas, push, PR, CI remota, merge, promoción ni release. La rama conserva la base de Strategy pendiente de integración y no se presenta como una entrega de nightly.
