# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/platform-commercial.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

Base incorporada mediante merge (sin rebase): `origin/nightly@661149b07565137a2450580169fd608ebeb2bd42`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v9 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. SQL #1535 no aplicado.

## 4. Decisiones cerradas

- ClickUp es la unica fuente del roadmap, publicado en Supabase con lectura anon y compatibilidad v1/v2; no depende del repositorio publico. Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v9, servicios v6 y control/derechos v4 son contratos independientes en esta base.
- Account conserva recuperación aun con herramientas denegadas; negar derechos no inventa un login ni un pago.
- Venta pública exige matriz monetaria/reconciliación y autorización. Implementado, integrado, publicado y validado en producción son estados distintos.

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

## 7. Riesgos y deuda

- P1: acceso al abrir LMU (#1568); no dar la causa real por confirmada solo con RED local.
- P1: readiness comercial, identidad y pagos (#1514/#1506/#1507/#1499/#1501); no abrir venta desde docs.
- P2: SQL #1535 corregido y probado localmente; esquema completo, aplicacion y activacion pendientes. P2-4 queda para Isaac.
- Login/logout físico, expiración, recuperación, instalación/upgrade y QA remota requieren evidencia propia.

## 8. Issues terminadas, activas y pendientes

#1530-#1534 y #1536 cerradas; #1570/#1572/#1573 fusionadas en la base indicada.
#1535 en PR #1578; #1568 mantiene correlacion humana pendiente. Abiertas
#1514/#1506/#1507/#1510/#1511/#1515 y gates comerciales: consultar su estado
antes de actuar. IDs migrados y evidencia previa permanecen en el historico.

## 9. Siguiente acción exacta

Resolver/push de PR #1578 conservando el estado de #1570 y ambos cambios
nativos entrantes; verificar CI del SHA resultante. Antes de aplicar SQL #1535:
revision y copia LOCAL del esquema completo/ACL. Antes de activar: Isaac decide
P2-4 (secretos de repo), configura credencial minima y verifica host/CA con
autorizacion. No aplicar migraciones, cargar secretos ni desplegar desde esta tarea.
#1568 mantiene su reproduccion humana pendiente; gates comerciales en #1514.

## 10. Última actualización

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.
