## F7=C · 14/10/2026 · en curso

Decisión explícita de Isaac: el texto libre del tester nunca se envía. #1594 / VANTA-38 en curso; VANTA-49 conserva su hito de Intake. PR #1602 draft a nightly, sin auto-merge ni merge. Título/cuerpo/notas locales; etiquetas SQL fijas, log/eventos/hardware estructurados y cerrados; proveedor/T3/Intake/replay excluyen prosa. Las rutas TestingAnswer/TestingContribute/Report tampoco envían los campos escritos. Sin texto no se acredita el requisito anterior de 200 caracteres: revisión humana pendiente, sin aceptación inventada. Las capturas históricas no entran en triaje.

RED Python/nativo conservados y GREEN focal; suite/gates en ejecución. Siguiente: commit F7, merge de origin/nightly en esta rama, resolver conflictos, gates afectados, push y actualizar PR. Evidencia E:/tmp/isa1594-f7-evidence/; regresiones tools/triage/review-1602-f7-regressions.md. R5 y rondas anteriores de abajo son evidencia histórica; F7 pendiente queda reemplazado por esta decisión.

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
