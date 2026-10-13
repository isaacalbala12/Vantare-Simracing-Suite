# Handoff vivo — Testing Center

Estado #1594 / VANTA-38: migración aplicada en producción; cliente y worker
inerte implementados, todos los gates locales PASS. Plane Por revisar verificado con PR.
Cron, LOGIN/contraseña, proveedor y despliegue siguen pendientes de su OK.

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
