# ADR 0100 — Identidad Clerk, comercio Polar y datos Supabase

Fecha: 2026-10-08. Estado: **propuesto**. Issue:
[#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514).
Isaac ha aprobado la dirección de proveedores; implementación y detalles de
migración pendientes de revisión. Este ADR no acepta una venta ni un deploy.

## Contexto

La app nativa usa OAuth Clerk y un resolver UUID; billing de la base #1506 usa
`supabase.auth.getUser`. Sus tokens/usuarios no son intercambiables. FKs/RLS
legacy esperan `auth.users`/`auth.uid`; cambiar solo el botón permite cobrar sin
proveer derechos. #909 separa identidad externa de cuenta UUID y BIL-08 firma
esta última para un dispositivo. Supabase se mantiene como backend, Polar MoR
como autoridad comercial y Vantare como autoridad de grants/capabilities.

## Decisión propuesta

1. Clerk es la única fuente nueva de identidad: sesión web con integración
   oficial Supabase TPA, OAuth nativo verificado con API oficial existente. Un
   OAuth token no se presenta como Clerk session JWT.
2. Conservar UUID de cuenta `profiles.id` y mapping privado
   `account_identities(issuer, subject, account_id)`. `issuer` y `subject` son
   text; no convertir todas las claves de negocio a text. Bootstrap explícito
   idempotente; RLS consulta vínculo verificado sin crear cuenta por cada fila.
3. Reemplazar FKs Auth por cuenta interna y policies `auth.uid` por resolución
   segura de JWT validado. Mantener infraestructura `auth.jwt`, roles y TPA;
   retirar providers/login/GoTrue como fuente de identidad por fases.
4. Checkout del servidor requiere Clerk validado, usa UUID como
   `external_customer_id`, persiste vínculo de checkout/env/cuenta antes de
   devolver URL. Webhook firmado contrasta ese vínculo, no email/metadata del
   cliente. Inbox/ledger/cuarentena y replay conservan la recuperación.
5. Grants son por fuente. Refund retira derecho afectado, disputa lo suspende,
   cancelación mantiene periodo pagado y trial Pro es siete días. Launch
   conserva credencial perpetua offline; revocaciones surten efecto al
   reconectar. Ningún cambio de proveedor de identidad modifica sujeto/clave de
   BIL-08.
6. Production de Clerk antes de ventas; no mover Development preservando `sub`
   por suposición. Enlace de cuentas valiosas con prueba fuerte y auditoría.
   Webhooks de usuario firmados/idempotentes y tombstone protegen borrado,
   reordenamiento y reprovisión tardía; no sincronizan permisos monetarios.
7. Primer corte comercial puede limitarse a Launch desde app con OAuth Clerk y
   pipeline billing existente. Es provisional y requiere gate end-to-end y
   aceptación de Isaac; TPA/web/Pro y cierre global legacy siguen después. No
   ampliar el bridge HS256 de datos como mecanismo de compra. Retirarlo después
   de verificar todos sus consumidores, sin un conversor JWT nuevo.

## Alternativas descartadas

| Alternativa                                          | Motivo                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Supabase Auth sigue identificando, Clerk solo UX     | Contradice decisión del 08-oct; mantiene desacople de compra nativa                     |
| Clerk `sub` como PK text de todas las tablas         | Cambia grants/FKs/contratos offline innecesariamente y ata derechos a instancia externa |
| Email como vínculo de pago/cuenta                    | No demuestra propiedad, colisiones/cambios y toma de cuentas; no permitido              |
| JWT template Supabase con secreto compartido         | Obsoleto oficialmente desde 01-abr-2025; distribución de secreto y rotación frágil      |
| Convertir OAuth nativo decodificado en session JWT   | OAuth no es sesión web; claims sin verificar no conceden autoridad                      |
| Mantener creación de usuarios sombra en `auth.users` | Duplica autoridad y perpetúa FKs/login que se deben retirar                             |
| Nuevo billing paralelo o Clerk Billing               | Polar ya es MoR y el ledger existe; duplica fuentes/proyección                          |
| Borrar schema Auth/migraciones antes del cutover     | Rompe TPA/helpers, consumidores, auditoría y recuperación; pérdida de datos             |
| Venta con enlace directo + licencia manual después   | Puede dejar pago sin identidad/licencia; cuarentena no es entrega                       |

## Consecuencias y rollback

Se reduce migración de tipos y se conserva UUID/offline; aumenta la necesidad de
mapping único, lifecycle de identidad y RLS consistente. Deben comprobarse
superficies legacy restantes, cuentas productivas, límites del bridge y Store.
No se promete atomicidad pago/DB. Rollback cierra nuevas compras y preserva
inbox/grants/mapping, usando binario compatible; no recrear FK Auth cuando
existen cuentas Clerk-only ni restaurar snapshot sobre pagos nuevos.

## Gate de aceptación

Plan aprobado por Isaac; inventario remoto agregado; tests auth/issuer/claim,
concurrencia/upgrade/restore, segregación cuentas, borrado y rollback; matriz
real nuevo checkout→pago→grant→credencial nativa y retirada/offline/reconexión.
El 12-oct 09:00 decide Go/No-Go para 10:00; 19-oct es alternativa. Store
requiere clasificación/certificación independientes. Código y despliegue son
fases posteriores, no alcanzadas por este ADR.

Detalle: [plan BIL-13](../billing/bil-13-clerk-identidad-plan.md),
[inventario](../billing/bil-13-supabase-auth-inventario.md). Referencias
oficiales:
[Supabase TPA Clerk](https://supabase.com/docs/guides/auth/third-party/clerk),
[Clerk Supabase](https://clerk.com/docs/guides/development/integrations/databases/supabase),
[instancias Clerk](https://clerk.com/docs/guides/development/managing-environments).
