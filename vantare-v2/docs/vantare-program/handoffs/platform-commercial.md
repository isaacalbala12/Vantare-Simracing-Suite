# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.

## #1612 / VANTA-9 · Perfil privado y Ajustes (14/10/2026)

Rama `vantareapp/isa-1612-perfil-y-ajustes`, base `origin/nightly@0807fbd0`.
[Issue #1612](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1612),
[PR draft #1619 a nightly](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1619),
Plane VANTA-9 / GitHub Project Vantare / area:plataforma.

Ronda 5 CLI en curso tras review r4 de `37ced450` (P2=3, P3=1).
P2-1 corregido en `f00f3607`: RED R1 != R2; GREEN 15/15 piloto.
Una recuperación de recibo sin edición pendiente carga el perfil actual en la
misma llamada; la edición posterior usa R2. La negativa con B pendiente conserva
el CAS histórico, sin sobrescribir C. P2-2 RED: rechazo 22023 conserva A; presupuesto
de foto permite crear A incompatible. GREEN 16/16: preflight del presupuesto,
retiro durable de A rechazado, borrador conservado y revisión actual cargada;
reabrir no resucita A y B corregido se confirma tras otro reinicio. HTTP incierto
y recibos inválidos conservan A. P2-3 y P3-1 pendientes; gates completos pendientes.
P2-2 committed en `11a5511c`. P2-3 RED HTTP500/40001 => Offline y SQLSTATE
40001 != PT409; GREEN: SQL PT409 explícito, clasificación compatible del 500
anterior, retiro del CAS obsoleto y reanclaje R2 sin enviar B automáticamente.
Un único PilotLoad de App carga C/R2 tras recibo y muestra conflicto real; el
borrador/revisión sobreviven al reinicio. SQL 90 pgTAP, concurrencia/PT409 y
retirada 10 postchecks/cuatro negativas PASS, también sin SUPERUSER. PostgreSQL
18/pgTAP instalados desde Ubuntu oficial en WSL; cluster creado por el instalador
detenido, pruebas solo en instancias desechables. P3-1 y gates finales pendientes.
Evidencia `C:/tmp/ola5/1612`, sin cambios visuales, backend solo preparado.

Ronda 4 CLI terminada en rama tras review r3 `8eadf36e` NO APTO (P2-1=1).
Corte Rust/SQL validado y publicado `d9df6b17256f31bc9499772b3aafe3069fe134fa`.
RED exacto: A aún en curso, load ve R, B reemplaza el intento y termina en
Conflict. GREEN: UUID v4 durable con contenido/foto y CAS inmutables; B conserva
su copia local y solo recibe otra clave después de confirmar A. Eliminadas
huellas y reconciliación por SELECT. Servidor preparado: `last_op_id`, recibos
privados por cuenta/op_id y lock transaccional; duplicado devuelve el resultado
original incluso después de un guardado de otro dispositivo.

fmt/check/Clippy `-D warnings` PASS; Nextest 1679/1679 (7 skips existentes,
paridad lenta 125 s), lifecycle 18/18 PASS. Los 15 tests de piloto pasan:
texto/foto, reinicio, confirmación de A/B perdida, edición intermedia, dos
dispositivos y negativas de documento/hash/revisión. Ambos formatos locales
anteriores preservan el pendiente; no recuperan retroactivamente confirmaciones
sin op_id. SQL 90 pgTAP, concurrencia real por barreras, aborto/reintento con la
misma clave, diez postchecks y cuatro negativas de retirada PASS también sin
SUPERUSER. Quality/456 huellas y fragmento PASS. Telemetría no repetida: no hay
cambios en runtime/domain/IPC/testdata. Datos de pruebas aislados, target propio
`native/target/gates`, dos jobs y plazo de 1800 s por gate.

PR draft #1619 actualizada, push d9df6b17 y VANTA-9 Por revisar verificados
14/10/2026 06:27 CEST. Cierre posterior solo handoff/changelog; HEAD final y CI en
issue/PR y buzón. No se declara CI completa verde. Origin/nightly `5a796e89`,
base aprobada `0807fbd0`, PR DIRTY: falta review del SHA nuevo e integración
compilada con #1608 por el orquestador. Sin merge/rebase, promoción ni release.
Evidencia `C:/tmp/ola4/1612`: RED Conflict y GREEN, gates y SQL; conserva también
un primer fixture RED que devolvía Protocol y un fixture antiguo con load extra,
corregidos antes de los gates finales. No son fallos omitidos del gate final.

Backend solo preparado, sin consulta/aplicación de Supabase real. Recibos sin
poda automática: cualquier retención futura debe conservar idempotencia.
Sin diseño/capturas nuevas, login/Storage HTTP reales, juego físico ni validación
integrada. Las fotos del fixture no certifican la API completa de Storage.
Bandera sigue pendiente de colocación diseñada. Sin instalación/datos reales
tocados, herramientas/dependencias nuevas ni subagentes. Siguiente: review del
orquestador; activación backend requiere autorización separada de Isaac.

Histórico ronda 3 CLI tras review r2 `daa2ca20` NO APTO (P2=1/P3=1):
P2-1 reproducido: A confirmado sin respuesta, Guardar B antes de reconciliar
y reiniciar devuelve Conflict. Arreglo `98429184` + `c2a59c4e` (Clippy), GREEN 11/11 servicios:
huella durable del CAS enviado separada del pendiente, reconciliación de R+1
antes de enviar B con revisión real; documento/hash distintos siguen Conflict.
La matriz cubre texto/foto, con/sin reinicio y conflicto real; se prueba también
lectura/edición/reapertura del formato local previo. P3-1 `db7a3783` RED al
cambiar las coordenadas ya enviadas, GREEN 11/11 Hub: zoom/nudge y arrastre
congelados durante busy; respuesta libera la edición. Sin diseño nuevo.
Rust `c2a59c4e`: fmt/check/Clippy -D warnings PASS; Nextest 1675/1675
(7 skips existentes, paridad lenta 114 s), lifecycle 18/18 PASS. Quality y
456 huellas, más fragmento de changelog PASS. Telemetría y pgTAP no repetidos:
esta ronda solo modifica servicios/Hub, sin runtime/domain/IPC/testdata ni SQL;
la evidencia de ronda 2 se conserva como histórica. Datos de tests aislados,
target propio `native/target/gates`, dos jobs y plazo de 1800 s por comando.
Push `c2a59c4e` y PR draft a nightly verificados. VANTA-9 Por revisar verificado
14/10/2026 05:48 CEST. El cierre posterior solo cambia handoff/changelog;
HEAD final y CI constan en issue/PR y buzón. CI final pendiente de ejecución.
Nightly remoto `5a796e89` ha avanzado; GitHub marca DIRTY/conflicto de integración.
La base aprobada permanece `0807fbd0`: review e integración del conjunto con
#1608 pendientes del orquestador, sin merge/rebase, promoción ni release.
Evidencia `C:/tmp/ola3/1612`: también conserva el fallo del test Hub sin
network y el intento de ventana incompatible con Windows headless. La prueba
final ejercita los puntos del modelo que comparten las entradas; no acredita
interacción física ni un worker UI real. No hay capturas nuevas.

Diseño Opus `3aaa3961` conservado: perfil privado local primero, DPAPI por
issuer/subject, foto JPEG 256×256 ≤24 KiB y recorte circular. Puente UUID
existente y CAS; sin cambios en account.rs/account/*, login, pagos ni licencias.
Revisión de ocho páginas en [matriz](../../pilot-settings-review.md). El painter
compartido de bandera/fallback ISO está preparado; falta diseño aprobado de
colocación por widget. No se inventa composición.

Ronda 2 CLI corrige la review Sol (0 P1/4 P2):

| Hallazgo | Commit | Resultado probado |
|---|---|---|
| H1 confirmación perdida | `9a3d3b3f` + `03068639` | Reintento tras HTTP ilegible y reinicio; recupera solo documento/hash idénticos en R+1, otro hash conserva Conflict |
| H2 SQL acepta perfil ilegible | `ae586434` | Tipos/límites/controles/ISO/simuladores y campos futuros legibles; máximos válidos conservados |
| H3 DML elude CAS | `4db253ad` + `5e380ef0` | DML directo denegado; RPC pública INVOKER y escritor CAS privado NOLOGIN/NOBYPASSRLS, sujeto a RLS |
| H4 descripción con Enter | `b487e334` | Guardado/reapertura de dos líneas; UI normaliza CRLF/CR a LF y rechaza otros controles en IPC/SQL |
| H5 cancelar recorte ocupado | `27133332` | Guardia de acciones y botón deshabilitan Cancelar mientras procesa; regresión de la guardia, sin prueba física de worker UI |
| H6 fotos inmutables | `b28cdb4c` + `4e92dbd2` | UPDATE/movimientos y DELETE+INSERT denegados ante policy global adversarial |
| H7 retirada QA | `df21f8c6` + `63b232bc` | Niega falta de consentimiento/perfiles/fotos; retira paquete vacío y conserva cuentas/policies ajenas |

RED→GREEN y logs de esta ronda en `C:/tmp/ola2/1612`. Rust validado
`03068639`: fmt/check/Clippy PASS, Nextest 1672/1672 (7 skips existentes, una
paridad lenta de 123 s), lifecycle 18/18 PASS. Telemetría 25/25 PASS
(corpus largo ACC 898 s, tres tests lentos esperados). Quality y 456 huellas
PASS. SQL `5e380ef0`: 68/68 pgTAP + 9 postchecks de retirada y tres negativas
PASS, PostgreSQL desechable loopback con administrador habitual y con
CREATEROLE sin SUPERUSER. El grant del escritor al administrador permite
transferir ownership; retirada QA con el mismo grantor. [Runbook](../../pilot-profile-backend.md).
Paquete solo preparado, sin aplicar en Supabase. Presupuesto SQL conservador
reserva el máximo de foto dentro de 48 KiB; puede rechazar extensiones cerca del
límite aunque una foto pequeña cupiera, preservando la copia local.

Capturas anteriores y QA de las ocho páginas: `C:/tmp/1612-evidence` (código
`6a5fb75a`); no acreditan el estado ocupado nuevo ni son capturas del HEAD
actual. Sin login/Storage HTTP real, Run/toasts, upgrade ni LMU/ACC físicos;
sin validación compilada del conjunto con #1608. Conserva la separación de
`services/view.rs` y su techo 1750 al integrar ambos PR.

Histórico de ronda 2: push `5e380ef0` verificado; VANTA-9 Por revisar verificado el 14/10/2026
a las 05:10 CEST. El commit de cierre solo cambia handoff/changelog; SHA final
en la issue/PR y buzón `C:/tmp/buzon/1612.md`.
CI se consulta por HEAD final: no se declara verde completa. Nightly remoto
ha avanzado a `552c0d52` por #1607; esta rama conserva la base aprobada
`0807fbd0`, sin merge/rebase ni validación del conjunto nuevo.
Canal alcanzado: rama de issue y PR draft. Sin merge, promoción, release,
producción, instalación/datos reales modificados, herramientas nuevas ni
subagentes. Siguiente: revisión del orquestador; integración y activación backend requieren su
validación/autorización correspondiente de Isaac.

## #1601 / VANTA-10 · Plane, fase de implementación (13/10/2026)

OK de Isaac/orquestador al plan `C:/tmp/ola2/plan-1601.md`: Plane → Supabase
cada 5 min, tres columnas; archivos antiguos retirados, JSON manual del Hub inerte.
Rama propia `vantareapp/isa-1601-roadmap-plane`, base inicial nightly `298abc33`, actualizada con #1599 (`bc89c8b8`).
Implementación inicial `076531ab`; merge documental `162ba486` preservando
reglas de orquestador/estados y autoridad del roadmap Plane. Corte de código `7edf33e6`; SHA final/CI en el PR
[#1603](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1603) a nightly.
Issue [#1601](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1601),
`area:plataforma`, añadida al GitHub Project Vantare; sin versión comprometida.

Implementación local: API v1 CE con páginas completas y memberships, filtro
Infraestructura/Negocio/canceladas, nombres literales, IDs estables y límites
40 tareas/40 KB sin truncar. Mismo documento/rol/RPC v2/v1; sin cambio de esquema.
Hub carga caché y refresca cada 300 s usando el heartbeat y worker IPC existentes;
acciones explícitas conservan prioridad. Tres columnas con later legado en Planeado.
Web preparada aquí; no se edita otro repo. Action/scripts ClickUp retirados localmente.

RED: test de tres columnas perdía later; los cinco tests web fallaban sin polling.
GREEN final: 18 Python, 6 web, 8 Hub + 6 services roadmap; 57 digest, 45 canal
y 26 release-notes; fragmento ISA-1601 validado; script Plane 9 tests PASS.
fmt/Clippy PASS; Nextest completo final 1646 PASS/7 skips; lifecycle 18 PASS;
telemetría 25 PASS (ACC 832 s). Regresión de reintento de caché RED→GREEN.
La repetición de Nextest chocó con el .exe de telemetría abierto; tras terminar
ACC se repitió en serie y pasó. Evidencia `C:/tmp/ola2/1601-*.log`.
SQL PostgreSQL 18.6 local desechable PASS: idempotencia, cambio único, lectura
v1/v2, vaciado/retirada rechazados. Unidades systemd verificadas en copia temporal
con ExecStart=/bin/true; no prueba despliegue. Quality 456 huellas PASS.
Runbook: [plane-roadmap-runbook.md](../../plane-roadmap-runbook.md).
Credenciales/token/roadmap.env, despliegue, timer y primera escritura NO autorizados
ni ejecutados. Cantidad/tamaño del tablero real pendientes de lectura autorizada;
exceso exige parar y preguntar. Cambio de IDs puede exigir aprobación exacta SQL.
Entrega: PR #1603 (`Closes #1601`), auto-merge desactivado por Isaac tras la
revisión independiente; no reactivarlo. CI remota del nuevo SHA pendiente.
VANTA-10 pasa a Por revisar con el
enlace del PR y FIN en buzón. No se afirma merge ni publicación. El orquestador revisa y gestiona #1582, sustituido por
este publicador. QA GUI y tablero real pendientes: las pruebas son locales con
fixtures/corpus; no hay publicación real, deploy ni release.

Corrección de revisión #1603: revisión Sol leída completa y tres regresiones
RED antes del arreglo. Privacidad: 10 subcasos fallaban; ahora exige recuento
`total_issues` entero y coherente en cada module, rechaza privados vacíos
incluso con cero declarado y conserva JSON/SQL anteriores al abortar.
Paginación: 8 subcasos aceptaban respuestas dudosas; ahora rechaza listas
desnudas y metadatos ausentes. Web: `pagehide` con `persisted=true` conserva
controlador/timer; test de dos restauraciones, sin intervalos duplicados,
y cierre definitivo que cancela y retira el listener.
GREEN de esta ronda: 21 Python, 7 web, check/Clippy/fmt, Nextest 1646 PASS
con 7 skips, lifecycle 18 PASS; SQL local, quality 456 huellas, canal 45,
release-notes 26, digest 57 y bash -n PASS. Telemetría no repetida: no se
tocan runtime/domain/ipc/testdata; los 25 PASS anteriores siguen siendo
evidencia de la implementación inicial. Bfcache probado con eventos simulados;
QA web real pendiente. Logs `C:/tmp/ola2/1603-*.log`, tabla RED→GREEN en
`C:/tmp/ola2/fix-1603-results.md`; SHA del push en issue/PR/buzón.
El runbook documenta estas guardas. Sin nuevas acciones de producción.

## 1. Resultado

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

Base incorporada mediante merge (sin rebase): `origin/nightly@b2186f82746424b4844a5909efd31530c5bbe5b3`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v10 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. SQL #1535 no aplicado.

#1565 (repo privado): rama `vantareapp/isa-1565-descargas-publicas` sobre
`origin/nightly@707514e2`; feed en seco a `Vantare-Downloads`, runners
`self-hosted` solo en privado y presupuesto de artifacts. PR, SHA y checks en la
issue y `C:/tmp/buzon/1565.md`. Sin release, firma ni cambio de visibilidad.

## 4. Decisiones cerradas

- Plane es la única fuente del roadmap desde #1601, publicado en Supabase con lectura anon y compatibilidad v1/v2; no depende del repositorio publico. Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v10, servicios v6 y control/derechos v4 son contratos independientes en esta base.
- Account conserva recuperación aun con herramientas denegadas; negar derechos no inventa un login ni un pago.
- Venta pública exige matriz monetaria/reconciliación y autorización. Implementado, integrado, publicado y validado en producción son estados distintos.
- #1565: descargas y feed solo en el repo público `Vantare-Downloads`; sin feed doble ni renovación automática del bootstrap. La 0.0.976 se publica solo allí y cada instalación reinstala con Setup. Free privado: sin branch protection aplicada; deploy de Functions manual sin mover secretos ([repo-privado-1565](../../repo-privado-1565.md)).

## 5. Arquitectura y ownership

[Services](../../../native/services/README.md) posee red bajo demanda; [Hub](../../../native/hub/README.md) presenta cuenta/calendario/actualización y no autentica ni cobra. Supabase/Clerk/Polar se validan en sus entornos autorizados. Admin es privado y no entra en el instalador público. El mapa de procesos vive solo en [native/README](../../../native/README.md).

## 6. Evidencia y límites

#1535: fmt/Clippy PASS; Nextest 1579/1579 (7 skips), lifecycle 18/18 y
telemetria 25/25 en la entrega aislada. SQL corregido tras Sol+Opus: PostgreSQL
18.6/pgTAP 1.3.4 local 20+31 PASS, LOGIN adversarial, aislamiento de cuentas,
aprobaciones caducadas con dos sesiones y auditoria DEFINER EXECUTE+USAGE.
TLS CA/hostname y control de hostname real PASS sin auth/SQL; tres tests Python.
Quality 456 huellas PASS. Evidencia: `C:/tmp/ola2/1535-evidence/`.
El merge actual tuvo conflictos solo documentales; no repetidos gates Rust
por la condicion del encargo. No acredita esquema Supabase completo, CI remota,
configuracion del host de CI, OAuth, pagos, entorno fisico ni produccion.

#1565: QA aislada `TEST_INSTALLER` PASS (Setup 0.0.975 real → datos →
Setup 0.0.976 de la rama: 4/4 datos idénticos, bootstrap renovado, Check solo a
Downloads; instalación real intacta). Paquete QA = binarios 0.0.975 con
`manifest.version` 0.0.976. Evidencia: `C:/tmp/1565-qa/ev/`, `C:/tmp/1565-b/`.
Revisión Sol (`C:/tmp/ola2/review-1592-sol.md`): actualizador y datos OK;
P1 limpieza Windows (cwd bloqueado), P2 `actions: read` y P2 orden Linux
corregidos con regresión; tests de runner/budget/origen conectados a gates.

## 7. Riesgos y deuda

- P1: acceso al abrir LMU (#1568); no dar la causa real por confirmada solo con RED local.
- P1: readiness comercial, identidad y pagos (#1514/#1506/#1507/#1499/#1501); no abrir venta desde docs.
- P2: SQL #1535 corregido y probado localmente; esquema completo, aplicacion y activacion pendientes. P2-4 aceptado por Isaac en #1535.
- Login/logout físico, expiración, recuperación, instalación/upgrade y QA remota requieren evidencia propia.
- P2 #1565: instalaciones que no reinstalen con Setup 0.0.976 antes de privatizar se quedan sin feed; app Go retirada sin actualización.

## 8. Issues terminadas, activas y pendientes

#1530-#1534 y #1536 cerradas; #1570/#1572/#1573 fusionadas en la base indicada.
#1535 en PR #1578; #1568 mantiene correlacion humana pendiente. Abiertas
#1514/#1506/#1507/#1510/#1511/#1515 y gates comerciales: consultar su estado
antes de actuar. IDs migrados y evidencia previa permanecen en el historico.
#1565 abierta: PR de feed/CI a nightly en revisión; runners en #1583.

## 9. Siguiente acción exacta

Verificar CI/auto-merge de #1578. Cuando figure MERGED en nightly, ejecutar
SOLO LECTURA contra produccion la consulta previa (DEFINER alcanzables, ACL y
registro de migraciones) usando acceso ya configurado, sin imprimir secretos.
Escribir DUDA con resultado y comando exacto para las dos migraciones. Si falta
acceso, preparar pasos para Isaac. No aplicar nada hasta respuesta expresa.
P2-4 aceptado por Isaac en #1535; no implica configurar credenciales ni desplegar.

#1565: revisión independiente del PR. Tras integrarlo, Isaac sigue el runbook
(firma única, publicar solo en Downloads, reinstalar, avisar al tester) antes
de cambiar la visibilidad.

## 10. Última actualización

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.

2026-10-13 · GitHub #1565 · Claude. Feed en seco, CI privada y QA aislada;
PR a nightly sin merge ni release.
