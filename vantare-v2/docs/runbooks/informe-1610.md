# Informe #1610 / VANTA-29 — entrega aislada

1. T3 recuperado en la misma rama/base 0807fbd0; trabajo bueno conservado.
2. Informes de texto para cuentas verificadas normales, sin exigir tester.
3. Consentimiento separado, apagado por defecto e invalidado al editar/logout.
4. Últimos 20 informes privados: título/estado/versión, sin cuerpo privado.
5. Avisos aceptado/arreglado, acuse durable y limpieza al cambiar de cuenta.
6. Crédito pseudónimo opcional y revocable; sin nombre/correo ni crédito automático.
7. SQL: 35 pgTAP + snapshot + concurrencia + rollback/reapply PASS, también con #1602.
8. fmt/check/Clippy PASS; Nextest 1649/1649 (7 skips), lifecycle 18/18, telemetría 25/25.
9. Mocks Plane/notas 4/4 PASS; capturas públicas/Intake/PostHog real dependen de #1602/#1609.
10. PR draft #1618 a nightly; VANTA-29 Por revisar verificado; sin merge/release/producción.

[PR draft](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1618)
· [Issue](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1610)
· GitHub Project Vantare In Review, area:testing-center.
Estado verificado el 14/10/2026 a las 03:58 +02:00. Issue OPEN, sin milestone;
no hay versión GitHub comprometida. Auto-merge desactivado; canal alcanzado: rama de issue.

Rama vantareapp/isa-1610-testing-center-todos; base origin/nightly 0807fbd0.
Código nativo 4b22f1ae, SQL final 976362be; último HEAD/push se consulta en la PR
y en el comentario de cierre de #1610. Commits por hito; documentación de cierre
posterior no cambia el código nativo probado. Sin promoción a nightly/testers/master.

| Evidencia local | Resultado |
| --- | --- |
| fmt, check, Clippy -D warnings | PASS |
| Nextest | 1649/1649, 7 skips del perfil existente |
| lifecycle | 18/18, procesos/pipes propios |
| telemetría | 25/25; ACC largo completó 896 s, suite 958 s |
| PostgreSQL/pgTAP | 35/35, incluso sobre #1602@197547a1 |
| Dos sesiones SQL | quinto aceptado, sexto espera lock y se rechaza |
| Snapshot/rollback | snapshot antiguo denegado; con datos rollback protegido; legacy preservado/reapply PASS |
| Mocks | 4/4, sin red |
| Quality/retirement | 456 huellas PASS |

Logs RED/GREEN: C:/tmp/1610-evidence/. Se corrigieron versión de arreglo inválida,
RPC fuera de allowlist, aviso aún sin leer tras acuse, snapshot antiguo permitido,
cuerpo privado innecesario en historial y padding que eludía topes de caracteres.
El test antiguo de sidebar se actualizó al contrato aprobado, manteniendo denegación
para acceso sin verificar/bloqueado y restricción de Calendario; no se silenciaron gates.
La pasada anterior propia se detuvo al corregir historial y se repitieron todos los
gates. No se detuvieron trabajos ajenos ni se redujo el límite de RAM.

CI remoto es una evidencia separada: en 976362be promoción/ratchet/GitGuardian
pasaron y native-linux/blocking gates seguían en curso/cola. Tras el último push,
ver el SHA y estado real en la PR; no se afirma CI remoto completo.

No hubo SQL remoto, informes reales a Plane, publicación de notas, merge, promoción
o release. Acciones externas autorizadas: commits/push/PR draft y seguimiento del
encargo en GitHub/Plane. No se instalaron herramientas ni se modificaron datos,
ajustes o instalación real de Isaac; targets y fixtures son propios del worktree/C:/tmp.

Pendiente de integración: #1602/#1609, unión de contribuciones con recibos legacy,
capturas para cuentas normales y referencia PostHog revalidada de
diagnostics::consented_usage_id (#1609@a82a283b). Los mocks son proyección/candidato,
no conexión real con Intake ni publicación. Prosa/imágenes requieren redacción
humana antes de proyectar; no se exportan paquetes brutos ni se garantizan nombres
eliminados automáticamente. No se realizaron QA visual/DPI/teclado, instalación,
cuentas reales ni pruebas físicas LMU/ACC; goldens/replay no acreditan esos usos.

[Runbook y QA manual](testing-report-followup.md) ·
[Diseño Opus recuperado](../design/isa-1610-testing-followup-opus.md) ·
[Handoff vivo](../vantare-program/handoffs/testing-center.md).

Puntos revisados: versión/acuse en [testing.rs](../../native/services/src/testing.rs#L8),
rutas permitidas en [bridge.rs](../../native/services/src/bridge.rs#L119),
avisos por cuenta en [notifications.rs](../../native/hub/src/notifications.rs#L467),
y snapshot/topes/historial en [migración](../../../supabase/migrations/20261013225629_testing_reports_followup.sql#L42).