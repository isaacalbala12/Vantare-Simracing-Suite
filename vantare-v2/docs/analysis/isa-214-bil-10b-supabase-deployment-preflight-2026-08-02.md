# ISA-214 / BIL-10B — preflight remoto de Supabase

Fecha: 2026-08-02

Estado: staging y producción desplegados y validados; tarea diaria instalada;
copias anterior y posterior al despliegue restauradas correctamente.

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
  secrets, link temporal y dry-run.
- El proyecto Free recién creado no ofrece inventario de backups. La excepción
  de apply exige target `staging`, cero backups y la confirmación exacta
  `FRESH-STAGING-VERIFIED-<ref>`. La misma confirmación está probada como
  inválida para producción.

### Resultado del apply y smoke de staging

- El primer apply aplicó ocho migraciones y se detuvo antes de Functions porque
  `pgcrypto.digest` no era visible sin su esquema en el proyecto limpio.
- Las cuatro llamadas SQL se corrigieron a `extensions.digest`. Un test focal
  inspecciona todas las migraciones `20260802*` e impide nuevas llamadas sin
  calificar.
- La reanudación forward-only dejó 12/12 migraciones remotas y desplegó
  `billing-checkout`, `billing-portal`, `billing-webhook` y
  `license-credential`, todas `ACTIVE`.
- El smoke no monetario creó una cuenta `example.invalid`, inició sesión y
  comprobó: checkout 503 fail-closed por mapping deliberadamente inválido;
  portal 404 sin customer; credencial Ed25519 200 sin grants; webhook 400 sin
  headers y 403 con firma inválida; snapshot agregado 200. La cuenta sintética
  se eliminó con HTTP 200.
- El procedimiento quedó automatizado en
  `supabase/functions/scripts/smoke-billing-nonmonetary.ps1`. Su modo
  `production` nunca autentica checkout y, por tanto, no puede crear una sesión
  real en Polar.
- No se llamó a Polar, no se creó checkout, pago, refund, grant comercial,
  replay ni reconciliación apply.
- La reconciliación manual en modo dry-run terminó con `processed=0`,
  `applied=0` y `quarantined=0` sobre staging vacío; utilizó un mapping sintético
  válido solo en memoria y no hizo escrituras ni llamadas a Polar.

### Preflight posterior de producción

- Superficie, once nombres de secrets, enlace temporal y dry-run: PASS.
- El dry-run enumera las ocho migraciones `20260802*` y aplica cero.
- El inventario oficial devuelve `backups=[]`, `pitr_enabled=false` y
  `walg_enabled=false`. El wrapper bloquea el apply; la afirmación previa de un
  backup productivo era incorrecta.
- Producción no se modificó durante este intento.

### Decisión de backup en Supabase Free

Isaac decidió no contratar Supabase Pro por ahora y aprobó una tarea diaria de
backup. La alternativa se implementó sin reducir el gate:

- `install-supabase-backup-task.ps1` crea una tarea diaria a las 03:00,
  ejecutable después si el equipo estaba apagado;
- el access token y la contraseña PostgreSQL se convierten a DPAPI y no quedan
  en los argumentos de la tarea;
- scripts, secretos y backups viven fuera del repositorio, bajo
  `%LOCALAPPDATA%\Vantare`, con ACL privada y EFS;
- cada ejecución obtiene roles, esquema, datos e historial de migraciones con
  el CLI oficial;
- un manifiesto registra únicamente versión, alcance, tamaños y SHA-256;
- el ZIP se abre, valida y restaura en un contenedor Supabase Postgres
  desechable antes de marcar PASS;
- se conservan 30 días y se eliminan solo archivos que estén dentro de la raíz
  aprobada;
- el wrapper de producción exige `LOCAL-BACKUP-VERIFIED-<project-ref>`, ruta
  explícita, ref exacta, EFS, integridad, edad máxima de 26 horas y un nuevo
  restore satisfactorio antes de aplicar.

El mecanismo no se describe como equivalente a PITR. No incluye objetos
binarios de Storage, depende del perfil/certificado EFS del equipo y todavía
necesita una segunda copia cifrada fuera del PC antes del lanzamiento público.
Su objetivo inmediato es aportar un rollback verificable antes del deploy de
ISA-214.

Isaac proporcionó localmente `SUPABASE_DB_PASSWORD`. El instalador leyó ambas
credenciales sin imprimirlas, generó los ficheros DPAPI y registró la tarea
`Vantare Supabase Production Backup` a las 03:00. La primera ejecución válida:

- obtuvo roles, esquema, datos completos, datos `public` e historial;
- creó un ZIP EFS de 56.525 bytes con manifiesto v2 y SHA-256;
- restauró esquema y datos `public` en Supabase Postgres `17.6.1.155`;
- terminó con `LastTaskResult=0` y dejó la siguiente ejecución programada;
- eliminó los archivos de intentos fallidos y conservó únicamente la copia
  marcada PASS.

El primer diseño intentó restaurar todo `data.sql` en PostgreSQL aislado y
detectó una diferencia de esquema administrado en Auth. Se corrigió sin omitir
el backup completo: `data.sql` conserva Auth/Storage para el procedimiento
oficial, mientras `public-data.sql` permite verificar automáticamente la
superficie exacta que Billing modifica. Un drill completo de Auth/Storage exige
un proyecto Supabase desechable con GoTrue y Storage activos.

### Resultado del apply y smoke de producción

- El 2026-08-03 el wrapper repitió superficie, nombres de secrets, enlace,
  dry-run y restore del backup cifrado antes de mutar producción.
- Las ocho migraciones pendientes se aplicaron sin error. Producción quedó con
  las 12 migraciones locales y remotas alineadas.
- `billing-checkout`, `billing-portal`, `billing-webhook` y
  `license-credential` se desplegaron y quedaron `ACTIVE`.
- El smoke no monetario creó una cuenta sintética, comprobó autenticación,
  checkout 401 sin sesión válida, portal 404 sin customer, credencial Ed25519
  sin grants, guards 400/403 del webhook y snapshot de observabilidad 200. La
  cuenta se eliminó con HTTP 200.
- No se autenticó un checkout productivo, no se llamó a Polar y no hubo pago,
  refund, grant comercial, replay, reconciliación apply o cambio de catálogo.
- Tras el despliegue se ejecutó de nuevo la tarea diaria. Terminó con resultado
  0 y dejó un segundo ZIP EFS de 88.137 bytes, cuyo restore automático pasó.

El guard de superficie falló inicialmente antes de cualquier mutación porque
PowerShell estricto trataba una colección vacía como `$null`. Se normalizó a
array y el test completo del wrapper se ejecuta ahora bajo `StrictMode` para
evitar la regresión.

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
5. El guard de superficie no normalizaba la colección vacía y fallaba bajo
   PowerShell estricto antes de iniciar el preflight.

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

- Inventario Supabase realizado mediante Management API/CLI sanitizado.
- Suite Supabase activa: 184 tests pasados, 0 fallidos.
- `deno check` y `deno fmt --check` focales: PASS.
- Test de comportamiento PowerShell del wrapper: PASS en Windows PowerShell;
  cubre enlace al project ref exacto, preflight no mutante, confirmaciones,
  backup remoto, staging vacío y backup lógico local verificado antes del orden
  migraciones -> cuatro Functions.
- Tests de backup: DPAPI roundtrip, límites de rutas, manifiesto válido,
  detección de manipulación y ausencia de secretos en argumentos: PASS. Los
  scripts PowerShell parsean sin errores.
- Integración local: el instalador creó una tarea sintética válida y se eliminó
  al terminar; una copia EFS con datos sintéticos se restauró realmente en
  Supabase Postgres 17 desechable. No se utilizó información de producción.
- Integración real: tarea diaria instalada, backup productivo cifrado e
  integridad/restore de `public` PASS. No se inspeccionaron filas ni contenido.
- Guard de superficie, formato del workflow y `git diff --check`: PASS.
- El token de `.env.local` solo se cargó temporalmente en memoria; nunca se
  imprimió, copió a Git ni expuso junto a hashes de secrets o PII.
- Hubo creación del staging gratuito y configuración de secrets por API.
  Staging y producción tienen 12/12 migraciones, cuatro Functions `ACTIVE` y
  smoke no monetario PASS.
- La copia posterior al despliegue terminó con resultado 0, cifrado EFS y
  restore automático PASS. No se inspeccionó su contenido.
- No hubo reactivación del staging histórico, pago, refund, replay,
  reconciliación apply ni cambio de catálogo.
- ISA-214 completa el gate técnico de despliegue. BIL-11 permanece bloqueada
  por su autorización monetaria independiente y Billing sigue NO-GO.
