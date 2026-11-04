# VANTA-131 · 7b2: archivo y vaciado legacy

La migración `20261104014000_isa_1896_legacy_archive.sql` requiere el cierre
de escritores de #1926. Isaac puede ejecutar esta **consulta de solo lectura**
antes de desplegar. Devuelve un recuento por cada `source_table` del subárbol
de claves foráneas, más los dos ledgers lógicos y las tablas de Storage que
obligan a abortar. Son totales por tabla; la migración archiva solo las filas
alcanzables desde los informes y confirma sus recuentos exactos. No devuelve
contenido de informes:

```sql
with recursive walk(relid,path) as (
  select 'public.testing_center_reports'::regclass::oid,
    array['public.testing_center_reports'::regclass::oid]::oid[]
  union all
  select f.conrelid,w.path||f.conrelid
  from walk w join pg_constraint f
    on f.contype='f' and f.confrelid=w.relid
  where not f.conrelid=any(w.path)
), relations as (
  select distinct relid from walk
  union select 'public.testing_center_audit'::regclass::oid
  union select 'public.testing_center_idempotency'::regclass::oid
  union select 'public.testing_center_evidence_batches'::regclass::oid
), names as (
  select format('%I.%I',n.nspname,c.relname) as source_table
  from relations r join pg_class c on c.oid=r.relid
  join pg_namespace n on n.oid=c.relnamespace
)
select source_table,
  case when source_table in (
    'public.testing_center_evidence_batches',
    'public.testing_center_screenshot_evidence',
    'public.testing_center_evidence_outbox')
    then 'abortar si > 0' else 'archivar vinculadas' end as accion,
  ((xpath('/row/n/text()',query_to_xml(
    format('select count(*)::bigint as n from %s',source_table),
    false,true,'')))[1]::text)::bigint as rows_before
from names order by source_table;
```

La migración bloquea el padre y todas sus tablas descendientes por clave
foránea en una transacción. Incluye los ledgers de auditoría e idempotencia
enlazados por `aggregate_id` al issue. Archiva la fila completa de las
cuentas vivas con `to_jsonb`
en `private.testing_center_legacy_archive` con SHA-256, compara recuentos y
hashes con el origen, crea las contribuciones admisibles y vacía los hijos
antes del padre. El aviso SQL final da los recuentos reales de filas archivadas,
padres, mapeadas, conservadas solo en archivo y vaciadas de cuentas ya borradas.
Cualquier discrepancia aborta
la transacción.

Si hay cualquier lote o fila de capturas, aborta antes de tocar datos que
apunten a Storage. También aborta si hay efectos o jobs pendientes en las
colas del subárbol. El contrato inicial citaba ocho tablas; el recorrido real
incluye además los descendientes indirectos de issues, efectos y jobs, y los
dos ledgers lógicos. La consulta anterior los enumera desde el catálogo.
Si un job está en `needs_info` o `needs_owner`, el operador debe resolverlo
y llevarlo a un estado terminal antes del despliegue; no se descarta la cola.
Las entregas de Linear se comprueban por `outcome`: `pending` y `needs_owner`
bloquean, mientras `applied`, `stale` e `ignored` están terminadas.

| Estado legacy | Resultado v2 |
| --- | --- |
| `submitted`, `in_review` | `reviewing` |
| `validated` | `accepted` |
| `rejected` | `declined` |
| `spam` | `spam` |
| `fixed` | `fixed` |
| `draft`, `closed`, `duplicate_linked`, `incomplete` | Solo archivo; no hay equivalente seguro |

El ID inválido y la cuenta sin perfil quedan solo en el archivo. Las filas
de una cuenta ya borrada se vacían sin archivarse, con recuento verificado.
Ningún informe legacy se crea como `received`: no vuelve a triage. El UUID
se deriva del SHA-1 del texto `vanta131:legacy:` seguido del `report_id`,
con los bits de versión y variante fijados; no es un UUIDv5 RFC con namespace UUID.

`legacy_source_id` en la contribución conserva el identificador `report_<hash>`.
Tiene un índice único parcial para que la repetición no cree otra contribución.
Título y cuerpo se ajustan a los límites v2; `app_version`, `os_family`,
`os_version` y `module` caben en `report_metadata`. El archivo conserva los
campos largos y la evidencia original. No se infiere consentimiento nuevo.
Los informes sin cuenta v2 viva o sin ID admisible quedan solo en el archivo.
El archivo no concede acceso a roles API.
`user.deleted` borra del archivo los informes de la cuenta y sus descendientes
según las FK del catálogo. Conserva las ocurrencias de informes de otras
cuentas aunque compartan un issue. La redacción del payload legacy se retira
de esa función mientras las tablas están vacías y cerradas; el `.down.sql`
la restaura junto con el código anterior de borrado.

Desplegar con el tráfico de informes v2 detenido. Pausar también el webhook
de Clerk y los borrados de cuenta durante esta migración y el `.down.sql`:
el lock del archivo y el lock de cuenta tienen orden inverso. Los títulos usan
`action_text` o el placeholder «Informe legacy» y se truncan a 120 caracteres;
el cuerpo usa `expected_text`/`observed_text` o el identificador legacy y se
trunca a 1000. La fila original completa permanece en el archivo. El
`.down.sql` retira solo las contribuciones mapeadas sin cambios posteriores,
restaura primero el padre y después los hijos y verifica hashes. Omite y cuenta
explícitamente filas cuyo dueño tenga `deleted_at` o no tenga perfil, sin
resucitarlas. También omite y cuenta una hija de otra cuenta cuyo padre FK
fue borrado; la fila sigue en el archivo. Se aplica antes del PR de admin #1924 y antes de
retirar tablas/RPC. El archivo se elimina solo en ese paso final. No hay
despliegue automático ni llamada de este trabajo a producción.

Antes de integrar #1924, VANTA-132 debe mover su migración
`20261103224121_isa_1910_admin_report_root.sql` a un timestamp posterior a
`20261104014000`: el guard de admin se ejecuta después del vaciado y
`supabase db push` exige que esa migración tenga un orden posterior. Este PR
no cambia SQL admin.
El guard de #1924 comprueba la tabla de informes legacy y sus escritores
concedidos; su diff no consulta `testing_center_promotions` ni
`testing_center_validations`.

## Cierre 7b: comprobación previa para Isaac

Ejecutar solo en el entorno que Isaac vaya a desplegar, con el tráfico de
informes y los borrados de Clerk pausados. El resultado esperado es **cero**
en el archivo y en las doce tablas exclusivas del informe:

```sql
select 'private.testing_center_legacy_archive' as source_table,count(*) from private.testing_center_legacy_archive
union all select 'public.testing_center_reports',count(*) from public.testing_center_reports
union all select 'public.testing_center_evidence',count(*) from public.testing_center_evidence
union all select 'public.testing_center_triage_results',count(*) from public.testing_center_triage_results
union all select 'public.testing_center_issue_occurrences',count(*) from public.testing_center_issue_occurrences
union all select 'public.testing_center_posthog_consent_events',count(*) from public.testing_center_posthog_consent_events
union all select 'public.testing_center_posthog_evidence',count(*) from public.testing_center_posthog_evidence
union all select 'public.testing_center_report_events',count(*) from public.testing_center_report_events
union all select 'public.testing_center_report_payloads',count(*) from public.testing_center_report_payloads
union all select 'public.testing_center_report_submission_keys',count(*) from public.testing_center_report_submission_keys
union all select 'public.testing_center_screenshot_evidence',count(*) from public.testing_center_screenshot_evidence
union all select 'public.testing_center_evidence_batches',count(*) from public.testing_center_evidence_batches
union all select 'public.testing_center_evidence_outbox',count(*) from public.testing_center_evidence_outbox
union all select 'public.testing_center_technical_issues/report_id',count(*)
  from public.testing_center_technical_issues where report_id is not null
union all select 'public.testing_center_effect_outbox',count(*) from public.testing_center_effect_outbox
union all select 'public.testing_center_linear_projection_snapshots',count(*)
  from public.testing_center_linear_projection_snapshots;

select 'storage.objects/testing-center-evidence' as source,count(*)
from storage.objects where bucket_id='testing-center-evidence'
union all
select 'storage.s3_multipart_uploads/testing-center-evidence',count(*)
from storage.s3_multipart_uploads where bucket_id='testing-center-evidence';
```

La migración final aborta sin cambios si el archivo tiene filas. Si el
piloto conserva alguna, Isaac decide su purga en un paso aparte; este PR no
la automatiza. También aborta si queda una fila en las tablas exclusivas o
una referencia legacy en `technical_issues`, `effect_outbox` o las proyecciones
de Linear, o un objeto/upload del bucket de capturas. Conserva
`technical_issues` y `agent_jobs` para la lectura v2;
Linear y outbox permanecen inertes hasta el paso 12. La migración quita los
triggers antiguos de las tablas conservadas que ya tienen guard v2 y reescribe
los demás para seguir la contribución v2; aborta si el catálogo conserva una
referencia a una tabla retirada. El rollback restaura los 24 triggers afectados,
las funciones y el esquema legacy vacío con sus permisos y políticas. No restaura datos
porque el cierre exige cero antes de retirar las tablas.
Retira diez RPC de envío, triage, consentimiento PostHog y capturas del informe
antiguo, más ocho funciones huérfanas de Codex, Linear, PostHog y admisión
legacy. El rollback restaura sus definiciones, permisos y comentarios.
Las suites `testing_center_*` que escriben informes o capturas legacy son un
corpus histórico: se ejecutan antes del cierre, no sobre el esquema final.
La ruta de subida de capturas del Hub sigue desactivada; el paso 6b debe
conectarse al contrato v2 antes de habilitarla.
