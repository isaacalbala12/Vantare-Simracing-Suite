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
