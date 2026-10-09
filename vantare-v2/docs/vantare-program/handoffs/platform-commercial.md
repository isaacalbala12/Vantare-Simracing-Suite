# Handoff vivo — plataforma, cuenta, releases y migración

## #1511 — nombre visible Vantare (2026-10-08)

Entrega técnica verificada en `C:/tmp/vw3-1511/vantare-v2`, rama
`vantareapp/isa-1511-nombre-vantare`, base candidata `a8f9bdc3`.
Código `731af462624a482bdbdb2c62a5ac5b910a298bc4`, push verificado; PR draft
[#1518](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1518)
contra `vantareapp/isa-1470-candidato-beta` (base remota `a8f9bdc3`). CI recién
iniciada (ratchet, native-linux y GitGuardian); no se afirma verde. Entrega
para revisión del orquestador, sin integración ni publicación.
NSIS/Inicio/DisplayName/ventana pasan a Vantare; la carpeta nueva por defecto
es `Programs/Vantare`. Se conserva clave `VantareNativeBeta`, canal/tag/asset
beta y la raíz de instalaciones anteriores: compatibilidad con el updater y
su rollback, sin mover datos ni duplicar registros. El Hub sincroniza mediante
`candidate.ps1` de su generación verificada, antes de hub-ready, aunque el
bootstrap instalado sea antiguo. Inicio/Windows usan desinstalación durable
para retirar accesos nuevos también en instalaciones migradas solo por feed.
No cambia compra/login #1506, servicios remotos, claves ni publicación.

PASS por cola: fmt/check/Clippy, Nextest 1216/1216 (6 skips heredados),
lifecycle 18/18 y Hub Release propio. PS5.1 desde Bash: packaging 175, beta 99
(+configuración 10), Setup NSIS 50, feed 9, desinstalación 2, guardas 2,
MSIX/sintaxis 12 sin paquete Store real; sintaxis PS, changelog y diff PASS.
Setup anterior 0.0.960 y nuevo 0.0.961 prueban cambio de nombre, datos exactos,
rollback/versiones, rechazo 2/3/4, instalación limpia, reparación y reinstalación.
Hub real confirma tras Setup y reparación (PIDs 22680/32720). Feed firmado con
clave TEST y bootstrap antiguo: fallo real restaura generación/registro;
reaplicación confirma Hub PID 6228, renombra y conserva hashes de ambos scripts
raíz. Desinstalación registrada conserva datos y retira accesos también por feed.
Tres capturas 1440×900/DPI100 inspeccionadas; ninguna instalación real modificada:
huella de scripts/estado/registro de Isaac idéntica y sin registro/accesos/Hub QA.

Evidencia, scripts y hashes: `C:/tmp/1511-nombre-evidence/`; Setup/paquetes
QA en `E:/tmp/1511/0.0.960` y `0.0.961`. Se reutilizan nueve exe de #1492 y
se recompila Hub Release: local, unsigned/source_dirty=true, no candidata del
SHA completo. Plantilla NSIS productiva compila con nombre Vantare, sin ejecutarla.
Se conservan fallos corregidos del harness: LASTEXITCODE no definido, portable
no preparado y título consultado antes de mostrar el Hub oculto; además un
turno de pantalla ocupado, respetado antes de abrir ventanas. Suites finales PASS.
No prueba login real, feed publicado, LMU/OBS, Windows limpio, Mac ni DPI125.
No gates Go/frontend ni telemetría larga: no cambian legado/runtime/domain/IPC
ni testdata. Falta revisión independiente y build completa sobre la integración
limpia antes de distribuir; siguiente paso: revisar la PR draft contra candidata.
`docs/roadmap/plan.md` ausente también en origin/nightly consultado; no se recrea.
Seguimiento GitHub por encargo, por encima de la regla Notion antigua de esta base.
Sin merge, promoción, release ni acción de producción.

## #1510 — Launch Edition y funciones posteriores (2026-10-08)

Worktree `C:/tmp/vw3-1510/vantare-v2`, rama `vantareapp/isa-1510-le-bloqueo`,
base exacta `a8f9bdc3`. Implementación aislada contra candidato beta, sin
delegación y sin tocar #1506, precios, productos, compra ni producción.
El núcleo distingue Free/LaunchV1/Pro a partir de derechos firmados vigentes;
LE congela Standings/Relative/Delta/Pedals. Pro amplía durante su vigencia;
canal/rol tester no amplían LE. Owner conserva QA. Calendario inicial;
otros módulos requieren su capacidad existente y quedan fuera de LE.
Control IPC v4, licencia firmada sin cambios. Studio conserva perfiles y
muestra candado/«Incluida en Pro»; overlays no pintan/proyectan lo bloqueado.
Inventario, límites, revisión del corte y QA real para Isaac:
[contrato y runbook](../../billing/le-1510-catalogo.md).
Check completo PASS por cola/-j2. Primera pasada Clippy detectó 101/100 líneas
en `poll_source`; se extrajo su bloque de actualización de acceso, sin excepción
al lint. Segunda pasada Clippy PASS; Nextest 1221/1221 PASS (6 excluidos del
perfil habitual), lifecycle 18/18 PASS. Log fallido conservado; corpus de
telemetría 21/21 PASS. Captura Debug falló por `GenericContainer` heredado,
igual en la base; hallazgo separado [#1520](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1520),
sin tocar sidebar/neo. Fmt/diff PASS. Tres capturas del Hub real en perfil
`prueba`, 1440×900, inspeccionadas: Free bloquea Relative/Delta y conserva
sus instancias; LE conserva los cuatro iniciales y bloquea módulos posteriores;
Pro conserva acceso. Evidencia local `C:/tmp/lanzamiento/1510-capturas/`,
políticas sanitizadas exportadas por tests con credenciales firmadas, sin
cuentas reales. Intento adicional de catálogo abierto no completado: timeout
del helper/mutex compartido; no se afirma esa aceptación visual. Selección
por teclado/ratón y los 18 tipos están cubiertos por tests. No prueba backend,
LMU/OBS, macOS, instalación ni release. Pendiente de revisión de Isaac;
el informe `C:/tmp/lanzamiento/informe-1510.md` registra SHA/PR/CI finales.
Código publicado en `e12aabaa6b03f11d52640b6edb656ec30b1b835d`,
[PR draft #1522](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1522)
contra `vantareapp/isa-1470-candidato-beta` remoto exacto `a8f9bdc3`.
#1510 permanece abierta, Project Vantare en revisión. CI remoto en curso
al entregar, sin aceptación/integración, merge, promoción ni release.
La actualización documental posterior no cambia el código ya verificado.
Roadmap `plan.md` ausente también en `origin/nightly`; no se recrea ni publica.
Seguimiento GitHub por brief reciente, sin aplicar referencias Notion antiguas.

## #1507 — Clerk Production nativo (2026-10-08)

Continuación CLI autorizada por Isaac: cliente OAuth público Production creado
con Clerk CLI 3.4.1; client ID `n5cqSYkpsTiEw6jk`, PKCE obligatorio, scopes
openid/profile/offline_access, loopback `http://127.0.0.1/callback` (build puerto 0).
Plantilla pública `native/packaging/build-config-production.template` añadida.
PR #1523 `907989d6` inspeccionado: no cambia access.rs ni código nativo.
Third-party auth, session token y webhooks reservados a #1514; servidor y
prueba de login son dependencias. Orígenes raíz/www/accounts aplicados y
allowlist de subdominios solo www/accounts; redirect loopback en cliente OAuth.
Portal confirmado accounts.vantare.app para alta/reset; Paths web conservados.
DNS/TLS/mail pendientes: cinco CNAME exactos enumerados en runbook, ninguno
creado. Wrangler 4.149.0 no tiene comando ni scope DNS Write; sesión zone:read.
No se extraen tokens para otra vía. Isaac debe añadirlos DNS only y desplegar
certificados; Google también requiere credenciales propias. Login real no
ejecutable todavía, ni build Production aceptada. Usuario de prueba existente
elegido por Isaac, raíz QA aislada y servidor coordinado con #1514 pendientes.
No usuarios ni secretos versionados. Esta autorización reemplaza la exclusión
administrativa de la entrega original; no autoriza merge/promoción/release.
Readback oficial 20:39 UTC PASS: cliente/PKCE/scopes/redirect, instancia,
orígenes/allowlist, issuer/portal. DNS/TLS/mail not_started, dominio incomplete;
cinco CNAME ausentes también en resolver local. PS5.1 configuración 21 PASS,
plantilla 8 variables/solo client ID público PASS y diff-check PASS. Sin cambios
Rust/Go/frontend/Deno: sus gates/build no se repiten. CI original 02f86218:
native-linux FAIL por imports vantare_runtime::rights en Engineer/recovery;
no reparado en este alcance. Informe CLI ≤10 líneas y evidencia pública externa
en C:/tmp/lanzamiento/informe-1507-cli.md y C:/tmp/1507-clerk-cli/.

Worktree `C:/tmp/vw3-1507/vantare-v2`, rama
`vantareapp/isa-1507-clerk-produccion`, base candidata `a8f9bdc3`.
Hub admite `VANTARE_CLERK_ACCOUNT_PORTAL_URL` como origen HTTPS DNS explícito
para alta/reset; Development conserva la derivación si falta. Configuración
inválida falla cerrada. No hay dependencias nuevas ni cambios en el checkout #1506.
Issuer OAuth propio y validadores de servidor ya eran independientes del dominio;
regresiones comprueban portal, configuración, cache discovery y descarte de
sesión al cambiar issuer/client. OAuth no se transforma en JWT Supabase.
Runbook: `docs/billing/clerk-production-runbook.md`, instancia/DNS Cloudflare,
cliente público PKCE, variables de servidor, Third-Party Auth para sesión web,
plantilla externa sin valores y prueba manual de login/corte/rollback.
PASS: configuración PS5.1 21; validadores Deno 78; Rust check/Clippy
`-D warnings`, Nextest 1220/1220 (6 skips previos, 1 slow PASS), lifecycle
18/18. Compilaciones y gates por cola/-j2. `cargo fmt --all -- --check` PASS
directo, sin compilación; su espera duplicada en cola se retiró únicamente
tras comprobar proceso propio sin hijos (no un fallo de formato). Intento de
beta-tests no ejecutado por faltar paquetes QA/firmador; no se fabrica evidencia
productiva. Logs, archivos y detalle en `C:/tmp/1507-clerk-evidence/`; informe
de hasta doce líneas en `C:/tmp/lanzamiento/informe-1507.md`.
No se accede a `.env*`, credenciales, instalación real ni paneles de producción.
Preguntas: checkout/variable final de web #1506 y vinculación de identidades
Development existentes. Recomendación: alta nueva Production para QA y decidir
vinculaciones antes de distribuir. Login real pendiente de preparación de Isaac.
`docs/roadmap/plan.md` ausente también en `origin/nightly`; no se recrea.
Seguimiento GitHub por encargo explícito, que prevalece sobre instrucciones
históricas de Notion. Código `b5684da5` subido; entrega técnica en revisión en
[PR draft #1516](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1516)
contra `vantareapp/isa-1470-candidato-beta`. CI observada en curso sobre ese
SHA; no se anuncia CI verde. Sin merge, promoción, release o cutover productivo.

## #1492 — Setup encima y adopción de datos (2026-10-08)

Ronda 2 sobre `072ca621`: códigos de bloqueo tipados en `Exception.Data`
(2 sesión/binarios abiertos, 3 versión/datos superiores, 4 arranque pendiente).
El código 4 tiene mensaje NSIS específico y conserva generación, datos y
marcador exacto; el fallo posterior del Hub sigue restaurando la anterior.
La identidad QA se escribe únicamente desde NSIS TEST en
`registration-identity.txt`; el bootstrap valida ese dato y solo conoce
`VantareNativeBeta` como predeterminado. Desinstalar QA retira el archivo.
Setup reconstruidos mediante la cola, sin recompilar Rust: 33/33 PASS reales
en raíz aislada; rollback y versión registrada anteriores recuperados. Sin
registro/accesos QA restantes; huella comprobada de Isaac idéntica.
Evidencia de esta ronda: `C:/tmp/1492-instalador-evidence/ronda2/`.
Gates de ronda 2 PASS: packaging 174, beta 86 (+configuración 10), feed 9,
desinstalación 2, guardas 2, MSIX 12 (sin paquete MSIX real), sintaxis y diff.
Se conservó el fallo del lanzador PS5.1 al elevar stderr esperado de un
negativo; repetición completa desde PS7 con suites PS5.1 PASS. Sin cambios
Rust ni gates Rust; instaladores QA sin firma, mensajes verificados por códigos
silenciosos. Entrega local pendiente de revisión del orquestador, sin push,
PR, CI remoto, merge, promoción ni release; seguimiento en GitHub por encargo.

Evidencia de la ronda 1:

Rama `vantareapp/isa-1492-instalador-encima`, base `aa8ba9e1`, worktree
`C:/tmp/vw3-1492-instalador/vantare-v2`. Continuación del intento interrumpido
por disco lleno; se conservan y revisan sus cuatro archivos de packaging.
Setup comparte Update/boot-pending/confirmación/rollback con el feed, reinstala
la misma versión y rechaza versiones inferiores. Exige cerrar sesión y binarios
sin matar procesos; el desinstalador conserva la referencia a los datos activos.
Reinstalar adopta esa copia; copias antiguas distintas sin referencia se rechazan.
QA usa dos instaladores 0.0.960/0.0.961, raíz y registro/accesos separados,
target `E:/tmp/1492/target`, exclusivamente por la cola de compilación.
Evidencia: `C:/tmp/1492-instalador-evidence/`; informe del worker:
`C:/tmp/fase2/informe-1492-instalador.md`. PASS: packaging 174, beta 76,
feed remoto firmado simulado 9, Setup NSIS 24 y desinstalación 2.
Hub real 0.0.961 confirmó ventana tras actualizar y reparar (PIDs 17624/17208).
Setup rechazó lock de sesión y Hub en uso con código 2, sin terminar esos PIDs;
código 3 rechazó downgrade. Un Hub que salió con error antes de ready restauró
generación, datos y versión registrada anteriores. Inicio apuntó al bootstrap QA.
Capturas `primera-setup-updated.png` y `primera-setup-repaired.png` inspeccionadas;
registro/accesos QA retirados y huella de scripts/estado/registro de Isaac idéntica
antes/después. Los instaladores están en `E:/tmp/1492/0.0.960` y `0.0.961`;
hashes en `artifacts.json`, Release sin firma y `source_dirty=true` (QA local).
Se conservan logs de los fallos corregidos del harness: variable sobrescrita al
cargar candidate, validación de JSON comprobada en el firmador en vez del
verificador, y ruta NSIS con barras `/` en vez de ruta nativa Windows.
Límites: no prueba login, carrera LMU, equipo limpio ni feed remoto productivo;
datos antiguos distintos sin referencia requieren recuperación explícita.
No hay push, PR, CI remoto, merge, promoción ni publicación. No se toca la
instalación de Isaac ni su clave privada. `docs/roadmap/plan.md` no existe en
esta base; no se recrea un roadmap fuera del alcance de packaging.

## #1480 — acceso intermitente, corrección aislada (2026-10-07)

Rama `vantareapp/isa-1480-acceso-parpadeo`, base `d96acc64`, worktree
`C:/tmp/vw3-1480-acceso`; pendiente de revisión del orquestador.
Causa reproducida por cuatro regresiones RED: cache de política de 1 s + sondeo
Hub de 1 s + entrega IPC pueden vencer el heartbeat de 2 s; errores genéricos
retiraban la política y cada consulta notificaba la página completa. El
supervisor ocultaba la política revocada tras un error genérico.
Corrección: consultas a 500 ms, última política conservada ante fallos/pending
solo dentro de su vigencia, resultados definitivos entregados por LicenseStatus
y heartbeats sin cambios de Access sin notificación. No cambia el modelo de
derechos, TTL, firma, IPC ni persistencia; logout y revocación siguen bloqueando.
Gates finales PASS por cola/-j2: fmt/check/Clippy -D warnings, Nextest
1214/1214 (6 skips previos; ACC/LMU incluidos), lifecycle18/18. Cuatro
regresiones RED antes del arreglo y PASS dentro de la suite final. Se conserva
el primer fallo Clippy (brazos idénticos), corregido sin excepciones al lint.
Standings Release propio 0/292160 px, umbral0/delta0, referencia/captura/mapa
inspeccionados. Baseline nativa aprobada F1; intentos histórico Wails85,3666%
y Debug1px/delta1 conservados, sin modificar referencias, imágenes o umbral.
Evidencia, diagnóstico, hashes y manual `C:/tmp/1480-acceso-evidence/`;
informe y SHA local `C:/tmp/fase2/informe-1480-acceso.md`. Issue #1480 abierta
para revisión del orquestador; no se anuncia una beta corregida publicada.
No se tocó la instalación real ni se leyó DPAPI/tokens/.env. Falta prueba física
con la sesión de Isaac; los tests deterministas no la sustituyen. Sin push,
PR, CI remota, integración, promoción o release. `docs/roadmap/plan.md` ausente
en esta base: no se crea una segunda fuente del roadmap.

## Candidato beta — verificación local cerrada (2026-10-07)
Código `1c9ca48d`, base `dd90b49c`, rama `vantareapp/isa-1470-candidato-beta`; merges en orden `6338e31e` y `f18b842e`, sin squash. Zoom no autorizado por nota y no integrado.
Gates completos finales PASS: fmt/check/Clippy -D warnings, Nextest1205/1205 (6 skips, goldens ACC/LMU), lifecycle17. Se conserva el fallo intermedio de caché/mtime y su repetición completa verde.
QA `0.1.0-beta.1`/testers: 72 capturas Hub 1920/1440 opacas, 54 widgets y todas sus hojas/paneles inspeccionados. 18/18 widgets idénticos a referencias; Standings0/292160px. Regresión alfa255/254/0 PASS.
Paquete Release beta fuera del repo: source_sha `1c9ca48d19997733df2d8e2cf425bca67fe3d466`, source_dirty=false; 10 ejecutables, sin Workshop; build Release PASS, packaging/tests.ps1 beta174 PASS. Desinstalación normal/interrumpida PASS en PS5.1 y pwsh.
Hub empaquetado abre/responde/cierra exit0 con datos y pipe aislados; captura1440 opaca inspeccionada. Muestra pantalla de acceso Comprobando sesión: no acredita login completado, LMU live, OBS, DPI125, Mac ni rendimiento. Feed GitHub real/firma USB/NSIS no probados.
Evidencia `C:/tmp/candidato-evidence/`; hojas `resumen-1920.png`, `resumen-1440.png`, `widgets/resumen.png`; detalle `inspeccion.md`. Informe/archivos/checks/manual en `C:/tmp/fase2/informe-candidato.md`. Paquete `release-package/`; primer paquete dirty es solo evidencia histórica, no el candidato final.
Cierre documental posterior al código no cambia los binarios del paquete. plan.md ausente en base: no se inventa otro roadmap. Checkout principal preservado.
Solo integración local autorizada por brief. Sin push, PR, CI remota, promoción, release ni cambios de cuentas/datos/servicios remotos.

## #1472 — seguridad incorporada al candidato beta local (2026-10-07)
Rama `vantareapp/isa-1470-candidato-beta`, base `dd90b49c`, worktree `C:/tmp/vw3-candidato`.
Se incorpora `f18b842e` (contiene R2 `d1aa7fc2`) mediante segundo merge sin squash, después de widgets/telemetría `2ab5d362`.
Seguridad de arranque/guardado/licencia/IPC/packaging/actualizador preservada; Launcher conserva visual r2 y añade Trust.
El diagnóstico ya no espera Workshop en beta/testers. Regresión RED/PASS con inventario real; desarrollo/nightly/master sin cambio de inventario.
Gates propios finales PASS: fmt/check/Clippy -D warnings, Nextest 1205/1205 con goldens ACC/LMU, lifecycle 17 escenarios. Un build de test RED reutilizado por mtime antiguo queda conservado; repetición final completa verde.
Desinstalación normal/interrumpida con fixtures PASS en PS 5.1 y pwsh, datos preservados. QA beta.1/testers y 72 capturas opacas PASS; inspección y paquete Release en curso.
Evidencia `C:/tmp/candidato-evidence`; continuidad `C:/tmp/fase2/informe-candidato.md`.
No se prueba el feed contra GitHub real: prerelease autorizada por Isaac sigue pendiente. Sin push, PR, promoción, publicación, cuentas ni servicios remotos modificados.

## ISA-1472 — decisiones de seguridad de Isaac (2026-10-07)

Entrega local en `vantareapp/isa-1472-seguridad-decisiones`, worktree
`C:/tmp/vw3-1472-decisiones`, base `d4a4e73a`. Implementación:
`984909ea` revisión de perfiles, `7193b868` manifiesto firmado y `b3111fd0`
crashes con campos cerrados. Pendiente de revisión del orquestador e Isaac;
no integrado, promocionado ni publicado. Sin push, PR o CI remota.

El actualizador exige el sobre Ed25519 antes de descargar y al aplicar,
incluido modo local. Reutiliza licencia/services; no hay dependencias nuevas.
La clave pública Ed25519 está fijada en `PUBLIC_KEY_BASE64` de
`native/services/src/update_manifest.rs` desde `e8f3f11f`; no hay clave de
test ni fallback productivo. Isaac custodia la privada en un USB, carpeta
`vantare-claves\actualizador-ed25519.seed`, con letra de unidad variable.
Firmar exige conectar el USB y pasar
`-SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed`; nunca copiar
la semilla al disco. Este worker no accede al USB ni a la semilla. El firmador recibe una ruta explícita y no
imprime claves. Procedimiento en `native/packaging/README.md`.
El bootstrap antiguo necesita reinstalación para pasar al feed firmado.
Pruebas locales con clave generada de TEST verifican el sobre y el feed;
no equivalen a firma privada real, NSIS ni actualización desde GitHub.

Los crashes enviados contienen código, versión conocida (o `unknown` para
metadatos antiguos), SO y hasta 64 direcciones numéricas. No mensajes, rutas,
binarios libres, timestamp ni UUID estable. La proyección protege también las
colas antiguas; el hook local y Testing Center voluntario conservan su
comportamiento. Fuera de Windows la pila es vacía. No es certificación integral
de seguridad, SmartScreen/Authenticode ni validación de cuentas de producción.

`cargo install cargo-audit --locked` y auditoría de `native/Cargo.lock`:
cargo-audit 0.22.2, **0 vulnerabilidades**, DB
`ef6173cbc5c50ec8166f9a5b28f07834144373ee`. Avisos pendientes, sin modificar
dependencias: `paste 1.0.15` (RUSTSEC-2024-0436), `rustybuzz 0.20.1`
(RUSTSEC-2026-0206), `ttf-parser 0.25.1` (RUSTSEC-2026-0192), sin mantenimiento;
`yoke-derive 0.8.3`, yanked. No equivalen a vulnerabilidades demostradas ni se
silencian. Evidencia íntegra `C:/tmp/1472-decisiones-evidence/audit.json`.

Gates por la cola: fmt/check/clippy `-D warnings` PASS; nextest completo
1188/1188, seis omisiones previas; tras el ajuste de perfiles históricos,
check/clippy finales y 302/302 tests de Hub/supervisor PASS; lifecycle 5+12
PASS. Standings Release propio: **0/292160 px**, umbral 0; captura, referencia
y diff inspeccionados. Debug tuvo un píxel delta 1 en dos rondas; se conservan
las capturas y logs, no se alteró la referencia. No hubo cambios en UI de
Standings. Logs, hashes y capturas fuera del repo en
`C:/tmp/1472-decisiones-evidence/`; informe de cierre
`C:/tmp/fase2/informe-1472-decisiones.md`. No Go/TS/CSS modificados ni LMU vivo,
DPI, instalador final o CI remota verificados. `docs/roadmap/plan.md` no existe
en esta base; no se inventó otro roadmap ni se anunció disponibilidad pública.

Siguiente acción: clave pública ya fijada (privada en el USB de Isaac);
reconstruir y verificar el roundtrip firmado con el instalador y una
prerelease real de GitHub antes de autorizar una promoción a nightly.


## VAN-763 / ISA-1377 — roadmap gráfico (2026-09-25)

[Tarea Notion VAN-763](https://app.notion.com/p/3e5e51695c6581debbcbfef649a86d59),
[referencia GitHub #1377](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1377).
Isaac corrigió el diseño el 2026-09-25: quiere línea temporal y varias vistas
gráficas, y Codex actualizará el contenido cuando él lo indique por chat. No
quiere un editor de formularios en la app. La publicación compartida debe verse
para todos los usuarios. Rama aislada `vantareapp/isa-1377-roadmap-sencillo`,
sincronizada con `origin/nightly`; la base exacta se registra en la tarea y
en el PR porque el canal sigue avanzando.

### Contenido inicial preparado desde Asana

Isaac fijó las fechas de los objetivos de Vantare 0.1 y aclaró el 2026-09-26
que las tareas no son círculos separados: el gran hito es la versión. La
primera publicación está preparada en
[VAN-763](https://app.notion.com/p/3e5e51695c6581debbcbfef649a86d59)
con dos hitos, identificadores estables y textos en los cuatro idiomas:

1. **Vantare 0.1 · 5 de octubre de 2026.** Objetivos del 1 de octubre:
   revisar Billing y acceso, y pulir Ajustes y Cuenta. Objetivos del 5:
   confirmar Widgets V16, afinar Calendario, revisar Launcher, presentar el
   Roadmap y abrir la alfa del Ingeniero. Las compras opcionales desde el 12
   de octubre quedan dentro del objetivo Billing.
2. **Vantare 0.2 · siguiente versión, sin fecha de lanzamiento fijada.** Solo
   tres objetivos: Ingeniero beta 0.2 tras el primer mes (objetivo 5 de
   noviembre), Strategy Planner alpha y widgets semanales. No anunciar temas
   de UI en este hito.

Las fechas del 1 y el 5 de octubre se verificaron de nuevo en el proyecto
Asana «Vantare · 0.1 Lanzamiento». El proyecto Asana «Vantare · 0.2» aún no
registra los tres objetivos de producto ni una fecha de salida; su alcance
público procede de la instrucción directa de Isaac. Widgets V16 tiene 16
subtareas, cuatro marcadas como completadas y dos tituladas «Daños»; por ello
la publicación dice «catálogo V16» sin afirmar 16 widgets distintos o
entregados. El contenido aún no está publicado: la base Supabase de producción
no tiene la tabla ni las funciones `visual_roadmap_*`, y la migración de esta
PR no se ha aplicado. La ruta documentada exige probarla en un entorno de
prueba y obtener autorización para integrar la PR en Nightly antes de activar
el nuevo almacenamiento.

La implementación local retira `plan.md`, JSON, digest, formulario y gate del
roadmap anterior; la revisión actual reemplaza el editor por línea temporal,
tablero y gráfico de distribución. Supabase conserva las publicaciones y expone
solo lectura a la app; Codex publica a través de la conexión SQL privilegiada.
Isaac precisó después que la línea temporal debe avanzar horizontalmente. La
vista ahora conecta los hitos de izquierda a derecha y permite recorrerlos
dentro del panel en escritorio y pantallas estrechas; las otras vistas no cambian.
Después aprobó combinar el recorrido numerado de la tercera exploración visual
con la limpieza de la segunda. La revisión en curso usa los hitos de la única
publicación para numerar el recorrido y mostrar un solo detalle seleccionable;
no añade datos de fases, fechas ni editor. Una captura del harness Orbit real a
1920 y otra a 1280 px muestran la shell y el cambio de hito con datos de muestra.
En este candidato, las 3 pruebas focales del roadmap, typecheck, build, lint y
las 4 pruebas de presupuesto PASS. La suite unitaria amplia registró 4.047 PASS,
2 omitidas y 2 timeouts en pruebas visuales ajenas al roadmap; sus ficheros
focales pasan por separado (FunctionalClipping 4/4, HeadToHead 1/1). El gate
remoto de `d23cad51` pasó (11m34s). Las capturas
usan el mock de Wails y no prueban Supabase ni un runtime físico.
La revisión horizontal pasó 4.049 pruebas frontend (2 omitidas), 4 pruebas de
presupuesto, typecheck, build y lint. Dos capturas locales comprobaron la
posición horizontal de los hitos y que la página no desborda a 1440 y 390 px.
Checks de la revisión gráfica: frontend completo 481 archivos, 4.049 pruebas
PASS y 2 omitidas; presupuesto de frames 4/4 PASS; auditoría i18n con 0
ausentes y 0 huérfanas; typecheck, build y lint PASS; Go `./...` PASS. Tres
capturas locales muestran las vistas con hitos del snapshot histórico anterior,
solo como vista previa, sin publicar. Falta validar la migración SQL y la lectura
compartida con Supabase real. El contenido inicial quedará vacío hasta la primera
publicación técnicamente validada; no se importa el plan histórico automáticamente.

[PR borrador #1380](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1380)
contra `nightly`, HEAD previo `d23cad51`. El CI de ese HEAD pasó gates
bloqueantes, promoción y GitGuardian; `quality-check` quedó
`REVIEW_REQUIRED` por cambios intencionados en workflows y `package.json`,
con NEW=0/MOVED=0. Siguiente acción: revisar el contenido y las rutas de
política, validar Supabase en un entorno de prueba y obtener la autorización
de Isaac antes de integrar en Nightly. Sin merge, migración, publicación ni release.

El 2026-09-26 Isaac autorizó continuar con la PR y la migración. La revisión
de las rutas de política confirma que se retiran el validador y el workflow del
digest anterior, y el script visual ligado a ese roadmap; el gate de canales
sigue activo. Nightly avanzó de nuevo y se incorporó a la rama, conservando la
eliminación intencionada de `plan.md` y `roadmap.json`. La migración debe pasar
primero por Supabase de prueba y una lectura con rol público antes de aplicarla
al proyecto de producción. La publicación de los dos hitos se verifica aparte
de la integración de código.

La primera ejecución en `vantare-staging` descubrió que Supabase concede
`EXECUTE` explícito a `anon`, `authenticated` y `service_role` al crear
funciones públicas: revocar solo a `PUBLIC` dejaba publicable el RPC. La
migración ahora revoca también esos roles en `visual_roadmap_publish` y
`visual_roadmap_valid`, y mantiene la lectura de `visual_roadmap_current` para
`anon` y `authenticated`. En staging se verificó que `anon` no puede publicar
(SQLSTATE 42501) ni leer la tabla, sí lee el documento exacto por el RPC;
dos publicaciones dejan una fila `published` y una `superseded`. El SQL de
producción todavía no se ha aplicado.

## VAN-740 / ISA-1305 — Wails beta.24 aceptado para Nightly (2026-09-22)

[Tarea Notion VAN-740](https://app.notion.com/p/3e3e51695c6581f7a1aae9d4db50ee38), puente técnico [GitHub #1305](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1305).
Worktree `C:/tmp/vantare-isa1305`, rama `vantareapp/isa-1305-wails-beta24-smoke`, base Nightly `1101f73579ddaa8798b7d9948bae8b4e2a77d850`.
Go, runtime frontend y los tres pins CLI de CI/release pasan a beta.24 sin adaptar código de producto. Build/tipos frontend, lint, 466 archivos/3772 tests frontend (2 omitidos), 126 paquetes Go con tests y build Windows production CGO=0 PASS.
La build canónica configurada se generó, abrió y fue aceptada por Isaac: «va todo bien, puedes mergear». Se reutilizó el entorno público existente, sin leer/copiar `.env.local` ni imprimir valores; archivo Go temporal eliminado.
Evidencia, hash del exe y límites: [informe ISA-1305](../../analysis/isa-1305-wails-beta24-smoke.md). No se afirma una matriz completa LMU/OBS ni mejora de rendimiento. El teardown frontend imprime un AbortError sin hacer fallar la suite.
Revisión independiente `3afeb0c0`: ACCEPT. CI identificó `go-mod-tidy` como único hallazgo nuevo; normalizado el grafo, segunda comprobación sin diff. PR [#1309](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1309); controles del candidato final pendientes.
Roadmap: `milestones:wails-v3-beta24`. Siguiente acción: PR, CI del candidato exacto y squash autorizado a Nightly; registrar allí el SHA remoto verificado. Sin testers/master/release. El spike macOS/Streams VAN-734 permanece separado.

> **Seguimiento obligatorio en [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192).**
> Abrir tarea y proyecto antes de ejecutar; actualizar y releer al empezar,
> bloquear, entregar y verificar merge. [Contrato](../notion-transition.md).
> Este handoff conserva evidencia técnica fechada; sus estados antiguos no
> sustituyen el estado vivo ni autorizan nuevas tareas. Enlazar las nuevas entradas a Notion.

## VAN-733 — Quality Linux y dependencias nativas de Wails (2026-09-20)

[Tarea Notion](https://app.notion.com/p/3e1e51695c65819fbf23edeb5957cbcd),
puente técnico GitHub #1296, rama
`vantareapp/isa-1296-quality-linux-wails`, base `nightly@8a0620e8`.

La PR documental #1295 demostró que `quality-check (ratchet)` alcanza cero
hallazgos `NEW`, pero `govet/linux-dev` y `deadcode/linux-dev` terminan en
`ERROR` porque el runner no prepara GTK4/WebKitGTK 6.0 para el grafo Wails.
Isaac aprobó conservar la cobertura Linux e instalar las dependencias nativas
en `quality-check` y `quality-audit`; no se excluirán paquetes, no se usará
GTK3 y no se tocarán baselines. Diseño versionado en
`docs/specs/2026-09-20-quality-linux-wails-analysis-design.md`.

Isaac aprobó la especificación y el candidato quedó implementado en
`6275db0c`: ambos jobs instalan las dos bibliotecas y exigen que `pkg-config`
las resuelva antes de los analizadores. Una regresión de contrato falló primero
en los dos jobs y pasa tras el cambio. No cambia baselines, versiones,
selección de paquetes ni semántica del ratchet.

Evidencia local: frontend build PASS; ratchet 29/29; negative 24/24; doctor
sin issues; roadmap digest 23/23, contrato 21/21 y artefacto `--check` PASS.
El validador contra la issue viva confirma exactamente
`milestones:quality-linux-analysis`.
El check completo local tiene cero `NEW`, cero errores de integridad y termina
`REVIEW_REQUIRED` por los dos paths de política modificados, que es el estado
esperado del candidato. El hito `quality-linux-analysis` permanece descrito
como candidato pendiente de integración.

PR draft #1297 abierta a `nightly`. En Ubuntu, el run `35516591473` instala y
verifica GTK4/WebKitGTK 6.0; `govet/linux-dev` termina PASS con cero hallazgos y
`deadcode/linux-dev` PASS con 3742 hallazgos informativos. Todos los analizadores
quedan con cero `NEW` y sin errores de integridad; el único motivo del agregado
`REVIEW_REQUIRED` son `.github/workflows/quality.yml` y
`tools/quality/tests/test_negative.py`, ambos paths de política modificados por
este arreglo. El run bloqueante `35516591462` pasa la topología, contratos,
tests, frontend, Wails Windows y advisories. Los avisos futuros sobre Node 20 y
la migración de `ubuntu-latest` a Ubuntu 26 quedan fuera de VAN-733 y no cambian
estos resultados.

Isaac autorizó la integración el 2026-09-20. En el momento de este cierre
documental todavía no se ha hecho merge ni promoción; después de verificar el
merge se registrarán SHA/canal en Notion y se reejecutará #1295 para demostrar
el PASS ordinario sobre `nightly`.


## VAN-725 — Depuración documental del repositorio (2026-09-14)

[Tarea Notion](https://app.notion.com/p/3dbe51695c658147aec0cf0aee3f3bb9), puente técnico GitHub #1256. Base nightly `60b47b7c`, rama `vantareapp/isa-1256-documentacion-vigente`. [Informe y evidencia](../../analysis/documentation-audit-2026-09-14.md), [inventario de 994 textos](../../analysis/documentation-audit-2026-09-14.tsv).

Se consolidan las entradas y 21 documentos sustituidos; el contenido anterior queda en Git por SHA. Las pasadas corrigen Wails, Studio/autoguardado, Workshop V2, OBS/Engineer SSE, transporte y autoridad LMU, Strategy/Analysis, Launcher, Billing, versionado y releases. Se conserva historia con ámbito explícito. Retirados dos logs y la skill vantare-core desautorizada. Sin código productivo ni cambios de gates; el hito documental sigue plan.

Revisión independiente final PASS documental acotado, sin hallazgos accionables en el diff examinado. 115 tests de digest/contrato/notas/topología PASS; inventario de 994 rutas/hashes y barrido de 1.099 enlaces/126 anclas sin destinos ausentes. No se ha probado Windows/LMU/OBS ni Billing remoto.

La CI del primer commit documental falló en `TestRuntimeRoutesActionsButKeepsThemDisabled` (voiceinput, timeout 30 s); ese código/test no cambia frente a la base. No se diagnostica aquí la causa ni se declara resuelto. El commit intermedio 45278c17 también detectó dos frases literales del runbook exigidas por el gate: restauradas sin tocar el test, con 45 casos PASS. La integración permanece bloqueada hasta pasar los gates aplicables. Notion conserva estado, SHA, PR y CI final observados; no hay merge ni promoción.

## VAN-724 — Notion obligatorio para todos los agentes (2026-09-14)

[Tarea principal](https://app.notion.com/p/3dbe51695c658138b19fe81c730d89a2).
Puente técnico CI: GitHub #1213, rama `vantareapp/isa-1213-notion-primary-workflow`,
base nightly `837a03d1457e4c675ff8a44977baf79ab294f5e3`.

Isaac corrige la política anterior: Notion es la entrada y el seguimiento principal
inmediato, también para issues existentes. Se exige lectura y escritura verificada
al empezar, bloquear, entregar y verificar merge. Los AGENTS, plantillas e índices
se alinean; el hub original contiene las bases. No hay sincronización automática.
El corte técnico exclusivo sigue pendiente: los gates ISA/GitHub no se cambian.
Evidencia de revisión, checks, PR y SHA integrado se registra en la tarea Notion.
El registro de #1189 siguiente conserva la decisión histórica, sustituida por esta.

## ISA-1189 — transición a Notion (2026-09-12)

Isaac aprueba Notion como autoridad de desarrollo después de cerrar las entregas
activas aceptadas e integradas en nightly, sin esperar testers/release. Autoriza
mergear esta preparación documental a nightly. Estado del corte y lote único:
[notion-transition.md](../notion-transition.md). Revisión documental individual:
[notion-document-audit.md](../notion-document-audit.md).

Se prepara la entrada raíz de agentes, se enrutan los documentos normativos y
prompts al contrato por fases, se distinguen guías históricas y se retiran
referencias operativas residuales a Linear. No se renumeran IDs históricos.
Notion tiene portada y cuatro bases iniciales enlazadas en el contrato; no hay
importación completa ni sincronización activa. Gates productivos sin cambios.

Siguiente agente: cerrar/reconciliar el lote y, en paralelo mediante tareas de
migración trazadas, importar y verificar el histórico, completar esquemas/vistas
y adaptar controles de tareas, ramas y releases antes del corte. No ampliar
programas de producto ni cerrar PR ajenas por su etiqueta. Registrar SHA/CI y
nivel realmente alcanzado en la PR de #1189, que es la evidencia remota de esta
entrega; su merge no cumple las puertas pendientes de activación.

## ISA-1171 - Roadmap de etapas hacia beta pública y lanzamiento

Decisión de Isaac 2026-09-11: la beta pública es un reinicio de la línea
v0.1.0.0; la línea v0.1.x actual es formato de desarrollo y la documentación
pública se reinicia antes de la apertura. Entregado en la rama
`vantareapp/isa-1171-roadmap-beta-publica-lanzamiento` (PR #1172 draft a
nightly, sin promoción): documento interno
`docs/plan-beta-publica-y-lanzamiento.md` con etapas 0–5, rangos de versión,
gates por etapa, matriz de módulos de lanzamiento y decisiones pendientes;
`plan.md` añade las fases `insiders-program`, `public-beta`,
`release-candidate` y `launch`, retitula `beta-foundation` a Beta inicial y
renumera etiquetas de `engineer`/`ecosystem`; nueve hitos `plan` nuevos.
Diff semántico verificado = los 16 IDs declarados. Digest regenerado desde
`origin/nightly`; 23 tests del parser PASS y `--check` sin cambios. Segundo
corte: sección "Criterios exactos de subida de versión" — tipos de bump,
instrumento Gate Review (issue por transición, periodos sin regresión 7/14/21
días, milestones de GitHub por versión), criterios medibles por transición
0.1→0.2 … 0.9→1.0 y mecánica operativa del bump (version:sync, tag en master,
hotfix por 4.º segmento). Pendiente: review de Isaac y decisiones abiertas
listadas en el documento (versión de apertura, pago día 1, precios vigentes,
firma, multisim, Linux, voz).

## ISA-1061 - Candidato revisado; validacion visual final pendiente

Isaac aprueba el recorrido completo. Rama aislada desde ISA-1058 591b48b7.
Automatizacion Windows existente (lector diario 03:00) ha recogido el horario
8-15 septiembre con 11 series el dia5; no faltaban datos, faltaba avisar y
la instancia anterior tenia otra bandeja. Se reutiliza el flujo existente.
Aviso persistente Owner, enlace a candidato, aceptar/publicar con ACK correlacionado.
Producto74400917 ACCEPT, 147 focales/Go/build/lint/44 roadmap PASS.
Suite completa3309 PASS/2 omitidas/1 fallo P99 (repeticion aislada PASS).
Wails confirma aviso y candidato real8-15 septiembre; detecto fuente recortada.
Arreglo CSS compilado/revisado; nuevo arranque bloqueado por revision automatica
de permisos, queda GREEN visual final pendiente. Sin publicacion real,
merge ni release. Documento: docs/analysis/ISA-1061-calendar-owner-review.md.

## ISA-1058 - Eje horario de Calendario

Candidato aislado sobre ISA-1057 dd5dc1d7. Solo el modelo de Calendario ajusta
la densidad de etiquetas; test real de geometria RED/GREEN (12 combinaciones).
152 focales PASS/2 externas omitidas. Build/lint PASS, fullfrontend 3302 PASS/2 omitidas. Review ACCEPT bfea3baa. Wails 1264x761: cero solapamientos en 6/12/24h. Sigue pendiente horario vigente para completar C1/C10/C11; no ahorro medido.
No integrado ni publicado. Evidencia: docs/analysis/ISA-1058-calendar-timeline-labels.md.

## ISA-1057 - Calendario: validacion conjunta en curso

Rama aislada sobre nightly d6d0992f. Reune los candidatos C2-C9, el nombre
Calendario y el banco de medicion; no incluye aun #1020/#1024.
142 pruebas focales PASS, 2 omitidas por artefacto externo. Build, lint, Go completo y 44 pruebas roadmap PASS. Frontend completo: 3299 PASS, 2 omitidas y 2 timeout Pedals Redline (#1025); suite no verde. Review estatica ACCEPT f8c36cc1. Banco ampliado a las cinco vistas: 16 PASS. Wails aislado autentica y actualiza estado correctamente; solo dispone de horario caducado (25 agosto-1 septiembre). Se corrige interferencia del banco con dispatch Wails; 17 pruebas PASS. Capturas anteriores contaminadas; no hay ahorro medido. Se solicita origen de horario vigente para avisos/proximas salidas.
Manifest y resoluciones: docs/analysis/ISA-1057-calendar-joint-validation.md.
Siguiente: review final del banco (19 PASS tras concurrencia RED), horario vigente para C1/C10 y despues C11. Las cinco vistas y seguimiento pasan en Wails con horario caducado; Timeline tiene eje superpuesto, registrado aparte en #1058.
No merge a nightly, release ni cambios de producto en HUD/OBS/Studio.

## ISA-1015 — rendimiento de la base, medición junto a LMU (2026-09-08)

Estado vigente: Isaac añade rapidez de arranque, pantallas, interacción,
desplazamiento y restauración al objetivo de consumo. Misma apariencia y datos;
HUD/Studio excluidos. Protocolo ampliado en el informe y roadmap, todavía sin
tiempos de navegación validados ni cortes de producto. Medir contenido utilizable,
separar primera visita/revisita y latencia visible de señal DOM. Navegación con
foco foreground; el reposo background no certifica rapidez percibida.

Tres corridas completas con LMU, 60 s warmup +180 s configurados cada una,
terminadas y cierre limpio: CPU 0,4907/0,6322/0,5718 %, memoria privada
346,33/344,25/343,35 MiB. Media entre corridas 0,5649 % y 344,64 MiB;
CV muestral CPU 12,57 %, RAM 0,44 %. No A/A formal ni ahorro. Motor 3D
atribuido 0,06407/0,06046/0,06543 %, no porcentaje total de tarjeta.
215 instantes propios, 213 GPU válidos; dos intervalos GPU excluidos.
Home background estable, Auto3/full/raf40, lmu/stale/available/sourceHz0;
no prueba conducción. LMU/Edge/Racelab conservados, consumo separado.
Crudos y resumen en results/isa1015-base-live. Tooling a185b50f subido;
60/60 tests PASS, revisión ACCEPT hasta 4000b023 y regresión decimal revisada
por padre. Smoke3 positivo; validación negativa nativa pendiente.

CI a185b50f: primer intento falla en PTT conocido #812; única repetición del
run 34166748099 pasa Go y falla en presupuesto parse de OverlayFrame v2:
1,532 ms frente a 1,5 ms, 3235 PASS/1 FAIL, hallazgo #1019 en Project Vantare.
Roadmap ampliado y regenerado, 23+21 tests PASS. Fallo anterior separado en #1018;
workflow inerte #728 persiste. Sin cambios en esas superficies ni merge/release.
Siguiente acción: atribuir arranque/preparar navegación real antes de seleccionar
una issue de corte. El historial siguiente conserva evidencia anterior y sus
pendientes se sustituyen por este estado cuando corresponda.

Decisión vigente: Isaac autoriza continuar con LMU y Edge abiertos; sustituye la
pausa sin juego del 2026-09-07. BaseRoute/A0 mide solo procesos propios; el juego
tiene CSV de contexto separado y debe conservar PID/vida durante el intervalo.
No PresentMon/ETW adicional ni control del juego. Auto admite sourceHz variable,
pero exige política estable; ops:metrics etiqueta fuente sin confundir live/stale
con menú/carrera. GPU conserva instancias por adaptador/motor, sin convertir la
suma histórica en porcentaje total. 60/60 tests del banco PASS. Dos regresiones
iniciales y dos P2 de revisión reproducidos/corregidos (primera fuente tardía y
gamePresent inicial contradictorio). Parser/diff-check PASS; cierre de revisión
ACCEPT estático de 0974d1d6. Dos smokes cancelados antes de medir por Hub no
foreground (Racelab conservaba foco), app propia cerrada y LMU/Edge intactos.
Coexistencia ahora valida los hechos nativos existentes: visible/no minimizado y
foco estable, etiquetando background/foreground y oclusión unknown. Conserva
valid original del monitor (foreground), publica criterio propio en el intervalo
y mantiene SinJuego estricto. Revisión de este criterio ACCEPT y smoke3 PASS.

Isaac aprueba auditar y medir todo salvo HUD/OBS/widgets y Overlay Studio,
preservando apariencia, capacidades y contratos compartidos. Base verificada
`origin/nightly@d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2`; rama
`vantareapp/isa-1015-base-app-performance`, worktree `C:/tmp/vantare-isa1015-base-app`.
Checkout principal y cambios previos preservados. Issue #1015, área plataforma,
estado in-progress; sin versión comprometida ni autorización de integración.

Inventarios estáticos UI/Core terminados en snapshots independientes limpios.
Tres prioridades para atribuir: Ops sin consumidor, detección repetida de build
con LMU ausente y recálculos de Carreras/calendario. No son ahorros medidos.
Informe/protocolo: `docs/analysis/ISA-1015-base-app-performance.md`.

Tooling local: build de diagnóstico desde entorno sin leer `.env`, preservación
de configuración/generado previo; SinJuego ya no cambia PATH ni consulta/limpia
ETW de PresentMon. Dos regresiones fallan contra la base; preparación inicial
44/44 PASS y revisión estática ACCEPT. Extensión base posterior: 51/51 PASS,
parser/diff-check PASS, `go test ./...` completo y build del monitor PASS.
Roadmap previo 23+21 tests PASS. A0/SinJuego sigue no publicable y exploratorio;
faltan validación Wails de la extensión, GPU por motor, control de mezcla y
lifecycle minimizado para baseline aceptable. Sin corte productivo.

Preflight real posterior: build frontend/typecheck y Go PASS, canal nightly
explícito (el script antes conservaba master). BuildChannel normalizado a
minúsculas, regresión de Nightly y flag Go; banco 44/44 PASS. Binario SHA-256
`53136de43fde4117aa96fa12512b865291ce19b0fe5bbe7c33b6fd586ea26943`.
Runtime aprobado 700201f9 verificado + handshake smoke PASS, junto al exe.
Inicio real con Owner autenticado/deviceOK, sin HUD/Studio, Auto nivel 2 y
effects full; cierre limpio. Evidencia local en `results/isa1015-preflight`.
Configs/WebView propios; auth y cachés siguen rutas productivas compartidas,
sin leer ni copiar credenciales. Escenario portable preparado, no instalación habitual.

Preparación comprometida y subida en `2994de6e`; PR borrador #1017 hacia nightly.
Contrato exacto de roadmap contra issue #1015 PASS. Preparación inicial e93c7845
subida con CI remoto PASS (run 34161443366, gates de promoción/bloqueantes y
GitGuardian). Código ampliado hasta 3abe2b16, seguido del cierre documental;
consultar PR #1017 para SHA/CI de esa entrega posterior. No equivale a integración.
Testing Center agent fix sigue fallando en pushes sin jobs/check-runs (run
34164832100 sobre 29efba6c y anteriores): coincide con la issue abierta #728.
Workflows sin cambios; no confundir PASS del gate de rama con todos los workflows
verdes ni corregir #728 dentro de esta campaña.

Primera ventana de medición: Isaac declaró PC disponible y cerró LMU/otra Vantare. La tarea de
widgets terminó su turno documental. Isaac exige mantener los cinco Edge sin
ventana: no cerrarlos. Registrar sus snapshots aparte y reutilizar el binario/WebView
preparados para explorar Inicio (A0/SinJuego/Forzar, 60 s warmup + 180 s captura,
hygieneForced=true, publishable=false). No descontar interferencia a partir de
snapshots ni convertir esta exploración en aceptación. Revisión independiente de
este primer paso conforme; CPU/RAM propias, GPU suma de motores solo diagnóstica.
Primera captura completada: run1/a0-20260907-231514.csv bajo
results/isa1015-base-home, 60 s warmup + 180 s configurados; 80 muestras,
cadencia media 2,252 s. CPU propia 0,1907 %, memoria privada 342,69 MiB,
working sets 533,13 MiB (suma con páginas compartidas), VRAM 74,23 MiB.
GPU suma motores 0,0836 solo diagnóstica. Exe/dist estables y cierre limpio.
Edge mismos cinco PID, 0,046875 s CPU en intervalo ampliado de 263,141 s;
no se descuenta interferencia. No A/A, no aceptación ni ahorro.
Perfil Go de 120 s inconcluso (GetMessage domina las muestras, sin delta CPU del
mismo intervalo). Perfil JS optimizado ilegible descartado; se construyó copia
ReadableFrontend separada, SHA 01f1157e, y se restauró el dist optimizado f1a69bb8.
Perfiles legibles de 60 s: script Inicio 0,138 s, Mes 0,196 s, Timeline 0,314 s;
cero tareas largas. Calendario backend real 11 series, Mes 42 celdas y Timeline
660 salidas. RAf del propio diagnóstico no es coste productivo ni FPS presentado.
No hay todavía evidencia suficiente para elegir un corte. Ver informe para hashes,
crudos, límites y métricas; no comparar esta build con el CSV optimizado.

Worker nativo: commit 116250cf revisado por el padre e incorporado como 7758085d;
solo dos archivos del monitor. `--surface hub` observa PID+título Vantare Hub,
visibilidad/foreground, minimizado y presencia; oclusión unknown, overlay intacto.
El banco integra `-BaseRoute home|month|timeline` sobre A0/SinJuego, observador
pasivo de ruta/viewport/Auto y metadatos base. Cambios intermedios o silencios
de performance superiores a 3 s invalidan; Forzar/SinJuego sigue no publicable.
La revisión encontró dos P2: ida/vuelta Mes-Timeline invisible al observar solo
aria-current, y apertura/cierre de HUD entre extremos. Ambos reproducidos con el
observador real en fixtures DOM/event-bus (RED), corregidos observando atributos
de selección y overlay:status (GREEN); las interacciones invalidan sin guardar
su contenido y se desmontan todos los listeners. Revisión independiente de cierre
ACCEPT estático sobre 3abe2b16: ambos P2 cerrados, sin nuevos P1/P2 en el diff.

Pausa runtime: LMU PID 29092 se reabrió a las 23:40:05 CEST, después de todas las
capturas/perfiles y del cierre del diagnóstico (23:34:33). La tarea de widgets
está activa. No cerrar LMU ni los cinco Edge. Se preguntó disponibilidad de nuevo;
guard BaseRoute comprobado con LMU real: rechaza antes de lanzar Vantare.
Esta pausa fue sustituida por la autorización anterior. Siguiente con LMU abierto: smoke Wails positivo y negativo del
monitor/observador, una corrida completa, después A/A y control GPU/mezcla.
El run1 no recibe garantías retroactivas. Los cinco experimentos sin mejora no
han empezado ni se reinicia presupuesto. Los fallos CI históricos de la base
siguen separados; SQLite pasó en esta suite local. Sin merge, promoción ni release.

## ISA-1022 — nombre Calendario (2026-09-08)

Isaac solicita renombrar la pestaña Carreras a Calendario. Base nightly d6d0992f,
rama vantareapp/isa-1022-calendar-name, worktree C:/tmp/vantare-isa1022-calendar-name.
Cambio de texto en 16 catálogos (shell/races/home/strategy, ES/EN/PT/IT) y etiqueta
legacy de navegación; roadmap actualizado y generado. Se mantienen claves, rutas,
preferencias, vistas y datos. No se sustituyen menciones genéricas a competiciones.
Sin dependencia de los candidatos de rendimiento #1017/#1021 ni cambios HUD/Studio.
Dos expectativas existentes de tests actualizadas al nombre nuevo, sin alterar
las aserciones de navegación. 3236/3236 tests frontend, 415 archivos PASS;
typecheck/build/lint y 23+21 tests de roadmap PASS. Diff revisado y limpio.
Primera suite falló por el nombre anterior del botón; resultado conservado junto
al PASS final en results/isa1022-checks. AbortError de teardown y aviso de chunks
grandes sin fallo final. Sin Go modificado; no se repite Go local.
22 archivos modificados, ninguno creado/movido. Entrega draft; CI remoto y
verificación Wails pendientes. Ver #1022 para SHA/PR/CI actualizados.
Manual: revisar pestaña/títulos y enlaces de Inicio/Strategy en los cuatro idiomas.
Sin merge, promoción ni release.

## ISA-1055 — avisos nativos y permisos (2026-09-08)

C6c reutiliza notify.Service/SystemEnabled/autorización/minimizado y comprueba
acceso nativo al seguir y emitir recordatorio. Roles separados de planes, estado
active/grace; Free/bloqueado/desconocido no concede acceso. Payload compartido
conservado para autorizados. Gate adelantado al cálculo/dedupe para no consumir
avisos antes de validar cuenta; regresión por canales RED. Build y módulos
Calendar/license/notify/app y full Go PASS; 35 focales UI/i18n, roadmap23+21
y build PASS. Fullfrontend3240PASS/1timeoutPedals #1025; review ACCEPTa7454887. Base C6b a9a17cf3, rama vantareapp/isa-1055-calendar-native-reminders.
Informe ISA-1055 en docs/analysis; diferencia gate UI legado/nativo documentada.
C9 candidato #1054 aceptado; falta validación conjunta Wails y A/A–A/B. Sin merge/release.

## ISA-1050 — confirmación de seguimiento (2026-09-08)

C6b: resultado correlacionado tras persistencia, UI pendiente/sin doble clic,
éxito confirmado y error recuperable. Free bloqueado como antes. 94 focales
frontend, módulo app completo, build/tipos/lint/roadmap PASS. Full frontend
3240 PASS, un timeout TrackMap #1025. Review P2 de expectativas event-only
reproducido (7 RED) y corregido; review ACCEPT 81ffddfa y full Go PASS.
Base C6a e9dc8ef9; C6a aceptado y full Go PASS, candidato #1051. Rama
vantareapp/isa-1050-calendar-follow-confirmation. Informe ISA-1050 en docs/analysis.
Quedan C6c permisos/avisos nativos, C9, Wails y rendimiento. Sin merge/release.

## ISA-1049 — seguimiento atómico ante error (2026-09-08)

C6a de #1027: cuatro operaciones restauran memoria/Updated al fallar escritura;
el reintento persiste realmente. Cuatro regresiones RED→GREEN, módulo PASS.
Base C5 9f3c5447, rama vantareapp/isa-1049-calendar-follow-persistence.
Build/full Go/roadmap/review pendientes. Informe ISA-1049 en docs/analysis.
C8 aceptado en #1048; C7 #1047 CI verde. C5 #1045 CI roja por parser p99 #1019.
Quedan C6b UI/permisos, C9, Wails y A/A–A/B. Sin merge o release.

## ISA-1027 / ISA-1029 — Calendario, plan aprobado y primer corte (2026-09-08)

Isaac aprobó ejecutar el plan `docs/analysis/ISA-1027-calendar-plan.md`.
El expediente #1027 recoge ocho hallazgos y sus reproducciones; no es una
certificación visual Wails. HUD/OBS/Studio están excluidos de cambios.

Primer corte #1029: `vantareapp/isa-1029-calendar-retention`, worktree
`C:/tmp/vantare-isa1029-calendar-retention`, base nightly `d6d0992f`.
Regresiones RED verificadas para fallo remoto, proyecto remoto vacío,
publicación anterior/futura, reinicio, pérdida de vigencia y fallo de escritura.
GREEN: `go test ./internal/calendar/...` PASS. El documento guarda metadatos
aditivos, conserva horario/seguimientos al fallar red o arrancar y restaura la
memoria anterior si no puede persistir. Los eventos compartidos se conservan.
Build frontend PASS para el embed; `go test ./...` PASS y roadmap 23+21 PASS.
Primera revisión independiente: dos P2 reproducidos y corregidos (orden de
publicaciones de la misma semana mediante PublishedAt y protección de archivos
legacy ante publicación futura). Módulo Calendar y `go test ./...` GREEN;
revisión independiente final 01a6b613 ACCEPT para C2, sin P1/P2 nuevos;
ver #1029 para la evidencia de cierre, commit, PR y CI exactos.

Pendiente: propagar vigencia por normalización/frontend (C3), errores/acuse (C4),
recordatorios (C5/C6), fechas/vistas/detalle (C7–C9), Wails representativo (C1) y
banco A/A–A/B (C10/C11). #1020/#1022/#1024 son candidatos separados que no se
presuponen integrados. Sin porcentaje de ahorro global ni validación de conducción.
Sin merge, promoción o release; el checkout principal y LMU/Edge se preservan.

## ISA-1039 — recordatorios de series (2026-09-08)

C5 de #1027 expande solo la ventana de avisos de las series seguidas y corrige
truncamiento de minutos. RED inicial y de review reproducidos; módulo Calendar GREEN.
Poda dedupe de ocurrencias iniciadas, conserva seguimiento individual, sin tocar HUD/Studio.
Rama vantareapp/isa-1039-calendar-series-reminders ahora sobre C2 e9321068,
dependencia necesaria para vigencia. Rebase local sin integración de nightly;
documentos de ambos cortes conservados y JSON regenerado. Build y roadmap PASS;
Go completo final PASS y review 6094c44e ACCEPT. Informe ISA-1039 en docs/analysis.
C2/C3/C4a/C4b son candidatos #1031/#1034/#1036/#1040, sin integrar. C6–C11,
recorrido Wails y banco de rendimiento continúan pendientes. Sin merge ni release.

## ISA-1052 — detalle y selección (2026-09-08)

C9: sesiones estimadas marcadas con ~ y explicación; selección ligada a serie,
instante y destino, validada con el motor/publicación actual. Nuevo target limpia
filtro/selección; no pierde horas históricas válidas. RED 7+2, focal133PASS/2skips,
build/tipos/lint/roadmap PASS; review ACCEPT3c85e2b8. Full frontend3276PASS,
2skips y4timeouts externos (#1025). Base C8 ec3a75f5, rama
vantareapp/isa-1052-calendar-detail-selection. Informe ISA-1052 en docs/analysis.
C6a/C6b aceptados, full Go PASS, candidatos #1051/#1053; C6c y Wails/rendimiento
pendientes. No merge/release, HUD/Studio intactos.

## ISA-1046 — clasificación de Mes (2026-09-08)

C8 de #1027 evita que las ocurrencias generadas aparezcan como especiales.
Identidad/fuente exacta y todas las series publicadas, sin usar título/filtro activo.
RED tres fallos; GREEN siete portables y contraste opt-in con 4596 eventos Go,
ocho PASS. Sin mutar documento ni tocar HUD/Studio/CSS. Base C7 411b5538;
C7 aceptado en review y candidato #1047, no integrado. Rama
vantareapp/isa-1046-calendar-month-classification. Review halló P2 Mes → Día:
cuatro regresiones RED, corregidas; especiales presentes con/sin series y sin
duplicar ocurrencias. 113 focales PASS, build/tipos/lint/roadmap PASS; review ACCEPT 6a1daf60.
Suite completa 3269 PASS, 2 skips, 3 FAIL fuera de Calendario: parser p99
(#1019), Relative Crystal 30 s y Pedals Redline missing 20 s (#1025).
Informe en docs/analysis/ISA-1046-calendar-month-classification.md.
Continúan C6/C9, Wails y medición A/A–A/B; sin merge ni release.

## ISA-1044 — días locales y slots (2026-09-08)

C7 de #1027: fechas civiles con setDate; cantidad por ventana real en vez de ocho;
hora repetida conserva instante y se identifica con UTC. Base C3 317ff133,
sin integración. Rama vantareapp/isa-1044-calendar-local-days. RED seis fallos,
focal 124 PASS y matriz UTC/Madrid/Nueva York. Checks finales/review en curso.
Informe docs/analysis/ISA-1044-calendar-local-days.md. Sin CSS, HUD o Studio.
C2/C3/C4a/C4b/C5 candidatos #1031/#1034/#1036/#1040/#1045; quedan C6, C8/C9,
Wails y rendimiento A/A–A/B. No merge ni release.

## ISA-1032 — vigencia en Inicio y Calendario (2026-09-08)

Corte C3 del plan #1027 aprobado por Isaac, dependiente de #1029 / PR #1031.
Rama `vantareapp/isa-1032-calendar-validity`, worktree
`C:/tmp/vantare-isa1032-calendar-validity`, base nightly `d6d0992f`.
El corte conserva schedule en el store y limita previews/motor a [inicio, fin).
Documentos antiguos sin vigencia verificable no producen nuevas salidas.
Regresión con el seed real: seis casos RED→GREEN (metadatos, desconocido,
caducado, preview inválido, cinco vistas y detalle). 112 focales PASS;
typecheck/lint/build PASS. Suite completa 3243 PASS/2 FAIL: timeouts 20 s en
PedalsRedline excluido, antecedente #1025; no se declara verde ni se debilita.
Go completo y roadmap 23+21 PASS. Review inicial P2 de conteo mensual en día
parcialmente vigente: RED 12 frente a 3; GREEN 3. Revisión final fc12ceee ACCEPT
para C3 sin nuevos P1/P2; build final PASS.
evidencia final en docs/analysis/ISA-1032-calendar-validity.md y #1032.

No integrar este frontend antes del backend #1031: la nightly base aún no emite
el metadato. C4 aporta estados visibles/acuse; C5–C11 siguen pendientes.
F4/F5/F6 de la auditoría no se declaran resueltos aquí. Sin Wails real ni ahorro
global, HUD/Studio intactos, sin merge o release. La PR #1031 tiene revisión
independiente C2 ACCEPT y Go/build locales PASS; CI remoto se verifica aparte.

### Seguimiento de review C4b (2026-09-08)

ISA-1035 añade snapshot local del estado de refresh para el shell que se monta
después del arranque. No repite red. Regresión RED/GREEN del puente PASS;
revisión 749d7761 ACCEPT y Go completo PASS. Continúa en el mismo corte C4a,
sin integración; C4b ISA-1037 consume calendar:refresh:status:get/status.

## ISA-1035 — resultado de actualización de Calendario (2026-09-08)

C4a del plan #1027 aprobado. Rama `vantareapp/isa-1035-calendar-refresh-result`,
worktree `C:/tmp/vantare-isa1035-calendar-refresh-result`, base nightly d6d0992f.
El puente anuncia `calendar:refresh:started`, luego `calendar:loaded` si hay éxito
y `calendar:refresh:result` con `{ok:true|false}`. No expone detalles privados del
error. El arranque y la acción manual usan el mismo recorrido, serializado y con
contexto de cierre para la consulta remota. Tests de éxito/fallo RED→GREEN.
Bridge, build embed, Go completo y roadmap 23+21 PASS. Review independiente
b15c7f76 ACCEPT para C4a sin P1/P2. Evidencia docs/analysis/ISA-1035-calendar-refresh-result.md.

La conservación depende de C2 #1029/PR #1031; C3 #1032/PR #1034 limita vigencia.
Ambos tienen review independiente ACCEPT y checks locales focales/build/Go PASS;
#1031 CI falla en SQLite conocido #811 y la suite frontend de C3 tiene dos
timeouts Pedals conocidos #1025. No afirmar conjunto verde. C4b añade la UI de
estos estados; C1/C5–C11 pendientes. HUD/Studio, LMU y Edge intactos; sin merge/release.

## ISA-1037 — estados de Calendario (2026-09-08)

C4b de #1027: estados independientes del documento, refresh de una petición,
sin éxito anticipado y aviso de vigencia en la descripción existente. Cuatro
idiomas, sin CSS. Depende de #1029/#1032/#1035, todos candidatos sin integrar.
Rama vantareapp/isa-1037-calendar-status-ui desde nightly d6d0992f.
RED inicial siete fallos; review detectó dos P2, reproducidos y corregidos.
GREEN final 70 focales, build/typecheck/lint y roadmap 23+21 PASS; review 7a84c268
ACCEPT. Suite completa no verde: cuatro timeouts de overlays, i18n corregido;
Go completo falla deuda SQLite #708. C4a 749d7761 añade snapshot local para
recuperar resultado de arranque sin otra descarga. Evidencia y límites en
docs/analysis/ISA-1037-calendar-status-ui.md. Sin validación Wails conjunta todavía.
Pendientes del plan: recordatorios/confirmación de seguimiento, DST y slots,
clasificación de Mes, detalle, Wails real y medición A/A antes de más optimización.
No se toca HUD/Studio ni el checkout principal; no merge ni release.

## ISA-1011 — runtime de release (2026-09-07)

Nightly.15 no se publicó: el segundo intento 34062671599 pasó tests pero
falló en trust del runtime por toolchain rolling. Isaac autoriza corregirlo.
Se conserva el digest 700201f9 y se verifica la unidad publicada de Nightly.14
antes de empaquetarla. Descarga, extracción, verificación y smoke locales PASS.
Detalle en docs/analysis/ISA-1011-runtime-release.md; CI y release pendientes
en #1011/#1009. Sin cambio de código Go, secretos, dependencias ni master.

## ISA-1009 — publicación Nightly.15 autorizada (2026-09-06)

Isaac autoriza la release y la integración de Chromium (#1008, ac617491).
Se prepara el manifiesto v0.1.0.7-nightly.15 y su resumen del conjunto
#1001/#1003/#1006. E20 permanece opt-in y no se certifica CPU inferior al 2%.
Rama vantareapp/isa-1009-nightly-15; base ac617491. Publicar únicamente
mediante release.yml desde nightly, con SHA exacto, gates y seis artefactos
verificados. Estado final y enlace de ejecución en la issue #1009.
No hay promoción a testers/master. No se modifica el checkout principal.

## ISA-1007 — nueva build nightly y Chromium requerido (2026-09-06)

Build autorizada desde59185071; run34049646223 falló por Chromium ausente en
las pruebas visuales. Se prepara el mismo paso bloqueante de instalación que
usa branch-channel-gates, sin excluir tests ni cambiar permisos o secretos.
Regresión RED/GREEN y contrato roadmap. Rama vantareapp/isa-1007-nightly-build,
worktree C:/tmp/vantare-isa1007. Integración del fix y relanzamiento pendientes;
publicación de canal consultada al usuario, no asumida. Sin artefactos aún.
## ISA-900 — preferencias y prueba de notificaciones

- Rama aislada `vantareapp/isa-900-reparar-preferencias-notificaciones`, creada
  desde `nightly@1c45cc82` y rebasada de nuevo para integración sobre
  `origin/nightly@36ec5fdd7e9914638778ba946373b43a52fd3749`.
- Command Orbit ya aplica `updatesMuted` al pill del actualizador: silenciarlo
  lo oculta sin sustituir ni inventar el estado real del updater.
- Ajustes → Aplicación recupera la prueba nativa de Windows y expone envío,
  aceptación del backend o error. «Aceptado» no se presenta como prueba de que
  Windows haya mostrado visualmente el toast.
- Decisión de producto: Spotter sigue siendo overlay/audio de carrera y queda
  fuera de los canales de notificación, del centro y del historial.
- Código rebasado en `2096fcef`; TDD focal 35/35, suite frontend 3.191/3.191,
  typecheck, build, lint focal y contratos de roadmap 23/23 + 21/21 en verde.
  El lint global conserva un error ajeno en
  `car-damage-numbers-view-model-v2.ts:93`. El PR draft #907 es la única ruta
  hacia `nightly`. La revisión adversarial autorizada para integración concluye
  APPROVE con P0=0, P1=0 y P2=0; como riesgo residual quedan el smoke visual del
  toast en Wails y que la regresión del mute prueba la política pura, no una
  shell completa. Los checks remotos anteriores quedaron obsoletos al rebase y
  deben repetirse sobre el nuevo HEAD antes del merge. No hay aún integración
  en `nightly`, promoción posterior, release ni anuncio.

## ISA-843 — columnas de Próximas alineadas

- Rama aislada `vantareapp/isa-843-centrar-columnas-proximas`, basada en
  `origin/nightly@8a90c3a7837166ffec6943c839f7cb31cbf11b31`.
- En Carreras → Próximas, hora, duración/setup y licencia usan tracks estables
  y centran su contenido. Ya no cambian de eje según 20/30/60 minutos ni según
  Bronze/Silver/Gold.
- El harness real de Carreras midió nueve filas: antes la hora variaba entre
  673,06 y 692,39 px; después todas coinciden en 641 px. A 768 × 700, las nueve
  filas mantienen los tres ejes y `overflowX = 0`.
- Evidencia local: test focal 18/18, suite frontend 385 archivos/2.953 tests,
  typecheck, build, lint focal y design-system PASS. El harness visual pasa en
  1920 × 1080 y 1920 × 900 con gates de ejes compartidos y cero desbordamiento
  de fila; la inspección colaborativa adicional pasa a 768 × 700.
- Segunda pasada tras feedback de Isaac: los chips comparten ancho y el track
  de licencia gana aire propio. En 640/768 × 700, el mínimo visible entre
  duración y licencia sube de 18,5 a 26,31 px; centros y anchos no varían entre
  filas y `overflowX` continúa en cero. El harness impide volver a menos de
  32 px sin escalar, variar el ancho del chip o desalinear un eje.
- Implementación inicial en `a99c3f46`; segunda pasada incluida en el HEAD de
  la PR #846 hacia `nightly`. Isaac aprobó expresamente la promoción el
  2026-08-26; la issue #843 conserva el SHA integrado y los checks remotos del
  cierre. Esta autorización no alcanza `testers`, `master` ni una release.

## Decisión comercial vigente — ISA-315

- Hito de agosto: Overlay Studio V1 estable en `testers` antes del 2026-08-31.
  No equivale a promoción a `master` ni release Stable de toda Vantare.
- La migración de Vantare V2 a la raíz bloquea el lanzamiento completo, no la
  estabilización de Overlay en Testers. Se ejecuta y reverifica después del
  hito de agosto.
- Ventana comercial objetivo: 2026-09-22 a 2026-09-30, por invitación y
  cohortes. Overlay Studio V1 es la propuesta principal; Engineer, Strategy y
  Analysis deben mostrarse claramente como Beta/Preview mientras continúan.
- La venta sigue **NO-GO** hasta cerrar raíz, compra/licencia end-to-end,
  artefactos, updater/rollback, soporte y la decisión pendiente sobre firma.
  El plan no autoriza dinero real, producción, publicación ni comunicación.
- Plan canónico y gates:
  `docs/overlays-studio/overlay-studio-v1-commercial-launch-plan.md`.

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md` y
  `execution-policy.md`.
- Billing: issue/proyecto de GitHub, `docs/licensing-auth-architecture.md` y auditoría
  Polar/Supabase vigente.
- Roadmap publico: `docs/roadmap/plan.md`; Discord: `docs/discord-communications.md` y workflows actuales.
- Root: informe ISA-14 y su matriz de worktrees/rutas.
- La issue activa y su plan prevalecen sobre releases históricas.

## Estado

- ISA-246/BIL-N05 está integrado en `nightly@55fba3d`: el callback OAuth
  restaura la sesión del WebView y permite revalidar sin reiniciar.
- ISA-247/BIL-10C está en implementación aislada: roles operativos, leases,
  retiro legacy controlado, UI separada y herramienta administrativa. Ningún
  apply remoto se ejecuta desde la rama.
- Billing: BIL-01..BIL-07 ya estaban en `nightly`; este corte BIL-N02 incorpora
  BIL-08 tras validación acumulativa. Venta pública continúa **NO-GO**.
- Account/Profile: issue histórica ISA-12; proyecto pendiente.
- Calendar/Settings/Installer/Roadmap/Migración: proyecto o reconciliación
  pendientes. ISA-845 tiene implementados el parser del mensaje Discord
  oficial, seed de 2026-08-25, revisión owner y lector REST separado; su vía
  de integración inicial es el PR #881 contra nightly. El runtime local se
  validó con el canal configurado: 1 candidato de 11 series en la bandeja
  instalada y la tarea diaria terminó con código 0; no hay auto-publicación,
  secretos en Desktop, deploy, testers/master ni release.
- Root migration: auditoría ISA-14, bloqueada por worktrees activos.
- `nightly` y `testers` existen; el flujo vigente es issue → `nightly` →
  `testers` → `master`.
- Base ISA-212: `nightly@b8ffd7c6c824f17ebcc09a5e44bf4ac12bafb7c5`.
- Promoción vigente: ISA-212/BIL-N02 hacia `nightly`; `testers` y `master`
  quedan fuera.

## Cuenta

Perfil local, avatar procesado, Google OAuth/email magic link, modo gratuito sin
login, borrado local/remoto separado, un dispositivo activo, sesión offline
hasta expiración y secretos en almacenamiento protegido. SR/DR requiere
auditoría clean-room de DoX/SimHub y fuente LMU+Steam.

## Calendario

Feed oficial versionado/firmado. Isaac pega RaceControl semanal y un agente lo
estructura con validación. UTC interno; zona local visible. Carreras guardadas,
recordatorios, Launcher/Overlay/Strategy y nota. Servicio ligero solo con
recordatorios futuros y permiso. ISA-845 añade un lector Discord restringido a
  guild/canal (con autor o webhook opcionales) que deja candidatos locales para
  revisión owner. El comando admite ejecución única diaria y guarda el token
  fuera del repositorio en el almacén protegido del usuario; la tarea local
  está registrada a las 03:00 con la misma cuenta interactiva;
publicar sigue pasando por las RPC existentes y la comprobación server-side.

## Ajustes

General, Apariencia, Idioma/región, Cuenta/licencia, Launcher, Overlays,
Telemetría, Engineer/audio/voz, Strategy, Calendario, Hotkeys, Privacidad,
Actualizaciones, Diagnóstico y Acerca de. Scope global/perfil explícito;
import/export sin secretos; reset no borra datos sin selección.

- ISA-1381 implementa en rama aislada paletas Vantare, Océano e Iris para toda
  la interfaz, incluido el chrome de Overlay Studio, con modo claro, oscuro y
  sistema independiente. Se guardan en claves locales nuevas; `vantare.theme`
  y los diseños de widgets permanecen separados. La referencia visual son las
  tres capturas de T3 Code aportadas el 2026-09-24. La revisión visual en
  navegador mock comprobó Ajustes y Studio y los seis pares de tokens; 484
  archivos de tests frontend y 4 presupuestos de frames pasaron. El PR draft
  #1384 apunta a `nightly` desde `vantareapp/isa-1381-temas-paleta-ui`. Los
  checks de calidad, ruta y gates, incluido el build Wails de CI, pasaron para
  `dea1d926`. El 2026-09-25 se compiló la app Wails de producción desde ese
  commit con el `.env.local` autorizado del checkout principal, sin copiarlo ni
  mostrar sus valores; se retiró el archivo Go temporal de configuración tras
  la build. En la ventana Wails real (1280×800) se comprobaron Ajustes en
  Océano/Claro e Iris/Oscuro, y Overlay Studio con ambas combinaciones: el
  chrome cambia y el diseño de los widgets se conserva. La vista del canvas
  usó el modo Mock; esto no valida telemetría LMU, login ni licencia. Se detectó
  un solapamiento de la cabecera de Studio con el selector de perfil, registrado
  por separado como #1387. No hay promoción ni release.

- El 2026-09-25 Isaac amplió #1381 con dos variantes visibles por paleta,
  contraste, opacidad y tipografías, según nuevas capturas de T3 Code. La rama
  añade la sección propia Ajustes → Apariencia y conserva Zoom, idioma y
  densidad en Aplicación. El contraste ajusta texto secundario y bordes de
  Command Orbit; la opacidad ajusta paneles y cabecera; fuentes de interfaz y
  cifras tienen vista previa. Las preferencias nuevas son locales y no tocan
  `vantare.theme` ni los renderizadores de widgets. Suite frontend: 484 archivos,
  4.101 tests correctos, 2 omitidos y 4 presupuestos de frames correctos;
  typecheck, build y lint correctos. En Wails de producción a 1280×800 se
  revisaron Apariencia, Iris/Oscuro y los deslizadores a 120 %/100 %. El modo
  Iris/Oscuro persistió tras cerrar y reabrir el mismo ejecutable Wails. La
  compilación usó `.env.local` autorizado sin exponer valores. El gate CI de
  `0f939835` falló en `TestPlayerScriptMediaEvents/ended` por timeout de Go,
  fuera de los archivos modificados aquí. Para `1942ee1b`, los checks remotos
  de calidad, ruta, gates, pruebas frontend y build Wails pasaron; la prueba
  Go anterior también pasó en esa ejecución. El PR #1384 continúa draft y sin
  promoción.

- El 2026-09-25 Isaac pidió completar las paletas con Rosa, Bosque y Ámbar y
  añadir Grises en variante clara y oscura. #1381 y el hito público se
  ampliaron a siete paletas y catorce variantes; el selector se reparte en
  filas para conservar su legibilidad a 1280×800. Grises usa tokens neutros
  también para acentos y estados de la interfaz. Las vistas previas de otros
  temas siguen mostrando sus colores para permitir elegirlos. En la app Wails
  de producción se revisaron Grises/Claro, Grises/Oscuro, Rosa/Claro,
  Bosque/Oscuro y Ámbar/Oscuro. En Overlay Studio con Grises/Oscuro, el chrome
  es neutro y las vistas previas de widgets conservan sus colores originales.
  Los tests focales (45), typecheck, build, lint, auditoría i18n y los cuatro
  presupuestos de frames pasaron. En la suite completa pasaron 4.105 pruebas,
  dos quedaron omitidas y una prueba visual de Chromium agotó su límite de
  20 s mientras corrían build y lint; la misma prueba pasó aislada en 8,9 s.
  La app se compiló usando el `.env.local` autorizado sin exponer sus valores.
  En `3bcd253d` pasaron los checks remotos de ruta, quality ratchet y gates
  bloqueantes, incluidos Go, frontend y build Wails de Windows (runs
  `36162293379` y `36162293431`). El PR #1384 sigue draft, sin merge,
  promoción ni release. La rama de issue se reconcilió después con
  `nightly@f0ccfbf2` al avanzar la base; `plan.md` conservó los hitos de
  ambas ramas y `roadmap.json` se regeneró desde esa base.

- [VAN-769](https://app.notion.com/p/3e6e51695c6581abbcdff05e070a4a69)
  gobierna el alcance y seguimiento vivo de #1381. El 2026-09-25 Isaac
  amplió #1381 a los fondos del escenario de Overlay
  Studio y pidió corregir la tarjeta Próxima serie de Inicio. El fondo
  predeterminado `Tema actual` toma los tokens de la paleta y del modo
  claro/oscuro; el selector de la toolbar agrupa las catorce variantes fijas
  por paleta y conserva Rejilla, Degradado, Negro y los fondos propios. La
  elección manual se guarda en este equipo y persiste al volver a abrir
  Studio; si una imagen propia guardada ya no existe, vuelve a Tema actual.
  Solo cambia el escenario, no el renderizado de los widgets. El subagente
  corrigió la tarjeta Próxima serie mediante tokens de interfaz; el
  orquestador revisó el diff y la comprobó en Wails con Grises/Claro y
  Grises/Oscuro. También comprobó en Wails el lienzo de Grises/Claro y
  Grises/Oscuro con widgets rojos intactos, los siete grupos del selector,
  la selección fija Rosa/Oscuro y la persistencia de Vantare/Claro al salir
  y volver a Studio. La compilación Wails usó el `.env.local` autorizado sin
  exponer valores. Typecheck, build, lint, auditoría i18n, 52 pruebas focales
  del Studio y cuatro presupuestos de frames pasaron. En la suite local
  completa pasaron 4.116 pruebas y dos quedaron omitidas; tres pruebas de
  geometría ajenas agotaron 20 s bajo carga paralela y la prueba de Canvas
  todavía tenía la expectativa del fondo anterior. Tras corregir esa
  expectativa, las cuatro suites afectadas pasaron aisladas con un solo
  worker (25 pruebas). La rama sigue aislada y el PR #1384 sigue draft; no
  hubo merge, promoción ni release.

ISA-841 se implementó en la rama aislada
`vantareapp/isa-841-zoom-global-interfaz` y se rebasó el 2026-08-28 sobre
`nightly@d9909aef4b9f2de2b3e61ed79a3a0fd98a91b73c`; PR #847 es su única ruta de
integración. Ajustes → Aplicación ofrece zoom global
80/90/100/110/125/150%, restablecimiento y atajos Ctrl +/−/0. La preferencia
local se compone con el zoom responsive automático y, cuando el suelo de la
shell no cabe al ampliar, conserva acceso mediante desplazamiento interno.
La suite frontend completa previa al rebase pasó 2.963/2.963, además de build,
typecheck, lint focal e i18n; el lint global conservó un error ajeno a la rama
(`car-damage-numbers-view-model-v2.ts:93`, `_damage` sin usar).
La build Wails de producción configurada se abrió desde el binario de la rama
y permitió probar la interacción real. En un monitor 1920×1080, Ajustes →
Aplicación encaja sin scroll entre 80% y 125%; a 150% no hay recorte horizontal
y el contenido inferior sigue accesible mediante scroll vertical. La issue
#841 registra el SHA integrado y los gates remotos vigentes; esta autorización
no alcanza `testers`, `master` ni una release.

ISA-908 extiende el mismo control en la rama aislada
`vantareapp/isa-908-zoom-control-rueda`, nacida de
`nightly@1c45cc827e47976ed41e1f28463529c04579e806`. Ctrl/Cmd + rueda arriba o
abajo recorre los mismos seis pasos y bloquea el zoom nativo de WebView; la
rueda sin modificador conserva su scroll normal. Los deltas pequeños de
trackpad se acumulan hasta 50 px y se separan tras 180 ms de reposo. Los tests
del hook cubren dirección, límites, rueda tradicional, trackpad, persistencia
y limpieza del listener. La issue #908 y su PR registran la evidencia vigente;
no hay integración, promoción ni release autorizadas para este corte.

## Roadmap/Discord

Toda issue publicable incluye `Resumen público`. Flujo: Idea → Siguiente
actualización → En desarrollo → Testing → Por lanzar → Publicado. Progreso
ponderado, digest diario, tarjeta HTML y texto accesible. Releases, crisis y
anuncios comerciales requieren aprobación.

ISA-860 implementa en la rama aislada
`vantareapp/isa-860-roadmap-contract`, nacida de `nightly@1d3ab03`, el contrato auditable preparado para bloqueo:
Forms `required`/`not-required`, IDs semanticos, JSON derivado desde la base,
allowlist cerrada para exenciones, excepcion exacta del bot y `CODEOWNERS`.
Las labels remotas ya existen, pero el contrato no esta integrado ni activo en
la rama predeterminada. Quedan pendientes review, PR/CI, promocion autorizada a
`nightly`, paso posterior por `testers`/`master` y configurar Code Owner review
y aprobacion del ultimo push. El workflow queda en `audit` hasta inventariar y
retroclasificar las PR vivas y separar la identidad autora de la identidad
Code Owner; activar review con la unica cuenta actual bloquearia sus propias
PR. ISA-862 registra esa activacion posterior sin grandfather reutilizable.
No hay auto-merge ni credencial nueva del bot.
Evidencia local: contrato 21/21, topologia 44/44, digest 23/23 y discovers
121/121 + 108/108 en verde; `roadmap_digest.py --check` y `git diff --check`
sin errores. La revision independiente xhigh concluyo GO con P0=0, P1=0 y
P2=0 para commit/push en modo `audit`.

## Releases

Web/GitHub para instalador; app para updater. Stable para todos, Nightly para
Pro Plus y Testers para Pro Plus/Launch. Instalación atómica, rollback y
desinstalación granular. Sin firma inicial: checksums/manifests, aviso
SmartScreen y guía; nunca bypass. Master produce versión pública.

## Migración

`vantare-v2` será raíz del mismo repo cuando se cierren grandes worktrees.
Archivar primero, preservar historia/secrets, simular y probar rollback. Borrado
masivo requiere Isaac. La migración de ramas materializa issue → Nightly →
Testers → Master y actualiza CI/webhooks/updater.

## Billing

Autoridad y contrato:

- Polar posee productos, precios, customers comerciales, orders, subscriptions
  y refunds. Supabase mantiene identidad y almacenamiento operacional.
- Pro: 4,99 EUR/mes. Pro Plus: 9,99 EUR/mes. Launch Edition: 30 EUR una vez.
- Recuperación de pago: máximo 72 horas sin extender `paidThrough`; después se
  degrada a gratuito. La credencial offline de suscripción vence en la fecha
  firmada; Launch conserva su alcance perpetuo.
- Un refund total atribuible revoca únicamente su grant; refunds parciales,
  pendientes, fallidos o ambiguos no revocan acceso automáticamente.

Estado BIL-01..BIL-08:

- Inbox durable antes de efectos, efectos idempotentes, quarantine/replay y
  límites de request.
- Mapping por entorno, checkout-attempt server-only, portal allowlisted y
  separación estricta sandbox/production.
- Intento OAuth ligado a provider/state, sesión exclusiva en Credential Manager,
  rotación protegida y logout request/ack fail-closed.
- Grants independientes, reconciliación monotónica de Customer State y ledger
  atribuible de orders/refunds.
- Runbooks y evidencia: `docs/billing/`, `docs/analysis/isa-69-*`,
  `docs/analysis/isa-70-*`, `docs/analysis/isa-71-*`, `docs/analysis/isa-72-*`
  y `docs/analysis/isa-88-*`.
- Gates locales: PostgreSQL desechable completo (clean, legacy upgrade,
  concurrency y restore), Deno 164/164, frontend focal 87/87, frontend global
  311 archivos/2.128 tests, build, lint focal, Go global, x20 y race detector
  focal. El workflow productivo es exclusivamente manual, protegido por
  environment.
- BIL-08 añade una credencial offline Ed25519 ligada a UUID y dispositivo. Pro
  y canales temporales vencen por `paidThrough`; Launch v1 conserva únicamente
  su scope adquirido y Testers. Legacy, edición, copia, clock rollback y
  rechazos online fallan cerrados.
- El emisor `license-credential` entra en la allowlist protegida; la clave
  privada existe solo como secreto server-side y el build incorpora únicamente
  claves públicas versionadas. No se ha configurado ni desplegado nada remoto.
- Evidencia BIL-08 sobre la composición final: frontend 311/311 archivos y
  2.128/2.128 tests, build y lint focal; Deno 173/173, formato, check y guard de
  deploy; Go focal x20, vet, race focal, Credential Manager real y fixture
  WebCrypto→Go PASS. La suite Go global deja visible únicamente la deuda
  heredada de Ajustes ISA-118, reproducida también en el `nightly` base; todos
  los paquetes BIL-08 pasan.

BIL-09 / ISA-74 añade un contrato transversal sin cambiar lógica productiva:
catálogo sandbox completo, matriz lifecycle versionada, Customer State,
beneficios, compras múltiples y refunds en orden inverso. Los desconocidos
fallan cerrados y la segunda ejecución converge. La evidencia y la tabla
evento/precondición/resultado viven en
`docs/billing/bil-09-lifecycle-matrix.md`.

BIL-10 / ISA-75 hace operable el runtime sin incorporar un proveedor nuevo:
señales sanitizadas del webhook, snapshot SQL agregado exclusivo de
`service_role`, alertas deduplicadas y runbook completo. IDs originales,
payloads, PII y errores libres quedan fuera. Replay, reparación, deploy y
producción siguen necesitando autorización. Autoridad:
`docs/billing/bil-10-observability-runbook.md`.

BIL-10C / ISA-247 separa acceso interno de comercio. Tester, Tester Nightly y
Owner viven en `operational_access_assignments`; el emisor limita sus leases a
14 días, 72 horas y 30 días respectivamente. Los grants legacy no participan
en credenciales y su retiro es por cuenta, reversible mediante backup,
append-only y dry-run por defecto. Autoridad:
`docs/billing/bil-10c-operational-access-runbook.md`.

El inbox durable queda particionado por entorno. Las filas anteriores al corte
se conservan como `unclassified`, visibles para operación pero excluidas de las
métricas de sandbox y producción. Los gates frescos pasan con 181/181 tests
Deno y PostgreSQL clean/upgrade/restore, incluidas 20 pruebas de observabilidad
por ruta.

El despliegue futuro debe aplicar migración antes que Edge. Un overload
server-only mantiene la versión anterior sin perder eventos y los clasifica
como `unclassified`; se retirará solo cuando el runtime nuevo esté confirmado.

No existe autorización para desplegar migraciones, mutar Polar/Supabase, cobrar,
reembolsar o habilitar venta. Los gates monetarios siguen pendientes.

## Testing Center

- ISA-346 y ISA-349 están integradas únicamente en
  `nightly@c394e71f0945e26ac02ccb7360ffffcd8955c157`: diseño privado de hasta
  diez capturas y contrato puro equivalente Go/TypeScript.
- ISA-350 completa en rama aislada la persistencia local: migración aditiva,
  bucket privado, policy INSERT exact-path, batches/slots, outbox durable y RPCs
  prepare/finalize/submit aditivo. El rollback exige limpieza física previa por
  Storage API/S3 y ejecuta la fase PostgreSQL de forma atómica y fail-closed.
- Evidencia fresca sobre `nightly@d45d8d8d`: runner ISA-350 80/80, rollback y
  reaplicación 80/80, revocación post-prepare, locks concurrentes y finalize
  exactly-once PASS; harness v1 72/56/55 y concurrencia PASS. Reviews finales
  `SPEC PASS` y `QUALITY PASS`. PR draft #253 hacia `nightly`; gates remotos
  `31827610539` en verde. No hay apply remoto, UI, validador, URLs temporales,
  agentes, merge ni promoción implícita.
- Plan vigente:
  `docs/superpowers/plans/2026-08-14-isa-350-testing-center-screenshot-persistence.md`.
- TAU-00/01 y TAU-02A/B/C permanecen en PR draft a `nightly`; TAU-02C cerró sus
  gates locales y remotos sin deploy ni merge.
- ISA-215 / TAU-03 añade el paquete local
  `testing-center.diagnostic.v1`: allowlist, redacción, límites, preview exacto,
  SHA-256 y descarte efímero. No tiene wiring productivo.
- TAU-04A/04B/04C conectan RPC idempotente, draft local privado y una pestaña
  in-app que exige coincidencia entre canal embebido de build y capability
  firmada. `master` y metadata desconocida fallan cerrados; el servidor vuelve
  a derivar membresía y rol.
- TAU-04C reutiliza el paquete de TAU-03, muestra sus bytes exactos, verifica
  SHA-256 en frontend y transporta el mismo payload. No serializa
  ajustes/perfiles ni crea otro collector general.
- Los logs continúan desactivados por defecto. Texto libre requiere opt-in y
  preview completo porque ninguna regex puede garantizar eliminar PII
  semántica arbitraria.
- No existe aún un buffer productivo de logs para este flujo. La UI declara
  cero disponibles y mantiene el control deshabilitado; no simula evidencia.
- ISA-222 / TAU-05A añade triage server-only, fingerprints exactos,
  ocurrencias y una reserva durable de creación. Cien repeticiones y dos
  transacciones concurrentes convergen en una issue técnica y un efecto
  reservado. No existe todavía llamada externa.
- ISA-223 / TAU-05B proyecta el issue y los comentarios con decoder cerrado,
  redacción, markers no confiables y adaptador dry-run que recalcula su digest.
  Replay se expresa solo como disponibilidad autenticada; logs, URL, assignee
  y Codex no entran en GitHub.
- ISA-224 / TAU-05C añade lease/claim, backoff, recheck de pausa, reconciliación
  ante respuesta ambigua y ledger de deliveries HMAC. GitHub no aporta un
  timestamp firmado: se usa delivery ID único y hora server-side, sin header
  inventado. La App mínima queda documentada pero no registrada ni activada.
- ISA-226 / TAU-06A añade una policy pura fail-closed. Solo dos superficies
  frontend, alcance pequeño, reproducción determinista y harness existente
  pueden ser elegibles; cualquier flag sensible, retry o rechazo exige owner.
  Texto y logs no son autoridad y quedan fuera de la decisión/digest.
- ISA-227 / TAU-06B fija instrucciones/objetivos, módulos/rutas, command IDs,
  budgets y salida JSON. Revalida policy y digest; el registro global in-memory
  es solo prueba, no un lock distribuido ni un agente real.
- ISA-228 / TAU-06C concluye NO-GO: policy/corpus estructurado pasan, pero
  faltan procedencia/redacción verificable, scope leaf-level, exclusión durable
  y SHA exacto. P0=0, P1=3, P2=1.
- ISA-229 / TAU-06D elimina texto/mensajes/códigos del sobre y liga una
  proyección mínima a IDs, bytes, SHA y consentimientos. El loader DB
  service-role permanece pendiente de TAU-06F.
- ISA-230 / TAU-06E aplica reglas leaf-level y liga el request a un SHA exacto;
  el resolver de ancestry server-side permanece pendiente de TAU-06F.
- ISA-231 / TAU-06F añade loader `service_role`, tamaño de transporte,
  snapshot head+ancestros, reserva única, claim global, lease, fencing y pausa
  pre-dispatch. Ambigüedad y caída post-permiso no reintentan automáticamente.
- ISA-232 / TAU-06G reaudita sin editar los módulos revisados: P0=0, P1=0,
  P2=0; 0/96 falsos `eligible`, 0/35 falsos `needs_owner`, cero retención y
  cero rutas sensibles aceptadas. Veredicto: GO condicionado para planear
  TAU-07 por microcortes.
- ISA-234 / TAU-07A prepara envelope HMAC, prompt/schema y workflow reusable
  inerte con acciones/CLI pinneadas. No tiene caller, secreto ni permisos write.
- ISA-237 / TAU-07B/C confirma que ChatGPT Pro puede ejecutar la prueba sin
  Platform API y que una ref exacta se verifica por SHA. La continuidad de una
  rama integrada es NO-GO: la PR no conservó de forma fiable el head/base
  esperado. Toda corrección usa sub-issue y rama nueva desde `nightly` actual.
- ISA-238 / TAU-07D fija Supabase como autoridad y Linear como único tracker
  externo. GitHub queda para código/PR/CI; el efecto `github_issue_create`
  permanece inerte hasta su supersesión aditiva, sin dual-write. Contratos
  locales: proyección Linear, rechazo y dossier determinista para Codex. El
  corte está apilado sobre `ISA-234@0e45228626adc59a5a90b72d1369bb110b1c4e8c`;
  Deno focal 47/47, type-check/formato, frontend build y Go global pasan. Sin
  schema, red, secretos, UI, servicios reales, merge o promoción. Review
  adversarial final: ACCEPT, P0/P1/P2/P3=0.
- El diseño aprobado el 2026-08-03 sustituye la activación automática posterior
  por `Vantare -> Supabase -> Linear -> delegación humana a Codex Cloud -> PR
  revisada`. Un rechazo bloquea, genera expediente determinista y exige decisión
  de Isaac antes de cualquier nueva delegación.
- La delegación con escritura selecciona y verifica rama/SHA fuera del prompt.
  La mención Linear `@Codex` no autoriza código cuando parte de `master`; puede
  utilizarse para análisis hasta validar un handoff exacto a Nightly o rama de
  issue.
- ISA-239 materializa TAU-07E localmente: destino único durable, supersesión
  reversible del outbox GitHub y proyección Linear exclusivamente en dry-run.
  Deno 92/92 pasa; PostgreSQL 43/43, rollback exacto, reaplicación 43/43 y
  carrera de dos workers pasan. Merge y promoción siguen bajo gate humano.
  Autoridad operativa:
  `docs/runbooks/testing-center-linear-outbox.md`. Autoridad de diseño:
  `docs/superpowers/specs/2026-08-03-testing-center-rejection-linear-codex-design.md`
  y plan
  `docs/superpowers/plans/2026-08-03-testing-center-linear-codex-execution-plan.md`
  actualizado. Red real, API Codex, repo write no sintético, App real,
  Discord y asignación automática siguen apagados hasta gates separados. La
  integración PostHog preparada no se da por válida: errores, replay, masking,
  consentimiento y retención pasan un microcorte de privacidad antes de la UI.
- ISA-240 materializa TAU-07F localmente sobre ISA-239. La firma Linear cubre
  los bytes exactos, delivery y timestamps se validan, y solo IDs/acción/digest
  entran a un ledger privado. El mapping de estados usa UUIDs revisados; replay,
  digest conflictivo, estado desconocido y orden invertido fallan cerrados.
  La reconciliación es observacional y no toca issue canónica, outbox, Codex,
  Git o canales. Deno Testing Center 98/98 y PostgreSQL 27/27 + rollback/reapply
  + carrera de dos procesos pasan. Autoridad:
  `docs/runbooks/testing-center-linear-webhook.md`. Endpoint, secreto, red y
  deploy permanecen expresamente pendientes de TAU-07I y gate de Isaac.
- ISA-241 materializa TAU-07G localmente sobre ISA-240. Los votos quedan
  ligados a issue/candidata/canal/versión/SHA y a roles server-side;
  `cannot_verify` no cambia el gate y un rechazo Testers posterior bloquea la
  candidata exacta. Dossier y transporte se verifican por SHA-256 en
  TypeScript y PostgreSQL. Solo Isaac registra una de cinco disposiciones;
  `same_branch` está retirado y una corrección sigue `needs_owner`, sin
  delegación automática. Deno Testing Center 99/99 y PostgreSQL 45/45 +
  rollback/reapply + history guard + carrera exactly-once pasan. Autoridad:
  `docs/runbooks/testing-center-candidate-feedback.md`. UI, PostHog, Discord,
  red, Linear real, Codex, deploy, merge y promociones permanecen pendientes.
- ISA-253 materializa la frontera local TAU-07H1 sobre ISA-241. La proyección
  PostHog sólo admite contexto técnico allowlisted y excluye mensajes, stacks,
  logs, perfiles y texto libre. Consentimiento y replay son separados;
  revocación y TTL 7/30 días se aplican en Supabase privado. Deno Testing
  Center 107/107 (focal 8/8) y PostgreSQL 33/33 + rollback/reapply + history
  guard pasan. No existe SDK,
  red, secreto, endpoint, captura/replay real, UI ni efecto sobre Linear,
  Discord, Codex o canales. Autoridad:
  `docs/runbooks/testing-center-posthog-privacy.md`.
- ISA-242 materializa TAU-07H2 sobre `ISA-253@aaff314411288927d97d52c05eb93b6c7d5b8729`.
  La pestaña existente incorpora validación de candidatas y rechazo estructurado
  sin exponer Linear ni acciones owner. Una Edge Function deriva identidad, rol,
  canal y candidata server-side, sanea el contexto y usa el RPC service-role de
  TAU-07G. Deno Testing Center 116/116 (Edge 9/9), frontend focal 32/32,
  lint, build y visual 4/4 pasan.
  Función, secretos y red siguen sin desplegar; PostHog/replay, Linear, Discord,
  Codex, merge y promociones permanecen apagados.
- ISA-243 / TAU-07I tiene autorización limitada al proyecto Supabase de testing
  `lbaxvpzexoferfvfkplz`. Linear ya contiene el proyecto
  `Testing Center — Feedback` y labels agrupadas para origen, canal, módulo y
  flujo; los UUID están fijados en el runbook. El runtime se ajusta a los
  nombres reales `My Live` / `Backlog`. El baseline remoto y las tres Edge
  Functions del piloto están activos solo en testing; probes sin credenciales
  fallan cerrados. Históricamente, el primer reporte Nightly quedó reservado
  bajo pausa y la primera llamada al worker falló antes de claim/`issueCreate`
  porque hosted no exponía `public.gen_random_uuid()`; el wrapper correctivo se
  desplegó y el claim remoto pasó con rollback. En aquel punto todavía no
  existían binding ni issue Linear. El reintento único autorizado devolvió
  `linear_response_ambiguous`; Supabase quedó `needs_owner`, intento/fencing 1,
  sin lease ni binding y con pausa activa. La reconciliación read-only encontró
  cero issues en Linear y el contrato prohibió una tercera llamada sobre ese
  efecto. El cierre actual del piloto se documenta en ISA-287/289 a continuación.
- ISA-287 / TAU-07J añade diagnóstico sanitizado para la respuesta ambigua del
  piloto. El contrato cerrado publica solo versión, fase
  segura, HTTP status acotado y códigos GraphQL `RATELIMITED`/`UNKNOWN`; la
  frontera HTTP lo canonicaliza en runtime para impedir campos añadidos. No
  cambia claim, fencing, binding ni retries: después de `issueCreate` siempre
  termina en `needs_owner`. Evidencia: focal 16/16, Testing Center 125/125,
  deploy guard 4/4, typecheck, formato y diff PASS. Tras revisión humana, solo
  el worker se desplegó en Supabase testing y quedó `ACTIVE` v7; un probe sin
  credenciales devolvió `401 unauthorized`. El round-trip autorizado creó
  exactamente ISA-288, completó un binding sin lease residual y recibió un
  webhook firmado `create/applied`. Un segundo reporte idéntico quedó
  `duplicate_linked`: dos ocurrencias, un efecto y una issue Linear. La pausa
  global está activa, el efecto histórico `needs_owner` quedó congelado por
  flujo y el bearer temporal fue revocado. Codex, Discord, merge y promociones
  continúan fuera de alcance.
- ISA-248 / TAU-07J prepara el handoff humano a Codex Cloud sin reactivar el
  workflow automático. Un dossier completo produce una proyección digestada y
  un texto fijo con evidencia no confiable delimitada. El preflight verifica
  repositorio, árbol limpio, SHA/base y ancestry; tolera el nombre interno
  `work` de Codex Cloud y exige confirmación humana cuando el sandbox no expone
  remote. Los criterios no pueden conceder retry, asignación, autoridad Git o
  release. Handoff Deno 8/8, Testing Center Deno 136/136 y Node 4/4 pasan. Falta
  observar una tarea sintética y su PR;
  no hay caller, secreto, deploy ni promoción.
- La reconciliación local autorizada de PR #121 parte de
  `ISA-234@a526e2b0a4e344f5841a7c216d77a0efc4f0b62e` e incorpora exactamente
  `nightly@4981e6fac5b2c95af9deb4ad2a64f0592a7b4d1e` mediante merge incremental,
  sin force-push. Linear no permitió crear otra issue por el límite gratuito;
  la excepción queda registrada en ISA-234 y no cambia el contrato de rechazo
  ni reactiva `same_branch`. Los gates locales pasan: deploy surface, Deno
  vigente 165/165, preflight 4/4, frontend focal 150/150, build y Go focal.
  CI, build de canal y prueba humana siguen pendientes; no hay merge ni
  promoción.

## Riesgos

- **P0 potencial:** Billing concede/revoca acceso incorrectamente.
- **P0 potencial:** migrar raíz con worktrees activos pierde/duplica trabajo.
- **P1:** el hardening local aún no ha sido validado mediante despliegue y matriz
  monetaria en entornos controlados.
- **P1:** Discord publica commits no relacionados desde `develop`.
- **P1:** ramas, updater y licencias de canal describen modelos distintos.

## Issues y siguiente acción

1. Revisar el PR draft #913 de ISA-909 y no hacer merge ni apply remoto sin
   autorización separada.
2. Revisar ISA-911 antes de habilitar UI Clerk: lifecycle al borrar usuarios,
   Billing, Testing Center, policies `auth.uid()` y logout/cache.
3. Completar gates locales y review de BIL-10C / ISA-247.
4. Presentar dry-run, backup y rollback antes de cualquier apply remoto.
5. Recoger feedback Nightly de BIL-01..10C sin habilitar venta.
6. Continuar gates monetarios y despliegue controlado sin venta pública.
7. Crear proyectos Account, Calendar, Settings e Installer con handoffs propios.
8. Reauditar ISA-14 cuando se cierren worktrees grandes.

Cada issue fija base limpia, archivos, checks y rollback antes de editar. Los
cambios monetarios reales y Master requieren Isaac.

## Última actualización

2026-08-28, ISA-909 abre el primer corte implementable de Clerk después del
spike ISA-885. La decisión de producto permite crear un UUID interno nuevo en el
primer login: no se preservan automáticamente UUID ni perfil anteriores y email
nunca autoriza un enlace. Solo los grants con valor justifican una reasignación
administrativa posterior, con prueba, dry-run y autorización separada. El SDD
inicial limita el cambio a una tabla de identidad, un resolver SQL privado, la
Edge Function de credencial y la verificación Go; UI/SDK Clerk, deploy, datos
reales, merge y promociones quedan fuera. La revisión Fable medio previa al
código terminó `APROBADO_CON_CAMBIOS`: el plan usa advisory lock por identidad,
distingue el issuer legacy, hace de la RPC PostgREST TPA la única autoridad y
separa rechazos 401 de indisponibilidad para impedir gracia offline tras un token
rechazado. ISA-911 registra Billing, Testing Center, policies `auth.uid()` y
logout/cache que aún no son compatibles con Clerk.
El baseline previo a código dejó Go license y Deno credential verdes. El runner
Postgres heredado fallaba antes de ISA-909 porque su bootstrap no reproducía
`extensions/storage` y el upgrade aplicaba calendario antes de acceso
operacional; el fixture y orden mínimos quedaron corregidos y el contrato
clean/upgrade/restore completo volvió a PASS.
El corte SQL posterior crea `account_identities`, retira únicamente la FK de
`profiles` a `auth.users` y resuelve claims PostgREST en una función privada con
lock transaccional por identidad. Las cuatro RPC de licencia consumen el UUID
  interno; 31 pgTAP pasan en clean/upgrade y dos logins Clerk concurrentes producen
exactamente un mapping, un profile y cero huérfanos. La migración sigue solo
local, sin apply remoto.
El corte Edge elimina `getUser()` solo de `license-credential`: conserva el
bearer opaco, deja la validación Clerk a PostgREST TPA, firma el UUID que devuelve
la RPC y traduce rechazo TPA a 401 en vez de disponibilidad. Su config declara
`verify_jwt=false`; Billing y Testing Center mantienen sus fronteras actuales.
  La suite focal pasa 20/20. No hay deploy de función.
El corte Go acepta un `sub` externo no vacío de hasta 255 caracteres, pero el
`Result.UserID` nace solo de una credencial Ed25519 válida con subject UUID y
dispositivo coincidente. Un rechazo 401 no usa la caché aunque el token sea el
protegido; el focal `internal/license` pasa. `go test ./...` recorrió el resto de
paquetes verdes y falló únicamente en `cmd/vantare`/`frontend` porque aún no
existía el artefacto generado `frontend/dist`; queda construirlo en el gate final.
El gate final construyó `frontend/dist` y después `go test ./...` pasó completo;
  Deno quedó 20/20 y Postgres repitió clean/upgrade/restore, 31 pgTAP Clerk y la
carrera de primer login. El roadmap ya describe la frontera entregada como
  feature sin afirmar que exista UI Clerk. La primera review final Fable medio
  encontró dos fallos: status PostgREST 401/403 tratados como 503 y un usuario
  legacy borrado remapeado como externo. Ambos tuvieron regresión roja y quedaron
  corregidos: los rechazos ya impiden gracia offline y el issuer legacy falla
  cerrado si `auth.users` no contiene el subject. También quedó explícito que al
  retirar la FK desaparece el cascade de borrado; ISA-911 debe definir ese
  lifecycle antes de habilitar Clerk. La segunda review Fable 5 con esfuerzo
  medio emitió `ACCEPT`, sin P0/P1/P2 ni simplificaciones necesarias antes de
  integrar. La rama quedó publicada y el PR draft #913 abierto hacia `nightly`.
  En el HEAD `6738902a`, GitGuardian, ruta de promoción y gates bloqueantes
  terminaron verdes (run 33176001927; gate principal 11m01s). Schema/Edge remotos
  siguen intactos y no hubo merge.

2026-08-04, ISA-243/287 completaron el piloto remoto con un caso sintético
nuevo. ISA-288 se creó exactamente una vez, el binding quedó `completed` sin
lease residual y el primer webhook firmado fue `create/applied`. Un segundo
reporte idéntico quedó `duplicate_linked`: dos ocurrencias, un efecto y una
issue Linear. El efecto ambiguo histórico continúa `needs_owner` y congelado
por flujo; la pausa global está activa y el bearer fue revocado. ISA-289 limita
el tooling al project ref de testing, añade preflight de vínculo y separa fallos
OAuth temporales de configuración permanente. No hay Codex, Discord,
promoción ni producción.
Billing conserva BIL-08/BIL-10 en `nightly`, ISA-118 permanece como deuda
global heredada y la venta pública continúa NO-GO.

## VAN-765 / GitHub #1382 · Calendario visual (24/09/2026)

Isaac señaló ocho problemas de presentación en la build Wails del Calendario. La tarea [VAN-765](https://app.notion.com/p/3e5e51695c6581e8b01dd36ff839ae7f) gobierna el alcance; #1382 es el puente de CI. Rama aislada `vantareapp/isa-1382-calendar-visual` desde `origin/nightly@5c73013e`; el checkout principal y la PR de tipografía #1378 permanecen separados. Decisión: detalle contextual cerrable, Día en franjas de 15 minutos preservando horas publicadas, Mes navegable por celda, colores según `eventKind`, Timeline de una hora y geometría adaptable. Tres pruebas nuevas reprodujeron los defectos antes del cambio. Después: 98 pruebas focales PASS, 2 omitidas; `typecheck`, `lint`, build frontend y build Wails producción/debug PASS. La build Wails real de prueba (1264 × 761, horario publicado del perfil existente, sin LMU conectado) mostró cinco vistas sin desbordamiento horizontal; Mes→Día, detalle abrir/cerrar y zoom 711→889 px/h se verificaron mediante CDP del propio WebView2. En zoom alto se reprodujo el desbordamiento impuesto por el suelo de 1180 px de la shell; el Calendario compacta sus columnas y reubica el tooltip de la campana. La primera CI de [PR draft #1383](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1383) falló por dos claves i18n huérfanas y nuevos hallazgos de knip/jscpd; se quitaron las claves, dos exports sin consumidores y la duplicación introducida en Mes. La build Wails final se comprobó en las cinco vistas con zoom de 0.963 a 1.445: la estructura no desborda horizontalmente en ampliación alta y conserva los controles; la vista previa abierta combina esta PR con la tipografía de #1378 sin mezclar sus ramas. El candidato de código `59c02651` pasó `Validate Vantare blocking gates`, `quality-check (ratchet)`, ruta de promoción y GitGuardian en la segunda CI; la auditoría manual opcional quedó omitida. La PR sigue draft para revisión visual de Isaac. Notion VAN-765 y GitHub #1382 registran el estado remoto vivo. Sin merge, promoción ni release.

Revisión visual de Isaac, 25/09/2026: el sombreado rojo de Día seguía ocupando la franja actual; Semana repetía todas las diarias y el Timeline dejaba sus puntos pegados al borde, sin desplazamiento ni ampliación clara. La corrección elimina el sombreado y la línea roja de «ahora», reserva Semana a `eventKind` semanal/especial, mantiene siete cabeceras aunque no haya eventos, fija los rótulos del Timeline con 14 px de margen, añade desplazamiento horizontal por botones en tramos de 15 minutos y muestra zoom de 1× a 4×. La regresión de Semana falló antes del cambio; después pasan 75 pruebas focales, `typecheck`, lint completo, build frontend y la suite completa (4100 PASS, 2 omitidas, 4 de presupuesto PASS). En la build Wails final abierta con el perfil de prueba existente, CDP del WebView2 verificó 96 franjas en Día sin `data-now`, Semana con exactamente tres series publicadas y siete días, y Timeline con scrollWidth 861→1238 px a 1.56×; el botón derecho desplazó 262 px, equivalentes a 15 minutos, manteniendo fijo el rótulo. A zoom de app 1.445×, los controles permanecieron dentro de la superficie y sin desbordamiento del cuerpo. La línea roja se detectó cruzando los rótulos en una captura intermedia y se retiró del candidato final. La build de revisión combina visualmente la tipografía de PR #1378 mediante un import temporal ya retirado; la configuración local autorizada se usó como `envDir` sin leer ni copiar sus valores. La primera CI del commit `50da4945` falló solo por tres clones de jscpd reagrupados al tocar `orbit-races.css`; se devolvió esa hoja a su contenido original porque la eliminación del rojo ya la realiza la vista sin `data-now`. El clasificador local de calidad confirmó NEW=0 tras la restauración. La CI del código `082d6a73` pasó `Validate Vantare blocking gates`, `quality-check (ratchet)`, ruta de promoción y GitGuardian; la auditoría manual opcional quedó omitida. Pendiente: revisión visual de Isaac. Sin integración en Nightly.

Isaac aprobó la integración de la PR #1383 con un ajuste final del zoom: en Timeline, `Ctrl + +` y `Ctrl + −`, los botones y la rueda avanzan en pasos de 0,05 entre 1× y 4×. La rueda consumida por el Timeline deja intacto el zoom global de la app. Las dos regresiones fallaron antes de editar y pasan después. Pruebas focales 66/66, tipos, lint, build frontend y presupuesto 4/4 PASS. La suite global en paralelo obtuvo 4099 PASS, 2 omitidas y dos timeouts de pruebas visuales; ambas pasaron aisladas con un worker (5/5). La repetición estable de toda la suite con dos workers pasó: 4101 PASS, 2 omitidas. Pendiente: CI del nuevo HEAD y verificar merge exacto en `nightly`.

Estado Nightly previo integrado en esta reconciliación:

2026-08-03, ISA-246 queda en `nightly@55fba3d` e ISA-247 implementa localmente
la separación entre planes comerciales y accesos operativos. El apply remoto,
Owner real y retiro de legacy siguen protegidos por gate. Venta pública NO-GO.


ISA-1061 review inicial REQUEST_CHANGES 12200d59: dos P2 de ciclo de vida.
Reproducidos RED: ACK perdido al salir de Ajustes y operacion bloqueada al
cambiar idioma. Corregidos: listener de una publicacion sobrevive a navegacion
hasta ACK/error y mantiene el recibo; cambiar traduccion conserva request pendiente.
10 pruebas de flujo PASS. Fullfrontend previo: 3308 PASS/2 omitidas, build/lint
PASS. Se revalidan cambios finales; Go completo en curso. No publicacion real.


## VAN-737 / ISA-1301 — prueba negativa de política aislada (2026-09-22)

- [Tarea Notion](https://app.notion.com/p/3e3e51695c6581bc88fbda9b7d057975), dependencia de la integración de widgets #1298 autorizada por Isaac. Base nightly `1e9932c4`; rama `vantareapp/isa-1301-quality-policy-test`.
- La prueba anterior asumía que cualquier PR modificaba la política; un check correcto PASS hacía fallar CI. Se sustituye por un repositorio Git temporal: control limpio PASS, cambios de política sin commit/con commit/untracked REVIEW_REQUIRED y hallazgo de analizador FAIL. El diff Git, el detector de política, el agregado y el exit del proceso son reales; solo se inyectan resultados de analizadores, cuyos binarios ya prueban las otras clases.
- Sin cambios de producto, motor de calidad, reglas, baselines ni excepciones. Roadmap required: `milestones:quality-linux-analysis`. Revisión independiente y gates remotos previos a nightly; sin testers/master/release.


### #1464 — acceso nativo durante LMU Live (2026-10-05)

Worker en `C:/tmp/vw3-1464/vantare-v2`, base recibida `376d9ae3`.
La captura real `C:/tmp/acceso-evidence/inicio-diagnostic.png` muestra el Hub
rechazando el acceso con «servicios cerrados durante el juego». A la vez, las
trazas temporales del núcleo (`runtime-acceso-diagnostic.err.log`) verifican
`overlays_advanced=true`, los cuatro módulos habilitados y `error=None`.
Firma, binding y transferencia al núcleo funcionan en esta sesión; no hace
falta cambiar roles para resolver este rechazo. No se consultaron ni cambiaron
secretos, archivos DPAPI, roles o producción.

Causa confirmada del Hub: el supervisor bloqueaba `Status` y `LicenseStatus`
al cerrar services en Live. Ahora `Status` puede descubrir el acceso guardado
y el heartbeat devuelve directamente la política del núcleo, sin reabrir el
helper ni reinstalar candidatos. Regresión con helper/IPC reales: RED antes,
PASS después. Se conserva el cierre de servicios de red durante el juego.

También se reproduce con reloj inyectado un falso `Clock`: comparar pared con
el tiempo efectivo adelantado por deriva rechazaba la segunda observación del
mismo instante. Se comparan observaciones de pared entre sí y se conserva el
tiempo efectivo monotónico, los vencimientos y la protección tras reinicio;
sin cambios del formato persistido. No se ha reproducido físicamente el
parpadeo original en esta sesión, por lo que no se atribuye a este segundo
fallo sin evidencia. Las trazas temporales se retiraron del código.

Gates: fmt y Clippy workspace/all-targets PASS; nextest 1088/1088 PASS con
4 omisiones del perfil; lifecycle PASS, 0 fallos. Evidencia fuera del repo en
`C:/tmp/acceso-evidence/`. Una repetición chocó con un temporal de Analysis
basado en PID; la suite final completa pasó con TEMP/TMP aislados.

Código local `4bdc00d44c88652a122e8d19ce14881cc9e29bdb`; Release recompilado
con la configuración autorizada y `-j 2` (PASS). App de Isaac arrancada con
este código: Hub muestra Inicio sin rechazo de acceso, los widgets dibujan
LMU Live, y las capturas `inicio-final.png` / `inicio-final-60s.png`, separadas
113 segundos, mantienen ese estado. Los mismos PID siguen activos; hashes
de cinco binarios y listados de procesos en la carpeta de evidencia. Esto no
es una observación continua ni certifica todos los módulos. Se hicieron tres
arranques (dos reinicios), conservando la cuenta y todos los datos. La app
queda abierta. Verificación de Isaac: abrir Cuenta/Studio, comprobar el acceso
y observar los widgets al continuar en pista. Si vuelve el parpadeo, registrar
esa sesión; su causa física original sigue sin atribución concluyente.
Solo commits locales; sin push, PR, CI remota, integración ni release. No se
modificaron roles ni servicios remotos. `docs/roadmap/plan.md` no existe en
esta base recibida; no se creó un roadmap paralelo para este bug.
## Beta nativa #1453 — corrección del ACK de PostHog (2026-10-05)

Rama aislada `vantareapp/isa-1453-posthog-admin`, base `a464e9fc`.
El endpoint EU aceptó `vantare_diag_1453_144911` a las 14:49:12 +02 con HTTP 200
y `status: "Ok"`. El emisor esperaba solo `1`, conservaba el pendiente y podía
reenviarlo. Ahora reconoce ambos ACK; regresión con servidor HTTP local.
No cambia consentimiento, eventos allowlisted, UUID ni redacción.
La configuración pública real de beta contiene `VANTARE_POSTHOG_KEY`; se carga
con `native/packaging/build-config.ps1`, sin mostrar valores. Debe incorporarse
al compilar; no se comprobó la clave del binario ya instalado de Isaac.
Read-back del panel EU pendiente de Isaac; HTTP aceptado no lo sustituye.
Gates/evidencia y estado explicado: `C:/tmp/mac-evidence/`; compilación diaria
solo en Mac. No se declara promoción ni publicación.

Read-back #1453: Isaac confirmó el evento en su panel PostHog (nota del orquestador 15:26 del 2026-10-05). Captura y lectura real confirmadas; sin revelar clave.
## #1472 — arreglos R2 (2026-10-07, entrega local)

Base recibida `e8f3f11f`, rama `vantareapp/isa-1472-seguridad-decisiones`.
B-01: desinstalación por inventario, directorios vacíos de hijos a padres y
reintento con estado estructural aunque falten archivos ya eliminados.
Regresión `native/packaging/uninstall-tests.ps1`: RED contra base, 2 PASS
con fixtures, interrupción inyectada y datos conservados. Evidencia externa
`C:/tmp/1472-arreglos-r2-evidence/`. Sin push, PR, promoción ni release.
N-10: la nota del orquestador confirma que beta aún no se ha distribuido y
permite cambiar su inventario/bootstrap sin migración. Workshop oculto en beta;
Studio/preview renderizan en el Hub y no dependen del EXE. Se excluyen Workshop
y su sidecar solo del paquete beta (10 bins); continúa compilándose para
desarrollo/paridad y los otros canales conservan sus 11 bins. Lectura de
manifiesto/estado e importación usan el inventario del canal guardado.
`docs/roadmap/plan.md` no existe en el checkout recibido. La nota R2 externa
se recibió después del inicio y sus instrucciones de custodia USB se aplicaron.

N-2: selección descendente de la primera release verificable; assets inválidos
se omiten y byte[] se decodifica con UTF-8 estricto/detección BOM.
Regresión con verificador Ed25519 aislado y clave generada TEST: RED base,
3 PASS (string, UTF-8 bytes, UTF-16 BOM). GitHub real pendiente de prerelease
autorizada; procedimiento en packaging/README.md, sin publicación en esta tarea.

B-02: destino y raíces confiables canonicalizados antes de comparar componentes;
los enlaces compartidos se identifican también por su ruta real. Test con
junction real RED/GREEN y acceso propio a D: permitido. Gates de esta pasada:
fmt, clippy workspace/all-targets -D warnings, nextest 1189 PASS (6 omitidos)
y lifecycle PASS (0 fallos). Logs en 1472-arreglos-r2-evidence/*-b02.log.

B-03: mapas de pilotos/clases acotados independientemente a 512 identidades;
solo una identidad nueva agota su mapa. Regresión con 2000 clases y pilotos
fijos RED/GREEN, conservando el número de pilotos. Árbol funcional final:
fmt/check/clippy -D warnings PASS, nextest 1192 PASS (6 omisiones del perfil),
lifecycle PASS (0 fallos). Sin cambio de datos del renderer ni telemetría inventada.
Build Release PASS (-j 2, target aislado, cola autorizada).

#21 parcial: legacy se carga independientemente de installation. Regresión
con archivo guardado inválido y bytes DPAPI ilegibles: conserva fingerprint y
Owner acepta una credencial v1 firmada y concede overlays_advanced. RED/GREEN;
mismos gates completos del árbol final PASS, sin cambios funcionales posteriores.
No se aparta/genera otra identidad v2: el servidor actual admite solo
`deviceFingerprint`, no hay reenrolamiento autenticado del cliente ni reset de
dispositivo. Recuperación v2 requiere contrato de servidor y queda documentada;
se conserva fail-closed para v2 y no se cambia Store, cuenta ni datos reales.

N-5: todos los eventos PostHog llevan `$ip: null` y `$geoip_disable: true`;
Testing usa un UUID estable en namespace propio, diferente del de uso.
Regresiones crashes/uso/identidad RED, 8 focales GREEN; mismos gates completos
finales PASS sobre todo el árbol funcional, sin cambios posteriores de código.
No borra vínculos históricos ni reescribe intentos de informe ya consentidos.
No se envió telemetría a PostHog real ni se cambió su configuración remota.

Validación de cierre R2: Release final PASS; packaging/tests.ps1 sobre paquete
QA con binarios Release: 174 PASS (incluye CLI, launcher/hijos replay,
rollback y muerte abrupta). Requirió DuckDB externo en PATH; no prueba una
máquina Windows limpia. Recorrido firmado install/Stage/tamper reject/Apply/
replay no-op/uninstall PASS, datos conservados. Usa payload Release excepto
services reemplazado por verificador aislado con pública TEST; versiones QA
0.1.0/0.1.1, no build ni firma distribuible de producción. Regresiones uninstall
2 PASS y feed 3 PASS también en PS5.1. Paridad Standings Release contra GPUI
#1470: 0/292160 píxeles distintos, umbral0/delta0; captura y diff inspeccionados.
Evidencia: C:/tmp/1472-arreglos-r2-evidence/*-final.log,
packaging-n10-final.log, signed-walk-release-n10.log y standings-final.png.
Sin prueba de firma privada productiva, GitHub real, NSIS, PostHog real ni
LMU físico/DPI/OBS/Mac. Pendiente: contrato de recuperación v2 (#21). Solo commits locales; sin push,
PR, CI remota, integración/promoción ni release. Issue #1472 abierta para revisión.

N-10 final: regresión beta RED antes del arreglo; suite Release sin Workshop
174 PASS y recorrido firmado TEST install/update/uninstall PASS. Cuatro canales
con fixtures: install/status/update/import/rollback PASS, incluso con valor de
canal por defecto opuesto (channel-regressions-green.log). Workshop ausente
en beta y presente en nightly/testers/master. Bootstrap antiguo de paquetes
QA descartados no migra; no existen instalaciones beta distribuidas según
nota del orquestador. Gates Rust/paridad no se repitieron: ningún cambio Rust
ni visual después de los gates finales, solo packaging/docs y su validación.

## #1472 — Prerelease E2E, fase 2 (2026-10-07)

Encargo directo: C:/tmp/beta/r4/brief-prerelease-fase2.md; manda
C:/tmp/fase2/notas-prerelease-fase2.md. Rama aislada
`vantareapp/isa-1472-feed-vacio`, base `1c26b898907cb3b3b3b4547ff39bd925cdf2fe01`,
worktree C:/tmp/vw3-1472-feed; el candidato compartido no se editó.
La instrucción recibida fija GitHub #1472 y prevalece sobre las referencias
Notion antiguas de esta base. docs/roadmap/plan.md no existe en ella.

beta.ps1 considera current un feed consultado sin manifiesto verificable o
sin versión superior. Un fallo de transporte del índice o del asset conserva
state=error y la versión activa, devuelve false y no bloquea el Hub. La firma,
la selección descendente y la verificación del paquete permanecen obligatorias.
remote-feed-tests.ps1: RED con feed vacío; GREEN 9/9 en PS5.1 y PS7:
tres codificaciones, vacío, igual, anterior, mayor inválida, red del índice y
red del asset. Fixtures de inventario y firma real con clave exclusivamente TEST;
no se usó la clave del USB ni se publicó nada.

Runtime productivo aislado: Apply realizado por el orquestador antes de esta
fase; arranque 0.0.901 confirmó current y retiró boot-pending. El feed vacío
reprodujo el error inicial; Check corregido real contra GitHub salió 0/current.
Se copió solo beta.ps1 corregido a la raíz de la instalación aislada para
repetir Run: Hub listo, current/Estás al día, cierre normal idle. Capturas
segunda-hub.png y segunda-hub-fixed.png inspeccionadas; Hub sin acceso verificado,
no prueba login/LMU/OBS ni una instalación Windows limpia.

Uninstall real PASS; state y EXE retirados, datos preservados por el bootstrap.
Después se borró exclusivamente E:/tmp/prerelease salvo candidato-target;
0 procesos de la prueba y 0 accesos directos en Desktop/Inicio. Logs externos
conservados en C:/tmp/prerelease-e2e-evidence. Informe FASE 2:
C:/tmp/fase2/informe-prerelease.md. Sin gates Rust/frontend ni rebuild porque
solo cambió PowerShell; diff-check PASS. Entrega solo local al orquestador,
pendiente de revisión/unión: sin push, PR, CI remota, merge, promoción ni release.

## #1488 — Calendario nativo: horario publicado (2026-10-07)

Encargo `C:/tmp/beta/r4/brief-1488-calendario.md`; rama aislada
`vantareapp/isa-1488-calendario-publicado`, base recibida `bce17802`.
La cabecera del encargo fija GitHub como seguimiento y entrega local al
orquestador: sin subagentes, push, PR, merge ni publicación.

Se incorpora `CalendarRefresh` al IPC existente del Hub/supervisor/services.
Services consulta la RPC pública de solo lectura `race_schedule_current` con
la configuración Supabase anon del build; sin HTTP desde UI, sesión Clerk,
esquema nuevo ni dependencias nuevas. El Hub aplica `Schedule::parse`, guarda
atómicamente `official-schedule.json` en su directorio de datos y lo restaura.
La primera apertura sin horario vigente y los dos botones de actualización
usan esa ruta. Una petición en curso no se duplica; demo/capturas de ejemplo
no piden red ni guardan publicaciones. Se conserva el último horario válido
ante errores de red, respuesta o escritura; nada caducado se presenta como
actual en ninguna vista. Sin uno vigente: «Aún no hay horario publicado para
esta semana». La vigencia conserva el intervalo UTC `[validFrom, validUntil)`.

Consulta real del 07/10 con la configuración pública de beta cargada por el
loader autorizado, sin mostrar valores: HTTP 200 y `[]`. No hay publicación,
por tanto tampoco horario vigente: Isaac debe publicar uno. No se ha escrito
nada en Supabase. Tests con fixture/servidor HTTP local cubren descarga,
validación, ausencia de publicación, caché, reinicio, caducidad, red y guardado
bloqueado; no demuestran una publicación real que el servidor aún no tiene.

Gates finales: fmt/check/Clippy PASS; Nextest 1220/1220 PASS (6 omitidas); lifecycle PASS en repetición. El fallo anterior del ejecutable Engineer 0xc0000409 queda conservado y registrado en #1491, sin cambio fuera de alcance. Standings perfil prueba: 0/292160 px, sin máscaras ni tolerancias, captura/referencia/mapa inspeccionados. Calendario demo 1440×900 inspeccionado: vacío honesto. Probe del código Rust real de services: RPC OK, 0 publicaciones. La build con parity-capture conserva un warning heredado de analysis/view.rs (cx sin usar); Clippy normal pasa. El comparador JSON con diferencias falla por numpy int64: #1490. Evidencia fuera del repo:
`C:/tmp/1488-calendario-evidence/`. Informe del worker:
`C:/tmp/fase2/informe-1488-calendario.md`. `docs/roadmap/plan.md` no existe en
la base ni en `origin/nightly` consultado; no se crea un roadmap paralelo.
Entrega local para revisión del orquestador; sin push, PR, CI remota, integración, promoción ni release. Siguiente: revisión y validación con un horario
que Isaac publique. Se mantiene el cierre de services durante Live y el
heartbeat/permisos existentes; no se amplía su vigencia durante llamadas de red.

## #1496 — UI r10 R6: Calendario y Roadmap (2026-10-08)

Trabajo local autorizado por brief-r6-calendario-roadmap.md; issue abierta.
Rama vantareapp/isa-1496-ui-r6-calendario-roadmap; base exacta a5a01084 (R3).
Sin push, PR, CI remota, merge, promoción ni release.
docs/roadmap/plan.md no existe en esta base; no se crea una fuente paralela.

Calendario: Agenda/Carteles/Tiempos en pestañas superiores; horario real,
estrella y campana como preferencia persistente. Favoritas conservan el JSON
anterior con seriesIds; campanas en calendar-reminders.json separado.
Ambos archivos usan escritura atómica y comprobación de conflicto.
Campana y autolanzamiento indican Próximamente: no entregan avisos ni lanzan.
Hero de siguiente favorita independiente de filtros; próxima hora [now,now+1h)
con una fila por serie. Recurrencias acotadas sin perder intervalos largos.
Horario caducado/no publicado permanece vacío. Carril compartido
Esta semana/Horario/Tus recordatorios; kit/tokens intactos.

Roadmap: Circuito/Tablero/Temporada leen solo la Publication de services;
Entregado queda en el carril. No usa el recurso editorial local como fallback.
El contrato publicado solo contiene id/section/title/body; fases, áreas,
porcentajes, fechas/versiones/canales por hito y later no existen en él.
Se indican Próximamente sin inferir datos. No cambia schema, servicios remotos,
IPC, dependencias ni publicación Supabase. Integrar los hunks puntuales de
shell.rs y el bloque de accesores de services/view.rs junto a R4/R5.

Checks por cola con target propio: fmt/check y Clippy -D warnings pasan;
Nextest workspace 1258/1258 (6 skips heredados), lifecycle 18 casos PASS.
Tras corregir Carteles a tarjetas horizontales: Nextest Hub 322/322, 0 skips;
check/Clippy workspace, build prueba y QA parity-capture PASS; fmt --check PASS.
Regresiones de favoritos/campana/formato anterior/conflicto, vacío/caducidad,
proyecciones por vista, límites horario/recurrencia y copia sin inscripciones.
Se retiró solo el test de grid añadido aquí al sustituirlo por la lista;
ningún test heredado debilitado. QA conserva warning ajeno analysis/view.rs:989.

Matriz visual completa e inspeccionada: 144 GPUI + 144 referencias, 3 temas,
ambos carriles, 4 tamaños, 6 vistas; 36 hojas comparadas. Las 24 de Carteles
se repitieron tras corregir su composición; las anteriores quedan archivadas.
Fuente final Carteles/binario a4b7e0de; otras 120 imágenes ed2b9505, sin cambios
en esas vistas. captures.json y VERIFICACION.md trazan ambos snapshots.
Agenda sigue más densa que el mockup por conservar todas las salidas reales;
Tiempos es más sencillo; Roadmap no tiene los campos ricos del ejemplo.
No se declara paridad literal. Calendario QA usa horario oficial archivado;
Roadmap QA muestra carga sin publicación utilizable. No es prueba live.

Se respetó el marcador de pantalla y el mutex; ventanas aisladas cerradas.
No hay prueba de login/calendario publicado live, LMU/OBS/macOS/DPI físico,
ni entrega de avisos. Interacción y aceptación final pendientes de Isaac.
Evidencia: C:/tmp/ui-r10/r6-evidence/VERIFICACION.md; informe-r6.md y logs.
Siguiente: revisión del orquestador e integración autorizada de hunks compartidos.
Preguntas: servicio futuro de avisos/autolanzamiento y contrato editorial rico;
actualización del cuerpo R0 de #1496/plan canónico ausente.

### #1496 — integración local R6 en calidad (2026-10-08)

Merge no-ff de 7bea1049; shell conserva Cuenta R4 y Testing R5.
Calendario y Roadmap usan el kit único con rojo/contrastes R4 y accesibilidad
corregida. Adapt queda en las entidades de ventana, nunca en el global.
Gates/capturas del conjunto pendientes; sin push/PR/promoción/release.

Verificación del conjunto calidad/70e15d11 (2026-10-08): fmt/check/Clippy
-D warnings PASS; Nextest1272/1272 (6 skips previos + microbenchmark ignorado),
lifecycle18/18 y builds prueba/QA PASS por la cola, target propio -j2.
QA conserva warning heredado analysis/view.rs:989. Capturas del conjunto en
curso; primer intento oculto falló por HWND no visible, repetido correctamente
por ruta nativa prevista. Logs/manifiesto: calidad-1-evidence/reanudacion.
Latencia de entrada sigue pendiente (PresentMon msSinceInput=0); no se
certifica fluidez, DPI físico, LMU live, OBS, login ni Mac. Solo local.

Cierre de la tanda de calidad (código70e15d11): 144/144 PNG en 1920×1080 y
1280×720, Vantare/DeepSeek, hashes y dimensiones comprobados. Doce hojas
y originales de casos principales inspeccionados; sin regresión de conflictos
observada en la muestra. Ventanas y helpers QA cerrados; mutex libre.
Tres aliases históricos Workshop/Telemetría/Licencias muestran Inicio/cargando
y no acreditan esos módulos; R0–R6 sí cubiertos. No paridad exacta ni latencia.
Informe≤15 líneas C:/tmp/ui-r10/informe-calidad-1.md; logs/diff/manifiestos/manual
en calidad-1-evidence/reanudacion/VERIFICACION.md. Instalación real intacta.
Siguiente: revisión del orquestador/Isaac; latencia de entrada pendiente.
Solo commits/merges locales autorizados y seguimiento GitHub; sin push/PR/
CI remota/promoción/release. No se afirma aceptación ≥9 ni publicación.


## #1504 — Icono plano, activos Windows y marca (2026-10-08)

Brief autorizado: `C:/tmp/ui-r10/brief-1504-iconos-docs.md`; referencia aprobada
`C:/tmp/ui-r10/marca-1504.html`. Worker sin delegación ni ventanas de la app,
worktree `C:/tmp/vw3-1504/vantare-v2`, rama `vantareapp/isa-1504-marca`, base
candidato beta `60510a0c4e2f71ba981ab2912c4e9cdc23d1f935`, inicialmente limpio.
Usuario/brief fijan GitHub #1504 frente a referencias Notion antiguas del checkout.

ICO siete frames independientes, 16/24 con patas gruesas, 32 normal plano
#D80000; ≥48 conserva `build/appicon.png`. Siete SVG fuente (color/blanco/negro,
normal/pequeño y avatar); Hub mark normal a 26 px actualizado, recoloreado por
GPUI según tema. El `i-vantare` usado a 48 px queda fuera del corte ≤32.
MSIX: 18 PNG (tres del manifiesto y cinco targetsize con tres formas); build
copia los activos versionados y deja de redimensionar el icono genérico.
Unplated sin placa; lightunplated negro para barra clara. Wordmark no aprobado,
sin crearlo ni cambiarlo. BRAND/DESIGN registran escala roja, contrastes calculados
sRGB y naranja/AI Engineer/100 % FPS/italiano históricos sin borrar material.

Regenerador stdlib + Pillow instalado 12.1.1; `--check` compara bytes. Dos tests
validan frames/colores/hueco/alpha/dimensiones y nombres contra manifiesto.
Parser y negativos MSIX en PS5.1: 12 PASS. Hoja
`C:/tmp/ui-r10/iconos-1504.png` MIRADA: tamaños reales en claro/oscuro, variantes
sin placa, tres activos base, una tinta y avatar. Halo Lanczos de alfa pequeño
conservado; el relleno opaco sigue siendo exactamente #D80000 tras corregir la
reducción de RGBA para filtrar únicamente la máscara alfa.
No build Rust/Go/frontend: no cambia código de esas rutas. Sin paquete real,
firma, Store, instalación, arranque ni DPI físico. Contraste 3,04:1 del icono
sobre oscuro es para gráfico, no texto; la variante negra es solo para fondo claro.

Preguntas para orquestador/Isaac: ¿reconciliar italiano histórico con el contrato
que todavía lo exige? ¿Cómo reflejar este corte en el roadmap exigido por las
instrucciones recibidas si `docs/roadmap/plan.md` falta en base y origin/nightly?
No se recrea una fuente paralela. UI/web/widgets y aprobación wordmark pertenecen
a sus cortes. Entrega con commit local e informe ≤10 líneas en
`C:/tmp/ui-r10/informe-1504.md`; comentario GitHub autorizado. Pendiente review
e integración por orquestador; sin push, PR, CI remota, merge, promoción ni release.

## #1515 — Informes de fallos con consentimiento (2026-10-08)

Brief autorizado `C:/tmp/lanzamiento/brief-1515.md`; GitHub #1515 fija alcance
y tracker frente a la referencia Notion antigua del checkout. Worktree
`C:/tmp/vw3-1515/vantare-v2`, rama `vantareapp/isa-1515-consentimiento-fallos`,
base candidato beta `a8f9bdc3b69561e007e656f270de95fa41fba54b`, inicialmente limpio.
Worker sin delegación. #1506 y producción permanecen fuera del cambio.

`Privacy::default` desactiva fallos y uso. `crashes_decided`, ausente en las
preferencias antiguas, exige una decisión nueva; nunca hereda el sí implícito.
Pregunta Orbit antes del acceso normal del Hub, con aceptar/rechazar, enlace
a la política, foco inicial en rechazar y teclado. Guarda atómicamente antes
de continuar; un conflicto mantiene la pregunta y los fallos desactivados.
Reinicio conserva la decisión; Ajustes › Privacidad permite cambiarla.
La migración elimina los slots de fallos previos antes de aceptar y la
revocación descarta los pendientes. Usage mantiene su consentimiento separado.

Validación: formato/check/Clippy PASS; Nextest 1220/1220 PASS, 6 omitidas por
el perfil existente; lifecycle PASS, sin filtros. Diagnósticos: 19 tests PASS
con HTTP local y proceso de panic real. Los cuatro tests de Store verifican
aceptar/rechazar, migración, reinicio, revocación, conflicto y guardado fallido.
No se debilitan gates ni se cambia el kit. No son envíos a PostHog real.
Evidencia en `C:/tmp/lanzamiento/1515-*.log`; fallos iniciales de tipo GPUI,
estilo y formato quedan conservados junto a las ejecuciones finales PASS.
Sin gate telemetría: no cambian runtime/domain/ipc ni fixtures. Sin Go/frontend
ni otras plataformas: este corte cambia solo services y Hub nativos Windows.

Captura no ejecutada: tres intentos encontraron ocupado el mutex
`Global\VantareParityCapture` y no abrieron ventanas. No se afirma aceptación
visual. `C:/tmp/lanzamiento/1515-qa.ps1` deja la comprobación preparada con
raíces/pipe aislados y comprobación de `pantalla-ocupada` antes de cada arranque.
Verificación manual: primer arranque, Tab/Shift+Tab y Enter/Espacio; rechazar
y reiniciar; aceptar y reiniciar; cambiar en Ajustes › Privacidad; migrar un
privacy.json antiguo y comprobar desaparición de sus slots previos. Pendiente
revisión visual cuando la pantalla quede libre y revisión del orquestador.
Commit/push y PR draft contra el candidato autorizados por el brief; sin merge,
promoción, release, despliegue ni modificación de instalación real.

Isaac confirma la URL canónica `https://vantare.app/privacidad`: la pregunta
y Ajustes › Privacidad comparten ese enlace y su manejo de teclado. El Hub
aún no distingue idioma de interfaz (el selector está inactivo); el idioma
de widgets no cambia la URL. Pendientes: publicación de la política y retención,
DPA y descarte de IP en PostHog conforme a las marcas VERIFICAR de la política.
No se configura producción desde este worker. `docs/roadmap/plan.md` falta en
base y `origin/nightly`: decidir cómo reconciliar el contrato de actualización
en el mismo PR, sin crear un roadmap paralelo.
Runbook para Isaac: `C:/tmp/lanzamiento/1515-runbook-isaac.md`.

Entrega de implementación: `a1d137e2ee8cd761adb8192674bc249bd8979ebf`, push
verificado en `origin/vantareapp/isa-1515-consentimiento-fallos`. PR draft
[1519](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1519)
abierta contra `vantareapp/isa-1470-candidato-beta` y vinculada al hilo T3.
CI remota en curso al comprobar la entrega; no se afirma CI verde ni integración.
Informe final del worker: `C:/tmp/lanzamiento/informe-1515.md` (HEAD final y
estado remoto). Siguiente: revisar PR/CI, validar la pantalla al liberarse y
publicar la política antes de autorizar una integración/promoción.

Seguimiento autorizado de #1515: URL confirmada y enlace compartido en ambas
vistas, disponible también si hay error de preferencias. Foco propio en Ajustes,
clic y Enter/Espacio; no se cambia el permiso ni el flujo de compra/cuenta.
Formato y Clippy del workspace PASS; Nextest de `shell::settings::` 16/16 PASS
(287 fuera del filtro). Logs `C:/tmp/lanzamiento/1515-url-*.log`. Sin nueva prueba
visual ni acciones de producción. La misma rama y PR draft #1519 reciben este
seguimiento; HEAD/push final se registra en el informe del worker y GitHub #1515.

### #1496 — v4: sondeo de compra aislado de acciones (2026-10-09)
Solo worktree de integración 25d9e6bd, rama #1514 intacta. F2 distingue propósito
PurchaseRenew/PurchaseSession de renovación manual, mantiene contexto/mensajes y
relee caducidad OAuth en segundo plano. Calendario y acciones usan la cola existente;
logout tiene prioridad. Espera ligada al producto, máximo10 minutos, salida manual,
error recuperable y parada con política vigente/cancelación/logout. Redirect no da acceso.
Regresiones iniciales5/5 PASS por cola (compra, calendario, roadmap, informes,
catálogo y reloj controlado); primer intento detenido por falta de cx.quit en tests
propios, corregido y evidencia conservada. Gates finales/IPC QA/instalador pendientes.
PR1523 recibirá comentario de defectos y arreglo; no se modifica su rama. Sin promoción.
