# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/platform-commercial.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

### #1591 — instalador propio, FASE 2 autorizada (2026-10-13)

Plan aprobado: [plan versionado](../../superpowers/plans/2026-10-13-instalador-propio-1591.md), copia solicitada `C:/tmp/ola2/plan-1591.md`.
Issue [#1591](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1591), rama `vantareapp/isa-1591-instalador-propio`, worktree T3 propio,
base/HEAD de entrada `cec4364a5b4fc03f111dde6073c01e5fb36dad68` = origin/nightly obtenido.
Diseño aprobado `instalador-r3.html`, ventana #E; SHA-256 `ca1e9bd31ba76fda1031e1b93ba6a090ef889b911cf20d58f30e0181867ad841`.
Propuesta: crate `vantare-installer`, GPUI fijado y ZIP/scripts embebidos; motor PowerShell existente, sin dependencias externas nuevas.
Mantiene identidad VantareNativeBeta, QA TEST_INSTALLER, datos por generación, códigos 0–4 y bootstrap renovado solo por Setup.
Issue #1565/PR #1592 aún abierta al leer: no sustituir su feed Downloads, no retrasar 0.0.976/NSIS ni publicar desde #1591.
§4 cerrado: escritorio ON/autostart OFF en interactivo, ninguno nuevo en /S;
datos SIEMPRE conservados, sin casilla; Repair solo con igual versión; valores reales.
H1: crate/CLI/puente/payload/builder y recurso PE. Tests Rust 4/4, shell 9,
Clippy sin UI y comparación del lock PASS; solo nuevo paquete local, cero dependencias externas.
H2: Register conserva la UI propia, opciones/accesos exclusivos y limpieza
diferida validada por hash. Shell 23 PASS y uninstall interrumpido 2 PASS;
son fixtures, no acreditan instalación completa ni equipo limpio.
Sin instalación real, secretos, firma real, promoción ni release. Hitos/SHA en la issue.
H3: seis pantallas GPUI, controles, opciones y worker conectado al motor;
fuentes del HTML convertidas sin dependencias nuevas. Capturas nativas iniciales
de seis pantallas más opciones/desinstalado a 720x460, DPI 96, revisadas en
`C:/tmp/ola2/1591-qa/visual/gpui-h3/`; todavía usan un snapshot fixture 0.0.0.
Clippy UI y contratos Rust se registran con el SHA del hito en la issue.
H4: publisher construye Setup propio con CRT estático y firma de feed intacta;
0.0.976/`-LegacyNsis` conserva NSIS. Scripts de QA headless/interacción añadidos.
Paquetes reales 0.0.977/0.0.978; bootstrap refrescado conservando hashes de todos
los EXE de aplicación (QA-PROVENANCE.json). Regresión del fallback PowerShell
corregida: Beta 99 PASS, packaging 175 PASS, matriz propia 68 PASS, interacción
real 22 PASS, feed remoto simulado 9 PASS, shell 23 y uninstall 2 PASS.
Gates generales: check/Clippy PASS; Nextest 1630/1630 (7 skips), lifecycle 18/18.
Target de gates propio trasladado a E por disco lleno en C; parámetro de ruta
sin cambiar expectativas. Fallos previos y mapa de evidencia archivada conservados.
H5 local: NSIS actual→propio 50 PASS; interacción final 22 PASS y seis
comparativas HTML/GPUI revisadas, en `C:/tmp/ola2/1591-qa/visual/comparativa-1591.html`.
[Informe de QA y límites](../../reviews/2026-10-13-1591-instalador-qa.md).
**Siguiente paso #1591: PR draft/entrega para revisión independiente y acreditar
el entorno live/Windows limpio; sin subagentes, sin integración.**
VM/cuenta con otro SID, arranque live, Windows limpio y DPI físicos siguen
pendientes de entorno; no se infieren de las capturas ni de los tests headless.
Push/PR draft a nightly y enlace T3 autorizados al finalizar; no integración antes de review independiente.
QA futura bajo `C:/tmp/ola2/1591-qa`; arranque live solo en cuenta/VM de prueba por el SID/instancia compartida, capturas con pantalla libre y mutex.

### Estado previo de plataforma (su base propia)

Base incorporada mediante merge (sin rebase): `origin/nightly@b2186f82746424b4844a5909efd31530c5bbe5b3`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v10 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. SQL #1535 no aplicado.

## 4. Decisiones cerradas

- ClickUp es la unica fuente del roadmap, publicado en Supabase con lectura anon y compatibilidad v1/v2; no depende del repositorio publico. Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v10, servicios v6 y control/derechos v4 son contratos independientes en esta base.
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
- P2: SQL #1535 corregido y probado localmente; esquema completo, aplicacion y activacion pendientes. P2-4 aceptado por Isaac en #1535.
- Login/logout físico, expiración, recuperación, instalación/upgrade y QA remota requieren evidencia propia.

## 8. Issues terminadas, activas y pendientes

#1530-#1534 y #1536 cerradas; #1570/#1572/#1573 fusionadas en la base indicada.
#1535 en PR #1578; #1568 mantiene correlacion humana pendiente. Abiertas
#1514/#1506/#1507/#1510/#1511/#1515 y gates comerciales: consultar su estado
antes de actuar. IDs migrados y evidencia previa permanecen en el historico.

## 9. Siguiente acción exacta

Verificar CI/auto-merge de #1578. Cuando figure MERGED en nightly, ejecutar
SOLO LECTURA contra produccion la consulta previa (DEFINER alcanzables, ACL y
registro de migraciones) usando acceso ya configurado, sin imprimir secretos.
Escribir DUDA con resultado y comando exacto para las dos migraciones. Si falta
acceso, preparar pasos para Isaac. No aplicar nada hasta respuesta expresa.
P2-4 aceptado por Isaac en #1535; no implica configurar credenciales ni desplegar.

## 10. Última actualización

2026-10-13 · GitHub #1591 · Codex: hito de planificación y DUDA; no cambia
el estado remoto de las entregas anteriores. Plan/issue/metadata verificados al cerrar FASE 1.

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.
