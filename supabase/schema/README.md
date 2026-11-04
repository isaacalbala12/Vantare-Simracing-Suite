# Esquema vigente por dominio

Estos archivos son volcados derivados y de solo lectura. `supabase/migrations/` sigue siendo la única fuente de cambios SQL. El generador reproduce la cadena completa en una base PostgreSQL local desechable, aplica el cierre 7b y separa las definiciones por prefijo de tabla. Incluye ACL, RLS, índices, triggers y un inventario normalizado de buckets, cron y semillas de política. El comando de cron se representa por su hash, sin publicar su contenido.

Para comprobarlos con el mismo contenedor PostgreSQL que usa CI:

```sh
python3 supabase/tests/run-commercial-local.py --docker --pg-bin "$(pg_config --bindir)" --schema-snapshot check --output /tmp/vantare-schema-check
```

Para regenerarlos después de una migración aprobada, cambia `check` por `write` y copia los nueve archivos de `<output>/schema/` aquí. `mail.sql` y `operations.sql` reúnen los objetos de correo y acceso operativo; los ACL y comentarios siguen al objeto que describen. No ejecutes este modo contra una base alojada: el runner solo crea una base local desechable.
