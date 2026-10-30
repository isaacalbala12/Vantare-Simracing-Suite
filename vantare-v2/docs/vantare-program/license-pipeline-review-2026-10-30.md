# Revisión del pipeline de licencias · 30-oct-2026

Refs #1805 · Plane VANTA-105 · relacionada con #1782 · Project Vantare / area:licencias.

## Alcance y evidencia

Revisión estática de `origin/nightly` fijado en
`9fa66225adde60ad6e3aa55f7b4fe87930410ed4`. Las referencias de línea pertenecen
a ese SHA; las rutas `native/` son relativas a `vantare-v2/` y `supabase/` a
la raíz Git. No se han abierto, descifrado ni modificado credenciales reales,
ni cambiado producto, instalación, reloj del equipo, backend o configuración.
Este informe no certifica el estado desplegado de Supabase ni una release.

Isaac autorizó tres revisores DeepSeek V4.1 Flash de solo lectura en paralelo,
mediante T3 `delegate_task`, proveedor `opencode`, modelo
`opencode-go/deepseek-v4.1-flash`, opción `variant=max`. Cada uno tiene worktree
detached propio en el mismo SHA. El integrador contrasta cada hallazgo contra
el código y sus tests; un resultado del revisor no cuenta por sí solo como prueba.
El primer arranque del revisor de servidor falló en el proveedor y se reintentó
con el mismo modelo, sin sustituirlo.

Las prioridades expresan impacto de producto: P0, concesión crítica indebida o
fallo general; P1, bloqueo grave o pérdida de acceso sin recuperación normal;
P2, fallo recuperable, incoherencia o riesgo acotado; P3, precisión documental
o cobertura adicional. «Confirmado» significa cadena estática demostrada, no
incidente reproducido con un usuario real.

## Resultado integrado provisional

Tres P1 nuevos confirmados: autoridad DPAPI irrecuperable, sesión/metadata DPAPI
irrecuperables y reloj adelantado que sigue bloqueando después de corregirlo.
Se han abierto #1806, #1807 y #1808, todos con `area:licencias` y Project Vantare.
No se ha confirmado un P0 ni una concesión nueva sin firma válida.

La clase común es **denegación segura sin una vía de recuperación autenticada**.
Las correcciones deben mantener firma, dispositivo, persistencia y protección
contra replay. Borrar ficheros o reiniciar el reloj/lápida a valores por defecto
no es una solución aceptable.

## Hallazgos nuevos confirmados

### P1 · F1 · Una autoridad DPAPI ilegible inutiliza también Install e Invalidate

Seguimiento: [#1806](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1806).

- **Código:** `native/services/src/storage/windows.rs:243`,
  `native/services/src/storage.rs:157`,
  `native/services/src/license/authority.rs:66`,
  `native/runtime/src/rights/mod.rs:143`,
  `native/runtime/src/rights/host.rs:51` y `:266`.
- **Escenario:** se daña el ciphertext de `authority.dpapi`. DPAPI devuelve
  `Corrupt`; `load_for_restore` lo convierte en `Storage`; `Owner::open` falla.
  El host continúa sirviendo política denegada con `owner=None`. Todos los
  futuros Install/Invalidate requieren ese propietario ausente. Reiniciar lee
  los mismos bytes; una licencia nueva no puede instalarse.
- **Usuario:** acceso bloqueado aunque pague y tenga conexión. Comprobar acceso,
  logout/login y reinstalar conservando datos no resuelven la autoridad dañada.
  Es distinto de `binding`/`candidate` recuperados en #1796.
- **Corrección propuesta:** conservar el archivo dañado y ofrecer un estado de
  recuperación sin derechos. Reconstruir la autoridad mediante un protocolo
  autenticado con prueba nueva y reglas explícitas para reloj/revocación;
  nunca restaurar el binding antiguo por haber apartado el archivo.
- **Tests:** `rights/tests.rs:287` exige explícitamente `Err(Storage)` para el
  ciphertext corrupto. Cubre denegación, no recuperación. Añadir una regresión
  Windows que conserve denegación offline y permita recuperar con una licencia
  nueva, con persistencia antes de ACK, reinicio y replay rechazado. Separar
  corrupción DPAPI reconocida de E/S bloqueada; no convertir esta última en
  defaults.

### P1 · F2 · Sincronizar un reloj adelantado no recupera el acceso

Seguimiento: [#1807](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1807).

- **Código:** `native/services/src/license/authority.rs:103`, `:137`, `:365`;
  `native/runtime/src/rights/mod.rs:180`.
- **Escenario:** con binding válido el reloj del PC se adelanta un día y el
  núcleo observa/persiste esa pared. Se corrige al UTC real. `observe` rechaza
  toda pared inferior a `last_wall`, también antes de instalar un grant recién
  firmado. En un reinicio se aparta el binding rechazado, pero se conserva la
  referencia futura que vuelve a rechazar el nuevo Install.
- **Usuario:** sigue bloqueado después de sincronizar. El bloqueo dura hasta
  alcanzar el máximo de pared guardado, que puede estar horas o días por delante.
  No es el caso de #1784: allí `issued_at` está hasta 300 s por delante del PC;
  aquí una observación local futura contamina el suelo durable.
- **Corrección propuesta:** recuperación explícita mediante tiempo remoto
  confiable y prueba nueva ligada a petición/dispositivo, sin extender caducidades
  ni permitir replay de un binding antiguo. Mantener la denegación offline.
- **Tests:** `license/tests.rs:576` prueba rechazo de retroceso incluso mínimo y
  tras reinicio. `rights/tests.rs:1423` recupera solo cuando la pared ya supera
  la referencia guardada. Falta avanzar, persistir, corregir, rechazar offline
  y recuperar online con reloj inyectado. Incluir corrección pequeña NTP y
  logout durante el desfase, sin modificar el reloj del servidor de pruebas.

### P1 · F3 · Una sesión o metadata OAuth DPAPI ilegible impide un login nuevo

Seguimiento: [#1808](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1808).

- **Código:** `native/services/src/storage.rs:131` y `:157`,
  `native/services/src/account.rs:326`,
  `native/services/src/app.rs:347`, `:571`, `:722` y `:253`.
- **Escenario:** `account.dpapi` no se puede descifrar, o la metadata pública
  OAuth está dañada. `ensure_account` propaga Storage sin crear `self.account`.
  Se exige esa misma restauración antes de iniciar navegador, email o poll.
  Logout invalida primero derechos/candidate y luego tropieza en ensure_account.
- **Usuario:** no puede volver a autenticarse. Un intento de cerrar sesión puede
  retirar además un binding sano sin arreglar el documento corrupto. Reinicio y
  actualización que preserva datos conservan el bloqueo.
- **Corrección propuesta:** detectar corrupción DPAPI de sesión/metadata con el
  lector de caché, conservar sus bytes y reconstruir solo metadata pública o
  sesión SignedOut. Exigir login nuevo e invalidación durable al cambiar de
  identidad. No trasladar ese fallback a reloj/lápida de F1.
- **Tests:** cubrir ciphertext corrupto separado de JSON protegido inválido y
  de E/S bloqueada. Verificar que el login nuevo funciona, no resucita tokens,
  no hereda derechos de otra cuenta y sobrevive a un segundo arranque.

## Riesgos y discrepancias acotadas

### P2 · R1 · Sin plazo de credencial V1, no hay refresco periódico después del primer éxito

`native/runtime/src/services/renewal.rs:156` considera una renovación debida
por primer intento, fallo anterior, acceso no verificado o deadline cercano.
`native/services/src/license.rs:269` deja el envelope V1 sin expiración;
Free y derechos perpetuos pueden publicar `valid_until_ms=None`
(`native/runtime/src/rights/mod.rs:410`). Después de un éxito, el temporizador puede
seguir en `NotDue` indefinidamente mientras continúe el proceso.

Escenario: Founders reembolsado o módulo beta retirado mientras la app sigue
abierta y conectada. La próxima renovación reflejaría la retirada, pero no hay
un plazo máximo que fuerce esa renovación. Igual ocurre con cambios de plan
que necesitan una nueva consulta y no son una compra iniciada desde el Hub.
No se ha demostrado una revocación instantánea exigible offline: la limitación
perpetua está aceptada en `docs/billing/founders-1661.md:110` y documentada en
`supabase/functions/native-license/README.md:59`.

Propuesta: decidir una cadencia máxima de comprobación online independiente de
la expiración comercial, con backoff y deferencia a carrera; no inventar una
expiración para la compra perpetua ni revocar ante fallo de red. Test con reloj
inyectado: éxito sin deadline, cambio remoto, siguiente comprobación acotada.

### P2 · R2 · La recuperación de pago online no llega a los derechos nativos

`supabase/functions/_shared/license-credential.ts:253` separa
`subscription_recovery` en `online_capabilities`, sin firmarla como grant.
`native/services/src/license_remote.rs:100` valida los nombres pero descarta
esas capabilities; el núcleo recibe solo la credencial firmada. Es correcto
que un array sin firma no conceda derechos, pero el cliente nativo no tiene en
esta ruta un sustituto firmado para las hasta 72 h de recuperación técnica.

Escenario: acaba el periodo pagado y el backend conserva solo recovery activo.
Con red y sesión válidas, la app recibe HTTP200, pero se queda en catálogo Free
al caducar el Pro firmado. Propuesta: acordar si la recuperación aplica al nativo
y, si aplica, entregar un lease autenticado firmado y acotado; nunca confiar en
`online_capabilities` directamente. Falta un test servidor→services→núcleo de
`past_due`, dentro y fuera de su límite, sin alargar `paid_through`.

### P3 · R3 · La documentación sigue llamando v14 al contrato de servicios v15

`native/ipc/src/services_protocol.rs:7` fija la versión vigente. `native/README.md`
y secciones de los README services/Hub todavía dicen v14. Puede inducir a
construir o diagnosticar una mezcla de binarios incorrecta; no demuestra que
la instalación RC9 esté mezclada. Corregir referencias en una tarea documental
acotada; #1803 ya identifica esta discrepancia. Este PR no cambia esos README.

## Antecedentes contrastados, sin duplicar su seguimiento

| Antecedente | Estado observado en la base / consecuencia para esta revisión |
| --- | --- |
| #1784, reloj | Integrado. Tolerancia de emisión futura hasta 300 s, con deadline sin ampliación y reloj durable. No cubre F2. |
| #1794, upgrade RC8 sobre 975/974 | Integrado. No se repite QA de instalador ni se confunde instalación correcta con licencia válida. |
| #1795, inventario siguiente release | Riesgo de distribución separado; el informe no certifica inventario de una futura candidata. |
| #1796, renovación/cachés | Integrado. Automática preserva binding; cachés binding/candidate inválidas se apartan. F1/F3 afectan otros documentos. |
| #1798, candidate válido de otra cuenta | Abierto. Owner rechaza cambiar subject sin invalidar; admisión de helper puede quedar bloqueada al transferir. No se abre un duplicado. |
| #1801, Cuenta | Abierto. `app.rs:749` conserva «derechos pendientes» en respuesta de sesión; el Hub puede mostrar ese mensaje junto a política verificada. |
| #1803, transporte | Otro worker lo corrige. En esta base todo error de control se convierte en Denied (`app.rs:82`) y puede bloquear reintentos automáticos. No se atribuye su arreglo a esta revisión. |

## Matriz de estados del usuario

«Esperado» combina contrato comercial y restricciones beta actuales; no promete
módulos que la beta presenta como próximos. «Según código» supone binarios y
configuración coherentes, sin consultar datos reales de una cuenta.

| Estado | Debería ver / poder hacer | Según el código de la base |
| --- | --- | --- |
| Sin cuenta | Pantalla de acceso recuperable; no conceder premium. | El gate de sesión bloquea navegación de producto. Sin binding firmado los overlays tampoco abren los cuatro gratuitos. Una caché de sesión corrupta impide login nuevo (F3). |
| Gratis, sesión y firma válidas | Acceso verificado; Standings, Relative, Delta y Pedals; resto requiere Pro. | Credencial V1 sin grants puede verificar sesión; catálogo Free abre esos cuatro. Puede coexistir banner «pendientes» (#1801). No hay deadline global V1 (R1). |
| Pro vigente | Widgets de pago y funciones publicadas Stable; caducidad conforme a periodo firmado. | `vantare.plan.pro` selecciona Pro y abre todos los widgets registrados. Módulos requieren su capability/rollout; la beta oculta Analysis y presenta Engineer/Strategy como próximos. |
| Pro Plus vigente | Todo Pro más Testers/Nightly. | Firma plan.pro y capabilities de canal por separado; núcleo comparte catálogo Pro. El permiso de canal no sustituye a firma ni compra. No se verifica aquí el feed desplegado. |
| Founders | Todo presente/futuro y Nightly; compra perpetua, sin confundir con rol Owner. | Catálogo Founders permite widgets/módulos futuros. V1 y grants perpetuos no vencen. Retirada se refleja al renovar; sin deadline no hay cadencia máxima automática (R1). |
| Caducado | Baja a Gratis, con explicación y compra/renovación recuperable. | Al vencer Pro, catálogo baja a Free; V1 aún puede mantener sesión verificada. Existe gracia de una hora para capacidades de una carrera elegible, acotada por autoridad. Recovery online no se consume en nativo (R2). |
| Reembolsado / downgrade | Retirar solo la fuente afectada al obtener estado nuevo; conservar otras compras. | Backend proyecta por fuente; cliente usa firma anterior hasta nueva emisión o caducidad. Perpetuas offline no se revocan retroactivamente; la comprobación online no tiene plazo máximo en R1. |
| Límite de dispositivos | Mensaje específico y sustitución autenticada; no borrar una licencia sana por fallo automático. | HTTP409 device_limit → DeviceLimit. UI ofrece Restablecer; invalida localmente antes de reset remoto, limitado a 24 h, y exige nueva credencial. Otros 409 son Conflict. |
| Sin red, caché válida | Derechos firmados vigentes; error de red recuperable, sin revocación automática. | Owner restaura sin HTTP; overlays dependen de política fresca local, no red. Hub exige conocer sesión guardada; metadata ausente necesita discovery. Automática hace backoff; #1803 afecta clasificación IPC. |
| Sin red, primer arranque / caché inválida | Login/verificación pendientes claros; no inventar derechos. | Sin firma no hay acceso verificado. Binding/candidate inválidos se apartan; authority/account corruptos dejan F1/F3. No se promete login inicial offline. |
| Sesión OAuth caducada | Renovar sesión, conservando licencia vigente ante fallo automático; pedir login cuando haga falta. | Automática intenta refresh y conserva binding ante rechazo, pero puede quedar bloqueada hasta acción explícita. El núcleo sigue con su firma. El Hub no usa expiración OAuth como expiración de licencia. |
| Reloj hasta 300 s atrasado respecto a emisión | Admitir firma nueva dentro de tolerancia, sin extender derechos. | Authority adelanta referencia efectiva y traduce deadlines. El Date TLS del servidor se comprueba; sin Date el helper usa hora local. |
| Reloj con desfase mayor / adelantado y luego corregido | Denegar de forma explicable y ofrecer sincronización más recuperación autenticada. | Desfase >300 s produce Clock. Corregir un adelanto ya persistido no basta y puede bloquear hasta alcanzar ese tiempo (F2). |
| Cambio de cuenta | Revocar durablemente A antes de guardar B; nunca heredar sus derechos. | Login de identidad distinta invalida antes de completar. Candidate firmado de otra cuenta con binding existente queda en #1798; no se certifica aquí recuperación de ese caso. |
| Reinstalación / segundo PC / caché antigua | Conservar datos sanos; pedir login si cambió entorno; límite de PC recuperable. | Namespace OAuth incluye issuer/client/channel/backend; no se migran tokens entre entornos. Device fingerprint y binding se validan. Upgrade no sanea authority/account corruptos; binding/candidate de clave retirada sí se apartan. |

El catálogo de widgets está centralizado en `native/ipc/src/control.rs:64` y
se aplica en `native/ui/src/rights.rs:9` y
`native/hub/src/shell/navigation.rs:22`. El núcleo calcula la política en
`native/runtime/src/rights/mod.rs:369`; «overlays_advanced» significa sesión
firmada utilizable, también Gratis, y no equivale por sí solo a plan Pro.

## Cobertura y límites de verificación

### Servidor y frontera comercial

- `supabase/functions/_shared/native-auth.ts:47`: verifica el bearer opaco con
  Clerk, cliente OAuth, scopes, subject y expiración; comprueba usuario no
  bloqueado/borrado antes de resolver cuenta. Ni email ni metadata editable
  conceden un UUID o un plan.
- `supabase/migrations/20261014093708_isa_1608_commercial_b03.sql:79` sustituye
  el resolver antiguo: exige issuer habilitado y respeta la lápida de cuenta
  borrada, bajo advisory lock. No basta leer la primera migración histórica.
  `native_claim_license_device` está concedida solo a service_role en
  `20261002130000_native_license_bridge.sql:140`; la identidad que recibe debe
  estar verificada en la Edge Function.
- Claim de dispositivo serializa la fila por cuenta y conserva la primera
  huella distinta; el endpoint devuelve DeviceLimit tras comparar la huella.
  Reset autenticado actualiza la huella y limita reemplazos a 24 h
  (`20261013225830_isa_1608_canonical_device_claim.sql:16`). No se ha realizado
  un reset real ni se acredita exclusión inmediata de otra licencia offline
  que ya estuviera firmada.
- `supabase/functions/_shared/mapping.ts:110` diferencia Pro, Plus y Founders.
  `license-credential.ts:218` normaliza fuentes, entorno y vencimientos; la firma
  no usa `user_entitlements` como atajo. La vista efectiva
  (`20261014095203_isa_1608_commercial_b02.sql:190`) excluye cuentas borradas y
  bloqueos por refund, incluidas recuperaciones de esa suscripción; no permite
  a un evento posterior retirar una restricción de refund solo por renovar.
- Webhook: cuerpo acotado a 1 MiB, HMAC del cuerpo original/ID/timestamp y
  tolerancia de 300 s (`billing-webhook/index.ts:40`,
  `_shared/webhook-verify.ts:102`). Inbox por evento/hash, lease y efectos con
  acuse separado (`billing-webhook/process.ts:1252`); falta de orden permanece
  reintentable y una cuarentena no equivale a pago. Reconciliación aplica
  orden/refund por versión e ID. Las suites lifecycle-matrix, inbox, ledger y
  `supabase/tests/commercial_refunds.test.sql` ejercitan estas fronteras;
  fueron leídas, no ejecutadas en este encargo.
- Firma Ed25519 v1: `license-credential.ts:337`; `issued_at` procede del reloj
  del servidor que también valida OAuth. Cliente usa `verify_strict`, keyring
  compilado, issuer/UUID/huella/claims y orden estricto de capabilities
  (`native/services/src/license.rs:243`). Una clave desconocida no se descarga
  ni se acepta por HTTP: exige un cliente con trust roots compatibles. La
  cuarentena de clave retirada permite recuperar con firma conocida. No se ha
  probado una rotación real ni se certifica el orden de despliegue de claves.
- RLS/ACL: los grants y la vista efectiva son autoridad de servidor; la vista
  revoca SELECT a anon/authenticated y solo lo concede a service_role. El cliente
  no puede concederse planes mediante DML directo según estas migraciones.
  Esta lectura no acredita ACL, RLS, claves o funciones realmente desplegadas.
- Rate limits: hay límites de tamaño y timeouts; los 429 de Clerk se conservan.
  No se observa presupuesto propio por cuenta/IP en `native-license`. El suelo
  de un minuto del cliente no protege el endpoint de otros clientes. El límite
  efectivo del gateway y su configuración son una comprobación operativa
  pendiente, no una garantía de este checkout ni un P1 demostrado.

### Semántica HTTP, cliente y publicación local

| Resultado remoto/local | Tratamiento en la base | Límite que debe conservar un arreglo |
| --- | --- | --- |
| 200 con firma válida | Guarda candidate; verifica e instala en núcleo; ACK tras persistir. | HTTP200 por sí solo no concede derechos. |
| 200 con firma/clave no admitida | Error de formato/Version; automática no revoca binding. | Nunca convertirlo en permiso; orientar a actualizar. |
| 401 / 403 | Authentication / Denied; automática conserva binding y se bloquea hasta recuperación. Manual puede invalidar de forma durable. | Una sesión remota rechazada y un fallo IPC transitorio son categorías distintas (#1803). |
| 409 device_limit | Variante DeviceLimit y salida Restablecer. | No sustituir por error genérico; no replay automático de reset. |
| Otro 409 | Conflict; automática definitiva, manual puede invalidar. | No asumir que toda inconsistencia de servidor prueba revocación comercial. |
| 429 / 5xx / fallo de red | Offline/transitorio con backoff 1/2/4/8/15 min. | Conservar derechos firmados vigentes; no reenviar acciones cuyo resultado se perdió. |
| E/S local real / DPAPI ilegible | E/S se propaga; la recuperación depende del tipo de documento. | Distinguir F1/F3 de binding/candidate corregidos en #1796. |

`native/services/src/http.rs:38` fija categorías HTTP; `app.rs:167` distingue
renovación automática y manual. OAuth usa PKCE S256/loopback con state,
origen de endpoints fijado, generación y comparación de identidad en refresh
(`account.rs:70`, `:226`, `:548`). Secretos no viajan por los replies de licencia.
DPAPI añade contexto por entorno, archivo acotado, ACL/escritor único y reemplazo
durable (`storage.rs:35`, `:270`). No se ha intentado leer la sesión de Isaac.

La renovación se pospone en live si los derechos siguen verificados; el núcleo
decide la gracia elegible y los consumidores usan sus deadlines. La política
tiene TTL local de 2 s (`ipc/src/control.rs:89`): una pérdida prolongada del
canal local puede mostrar candados aun con una licencia offline válida. Cambiar
el TTL para ocultarlo no está propuesto. La UI de compra espera hasta 10 min y
exige catálogo verificado para el producto solicitado
(`hub/src/services/view.rs:83`); no interpreta volver del navegador como pago.

No se han enviado webhooks, compras, refunds ni peticiones autenticadas de
producción. Los límites de servidor son de código versionado; no se certifica
el despliegue remoto.

Los tests citados se han leído. No se afirma que hayan sido ejecutados en este
encargo. Sin cambios de producto, se omiten compilación Rust, fmt/Clippy/Nextest,
lifecycle y telemetría por alcance documental de solo lectura. No hay Deno en
PATH; tampoco se instala un runtime ni se ejecuta SQL contra producción.

Validación documental: `git diff --check`, revisión del diff completo y
`python tools/quality/vantare_quality.py check --base 9fa66225adde60ad6e3aa55f7b4fe87930410ed4`.
El check de calidad conserva **466/466 huellas**, sin recalibrar baselines.

## Siguiente acción

El orquestador prioriza #1806/#1807/#1808, revisa el informe y asigna cada arreglo
con su regresión y su propia tarea; este encargo no implementa ninguno. #1803,
#1798 y #1801 siguen con su seguimiento existente. Ningún resultado aquí autoriza
merge, promoción, release, despliegue, gasto ni cambios administrativos de cuenta.
