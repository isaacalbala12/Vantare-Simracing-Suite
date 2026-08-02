# ISA-214 / BIL-10B — preflight remoto de Supabase

Fecha: 2026-08-02

Estado: fase read-only completada; despliegue bloqueado por gate humano y acceso
al proyecto oficial.

## Objetivo

Comprobar qué existe realmente fuera del repositorio y preparar un camino de
despliegue que aplique primero las migraciones y después las Edge Functions.
Este corte no habilita ventas ni autoriza pagos.

## Inventario sanitizado

### Proyecto oficial

- Ref: `ombjshwzqgeisazijduq`.
- Los documentos vigentes lo identifican como producción y como backend de la
  app.
- DNS y endpoint Edge responden.
- Pruebas HTTP sin credenciales:
  - `billing-checkout`: 401; la Function existe y exige autenticación;
  - `billing-portal`: 401; la Function existe y exige autenticación;
  - `billing-webhook`: 405 ante GET; la Function existe y no acepta ese método;
  - `license-credential`: 404; no se ha demostrado desplegada;
  - `validate-license`: 404.
- El perfil local actual de Supabase no tiene acceso a este proyecto. No se
  pudieron listar versiones, migraciones, secrets ni estado de base de datos.

La respuesta HTTP solo demuestra presencia de las tres Functions antiguas. No
demuestra que su versión coincida con `nightly`, que las migraciones BIL-02…10
estén aplicadas ni que sus secrets sean correctos.

### Proyecto de pruebas histórico

- Ref: `olhwhfaczmrmooeaoqqf`.
- La documentación previa confirma que recibió migraciones por error y que no
  debe usarse como backend de la app o CI de producción.
- Es el único proyecto visible para el perfil local actual.
- Estado del Management API: `INACTIVE`.
- Function enumerada: únicamente `validate-license`, versión 1.
- Secrets visibles por nombre: solo los valores administrados por Supabase;
  faltan todos los nombres de configuración Polar, checkout, portal y firma
  offline.
- El inventario de backups no contiene copias físicas y PITR está deshabilitado.
- El hostname público no resuelve mientras el proyecto está inactivo.

No se reactivó, vinculó, modificó ni eliminó el proyecto.

### GitHub

- Se crearon los Environments `supabase-staging` y `supabase-production` tras
  la aprobación explícita de Isaac.
- Ambos exigen un reviewer. Staging permite `nightly` y la rama ISA-214;
  producción solo permite `nightly`.
- Los dos Environments permanecen sin secrets, por lo que todavía no pueden
  ejecutar ningún preflight o despliegue.
- Los secrets generales de Actions no incluyen las credenciales privadas de
  despliegue de Supabase.
- El workflow anterior solo desplegaba Functions. No aplicaba migraciones.

No se creó, modificó o leyó ningún secret.

### Polar

La última auditoría GET vigente sigue siendo ISA-166:

- Pro y Launch existen;
- Pro Plus y trial no están demostrados;
- checkout, renovaciones, refunds y payouts estaban deshabilitados;
- el webhook no cubría todo el lifecycle objetivo.

Antes de BIL-11 se necesita una nueva comprobación GET y, si siguen faltando
elementos, una autorización específica para corregir el catálogo. Este corte
no consulta customers, orders, subscriptions ni PII.

## Fallos locales encontrados y corregidos

1. El wrapper pretendía desplegar `license-credential`, pero el guard
   PowerShell la clasificaba como Function inesperada y detenía siempre el
   proceso.
2. El workflow no aplicaba migraciones, contradiciendo el orden obligatorio de
   BIL-10.
3. No existían modos separados de preflight y apply ni una confirmación exacta
   ligada al project ref.
4. Las herramientas de smoke conservaban IDs fijos, una URL de proyecto
   hardcodeada y podían imprimir eventos o entitlements completos.

La solución mantiene un único wrapper pequeño:

- verifica la superficie allowlisted;
- comprueba únicamente nombres de secrets;
- ejecuta siempre `db push --dry-run`;
- en modo `apply` exige `DEPLOY-BILLING-<project-ref>`;
- aplica migraciones antes que Functions;
- comprueba que las cuatro Functions aprobadas existan al terminar;
- no imprime valores de secrets.

El workflow selecciona `supabase-staging` o `supabase-production` y utiliza el
Environment protegido correspondiente. Preflight y apply son manuales; ningún
push o merge los ejecuta automáticamente.

## Gate humano pendiente

Antes de cualquier mutación remota, Isaac debe aprobar en ISA-214:

1. producción: `ombjshwzqgeisazijduq`;
2. si se reactiva y conserva `olhwhfaczmrmooeaoqqf` como staging o se crea un
   staging limpio;
3. acceso del CLI/GitHub al proyecto oficial;
4. configuración de los secrets requeridos por nombre en los Environments;
5. ventana, observador, backup y rollback;
6. autorización exacta para aplicar migraciones y Functions.

La recomendación es no reutilizar automáticamente el staging histórico:
primero debe demostrarse su historial remoto. Si no puede recuperarse con
claridad, un staging nuevo y vacío es más seguro que reparar a ciegas el que
recibió migraciones erróneas.

## Rollback

- Antes de apply: no existe estado remoto que revertir.
- Durante apply: detener ante la primera diferencia; no continuar a Functions
  si falla una migración.
- Después de migraciones: rollback forward-only mediante migración correctiva;
  no borrar tablas o historial.
- Después de Functions: volver a desplegar la versión anterior allowlisted.
- Mantener checkout deshabilitado y Billing NO-GO durante todo el proceso.

## Evidencia y límites

- Inventario Supabase realizado mediante Management API/HTTP read-only.
- Suite Supabase activa: 182 tests pasados, 0 fallidos.
- `deno check` y `deno fmt --check` focales: PASS.
- Test de comportamiento PowerShell del wrapper: PASS en Windows PowerShell;
  cubre mismatch proyecto/DB, pooler, preflight no mutante, confirmaciones,
  backup obligatorio y orden migraciones -> cuatro Functions.
- Guard de superficie, formato del workflow y `git diff --check`: PASS.
- No se abrió `.env.local` ni se imprimieron tokens, hashes de secrets o PII.
- No hubo link, deploy, migración remota, reactivación, creación de proyecto,
  pago, refund, replay, reconciliación apply o cambio de catálogo.
- BIL-11 permanece bloqueada por ISA-214 y por su gate monetario propio.
