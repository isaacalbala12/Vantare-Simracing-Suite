# BIL-10C — acceso operativo y retiro de grants legacy

## Objetivo y autoridad

Este corte separa dos autoridades que nunca deben mezclarse:

- Polar y `billing_access_grants` representan compras y suscripciones.
- `operational_access_assignments` representa únicamente Tester,
  Tester Nightly y Owner.

Una asignación operativa desbloquea módulos mediante una credencial firmada,
pero no crea un plan, una compra ni permisos administrativos en el cliente.
Los grants `legacy/legacy` se conservan como evidencia histórica, no se emiten
en credenciales y solo se marcan `revoked` mediante una operación por cuenta.

## Roles y leases

| Rol | Módulos | Canales | Lease offline máximo |
|---|---|---|---:|
| `tester` | Todos | Stable + Testers | 14 días |
| `nightly_tester` | Todos | Stable + Testers + Nightly | 72 horas |
| `owner` | Todos | Stable + Testers + Nightly | 30 días |

La asignación servidor puede no caducar. La credencial local siempre caduca y
limita el tiempo máximo de una revocación mientras el equipo está offline.

## Fronteras de seguridad

- Las tablas y RPC no son accesibles por `anon` ni `authenticated`.
- La aplicación recibe capabilities firmadas, nunca `service_role`.
- Solo puede existir un rol operativo activo por cuenta.
- Conceder, reemplazar y revocar son idempotentes y auditados.
- El historial de acceso y de retiro legacy es append-only.
- La CLI usa UUID, no email, y nunca imprime la clave ni el UUID completo.
- El modo predeterminado de cualquier mutación es dry-run.

## Inventario read-only previo

La evidencia sanitizada del 2026-08-03 registró cinco grants legacy activos en
cinco cuentas. La cuenta del smoke tenía dos capacidades legacy. No se guardan
en este documento emails, UUID, fingerprints, tokens ni payloads. Antes del
apply debe repetirse el inventario: estos conteos no son una autorización ni
una afirmación de estado actual.

## Preparación

1. Aplicar la migración en una base desechable y ejecutar clean, upgrade y
   restore.
2. Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en la consola
   administrativa; nunca en la aplicación ni en Git.
3. Resolver la cuenta objetivo a UUID por un canal administrativo autorizado.
4. Ejecutar los previews. No usar `--apply`.

```powershell
go run ./cmd/vantare-admin operational-access preview <user_uuid>
go run ./cmd/vantare-admin operational-access legacy-preview <user_uuid>
go run ./cmd/vantare-admin operational-access grant <user_uuid> owner linear:isa-247 "Owner Vantare aprobado" isa-247-owner
go run ./cmd/vantare-admin operational-access legacy-retire <user_uuid> linear:isa-247 "Legacy clasificado y retirado" isa-247-legacy
```

La salida debe indicar `mode=dry-run writes=0`, el rol propuesto, un sufijo
sanitizado de la cuenta y el conteo/capabilities legacy. No continuar si aparece
otra cuenta, otro rol, otra cantidad o una capability no clasificada.

## Backup obligatorio

Antes de cualquier apply remoto, crear un backup cifrado y restringido de:

- `billing_access_grants` de las cuentas clasificadas;
- `user_entitlements` derivadas de esas cuentas;
- `operational_access_assignments` y ambos historiales de auditoría;
- versión exacta de migración y SHA del código desplegable.

Verificar que el backup puede restaurarse en una base desechable y registrar
solo conteos y checksum en Linear. No adjuntar filas, emails o UUIDs.

## Apply controlado

Requiere aprobación explícita de Isaac sobre el dry-run y el backup. La secuencia
reduce la ventana sin acceso:

1. Aplicar la migración.
2. Conceder el rol correcto.
3. Desplegar el emisor que reconoce el rol e ignora autoridad legacy.
4. Validar login y credencial online.
5. Retirar los grants legacy clasificados.
6. Repetir preview y smoke.

```powershell
go run ./cmd/vantare-admin operational-access grant <user_uuid> owner linear:isa-247 "Owner Vantare aprobado" isa-247-owner --apply
go run ./cmd/vantare-admin operational-access legacy-retire <user_uuid> linear:isa-247 "Legacy clasificado y retirado" isa-247-legacy --apply
```

Para testers, sustituir `owner` por `tester` o `nightly_tester`. Una cuenta no
puede conservar dos roles operativos activos.

## Smoke no monetario

1. Login y Actualizar estado de licencia.
2. Confirmar que Cuenta muestra Plan y Acceso operativo por separado.
3. Confirmar módulos desbloqueados.
4. Confirmar canales: Tester no ve Nightly; Nightly Tester y Owner sí.
5. Reiniciar y validar Credential Manager.
6. Desconectar red y validar el lease correspondiente.
7. Revocar el rol, reconectar y confirmar efecto inmediato.
8. Confirmar que no se creó order, subscription, refund ni grant Polar.

## Revocación y rollback

La revocación normal no es un rollback comercial:

```powershell
go run ./cmd/vantare-admin operational-access revoke <user_uuid> owner linear:isa-247 "Revocación aprobada" isa-247-owner-revoke --apply
```

Si el retiro legacy fue incorrecto, detener despliegues y restaurar únicamente
las filas exactas desde el backup verificado, en una operación separada y
aprobada. No cambiar `provider`, `environment`, capability ni procedencia a
mano. Repetir la proyección derivada, previews y smoke. Git revierte código; no
revierte datos remotos.

## Estado de este corte

La implementación y pruebas son locales. No se aplicó la migración, no se
asignó Owner, no se retiró ningún grant remoto y no hubo pagos, refunds ni
promoción a Testers/Master. Billing continúa NO-GO hasta ejecutar los gates
remotos y monetarios aprobados.
