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
- Los dos Environments recibieron después el access token y su project ref
  exacto. Los valores no aparecen en logs ni documentación.
- El workflow anterior solo desplegaba Functions. No aplicaba migraciones.

Durante el inventario inicial no se creó o modificó ningún secret remoto ni se
leyó ninguno de sus valores.

### Acceso oficial confirmado tras el gate humano

- Isaac autorizó el proyecto productivo `ombjshwzqgeisazijduq` y creó un token
  personal nuevo, conservado únicamente en `frontend/.env.local`.
- El Management API identifica la organización `Vantare` y producción como
  `ACTIVE_HEALTHY` en `eu-west-2`.
- Producción tiene un backup remoto inventariado. No se leyó su contenido.
- El inventario inicial confirmó los secrets históricos de Polar, checkout y
  portal. Después se añadieron por nombre los cuatro contratos nuevos de firma
  offline, anti-abuso de trial y allowlist del portal.
- Supavisor está activo en modo transacción. No se necesita cambiarlo ni
  conservar una contraseña de Postgres: el CLI enlazó el project ref exacto
  mediante su rol temporal oficial.
- `supabase db push --linked --include-all --dry-run` terminó correctamente y
  enumeró ocho migraciones `20260802*`. No aplicó ninguna.

El workflow se endureció de nuevo para usar ese acceso enlazado temporal. Ya no
acepta ni exige `SUPABASE_DB_URL`; así se elimina un secreto permanente y el
project ref aprobado sigue siendo la única diana posible.

### Staging limpio creado y preflight final

- La organización está en Free y solo tenía un proyecto activo. El segundo
  proyecto entra en el límite oficial de dos proyectos activos sin coste.
- Staging: `vantare-staging`, ref `rilwmlbnucbbayaulnxw`, región `eu-west-2`,
  estado `ACTIVE_HEALTHY`.
- GitHub contiene `SUPABASE_ACCESS_TOKEN` y el project ref exacto por
  Environment. El registro público Ed25519 de producción también está cargado
  como secret de build; los valores privados solo viven en Supabase.
- Key IDs: `vantare-prod-2026-08-02-v1` y
  `vantare-staging-2026-08-02-v1`. Prefijos de fingerprint público:
  `f6f73f9b2b5f` y `ba4f85cedcfe`.
- Producción y staging contienen los once nombres requeridos. Staging utiliza
  credenciales propias, URLs bajo el dominio reservado `.invalid` y mapping
  inválido deliberado para que cualquier intento comercial falle cerrado.
  Nunca reutiliza el token o catálogo de producción.
- El preflight completo de staging pasó: superficie allowlisted, nombres de
  secrets, link temporal y dry-run. Enumeró doce migraciones y aplicó cero.
- El proyecto Free recién creado no ofrece inventario de backups. La excepción
  de apply exige target `staging`, cero backups y la confirmación exacta
  `FRESH-STAGING-VERIFIED-<ref>`. La misma confirmación está probada como
  inválida para producción.

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

## Gate humano aprobado y límite vigente

Isaac aprobó en la conversación y quedó registrado en ISA-214:

1. producción: `ombjshwzqgeisazijduq`;
2. si se reactiva y conserva `olhwhfaczmrmooeaoqqf` como staging o se crea un
   staging limpio;
3. acceso del CLI/GitHub al proyecto oficial;
4. configuración de los secrets requeridos por nombre en los Environments;
5. ventana, observador, backup y rollback;
6. autorización exacta para aplicar migraciones y Functions.

La decisión aplicada es no reutilizar el staging histórico: se creó uno nuevo,
vacío y separado. La autorización cubre el despliegue y smoke no monetario de
ISA-214, primero en staging y después en producción si todo queda verde. No
cubre BIL-11, pagos, refunds, cambios de catálogo ni habilitar ventas.

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
  cubre enlace al project ref exacto, ausencia de contraseña persistente,
  preflight no mutante, confirmaciones, backup obligatorio y orden migraciones
  -> cuatro Functions.
- Guard de superficie, formato del workflow y `git diff --check`: PASS.
- El token de `.env.local` solo se cargó temporalmente en memoria; nunca se
  imprimió, copió a Git ni expuso junto a hashes de secrets o PII.
- Hubo creación del staging gratuito, configuración de secrets por API, enlace
  CLI local y dry-run remoto. No hubo deploy de código, migración aplicada,
  reactivación del staging histórico, pago, refund, replay, reconciliación
  apply o cambio de catálogo.
- BIL-11 permanece bloqueada por ISA-214 y por su gate monetario propio.
