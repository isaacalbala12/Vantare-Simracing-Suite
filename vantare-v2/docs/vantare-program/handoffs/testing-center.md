## 2026-10-19 - #1709 / VANTA-96: aislar UUID de pgTAP y Edge

- Run39181530688 completa Edge y suites previas, luego falla en testing_report_rich_admission.test.sql:47 por evidence_batches PK duplicada. Edge y pgTAP reutilizaban lote17090000-...0010/evidencia...0011.
- pgTAP ya usa BEGIN/ROLLBACK, pero ve filas confirmadas por las peticiones Edge previas. Se reserva namespace17090001-* para todas sus cuentas, lotes, evidencias, paths y referencias; Edge conserva17090000-*.
- Ninguna limpieza ni cambio de orden: evidencia/tombstone de Edge conservados, rollback pgTAP conservado, todas las aserciones intactas. No ON CONFLICT ni bypass del fallo.
- Pendiente CI real LF/CRLF y CI completa del nuevo HEAD. Ultima evidencia local Deno88 PASS/2 omitidas y Rust220 PASS/2 omitidas; este arreglo solo cambia literales de fixture SQL y handoff.
- Sin produccion, permisos, migraciones, deploy, secretos, merge a nightly ni release.

## 2026-10-19 - #1709 / VANTA-96: RPC void en transporte del arnes

- Nightly440f3f9a3 (#1716) incorporado por merge0074ec237, sin conflictos/rebase/force-push.
- Run39180038402 ya supera plain/retry/captura y llega al formulario simple. Su RPC testing_report_submit_admitted retorna void (HTTP204 sin body). El adaptador de pruebas llamaba response.json() incondicionalmente: SyntaxError -> Edge503.
- Regresion reproducida local: quitar solo el manejo204 del adaptador produce void_write_became_503; restaurarlo da PASS. Log void-transport-RED.log. No es falta de salt ni permiso: deps.salt esta explicito y no se modifica ACL/configuracion productiva.
- Extraido transporte loopback en supabase/tests/fixtures/postgrest-rpc.ts:204 se convierte a data:null/error:null; JSON no vacio y errores SQL conservan su tratamiento. Tests a traves del handler Edge cubren void204->200, recibo rico y error42501 preservado.
- Deno88 PASS / 2 integraciones omitidas; TS check/lint/fmt, Python compile y calidad462 PASS. Rust220 PASS / 2 omisiones existentes sigue ultima evidencia; no se cambia Rust en este arreglo.
- Pendiente CI completa LF/CRLF del nuevo HEAD. RED de barreras y cierre legacy intactos. Sin produccion, nuevos secretos, permisos, deploy, importacion de claves, merge a nightly ni release.

## 2026-10-19 - #1709 / VANTA-96: contrato Rust/Edge UTF-8 compartido

- Run39178511016: RED ya PASS; completo falla en primer envio del script commercial-report.ts:113 con report_status_400, antes de capturas.
- Causa comprobada en fuente y artefactos: el script tenia mojibake por lectura/reescritura con codificacion incorrecta, mientras serializer Rust, Edge y SQL usan la o acentuada U+00F3. El error se introdujo al editar la fixture, no en el contrato productivo.
- Se elimina la copia manual del cuerpo. Nuevo supabase/tests/fixtures/native-hub-report.json UTF-8 compartido por el arnes real y test Deno; un test Rust compara la serializacion productiva de Submission con ese mismo JSON. Deno prueba sin/con lote y rechaza explicitamente el texto mal codificado.
- No se cambia el cliente productivo ni se amplia la Edge para aceptar etiquetas corruptas. El diagnostico del arnes incluye solo codigo publico de error, sin payloads ni tokens.
- Verificado local: Rust services220 PASS / 2 omisiones existentes (nuevo contrato incluido), fmt y Clippy all-targets PASS; Deno85 PASS / 2 integraciones omitidas; TS check/lint/fmt y calidad462 PASS. Pendiente CI real LF/CRLF del nuevo HEAD; #1710 sigue draft.
- Control RED, ACL, migraciones y nightly bf7e21c61 conservados. Sin produccion, deploy, claves reales, secretos, merge a nightly ni release.

## 2026-10-19 - #1709 / VANTA-96: sid valido en fixture de cierre

- Run39177500314 llega a testing_report_legacy_closed.test.sql: una de 17 aserciones falla, current_account() NULL en vez del UUID propio. Las suites admin y rich-admission anteriores ya pasan en el RED.
- Causa confirmada en contrato B03/B01: sid="fixture" incumple ^sess_[a-zA-Z0-9_]+$. Cambiado solo a "sess_fixture"; se conserva la asercion de identidad ligada y todos los negativos ACL.
- No depende del modo sin barreras. No se cambia el selector --before-private-write-barriers, su grep esperado, orden de suites, grants, funciones SQL ni migraciones.
- Pendiente CI real del nuevo HEAD: RED debe alcanzar y detectar barreras privadas ausentes; catalogo completo debe pasar LF/CRLF. #1710 sigue draft hasta toda la CI verde.
- Rama conserva nightly bf7e21c61 (#1712). Produccion en reconstruccion paralela no se toca; sin deploy, secretos, importacion de claves, merge ni release.

## 2026-10-19 - #1709 / VANTA-96: adaptar fixture admin al cierre

- Run39176062419 fallo en el RED control antes de llegar al control esperado: native_admin.test.sql:70 creaba informe como authenticated via RPC legacy ya cerrada.
- Nightly bf7e21c61 (#1712) incorporado mediante merge43af752bc, sin conflicto/rebase/force-push. Produccion reconstruida en paralelo queda fuera de este trabajo; #1710 sera migracion posterior.
- Fixture admin actual crea el informe como service_role mediante adaptador admitido; vuelve a authenticated para mantener RLS propia/ajena y preparacion de capturas. Prueba por separado ACL legacy cerrada y membership del adaptador nuevo; no se reabre EXECUTE.
- Runner historico conserva su recorrido pre-corte solo si el adaptador aun no existe. Suites historicas de checkpoint no se convierten en pruebas del catalogo actual.
- Pendiente nueva CI real LF/CRLF y checks completos del HEAD. No afirmar PASS ni sacar draft antes. Sin cambios remotos Supabase, deploy, secretos ni release.

## 2026-10-19 - #1709 / VANTA-96: ES256 y workflow real incorporados

- #1708 fusionado por el orquestador en nightly147372fa9. Merge local 352f31620 en rama propia #1710, sin conflictos, rebase ni force-push.
- Regresion real del corte: legacy403 tras la migracion de cierre; handler Edge real verifica ES256/kid, resuelve cuenta por SQL y usa admision/adaptador reales via PostgREST. Plain/retry/ready JPEG fixture, cuota compartida, RLS de informe nuevo y tombstone.
- La expectativa200 de #1708 era correcta antes de la nueva migracion. Se sustituye por403 con prueba positiva por Edge; no por un >=400 sin evidencia.
- Nuevo script commercial-report.ts solo loopback, tokens TEST por stdin; cache del workflow ampliada para sus imports. Nada de Supabase remoto.
- Deno85 PASS / 2 integraciones omitidas; typecheck/lint TS, Python compile PASS. Rust services219 PASS / 2 omisiones previas; este merge no cambia Rust. CI real LF/CRLF y CI completa del HEAD pendientes; PR #1710 sigue draft.
- Siguiente: corregir cualquier fallo del arnes real y entregar solo CI verde. Sin produccion, deploy, secretos reales, importacion de claves, merge a nightly ni release en este worker.

## 2026-10-19 - #1709 / VANTA-96: cierre preparado despues del cliente

- PR draft #1710. Primer commit 72e15fdd2 ya subido: cliente Edge con/sin capturas + compatibilidad SQL, sin revocar permisos.
- Segundo paso: migracion 20261018224803 retira EXECUTE a PUBLIC/anon/authenticated/service_role en base, evidencia e inner legacy. Preparar/finalizar capturas conserva permisos; nuevo adaptador solo service_role.
- Regresiones pgTAP de recibo/reintentos, membership/canal, lote ajeno/pendiente/listo, borrado, privacidad y ACL de las tres firmas preparadas y conectadas al arnes. NO ejecutadas aun: esperan PostgreSQL/PostgREST real de #1702.
- Verificado local: Deno 20 PASS / 1 integracion omitida; Rust services 219 PASS / 2 omisiones existentes (incluye proceso real y 19 reportes), fmt y Clippy all-targets PASS; calidad 462 PASS. El primer fallo de Clippy (test >100 lineas) se corrigio separando comprobaciones, sin quitar cobertura.
- Pendiente integrar #1708 y workflow #1702 desde nightly, completar prueba Edge+PostgREST y expectativas B01 con la nueva ACL, pasar CI y sacar draft. No reconstruir produccion por este estado.
- Sin produccion, deploy, claves, secretos, dependencias nuevas, merge ni release. Evidencia C:/VantareServer/evidence/1709-rpc-legacy/.

## 2026-10-19 - #1709 / VANTA-96: implementacion aprobada, fase compatible

- Orquestador aprueba continuar en PR draft #1710; prioridad despues de #1708.
- Services cambia ReportSend con/sin capturas a testing-report-submit; mismo consentimiento, intento durable, recibo y reintento. Hub/IPC sin cambios.
- Edge acepta envelope rico cerrado tras la admision IP/cuenta existente. Cuenta del bearer verificado, nunca del body; misma cuota para formularios y reintentos.
- Migracion 20261018224039 compatible: adaptador service-only y cores privados con UUID, membership y barrera de cuenta borrada. Los permisos legacy siguen vigentes hasta la fase de cierre posterior.
- Deno 20 PASS / 1 integracion omitida; Rust reportes 19 PASS. SQL y arnes real pendientes de #1702 en nightly, ES256 de #1708. No afirmar cierre de seguridad ni CI final verde.
- Rama vantareapp/isa-1709-rpc-legacy-reportes; sin produccion, deploy, secretos, dependencias, merge ni release. Runbook testing-center-legacy-admission-1709.md.

## #1709 / VANTA-96 - Consumidor legacy y propuesta de admision (19-oct-2026)

Encargo del orquestador separado de ES256 #1708. Rama propia
vantareapp/isa-1709-rpc-legacy-reportes, base origin/nightly
999d5950745f73be0e38a1763422f53b515c6866. Worktree
C:/VantareServer/wt/isa-1709-rpc-legacy-reportes. Project Vantare,
area:testing-center, milestone Testing Center testers.

SI hay consumidor legitimo: Hub testing/editor.rs:468 -> ReportSend ->
services/app.rs:880 -> Reports::send -> report.rs:626 llama la RPC sin capturas.
Con capturas usa _with_evidence (:638), wrapper SQL DEFINER que llama la base.
No es solo allowlist/test. Revocar authenticated ahora rompe el envio; cerrar
solo la base tampoco cierra el wrapper con capturas. Web disponible a4ae91da,
admin, Edge y scripts sin caller productivo directo hallado; limites registrados.
Los formularios modernos/triaje usan Edge y coexisten con el formulario rico.

Opcion 3 del encargo: solo inventario/propuesta, commit03627d51a, documento
docs/runbooks/testing-center-legacy-admission-1709.md. Reusar Edge/contadores
(5 intentos/dia y 20/semana UTC por IP/UUID), adaptar transporte Rust sin perder
recibo/consentimiento/retry/capturas, cores privados con UUID y adaptadores
admitidos; cerrar ambas RPC cliente al final. No JWT sintetico ni cuota por
formato. Pruebas/orden de corte definidos; implementacion/riesgo aun pendientes.

Sin migracion/ACL/Rust/dependencias/produccion tocados. Calidad462, politica de
rama y diff-check PASS. Build/pruebas runtime omitidos por alcance documental.
Pendientes PR/CI, workflow real #1702 y decision del orquestador antes de
implementar. No cerrar #1709 como arreglada ni reconstruir produccion solo por
este documento. VANTA-96 En curso. El contenido historico del handoff se
conserva byte a byte: no se normaliza su codificacion mixta fuera de alcance.

## #1594 / PR #1602 · corregir dos gates tras merge · Mac · 14/10/2026

Encargo acotado del orquestador sobre `521f13fa`, rama
`vantareapp/isa-1594-triaje-informes`, inicio limpio. Solo rama local por revisar;
seguimiento/issue/PR a cargo del orquestador por excepción explícita.

- Catálogo común Python/Rust: añade `PilotRejected` existente en nightly;
  igualdad exhaustiva intacta. Python triaje 56/57 → 57/57, connect prohibido.
- `App::execute`: extrae `purchase_reply`, conservando el cuerpo de compra,
  orden, reloj y errores; Clippy 102/100 → PASS, sin allow. No cambia billing.
- F7=C/F8/F9 conservados: 55 de los 56 archivos de entrega siguen idénticos
  al HEAD revisado; la única diferencia es el catálogo. `triage_reply` intacto.

Checks repetidos PASS: fmt; Cargo Domain 164/IPC 79/Profiling 2/Services 155
(400); Clippy mismos crates/all-targets/-D warnings; preview F8 real sintético;
Edge 15/15 + fmt/lint/check; SQL aislado 83/83 + concurrencia/login/snapshot/
rollback/reapply, admisión 27 + F1 17/F1IP 26/F2 6/F3 8; Python followup 4/4;
retirement 456; diff-check. Harnesses/tests del repo sin cambios, SQL en Docker
propio sin red/TCP, contenedor eliminado; preview/envelope/storage idénticos.

No deps, secretos, servicios reales, trackers, GitHub, push, CI remoto,
subagentes, merge/promoción/release ni deploy. Cargo directo, locked/offline,
target propio `native/target/isa1594-mac`, jobs=2 y secuencial: `pwsh` ausente y
cola Win32 incompatible; se conserva la excepción del encargo Mac anterior.
Pendiente Windows: gates completos/check/Nextest/lifecycle/telemetría,
Hub/F9 y capturas/DPAPI/pipes/ACL, QA visual/física. No se acredita producción.

Evidencia actual `~/evidence/1594/INFORME.md`, logs y prueba de conservación en
`~/evidence/1594/fix/`; informe anterior conservado como `INFORME-merge.md`.
SHA final y FIN en `~/orq/1594.buzon.md`. Orquestador: recoger commit local,
revisar diff/evidencia, ejecutar gates Windows y actualizar #1594/PR #1602.
Estados inferiores históricos.

## #1594 / PR #1602 · merge local de nightly en Mac · 14/10/2026

Encargo explícito: revisión r7 APTA; fusionar nightly sin cambiar la lógica.
Rama `vantareapp/isa-1594-triaje-informes`, inicio limpio
`f88af91ecda47711f0e2a16ac65369d769abdf82`, fetch y base nightly
`b9ec75ed5435fb95130946cd207a4fa1ce8b8a64`. Entrega local para revisión,
con dos checks fallidos; no se certifican gates verdes ni estado remoto.
Seguimiento a cargo del orquestador; sin trackers, GitHub, push ni subagentes.

Conflictos resueltos combinando ambos contratos:

- `hub/src/services/view.rs`: `clear_pilot()` de nightly junto a
  `clear_participation(cx)` de #1594; invalidación de sesión y editor conservados.
- `ipc/src/services_protocol.rs`: versión 9 de #1594/#1610 junto al módulo
  `pilot_document` de nightly; variantes de ambos contratos conservadas.
- `services/src/app.rs`: `triage` y su inicialización junto a
  `pilot`/`pilot_identity` y sus inicializaciones; despacho combinado conservado.

F7=C intacto (prosa local), F8 conserva admisión/preview/retry exactos y F9
fixed → Arreglado. 56 archivos de SQL/rollback/Edge/worker/fixtures/servicio de
triaje/UI de Testing idénticos byte a byte al HEAD revisado.

Mac arm64: fmt/diff-check/retirement PASS. Cargo locked/offline, target propio
`native/target/isa1594-mac`, jobs=2: Domain 164, IPC 79, Profiling 2 y Services
155 PASS (400 total, sin contar otra vez dos ejecuciones hijas). Preview nativo
F8 sintético → Edge 15/15 y fmt/lint/check PASS. SQL en Docker existente, sin red,
socket interno y actor NOSUPERUSER: triaje 83/83 + concurrencia/login/snapshot/
rollback/reapply; admisión 27 checks + F1 17/F1IP 26/F2 6/F3 8 PASS; preview,
envelope Edge y storage idénticos. Contenedor propio eliminado. Python followup
4/4 PASS; Python triaje 56/57 con connect prohibido.

Fallos conservados sin modificar catálogo/tests/lints/lógica: nightly añade
`PilotRejected`, ausente del catálogo cerrado y detectado por igualdad exhaustiva
en Python. Clippy `-D warnings`: `App::execute` pasa a 102/100 líneas al combinar
piloto y triaje. Primer SQL falló por permisos de socket en volumen macOS;
repetición con socket interno PASS, harness/SQL del repo sin modificar.

Sin `pwsh` en Mac; cola versionada Win32 no disponible. Los `cargo test -p`
solicitados se ejecutaron directamente, secuenciales, target propio/jobs=2.
Pendientes Windows: gates completos por cola (check/Clippy/Nextest/lifecycle/
telemetría), Hub/F9, capturas/DPAPI/pipes/ACL y QA visual/física. No deps nuevas,
CI remoto, merge de PR, promoción, release, deploy, proveedor, servicios reales,
credenciales ni informes reales. Único merge: nightly dentro de esta rama local,
autorizado por el encargo.

Evidencia `~/evidence/1594/INFORME.md`, inventario `merge-files.tsv` y prueba de
identidad `reviewed-logic.json`; SHA y FIN en `~/orq/1594.buzon.md`.
Orquestador: recoger/revisar merge, decidir ajustes de catálogo/dispatcher,
ejecutar gates Windows y actualizar #1594/PR #1602. Estados inferiores históricos.

## R7 F8/F9 · 14/10/2026 · entrega CLI por revisar

#1594 / VANTA-38/49 Por revisar, actualizado y releído con script oficial.
Proyecto Vantare/In Review, area:testing-center, issue OPEN y sin milestone.
Rama vantareapp/isa-1594-triaje-informes; inicio limpio bb1d7bb3 y base/merge-base
nightly e5c90be5, vigente al cierre. PR #1602 draft a nightly, auto-merge OFF,
MERGEABLE/BLOCKED al consultar código; mergedAt null. Sin integración/release.

Commits separados publicados: F8 f27df31a20d9f4a4487649e25f5c3eb88593cf01;
F9/código final 890e2473fe0d16dce14f75f8d61759e1a615e972. F8 cambia el envío
al camino admitido de #1610 (Edge → RPC exclusiva service_role) y conserva
cuenta/IP/consentimiento, UUID v4, contexto/adjuntos, reintento exacto y follow-up.
V2 sigue cerrada en SQL y puente; F7=C mantiene toda prosa local. F9 conserva
fixed → Arreglado junto a recibos legacy, sin diseño visual nuevo.

Migración nueva candidata 20261014115717_testing_triage_admitted, tras
participación/triaje/followup/admisión IP; down preserva datos/presupuestos y
no reabre RPCs. SQL/rollback original aprobado #1594 idénticos (0fd57395...cf6c9
/ 206dd635...4e621). Sin aplicación SQL remota ni despliegue de Edge/worker.

RED/GREEN propio conservado: ruta/UUID nativos, Edge 400, adaptador SQL ausente;
F9 [No aceptado, Recibido] → [Arreglado, Recibido]. SQL combinado: 27 checks,
F1 17/F1IP 26/F2 6/F3 8 sin grants sintéticos; preview nativo preparado/enviado
por HTTP loopback, envelope del handler Edge y storage local idénticos.
Sin admisión IP/cuenta en Edge no se invoca storage; clientes/worker no tienen
EXECUTE del adaptador. La autoridad es el servidor Edge/service_role, como en
#1610. Pruebas Edge con identidad/admisión/RPC inyectadas, sin gateway ni
PostgREST remoto. PostgreSQL desechable con actor NOSUPERUSER y sin TCP.
#1594 aislada 83/83, concurrencia/login/snapshot/rollback/reapply PASS.

Gates completos sobre fuente final 890e2473: fmt/check/Clippy PASS, Nextest
1739/1739 (12 skips del perfil, 1 lento PASS), lifecycle 18/18 (5+13),
Python triaje 57/57 con connect prohibido y followup mocks 4/4, Deno Edge
15/15 más fmt/lint/check, quality/retirement 456 y diff-check PASS.
Target exclusivo E:/tmp/isa1594-native-gates, compilar.ps1 y jobs=2; sin nuevas
deps, allow, baselines ni tests debilitados. Telemetría dedicada no repetida:
ningún runtime/domain/ipc/testdata cambió en r7. Cierre posterior solo docs;
HEAD/push y CI exactos del cierre en comentario de issue/PR y buzón.

[Regresiones r7](../../../../tools/triage/review-1602-r7-regressions.md),
[contrato combinado](../../runbooks/testing-report-followup.md).
Evidencia/manifest E:/tmp/isa1594-r7-evidence/. Diff completo revisado.
CI de código: promotion/ratchet SUCCESS; GitGuardian FAILURE; blocking gates
/native-linux aún IN_PROGRESS. No se certifica CI completo verde.
Próximo paso: re-review del orquestador y clasificación del check, sin auto-merge.

Sin subagentes, producción, informes reales a T3/Intake, proveedor, deploy,
sal/tokens/LOGIN/cron nuevos, instalación real, merge/promoción/release ni pagos.
QA visual/física y telemetría dedicada omitidas por alcance. Manual pendiente:
fixed + recibo legacy → Arreglado; nota distintiva ausente de preview/retry,
en build aislada con componentes v9. Gateway #1610 necesita prueba de origen
antes de activar; SQL/Edge/cliente se revisan/despliegan juntos con autorización.
Menor contexto diagnóstico, contenido mínimo no acreditado y pendientes antiguos
con prosa en cuarentena permanecen como riesgos. Hitos inferiores históricos.

## R7 F9 · 14/10/2026 · hito local, gates completos en curso

#1594 / VANTA-38/49 En curso. F8 publicado en
f27df31a20d9f4a4487649e25f5c3eb88593cf01 (remoto idéntico).
F9: session_reports_panel usa un mapeo probado que conserva fixed → Arreglado;
declined → No aceptado, desconocidos → Estado no disponible. Sin diseño nuevo.
Regresión con contribución fixed/versión/fecha y recibo legacy submitted:
RED [No aceptado, Recibido] → GREEN [Arreglado, Recibido]. Focal r7/retry 3/3
PASS. Fuente final de ambos hallazgos bajo gates workspace en serie por cola.
F7=C intacto, sin runtime/domain/ipc/testdata cambiado ni telemetría nueva.
PR #1602 draft a nightly, auto-merge OFF; sin integración/deploy/producción.
Próximo paso: gates completos y cierre/push/Por revisar con HEAD verificado.
[Regresiones r7](../../../../tools/triage/review-1602-r7-regressions.md).

## R7 F8 · 14/10/2026 · hito local, gates completos en curso

#1594 / VANTA-38/49 En curso verificado. Inicio limpio bb1d7bb3; nightly
e5c90be5 vigente y ancestro. Review r6 entera: F8/P1 y F9/P2, sin P3 nuevos.
Cliente de triaje → Edge #1610 → RPC server-only nueva, conserva paquete exacto
y follow-up. V2 directa cerrada, también en la allowlist nativa. UUID v4
compatible con Edge. F7=C intacto: ningún texto libre exportado.

Migración candidata 20261014115717_testing_triage_admitted, posterior a
admisión IP #1610; down preserva datos/cuotas y no reabre v2. Cuenta resuelta
por JWT verificado, IP gateway/HMAC, presupuestos durables antes del cuerpo,
consentimiento/items/hashes/membresía y reintento exacto conservados.
SQL original aprobado #1594 intacto. Sin SQL remoto nuevo.

RED/GREEN: ruta/UUID nativos, Edge 400 y adaptador SQL inexistente. GREEN:
23 pruebas triaje; focales r7/retry 3/3; Edge 15/15; SQL combinado 27 checks
con preview nativo enviado por HTTP loopback y envelope del handler Edge
idénticos; F1 17/F1IP 26/F2 6/F3 8 sin grants sintéticos. #1594 aislada
83/83, concurrencia/login/rollback PASS. Python 57/57 sin connect y mocks
followup 4/4, quality/retirement 456 PASS. Gates workspace en ejecución.
Sin runtime/domain/ipc/testdata cambiado: telemetría dedicada no repetida.

F9 RED (fixed + recibo legacy → No aceptado); ajuste local GREEN → Arreglado,
pendiente de su commit propio/gates. [Reproducción r7](../../../../tools/triage/review-1602-r7-regressions.md).
Evidencia E:/tmp/isa1594-r7-evidence/. Sin subagentes/deps, producción/envíos
reales, proveedor/deploy/tokens, auto-merge, merge, promoción o release.
PR #1602 draft a nightly. Próximo paso: gates, commit F9, push y re-review.
Límites de gateway/activación #1610 pendientes. Snapshots inferiores históricos.

## F7=C · 14/10/2026 · entrega CLI por revisar

#1594 / VANTA-38/49 Por revisar; proyecto Vantare/In Review,
area:testing-center, issue OPEN y sin milestone. PR #1602 draft a nightly,
auto-merge OFF; sin merge de PR, promoción ni release. La decisión de Isaac
excluye todo texto libre escrito por el tester: título/cuerpo/notas/pasos locales,
UI explícita y etiquetas SQL fijas. No se intenta anonimizar prosa.

Proveedor, T3, Intake directo y replay omiten título/cuerpo y títulos de
duplicados; summary fijo, preliminary_fix=null y reasons=[]. Log JSON de 300
registros máximo, eventos cerrados, hardware numérico/booleano y valores
catalogados; sin nombres CPU/GPU. Valores y huellas de F6 conservados. El resumen
cerrado no pasa por redacción de nombres de perfil: no pueden modificar sus
claves, etiquetas, fechas o SHA256. La redacción nativa anterior queda solo
en los tests históricos. TestingAnswer/TestingContribute/Report tampoco envían
los campos escritos. Recibos legacy confirmados conservados como historial;
pendientes con prosa se preservan en cuarentena, sin reenviar otros bytes bajo
el mismo id. Las imágenes de la ruta histórica se conservan y no entran en IA.

Sin texto no se acredita la regla anterior de 200 caracteres: contenido_minimo=no
y valido se degrada a dudoso. No hay checklist ni aceptación para descuento
inventados. El worker versionado permanece inerte; esta entrega no despliega.

Commits: F7 cbb3b2afd3110ab934e28c0e89414f13bff800f9; merge de nightly
8194c949 en 10d2b4394a7d05b25ce3229610d4c5f12fb7594a; merge de nightly
e5c90be5 en 4083e4fcd8b2cb6379f829625b05c65140b0b5ec; corrección de metadatos
cerrados 4557b5d59d08a9b0c20bb9a8f86925a85d8e8539. Push verificado en cada
hito. Ocho conflictos del primer merge y uno del segundo resueltos conservando
Edge/historial/avisos/crédito #1610, analítica consentida #1609 y revocación
#1615 antes de persistir identidad, más cancelación de triaje. Services IPC v9
combina los contratos: recompilar Hub/services juntos; peers v7/v8 rechazados.

Gates locales: workspace fmt/check/Clippy PASS; Nextest 1736/1736 (12 skips,
1 lento PASS) y lifecycle 18/18 sobre 4083e4fc. Tras el ajuste final exclusivo
de services: fmt/check/Clippy y Nextest 165/165 PASS, incluida la regresión de
metadatos contra nombres de perfil. Telemetría 25/25 PASS sobre 10d2b439,
ACC lento 774 s PASS; reutilizada porque sus fuentes/contrato/filtro permanecen
idénticos. El delta adicional en runtime es solo rights/tests.rs, fuera de ese
perfil; queda cubierto por Nextest final. Python 57/57 con sockets prohibidos,
followup mocks 4/4, quality/retirement 456 y diff-check PASS. No pnpm: UI Rust/GPUI.

RED/GREEN y fallos iniciales conservados en E:/tmp/isa1594-f7-evidence/.
Cola versionada, jobs=2, timeout 3600 s por gate y target propio
E:/tmp/isa1594-native-gates. Sin dependencias, supresión de lints ni expectativas
de privacidad debilitadas. La documentación final no modifica código y no
repite compilación. SQL/pgTAP, proveedor, informes reales, desplegar en .57,
QA visual/física, instalación real y credenciales nuevos omitidos por alcance.

PR MERGEABLE verificado sobre el push de código; DIRTY resuelto. GitGuardian
FAILURE, native-linux y blocking gates pendientes al consultar: no se certifica
CI remoto verde. Cierre documental/HEAD final y última consulta de CI en el
comentario final de issue/PR y C:/tmp/buzon/1594.md. Canal alcanzado: rama
vantareapp/isa-1594-triaje-informes con PR draft; solo fusiones locales de nightly
en esta rama, autorizadas por Isaac. Acciones externas: commits/push,
metadata/comentarios GitHub y estados Plane. Sin subagentes.

[Regresiones y límites F7](../../../../tools/triage/review-1602-f7-regressions.md).
Verificación manual pendiente: en build aislada con Hub/services v9, escribir
una nota distintiva, consentir y revisar el preview; no debe contenerla. Los
reintentos deben coincidir con ese preview. No usar la instalación real.
Riesgos: menor contexto diagnóstico, criterio de contenido mínimo no acreditado
y reintentos antiguos con prosa retirados. R5 y snapshots inferiores son
históricos; F7 pendiente queda reemplazado por esta decisión y entrega.

# Handoff vivo — Testing Center

## R5 F6 · 14/10/2026 · entrega CLI

#1594 / VANTA-38/49 **Por revisar**, actualizado y releído con el script oficial.
Proyecto Vantare/In Review, area:testing-center; issue OPEN, sin milestone.
PR #1602 draft a nightly; STOP merge, auto-merge OFF. Inicio limpio en
ffb5a490; commits heredados conservados. Solo F6 autorizado; sin subagentes.

F6: catálogo compartido `tools/triage/structured-catalog.json` para nivel fijo,
21 tipos reales del enum services + ServicesCommandFailure observado y 13
módulos de crates nativos. Todo valor desconocido/presente → `otro`.
Versiones: SemVer restringido, tres números 0..999999 sin ceros iniciales;
prerelease de etiqueta fija con sufijos numéricos y build numérico, hasta 64
caracteres. Contadores: enteros 0..1.000.000.000, sin bool/float. No se
acepta texto privado por cumplir un alfabeto. Mismo contrato antes del modelo,
para duplicados, al exportar T3/replay y en la frontera directa de Intake.
Rust usa también la gramática en el contexto previo a preview.

Huella: SHA256 calculado sobre JSON canónico de la proyección cerrada, con
prefijo vantare.triage.error.v1:. Excluye message/first_line/fingerprint del
origen, incluso si parece un hash. Referencias del modelo deben corresponder
al extracto calculado. Marca de contrato creada dentro del worker después de
validar; nunca procede del informe/modelo. Spools anteriores descartan refs
de error, mantienen ACK independientes y no llaman de nuevo al modelo.

22 fixtures estructuradas compartidas (F6 exacto, sk-proj/IP/MAC/UUID/nombre,
SemVer y límites), tres hashes esperados compartidos y test de procedencia
contra enum/crates. Errores SQL válidos con type o fingerprint privados por
separado; seis recorridos modelo → T3/cuerpo HTTP mock → POST Intake mock,
eco de valores recibidos, replay y referencias forjadas. Corpus r1-r4 intactos;
fixtures compatibles cambian 1.0 a 1.0.0 y refs simuladas por hashes derivados.
No se elimina ninguna comprobación de privacidad/recuperación/autoridad.

Hito F6 publicado y remoto idéntico:
**254c62c7fb931443a7f2041a04148ed5e237e01f**.
Gates finales locales: **fmt/check/Clippy PASS**, **Nextest 1663/1663**
(7 skips, 1 lento PASS), **lifecycle 18/18**, **Python 54/54** con sockets
prohibidos, **quality 456** y **diff-check PASS**. RED Python (25 subcasos)
y Rust (F6 exacto) conservados. Primer full Python: fallo de fixture 1.0,
corregida a 1.0.0; la suite final incluye siete tests F6 y todas las anteriores.
[Reproducción y límites R5](../../../../tools/triage/review-1602-r5-regressions.md).

Cola versionada, timeout 3600 s por gate, jobs=2; target exclusivo
E:/tmp/isa1594-native-gates. Wrapper DuckDB comparado: solo cwd/target difieren,
defaults de los demás crates conservados. Evidencia E:/tmp/isa1594-r5-evidence/.
El catálogo JSON debe acompañar los .py al preparar despliegue. Sin dependencias
ni lints/tests debilitados. Handoff histórico preservado sin convertir su
encoding mixto. Base común bc89c8b8400a0a7915e7496b6f339d8e8231359b;
origin/nightly consultado 5a796e89646aba0f233a83a25700506b74940e98.

**F7 pendiente de decisión de Isaac**: título/descripción, escapes y texto
libre no se modifican ni se certifican seguros. Pendiente re-review del
orquestador; PR previamente DIRTY/GitGuardian FAILURE. Sobre el push F6,
GitHub devuelve mergeStateStatus UNKNOWN y checks aún ausentes; no se
certifica CI verde ni resolución de conflictos. Sin merge/promoción/release.
Sin proveedor, informes reales a T3/Intake, despliegue, cron, token/LOGIN/
password ni acciones Supabase prod nuevas. Acciones externas autorizadas:
commits/push, comentarios GitHub y estados Plane. SQL/pgTAP, telemetría y
QA visual/física no repetidos por ámbito (sin SQL/runtime/domain/ipc/testdata).
Riesgos: menor precisión de agrupación, refs legacy omitidas y versiones
incompletas sin trazabilidad. Canal alcanzado: rama de issue con PR draft.

## R4 F5 · 14/10/2026 · entrega CLI

#1594 / VANTA-38/49 **Por revisar**, actualizado y releído con el script oficial.
Proyecto Vantare, area:testing-center; issue OPEN/In Review, sin milestone.
PR #1602 draft a nightly, STOP merge, auto-merge OFF. Reanudación limpia en
5d62f624; commits heredados conservados, sin subagentes ni diseño visual nuevo.

F5 cambia el contrato: **ningún log crudo llega al modelo, propuesta T3 o
Intake**. Solo campos cerrados y acotados de JSON completo; fuera messages,
first_line, nombres libres, payload y claves arbitrarias. Rechaza prefijos,
texto libre, JSON inválido y claves duplicadas. Los adjuntos privados del owner
conservan su almacenamiento y retención. Rust valida metadata observada;
Python aplica la proyección externa. La forma privada SQL conserva errores
(type/message/fingerprint) y eventos (name/at): message es un código fijo y
name/at quedan solo para el owner. Sin cambios SQL ni nuevas acciones prod.

Título/cuerpo: una línea, 120/1000 caracteres; inspección completa antes de
truncar o normalizar. Ante marcador, campo entero sustituido por
`[contenido retirado por privacidad]`. Igual para duplicados y textos del
modelo. Fallback por líneas eliminado en Python/Rust. Spools antiguos pasan por
el contrato actual al exportar, sin reanálisis; se conservan ACK independientes.
Un cuerpo/log descartado no acredita contenido mínimo/evidencia.

Hitos publicados: lista blanca **134c050f7a25c4e435218b8595c3805770b008bd**;
compatibilidad SQL privada **674d4c4431aa140365e458d16197bc3190c8d63d**.
Gates finales sobre 674d4c44 y árbol limpio: **fmt/check/Clippy PASS**,
**Nextest 1661/1661** (7 skips, 1 lento PASS), **lifecycle 18/18**,
**Python 47/47** con sockets prohibidos, quality **456** y diff-check PASS.
Sin dependencias, tests ni lints debilitados. Fallo inicial Clippy doc_markdown
conservado y corregido con backticks, sin allow. Primera tanda verde repetida
porque el ajuste de compatibilidad era posterior a la compilación inicial.

Corpus compartido: 40 F5/campo vacío + 43 previos, límites/idempotencia y cuatro
proyecciones escalares. Propiedad offline: 166 recorridos modelo/T3/POST Intake
mock con resumen limpio/generado, más replay antiguo sin reanálisis. F5 exacto,
JSON prefijado/completo/truncado/anidado, Authorization/asignación multilínea y
LF/CRLF/CR. Rust ejecuta prepare/preview; prueba la forma admitida por SQL y
mantiene presupuesto HTTP/hash/reintento exacto. Fixtures previas adaptadas al
contrato sin quitar comprobaciones de privacidad, referencias ni recuperación.
[Reproducción y límites](../../../../tools/triage/review-1602-r4-regressions.md).

Evidencia RED/GREEN, comandos y manifest SHA256 en E:/tmp/isa1594-r4-evidence/.
Cola native/scripts/compilar.ps1, jobs=2, timeout 3600 s, target exclusivo
E:/tmp/isa1594-native-gates. Wrapper comparado con el original: solo cwd/target.
Base común bc89c8b8400a0a7915e7496b6f339d8e8231359b; origin/nightly consultado
552c0d52e24310923c76a4dceb6aed4e60cd33af. GitGuardian FAILURE y PR DIRTY
verificados en el hito de código; no se certifica CI remoto verde. Re-review,
clasificación del check y conflictos/integración quedan al orquestador.

Sin merge, promoción, release, proveedor, despliegue, cron, token/LOGIN/password
ni informes reales a T3/Plane/Intake. Actualizaciones autorizadas: commits/push,
PR/issue y estados Plane. SQL/pgTAP, telemetría y QA visual/física no repetidos
(no se toca SQL/runtime/domain/ipc/testdata); sus resultados anteriores son
históricos. La omisión de texto libre y campos completos puede reducir contexto.
La propiedad se limita a la batería sintética; no afirma anonimización universal.


## R3 F4 · 14/10/2026 · entrega CLI

#1594 / VANTA-38/49 **Por revisar**, actualizado y releído mediante el
script oficial; proyecto Vantare, area:testing-center. PR #1602 draft a
nightly, auto-merge OFF y STOP merge. Hito F4 publicado en
**6b41d9ff2ee6b19e29f71342388012164f1d4520**. Worktree inicial limpio en
87950380; todos los commits heredados se conservan.

F4: se elimina la normalización de comillas escapadas. Python/Rust parsean
JSON, redactan por clave/valor y vuelven a serializar, incluidos strings
JSON anidados. Claves normalizadas, presupuesto de 32 niveles y omisión
conservadora ante JSON inválido o fragmento ambiguo. Hardware y resumen de
sesión nativos pasan por el mismo recorrido. Orden canónico explícito con
sort_all_objects para mantener paridad con preserve_order del workspace.

43 casos compartidos: F4 exacto, escapes/Unicode, grafías de claves,
anidación/strings JSON, valores numéricos y varios campos privados en texto.
Python cubre 24 recorridos modelo/T3/Intake mock con summary limpio/generado;
Rust cubre título, cuerpo, adjunto y resumen de sesión del preview RPC.
RED original Python/Rust conservado; primer Nextest falló por orden de
claves, corregido sin tocar expectativas/features ni suprimir lint.

Gates finales locales: fmt/check/Clippy PASS, Nextest **1659/1659** (7 skips,
1 lento PASS), lifecycle **18/18**, Python **42/42** con sockets prohibidos,
quality 456 huellas y diff-check PASS. Cola original, jobs=2, timeout 3600 s,
target exclusivo E:/tmp/isa1594-native-gates; wrapper comparado con el
versionado, solo cwd/target distintos. Evidencia RED/GREEN y comandos en
E:/tmp/isa1594-r3-evidence/; [reproducción r3](../../../../tools/triage/review-1602-r3-regressions.md).

Base común bc89c8b8400a0a7915e7496b6f339d8e8231359b; origin/nightly
consultado 0807fbd0d3d8e354706c580f1bc5f60469b202b4. GitGuardian FAILURE y
PR DIRTY verificados sobre 6b41d9ff; CI remoto no verde. Orquestador: re-review,
clasificación del check y resolución de conflictos/integración autorizada.
Sin merge, promoción, release, proveedor, deploy ni informes reales enviados.
Sin cambios SQL ni nuevas acciones Supabase prod; SQL/pgTAP/telemetría y QA
visual/física no repetidos por el ámbito de esta corrección. Los resultados
anteriores son históricos. La omisión conservadora puede quitar contexto
público; no se certifica anonimización universal de texto libre.

Historico r2 #1594 / VANTA-38/49: F1 (P1), F2/F3 (P2) de la re-review r2
corregidos y publicados. VANTA-38/49 Por revisar verificado el 14/10/2026.
PR #1602 draft a nightly, auto-merge OFF, sin merge ni despliegue. Migración
anterior preservada; ninguna acción de Supabase prod en esta reanudación.

Gates locales finales: fmt/check/Clippy PASS, Nextest 1658/1658 (7 skips),
lifecycle 18/18, Python 39/39 y quality 456 huellas PASS. Fallo inicial de
Clippy en la fixture F3 conservado y corregido con BTreeSet::new sin allow.
Commits F1 8add5b53, F2 2f715252, F3 ac366da0; cierre de lint/evidencia aparte.
GitGuardian FAILURE y conflicto con nightly verificados en ac366da0; CI
remoto no verde. Isaac coordina re-review/integración. No proveedor activo,
envíos reales a T3/Intake, cron, LOGIN/password ni release nuevos.
[Tabla y reproducción r2](../../../../tools/triage/review-1602-r2-regressions.md).
Evidencia local E:/tmp/isa1594-r2-evidence/ con manifest SHA256.

## Re-review r2 · 14/10/2026

F1: RED Python reproduce fuga de JSON normal/escapado en modelo/propuesta/T3/
POST mock Intake. RED Rust falla en prepare/preview para accountId escapado.
Normalización acotada de comillas escapadas, sin decodificar JSON/Unicode;
username JSON entra al mismo filtro. Regresiones review_r2_f1_json_representations_*
cubren profundidad 0–3, resumen generado e idempotencia. Evidencia local
E:/tmp/isa1594-r2-evidence/f1-*. Gates completos: ver cierre r2 arriba.


[Histórico anterior por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/testing-center.md).
[Contrato y runbook de esta entrega](../../runbooks/testing-contribution-triage.md).

## 1. Resultado

Cliente IPC v7: informe de texto con juego/build, app/canal, CPU/GPU/RAM/Windows,
log reciente acotado y resumen de errores/eventos reales de servicios. Cinco
casillas, consentimiento externo desmarcado, vista previa del mismo payload y
reintento con UUID/bytes idénticos. Editar invalida preview/consentimiento;
logout/cambio de cuenta cancela la preparación. Capturas conservan su flujo.
PostHog ausente queda NULL. Displays, percentiles y fragmento sin fuente no se
inventan; el resumen local funciona sin PostHog. DTO v10 y derechos v4 no cambian.

Worker Python estándar en tools/triage, disabled por defecto antes de leer
credenciales o iniciar red/modelo. Lee columnas autorizadas, minimiza y redacta,
invoca DeepSeek V4.1 Flash por OpenCode sin tools y valida la propuesta.
Reintentos de entrega HMAC no reanalizan; SQLite solo contiene metadata.
Los candidatos duplicados también requieren consentimiento IA; títulos legacy
sin triage-v2 no entran al proveedor. Percentiles medidos pueden ser evidencia
sin exigir un adjunto de log.
No instalado, sin timer/webhook/credenciales creados. Solo un owner autenticado,
tras orden humana expresa, confirma con review; el modelo no acepta informes.

## 2. Autoridad

Manda el diseño r2 completo C:/tmp/ola2/diseno-1594-opus.md y el encargo de Isaac.
Leídas #1594/#1593 y el paquete mínimo #1535. SQL completo, rollback y hashes se
entregaron como DUDA/PARA en C:/tmp/buzon/1594.md. OK posterior del orquestador:
SQL 0fd57395...cf6c9, rollback 206dd635...4e621, cuarto parámetro snapshot,
topes UTC, purga sin cron y rol sin contraseña. Condiciones escritas de
privacidad y despliegue requieren autorización aparte.

Plane es el tracker de trabajo según nightly vigente; GitHub conserva código,
issue y PR. #1599 faltaba al inicio (buzón), incorporado después; En curso
actualizado y verificado con su script oficial. GitHub area:testing-center,
Project Vantare, sin milestone de versión inventado.

## 3. Canal y hitos

Rama vantareapp/isa-1594-triaje-informes; base inicial nightly a0f8569b.
Nightly bc89c8b8 incorporado mediante merge 1f8721eb, con #1595/#1599.
Hitos locales: SQL/tests 1358eb71, prueba de producción 91e2f1af,
cliente/worker 2b520e1f. Corrección del puente/resumen 1bb104ac y privacidad del worker 1f4ef175.
PR [#1602](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1602) a nightly, enlazado a este hilo T3.
Push publicado; CI/merge remotos se verifican en PR e issue, no son gates locales.
Nightly no equivale a master/release. No se ha desplegado el worker.

## 4. Decisiones cerradas

- El worker propone; review(uuid,text,text,jsonb) exige owner, nota y snapshot.
- Ventana comercial de 45 días y pérdida del tramo por spam quedan en #1593.
- Purga preparada, sin instalar ni registrar pg_cron. Rol NOLOGIN sin password.
- Proveedor bloqueado hasta condiciones escritas de pasarela/subencargado,
  región, retención, entrenamiento y contrato; no se afirma ZDR.
- No emails/tokens/rutas de usuario sin anonimizar. Doble redacción y extracto
  mínimo; account_id y posthog_session_id no llegan al proveedor.
- Datos ausentes y errores se muestran sin inventar contexto o éxito remoto.

## 5. Arquitectura y ownership

Hub presenta el editor; services captura/prepara y posee puente/red; IPC limita
el frame ampliado a TriagePreview. Supabase guarda contexto/adjuntos/revisiones
con RLS forzada y RPC autorizadas. Worker tiene SELECT limitado a 30 días,
sin account_id ni revisiones. anon/service_role no acceden a tablas nuevas.
El orquestador verifica HMAC/caducidad/dedupe y solicita decisión humana.
[Despliegue preparado](../../../../tools/triage/README.md), requiere otro OK.

## 6. Evidencia

SQL local 83/83 pgTAP PASS: consentimiento, aislamiento, idempotencia, hash,
retención, topes UTC, dos sesiones concurrentes, login real del rol de lectura,
rollback con datos denegado, rollback vacío y reaplicación. Ensayo sobre esquema
vigente 83/83 PASS. Backup protegido y restore completo sin red: 73 conteos
exactos. Aplicación autorizada ombjshwzqgeisazijduq, history 20261013160000;
postcheck local y producción 25/25 PASS (anon/authenticated/service_role/triage).
73 conteos originales preservados salvo history +1; tres tablas nuevas vacías.
Gate nativo cerrado, cron ausente, NOLOGIN. Sin rollback ejecutado.
Evidencia protegida C:/tmp/ola2/1594-backup-cli/; hashes SQL intactos.

Worker inicial 16/16 tests offline PASS; quality 456 huellas PASS. Captura real de PC
verificada sin imprimir valores personales. Regresiones de envío incierto,
consentimiento GPUI y frame escapado preparadas. fmt/check/Clippy PASS; Nextest 1650/1650 PASS (7 skips), incluido el
reintento por submit_v2 y el resumen local. Lifecycle 18/18 y telemetría 25/25 PASS (corpus ACC completo).
Primer build se interrumpió por disco C lleno; target propio copiado a E,
original conservado. Wrapper cambia solo cwd/output, mismos flags/features/checks,
compilar.ps1 obligatorio. Logs E:/tmp/isa1594-final-*.log.

## 7. Límites y riesgos

No prueba JWT/PostgREST/UI de producción, sesión física LMU/ACC, proveedor,
webhook T3 ni instalación del servidor. Membresías nuevas vacías y gate cerrado;
no se abre RLS ni se crea credencial para resolver ausencia. Retención requiere
activar el mecanismo de purga por separado. No hay fuente de percentiles,
displays ni fragmento de simulador en este corte. Informe con capturas conserva
RPC/Storage existentes y su propia autorización. No descuento ni llamadas Polar.

## 8. Trabajo relacionado

#1594 triaje; #1593 elegibilidad comercial; #1535 cuestionarios/contribuciones;
#1452 puente/envío real y QA de identidad; #1521 bot de guardia separado.
Contratos de [Testing Hub](../../../native/hub/src/testing/README.md),
[servicios](../../../native/services/README.md) y [canales](../../branch-channels.md).

## Hito Intake · VANTA-49 (posterior al PR principal)

VANTA-49 creada, hija de VANTA-38, módulo Infraestructura; Por revisar
verificado con plane-estado.py y comentario de PR #1602. Hito separado
8dbcf8273066cbd76c1063cf4726c110d6d610ee, publicado en la rama del PR.
API v1 de CE 1.4.2: publicar cada propuesta de tester, antes de T3, con título,
canal, juego/versión, veredicto/confianza/resumen redactados e ID de contribución.
Sin account_id/email/cuerpo/logs/hardware. Token propio de servidor se crear�
al desplegar, con autorizaci�n; no bloquea c�digo. Token de tracker no se reutiliza.
Intake VANTA ya activado según lectura API 2026-10-13; no se cambió ajuste.

Metadata externa en el work item asociado (POST CE la ignora); PATCH anidado
seguido de lectura verificada. Ledger antes de POST y marcador paginado para
recuperar respuesta perdida; no repetir POST incierto. ACK de Plane/T3
independientes, spool hasta ambos ACK o 24 h; intake_expired avisa por ID.
Aceptar en Intake NO acepta para descuento: solo RPC review con owner humano.
No despliegue/token/cron/activación nuevos. Runbook en tools/triage/README.md.
28/28 Python PASS sin red (12 mock Plane + 16 regresiones); quality 456 PASS.

CI Linux principal falló por unnecessary_wraps en captura no Windows.
Corrección separada 4b84da01: validación compartida, ningún lint suprimido.
fmt/check/Clippy y Nextest 1651/1651 (7 skips), lifecycle 18/18 PASS;
telemetría previa 25/25 mantiene ámbito (no runtime/domain/ipc/testdata nuevos).
PR #1602 abierto al consultar; resultado remoto del nuevo SHA pendiente.

## 9. Siguiente acción

Orquestador: revisar PR #1602 (Closes #1594), privacidad/runbook y QA pendiente.
Auto-merge squash solicitado por Isaac; Plane Por revisar con comentario del PR.
Worker terminado; FIN/SHA/estado remoto verificado en buzón e issue.
Activación del proveedor y despliegue permanecen bloqueados por autorización
separada. No activar cron ni LOGIN/password sin su autorización específica.

## 10. Actualización

2026-10-13 · Codex · #1594 / VANTA-38. Estado de aplicación y hashes aprobados
registrados en runbook/buzón; entrega de cliente/worker y gates finales locales PASS.

## Correcciones de review #1602

1. P1-1: Basic completo y prefijos sk-/sk_ en ambas capas. Regresi�n sint�tica
   RED observada en Rust y Python antes del cambio; GREEN tras la correcci�n.
   No proveedores, Intake ni credenciales reales en las pruebas.

2. P1-2: accountId/AccountID/account-id/account_id dentro de JSON, ambas capas.
   RED por UUID filtrado, GREEN tras reconocer etiquetas completas; sin borrar
   accountIdentity ni datos públicos similares.

3. P1-3: se omiten rutas UNC completas, incluso perfiles ajenos y rutas
   entre comillas con espacios. RED/GREEN Rust/Python; contexto ERROR conservado.

Adicional: captura Windows con stdout vacío reproducida RED. Último objeto
PowerShell en una sola línea permite ejecutar la expresión por stdin; GREEN
y tres regresiones de privacidad ampliadas al prepare/RPC preview real.

4. P2-4: presupuesto HTTP 64 KiB del JSON RPC completo antes de preview;
   recorte UTF-8 de cola y SHA recalculado. RED 96.400 bytes; GREEN transporte
   real loopback con logs/resumen, comillas, controles y Unicode; payload idéntico
   al aprobado. El límite de otras RPC permanece 64 KiB.

5. P2-5: main drena/purga spool bajo lock antes de sondear; segunda fase
   evita doble reintento inmediato. RED sin entrega, GREEN con State real y
   polling OSError mock: ACK pendiente y caducado purgado sin modelo ni red.

6. P2-6: estado analyzing persistido y recuperación bajo lock antes de polling.
   Tercer intento interrumpido (incluido estado legacy) produce triage.failed
   durable con ID/contador, sin inventar diagnóstico ni cuarto análisis. Intentos
   1/2 conservan contador; spool fsync previo al commit SQL se reutiliza exacto
   con ambos ACK y TTL original; temporales huérfanos se purgan. RED/GREEN real
   SQLite cerrada/reabierta, sin red.

7. P2-7: reconciliación received en toda la ventana RLS de 30 días, metadata
   en páginas de 200 y hasta 20 cuerpos no vistos/reintentables. Se reinicia
   la paginación en cada pasada; cursor histórico solo informa progreso.
   RED A confirma tras B y queda perdido; GREEN A se descubre una vez.
   Test adicional con 205 vistos delante de 20 nuevos evita starvation.
   Ensayo de visibilidad con State real/psql mock, sin consulta a producción.

## Cierre de correcciones #1602

Commits P1 b8a2289a / 92f88d5c / ae18c39f; P2 9bf5cd69 / 3a5112dc /
fdb891a3 / b580ed6b. Captura adicional 9e6a352a, necesaria para probar prepare.
Gates finales fmt/check/Clippy PASS, Nextest 1656/1656 (7 skips), lifecycle
18/18, Python 36/36 y quality 456 PASS. Clippy exigi� extraer el consumo del
esquema Authorization a helper; sin supresi�n de lint ni cambio de conducta.
[Tabla y evidencia de cada RED/GREEN](../../../../tools/triage/review-1602-regressions.md).
Evidencia local E:/tmp/isa1594-review-evidence/ con manifest SHA256.
Hash SQL/rollback id�nticos; no nuevas acciones de producci�n ni Intake real.
STOP merge prevalece: PR abierto, auto-merge apagado; Isaac coordina re-review.

CI remoto: GitGuardian FAILURE por 6 apariciones de fixtures sintéticas:
Base64 Basic Authentication en b8a2289a (Rust/Python) y PostgreSQL Credentials
en b580ed6b (Python). El reporte solo señala tests; passwords/host son fixtures,
no conexiones reales. Buzón BLOQUEO y PR reflejan ese check; no se certifica CI
remoto verde. Isaac clasificará el falso positivo durante la re-review.


### F2 · token de Plane independiente

Inicialización diferida del sink configurado: fallo de token conserva pending,
no bloquea recuperación/purga/T3 ni reanaliza. RED main devolvía 1; GREEN
con SQLite real, token ausente, vacío, permisos inválidos/denegados y spool
interrumpido; reintento siguiente crea un POST mock y solo entonces retira
spool. Regresiones review_r2_f2_* PASS Windows y POSIX (Ubuntu local).
LoadCredential usa nombre dedicado de credstore, sin ruta obligatoria.
Unidad temporal de prueba systemd 259 PASS sin credencial, /bin/true y collect;
no se instaló la unidad del worker. Runbook actualizado para futura activación.
Evidencia E:/tmp/isa1594-r2-evidence/f2-*. Gates finales: ver cierre r2 arriba.


### F3 · contrato SQL tras expansión de redacción

RED nativo con título "::1 " x30 y cuerpo trim("::1 " x250): prepare
ofrecía título de 359 caracteres, incompatible con SQL. GREEN limita los
valores ya redactados a 120/1000 caracteres Unicode antes de preview.
review_r2_f3_expanded_redaction_fits_sql_and_retries_exact_preview PASS:
longitudes finales conformes, sin IPv6 original, primer POST loopback 500 y
reintento con bytes idénticos al preview. Incluye presupuesto HTTP/reintento
existentes: 4/4 PASS. Suite Python final 39/39 PASS. Evidencia f3-*.
No SQL/pgTAP nuevos: contrato de longitud contrastado con CHECK versionado;
no conexión ni cambio a Supabase. Gates completos nativos PASS en el cierre r2.


## Seguimiento #1610 incorporado desde nightly 8194c949

Snapshot de su entrega conservado debajo. F7=C de la cabecera prevalece sobre las referencias a enviar texto; historial, avisos, crédito y Edge se conservan. No se aplica ni despliega SQL.

# Handoff vivo — Testing Center

## 1. Resultado

#1610 / VANTA-29 prepara informes de texto para cuentas normales, historial
privado, consentimiento, cuotas, avisos y crédito opcional. Plane y notas se
prueban con mocks. Recibos legacy con capturas se conservan aparte; no se
confunden con el historial de contribuciones. Sin activación en producción.
Ronda 3: F2/F3/F4 conservados; F1 implementado localmente mediante Edge,
HMAC semanal y presupuestos durables IP/cuenta. Las RPC directas siguen cerradas.
Sin despliegue ni prueba del gateway alojado; pendiente revisión antes de activar.

## 2. Autoridad y lectura verificada

Reanudación CLI del 14/10, reglas nocturnas completas, #1610, PR #1602 y #1609.
Plane VANTA-29, GitHub Project Vantare y area:testing-center verificados.
Sin milestone: la issue no compromete una versión GitHub concreta.
[Diseño Opus recuperado](../../design/isa-1610-testing-followup-opus.md) y
[contrato de este corte](../../runbooks/testing-report-followup.md).
Sin subagentes ni diseño visual nuevo.

## 3. Estado real y canal

Rama `vantareapp/isa-1610-testing-center-todos`; base `origin/nightly@0807fbd0`.
Recuperación: no había commits propios; Rust/SQL estaban sin commit.
Hitos SQL `b17d5038`, mocks `02bf6987`, compatibilidad `a6b8b060`, privacidad
`54af49e9`, código nativo `4b22f1ae` y SQL final `976362be`.
[PR draft #1618](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1618)
a nightly; VANTA-29 Por revisar y GitHub Project In Review verificados.
Sin merge, promoción, release, deploy, SQL remoto ni informes reales enviados.
Escrituras Plane/GitHub limitadas al seguimiento del encargo.
IPC services v8 distingue este contrato del v7 de #1602; requiere recompilar
el conjunto. Telemetría DTO v10 y derechos v4 no cambian.

## 4. Decisiones cerradas

- Acceso verificado a Informes sin exigir rol tester; Calendario no cambia.
- Consentimiento de texto, uso PostHog y crédito separados.
- Cuenta fijada por el puente, nunca seleccionada por el Hub.
- Últimos 20 informes entre canales; ausencia y errores no se inventan.
- Arreglado exige versión real y revisión owner de título/resumen.
- Ningún estado local ni propuesta de modelo concede aceptación.
- Acuse ligado a timestamp; logout elimina datos/avisos de la cuenta.
- 5 envíos/día y 20/7 días, bloqueo/reloj real, retry exacto por UUID/payload.
- F1: 5 intentos/día y 20/semana UTC por IP/cuenta, presupuesto durable antes del envío.
- Crédito pseudónimo por ID de informe, opt-in y revocable, sin nombre/correo.
- Plane recibe proyección revisada, nunca texto bruto, cuenta o URL libre.

## 5. Arquitectura y ownership

Hub presenta; services posee rutas permitidas; Edge verifica IP/identidad y
reserva intentos; SQL posee estado/RLS/cuotas. Solo service_role envía tras admisión.
`tools/testing/followup.py` modela proyección idempotente y candidato de notas,
sin red, credenciales, lookup de identidad ni publicación.
#1602 y #1609 se leyeron sin editar/fusionar sus ramas. En producto, PostHog
sigue ausente hasta su referencia consentida. Capturas para cuentas normales
y unión con Intake pendientes de #1602; no se duplica su implementación.

## 6. Evidencia y límites

Ronda 3 sobre a43ce994: RED nativo comprobado (cliente aún llamaba RPC cerrada),
GREEN cambiando solo ruta/allowlist. Edge 10/10; F1IP 26 pgTAP, concurrencia real
quinto/sexto, rollback inerte/reapply y rollback usado bloqueado con #1602@87950380.
fmt/check/Clippy PASS; Nextest 1649/1649 (7 skips), lifecycle 18/18 PASS.
Mocks 4/4, quality 456, Deno fmt/lint y superficie deploy PASS. Telemetría
dedicada/QA visual omitidas: no cambian runtime/domain/ipc/testdata ni controles.
Evidencia `C:/tmp/1610-evidence/r3/`. Sin dependencia
nueva, diseño nuevo ni subagentes. JWT del puente firmado verificado; no se usa
Auth.getUser porque el token es propio del puente nativo.
Origen cf-connecting-ip solo en Supabase alojado/Cloudflare; detalle y límite
de la documentación oficial en el runbook. No hay garantía para self-hosting.
Sal/cabecera ausente falla cerrado; no hay IP cruda ni logs propios de identidad.
Se reconoce la función como candidata sin añadirla a ningún wrapper de deploy.

Evidencia histórica de primera ronda:

`C:/tmp/1610-evidence/`: SQL local 35 pgTAP PASS; dos sesiones reales verifican
quinto/sexto envío bajo lock; snapshot antiguo rechazado. Rollback con datos
bloqueado; vacío conserva legacy; reaplicación PASS. Actor local NOSUPERUSER
BYPASSRLS, fixtures mínimos auth/membership, socket privado sin TCP.
No prueba Supabase completo, JWT o PostgREST.
Mocks 4/4 PASS. fmt/check/Clippy PASS; Nextest 1649/1649 (7 skips),
lifecycle 18/18 y telemetría 25/25. ACC largo completó correctamente en 896 s.
RED/GREEN de versión/allowlist/acuse/snapshot/cuerpo privado/padding conservados.
Retirement/quality: 456 huellas PASS. CI remoto completo no acreditado.
Sin QA visual, DPI, instalación ni envío real; diseño no es captura de runtime.

## 7. Riesgos y deuda

Dependencias #1602/#1609 no integradas. Reconciliar IPC, migraciones, allowlist
y gate nativo antes de activar. Formulario público de este corte: texto sin
capturas. Prosa/imágenes arbitrarias requieren redacción humana; el filtro no
garantiza eliminar todos los nombres. No exportar paquetes brutos.
No hay unión automática de recibos legacy/Intake/contribuciones ni publicación
de notas. Interfaces y mocks se entregan para esa revisión.

## 8. Issues activas

#1610 / VANTA-29; dependencias #1602 (#1594) y #1609. #1452/#1535 son contexto;
su estado de producción no se revalidó en este encargo.
[Histórico anterior](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/0807fbd0/vantare-v2/docs/vantare-program/handoffs/testing-center.md).

## 9. Siguiente acción exacta

Revisar la PR draft #1618 y comprobar CI del último SHA publicado.
El orquestador revisa F1 implementado, verifica el gateway alojado antes de
activar y coordina interfaces con #1602/#1609 y el conjunto SQL. Las RPCs
cliente directas no se reabren. El SQL #1602 probado @87950380 es idéntico
al del HEAD actual @5d62f624; esta dependencia sigue sin integrar y con conflictos.
No fusionar ni activar producción desde este encargo.

## 10. Última actualización

2026-10-14 04:43 +02:00 · worker Codex CLI · VANTA-29 Por revisar verificado.
Rama publicada y PR draft #1618. HEAD final/CI en la PR, #1610 y buzón.
[Informe sencillo y límites](../../runbooks/informe-1610.md).

## Histórico · re-review ronda 2 · 14/10

F2 reproducido con #1602: historial owner devolvía 3 informes y una página global desplazaba el propio (5/6 RED). Filtro explícito de cuenta antes de LIMIT: 6/6 GREEN sobre #1602@87950380. Se conserva SELECT owner para administración. Evidencia C:/tmp/1610-evidence/r2/F2-{red,green}. PR #1618 sigue draft; F1/F3/F4 en curso. No Plane real ni producción en ronda 2.

F3: aceptar A → arreglar A → aceptar B del mismo día y dos arreglados → tercera aceptación semanal: 6/8 RED, 8/8 GREEN sobre #1602@87950380. Trigger en frontera de estado cuenta accepted/fixed y conserva lock 1594 y UTC; el rechazo revierte también la review insertada por #1602. No se modifica su rama ni reemplaza su RPC.

F4: legacy sembrado antes de apply bloqueaba down inmediato (RED). Flag de actividad persistente distingue backfill inerte de seguimiento usado. GREEN conserva fila legacy completa y bloquea seis clones independientes: crédito off/on/off, acuse, cambio de estado, consentimiento, nuevo informe y fixed. Ningún dato de seguimiento activo se elimina; rollback sigue cerrado ante datos no reversibles.

F1 CONTENIDO, NO RESUELTO como apertura pública: RED dos cuentas de la misma IP declaran 10 envíos y retries desde otras IP entran; GREEN 17/17 bloquea RPC directa y v2 de #1602 (sin grant sintético). EXECUTE queda cerrado a authenticated/anon/service_role. Falta gateway con IP confiable y contador durable de todos los intentos. --internal-submit concede permiso SOLO en clúster local desechable para preservar los 35 tests semánticos anteriores, separado del test de ACL F1; no prueba admisión/IP productiva. No activar ni reabrir EXECUTE manualmente.

Cierre local ronda 2: F1 17/17, F2 6/6, F3 8/8 más dos sesiones con fixed previo, F4 seis clones de actividad bloqueados y legacy íntegro. Suite original 35/35 + snapshot/concurrencia/rollback/reapply con #1602@87950380 y bootstrap sin dependencia. Mocks 4/4 y quality 456 PASS. Rust/telemetría/QA visual no repetidos: no cambia código/fixtures nativos. F1 sigue pendiente, solo contenido; no activar. Plane real no se consultó ni modificó en esta ronda. Fecha 2026-10-14T04:22:32.6677970+02:00.
