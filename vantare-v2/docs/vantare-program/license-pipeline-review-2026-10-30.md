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

Cinco P1 nuevos confirmados: autoridad DPAPI irrecuperable, sesión/metadata DPAPI
irrecuperables, reloj adelantado que sigue bloqueando después de corregirlo y
candidate de dispositivo anterior que impide abrir el canal de recuperación,
y perfil automático que puede revocar una licencia offline vigente.
Se han abierto #1806, #1807, #1808, #1810 y #1812, todos con `area:licencias` y Project Vantare.
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
  `native/runtime/src/rights/mod.rs:128`,
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

### P1 · F4 · Candidate firmado del dispositivo anterior bloquea también el login

Seguimiento: [#1810](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1810),
vinculada al mecanismo de admisión de #1798; coordinar un arreglo común.

- **Código:** `native/services/src/license_remote.rs:111`,
  `native/services/src/app.rs:90`,
  `native/runtime/src/rights/mod.rs:217`,
  `native/runtime/src/services.rs:383`.
- **Escenario:** cambia MachineGuid, pero el almacén del usuario sigue siendo
  descifrable, por ejemplo tras restaurar una imagen con las claves DPAPI.
  El núcleo aparta el binding del dispositivo anterior. Services valida el
  candidate contra `candidate.device`, por lo que su firma antigua pasa;
  Install lo verifica contra la huella actual del núcleo y lo rechaza.
  El supervisor exige TransferRights antes de admitir el helper y enviar
  AccountBegin/AccountPoll/LicenseRenew: nunca se alcanza el código que podría
  autenticar y pedir una licencia nueva. Cada helper vuelve a leer la misma caché.
- **Usuario:** ni reintento ni reinicio resuelven la licencia; el dispositivo
  incorrecto no obtiene derechos, pero tampoco existe una salida normal.
  Una copia entre PCs que pierda las claves DPAPI daría corrupción recuperable
  de candidate, no este escenario; aquí el documento debe seguir descifrable.
- **Corrección propuesta:** comprobar el dispositivo actual antes de transferir
  y apartar el candidate incompatible preservando evidencia. Admitir un canal
  restringido de recuperación con política denegada aunque la caché no pueda
  instalarse; no omitir firma, cuenta, reloj, lápida ni ACK durable.
- **Tests:** firmas auténticas con dispositivo viejo/nuevo, misma cuenta,
  cuenta distinta y candidate rechazado por reloj/lápida; ninguna concesión
  de la caché rechazada y recuperación sin manipular archivos. Las fixtures de
  `runtime/src/services/tests.rs:127` usan el mismo dispositivo. Es un disparador
  adicional a #1798 y no se arregla solo reclasificando el transporte en #1803.

### P1 · F5 · El refresco cosmético automático puede revocar la licencia offline

Seguimiento: [#1812](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1812).

- **Código:** `native/services/src/account/profile.rs:18`,
  `native/hub/src/services/view.rs:988` y `:1047`,
  `native/services/src/app.rs:711`, `:299` y `:317`.
- **Escenario:** OAuth se restaura pero falta o no se puede leer account-profile.
  El Hub encadena AccountProfileRefresh como Inflight::Profile, sin click.
  Si el access token necesita refresh y Clerk devuelve invalid_grant, 401 o
  403, services recorre `automatic=false` y ejecuta Invalidate, elimina candidate
  y cierra la sesión. El entitlement offline puede seguir firmado y vigente.
  La carrera con el temporizador importa: el caso se alcanza si el perfil llega
  antes de que una renovación distinta sanee OAuth; no se presume un orden fijo.
- **Usuario:** abrir la app puede retirar sus derechos locales por leer nombre
  y foto, sin pedir Comprobar acceso ni cerrar sesión. La frecuencia de refresh
  rechazado depende de Clerk/configuración y no se ha medido en producción.
- **Corrección propuesta:** distinguir perfil automático de acción explícita,
  o hacer no destructivas todas las lecturas de perfil respecto a licencia.
  Una sesión rechazada no se debe presentar como válida: devolver necesidad de
  reautenticación sin revocar la licencia ya firmada por una acción cosmética.
  Conservar logout/cambio de identidad explícitos y no mezclar cuentas.
- **Tests:** `native/services/src/app.rs:1508` incluye AccountProfileRefresh entre
  comandos que revocan con invalid_grant. El Hub prueba que pide ese perfil solo;
  falta cruzar ambas rutas con binding auténtico vigente. Exigir ausencia de
  Invalidate, candidate conservado y política vigente hasta expiry. Incluir
  401/403, 429/5xx y sincronización explícita con el temporizador. #1796 protege
  LicenseRenewAutomatic, pero no esta segunda acción automática.

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

### P2 · R4 · Primer login con reloj adelantado crea una lápida futura

`native/services/src/app.rs:400` invalida antes de completar el primer login o
cambio de identidad; el flujo email hace lo mismo (`:584`). Es necesario
preservar la revocación si existe un binding previo cuya identidad no se conoce.
`license/authority.rs:325` fija la lápida con hora local y `:139` rechaza una
emisión no posterior a ella.

Con un PC dos segundos adelantado, el HTTP200 y la firma nueva son válidos y
el desfase está dentro de 300 s, pero `issued_at` puede seguir detrás de la
lápida. Install falla, la automática queda definitiva y no vuelve a intentarlo
al pasar los dos segundos. Reintentar manualmente más tarde puede recuperar.
Si se reinicia/cierra el helper antes, el candidate ya guardado sigue siendo
anterior a la lápida y bloquea TransferRights: variante agravada de F4/#1810.

Propuesta: alinear la frontera de revocación y la emisión nueva mediante una
referencia autenticada y clasificación recuperable del rechazo temporal; no
omitir Invalidate solo porque `account.identity()` sea None. Test con clocks
cliente/servidor separados, login, HTTP200, Install rechazado y recuperación tras
el desfase, también después de reiniciar helper. El test
`native/services/src/license/tests.rs:820` cubre reloj atrasado, no este caso.

### P2 · R5 · Pausar una sesión elimina la gracia adquirida antes de vencer

`native/runtime/src/rights/host.rs:147` conserva `entered_at` para Stale, pero no
para Paused. `rights/mod.rs:350` abandona la partida en un estado distinto de
Stale. Al reanudar, el nuevo Game solo es elegible si la nueva entrada sigue
antes de la expiración (`services/src/license/authority.rs:259`).

Escenario: Pro vence a las 20:00; se entra a las 19:50, se pausa a las 19:59 y
se vuelve a las 20:01. Sin pausa conservaría la gracia hasta las 21:00; con
pausa pierde su elegibilidad. La cadena está confirmada; falta confirmar con
producto que Paused debe conservar la sesión para derechos, como ya se hace
para continuidad de uso. Si la pausa equivale a fin de sesión por contrato,
este hallazgo debe retirarse, no cambiarse el código a ciegas.

Propuesta: preservar entrada y gracia ya adquiridas durante Paused, sin crear
gracia nueva ni convertirlo en Live; mantener los rechazos de replay/cambio de
sesión. Falta un test Live→Paused→Live que cruce expiry: no hay Paused en
`native/runtime/src/rights/tests.rs` de esta base.

### P2 · R6 · E/S transitoria al abrir requiere reiniciar aunque el bloqueo desaparezca

`native/runtime/src/rights/host.rs:51` intenta abrir Owner una sola vez. Si un
handle externo bloquea la lectura de authority/binding durante ese instante,
se conserva `owner=None`; Install e Invalidate no vuelven a abrirlo (`:266`).
Al liberar el handle, la aplicación sigue denegada. Reiniciar puede recuperar,
a diferencia del ciphertext corrupto de F1. La clasificación como Unconfigured
o Denied agrava el fallo, pero arreglar solo #1803 no crea un propietario nuevo.

Propuesta: distinguir configuración ausente de almacén temporalmente inaccesible
y permitir una reapertura limitada conservadora, sin segundo escritor ni derechos
antes de verificar/persistir. Test con handle Windows real: lectura bloqueada
al arrancar, liberación sincronizada y recuperación posterior. El test
`native/runtime/src/rights/tests.rs:1494` cubre fallo de persistencia con Owner
vivo, que es otro camino. Coordinar el mecanismo con #1806.

### P2 · R7 · El refresh manual puede cerrar sesión sin que el Hub lo refleje

`native/services/src/app.rs:317` ante Authentication/Denied en refresh manual
revoca y guarda SignedOut, pero LicenseRenew no es `account_action` (`:478`);
se devuelve Reply::Error y no Reply::Account. El Hub conserva signed_in y la
caducidad conocida (`hub/src/services/access.rs:249`, `view.rs:977`).

El usuario ve sesión conectada y política denegada. Comprobar acceso repite una
renovación sin sesión; Logout permite salir cuando el canal sigue disponible.
No es el banner fijo de #1801 ni prueba que un token caducado deba revocar una
licencia automáticamente.

Propuesta: después de un cierre efectivo, devolver también el estado real de
cuenta o releerlo sin efectos remotos; mantener la invalidación durable y no
repetir la acción que perdió respuesta. Falta test integrado invalid_grant en
LicenseRenew→SignedOut→Hub vuelve a ofrecer login.

### P3 · R8 · Cuenta y navegación beta discrepan para Calendar sin rol tester

`native/hub/src/services/view/account.rs:143` calcula «Incluido» con `lock`,
pero `shell/navigation.rs:53` oculta Calendar si tester=false aunque calendar
sea true. La fixture `account_tests.rs:75` espera todos los módulos incluidos
con tester por defecto falso. Escenario: concesión individual de Calendar o
Founders sin rol operativo; Cuenta lo incluye pero la barra beta lo oculta.

Propuesta: usar el mismo criterio beta o explicar «solo testers» en Cuenta,
sin conceder el rol tester por comprar un plan. Test de lista y navegación con
la misma Policy. Analysis/Engineer/Strategy tienen además restricciones beta
explícitas; no se presentan aquí como fallos de firma.

### P2 · R9 · Una huella temporalmente ilegible se trata como firma de caché inválida

`native/runtime/src/rights/mod.rs:24` convierte el error de leer MachineGuid en
huella vacía. Owner verifica entonces el binding con esa huella y lo aparta
como InvalidSignature (`:151`); la huella vacía se conserva durante el proceso.
Una E/S del registro puede retirar una caché válida para uso offline. Al volver
a leer correctamente y reiniciar, puede recuperarse; no se ha observado con
un usuario real.

Propuesta: diferenciar «identidad no disponible» de «credencial incompatible»,
conservar bytes y permitir relectura limitada antes de decidir cuarentena.
No acuñar una huella nueva por error. Test con identidad inyectada: lectura
fallida, cero derechos, caché conservada, relectura correcta y recuperación.

### Triage de otras propuestas del revisor runtime

| Propuesta | Decisión del integrador tras leer el código |
| --- | --- |
| Clock/Storage del núcleo se vuelven Denied | Confirmada en la base; comparte frontera con #1803. Mantener el seguimiento existente y no afirmar que un arreglo de transporte resuelve todos los rechazos semánticos. |
| DeviceReset revoca antes de la red | Orden intencional de seguridad: la revocación durable precede al reset remoto. No se propone invertirlo. Cubrir fallo de red y recuperación, explicando que hace falta renovar si el reset remoto no se completó. |
| PurchaseWait confirma pago para tester/Founder ya Pro | El predicado confirma acceso al catálogo, no una orden o factura. No se acepta como «pago confirmado sin cobrar». Puede mejorar el texto si el acceso ya existía; la admisión remota de la compra debe probarse antes de afirmar doble suscripción. |
| Launch histórico solo permite Calendar en modules | El comportamiento está fijado por tests (`rights/tests.rs:942`), mientras el contrato histórico menciona Engineer inicial. Discrepancia contractual a reconciliar con #1510; no implementar ampliación de derechos desde esta revisión. |
| Candidate de otra cuenta sin binding | Hipótesis relevante para #1798: no hay vínculo explícito con la sesión OAuth durante TransferRights. No se presenta como P0 o concesión a otra cuenta reproducida; añadir fixture de restauración parcial y comprobar toda la secuencia. |

### P2 · R10 · Un error cosmético de perfil desactiva la renovación automática

`native/runtime/src/services/renewal.rs:43` pone signed_in=false para cualquier
Reply::Account con error, aunque signed_in=true y expires_at estén presentes.
`native/services/src/app.rs:711` devuelve precisamente ese reply si falla una
lectura de perfil con Offline/Storage/5xx y la sesión sigue restaurada.
El Hub oculta el error de Inflight::Profile (`view.rs:880`).

Escenario: caché de perfil ausente y fallo transitorio del refresh o userinfo.
No se revoca la licencia, pero `claim` pasa a NoSession y no la renueva al
aproximarse su plazo. La UI sigue mostrando cuenta conectada; Comprobar acceso
o una nueva lectura limpia de cuenta puede rearmar. Es distinto del rechazo
OAuth destructivo de F5.

Propuesta: conservar el estado de sesión ante errores de presentación tipados;
no confundir `error: Some` con SignedOut. Test integrado perfil fallido con
signed_in=true→deadline cercano→una renovación, sin nuevo login y sin ráfagas.
Los tests de Renewal de la base usan error=None para sus replies de sesión.

### P2 · R11 · El aviso definitivo automático se consume pero se descarta en el Hub

`native/runtime/src/services.rs:427` guarda LicenseFailure como notice y `:322`
lo entrega una vez en LicenseStatus. El Hub pide ese comando como Background
(`view.rs:411`) y descarta LicenseFailure al ser de fondo (`:931`), sin campo
alternativo de aviso en `services/access.rs`. Esto protege el mensaje del usuario,
pero no ofrece una explicación cuando no había mensaje que proteger.

Escenario: Clock, Version o Authentication frena las renovaciones; la licencia
anterior sigue hasta su plazo y luego aparecen candados sin explicar la acción
necesaria. DeviceLimit conserva la variante accionable de reset, pero necesita
también contexto visible. La pérdida del notice por respuesta perdida ya se
sigue en #1799; este caso lo descarta incluso cuando sí se recibe.

Propuesta: aviso persistente separado del resultado de la acción del usuario,
con recuperación explícita y sin repetir efectos. Test con mensaje vacío y con
mensaje de usuario ya presente. Coordinar con #1799, sin duplicar implementación.

### P2 · R12 · `account_conflict` se confunde con una revocación comercial

`native/services/src/license_remote.rs:82` solo distingue device_limit en un
409; el resto cae en Conflict (`http.rs:38`). La renovación manual puede entonces
invalidar el binding (`app.rs:197`); la automática conserva derechos, pero queda
definitiva. El texto «conflicto de revisión» corresponde a otra función.
`native-license/index.ts:109` también usa account_conflict cuando el estado no
puede emitirse de forma segura, lo que no demuestra que el derecho previo haya
sido revocado comercialmente.

Propuesta: preservar el código remoto cerrado y su semántica de inconsistencia
de cuenta, mantener derechos firmados válidos y pedir soporte/reintento apropiado.
No convertir un 409 genérico en permiso ni ignorar DeviceLimit. Falta un test de
App con 409 account_conflict distinto del ya existente device_limit.

### Contraste específico de las propuestas de services

| Propuesta | Decisión del integrador |
| --- | --- |
| DPAPI irrecuperable | Confirma F1/F3, sin issues duplicadas. No se acepta reconstruir authority con Clock por defecto y aceptar cualquier firma antigua: falta autenticación de recuperación y protección de lápida/replay. |
| Tombstone futuro y candidate rechazado | Confirma R4/F4. Mantener #1810 y #1798 coordinadas; no aceptar una tolerancia ciega de 300 s sobre la lápida, porque permitiría reusar una licencia invalidada. |
| Refresh manual deja UI conectada | Confirma R7; se conserva prioridad P2 por recuperación escondida. |
| Invertir RPC DeviceReset e Invalidate | Rechazado: el orden durable protege la transferencia de dispositivo. Cubrir UX/recuperación del fallo remoto manteniendo ese orden. |
| Botón Founders visible para propietario | P3 de presentación confirmado en `hub/src/services/view/founders.rs:130`; no demuestra doble cobro. Ocultar/deshabilitar compra ya poseída y comprobar admisión/idempotencia del servidor antes de afirmar efectos monetarios. |

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
| Sesión restaurada, perfil ausente, OAuth rechazado | Pedir reautenticación sin revocar por leer nombre/foto. | El perfil se solicita automáticamente, pero usa el camino destructivo y puede invalidar una licencia vigente (F5). |
| Sesión restaurada, perfil ausente, fallo transitorio | Conservar sesión y renovación, mostrar aviso de perfil recuperable. | Reply de perfil con error puede apagar signed_in del scheduler y detener renovaciones aunque la UI siga conectada (R10). |
| Reloj hasta 300 s atrasado respecto a emisión | Admitir firma nueva dentro de tolerancia, sin extender derechos. | Authority adelanta referencia efectiva y traduce deadlines. El Date TLS del servidor se comprueba; sin Date el helper usa hora local. |
| Reloj con desfase mayor / adelantado y luego corregido | Denegar de forma explicable y ofrecer sincronización más recuperación autenticada. | Desfase >300 s produce Clock. Corregir un adelanto ya persistido no basta y puede bloquear hasta alcanzar ese tiempo (F2). |
| Cambio de cuenta | Revocar durablemente A antes de guardar B; nunca heredar sus derechos. | Login de identidad distinta invalida antes de completar. Candidate firmado de otra cuenta con binding existente queda en #1798; no se certifica aquí recuperación de ese caso. |
| Reinstalación / segundo PC / caché antigua | Conservar datos sanos; pedir login si cambió entorno; límite de PC recuperable. | Namespace OAuth incluye issuer/client/channel/backend; no se migran tokens entre entornos. Device fingerprint y binding se validan. Upgrade no sanea authority/account corruptos; binding/candidate de clave retirada sí se apartan. |
| Candidate válido de dispositivo anterior | Denegar esa caché y permitir nuevo login/activación. | El núcleo rechaza la huella, pero TransferRights bloquea la admisión del helper antes de poder recuperar (F4). |

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

El orquestador prioriza #1806/#1807/#1808/#1810/#1812, revisa el informe y asigna cada arreglo
con su regresión y su propia tarea; este encargo no implementa ninguno. #1803,
#1798 y #1801 siguen con su seguimiento existente. Ningún resultado aquí autoriza
merge, promoción, release, despliegue, gasto ni cambios administrativos de cuenta.
