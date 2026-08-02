# Runbook — backup y restauración Supabase

## Principio

Nunca probar una restauración sobre producción. Toda restauración se realiza en una base o proyecto desechable, con autorización para acceder al backup y sin copiar PII en logs o documentación.

## Objetivos

- RPO provisional: 24 horas; 5 minutos solo tras verificar PITR remoto.
- RTO objetivo: 4 horas, pendiente de drill remoto autorizado.
- Retención local: 30 copias diarias verificadas.
- Drill trimestral o después de un cambio de esquema crítico.

## Contrato operativo actual de producción

El proyecto de producción continúa en Supabase Free. Ese plan no proporciona
backups diarios administrados ni PITR. Por tanto, Vantare mantiene un backup
lógico diario local como gate mínimo de despliegue:

- tarea de Windows `Vantare Supabase Production Backup`, a las 03:00;
- ejecución posterior si el equipo no estaba disponible a esa hora, al volver
  a existir una sesión iniciada del usuario de Windows;
- una única ejecución simultánea y límite de dos horas;
- ejecución condicionada a red, permitida con batería y sin detenerse al
  cambiar de alimentación;
- credenciales protegidas con DPAPI para el usuario de Windows actual;
- directorios privados con ACL de usuario/SYSTEM y cifrado EFS;
- dump separado de roles, esquema, datos completos, datos `public` e historial
  de migraciones;
- manifiesto sin PII con tamaño y SHA-256 de cada archivo;
- archivo ZIP cifrado por herencia EFS;
- restauración real de esquema y datos `public` en un contenedor local
  desechable antes de declarar PASS;
- retención de 30 días y registro JSONL sin secretos ni contenido de tablas.

El backup no se considera válido si únicamente se genera el ZIP. Deben pasar
integridad y restauración local. `deploy-approved-billing-stack.ps1` vuelve a
verificar una copia de menos de 26 horas antes de aceptar el apply de
producción cuando Supabase no ofrece un backup remoto.

### Instalación o rotación de credenciales

La instalación requiere, solo durante ese proceso, las variables
`SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`. El segundo valor es la
contraseña de base de datos del proyecto, no la anon key ni la service role.
El instalador las convierte inmediatamente a ficheros DPAPI y no las incluye
en los argumentos ni en la definición de la tarea:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  supabase\functions\scripts\install-supabase-backup-task.ps1 `
  -CredentialEnvFile frontend\.env.local -RunNow
```

Después de comprobar la primera ejecución, retirar esas variables del proceso
y de cualquier archivo temporal utilizado para transferirlas. Para rotarlas,
repetir el instalador; no editar manualmente los ficheros `.dpapi`.

### Evidencia diaria

La raíz por defecto es
`%LOCALAPPDATA%\Vantare\backups\supabase\production`. Revisar:

1. un ZIP `supabase-<project-ref>-<UTC>.zip` del día;
2. atributo EFS activo en el archivo y en el directorio;
3. último evento `PASS` en `backup-events.jsonl`;
4. resultado `restore_verification=PASS` en el historial de la tarea;
5. `LastTaskResult = 0` en el Programador de tareas.

No abrir ni copiar datos del backup para documentar el resultado. Se registran
únicamente metadatos, hashes, versiones y resultado del restore.

### Limitaciones que no deben ocultarse

- EFS depende del perfil y certificado del usuario de Windows. Una pérdida
  completa del equipo o del perfil puede dejar inaccesibles estas copias.
- La tarea utiliza la sesión interactiva del usuario para que DPAPI, EFS y la
  red estén disponibles; no ejecuta el backup con el equipo apagado o antes de
  iniciar sesión.
- Una copia en el mismo PC protege un despliegue y errores lógicos, pero no es
  un backup externo frente a pérdida física o ransomware.
- El dump de base de datos conserva metadatos de Supabase Storage, pero no los
  objetos binarios almacenados por la API de Storage.
- El dump completo conserva los datos administrados de Auth/Storage, pero el
  restore automático local cubre `public`, que es la superficie modificada por
  Billing. Probar Auth/Storage exige restaurar en un proyecto Supabase
  desechable con sus servicios y migraciones administradas.
- Edge Functions, configuración Auth, API keys y secretos se reconstruyen
  desde el repositorio y los runbooks; no viven dentro del dump lógico.
- Antes del lanzamiento público debe añadirse una segunda copia cifrada fuera
  del equipo o contratar backups administrados. No se presentará este mecanismo
  local como equivalente a PITR.

## Procedimiento local seguro

1. Desde la raíz del repositorio, ejecutar `supabase/tests/run-supabase-hardening-postgres.ps1`.
2. El runner crea PostgreSQL 17 desechable, prueba instalación limpia y upgrade.
3. Genera un dump, crea una segunda base desechable y restaura el dump.
4. Ejecuta `pg_restore --exit-on-error` y captura su código de salida antes de cualquier otro comando.
5. Repite pgTAP sobre la base restaurada y verifica RLS, grants y un dato centinela.
6. Ejecuta dos restores negativos: un dump truncado y otro con la cabecera corrupta. Ambos deben fallar con `--exit-on-error`; si cualquiera devuelve éxito, el drill completo falla.
7. Termina eliminando el contenedor y los archivos temporales.
8. Registrar fecha, versión, tiempo y resultado; nunca registrar credenciales o contenido personal.

## Drill remoto autorizado

1. Confirmar propietario, ventana, backup exacto y proyecto destino desechable.
2. Verificar cifrado, acceso mínimo y espacio disponible.
3. Restaurar en destino aislado.
4. Ejecutar migraciones/checks sin realizar escrituras comerciales externas.
5. Validar funciones, RLS/grants, conteos sanitizados y smoke de autenticación con cuenta de prueba.
6. Destruir el destino según la retención autorizada y registrar evidencia sin PII.

## Fallo

Si no puede demostrarse la restauración, el backup no cuenta como recuperable. Billing permanece NO-GO y se abre una incidencia sin intentar reparar producción durante el drill.
