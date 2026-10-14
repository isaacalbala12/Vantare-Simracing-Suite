# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.

## #1620 / VAN-782 · catálogo Polar preparado (14/10/2026)

[Tarea Notion](https://app.notion.com/p/3f9e51695c6581229de0e11deabcd9ab), proyecto
Billing y licencias. Rama `vantareapp/isa-1620-precios-polar`, heredada de
#1500@9e041ab8; merge de origin/nightly@8194c949 en `ce143d6f`, preservando la
regla vigente del trial anual de Pro. Checkout fuente dirty no modificado.
#1500/#1499 quedan sustituidos por este catálogo completo; no integrados por ello.

Tabla Pro 5,99/59,90 y lanzamiento 3,99/39,90; Plus 9,99/99,90 y
6,99/69,90. Anuales de lanzamiento pendientes con gate explícito. Código de
creador por plan: descuento fijo compuesto equivalente a 20 % extra sobre
lanzamiento (3,19/31,92/5,59/55,92); comisión 30 % solo dato contable.
Script Deno idempotente por API, offline por defecto, duplicados/paginación y
drift rechazados, entorno/organización validados, producción con confirmación.
Productos nuevos draft; mapa generado conserva IDs/precios históricos y trials
Pro; no se inventan IDs en el snapshot sandbox. Pro Plus anual comparte derechos
con mensual; migración de checkout y pgTAP preparados.

[Runbook y comandos exactos](../../billing/isa-1620-polar-launch-catalog.md).
Tests Deno vigentes 544 PASS / 1 ignorado; sin dependencias nuevas, tests focales,
formato/check/lint y plan offline. PostgreSQL omitido: no Docker/psql; Rust/UI
omitidos sin cambios nativos. Evidencia local C:/tmp/buzon/1620-deno-tests-final.log.
Siguiente: revisar PR draft a nightly y después Isaac ejecutar con token privado
sandbox, confirmar anuales, comprobar renovaciones/creadores y autorizar producción.
No hay token, llamadas Polar, deploy, campaña activa, payouts, merge a canal,
release ni publicación. El checkout de la app aún no autoaplica los descuentos;
usar Checkout Links/API de Polar tras la validación autorizada. `plan.md` retirado
por #1601: no recreado, sin cambio público de disponibilidad.

## #1609 / VANTA-22 · Analítica consentida (14/10/2026)

Ronda 3 publicada para revisión desde `f56156e3`; review Sol r2 completa.
P2-1 `86fa6aa8`: RED A/B → GREEN, caché monotónica, admisión por generación,
cola revocable de 32 entradas y acumuladores descartados/revalidados al retirar/cerrar.
Callbacks try_lock sin I/O ni espera; worker persiste fuera del hilo UI.
P2-2 `6b177190` + `4357a6a5`: carga con consent.lock retenido, controles disponibles,
limpieza/importación Setup Busy diferidas en worker cancelable y revocación sin reiniciar.
Busy tipado, wrapper save_with String conservado; resultado al heartbeat por memoria.
Respuesta atrasada descartada si hubo decisión manual: test worker terminado →
revocación → recibir respuesta, sin sleeps. No borra otros avisos de Ajustes.
P3 `88ddc324`: error de decisión no confirmada/reintentar, sin afirmar que fallos
estén apagados. `beb68c4f` cierra Clippy y refuerza la barrera del test heredado:
la cancelación al cerrar no puede sustituir su comprobación final de consentimiento.
Gates finales: fmt/check/Clippy, Nextest 1675/1675 (7 skips), lifecycle 18/18,
services 130 + 2 procesos, Store 9 e integridad 456 huellas PASS. RED y errores
iniciales conservados en C:/tmp/1609-r3; [informe](../../analytics/informe-1609.md).
Código publicado `4357a6a58d66f5648a9d02befc8a0c5b9f5a4dbc`, base `69fa2d65`;
HEAD documental final y CI en issue/buzón. PR #1617 draft a nightly, sin auto-merge
ni merge; VANTA-22 Por revisar verificado el 14/10 a las 04:03:53 UTC.
Origin/nightly consultado `552c0d52`; sin integración con ese tip ni promoción.
**Criterio estricto pendiente:** la invalidación en otra UI depende del refresco
Privacy del worker (espera normal 250 ms, mayor con I/O ocupado). Descarte al
refrescar probado, sin garantía de retirada instantánea de memoria entre procesos.
DUDA al orquestador: frontera compartida requiere review; no se declara APTO ese
criterio. Próxima acción: revisar diff/evidencia y resolver ese límite antes de integrar.
Sin subagentes, diseño/dependencias nuevos, QA GUI física, PostHog real, producción,
datos/instalación reales de Isaac, merge ni release. Telemetría dedicada no requerida
(sin cambios runtime/domain/ipc/testdata); paneles/snippet sin cambios, no repetidos.
Pendientes iniciales de clave/panel real, Marketing/Setup, atribución y registro/pago
backend conservados en informe/contrato. Acciones externas autorizadas: commits,
push, actualización PR/issue y estado Plane. Última comprobación local: 04:03 UTC.

### Ronda 2 (evidencia anterior)

Ronda 2 completada por Codex CLI; review Sol leída completa, sin subagentes.
P1 `58d0a735`: RED A/B → GREEN. Generación persistida y cerrojo SO común
publicación/revocación/POST; con POST activo (8 s), guardar devuelve ocupado
sin éxito falso. P2 `f40bc343`: ID/marcadores borrados; UUID nuevo al reaceptar,
tiempos reiniciados por generación. P2 `55531cc4`: instrumentación GPUI solo
try_send (32 entradas); worker de services persiste, emisor HTTP en services.
Guardado manual del consentimiento conserva su ruta atómica existente.
Gates locales: services 127 + 2 procesos, Nextest 1666/1666 (7 skips), lifecycle
18/18, fmt/check/Clippy/quality PASS (456 huellas). RED y GREEN conservados en
`C:/tmp/1609-r2/`; detalle, límites y omisiones en [informe](../../analytics/informe-1609.md).
Base `69fa2d65`, código publicado `55531cc4`; HEAD documental en issue/buzón.
PR draft [#1617](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1617)
a nightly, sin auto-merge; VANTA-22 «Por revisar» verificado 14/10 02:36 UTC.
CI del nuevo HEAD pendiente; no afirmar integración/release. Nightly consultado
`0807fbd0`; esta entrega no integra ese tip ni promociona canales.
Catálogo/ID en `docs/analytics/eventos.md`; snippet/paneles preparados, sin --apply.
Pendientes: clave/panel real por vía privada del orquestador, Marketing/Setup
(#1591/PR #1600), atribución y registro/pago exactos backend, QA visual/review.
Telemetría dedicada omitida: no se toca runtime/domain/ipc/testdata. Sin diseño
nuevo, producción/PostHog real, datos/instalación reales de Isaac, dependencias,
merge ni release. Evidencia inicial y contratos conservados en el informe y Git.

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
