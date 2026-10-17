# Recursos de arranque del paquete (#1694 / VANTA-105)

Auditoría del 17-oct-2026 desde nightly7396f65d0. Se buscaron `fixtures/`,
`include_str!`, `include_bytes!`, `CARGO_MANIFEST_DIR`, `current_exe`, `current_dir`,
`files::read`, `File::open` y lecturas `std::fs` en hub/ui/launcher/services.
Se revisaron sus llamadores de producción, separando módulos `cfg(test)` y
`parity-capture`. Resultados completos en evidence/rc1/hub-1694/source-reads.txt
del servidor, sin leer configuraciones privadas ni archivos .env.

| Consumidor | Resolución y decisión |
| --- | --- |
| Hub `shell::load` → `workshop::Prepared::load` | Abre siempre `standings-design-system.sequence.json`, incluso desde Home. Faltaba en el ZIP. Se incluye explícitamente. |
| Hub `Workshop::select_widget` | Busca `<kind>-design-system.sequence.json` o `<kind>.snapshot.json` en el catálogo instalado. Se enumeran las 17 secuencias aprobadas y el snapshot de Session Alerts que faltaba; los demás snapshots ya estaban. Sin glob de fixtures. |
| Hub `scene::fixtures_root` | Prefiere `bin/fixtures`. Release deja de buscar el checkout de compilación; Debug mantiene ese recurso de desarrollo. |
| Backend GPUI Windows | Release embebe los shaders compilados (`shaders_bytes.rs` generado por build.rs); solo Debug compila HLSL desde el checkout. No hay HLSL suelto obligatorio para Release. |
| Hub Studio, demos, Orbit y UI | Las escenas de `studio/catalog`, `studio/scenes`, `studio/examples`, `demo`, tokens y recursos de marca/fuentes se embeben con `include_str!`/`include_bytes!` o el proveedor de assets. No necesitan copias runtime de esas fuentes. Las lecturas `ui/app.rs` desde fixtures están bajo `cfg(test)`. |
| `vantare-workshop` independiente | Usa `ui::workshop` y su catálogo del checkout; es herramienta de desarrollo, excluida de beta. No es el Workshop integrado del Hub. |
| `vantare-overlays` | Lee layout del usuario si existe y descubre `vantare-core.exe` junto al EXE. El layout ausente usa valores iniciales; no carga las escenas del checkout para el modo normal de IPC. |
| Launcher | Datos locales y migración opcional de `configs` junto al EXE, CWD o APPDATA. La ausencia es soportada; no son recursos obligatorios de producto ni se copian configuraciones del servidor. |
| Services | Configuración pública embebida en build y archivos del perfil (cuenta/licencia/diagnósticos/caché); referencias de calendario/roadmap de fallback embebidas. No hay fixture suelta obligatoria de arranque. Hub descubre su EXE hermano, incluido en el inventario cerrado. |
| Hub restantes | Apariencia, selección guardada, layout, launcher, calendario y documentos del usuario se leen bajo data/APPDATA, con sus políticas de ausencia/fallback. No son assets para distribuir ni se añaden datos del usuario al paquete. |

Workshop muestra demostraciones locales, pero hoy es una entidad permanente
de la shell. Hacerlo opcional o diferir su construcción afecta navegación,
estado y renderizado. Para este bloqueo se conserva ese comportamiento y se
distribuyen sus recursos públicos, pequeños y versionados. No se inventa una
escena ni se presenta una demo como telemetría real. Un paquete sin sus recursos
obligatorios debe fallar en su validación, sin ocultarse con el checkout.

`build-inventory-tests.ps1` comprueba recursos obligatorios, fuente existente,
unicidad e inventario sin glob en CI. `hub-startup-tests.ps1` comprueba el
Release real instalado desde un CWD vacío, bajo un SID estándar esperado y
un escritorio privado no seleccionado. Ejecuta dos casos negativos (sin escena
inicial y sin directorio de fixtures) y el paquete completo. Los negativos
deben salir sin readiness; el positivo debe crear `hub-ready` con su PID real,
tener ventana y cerrar con exit0 mediante el protocolo existente de stdin.
Se conservan stdout, stderr y exit code; ningún test escribe un marker falso.

La prueba GPUI requiere el runner gráfico aislado; no abre la app en el escritorio
del operador ni presupone GPU disponible en un runner hosted. Sus resultados
se registran separados de los gates unitarios/estáticos de CI.

## Resultado acreditado en el servidor (17-oct-2026)

Setup real instalado en tres usuarios estándar/escritorios privados. Los dos
casos negativos salen1 sin hub-ready y stderr identifica la escena ausente o
el catálogo instalado ausente. El paquete completo supera los recursos y sale1
al crear recursos DirectX, HRESULT0x8007000E, sin hub-ready ni cierre forzado.
El cambio de diagnóstico conserva toda la cadena de error. Desactivar
DirectComposition también falla. Los resultados completos y cleanup de cuentas
están en C:/VantareServer/evidence/rc1/hub-1694/INFORME.md.

El orquestador acepta entregar el arreglo de recursos con este límite explícito.
No se marca la prueba gráfica como PASS ni se sustituye el marker real. La causa
es compatible con restricciones gráficas/memoria de escritorio del servidor y
queda sin confirmar. No hay otra VM o PC autorizado. La propuesta de Windows
hosted y los pasos físicos de Isaac van en #1697 / PR draft #1698, aparte;
no se añade esta prueba a checks requeridos ni se toca el backend gráfico.