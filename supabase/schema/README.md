# Esquema vigente por dominio

Estos archivos son volcados derivados y de solo lectura. `supabase/migrations/` sigue siendo la única fuente de cambios SQL. El generador reproduce la cadena completa en una base PostgreSQL local desechable, aplica el cierre 7b y separa las definiciones por prefijo de tabla. Incluye ACL, RLS, índices, triggers y un inventario normalizado de buckets, cron y semillas de política. El comando de cron se representa por su hash, sin publicar su contenido.

Para comprobarlos con el mismo contenedor PostgreSQL que usa CI:

```sh
python3 supabase/tests/run-commercial-local.py --docker --pg-bin "$(pg_config --bindir)" --schema-snapshot check --output /tmp/vantare-schema-check
```

Para regenerarlos después de una migración aprobada, cambia `check` por `write` y copia los nueve archivos de `<output>/schema/` aquí. `mail.sql` y `operations.sql` reúnen los objetos de correo y acceso operativo; los ACL y comentarios siguen al objeto que describen. No ejecutes este modo contra una base alojada: el runner solo crea una base local desechable.

El generador exige Docker, PostgreSQL y pg_dump **17.6**, imagen
`public.ecr.aws/supabase/postgres:17.6.1.165`, digest
`sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518`.
Comprueba versiones y digest antes de escribir o comparar; conserva las opciones
`--schema-only --no-owner`, incluidas las ACL. La CI comprueba que su imagen y
digest coinciden con el generador. Si Docker no está disponible localmente, usa
los nueve archivos del artefacto del replay de CI; no regeneres con PG16.

Los argumentos de `guard_account_write` que agregan UUID con DISTINCT y ORDER BY
pueden recibir ramas UNION en distinto orden según el catálogo. El generador
ordena esas ramas externas; conserva subconsultas, literales y UNION ALL. No
reescribe las migraciones ni otros cuerpos SQL. Dos fixtures reales PG16/PG17
verifican igualdad e idempotencia de los volcados derivados.
