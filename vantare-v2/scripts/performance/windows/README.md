# Validación Windows Astra — entrada única

Estado de esta entrega: **WINDOWS-RUNTIME-BLOCKED / NO EJECUTADO**. PowerShell no está instalado en el Mac auditor. Los scripts reutilizan `scripts/bench/huella.ps1`; no duplican el colector nativo ni certifican sondas inexistentes.

En PowerShell 7, desde `vantare-v2`, sobre checkout limpio y una build Windows configurada/licenciada con procedencia CI conocida:

```powershell
./scripts/performance/windows/Invoke-VantarePerformanceValidation.ps1 -Exe C:/build/vantare.exe -ExpectedGitSha <SHA-completo-del-checkout> -ExpectedBuildSha256 <SHA256-del-artefacto-CI> -Scenarios hub-visible,overlay-idle
```

Una entrada, cinco repeticiones de 60 s por escenario y warm-up separado de 10 s. `-Scenarios overlay-race-44,game-control,hub-minimized` selecciona la comparación de carrera; LMU ya debe estar en la misma escena/sesión de 44 coches. El script no lanza ni manipula el juego. Valores y límites son configurables. Cada medida arranca un proceso nuevo: el warm-up calienta cachés del SO, no convierte el siguiente arranque en warm-start de proceso.

Requisitos heredados: Go para inspección del binario, Node/pnpm y dependencias del lockfile; frontend/dist correspondiente; licencia configurada por el flujo normal; WebView2 y permisos locales del banco. PresentMon es opcional para RAM/CPU: sin captura válida, frametime/GPU no se inventan. No se ejecuta un build improvisado que cambie credenciales/configuración. Si falta vcs.revision embebido, se registra procedencia por hash suministrado, no se afirma haber atestado el SHA del código del binario.

Salida nueva bajo temp por defecto: `sanitized/` con hardware/versiones, CSV de procesos/PID/roles, memoria JS/long tasks, CSV de repeticiones y log permitido. `private-do-not-upload/` contiene los originales del banco y NO debe compartirse: pueden contener datos de cuenta, rutas o logs del producto. El wrapper nunca los imprime ni sube; exporta solo columnas permitidas. Los resultados conservan `publishable`, `gpuSampleValid`, `frametimePublishable` y roles `renderer-unassigned`.

Restauración delegada al `finally` del banco canónico: cierre de sus procesos, CDP y ETW, restauración del puerto de depuración. Se usan fixtures/config aislados. No se pasa `-Forzar` ni se cierran apps ajenas. Si la máquina contiene procesos que impiden higiene, la ejecución falla con sus registros privados conservados.

Límites deliberados: rAF/s no es FPS del juego. El tiempo total del escenario no es startup. `Collect-StartupMetrics.ps1` enumera once marcadores ausentes como UNKNOWN y conserva observaciones CDP; hace falta instrumentar esos marcadores en una build aprobada antes de aceptar un claim TTI. OBS físico, 10/50 ciclos de ventanas dentro del mismo proceso, soak de 30 minutos y latencia IPC alineada por secuencia figuran en el backlog y no se fingen ejecutados por este wrapper. Un CAPTURED no certifica esos gates ni un resultado publicable. No hay uploads ni automaciones.
