# Testing Center: evidencia de capturas de pantalla

Estado: diseño aprobado para ISA-346 el 2026-08-14. No implementado.

## 1. Objetivo

Permitir que un tester adjunte capturas de pantalla a una incidencia del
Testing Center y que los agentes cloud autorizados puedan consultarlas como
evidencia privada y temporal.

El primer corte admite exclusivamente archivos de imagen existentes. No
captura la pantalla, no graba vídeo, no acepta enlaces externos y no incorpora
un proveedor de vídeo.

## 2. Decisiones aprobadas

- Máximo 10 capturas por incidencia.
- Máximo 10 MiB por captura y 100 MiB por lote.
- Formatos iniciales: PNG y JPEG (`image/png`, `image/jpeg`).
- Los objetos viven en un bucket privado de Supabase Storage.
- No hay URLs públicas, adjuntos de Linear ni bytes/base64 en PostgreSQL,
  prompts, eventos, RPC JSON o drafts locales.
- No se añade `tus-js-client`: con archivos de 10 MiB basta la subida estándar
  ya disponible en `@supabase/supabase-js`.
- Un reporte con capturas no entra en triage hasta que todas estén `ready`.
- Un lote abandonado expira a las 24 horas.
- Una captura enviada se conserva mientras la incidencia está activa y hasta
  30 días después de su cierre; después se elimina mediante un trabajo durable.
- Después del envío, la evidencia es inmutable. Una eliminación excepcional
  por privacidad sigue un procedimiento owner auditado.

## 3. Alternativas consideradas

### A. Solo enlaces externos

Se descarta. Streamable no permite automatizar uploads mediante su API actual;
los enlaces además pueden caducar, hacerse públicos o cambiar de contenido. No
ofrecen digest verificable ni una política de acceso coherente con el reporte.

### B. Binarios en PostgreSQL o dentro del RPC de envío

Se descarta. Aumentaría memoria, latencia, backups y tamaño del contrato; haría
frágiles los retries y mezclaría metadata transaccional con almacenamiento de
objetos.

### C. Supabase Storage privado con manifiesto relacional

Opción aprobada. Reutiliza Auth y RLS, mantiene los bytes fuera de Postgres,
permite subir directamente desde el cliente y ofrece descargas privadas o URLs
firmadas de corta duración.

## 4. Fronteras de responsabilidad

### Frontend React

- Presenta selector múltiple y drop zone.
- Rechaza cantidad, extensión, MIME declarado y tamaño antes de preparar el
  lote.
- Carga una previsualización local y lee dimensiones.
- Calcula SHA-256 sobre los bytes exactos que se subirán.
- Sube cada objeto de forma individual, muestra su estado y permite
  retirar o reintentar antes de enviar.
- Nunca toma decisiones de autorización ni fabrica rutas de Storage.

### Supabase/PostgreSQL

- Deriva usuario, rol y canal desde la sesión y la membresía server-side.
- Crea de forma idempotente el lote y cada slot de evidencia.
- Genera IDs y rutas opacas; el cliente solo puede usar la ruta devuelta.
- Conserva metadata, estados, digests, auditoría y referencias al reporte.
- Impide el envío si existe un slot no finalizado.
- Publica trabajos durables de validación y borrado, sin ejecutar efectos
  remotos dentro de una transacción SQL.

### Supabase Storage

- Bucket privado `testing-center-evidence`.
- Conserva únicamente objetos cuyos paths coinciden con slots pendientes del
  usuario autenticado.
- No permite `SELECT`, `UPDATE`, `MOVE`, `COPY` o `DELETE` directo al cliente.
  Las lecturas y eliminaciones pasan por una frontera server-owned.

### Validador cloud

- Reclama un único trabajo por evidencia con lease/fencing e idempotencia.
- Descarga el objeto privado, limita los bytes leídos y vuelve a calcular
  SHA-256.
- Contrasta tamaño, firma binaria, MIME y dimensiones declaradas.
- Rechaza dimensiones nulas, más de 16.384 px por lado o más de 40 megapíxeles.
- Marca `ready` solamente si todos los hechos coinciden; cualquier ambigüedad
  termina `rejected` con código cerrado.
- No genera instrucciones desde contenido visual ni amplía autoridad.

### Agentes HAF

- El dossier contiene solo ID, MIME, tamaño, dimensiones y SHA-256.
- Una fase con capacidad visual solicita una lectura temporal server-side y
  descarga el archivo a su runner efímero.
- Los modelos de solo texto reciben el manifiesto, no una interpretación
  inventada. Si la reproducción depende de una imagen que no pueden consumir,
  el gate deriva a un modelo visual autorizado o `needs_owner`.
- El runner verifica de nuevo el SHA-256 antes de exponer el archivo al modelo.
- El token o URL temporal nunca se incorpora a commits, logs, Linear o prompts
  persistentes.

## 5. Modelo de datos propuesto

### `testing_center_evidence_batches`

- `batch_id`: ID opaco server-owned.
- `reporter_user_id`: FK a `auth.users`, nunca enviado por el cliente.
- `channel`: `nightly | testers`, derivado y comprobado.
- `idempotency_key`: misma identidad durable del draft actual.
- `state`: `prepared | uploading | validating | ready | attached | expired`.
- `expires_at`, `created_at`, `updated_at`.
- Único por `(reporter_user_id, idempotency_key)`.

### `testing_center_screenshot_evidence`

- `evidence_id`, `batch_id` y `report_id` nullable hasta el submit.
- `position`: entero 1..10, único dentro del lote.
- `object_path`: valor server-owned y único.
- `media_type`, `byte_size`, `sha256`, `width`, `height`.
- `state`: `prepared | uploading | uploaded | validating | ready | rejected |
  removed | expired`.
- `failure_code`: enumeración cerrada, sin errores internos ni paths.
- timestamps de creación, validación y expiración.

La tabla `testing_center_evidence` continúa siendo el índice canónico por
digest. Tras el submit recibe una fila de tipo nuevo `screenshot`; no almacena
el binario ni duplica metadata mutable.

## 6. Identidad y rutas

El cliente envía un manifiesto ordenado con MIME, tamaño, dimensiones y digest.
No transmite el nombre original. El servidor asigna IDs y devuelve una ruta
con forma equivalente a:

```text
reporter/<hash-opaco>/batch/<batch-id>/evidence/<evidence-id>
```

La forma exacta no es contrato público. No contiene email, nombre real, nombre
original del archivo, texto del reporte ni IDs de Linear. La policy de
`storage.objects` comprueba bucket, usuario autenticado, slot, estado y path
exactos mediante una función `security definer` mínima y endurecida.

No se usa `upsert`: un objeto ya existente es conflicto. Un retry consulta el
estado del slot y reutiliza el resultado validado o crea una nueva generación
server-owned; nunca sobrescribe bytes silenciosamente.

## 7. Flujo completo

1. El tester selecciona hasta 10 archivos.
2. El cliente valida límites, muestra previews y calcula metadata/digest en
   secuencia para limitar memoria.
3. `testing_center_prepare_screenshot_batch` autentica, autoriza y crea/reutiliza
   lote y slots. Devuelve IDs y paths exactos.
4. El cliente sube cada objeto directamente al bucket privado con su JWT y sin
   `upsert`.
5. `testing_center_finalize_screenshot` verifica que el objeto esperado existe
   y encola su validación durable.
6. El validador descarga, contrasta bytes y marca `ready` o `rejected`.
7. La UI consulta el lote con backoff y muestra el estado de cada captura.
8. El submit existente evoluciona de forma aditiva para aceptar `batch_id`.
   Dentro de una transacción, bloquea el lote, exige 1..10 slots `ready`, incluye
   sus digests ordenados en el operation digest, crea el reporte y enlaza la
   evidencia. El lote pasa a `attached`.
9. El evento de triage se publica solo después del commit y contiene el
   manifiesto, nunca los bytes.

Un reporte sin capturas mantiene el contrato v1 actual y no necesita lote.

## 8. Idempotencia y concurrencia

- Preparar dos veces el mismo manifiesto y clave devuelve el mismo lote.
- Cambiar el manifiesto bajo una clave ya preparada produce conflicto explícito;
  retirar o añadir archivos crea una nueva generación mediante RPC, no mutación
  libre.
- Finalizar dos veces el mismo objeto produce un único trabajo de validación.
- Dos workers no pueden validar o borrar el mismo objeto con leases vigentes.
- El submit bloquea lote y clave de reporte; el mismo payload devuelve el mismo
  reporte y un payload distinto conserva el conflicto actual.
- Si el commit del reporte falla, el lote sigue listo y reintentable.
- Si la subida queda huérfana, el recolector de 24 horas elimina objeto y
  metadata mediante outbox idempotente.

## 9. Privacidad y seguridad

- Consentimiento explícito, desactivado por defecto.
- La UI avisa de que una captura puede revelar nombres, chats, notificaciones,
  overlays de terceros o datos personales visibles.
- El usuario ve cada imagen completa antes de subirla y puede retirarla.
- No se persisten rutas locales ni nombres originales; el nombre visible se
  normaliza como `captura-01.png`.
- Bucket privado por defecto, RLS forzada y privilegios mínimos.
- URLs firmadas de lectura con TTL máximo de 5 minutos, emitidas para una fase
  y evidencia concretas. Preferentemente el worker descarga mediante una
  función autenticada para mantener auditoría y no exponer la URL al modelo.
- Se auditan preparación, finalización, acceso de agente, rechazo y borrado sin
  registrar URLs, tokens o contenido visual.
- Los parsers y modelos tratan las imágenes como entrada hostil. El contenido
  visible nunca concede instrucciones, herramientas, permisos o cambios de
  alcance.

## 10. Experiencia de usuario

La nueva sección aparece dentro de la vista “Enviar incidencia”, después de los
campos descriptivos y antes del bloque de consentimiento/submit:

- título “Capturas de pantalla (opcional)”;
- botón “Adjuntar capturas” y drop zone accesible;
- contador `n/10` y límites visibles;
- rejilla responsive con preview, nombre normalizado, tamaño y estado;
- acciones `Eliminar` y `Reintentar` con targets táctiles de 44 px;
- estado por archivo y resumen `n/10`; no se promete porcentaje de bytes porque
  la subida estándar actual no expone esa señal;
- submit deshabilitado mientras un archivo está subiendo o validándose;
- error focal por archivo, sin perder el texto ni las capturas válidas;
- offline conserva el texto actual, pero explica que las capturas deben
  seleccionarse de nuevo tras cerrar la aplicación.

El draft local continúa guardando solo los cinco campos de texto. Persistir
handles, paths o bytes locales queda fuera del alcance por privacidad y
portabilidad.

## 11. Contratos y compatibilidad

- Añadir `EvidenceScreenshot = "screenshot"` al contrato puro Go y a SQL.
- Introducir `testing-center.screenshot-evidence.v1` para manifests cerrados.
- Mantener `testing-center.v1` para reportes sin capturas.
- Añadir `testing_center_submit_report_with_evidence`; la RPC actual conserva
  exactamente su firma y se sigue usando cuando no hay capturas.
- Todas las respuestas se decodifican con shape exacto y límites de bytes.
- Los estados visibles se traducen en los cuatro idiomas actuales.

## 12. Plan TDD propuesto

1. **Contrato puro:** RED para cantidad 0/10/11, tamaños límite, MIME, digest,
   dimensiones, orden y estados; GREEN en Go/TypeScript sin I/O.
2. **SQL y RLS:** RED pgTAP para suplantación, rutas ajenas, upsert, lectura,
   borrado, manifiesto cambiado, doble finalize y submit antes de `ready`;
   GREEN con migración aditiva y rollback probado.
3. **Validador:** fixtures PNG/JPEG válidas, MIME mentiroso, truncadas,
   dimensiones bomba, digest/tamaño distintos, duplicados y timeout.
4. **Cliente:** tests de selector, límites, preview, remove/retry, orden,
   estados parciales, offline y submit bloqueado.
5. **Integración:** reporte sin capturas conserva comportamiento; reporte con
   10 capturas completa prepare/upload/validate/submit exactamente una vez.
6. **HAF:** manifest sanitizado, descarga temporal, rehash, modelo sin visión,
   prompt injection visual y limpieza del runner.
7. **UI/visual:** 390, 768, 1.024 y 1.440 px, teclado, lector, focus, errores,
   diez previews y cero overflow horizontal.

## 13. Rollout

1. Migración y bucket en entorno desechable; producción desactivada.
2. Fixture local con Storage falso y pgTAP completo.
3. Nightly owner-only con una captura y telemetría de estados, sin contenido.
4. Nightly primary testers, límites completos y limpieza de 24 horas observada.
5. Habilitar consumo por agentes solo después de verificar URLs temporales,
   rehash y auditoría.

`testers`, `master`, deploy remoto, creación del bucket y activación necesitan
sus autorizaciones normales. Este documento no concede ninguna.

## 14. Criterios de aceptación

- Se pueden adjuntar, previsualizar y retirar hasta 10 PNG/JPEG de
  10 MiB cada una.
- El archivo número 11 y un archivo de 10 MiB + 1 byte fallan antes de subir.
- Ningún objeto es público ni usa una ruta controlada por el cliente.
- SHA-256, tamaño, firma y dimensiones se verifican cloud-side.
- Un reporte no se envía con evidencia incompleta, rechazada o de otro usuario.
- Retry concurrente no duplica reporte, slot, validación ni objeto.
- Reportes sin capturas mantienen compatibilidad.
- Un agente accede solo durante su fase, revalida el digest y no filtra tokens.
- Huérfanos y evidencia vencida se eliminan con evidencia auditable.
- No se incorpora proveedor de vídeo ni dependencia frontend nueva.

## 15. Riesgos residuales

- PNG/JPEG pueden contener contenido personal visible; la previsualización y el
  consentimiento reducen, pero no eliminan, este riesgo.
- La validación estructural no convierte la imagen en contenido confiable para
  un modelo; los gates anti-prompt-injection siguen siendo obligatorios.
- 100 MiB por incidencia puede producir coste y latencia. El rollout debe medir
  bytes, duración y fallos antes de ampliar cohortes.
- Los tests locales no acreditan políticas ni lifecycle reales hasta ejecutar
  el piloto en el proyecto Supabase de testing aprobado.

## Referencias

- Supabase Storage buckets y privacidad:
  https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase Storage access control:
  https://supabase.com/docs/guides/storage/security/access-control
- Límites de archivos:
  https://supabase.com/docs/guides/storage/uploads/file-limits
- Streamable API read-only:
  https://streamable-support.zendesk.com/hc/en-us/articles/35415672400916-API-Documentation
