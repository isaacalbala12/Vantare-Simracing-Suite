# Handoff vivo — Testing Center

## 1. Resultado

#1610 / VANTA-29 prepara informes de texto para cuentas normales, historial
privado, consentimiento, cuotas, avisos y crédito opcional. Plane y notas se
prueban con mocks. Recibos legacy con capturas se conservan aparte; no se
confunden con el historial de contribuciones. Sin activación en producción.

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
- Crédito pseudónimo por ID de informe, opt-in y revocable, sin nombre/correo.
- Plane recibe proyección revisada, nunca texto bruto, cuenta o URL libre.

## 5. Arquitectura y ownership

Hub presenta; services valida/posee RPCs permitidas; SQL posee estado/RLS/cuotas.
`tools/testing/followup.py` modela proyección idempotente y candidato de notas,
sin red, credenciales, lookup de identidad ni publicación.
#1602 y #1609 se leyeron sin editar/fusionar sus ramas. En producto, PostHog
sigue ausente hasta su referencia consentida. Capturas para cuentas normales
y unión con Intake pendientes de #1602; no se duplica su implementación.

## 6. Evidencia y límites

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
El orquestador revisa interfaces con #1602/#1609 y el conjunto SQL.
No fusionar ni activar producción desde este encargo.

## 10. Última actualización

2026-10-14 03:58 +02:00 · worker Codex CLI · VANTA-29 Por revisar verificado.
Rama publicada y PR draft #1618. HEAD final/CI en la PR, #1610 y buzón.
[Informe sencillo y límites](../../runbooks/informe-1610.md).

## Re-review ronda 2 · 14/10

F2 reproducido con #1602: historial owner devolvía 3 informes y una página global desplazaba el propio (5/6 RED). Filtro explícito de cuenta antes de LIMIT: 6/6 GREEN sobre #1602@87950380. Se conserva SELECT owner para administración. Evidencia C:/tmp/1610-evidence/r2/F2-{red,green}. PR #1618 sigue draft; F1/F3/F4 en curso. No Plane real ni producción en ronda 2.
