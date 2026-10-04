# Integración local de la beta nativa — 2026-10-04

Tarea: [GitHub #1432](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432), fase 7 de ADR 0099. Worker Codex; revisión y aceptación reservadas al orquestador Claude Opus 5.5. Notion no disponible: excepción GitHub-only autorizada expresamente por Isaac. No se declara actualizado el seguimiento Notion ni aceptada la fase 7.

## Base y merges

Worktree `C:/tmp/vw3-integ`, rama `vantareapp/isa-1432-beta-integracion`; base encargada `27ca9066220abcc209f6dc95985de475b22ffd36`, punta de la ventana estrecha, preservada. Se obtuvo `origin/nightly` para leer instrucciones vigentes; no se cambió la base específica de esta entrega. Ocho merges locales, en este orden:

| Rama entrante | Commit de merge |
| --- | --- |
| `vantareapp/isa-1451-beta-acceso-modulos` | `5eed86e8d75e5034e1fd2940d2ef21e1461ec25c` |
| `vantareapp/isa-1452-beta-testing-center` | `34b37e62a76623c85b9b94ee89992f71ea5fb695` |
| `vantareapp/isa-1453-beta-posthog` | `a9ba3117a77312bf76d6b2e306544dd21feb780a` |
| `vantareapp/isa-1454-beta-instalador-updates` | `3df350869400885b04bf8e53c30ea1c31d847788` |
| `vantareapp/isa-1455-datos-antiguos` | `f47d6bed33fe6ec1b5ac1f8f804e8677d190d223` |
| `vantareapp/isa-1456-admin-miniapp` | `837b5de89fcb03f02186fb908140ebc5c1077b2c` |
| `vantareapp/isa-1458-strategy-busqueda` | `ccf0c1a4a7ffd7eefc04878009fa92f8ffb9c017` |
| `vantareapp/isa-1452-beta-authorize-servidor` | `38e240ddb164a50bf6771dbdea6c81bf14c70e15` |

Cada merge pasó `cargo check --workspace --all-targets -j 2` antes de su commit. El primero requirió eliminar artefactos compilados obsoletos de `vantare-domain`/`vantare-ipc`; no se cambió código para ocultar el error. Los gates completos se reservaron al final, conforme al encargo de integración.

Resoluciones de texto:

- #1454: diez entrypoints tenían `--version` frente al panic hook de #1453. Se conservó salida inmediata de versión primero, instalación del hook después y ejecución normal; quedan ambos comportamientos.
- Servidor: el spec del puente de cuenta era add/add. Se conservó el diseño inicial como antecedente y las revisiones posteriores de servidor, simplificación de `native-license` y contrato beta. Este worker no desplegó ni confirmó directamente el estado productivo de Supabase.
- Los demás merges no necesitaron resoluciones manuales. #1458 incluye documentación y fixture Fuji de #1450.

## Cruces de comportamiento cerrados

- `packaging/version.rs` aporta la identidad de producto al envío PostHog, reporte RPC y diagnóstico exportable del Testing Center. El builder fija versión y canal; las lecturas sin configuración siguen declarando desarrollo o no configurado.
- Testing Center adjunta el UUID de `diagnostics::anonymous_id` al campo existente `p_context_text`, visible en la preview. No se añade un campo desconocido a la RPC ni se cambia su esquema. El intento durable conserva los metadatos y el payload exacto para el reintento. Se respeta el límite UTF-8 de 4096 bytes: un exceso rechaza la preparación y conserva el borrador.
- La distribución `beta` utiliza membership RPC `testers`, permitida por el servidor existente; el contexto conserva el canal real `beta`.
- `candidate.ps1` excluye `vantare-admin` del build público y de su inventario. `beta.ps1` solo arranca supervisor y Hub. La miniapp owner sigue siendo un build independiente.
- PostHog, UUID y frescura usan `VANTARE_NATIVE_DATA_ROOT/Vantare/native`; servicios/borradores protegidos usan `.../services/<namespace>`. Los borradores locales del Hub quedan en `data/hub`. Todo vive bajo la generación beta, separado de Wails.
- `publish-beta.ps1 -ConfigFile` carga un fichero externo literal, con lista cerrada de variables, validación previa y restauración del entorno. No evalúa PowerShell ni imprime valores; rechaza secretos reconocibles y JWT Supabase distintos de anon. La lista final está en `native/packaging/README.md`.
- El test de superficie Deno normaliza CRLF antes de comparar TOML, para soportar el checkout Windows sin debilitar las comprobaciones.
- La raíz DPAPI se canonicaliza en Windows después de comprobar el directorio: Rust aporta el prefijo de ruta larga a las llamadas Win32 existentes. Se reprodujo antes del arreglo que una generación beta profunda fallaba con `Storage`; el test de regresión exige guardar, reemplazar y restaurar en esa ruta, sin cambiar cifrado, ACL o exclusión de escritor.

## Evidencia y límites

Commit del hito de código: `2eb89d13451bc5acb02fcc3900e5b5efd127b4fe` (23 ficheros; sin dependencias nuevas). Inventarios completos en `integration-files.txt` (arreglos de integración) e `integrated-files.txt` (base → candidato) dentro de la carpeta de evidencia. Los arreglos afectan a Hub/Testing Center, servicios/reportes/diagnóstico/DPAPI, frescura IPC, identidad del supervisor, tooling de packaging y el test de superficie Deno; no se movieron ficheros.

## Gates del hito de código

| Comando | Resultado verificado | Log externo |
| --- | --- | --- |
| `cargo fmt --check` | PASS | `gate-fmt.log` |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASS | `gate-clippy.log` |
| `cargo nextest run --workspace --build-jobs 2 -j 2` | 1082 PASS; 0 FAIL; 4 omitidos por perfil/ignore | `gate-nextest.log` |
| `cargo test --workspace --test lifecycle -j 2` con `RUST_TEST_THREADS=2` | Hub 5 PASS y runtime 12 PASS; 0 FAIL | `gate-lifecycle.log` |
| `cargo nextest run --workspace --build-jobs 2 -j 2 -E 'package(vantare-services)'` | 71 PASS; 0 omitidos | `services-tests-final.log` |
| `deno test --config supabase/functions/deno.json --node-modules-dir=none --allow-env --allow-read --allow-net supabase/functions` desde raíz Git | 507 PASS; 0 FAIL; 1 ignorado | `deno-tests-final.log` |
| `native/packaging/config-tests.ps1` con directorio de evidencia externo | 8 PASS en Windows PowerShell 5 y PowerShell 7 | `config-tests-ps5-final.log`, `config-tests-ps7-final.log` |
| `native/packaging/tests.ps1 -Channel beta` sobre QA 0.1.0 | 106 PASS | `packaging-tests.log` |
| `native/packaging/beta-tests.ps1` sobre QA 0.1.0 → 0.1.1 | 57 PASS, más las 8 del loader | `beta-tests-final.log` |

El perfil Nextest excluye los harness `lifecycle`, ejecutados explícitamente en el gate separado. Los tests físicos ignorados de ACC/LMU no se activaron ni se iniciaron simuladores. La prueba Deno ignorada requiere `LOCAL_POSTGREST_URL` loopback; no estaba configurada y no se sustituyó por producción.

Se conservaron también los intentos fallidos: `gates-pid-collision/` registra una carpeta temporal heredada que usa solo PID; `gates-long-path-before-fix/` registra los fallos DPAPI bajo una ruta profunda. `long-path-before-fix.log` reproduce el nuevo test antes de corregirlo; `services-tests-final.log` y el gate final lo prueban después. El último pase completo usa `TEMP/TMP=C:/tmp/isa-1432-evidence/t4`, exclusivo de esta entrega. No se habilitaron reintentos nuevos ni se relajó el perfil.

Comprobación adicional Go: `go test ./... -p 2` no pasó el setup de `cmd/vantare` y `frontend`, porque falta `frontend/dist` para `go:embed`; `internal/license` sí pasó. Log `go-tests.log`. No se construyó ni modificó el frontend Wails congelado; este resultado no se presenta como suite Go verde.

La primera suite beta detectó una distinción vacío/ausente heredada del entorno de PowerShell 7: .NET Framework elimina una variable vacía al restaurarla. Se reprodujo en `config-empty-probe.log`. El test final usa un valor público previo explícito para verificar restauración exacta y comprueba también la configuración desactivada; no cambia el loader ni acepta valores vacíos en `ConfigFile`. Se conservó `beta-tests.log` fallido. El ajuste final solo toca tests PowerShell y este informe: Rust permanece idéntico al hito que pasó los gates completos.

## Artefactos de QA y prueba manual

Se construyeron `qa-0.1.0/` y `qa-0.1.1/` con `publish-beta.ps1 -BuildProfile Debug`, entorno cloud limpiado y sin `ConfigFile`. Ambos manifiestos del paquete declaran `source_sha=2eb89d13451bc5acb02fcc3900e5b5efd127b4fe`, `source_dirty=false`, canal `beta` y perfil `Debug`. Son exclusivamente QA local; no son la Release solicitada ni artefactos autorizados para distribución.

Los 11 ejecutables muestran versión/canal correctos en el test de actualización; el inventario público no contiene `vantare-admin.exe`. Búsqueda estática acotada de los dos payloads: cero URL Supabase y cero kid solicitado (esperado sin configuración); cero material PEM privado, JWT con rol `service_role` o claves `sb_secret_` reconocibles. Detalles sin valores de configuración en `binary-scan-qa-0.1.0.json` y `binary-scan-qa-0.1.1.json`; no equivale a una auditoría de todos los formatos posibles de secretos.

Se instaló realmente `VantareSetup.exe` 0.1.0 en `C:/tmp/isa-1432-evidence/nsis-smoke-clean/`, se arrancó el Hub desde los binarios instalados mediante `Start-BetaHub`, con su supervisor, y se verificó `Vantare Native 0.1.0 (beta)`. No hubo login ni configuración cloud. Captura física de área cliente 1440×900, DPI 96, bajo `Global\VantareParityCapture`, con `pantalla-ocupada` ausente y notas del orquestador ausentes. Después se cerraron únicamente nuestros procesos y se desinstaló mediante NSIS; registro retirado, datos de QA conservados.

La primera captura `primera-hub.png` queda preservada: tenía tablas superpuestas de overlays ajenos (`C:/tmp/isa-1461-evidence/current-before-bin/`), identificados por imagen de proceso. La segunda `hub-limpio.png` se obtuvo poniendo temporalmente encima solo nuestro Hub y restaurando su orden al cerrar; no se detuvo ningún proceso ajeno. Ambas imágenes y la referencia Wails se inspeccionaron visualmente. Estructura observada: rail y columna lateral, cabecera Inicio y aviso de acceso sin verificar; la zona central no muestra las tarjetas de un usuario autenticado. No hay perfiles de overlay, aparecen dos perfiles launcher iniciales y versión 0.1.0. La referencia contiene saludo del usuario `test`, perfil Clean Overlay y tarjetas pobladas; son estados de acceso/datos diferentes. Esta comprobación acredita apertura de ventana, no paridad visual ni funcionamiento de cuenta.

El primer helper de instalación usó una ruta con barras `/` que NSIS ignoró, instalando en su carpeta predeterminada. Se retiró exclusivamente esa instalación de QA tras verificar su SHA/perfil/versión; registro y binarios retirados, datos conservados, sin borrar datos reales. La repetición usó ruta Windows normalizada y carpeta de prueba. Logs `smoke-first-path.log`, `nsis-default-cleanup.log`, `smoke.log` y `smoke-clean.log`; el último verifica retirada del registro tras finalizar el subproceso del desinstalador.

Para repetir manualmente: verificar SHA-256 del Setup/ZIP, usar una carpeta nueva con ruta Windows normalizada (parámetro NSIS `/D=` al final), abrir el acceso de beta, comprobar la versión y no iniciar sesión. Cerrar Hub y supervisor antes de desinstalar. Los tests automatizados ya cubren staging local, aplicación 0.1.0→0.1.1, binarios en uso, arranque fallido y rollback con preservación de datos. Repetir la prueba de desconexión sobre la Release configurada cuando se desbloquee.

## Build Release pendiente

El fichero encargado `C:/tmp/beta/build-config/beta-dev-clerk.env` no existe. Solo se observó el nombre de otro fichero público en ese directorio; no se derivaron ni inventaron valores. Falta por ello la Release 0.1.0 configurada en `C:/tmp/isa-1432-beta-build/` y la comprobación de su URL Supabase/kid `vantare-prod-2026-10b`. El loader `-ConfigFile` está implementado y probado con fixtures explícitas externas, pero no con ese fichero ausente.

La sesión tampoco dispone de permisos de administrador para imponer un bloqueo de red mediante firewall. Una apertura local sin configuración cloud ni login no acredita una prueba con red físicamente desconectada. Esa verificación deberá hacerse sobre la Release configurada, con el aislamiento de red disponible al orquestador.

Siguiente paso cuando exista el fichero externo: desde un SHA de integración limpio, ejecutar `powershell -NoProfile -File native/packaging/publish-beta.ps1 -Version 0.1.0 -OutputDirectory C:/tmp/isa-1432-beta-build -ConfigFile C:/tmp/beta/build-config/beta-dev-clerk.env` (perfil Release predeterminado), revisar los hashes y comprobar URL/kid y ausencia de secretos en el payload, instalar en una carpeta nueva y repetir apertura con red aislada. La promoción sigue reservada a Isaac; esta tarea continúa bloqueada para entrega de la candidata configurada.

Todos los logs, capturas, fixtures temporales de QA y hashes quedan en `C:/tmp/isa-1432-evidence/`, fuera del repositorio. Comentarios verificados de seguimiento: [inicio](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432#issuecomment-5974345622) y [bloqueo de configuración](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432#issuecomment-5974538594).

No hubo push, PR, merge a nightly/testers/master, publicación, login, despliegue de funciones/migraciones ni cambios en datos reales. Los merges realizados son exclusivamente locales en la rama encargada. La evidencia automatizada no sustituye validación física LMU, OBS, DPI/otras GPU, uso prolongado o aceptación por Isaac.

## SHA-256 de artefactos de QA

Rutas relativas a `C:/tmp/isa-1432-evidence/`:

| Carpeta | Fichero | SHA-256 |
| --- | --- | --- |
| qa-0.1.0/ | VantareSetup.exe | `ed83dcdf97b3f2fecdf8b1678325a21561c98349fb33ddec4953c906b5a6b3bd` |
| qa-0.1.0/ | vantare-native-amd64-package.zip | `bc8e0a222aec8c669dc805f05c7c5878ba898ec388f1f73ee11c16a530c9ba38` |
| qa-0.1.0/ | vantare-native-beta.json | `d075cde7ab0c853919e0fa7cff9830e8b3a36deb41ea74e15355f9a191e3f5ae` |
| qa-0.1.1/ | VantareSetup.exe | `a84a2e1741183d459e33affc7cba70f4c4dbc29310b558d52b716536ba750f36` |
| qa-0.1.1/ | vantare-native-amd64-package.zip | `98c9fa01b35a120bdd40889a42b6ba57208bc368a449ec8930f7eb88c8f4f805` |
| qa-0.1.1/ | vantare-native-beta.json | `eceb5b14ce934cdfada9fb4d9fa800762dfc8c536eb4ce70d9a5d703c2a51638` |

Capturas: `primera-hub.png` = `bda5c5aa183f692d65c2de5c2bc3b69e5a2e412356b0850080c503acc53a24e6`; `hub-limpio.png` = `7ec1b6f62aa99dc48b08ac1d5802178419b5ddf3cf843d4a9b2399ec19b21991`. `artifact-hashes.json` conserva tamaños y hashes; `qa-evidence-hashes.json` conserva hashes de logs y capturas.
