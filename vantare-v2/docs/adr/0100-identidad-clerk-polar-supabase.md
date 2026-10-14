# ADR 0100 · Identidad: Clerk + Polar + Supabase

Fecha: 2026-10-09. Decisión de producto: #1514; documentación del contrato: #1530.
Estado: decisión aceptada; migración y prueba comercial real pendientes de #1514.

## Contexto y decisión

Clerk es la fuente de identidad; Polar gestiona cobros, suscripciones y refunds;
Supabase conserva datos, backend, RLS, Storage y operaciones del servidor.
Supabase Auth deja de ser la fuente de identidad. Esto no autoriza borrar sus
usuarios, tablas ni enlaces históricos en esta entrega.

La identidad de dominio es el UUID interno, vinculado al issuer/sub verificado
mediante `account_identities`/resolución del servidor; no es el email, metadata
editable ni el sub de Clerk aislado. Polar usa ese UUID como
`external_customer_id`. Eventos sin vínculo verificable quedan en cuarentena.
La integración objetivo usa Supabase third-party auth con Clerk y RLS que
resuelve la identidad interna. Su configuración live y su corte requieren #1514.

## Qué conserva Supabase

| Módulo/función | Decisión y evidencia en esta base |
| --- | --- |
| `native-license` | Conservar emisión de credencial y derechos firmados; `native/services/src/license_remote.rs` llama este endpoint. |
| `native-account-authorize` | Conservar mientras exista el puente de datos; `services/src/bridge.rs` exige esa ruta exacta. Sustitución final pendiente de #1514. |
| `native-billing-checkout`, `native-billing-portal` | Conservar endpoints nativos; verifican Clerk y resuelven UUID mediante `_shared/native-billing-auth.ts`. |
| `billing-webhook` | Conservar reconciliación Polar, idempotencia y revocación; no convertir eventos en identidad por email. |
| `native-admin` | Conservar backend privado del owner, con sus controles. |
| `testing-center-*` | Fuera de la retirada de identidad; conservar hasta inventario específico del proyecto. Los nombres Linear históricos no autorizan borrar consumidores. |
| `_shared`, migraciones, RPC, tablas, RLS y Storage | Conservar negocio/datos compartidos, mapeo UUID y trazabilidad; migrar dependencias Auth por fases. |

## Qué se retira o sustituye

- Login, refresh y clientes de **Supabase Auth** como identidad: sustituir por
  Clerk; retirar su uso después de migrar enlaces, sesiones y RLS.
- Rutas legacy `billing-checkout`, `billing-portal`, `license-credential`:
  retirar exposición legacy al completar el corte y demostrar cero consumidores.
  **No borrar sus handlers todavía**: `native-billing-checkout/index.ts` y
  `native-billing-portal/index.ts` importan los handlers de las dos primeras;
  `native-license` usa `_shared/license-credential.ts`, no el endpoint legacy.
- `_shared/auth.ts` (`supabase.auth.getUser`) y dependencias `auth.users`/
  `auth.uid()`: retirar o sustituir solamente tras inventario y migración #1514.
  No se elimina el UUID interno ni el acceso a datos al cambiar de proveedor.

## Migración, rollback y pendientes de confirmar con #1514

Confirmar inventario completo de FK, triggers, RLS, funciones y consumidores
web/Wails; destino exacto de `license-credential` y del puente de datos; JWT/session
token, dominios y webhooks Clerk; lifecycle de borrado/revocación; scheduler y
reconciliación; orden del corte, backups y rollback. Esta base no demuestra que
esas piezas estén desplegadas ni que haya cero consumidores legacy.

Preservar usuarios/datos y vínculos históricos, migrar con validación de UUID,
quarantinar atribuciones dudosas y conservar rollback por fase. Login, compra,
refund, disputa, offline y recovery reales siguen siendo gates comerciales:
los tests locales no levantan el no-go de #1514/#1506.

## Consecuencias y límites

Un adapter de identidad no convierte OAuth Clerk en JWT Supabase por sí solo.
La interfaz nativa continúa detrás de `services::Command`, sin auth/red en UI.
Este ADR documenta destinos; no borra funciones ni datos, no cambia auth/billing,
no configura servicios live y no despliega. La retirada física corresponde a
#1514 y al corte autorizado, preservando handlers compartidos y oráculos.
