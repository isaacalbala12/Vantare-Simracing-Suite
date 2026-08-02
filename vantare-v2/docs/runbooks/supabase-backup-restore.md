# Runbook — backup y restauración Supabase

## Principio

Nunca probar una restauración sobre producción. Toda restauración se realiza en una base o proyecto desechable, con autorización para acceder al backup y sin copiar PII en logs o documentación.

## Objetivos

- RPO provisional: 24 horas; 5 minutos solo tras verificar PITR remoto.
- RTO objetivo: 4 horas, pendiente de drill remoto autorizado.
- Retención propuesta: 30 días de backups diarios.
- Drill trimestral o después de un cambio de esquema crítico.

## Procedimiento local seguro

1. Desde la raíz del repositorio, ejecutar `supabase/tests/run-supabase-hardening-postgres.ps1`.
2. El runner crea PostgreSQL 17 desechable, prueba instalación limpia y upgrade.
3. Genera un dump, crea una segunda base desechable y restaura el dump.
4. Verifica el contrato de entitlement read y termina eliminando el contenedor.
5. Registrar fecha, versión, tiempo y resultado; nunca registrar credenciales o contenido personal.

## Drill remoto autorizado

1. Confirmar propietario, ventana, backup exacto y proyecto destino desechable.
2. Verificar cifrado, acceso mínimo y espacio disponible.
3. Restaurar en destino aislado.
4. Ejecutar migraciones/checks sin realizar escrituras comerciales externas.
5. Validar funciones, RLS/grants, conteos sanitizados y smoke de autenticación con cuenta de prueba.
6. Destruir el destino según la retención autorizada y registrar evidencia sin PII.

## Fallo

Si no puede demostrarse la restauración, el backup no cuenta como recuperable. Billing permanece NO-GO y se abre una incidencia sin intentar reparar producción durante el drill.
