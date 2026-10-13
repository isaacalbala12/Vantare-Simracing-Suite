# Triaje de contribuciones · #1594 / VANTA-38

Estado: hito SQL local para revisión, sin activar. Fuente: diseño r2 completo
`C:/tmp/ola2/diseno-1594-opus.md` y encargo de Isaac del 2026-10-13.
DeepSeek `opencode-go/deepseek-v4.1-flash`; el worker propone y un owner
autenticado confirma. No es una segunda llamada a otro modelo.

## SQL preparado

- `supabase/migrations/20261013160000_testing_contribution_triage.sql`.
- `supabase/rollbacks/20261013160000_testing_contribution_triage.down.sql`.
- `supabase/tests/testing_contribution_triage.test.sql` y
  `supabase/tests/run-triage-local.py`.

Prerequisito: paquete mínimo de #1535, con cuentas UUID internas,
`testing_center_memberships` y participación. No ejecutar en producción
las migraciones históricas completas para satisfacer este requisito.
El registro local `C:/tmp/ola2/1535-backup-cli/FIN-production-applied.md`
indica que el paquete fue aplicado el 2026-10-13, con gate nativo cerrado.
Esto es evidencia archivada, no una consulta fresca de producción.

Tres tablas nuevas: contexto 1:1, hasta dos adjuntos y revisión 1:1.
RLS forzada; anon y clientes sin escritura directa; cada tester lee lo suyo.
El owner puede leer contribuciones y sus datos para decidir. Su rol procede
de memberships, nunca de metadata editable, email o un `sub` de Clerk.
La eliminación del autor elimina sus datos; eliminar al reviewer conserva
el registro de la decisión con reviewer NULL.

`testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb)` guarda el
informe, contexto y adjuntos en una transacción. Un reintento exige payload
idéntico, cuenta idéntica y hashes SHA256 de los bytes UTF-8 exactos.
La RPC antigua se conserva; no inventa contexto. PostHog ausente se representa
con NULL. Consentimiento `triage-v2`: items `system`, `telemetry_summary`,
`app_log`, `telemetry_fragment`, `posthog_session`; los datos desmarcados se
rechazan. System usa listas cerradas también en objetos anidados.

`testing_contribution_review(uuid,text,text,jsonb)` exige un owner activo,
nota humana y snapshot completo `vantare.triage.v2`. La cuarta entrada es
necesaria: el esquema previo no tiene `muse_verdict` ni confianza que copiar.
Almacena modelo, confianza, propuesta, decisión, reviewer y hora. Solo esta
confirmación actualiza el estado; el worker no puede invocarla ni escribir.
El snapshot no da autoridad: la comprobación server-side de owner es obligatoria.
La persona puede disentir del modelo; la nota registra su decisión.

La revisión es idempotente para el mismo owner/payload e inmutable después.
Se retiene el lock de membership hasta commit; las aceptaciones se serializan
por cuenta. Topes: una por fecha UTC de envío, dos por semana ISO UTC de envío.
Las aceptaciones rechazan aislamiento distinto de READ COMMITTED para impedir
leer un snapshot anterior a una aceptación concurrente.

Rol `vantare_triage`: NOLOGIN inicialmente, NOINHERIT, NOBYPASSRLS,
sin privilegios administrativos, dos conexiones, timeout 10 s y sesiones
read-only por defecto. Solo SELECT de columnas autorizadas y filas de los
últimos 30 días. No ve account_id, posthog_session_id ni las revisiones.
No se amplía USAGE de `private` a authenticated. Las RPC públicas conservan
el patrón aprobado de #1535: SECURITY DEFINER, search_path vacío, EXECUTE
cerrado y autorización explícita dentro de la función.

## Decisiones que debe revisar el orquestador

1. Firma de review con cuarto argumento, convención de items de consentimiento,
   claves del contexto y topes UTC por fecha de envío descritos arriba.
2. La ventana de 45 días desde suscripción y la pérdida del tramo con dos spams
   pertenecen a elegibilidad comercial #1593. No hay una fuente aprobada de
   campaña/fecha de suscripción en el contrato de contribuciones. Este SQL
   registra spams y aceptaciones; no acredita elegibilidad ni toca Polar.
   Confirmar esta separación antes de aplicar: r2 menciona estos límites en
   la RPC de review, pero el encargo excluye implementar el descuento.
3. La función privada de purga elimina adjuntos y resumen a los 90 días desde
   decisión, o al terminar el 30/01/2027 para envíos 19/10–30/11, lo anterior.
   La ventana de campaña es una previsión del diseño; revisar las fechas.
   System/consent y revisión permanecen mientras exista el informe.
   No se instala pg_cron ni se registra un job en este hito. Acordar su
   activación en Supabase y la política final para system/consent antes del uso.
4. SQL completo, rollback y hashes en `C:/tmp/buzon/1594.md`: **PARAR**.
   La autorización general del 2026-10-13 no sustituye el OK de esta revisión.

## Validación reproducible sin producción

Usa PostgreSQL y pgTAP ya instalados, sin dependencias nuevas. En WSL:

```sh
export LD_LIBRARY_PATH=/mnt/c/tmp/ola2/1535-evidence/pg-local/root/usr/lib/x86_64-linux-gnu
python3 supabase/tests/run-triage-local.py \
  --pg-bin /mnt/c/tmp/ola2/1535-evidence/pg-local/root/usr/lib/postgresql/18/bin \
  --output /mnt/c/tmp/ola2/1594-sql-evidence
```

El runner inicia un clúster temporal sin listener TCP, borra las variables
PG heredadas y usa solo datos sintéticos. Aplica con postgres NOSUPERUSER
BYPASSRLS, como el actor de la migración. El bootstrap reproduce los contratos
de cuenta/membership y defaults de permisos; no replica todo Supabase.
Las pruebas cubren aislamiento, consentimiento, allowlists anidadas, límites
en bytes, hash, reintentos, confirmación owner, topes y retención. Dos sesiones
reales verifican el bloqueo por cuenta; un login real verifica los permisos
del worker. Rollback con datos se rechaza; vacío preserva el informe legacy;
reaplicación pasa. Evidencia local: `summary.json` y logs en la carpeta output.

Este hito no cambia Rust, Go ni frontend: no son aplicables sus compilaciones
y tests. No acredita JWT/PostgREST, UI, proveedor, webhook ni producción.

## Aplicación en producción: solo después del OK

Destino exclusivo: `ombjshwzqgeisazijduq`. Antes de cualquier DDL:

1. Obtener OK del orquestador sobre SQL/hash y decisiones anteriores. Revisar
   deriva de esquema, owners, ACL, políticas y migrations contra #1535,
   incluido el gate de identidad cerrado. Detener consumidores afectados.
2. Usar la conexión guardada en `~/.vantare/supabase-prod-url` exclusivamente
   dentro del proceso de exportación/aplicación. Nunca mostrarla ni pasarla
   en argumentos, logs públicos o Git. No leer `.env*`.
3. Hacer copia protegida de roles, esquema y datos, con snapshot consistente,
   SHA256, conteos y restauración aislada. Seguir el procedimiento validado
   de `C:/tmp/ola2/1535-backup-cli/`. Incluye al menos contribuciones,
   memberships/profiles, contexto, adjuntos y revisiones si ya existieran;
   si aparecen objetos de #1594 antes de aplicar, parar por deriva.
4. Repetir esta migración/tests sobre copia local del esquema vigente. Preparar
   el comando de aplicación con destino/hash verificados y registro atómico
   en `supabase_migrations.schema_migrations`. No usar db push/include-all.
5. Aplicar una vez en transacción. Ante un error, conservar logs privados y
   revisar; no reintentar DDL ni modificar policies automáticamente.
6. Verificar schema/history, RLS forzada, EXECUTE/USAGE alcanzables, grants
   de columnas, atributos del rol y ausencia de membresías, gates cerrados y
   conteos originales. El rol queda sin password y NOLOGIN.
7. Rollback solo preactivación, tablas nuevas vacías, consumidores detenidos
   y cron desregistrado. Si hay datos, recuperación/corrección revisada;
   nunca forzar el borrado ni CASCADE.

## Despliegue del worker: preparación pendiente, no ejecutar

Después del hito SQL se implementarán cliente, doble redacción, extracción
mínima, worker y pruebas antes de abrir el PR completo. El futuro runbook de
despliegue debe incluir, tras OK específico, estos controles del diseño r2:

- WSL vantare-svc en .57, usuario vantare-triage sin sudo/shell y /mnt inaccesible.
- Timer de 2 minutos Persistent; oneshot con flock, MemoryMax=2G,
  ProtectSystem=strict, PrivateTmp y NoNewPrivileges. Queda disabled/inactivo.
- Credencial dedicada de lectura, pooler de sesión IPv4 y sslmode=verify-full;
  password/LOGIN solo por procedimiento autorizado de Isaac, nunca service_role.
- OpenCode `opencode-go/deepseek-v4.1-flash`, agente triage sin tools;
  180 s/informe, 20/pasada, credenciales con LoadCredential y XDG temporal.
- SQLite sin texto, entregas persistidas para reintentar 24 h sin reanalizar,
  fallo tras tres intentos, retención 90 días. No enviar sin consentimiento.
- Webhook T3 del orquestador con HMAC sobre bytes exactos, timestamp y rechazo
  de replay. Crear schedule/secret/configuración solo con autorización de activación.
- La propuesta no cambia Supabase. La orden expresa de Isaac al orquestador
  o Isaac autenticado como owner ejecuta la RPC de confirmación.

## Nota de privacidad para el PR completo

El proveedor externo será DeepSeek vía OpenCode Go. Recibirá únicamente un
extracto redactado de hasta 24.000 caracteres: título/cuerpo, versiones y juego,
hardware de lista blanca, errores/huellas, percentiles, los 20 últimos eventos,
WARN/ERROR con contexto hasta 300 líneas y estadísticas del fragmento.
No recibirá email, tokens, account_id, posthog_session_id, consentimiento,
rutas con usuario identificable, lista completa de procesos, logs completos
ni muestras del simulador. Redacción local antes de vista previa y otra en el
servidor antes del proveedor. PostHog seguirá opcional y vacío mientras falte
integración real; el pipeline no consultará su API.

Según r2, antes de activar faltan confirmar por escrito pasarela/subencargado,
región, retención, entrenamiento y condiciones contractuales del proveedor.
No se afirma ZDR ni ubicación a partir de referencias de terceros. Este hito
no envía informes a ningún modelo ni despliega componentes del servidor.
