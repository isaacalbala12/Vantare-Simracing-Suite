# #1608 · Borrado con Supabase Storage gestionado

R7 utiliza la imagen **original v1.70.3**, sin parche, imagen propia ni SQL DELETE
sobre metadata Storage. Sustituye el experimento R6 conservado en Git.

Storage llama `canUpload(isUpsert:true)` antes del abort: intenta insertar un
objeto con `version='1'` y revierte la transacción de comprobación. La barrera
de tombstones rechazaba ese intento, reteniendo para siempre upload y bytes.
`20261015090000_isa_1608_managed_storage_abort.sql` añade un BEFORE trigger
anterior a la barrera que devuelve **NULL** exclusivamente para esa comprobación
(service JWT, operación abort, método DELETE, upload en cola de identidad borrada,
bucket/key exactos, INSERT/version 1). El INSERT y su ON CONFLICT se descartan;
no se permite ninguna escritura persistente. Incluso falsificando los GUC desde
SQL solo se consigue una operación sin filas. Las altas, partes y finalizaciones
HTTP conservan la barrera. La consulta usa el uploadId del request para impedir
que el abort original autorice un key distinto del upload pendiente.

El backend original elimina bytes, después Storage borra upload/partes y Edge
confirma la cola. Un error real conserva los pendientes y devuelve 503; restaurar
el backend permite el 200 y ambos retries idempotentes. El limpiador sigue
eliminando objetos terminados aunque falle el abort. El test SQL prueba ausencia
de filas persistentes con GUC falsificados, JWT incorrecto y versiones reales.

## Reproducción local

Solo un proyecto desechable **vacío** llamado `stack`, puertos loopback 54321,
54328 y 54330; no ejecutar contra un stack con datos instalados o usuarios reales.
Las credenciales del fixture son sintéticas y caducan en una hora.

```sh
supabase init --workdir <evidencia>/stack
supabase start --workdir <evidencia>/stack -x studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor
```

Aplicar todas las migraciones del checkout, en orden, a `supabase_db_stack` con
`psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1` y
`PGOPTIONS='-c search_path=public,extensions'` dentro del contenedor. La aplicación
manual evita el problema administrativo del bootstrap CLI #1535; no usar secretos
instalados ni el proyecto Supabase de producción.

```sh
python3 tools/storage/local-fixture.py start --output <evidencia> --backend <bytes-sintéticos>
python3 tools/storage/local-fixture.py proxy --output <evidencia>
# Proxy en otra terminal. --backend requiere una carpeta nueva ya creada.
python3 supabase/tests/commercial_storage_cleanup.py --output <evidencia> --phase green
python3 supabase/tests/commercial_storage_cleanup.py --output <evidencia> --phase green --replay
```

GREEN crea uploads con manifest (owner NULL/UUID), partes con bytes y PNG
terminados; rechaza altas/partes/finalizaciones tras tombstone y aborts con ruta,
JWT o firma incorrectos. Envía un webhook Svix firmado a la función real con
SQL/PostgREST/Storage locales y exige 200/503 y estado de las dos colas en dos
reintentos. El outage inyectado conserva una subida para probar recuperación.
El replay elimina la inyección y exige **0 uploads / 0 partes / 0 bytes / 0 colas**.

Para un fallo real, detener el contenedor del fixture, conservar los mismos bytes
y reiniciar con `--backend <misma-carpeta> --read-only`. Crear previamente
`<misma-carpeta>/fixture-bucket` (Storage intenta crearla al arrancar). Ejecutar
`--phase green --replay --expect-outage`: usa los uploads aún presentes, llama al
abort real y exige 503, 1 upload/parte/cola, sin ACK. Restaurar RW y ejecutar replay:
los mismos datos deben desaparecer y los webhooks dar 200. Al acabar detener solo
el proxy y `isa1608-r6-storage` creados aquí, y el proyecto desechable propio.

RED reproducible: omitir únicamente el trigger `a0_deletion_abort_probe` en la
base desechable y ejecutar `--phase red-isolation` con la imagen original. Los
objetos terminados salen; upload/parte/bytes/cola persisten y el webhook da 503.
Crear de nuevo el trigger de la migración y reentregar esos mismos uploads.

## Límites de contrato y despliegue

La adaptación depende del contrato observado de v1.70.3: operación SQL,
request.path y preflight version 1. Si cambia, falla cerrado, deja cola y 503;
repetir este test al actualizar Storage. No se ha desplegado ni probado en un
proyecto gestionado real. Su despliegue mantiene la autorización separada.
Supabase documenta abort automático a las **24 horas** en
[S3 uploads](https://supabase.com/docs/guides/storage/uploads/s3-uploads), consultado
el 15/10/2026. No se usa como prueba de purga local ni como sustituto del abort.

R6-P3-1: los buckets son configuración global, no una API de buckets por usuario.
La barrera cubre owner/owner_id y herencia a contenidos, pero no se borra ni
anonimiza automáticamente el propietario de un bucket histórico de usuario.
**DUDA para Isaac/orquestador:** inventariar en producción (solo con autorización)
`storage.buckets WHERE owner IS NOT NULL OR nullif(owner_id,'') IS NOT NULL`.
Si existen, requieren una entrega de purga de buckets por API después de vaciarlos;
el presente corte no acredita ausencia de esos UUID en producción. No se borran
buckets globales compartidos durante el borrado de una cuenta.

R6-P3-3: nombres/metadata de objetos globales sin owner ni manifest no pueden
contener PII de usuario: no hay identidad que la barrera pueda resolver. Los datos
de cuenta deben llevar owner durable o manifest de Testing Center; las fotos
Pilot se atribuyen también por el prefijo UUID/hash.jpg. Configuración global sin
propietario conserva su escritura legítima. Este límite no equivale a inventario
ni revisión del contenido real de producción.
