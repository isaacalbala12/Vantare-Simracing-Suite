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
enlazados por `aggregate_id` al issue. Archiva `to_jsonb` de cada fila completa
en `private.testing_center_legacy_archive` con SHA-256, compara recuentos y
hashes con el origen, crea las contribuciones admisibles y vacía los hijos
antes del padre. El aviso SQL final da los recuentos reales de filas archivadas,
padres, mapeadas y conservadas solo en archivo. Cualquier discrepancia aborta
la transacción.

Si hay cualquier lote o fila de capturas, aborta antes de tocar datos que
apunten a Storage. También aborta si hay efectos o jobs pendientes en las
colas del subárbol. El contrato inicial citaba ocho tablas; el recorrido real
incluye además los descendientes indirectos de issues, efectos y jobs, y los
dos ledgers lógicos. La consulta anterior los enumera desde el catálogo.

| Estado legacy | Resultado v2 |
| --- | --- |
| `submitted`, `in_review` | `reviewing` |
| `validated` | `accepted` |
| `rejected` | `declined` |
| `spam` | `spam` |
| `fixed` | `fixed` |
| `draft`, `closed`, `duplicate_linked`, `incomplete` | Solo archivo; no hay equivalente seguro |

El ID inválido, la cuenta sin perfil y la cuenta con `deleted_at` quedan solo
en el archivo. Ningún informe legacy se crea como `received`: no vuelve a
triage. El UUID v2 se deriva de forma determinista del `report_id` con SHA-1,
versión 5 y namespace `vanta131:legacy:`.

`legacy_source_id` en la contribución conserva el identificador `report_<hash>`.
Tiene un índice único parcial para que la repetición no cree otra contribución.
Título y cuerpo se ajustan a los límites v2; `app_version`, `os_family`,
`os_version` y `module` caben en `report_metadata`. El archivo conserva los
campos largos y la evidencia original. No se infiere consentimiento nuevo.
Los informes sin cuenta v2 viva o sin ID admisible quedan solo en el archivo.
El archivo no concede acceso a roles API.

Desplegar con el tráfico de informes v2 detenido. Los títulos usan
`action_text` o el placeholder «Informe legacy» y se truncan a 120 caracteres;
el cuerpo usa `expected_text`/`observed_text` o el identificador legacy y se
trunca a 1000. La fila original completa permanece en el archivo. El
`.down.sql` retira solo las contribuciones mapeadas sin cambios posteriores,
restaura primero el padre y después los hijos y verifica hashes. Omite y cuenta
explícitamente filas cuyo dueño tenga `deleted_at` o no tenga perfil, sin
resucitarlas, y deja el archivo intacto. Se aplica antes del PR de admin #1924 y antes de
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
