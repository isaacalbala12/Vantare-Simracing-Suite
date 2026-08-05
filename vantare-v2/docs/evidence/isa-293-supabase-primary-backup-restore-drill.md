# ISA-293 — restore drill del backup Supabase principal

Fecha: 2026-08-05

Estado: `NO-GO`; el backup está protegido, pero todavía no tiene restore proof
completo.

## Alcance y seguridad

- Fuente: backup lógico del Supabase principal generado el 2026-08-05.
- Operación remota: ninguna; producción, staging y piloto no se consultaron ni
  modificaron durante el drill.
- El directorio del backup y sus ocho archivos quedaron cifrados con EFS.
- Los checksums del manifiesto pasaron antes y después del cifrado: 7/7.
- El certificado EFS se exportó a un PFX protegido por contraseña. El PFX tiene
  ACL explícita únicamente para Isaac, `SYSTEM` y Administradores.
- Riesgo restante: Isaac debe conservar una segunda copia del PFX fuera de este
  equipo y su contraseña en el gestor; una copia en el mismo disco no es una
  recuperación suficiente ante pérdida del dispositivo.

No se imprimieron dumps, filas Auth, sesiones, refresh tokens, texto de usuario,
secretos ni valores de credenciales.

## Harness ejecutado

- Imagen exacta: `public.ecr.aws/supabase/postgres:17.6.1.155`.
- Un contenedor efímero, sin puertos publicados.
- Límites: 1 CPU, 1 GiB de RAM, sin swap adicional, 256 procesos y 256 MiB de
  memoria compartida.
- Volumen y contenedor etiquetados exclusivamente para ISA-293.
- Backup montado read-only.
- SQL plano con `ON_ERROR_STOP=1`, sin perfil de `psql` y con transacción única
  para schema/datos/historial.

El contenedor quedó healthy con unos 115 MiB antes del restore. Los roles se
aplicaron correctamente. El schema falló una vez, antes de cargar datos, porque
el destino no contenía el namespace administrado `extensions`. La transacción
revirtió la fase completa. No comenzaron las fases de datos ni historial.

## Hallazgo

El paquete actual no es autosuficiente para una restauración local:

- `schema.sql` crea exclusivamente objetos `public` y presupone el baseline de
  plataforma de Supabase;
- `data.sql` contiene 53 bloques `COPY` para `auth`, `public` y `storage`;
- la imagen PostgreSQL inicializa parte de Auth, pero no las tablas de Storage,
  que normalmente crea el servicio Storage mediante sus migraciones;
- crear solo el schema `extensions`, omitir Storage o inventar tablas habría
  producido una prueba parcial y engañosa.

Por tanto, una imagen PostgreSQL compatible es necesaria pero no suficiente:
el restore drill también necesita un baseline vacío completo y versionado de
los servicios administrados por Supabase.

## Contención y limpieza

- No se hizo un segundo restore improvisado.
- La base efímera nunca recibió datos del dump.
- El contenedor y volumen de ISA-293 se eliminaron por nombre y labels exactos.
- Los 16 contenedores que ya estaban activos antes del drill siguieron intactos.
- No hubo cambios en código, SQL de producto, dependencias, migraciones,
  funciones, secrets, deploys o ramas de canal.

## Siguiente gate

Antes de reintentar hay que generar un baseline vacío con una versión fijada de
Supabase CLI y sus servicios Auth/Storage, sin reutilizar el stack local activo
ni datos existentes. La opción recomendada es:

1. reservar una ventana local de recursos y un project ID/puertos temporales;
2. iniciar un stack Supabase CLI completamente aislado y sin red remota;
3. exportar únicamente el baseline de schema administrado y su manifiesto de
   versiones, sin filas;
4. cifrar y añadir ese baseline al paquete de recuperación, con checksum;
5. destruir el stack completo;
6. repetir el restore en un solo PostgreSQL limitado y exigir los ocho usuarios
   Auth, Storage 0/0, historial, RLS, índices, funciones y smoke sintético.

Este paso es de riesgo operativo por consumo local. Requiere autorización de
Isaac y no puede ejecutarse en paralelo con el stack Supabase existente.
