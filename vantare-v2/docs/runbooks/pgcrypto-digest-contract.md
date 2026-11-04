# pgcrypto y digest · preflight de solo lectura (#1933)

La cadena histórica no fija el schema de pgcrypto. El contrato vigente para
SQL nuevo es `public.digest(text,text)` y `public.digest(bytea,text)`. Si la
extensión nativa vive en `extensions`, la migración histórica `20260802095000`
ya crea esos wrappers. Si vive en `public`, `20261104172000` crea las dos
firmas de `extensions.digest` como compatibilidad para los llamadores
históricos. No se edita SQL fusionado de Billing ni Testing.

Isaac puede ejecutar esta consulta **de solo lectura** en cada entorno antes
del despliegue y otra vez después de `20261104172000`:

```sql
select coalesce(n.nspname, '<missing>') as pgcrypto_native_schema,
  to_regprocedure('public.digest(text,text)') is not null as public_text,
  to_regprocedure('public.digest(bytea,text)') is not null as public_bytea,
  to_regprocedure('extensions.digest(text,text)') is not null as extensions_text,
  to_regprocedure('extensions.digest(bytea,text)') is not null as extensions_bytea
from (values (1)) as probe(x)
left join pg_extension e on e.extname = 'pgcrypto'
left join pg_namespace n on n.oid = e.extnamespace;
```

Antes: `extensions` requiere las cuatro firmas; `public` requiere sus dos
firmas nativas y puede carecer de las de `extensions`. Después, las cuatro
deben ser `true`. `<missing>` u otro schema detiene la migración con error
`55000`; no se instala ni mueve la extensión automáticamente. El despliegue
de la cadena desde cero sigue requiriendo pgcrypto en `extensions`, ya que
SQL histórico anterior a `20261104172000` llama a ese schema.

El rollback no cambia la extensión nativa. Con pgcrypto en `extensions` no
modifica nada; con pgcrypto en `public` retira solo los dos bridges marcados
por #1933 y falla cerrado si aparecen dependencias o deriva el catálogo.
La ruta `public` volvería a carecer de compatibilidad para llamadores
históricos tras ese rollback.

Prueba reproducible: `python supabase/tests/run-pgcrypto-local.py --pg-bin
<directorio-bin-PostgreSQL-local>`; usa dos bases desechables. La caracterización
previa dio PASS con extensión en `extensions` y RED con extensión en `public`;
la migración, rollback y reaplicación pasan en ambas. No se consulta ningún
entorno alojado durante esa prueba.
