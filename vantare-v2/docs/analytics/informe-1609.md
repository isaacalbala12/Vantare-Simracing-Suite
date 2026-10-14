# Entrega #1609 / VANTA-22 · PostHog consentido

## Ronda 3 · correcciones de review Sol r2 (14/10/2026)

1. Worktree limpio en `f56156e3`; reglas nocturnas, buzón y review leídos completos.
2. P2-1 `86fa6aa8`: generación monotónica; una lectura suspendida no restaura permiso revocado.
3. La admisión compara la generación vigente y revocar vacía la cola local en memoria.
4. Cola revocable de 32 entradas bajo mutex breve; callbacks try_lock sin I/O ni espera.
5. Hub vacía acumuladores al guardar y páginas/widgets revalidan antes del cierre/muestreo.
6. P2-2 `6b177190`: Busy de limpieza no elimina controles; worker cancelable reintenta.
7. Carga con cerrojo retenido, limpieza diferida y revocación sin reiniciar: GREEN.
8. P3 `88ddc324`: el error no inventa que los informes estén desactivados; indica decisión no confirmada.
9. Services 130 + 2 procesos, Store 7, Nextest 1673/1673 (7 skips), lifecycle 18/18; fmt/check/Clippy PASS.
10. Código publicado beb68c4f; PR draft #1617, VANTA-22 Por revisar (03:15 UTC). Sin producción/merge/release.

Review: C:/tmp/ola2/review-1617-sol-r2.md; evidencia nueva C:/tmp/1609-r3.
RED services: A restauraba Some(0); B conservaba/admitía dos observaciones tras revocar.
RED Hub: consent.lock ocupado hacía fallar Store::load incluso con ambos permisos habilitados.
Regresiones con señales en load/store, cierre anterior al siguiente sample, cola vacía,
refresco autoritativo tras una retirada externa y liberación del cerrojo antes del
reintento. Se conserva la frontera de disco/HTTP de ronda 2. La prueba heredada de
revocar/reaceptar espera ahora la siguiente lectura posterior al intento de escritura:
Drop no puede convertirla en verde cancelando antes de la comprobación final.

**Límite sin cerrar:** la retirada en otra UI se detecta al refrescar privacy.json
por el worker (espera normal 250 ms, más si su I/O queda ocupado). Se prueba descarte
al refrescar, pero no se garantiza cero recogida/conservación instantánea en memoria
entre procesos. Resolver eso requiere una frontera de invalidación compartida;
DUDA al orquestador en buzón. No se da por cerrado ese criterio estricto de review.
Los escenarios A/B del mismo proceso y disponibilidad de los controles sí están corregidos.

El texto P3 es una corrección estática sin nuevo test de copia de cadenas; los tests
de persistencia verifican que Busy no confirma una decisión. Primer comando Hub
reducido falló por faltar la feature network: corregido solo el runner, conservado
hub-red-first-err.txt. El hook inicial de reproducción tuvo un error de compilación
Option::ok: corregido antes del RED válido; pasos/resultados registrados.
Gates por compilar.ps1, timeout externo 1800/3600 s, target propio
native/target/gates y dos jobs. Logs clippy-first/second-err.txt conservan las dos
simplificaciones exigidas (if let y nombre/cierre explícito del worker); sin allows
ni relajación. Nextest: 1673 PASS en 257,612 s, 7 skips del perfil; la prueba lenta
go_physical_tyre_parity pasó en 121,645 s. Lifecycle: 5 Engineer + 13 Runtime PASS.
Fmt/check/Clippy completos PASS; services 130 + 2 procesos, Store 7 PASS.
Diff y marcadores de conflicto revisados; diff --check PASS. Sin nuevos cambios de código
tras los gates; el commit de cierre es documental.
Raíces de datos temporales, captura desactivada al compilar pruebas, HTTP loopback.
Sin QA GUI física ni validación LMU/ACC; telemetría dedicada no requerida porque
no se toca runtime/domain/ipc/testdata. Paneles/snippet intactos: no repetidos.
Quality de integridad: 456 huellas PASS. Base conservada 69fa2d65, origin/nightly
consultado 552c0d52; no se integra ese tip. PR #1617 sigue draft a nightly.
Código final `beb68c4ff58573376302614136e1499cf3741adb` publicado y verificado
con ls-remote y gh pr view. PR #1617 draft a nightly, sin auto-merge ni mergeCommit.
VANTA-22 Por revisar verificado desde raíz Git el 14/10 a las 03:15:20 UTC;
GitHub Project Vantare, area:plataforma, sin milestone. HEAD documental final y
CI del mismo HEAD se verifican en la issue y en FIN del buzón, sin afirmar CI verde.
Un commit por hallazgo y un cierre de gates/sincronización; no hay promoción.
Pendientes iniciales de panel real, Marketing/Setup, atribución y registro/pago
backend siguen en la sección inferior; esta ronda no los activa.


## Ronda 2 · revisión Sol corregida (14/10/2026)

1. Se conservó el worktree limpio en `b453254e` y la base `69fa2d65`; review completa leída.
2. P1 `58d0a735`: contador persistido del permiso y cerrojo común entre procesos.
3. A/B se reprodujeron en Rust: POST y publicación después de revocar; ambos ahora descartados.
4. Revocar/reaceptar también invalida el evento y el payload autorizados en la generación anterior.
5. P2 `f40bc343`: revocar borra UUID/marcadores; reaceptar crea otro UUID.
6. Páginas/widgets reinician tiempos al cambiar generación y no heredan tiempo al cerrar.
7. P2 `55531cc4`: callbacks de instrumentación entregan en memoria con `try_send`, máximo 32 entradas.
8. Worker de services persiste; pruebas con persistencia detenida y canal lleno retornan sin esperar.
9. Fmt/check/Clippy PASS; Nextest 1666/1666 (7 skips), lifecycle 18/18; services 127 + 2 procesos.
10. Push del código verificado, PR #1617 sigue draft a nightly; VANTA-22 Por revisar, 02:36 UTC.

Código final `55531cc4723d4cfa0c43e7b9e47a8304d64f187c`; tres commits por hallazgo.
El SHA del cierre documental se verifica en la issue, el PR y `C:/tmp/buzon/1609.md`.
GitHub Project Vantare verificado; `area:plataforma`, issue abierta, sin milestone.
Nightly remoto consultado: `0807fbd0`, base conservada de este encargo `69fa2d65`.
No se ha integrado esta rama ni validado una integración con el nuevo tip.

| Hallazgo | RED conservado en C:/tmp/1609-r2 | GREEN / punto común |
| --- | --- | --- |
| P1 A: payload suspendido antes del POST | `p1-p2-red-out.txt`: POST empezó tras completar revocación | `consent_tests.rs`, barreras para revocar y reaceptar; `sender.rs:113` conserva frontera hasta terminar HTTP |
| P1 B: productor suspendido tras permiso | Mismo log: slot publicado tras revocar | `diagnostics.rs:586`, revalidación de generación bajo `consent.lock` antes de persistir |
| P2 identidad | Mismo log: `anonymous-id` seguía presente | `diagnostics.rs:88`, ID y marcadores ausentes, UUID nuevo y observaciones frescas |
| P2 UI | `ui-red-out.txt`: callback esperaba la persistencia | `recorder.rs:146`, writer detenido por barrera y 128 entregas con canal de 32; retorno anterior a liberar writer |

Rutas de cambio: `services/src/diagnostics.rs`, `diagnostics/sender.rs` y sus tests;
`diagnostics/recorder.rs` implementa el worker sin red para productores GPUI.
`ui/src/analytics.rs` adapta el dueño `App`; Hub/overlays, Launcher, Studio y Strategy
usan esa ruta, sin leer privacidad ni escribir desde los callbacks de instrumentación.
El proceso services conserva el emisor HTTP. El guardado manual de la decisión en
Ajustes mantiene la ruta atómica y sus conflictos por bytes observados; no se cambia su diseño.

La frontera SO cubre el POST completo, acotado a 8 s: si ya hay una petición en
curso, guardar devuelve ocupado y hay que reintentar. No se informa de éxito de
revocación mientras esa petición puede avanzar. Una petición iniciada antes de
revocar no puede retirarse del transporte. El contador solo se guarda localmente;
el payload PostHog sigue teniendo su allowlist exacta, sin generación extra.
Las observaciones reinician por identidad de consentimiento; no son un censo de instalaciones.

Logs nuevos: `p1-p2-red-out.txt`, `p1-green-out.txt`, `p2-green-out.txt`,
`ui-red-out.txt`, `services-out.txt`, `check-err.txt`, `clippy-err.txt`,
`test-err.txt`, `lifecycle-out.txt`, `steps.txt`. Se mantuvieron logs anteriores;
los errores RED son intencionales. La única prueba lenta del Nextest final
(`go_physical_tyre_parity`, 128,750 s) pasó; no se excluyó ni relajó.
Quality: 456 huellas PASS. Targets propios en `native/target/gates`, dos jobs,
comandos por la cola y timeout externo de 1800/3600 s; gates en serie.
Tras retirar un helper síncrono temporal sin consumidores se repitieron check
 y Clippy completos; no cambia el comportamiento cubierto por Nextest/lifecycle.

Telemetría dedicada no repetida: no se toca runtime/domain/ipc/testdata.
Paneles Python/snippet no repetidos: no hay cambios en esas rutas; abajo consta
su evidencia inicial. Sin GUI física: se prueba el productor real que usan los
callbacks, con barreras, reloj inyectado y HTTP loopback; no se midió disco/antivirus real.
Persisten los pendientes iniciales: panel real/clave, Marketing/Setup, atribución,
registro/pago exactos backend y QA visual/revisión independiente. Sin subagentes,
diseño visual nuevo, dependencias nuevas, instalación/datos reales de Isaac,
PostHog real, producción, merge, promoción ni release.

CI observado en el código `55531cc4` a las 02:37 UTC: ratchet y GitGuardian
SUCCESS; canales y native-linux IN_PROGRESS. El HEAD documental final dispara
su propia CI: consultar el PR; no se afirma CI completa verde ni release.

## Entrega inicial · evidencia histórica hasta b453254e

Issue: [#1609](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1609),
GitHub Project Vantare, `area:plataforma`, sin milestone comprometido.
Rama `vantareapp/isa-1609-posthog-uso-embudo`; base nightly `69fa2d65`.
Reanudación CLI del 14/10: commit T3 `f69554f9` y cambios heredados conservados.
Código local verificado: `f5837cd3`; contrato/servicios `a82a283b`, paneles
`7003f0d1` y corrección de paginación `089bae4b`.
PR draft [#1617](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1617)
a nightly; Plane «Por revisar», verificado el 14/10 a las 01:51 UTC. Código y
documentación publicados en la rama de issue; CI remoto en curso, sin resultado
final en la consulta inicial. Los gates anteriores son locales.
No se ha integrado, publicado ni probado PostHog real.

## Resultado preparado

- Consentimiento de uso independiente de fallos; casilla apagada, aceptación o
  rechazo persistidos, revocación en Ajustes y descarte de pendientes. El sí
  antiguo sin `usage_decided` no habilita productores ni emisor.
- Páginas del Hub y tiempo con ventana activa; tipos visibles de widgets y
  tiempo, sin duplicar instancias del mismo tipo. Reloj monotónico e intervalos
  observados: suspensión >2 s excluida; no actividad anterior al permiso.
- Funciones instrumentadas: añadir widget, iniciar cadena de perfil, recalcular
  plan editado, enviar informe y preparar checkout. Solo nombres cerrados.
- Instalación, cuenta disponible y acceso comercial son **observaciones**.
  No representan instalación completada, registro o recibo monetario.
- API `diagnostics::consented_usage_id(root)` para #1610; ausencia sin permiso,
  mismo UUID v4 que el sender y ningún ID de cuenta/licencia/huella.
- Ocho definiciones de paneles UE, script inerte por defecto y snippet web sin
  SDK/autocapture/replay. Pruebas con red/almacenamiento simulados.

Catálogo y límites: [eventos](eventos.md); [snippet](web-snippet.md);
[paneles y activación posterior](paneles.md).

## Regresiones y evidencia

1. **Consentimiento heredado:** RED de T3 conservado en
   `C:/tmp/1609-evidence/consent-red.txt`: con `usage:true` antiguo se creaba
   cola. `Privacy::load` ahora cierra ese caso y exige decisión independiente.
2. **Orden del embudo:** RED reproducido por CLI en
   `services-red-out.txt`: la primera señal era `account_signed_in` en vez de
   `installation_observed`. Se reserva la instalación bajo el mismo lock antes
   de cuenta/licencia; no se crean marcadores sin permiso ni se repiten al revocar.
3. Durante la revisión del trabajo heredado se movió el evento de Launcher al
   arranque correcto de la cadena; un perfil rechazado no registra éxito. El
   evento comercial exige concesión comercial vigente y excluye roles/módulos.
4. **Listado de paneles incompleto:** RED→GREEN offline de una respuesta sin
   `next`. El script ahora exige paginación confirmada antes de crear nada;
   arreglo `089bae4b`, ocho tests PASS y log `paneles-pagination-red.txt`.

Logs fuera del repo: `C:/tmp/1609-evidence/`. Los targets son propios del
worktree (`native/target/gates`); no se copian cachés a evidencia.

Fuentes de revisión: `native/services/src/diagnostics.rs` (consentimiento,
identidad y cola), `diagnostics/sender/analytics_tests.rs` (payload HTTP y RED/GREEN),
`native/hub/src/settings/privacy.rs` (persistencia/revocación),
`native/hub/src/shell/analytics.rs` y `native/ui/src/app/usage.rs` (relojes de estado
con pruebas inyectadas, sin GUI ni esperas temporizadas).

El primer Nextest se detuvo con 1489 PASS y un fallo en el test de ruta por
defecto: el runner externo había fijado `VANTARE_NATIVE_DATA_ROOT`, que contradice
la precondición de ese test. Se conserva `test-first-err.txt`; se repite completo
con el override ausente, `LOCALAPPDATA`/`APPDATA` temporales y captura desactivada
en el build. DuckDB se lee de su directorio de desarrollo, sin copiar cachés ni
acceder a ajustes/datos reales. No se cambia el test ni el código de rutas.
La segunda ejecución detectó separadores `/` del runner incompatibles con
`cmd.exe /c mklink` en la prueba de junctions (740 PASS). Se normalizaron sus
rutas temporales a `C:\tmp\...`; el mismo binario/test pasó antes de repetir
la suite. Evidencia `test-second-err.txt` y `shortcut-harness-green.txt`.

| Verificación | Resultado |
| --- | --- |
| Paneles Python offline | 8 PASS |
| Snippet Node, permiso/payload/revocación | PASS |
| Fragmento ISA-1609 e integridad retirada | PASS, 456 huellas |
| Check workspace | PASS |
| Services (hito `a82a283b`) | 122 tests + 2 procesos PASS |
| Fmt y Clippy (`-D warnings`) | PASS |
| Nextest workspace final | 1659/1659 PASS; 7 skips del perfil del repo |
| Lifecycle | 18/18 PASS (5 Engineer + 13 Runtime) |
| Telemetría separada | No requerida: no se modifica runtime/domain/ipc/testdata |

## Pendientes para el orquestador

- **Panel real:** falta clave personal UE. No se ha buscado, leído ni pedido
  por chat. No se ejecutó `--apply`. Revisión y autorización posterior antes de
  escribir; el script no crea cuentas ni contrata servicios.
- **Embudo exacto:** Marketing necesita integrar el snippet en su repo; #1591/
  PR #1600 necesita la elección de Setup, sin cambios desde esta rama. Atribución
  web→app y registro/compra exactos necesitan fuentes y consentimiento durable
  backend. No hay porcentajes individuales web→app sin ese puente.
- **UI:** no consta diseño Opus específico del consentimiento de uso. Se conserva
  la adaptación heredada de tarjeta/casilla Orbit existentes; revisión visual
  pendiente. No hay diseño nuevo, captura ni QA de interfaz física desde CLI.
- **QA aislada:** aceptar/rechazar, reiniciar, cambiar página/foco, ocultar widgets
  por bandeja/sesión/fuera de pista/licencia y revocar en Ajustes. Usar una raíz
  temporal; nunca instalación, ajustes ni datos reales de Isaac.
- La población son instalaciones que aceptan; cola acotada a 32 slots y pérdida
  posible de observaciones. Revocar detiene nuevas observaciones/envíos después
  de revalidar; una petición ya enviada no puede retirarse del transporte. Datos
  ya recibidos requieren procedimiento de borrado remoto separado antes de activar.

Sin dependencias nuevas, instalador modificado, credenciales, producción,
compras/cuentas reales, merge, promoción, release ni anuncio público.
