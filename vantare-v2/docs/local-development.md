# Desarrollo local sin sesión comercial

Decisión de Isaac, 2026-09-22. [ISA-1318](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1318), continuación del QA de Strategy ISA-1314.

## Qué perfil usar

Para desarrollar y revisar la app localmente, usar el perfil de compilación `vantare_localdev`. Abre el Hub sin sesión remota ni licencia comercial y conecta los servicios productivos de telemetría y Strategy. La identidad local es temporal y está identificada como desarrollo; no representa una compra ni una cuenta Supabase. Los datos de carrera siguen siendo reales: este perfil no inventa telemetría, catálogos ni cálculos.

Para comprobar login, licencia, dispositivo, credenciales offline o comportamiento comercial, usar una build normal. La validación funcional local no acredita esas pruebas de distribución.

## Aislamiento

| Compilación | Acceso local |
|---|---|
| Sin tag especial | Inactivo; autenticación normal |
| `vantare_localdev` sin `production` | Activo, en memoria |
| `production` | Inactivo; autenticación normal |
| `production,vantare_localdev` | Inactivo; production prevalece |

La selección es de compilación. No existe un parámetro URL, una entrada en localStorage o una variable de entorno que active este acceso en un binario de distribución. No se cambia Polar, Supabase, una asignación operativa ni una licencia firmada. No se concede un rol Owner ni autoridad de publicación.

El resultado temporal reutiliza las capacidades locales de producto ya existentes (Bundle/Pro), sin asignar roles ni derechos de canales. No acredita una compra. El perfil WebView predeterminado es `webview_localdev`, separado del perfil habitual; un override explícito de diagnóstico debe apuntar también a una carpeta aislada. Las funciones remotas que necesitan una cuenta real no quedan autenticadas por este modo, incluido publicar o importar horarios remotos.

En el perfil local no se restauran, rotan ni eliminan sesiones reales y no se carga o persiste la caché de licencia comercial. Los resultados de acceso viven en el proceso. Al cerrar el ejecutable no queda una licencia local que pueda consumir una build normal.

## Construcción y ejecución

Instalar las dependencias ya fijadas del repo con `pnpm install --frozen-lockfile` desde la raíz Git. Desde `vantare-v2`, ejecutar `powershell -File scripts/build-local-development.ps1`. Compila el frontend real y genera `bin/vantare-localdev.exe`. Ejecutarlo desde ese directorio de trabajo para usar los configs del worktree. La ventana se identifica como «Vantare — Desarrollo local». El helper no lanza ni cierra procesos y no utiliza mocks.

El lector de DuckDB necesita además su runtime verificado junto al ejecutable. Se usa el preparador canónico `build/windows/telemetry-reader/prepare-runtime.ps1` y su verificador; el modo local no sustituye ese lector ni omite la validación de los archivos.

No copiar `.env` ni credenciales entre worktrees. No utilizar un helper que cierre indiscriminadamente procesos ajenos para lanzar esta build. LMU se conserva tal como lo dejó el usuario.

## Validación

Comprobar las combinaciones de tags, acceso frontend y nativo concordante, respuestas de licencia repetidas y ausencia de llamadas a cuenta/caché comercial. Ejecutar la suite Go y los checks correspondientes a los archivos tocados. La prueba final de Strategy debe abrir el Hub sin login, descubrir y abrir un DuckDB real, conservar el original y usar los servicios existentes.

## Estado de entrega

Ver el handoff de [plataforma](vantare-program/handoffs/platform-commercial.md) y el de [Strategy](vantare-program/handoffs/strategy-planner.md). Una compilación local y un recorrido QA no significan promoción, distribución ni release.
