# #1608 · Abort de borrado · Storage v1.70.3

Variante **preparada y probada solo en local**. No se despliega ni se conecta a
un servicio gestionado. El orquestador debe revisar el parche y decidir su
integración/activación; el cliente contra la imagen original sigue reteniendo
el multipart, aunque ahora limpia los objetos terminados independientes.

La imagen original hace `canUpload(isUpsert:true)` antes del abort. Un manifest
de una cuenta tombstoneada rechaza ese INSERT de prueba con `28000`. El parche
modifica exclusivamente `abortMultipartUpload`: la sesión de servicio verificada
por SignatureV4/JWT no simula escritura; comprueba que bucket/key coinciden con
el upload almacenado y llama al backend original antes de eliminar metadata.
Las sesiones sin rol de servicio conservan el control original. Ningún INSERT,
UPDATE, trigger, rol SQL o GUC obtiene una excepción a la barrera.

No se borran filas Storage directamente desde Edge/SQL: el backend file guarda
partes y metadata en disco incluso antes de tener partes; S3 tiene su propio
multipart. Borrar filas dejaría esos datos huérfanos. [Contrato de Storage](https://supabase.com/docs/guides/storage/schema/design).
El backend y el DELETE de upload con cascade a partes son los originales.
Un error del backend impide el DELETE y el ACK; `NoSuchUpload` permite reintentar
un ACK perdido, como antes. El limpiador conserva HTTP 503 si quedan uploads,
pero drena la cola de objetos independientemente.

El Dockerfile fija versión y digest; el script verifica SHA-256 del fichero
distribuido completo y falla antes de modificarlo si cambia. Node y sus módulos
estándar ya están en la imagen. Sin paquetes, credenciales o dependencias nuevas.

## Reproducción local

Desde la raíz Git, usar una carpeta de evidencia nueva con subcarpeta `stack`.
Inicializar/arrancar ahí un proyecto Supabase **vacío**, nunca el del checkout ni
una instalación existente. El fixture usa los puertos loopback 54321/54328/54330,
contenedor `supabase_db_stack`, red `supabase_network_stack` y credenciales
sintéticas. Aplicar las migraciones del checkout a esa base desechable como
`supabase_admin`, con `search_path=public,extensions`. Esta aplicación manual
evita el fallo administrativo del bootstrap CLI del checkout en #1535.

```sh
supabase init --workdir <evidencia>/stack
supabase start --workdir <evidencia>/stack -x studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor
python3 tools/storage/local-fixture.py start --output <evidencia>
python3 tools/storage/local-fixture.py proxy --output <evidencia>
```

El proxy ocupa otra terminal y reproduce únicamente el prefijo del gateway.
Para RED usar el limpiador de `0a8e794f` con imagen original y ejecutar:

```sh
python3 supabase/tests/commercial_storage_cleanup.py --output <evidencia> --phase red
```

`red-isolation` prueba el limpiador corregido contra imagen original: no converge
el abort, pero los PNG desaparecen y la cola del upload permanece. Antes de
cambiar de contenedor, conservar los bytes sintéticos si se quiere verificar
también la reentrega de las mismas subidas previas (no datos instalados).

```sh
docker build -t vantare-storage:isa-1608-r6 tools/storage
docker stop isa1608-r6-storage
python3 tools/storage/local-fixture.py start --output <evidencia> --patched
python3 supabase/tests/commercial_storage_cleanup.py --output <evidencia> --phase green
```

El GREEN crea manifest, multipart y parte con bytes, y PNG privado de 68 bytes
antes del tombstone, para owners NULL y UUID. Comprueba dos reintentos, ambas
colas, uploads/partes, bytes en backend y denegaciones de ruta/JWT. Un abort
fallido conserva upload/parte/cola y permite eliminar el PNG independiente.
El fallo real del backend se puede comprobar reiniciando con
`--backend <bytes-sintéticos> --read-only`; eliminar readonly y reentregar debe
resolverlo. No prueba S3 gestionado, OAuth/Clerk/Polar gestionados ni venta.

Al acabar, detener solo el proxy/contenedor creados aquí y
`supabase stop --workdir <evidencia>/stack --no-backup`. Volver a la imagen
original revierte el parche; las colas pendientes siguen durables y el limpiador
conserva sus errores. La activación remota y un proveedor que no admita esta
imagen siguen pendientes de decisión y validación propias.
