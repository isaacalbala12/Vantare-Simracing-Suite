## #1608 · Cierre B01–B03 en curso (14/10/2026)

Nueva rama `vantareapp/isa-1608-cierre-comercial`, base #1615 `7aab0699`.
B03: consumidor Clerk/Svix firmado, inbox idempotente, tombstone irreversible,
RLS/RPC sin bootstrap implícito, grants posteriores siempre revocados. Perfil
anonimizado, datos personales de Testing retirados; IDs comerciales privados
conservados. Storage se limpia por API con cola durable/reintento, nunca SQL
sobre sus objetos. Registry de issuers vacío: activar/configurar es otra entrega.
RED basal: falta registry/consumidor; GREEN PostgreSQL 23 + 17 aserciones,
Deno focal 19 PASS. Evidencia `C:/tmp/1608-comercial/`. B01/B02 aún pendientes;
venta/producción NO-GO, sin despliegue/migraciones remotas/datos reales.
Siguiente: bearer real PostgREST y ledger/refunds, commit por bloqueo, gates,
push/PR draft; rebase sobre nightly al integrarse #1615. VANTA-16/17/15 En curso.

## #1608 Â· IntegraciÃ³n de nightly (14/10/2026)

Encargo explÃ­cito tras review r3 APTA: nightly â†’ rama de issue, con merge,
sin rebase ni promociÃ³n. Worktree limpio `8fecf307`, fast-forward al remoto
`812ed8ec` conservado. Merge probado `eca5155f6a51aad620e5af5d4ad51368edcaaa83`,
padres `812ed8ec` + `origin/nightly@5b781964`, incluye #1611/#1617/#1618.
Conflicto Ãºnico `native/services/src/app.rs`: rechazo definitivo conserva
revocaciÃ³n/ACK y Ã©xito conserva analytics consentido tras transferir derechos.
Los otros 66 archivos entrantes son idÃ©nticos a nightly. Sin polÃ­tica nueva,
UI nueva, dependencias o tests relajados; B01/B02/B03 permanecen No-Go comercial.

Gates nuevos GREEN: fmt/check/Clippy; Nextest 1697 PASS/12 skips heredados
(cinco bancos manuales #1611 mÃ¡s los siete previos); lifecycle 18 PASS;
telemetrÃ­a 25 PASS/0 skips (ACC 814.150 s); Deno534 PASS/1 ignored PostgREST;
SQL230 y followup35+F1/F1IP/F2/F3/F4/concurrencia/rollback PASS. Integridad456,
138 tests scripts GitHub, paneles8, followup4, snippet y guardas de superficie PASS.
Logs `C:/tmp/1608-merge/`, target propio, cola/dos jobs y QA aislada. Fuente Rust
sin cambios tras la prueba; cierre posterior documental. Fallos de entorno
Deno y sonda conservados/corregidos en invocaciÃ³n; cache anterior de Functions
apartada y conservada fuera del repo, sin editar dependencias. B01 RED separado.

Misma PR #1615 ready a nightly; auto-merge preexistente desactivado reversiblemente
antes del push porque no se autoriza promociÃ³n. HEAD final/push/CI y Plane
VANTA-16/17/15 Por revisar por escritura/lectura en issue/buzÃ³n al publicar;
no se hereda CI anterior. Informe actualizado. Siguiente: revisiÃ³n del nuevo
SHA y decisiÃ³n del orquestador sobre integraciÃ³n. Sin producciÃ³n, compras,
datos reales, QA GUI fÃ­sica, promociÃ³n ni release.

## #1608 Â· RevisiÃ³n cuentas y pagos (14/10/2026)

Ronda 3 sobre `b5be4303`, rama `vantareapp/isa-1608-cuentas-y-pagos`,
base nightly `69fa2d65`; misma PR draft [#1615](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1615).
Entrega para revisiÃ³n de Plane VANTA-16/17/15; escritura/lectura final tras el push en issue/buzÃ³n; GitHub #1608 OPEN/in-review,
area:plataforma, Project Vantare y sin milestone. Sin merge, producciÃ³n ni compras.

Review Sol r2 `C:/tmp/ola2/review-1615-sol-r2.md` leÃ­da completa. R2-N1
reproducido: dos RED en AccountPoll detached con candidato previo, con/sin
identidad restaurada. Arreglo mÃ­nimo: identidad distinta o ausente exige
`revoke_local` antes de guardar la sesiÃ³n. Sin nÃºcleo se rechaza el cambio y
se conserva la cuenta anterior; el reintento gestionado exige ACK durable.
Misma ruta de revocaciÃ³n que logout y rechazo definitivo de OAuth; services
no escribe el binding del nÃºcleo. Fix `64e9eec5`, tests/cÃ³digo probado `04cfe8df`;
GREEN focal 49/49. fmt/check/Clippy PASS; Nextest nuevo 1654 PASS/7 exclusiones
existentes; lifecycle 18 PASS. Quality/retirada 456 huellas, canal 45 y notes 26
tests PASS; fragmento vÃ¡lido. Logs `C:/tmp/1608-r3/`, fallo inicial de tamaÃ±o
Clippy conservado y resuelto con callback comÃºn, sin allow ni tests relajados.
Login/candidato/ACK con fixture IPC; Owner real/Launch/reinicio Free se valida
por separado en la regresiÃ³n existente. Sin promesa de login comercial real.
No hay consumidor nuevo de borrado: B03 conserva su plan y No-Go.
Deno/SQL/telemetrÃ­a conservan evidencia de ronda 2, no repetida porque solo cambia
services/documentos. HEAD/push/PR/CI finales tras publicar en issue/buzÃ³n;
combinaciÃ³n con nightly actual/#1612/#1523 y aceptaciÃ³n comercial pendientes.

Los arreglos de las rondas anteriores se conservan:

- N1/F08/F02 `d6aec3ca`: auxiliar sin CoreLink no confirma logout ni inicia
  renovaciÃ³n HTTP; devuelve error y conserva estado para reintento gestionado.
  Con nÃºcleo exige Invalidate ACK durable antes de retirar candidato/sesiÃ³n.
  REDâ†’GREEN con Owner real; Launch v1 perpetua reforzada con RED contrafactual,
  logout gestionado vÃ­a host y reapertura en Free. El almacÃ©n del nÃºcleo sigue
  bajo su Ãºnico propietario; no se promete revocaciÃ³n autÃ³noma sin Ã©l.
- N2/F02 `381bee42`: HTTP 400 OAuth invalid_grant es Authentication. Refresh
  automÃ¡tico/explicito de licencia/cuenta/perfil comparte ACK, retirada del
  candidato y tombstone de sesiÃ³n. 400 genÃ©rico/malformado y 429/503 conservan
  derechos. REDâ†’GREEN 6 focales, sin userinfo/native-license despuÃ©s del rechazo.
- N3/F04 `5b5ab24c`: lectura/firma reciben el entorno del servidor; loader filtra
  grants por entorno sin relajar el normalizador ni perder soporte. RED 409 con
  production+sandbox â†’ GREEN 67 tests emisor/handler.
- AtribuciÃ³n `71388711`: binding durable Polar/entorno/customer prevalece sobre
  external_customer_id contradictorio. REDâ†’GREEN 52 tests procesador.

Evidencia anterior de ronda 2 `C:/tmp/1608-r2/`: fmt/check/Clippy PASS; Deno completo 524 PASS/
1 ignored PostgREST; SQL desechable 230 GREEN, B01 1 RED; B02 4 RED separados.
Nextest nuevo 1652 PASS/7 skips; lifecycle 18 PASS; telemetrÃ­a 25 PASS. Cola y target propio, APPDATA/
LOCALAPPDATA aislados. Fallos iniciales de fixture/mtime/permisos/lint conservados.
Sin baselines recalibrados ni tests debilitados. CÃ³digo de ronda 2 probado `03fb0dea`; cierre posterior documental. SHA/push/CI de esa ronda
verificados en issue/buzÃ³n, sin heredar verde de ba02b093. Nueve fixes de ronda 1 se
conservan; sus SHAs/evidencia y los planes actuales estÃ¡n en el
[informe](../../analysis/review-cuentas-pagos-2026-10.md).

No-Go comercial: B01 bearer/reset requiere corte JWT/RLS; B02 refunds
ordinario/Pro/parcial/agregado requiere ledger SQL/reconciliaciÃ³n; B03 requiere
retenciÃ³n/tombstones/guardas de datos. Plan por bloqueo con archivos, riesgos,
pruebas y decisiones de Isaac en el informe. #1523 OPEN/draft `33be660d` leÃ­do,
sin integrar ni trasplantar fragmentos. El fallback external ID sin binding
sigue bajo ese corte. Coordinar `account.rs` (Exchange) y `app.rs` (refresh/logout)
con #1612 al integrar. AceptaciÃ³n comercial/GUI/servidor pendiente de autorizaciÃ³n.

# Handoff vivo â€” Plataforma, cuenta, servicios y distribuciÃ³n

Estado de la base indicada; releer la issue antes de ejecutar.

## #1609 / VANTA-22 Â· AnalÃ­tica consentida (14/10/2026)

Ronda 3 publicada para revisiÃ³n desde `f56156e3`; review Sol r2 completa.
P2-1 `86fa6aa8`: RED A/B â†’ GREEN, cachÃ© monotÃ³nica, admisiÃ³n por generaciÃ³n,
cola revocable de 32 entradas y acumuladores descartados/revalidados al retirar/cerrar.
Callbacks try_lock sin I/O ni espera; worker persiste fuera del hilo UI.
P2-2 `6b177190` + `4357a6a5`: carga con consent.lock retenido, controles disponibles,
limpieza/importaciÃ³n Setup Busy diferidas en worker cancelable y revocaciÃ³n sin reiniciar.
Busy tipado, wrapper save_with String conservado; resultado al heartbeat por memoria.
Respuesta atrasada descartada si hubo decisiÃ³n manual: test worker terminado â†’
revocaciÃ³n â†’ recibir respuesta, sin sleeps. No borra otros avisos de Ajustes.
P3 `88ddc324`: error de decisiÃ³n no confirmada/reintentar, sin afirmar que fallos
estÃ©n apagados. `beb68c4f` cierra Clippy y refuerza la barrera del test heredado:
la cancelaciÃ³n al cerrar no puede sustituir su comprobaciÃ³n final de consentimiento.
Gates finales: fmt/check/Clippy, Nextest 1675/1675 (7 skips), lifecycle 18/18,
services 130 + 2 procesos, Store 9 e integridad 456 huellas PASS. RED y errores
iniciales conservados en C:/tmp/1609-r3; [informe](../../analytics/informe-1609.md).
CÃ³digo publicado `4357a6a58d66f5648a9d02befc8a0c5b9f5a4dbc`, base `69fa2d65`;
HEAD documental final y CI en issue/buzÃ³n. PR #1617 draft a nightly, sin auto-merge
ni merge; VANTA-22 Por revisar verificado el 14/10 a las 04:03:53 UTC.
Origin/nightly consultado `552c0d52`; sin integraciÃ³n con ese tip ni promociÃ³n.
**Criterio estricto pendiente:** la invalidaciÃ³n en otra UI depende del refresco
Privacy del worker (espera normal 250 ms, mayor con I/O ocupado). Descarte al
refrescar probado, sin garantÃ­a de retirada instantÃ¡nea de memoria entre procesos.
DUDA al orquestador: frontera compartida requiere review; no se declara APTO ese
criterio. PrÃ³xima acciÃ³n: revisar diff/evidencia y resolver ese lÃ­mite antes de integrar.
Sin subagentes, diseÃ±o/dependencias nuevos, QA GUI fÃ­sica, PostHog real, producciÃ³n,
datos/instalaciÃ³n reales de Isaac, merge ni release. TelemetrÃ­a dedicada no requerida
(sin cambios runtime/domain/ipc/testdata); paneles/snippet sin cambios, no repetidos.
Pendientes iniciales de clave/panel real, Marketing/Setup, atribuciÃ³n y registro/pago
backend conservados en informe/contrato. Acciones externas autorizadas: commits,
push, actualizaciÃ³n PR/issue y estado Plane. Ãšltima comprobaciÃ³n local: 04:03 UTC.

### Ronda 2 (evidencia anterior)

Ronda 2 completada por Codex CLI; review Sol leÃ­da completa, sin subagentes.
P1 `58d0a735`: RED A/B â†’ GREEN. GeneraciÃ³n persistida y cerrojo SO comÃºn
publicaciÃ³n/revocaciÃ³n/POST; con POST activo (8 s), guardar devuelve ocupado
sin Ã©xito falso. P2 `f40bc343`: ID/marcadores borrados; UUID nuevo al reaceptar,
tiempos reiniciados por generaciÃ³n. P2 `55531cc4`: instrumentaciÃ³n GPUI solo
try_send (32 entradas); worker de services persiste, emisor HTTP en services.
Guardado manual del consentimiento conserva su ruta atÃ³mica existente.
Gates locales: services 127 + 2 procesos, Nextest 1666/1666 (7 skips), lifecycle
18/18, fmt/check/Clippy/quality PASS (456 huellas). RED y GREEN conservados en
`C:/tmp/1609-r2/`; detalle, lÃ­mites y omisiones en [informe](../../analytics/informe-1609.md).
Base `69fa2d65`, cÃ³digo publicado `55531cc4`; HEAD documental en issue/buzÃ³n.
PR draft [#1617](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1617)
a nightly, sin auto-merge; VANTA-22 Â«Por revisarÂ» verificado 14/10 02:36 UTC.
CI del nuevo HEAD pendiente; no afirmar integraciÃ³n/release. Nightly consultado
`0807fbd0`; esta entrega no integra ese tip ni promociona canales.
CatÃ¡logo/ID en `docs/analytics/eventos.md`; snippet/paneles preparados, sin --apply.
Pendientes: clave/panel real por vÃ­a privada del orquestador, Marketing/Setup
(#1591/PR #1600), atribuciÃ³n y registro/pago exactos backend, QA visual/review.
TelemetrÃ­a dedicada omitida: no se toca runtime/domain/ipc/testdata. Sin diseÃ±o
nuevo, producciÃ³n/PostHog real, datos/instalaciÃ³n reales de Isaac, dependencias,
merge ni release. Evidencia inicial y contratos conservados en el informe y Git.

## #1601 / VANTA-10 Â· Plane, fase de implementaciÃ³n (13/10/2026)

OK de Isaac/orquestador al plan `C:/tmp/ola2/plan-1601.md`: Plane â†’ Supabase
cada 5 min, tres columnas; archivos antiguos retirados, JSON manual del Hub inerte.
Rama propia `vantareapp/isa-1601-roadmap-plane`, base inicial nightly `298abc33`, actualizada con #1599 (`bc89c8b8`).
ImplementaciÃ³n inicial `076531ab`; merge documental `162ba486` preservando
reglas de orquestador/estados y autoridad del roadmap Plane. Corte de cÃ³digo `7edf33e6`; SHA final/CI en el PR
[#1603](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1603) a nightly.
Issue [#1601](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1601),
`area:plataforma`, aÃ±adida al GitHub Project Vantare; sin versiÃ³n comprometida.

ImplementaciÃ³n local: API v1 CE con pÃ¡ginas completas y memberships, filtro
Infraestructura/Negocio/canceladas, nombres literales, IDs estables y lÃ­mites
40 tareas/40 KB sin truncar. Mismo documento/rol/RPC v2/v1; sin cambio de esquema.
Hub carga cachÃ© y refresca cada 300 s usando el heartbeat y worker IPC existentes;
acciones explÃ­citas conservan prioridad. Tres columnas con later legado en Planeado.
Web preparada aquÃ­; no se edita otro repo. Action/scripts ClickUp retirados localmente.

RED: test de tres columnas perdÃ­a later; los cinco tests web fallaban sin polling.
GREEN final: 18 Python, 6 web, 8 Hub + 6 services roadmap; 57 digest, 45 canal
y 26 release-notes; fragmento ISA-1601 validado; script Plane 9 tests PASS.
fmt/Clippy PASS; Nextest completo final 1646 PASS/7 skips; lifecycle 18 PASS;
telemetrÃ­a 25 PASS (ACC 832 s). RegresiÃ³n de reintento de cachÃ© REDâ†’GREEN.
La repeticiÃ³n de Nextest chocÃ³ con el .exe de telemetrÃ­a abierto; tras terminar
ACC se repitiÃ³ en serie y pasÃ³. Evidencia `C:/tmp/ola2/1601-*.log`.
SQL PostgreSQL 18.6 local desechable PASS: idempotencia, cambio Ãºnico, lectura
v1/v2, vaciado/retirada rechazados. Unidades systemd verificadas en copia temporal
con ExecStart=/bin/true; no prueba despliegue. Quality 456 huellas PASS.
Runbook: [plane-roadmap-runbook.md](../../plane-roadmap-runbook.md).
Credenciales/token/roadmap.env, despliegue, timer y primera escritura NO autorizados
ni ejecutados. Cantidad/tamaÃ±o del tablero real pendientes de lectura autorizada;
exceso exige parar y preguntar. Cambio de IDs puede exigir aprobaciÃ³n exacta SQL.
Entrega: PR #1603 (`Closes #1601`), auto-merge desactivado por Isaac tras la
revisiÃ³n independiente; no reactivarlo. CI remota del nuevo SHA pendiente.
VANTA-10 pasa a Por revisar con el
enlace del PR y FIN en buzÃ³n. No se afirma merge ni publicaciÃ³n. El orquestador revisa y gestiona #1582, sustituido por
este publicador. QA GUI y tablero real pendientes: las pruebas son locales con
fixtures/corpus; no hay publicaciÃ³n real, deploy ni release.

CorrecciÃ³n de revisiÃ³n #1603: revisiÃ³n Sol leÃ­da completa y tres regresiones
RED antes del arreglo. Privacidad: 10 subcasos fallaban; ahora exige recuento
`total_issues` entero y coherente en cada module, rechaza privados vacÃ­os
incluso con cero declarado y conserva JSON/SQL anteriores al abortar.
PaginaciÃ³n: 8 subcasos aceptaban respuestas dudosas; ahora rechaza listas
desnudas y metadatos ausentes. Web: `pagehide` con `persisted=true` conserva
controlador/timer; test de dos restauraciones, sin intervalos duplicados,
y cierre definitivo que cancela y retira el listener.
GREEN de esta ronda: 21 Python, 7 web, check/Clippy/fmt, Nextest 1646 PASS
con 7 skips, lifecycle 18 PASS; SQL local, quality 456 huellas, canal 45,
release-notes 26, digest 57 y bash -n PASS. TelemetrÃ­a no repetida: no se
tocan runtime/domain/ipc/testdata; los 25 PASS anteriores siguen siendo
evidencia de la implementaciÃ³n inicial. Bfcache probado con eventos simulados;
QA web real pendiente. Logs `C:/tmp/ola2/1603-*.log`, tabla REDâ†’GREEN en
`C:/tmp/ola2/fix-1603-results.md`; SHA del push en issue/PR/buzÃ³n.
El runbook documenta estas guardas. Sin nuevas acciones de producciÃ³n.

## 1. Resultado

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribuciÃ³n; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producciÃ³n ni release.

## 2. Autoridad y lectura verificada

LeÃ­dos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactaciÃ³n y su escritura verificada.

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

- Plane es la Ãºnica fuente del roadmap desde #1601, publicado en Supabase con lectura anon y compatibilidad v1/v2; no depende del repositorio publico. Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v10, servicios v6 y control/derechos v4 son contratos independientes en esta base.
- Account conserva recuperaciÃ³n aun con herramientas denegadas; negar derechos no inventa un login ni un pago.
- Venta pÃºblica exige matriz monetaria/reconciliaciÃ³n y autorizaciÃ³n. Implementado, integrado, publicado y validado en producciÃ³n son estados distintos.
- #1565: descargas y feed solo en el repo pÃºblico `Vantare-Downloads`; sin feed doble ni renovaciÃ³n automÃ¡tica del bootstrap. La 0.0.976 se publica solo allÃ­ y cada instalaciÃ³n reinstala con Setup. Free privado: sin branch protection aplicada; deploy de Functions manual sin mover secretos ([repo-privado-1565](../../repo-privado-1565.md)).

## 5. Arquitectura y ownership

[Services](../../../native/services/README.md) posee red bajo demanda; [Hub](../../../native/hub/README.md) presenta cuenta/calendario/actualizaciÃ³n y no autentica ni cobra. Supabase/Clerk/Polar se validan en sus entornos autorizados. Admin es privado y no entra en el instalador pÃºblico. El mapa de procesos vive solo en [native/README](../../../native/README.md).

## 6. Evidencia y lÃ­mites

#1535: fmt/Clippy PASS; Nextest 1579/1579 (7 skips), lifecycle 18/18 y
telemetria 25/25 en la entrega aislada. SQL corregido tras Sol+Opus: PostgreSQL
18.6/pgTAP 1.3.4 local 20+31 PASS, LOGIN adversarial, aislamiento de cuentas,
aprobaciones caducadas con dos sesiones y auditoria DEFINER EXECUTE+USAGE.
TLS CA/hostname y control de hostname real PASS sin auth/SQL; tres tests Python.
Quality 456 huellas PASS. Evidencia: `C:/tmp/ola2/1535-evidence/`.
El merge actual tuvo conflictos solo documentales; no repetidos gates Rust
por la condicion del encargo. No acredita esquema Supabase completo, CI remota,
configuracion del host de CI, OAuth, pagos, entorno fisico ni produccion.

#1565: QA aislada `TEST_INSTALLER` PASS (Setup 0.0.975 real â†’ datos â†’
Setup 0.0.976 de la rama: 4/4 datos idÃ©nticos, bootstrap renovado, Check solo a
Downloads; instalaciÃ³n real intacta). Paquete QA = binarios 0.0.975 con
`manifest.version` 0.0.976. Evidencia: `C:/tmp/1565-qa/ev/`, `C:/tmp/1565-b/`.
RevisiÃ³n Sol (`C:/tmp/ola2/review-1592-sol.md`): actualizador y datos OK;
P1 limpieza Windows (cwd bloqueado), P2 `actions: read` y P2 orden Linux
corregidos con regresiÃ³n; tests de runner/budget/origen conectados a gates.

## 7. Riesgos y deuda

- P1: acceso al abrir LMU (#1568); no dar la causa real por confirmada solo con RED local.
- P1: readiness comercial, identidad y pagos (#1514/#1506/#1507/#1499/#1501); no abrir venta desde docs.
- P2: SQL #1535 corregido y probado localmente; esquema completo, aplicacion y activacion pendientes. P2-4 aceptado por Isaac en #1535.
- Login/logout fÃ­sico, expiraciÃ³n, recuperaciÃ³n, instalaciÃ³n/upgrade y QA remota requieren evidencia propia.
- P2 #1565: instalaciones que no reinstalen con Setup 0.0.976 antes de privatizar se quedan sin feed; app Go retirada sin actualizaciÃ³n.

## 8. Issues terminadas, activas y pendientes

#1530-#1534 y #1536 cerradas; #1570/#1572/#1573 fusionadas en la base indicada.
#1535 en PR #1578; #1568 mantiene correlacion humana pendiente. Abiertas
#1514/#1506/#1507/#1510/#1511/#1515 y gates comerciales: consultar su estado
antes de actuar. IDs migrados y evidencia previa permanecen en el historico.
#1565 abierta: PR de feed/CI a nightly en revisiÃ³n; runners en #1583.

## 9. Siguiente acciÃ³n exacta

Verificar CI/auto-merge de #1578. Cuando figure MERGED en nightly, ejecutar
SOLO LECTURA contra produccion la consulta previa (DEFINER alcanzables, ACL y
registro de migraciones) usando acceso ya configurado, sin imprimir secretos.
Escribir DUDA con resultado y comando exacto para las dos migraciones. Si falta
acceso, preparar pasos para Isaac. No aplicar nada hasta respuesta expresa.
P2-4 aceptado por Isaac en #1535; no implica configurar credenciales ni desplegar.

#1565: revisiÃ³n independiente del PR. Tras integrarlo, Isaac sigue el runbook
(firma Ãºnica, publicar solo en Downloads, reinstalar, avisar al tester) antes
de cambiar la visibilidad.

## 10. Ãšltima actualizaciÃ³n

2026-10-10 Â· GitHub #1535 Â· Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.

2026-10-13 Â· GitHub #1565 Â· Claude. Feed en seco, CI privada y QA aislada;
PR a nightly sin merge ni release.
