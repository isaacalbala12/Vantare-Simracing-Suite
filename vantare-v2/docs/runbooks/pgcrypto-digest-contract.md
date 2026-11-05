# pgcrypto y digest · sonda de despliegue (#1933)

La migración `20261104182500` **solo comprueba** las cuatro firmas `digest` y
dos vectores SHA-256 conocidos. No crea funciones ni cambia ACL, hashes o datos.
Su rollback es vacío. El SQL histórico anterior a esa migración ya llama a
`extensions.digest`; si pgcrypto vive en `public`, la reconstrucción puede
fallar en `20260812214951` antes de llegar a la sonda. Un puente aquí no
repararía ese orden. La cadena existente debe poder reproducirse antes de
desplegar la sonda.

Isaac ejecuta esta consulta **de solo lectura** en cada entorno antes del
despliegue. Muestra el schema nativo de pgcrypto y, por firma, si existe,
si pertenece a la extensión, si es un wrapper u otro objeto ajeno a la
extensión, `SECURITY DEFINER` y el `search_path`/configuración de función:

```sql
with signatures(signature) as (
  values ('public.digest(text,text)'), ('public.digest(bytea,text)'),
         ('extensions.digest(text,text)'), ('extensions.digest(bytea,text)')
)
select s.signature,
  (select n.nspname from pg_extension e
   join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto') as pgcrypto_native_schema,
  p.oid is not null as present,
  case when p.oid is null then 'missing'
       when exists (
         select 1 from pg_depend d
         join pg_extension e on e.oid = d.refobjid
         where d.classid = 'pg_proc'::regclass and d.objid = p.oid
           and d.refclassid = 'pg_extension'::regclass
           and d.deptype = 'e' and e.extname = 'pgcrypto'
       ) then 'native_pgcrypto'
       else 'wrapper_or_other' end as origin,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from signatures s
left join pg_proc p on p.oid = to_regprocedure(s.signature)
order by s.signature;
```

En el layout alojado esperado, el schema nativo es `extensions`, las cuatro
firmas están presentes, las dos `extensions.digest` son nativas y las dos
`public.digest` son wrappers históricos con `search_path` explícito. Si falta
una firma, pgcrypto vive en otro schema, o `prosecdef`/`proconfig` difieren de
lo esperado, Isaac detiene el despliegue y revisa el objeto y la cadena. La
sonda aborta con `55000` y un mensaje claro si falta una firma o el resultado
de `public.digest('vantare','sha256')` para text o bytea no es
`6738bfc70361a193446e86934c58b83336f69da45ec84ae0471af1cc6493969a`.

Prueba reproducible local: `python supabase/tests/run-pgcrypto-local.py
--pg-bin <directorio-bin-PostgreSQL-local>`. El runner crea bases desechables:
comprueba el layout alojado, la ausencia de firmas, la ausencia de extensión,
los dos vectores alterados y una llamada desde una función `SECURITY DEFINER`
con `search_path=''`. No consulta ningún entorno alojado.
