# Triaje de contribuciones Â· #1594 / VANTA-38

Estado: hito SQL local para revisiÃ³n, sin activar. Fuente: diseÃ±o r2 completo
`C:/tmp/ola2/diseno-1594-opus.md` y encargo de Isaac del 2026-10-13.
DeepSeek `opencode-go/deepseek-v4.1-flash`; el worker propone y un owner
autenticado confirma. No es una segunda llamada a otro modelo.

## SQL preparado

- `supabase/migrations/20261013160000_testing_contribution_triage.sql`.
- `supabase/rollbacks/20261013160000_testing_contribution_triage.down.sql`.
- `supabase/tests/testing_contribution_triage.test.sql` y
  `supabase/tests/run-triage-local.py`.

Prerequisito: paquete mÃ­nimo de #1535, con cuentas UUID internas,
`testing_center_memberships` y participaciÃ³n. No ejecutar en producciÃ³n
las migraciones histÃ³ricas completas para satisfacer este requisito.
El registro local `C:/tmp/ola2/1535-backup-cli/FIN-production-applied.md`
indica que el paquete fue aplicado el 2026-10-13, con gate nativo cerrado.
Esto es evidencia archivada, no una consulta fresca de producciÃ³n.

Tres tablas nuevas: contexto 1:1, hasta dos adjuntos y revisiÃ³n 1:1.
RLS forzada; anon y clientes sin escritura directa; cada tester lee lo suyo.
El owner puede leer contribuciones y sus datos para decidir. Su rol procede
de memberships, nunca de metadata editable, email o un `sub` de Clerk.
La eliminaciÃ³n del autor elimina sus datos; eliminar al reviewer conserva
el registro de la decisiÃ³n con reviewer NULL.

`testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb)` guarda el
informe, contexto y adjuntos en una transacciÃ³n. Un reintento exige payload
idÃ©ntico, cuenta idÃ©ntica y hashes SHA256 de los bytes UTF-8 exactos.
La RPC antigua se conserva; no inventa contexto. PostHog ausente se representa
con NULL. Consentimiento `triage-v2`: items `system`, `telemetry_summary`,
`app_log`, `telemetry_fragment`, `posthog_session`; los datos desmarcados se
rechazan. System usa listas cerradas tambiÃ©n en objetos anidados.

`testing_contribution_review(uuid,text,text,jsonb)` exige un owner activo,
nota humana y snapshot completo `vantare.triage.v2`. La cuarta entrada es
necesaria: el esquema previo no tiene `muse_verdict` ni confianza que copiar.
Almacena modelo, confianza, propuesta, decisiÃ³n, reviewer y hora. Solo esta
confirmaciÃ³n actualiza el estado; el worker no puede invocarla ni escribir.
El snapshot no da autoridad: la comprobaciÃ³n server-side de owner es obligatoria.
La persona puede disentir del modelo; la nota registra su decisiÃ³n.

La revisiÃ³n es idempotente para el mismo owner/payload e inmutable despuÃ©s.
Se retiene el lock de membership hasta commit; las aceptaciones se serializan
por cuenta. Topes: una por fecha UTC de envÃ­o, dos por semana ISO UTC de envÃ­o.
Las aceptaciones rechazan aislamiento distinto de READ COMMITTED para impedir
leer un snapshot anterior a una aceptaciÃ³n concurrente.

Rol `vantare_triage`: NOLOGIN inicialmente, NOINHERIT, NOBYPASSRLS,
sin privilegios administrativos, dos conexiones, timeout 10 s y sesiones
read-only por defecto. Solo SELECT de columnas autorizadas y filas de los
Ãºltimos 30 dÃ­as. No ve account_id, posthog_session_id ni las revisiones.
No se amplÃ­a USAGE de `private` a authenticated. Las RPC pÃºblicas conservan
el patrÃ³n aprobado de #1535: SECURITY DEFINER, search_path vacÃ­o, EXECUTE
cerrado y autorizaciÃ³n explÃ­cita dentro de la funciÃ³n.

## Decisiones aprobadas por el orquestador (2026-10-13)

1. Firma de review con cuarto argumento, convenciÃ³n de items de consentimiento,
   claves del contexto y topes UTC por fecha de envÃ­o descritos arriba.
2. La ventana de 45 dÃ­as desde suscripciÃ³n y la pÃ©rdida del tramo con dos spams
   pertenecen a elegibilidad comercial #1593. No hay una fuente aprobada de
   campaÃ±a/fecha de suscripciÃ³n en el contrato de contribuciones. Este SQL
   registra spams y aceptaciones; no acredita elegibilidad ni toca Polar.
   Confirmar esta separaciÃ³n antes de aplicar: r2 menciona estos lÃ­mites en
   la RPC de review, pero el encargo excluye implementar el descuento.
3. La funciÃ³n privada de purga elimina adjuntos y resumen a los 90 dÃ­as desde
   decisiÃ³n, o al terminar el 30/01/2027 para envÃ­os 19/10â€“30/11, lo anterior.
   La ventana de campaÃ±a es una previsiÃ³n del diseÃ±o; revisar las fechas.
   System/consent y revisiÃ³n permanecen mientras exista el informe.
   No se instala pg_cron ni se registra un job en este hito. Acordar su
   activaciÃ³n en Supabase y la polÃ­tica final para system/consent antes del uso.
4. SQL completo, rollback y hashes en `C:/tmp/buzon/1594.md`: **PARAR**.
   La autorizaciÃ³n general del 2026-10-13 no sustituye el OK de esta revisiÃ³n.

## ValidaciÃ³n reproducible sin producciÃ³n

Usa PostgreSQL y pgTAP ya instalados, sin dependencias nuevas. En WSL:

```sh
export LD_LIBRARY_PATH=/mnt/c/tmp/ola2/1535-evidence/pg-local/root/usr/lib/x86_64-linux-gnu
python3 supabase/tests/run-triage-local.py \
  --pg-bin /mnt/c/tmp/ola2/1535-evidence/pg-local/root/usr/lib/postgresql/18/bin \
  --output /mnt/c/tmp/ola2/1594-sql-evidence
```

El runner inicia un clÃºster temporal sin listener TCP, borra las variables
PG heredadas y usa solo datos sintÃ©ticos. Aplica con postgres NOSUPERUSER
BYPASSRLS, como el actor de la migraciÃ³n. El bootstrap reproduce los contratos
de cuenta/membership y defaults de permisos; no replica todo Supabase.
Las pruebas cubren aislamiento, consentimiento, allowlists anidadas, lÃ­mites
en bytes, hash, reintentos, confirmaciÃ³n owner, topes y retenciÃ³n. Dos sesiones
reales verifican el bloqueo por cuenta; un login real verifica los permisos
del worker. Rollback con datos se rechaza; vacÃ­o preserva el informe legacy;
reaplicaciÃ³n pasa. Evidencia local: `summary.json` y logs en la carpeta output.

Este hito no cambia Rust, Go ni frontend: no son aplicables sus compilaciones
y tests. No acredita JWT/PostgREST, UI, proveedor, webhook ni producciÃ³n.

## AplicaciÃ³n en producciÃ³n: solo despuÃ©s del OK

Destino exclusivo: `ombjshwzqgeisazijduq`. Antes de cualquier DDL:

1. Obtener OK del orquestador sobre SQL/hash y decisiones anteriores. Revisar
   deriva de esquema, owners, ACL, polÃ­ticas y migrations contra #1535,
   incluido el gate de identidad cerrado. Detener consumidores afectados.
2. Usar la conexiÃ³n guardada en `~/.vantare/supabase-prod-url` exclusivamente
   dentro del proceso de exportaciÃ³n/aplicaciÃ³n. Nunca mostrarla ni pasarla
   en argumentos, logs pÃºblicos o Git. No leer `.env*`.
3. Hacer copia protegida de roles, esquema y datos, con snapshot consistente,
   SHA256, conteos y restauraciÃ³n aislada. Seguir el procedimiento validado
   de `C:/tmp/ola2/1535-backup-cli/`. Incluye al menos contribuciones,
   memberships/profiles, contexto, adjuntos y revisiones si ya existieran;
   si aparecen objetos de #1594 antes de aplicar, parar por deriva.
4. Repetir esta migraciÃ³n/tests sobre copia local del esquema vigente. Preparar
   el comando de aplicaciÃ³n con destino/hash verificados y registro atÃ³mico
   en `supabase_migrations.schema_migrations`. No usar db push/include-all.
5. Aplicar una vez en transacciÃ³n. Ante un error, conservar logs privados y
   revisar; no reintentar DDL ni modificar policies automÃ¡ticamente.
6. Verificar schema/history, RLS forzada, EXECUTE/USAGE alcanzables, grants
   de columnas, atributos del rol y ausencia de membresÃ­as, gates cerrados y
   conteos originales. El rol queda sin password y NOLOGIN.
7. Rollback solo preactivaciÃ³n, tablas nuevas vacÃ­as, consumidores detenidos
   y cron desregistrado. Si hay datos, recuperaciÃ³n/correcciÃ³n revisada;
   nunca forzar el borrado ni CASCADE.

## Despliegue del worker: preparaciÃ³n pendiente, no ejecutar

DespuÃ©s del hito SQL se implementarÃ¡n cliente, doble redacciÃ³n, extracciÃ³n
mÃ­nima, worker y pruebas antes de abrir el PR completo. El futuro runbook de
despliegue debe incluir, tras OK especÃ­fico, estos controles del diseÃ±o r2:

- WSL vantare-svc en .57, usuario vantare-triage sin sudo/shell y /mnt inaccesible.
- Timer de 2 minutos Persistent; oneshot con flock, MemoryMax=2G,
  ProtectSystem=strict, PrivateTmp y NoNewPrivileges. Queda disabled/inactivo.
- Credencial dedicada de lectura, pooler de sesiÃ³n IPv4 y sslmode=verify-full;
  password/LOGIN solo por procedimiento autorizado de Isaac, nunca service_role.
- OpenCode `opencode-go/deepseek-v4.1-flash`, agente triage sin tools;
  180 s/informe, 20/pasada, credenciales con LoadCredential y XDG temporal.
- SQLite sin texto, entregas persistidas para reintentar 24 h sin reanalizar,
  fallo tras tres intentos, retenciÃ³n 90 dÃ­as. No enviar sin consentimiento.
- Webhook T3 del orquestador con HMAC sobre bytes exactos, timestamp y rechazo
  de replay. Crear schedule/secret/configuraciÃ³n solo con autorizaciÃ³n de activaciÃ³n.
- La propuesta no cambia Supabase. La orden expresa de Isaac al orquestador
  o Isaac autenticado como owner ejecuta la RPC de confirmaciÃ³n.

## Nota de privacidad para el PR completo

El proveedor externo serÃ¡ DeepSeek vÃ­a OpenCode Go. RecibirÃ¡ Ãºnicamente un
extracto redactado de hasta 24.000 caracteres: tÃ­tulo/cuerpo, versiones y juego,
hardware de lista blanca, errores/huellas, percentiles, los 20 Ãºltimos eventos,
WARN/ERROR con contexto hasta 300 lÃ­neas y estadÃ­sticas del fragmento.
No recibirÃ¡ email, tokens, account_id, posthog_session_id, consentimiento,
rutas con usuario identificable, lista completa de procesos, logs completos
ni muestras del simulador. RedacciÃ³n local antes de vista previa y otra en el
servidor antes del proveedor. PostHog seguirÃ¡ opcional y vacÃ­o mientras falte
integraciÃ³n real; el pipeline no consultarÃ¡ su API.

SegÃºn r2, antes de activar faltan confirmar por escrito pasarela/subencargado,
regiÃ³n, retenciÃ³n, entrenamiento y condiciones contractuales del proveedor.
No se afirma ZDR ni ubicaciÃ³n a partir de referencias de terceros. Este hito
no envÃ­a informes a ningÃºn modelo ni despliega componentes del servidor.
