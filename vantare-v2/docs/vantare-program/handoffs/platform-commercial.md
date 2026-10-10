# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/platform-commercial.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. PR [#1570](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1570) contra nightly, con auto-merge autorizado por el orquestador. Nightly `0cf38ed2` incorporada mediante merge `dbee0c18`; sin promoción ni release. #1568 en `vantareapp/isa-1568-acceso-al-abrir-lmu`: carrera RED `9677362a` corregida (`8957d9f6`: admisión protegida, cancelación serializada y revalidación; 3 regresiones GREEN); fmt/Clippy, Nextest 1577/1577, lifecycle 18/18, telemetría 25/25 y corpus 456/456 PASS; correlación humana pendiente (DUDA `C:/tmp/buzon/1568.md`). #1535 prepara otra rama de servicios/Testing; sus migraciones no se aplicaron según la issue.

## 4. Decisiones cerradas

- Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v9, servicios v5 y control/derechos v4 son contratos independientes en esta base.
- Account conserva recuperación aun con herramientas denegadas; negar derechos no inventa un login ni un pago.
- Venta pública exige matriz monetaria/reconciliación y autorización. Implementado, integrado, publicado y validado en producción son estados distintos.

## 5. Arquitectura y ownership

[Services](../../../native/services/README.md) posee red bajo demanda; [Hub](../../../native/hub/README.md) presenta cuenta/calendario/actualización y no autentica ni cobra. Supabase/Clerk/Polar se validan en sus entornos autorizados. Admin es privado y no entra en el instalador público. El mapa de procesos vive solo en [native/README](../../../native/README.md).

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. Evidencia comercial y sandbox/CI se consulta en #1514 y sus entregas; los checks locales no prueban OAuth, DNS/TLS, pago, webhook ni despliegue real. #1568 demuestra una carrera determinista del cierre por juego; aún no correlaciona el incidente humano.

## 7. Riesgos y deuda

- P1: acceso al abrir LMU (#1568); no dar la causa real por confirmada solo con RED local.
- P1: readiness comercial, identidad y pagos (#1514/#1506/#1507/#1499/#1501); no abrir venta desde docs.
- P2: #1535 tiene migraciones/revisión y activación pendientes; su estado no sustituye el contrato de la base.
- Login/logout físico, expiración, recuperación, instalación/upgrade y QA remota requieren evidencia propia.

## 8. Issues terminadas, activas y pendientes

#1530–#1534 y #1536 cerradas; #1561 documental en entrega. Activa de acceso: #1568. Abiertas: #1514, #1506, #1507, #1510, #1511, #1515 y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535), además de los gates comerciales citados. IDs migrados y evidencia de cortes previos quedan en el histórico; no renumerarlos.

## 9. Siguiente acción exacta

Continuar #1568 en su rama: confirmar GREEN, preservar serialización/revalidación del acceso antes de cancelar/cerrar por juego y pasar fmt/Clippy/Nextest/lifecycle por cola. Registrar reproducción humana pendiente y pasos del buzón `C:/tmp/buzon/1568.md`. El orquestador coordina #1535 y sus revisiones/migraciones; esta rama no aplica ni configura producción. Para #1561, revisar/push de los dos commits documentales y releer la issue.

## 10. Última actualización

2026-10-10 · GitHub #1561 · Codex. Código, README del área e issues leídos; seguimiento #1561 escrito y releído. Las siguientes acciones de área proceden de las issues abiertas, sin nuevas autorizaciones implícitas. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
