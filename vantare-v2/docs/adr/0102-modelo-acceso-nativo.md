# ADR 0102 — Modelo de acceso nativo

Fecha: 2026-10-31. Issue: [#1827](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1827), Plane VANTA-126.
Diseño: [Recorrido de licencias](../vantare-program/license-access-model-design.md), §4.1–4.8.

## Estado

**Aceptado por el orquestador**, con autoridad delegada por Isaac, el 2026-10-31
(cinco decisiones registradas en #1827). El paso 0 añade caracterización y
documentación. La aceptación de este modelo no afirma su implementación,
integración ni publicación; cada paso posterior necesita issue y PR propios.

## Contexto

ADR [0099](0099-arquitectura-rust-nativa.md) mantiene Rust + GPUI y un núcleo
neutral. La firma, el reloj anti-retroceso, la lápida durable y el catálogo
central son válidos. La clasificación de errores, la sesión y las copias de
credenciales reparten una misma decisión entre varios procesos. Consolidamos
sus dueños sin cambiar criptografía ni el formato de binding/authority.

## Decisión

| Hecho o decisión | Dueño único |
| --- | --- |
| Derechos comerciales y plazo, incluida recuperación | Servidor: `normalizeGrants` sobre `billing_effective_access_grants`; Polar alimenta la autoridad comercial |
| Estado de suscripción | `deriveSubscriptionTransition`, reutilizado por webhook y reconciliación |
| Emisión nativa | `native-license`; retirada condicionada de la puerta legacy |
| Aceptación, firma, binding, reloj, lápida, gracia y catálogo local | Núcleo `rights::Owner` y `Authority` |
| Estado publicado de acceso | `Policy.state`, consumido por supervisor, Hub y overlays |
| Sesión de cuenta | Servicios `Account`, publicada como `Session` explícita |
| Clasificación de fallos | Una función pura `outcome(Error) -> Outcome` en servicios |
| Cadencia de renovación y último resultado persistente en memoria | Supervisor `Renewal` |
| Presentación | Hub/overlays leen la política y el resultado; no deducen autoridad |

Solo Logout, cambio de identidad y DeviceReset revocan derechos locales.
La revocación requiere ACK durable del núcleo antes de anunciar éxito.
Las renovaciones manuales y automáticas conservan lo firmado ante errores;
un refresh rechazado requiere login, sin borrar la licencia.

La recuperación por pago fallido se firma como validez temporal `paid_through`
del derecho hasta `recovery_until`, sin alterar el plazo comercial ni reiniciar
las 72 h. Es compatible con clientes v1 instalados. El test actual que excluye
recovery de la firma cambia expresamente en el paso 1 (#1814).

Se elimina la copia `license-candidate`, su marcador y `TransferRights` en el
paso 8. Servicios entrega la respuesta HTTP nueva al núcleo y se olvida.
Si se pierde el ACK, la siguiente renovación solicita otra emisión idempotente.
Binding, authority y su guardia siguen bajo el único escritor del núcleo;
datos sobrantes de candidate no conceden acceso. Se comprueba rollback de generación.

`Policy.state` es el contrato de estado; reemplaza inferencias desde booleanos
y textos. Se separan vencimiento firmado y gracia. Los protocolos se versionan
con el conjunto instalado; ninguna mezcla de binarios obtiene compatibilidad
silenciosa. No se baja una lápida sana ni se amplían plazos al reanclar reloj.

### Cinco decisiones de #1827

1. Una renovación manual no revoca; solo los tres actos explícitos anteriores.
2. `license-credential` se retira solo si el inventario de metadatos de invocación
   confirma cero uso durante 30 días. Con uso, recibe la barrera de
   `native-license`. Desplegar requiere autorización de Isaac.
3. Licencias sin plazo firmado (Founders/Gratis/Owner): comprobación al arrancar
   y cada 24 h, sin revocación por transporte. Esto no elimina el lease firmado
   de Owner cuando existe; se conserva su vencimiento.
4. Una pausa en la misma sesión del simulador conserva la gracia de una hora.
   Se implementa en el **paso 6b — la pausa conserva la gracia**, entre el 6 y
   el 7: `Paused` conserva la gracia igual que `Stale`, solo en la sesión live
   ya observada. Es el cambio de comportamiento justificado por esta decisión.
   Owner conserva el margen y Host la hora de entrada: pausar o reanudar no
   crea una hora nueva. Salir/cambiar de sesión o Logout descarta la gracia;
   la credencial y el plazo absoluto siguen caducando durante la pausa.
   La caracterización del paso 0 fijaba su pérdida; el paso 6b cambia únicamente
   esa fila, marcada de antemano por el orquestador.
5. Credencial v2 no planificada: se retira en el paso 11 salvo objeción de Isaac.

## Consecuencias y verificación

El paso 0 fija nightly, incluidos comportamientos que cambiarán a propósito.
Las matrices de núcleo, servicios y normalización tienen una fila por caso;
los pasos 4, 6 y 7 deben conservar sus decisiones de acceso. Los pasos 1, 5,
6b, 8 y 10 justifican las diferencias en su propia entrega. El paso 2 conserva su
arreglo de estados separado. Ningún paso de implementación mezcla cliente y servidor.

Las fronteras delicadas son tolerancia ±300 s, latest_issued, reloj corregido,
lápida futura y almacenamiento dañado (#1784/#1807/#1822). Se prueban con relojes
inyectados, firmas de prueba y directorios aislados; no se modifica el reloj
del equipo ni datos reales. La matriz complementa las regresiones existentes.
Servidor se valida con Deno en CI. Los gates nativos se ejecutan por la cola.

La semántica nueva de renovación puede conservar acceso offline hasta el plazo
firmado aun tras un bloqueo remoto. Es el contrato offline y debe explicarse
en soporte. Recuperación firmada concede como máximo la ventana contractual.
El supervisor mantiene backoff y límites de peticiones al retirar candidate.
La ejecución y evidencia de cada corte se registran en el
[handoff comercial](../vantare-program/handoffs/platform-commercial.md).

### Paso 2 — cuarentena por suscripción (revisión del orquestador, 31-oct-2026)

Un estado de snapshot desconocido no concede ni revoca: se salta esa suscripción,
conservando sus grants, recovery y versión, y se diagnostica
`unsupported_subscription_status` con el identificador del recurso, sin datos de
cuenta ni payload. Las otras suscripciones del mismo cliente siguen renovándose.
Se mantienen las barreras globales existentes, incluido `unknown_product`.
Customer State usa la misma clasificación de snapshot que el webhook:
`uncanceled` es un nombre de evento y `cancelled` un alias histórico puro;
ninguno se acepta como estado de snapshot.

La matriz `lifecycle-matrix.v1.json` distingue `expectedTransition` (función pura
histórica) de `expectedSnapshot` (efectos de ingestión). En el paso 2 la fila
unknown pasa de la revocación hipotética del fallback a cuarentena con acceso y
recovery conservados. La fila uncancel se envía sin traducir su estado: como
snapshot se cuarentena; el webhook específico sigue admitido. El test del worker
recorre las diez filas sin reescribir estados ni resultados; comprueba la acción
exacta `open`/`close`/`none` cuando se aplica un lifecycle, y ninguna escritura
en cuarentena o réplica. No cambia el fallback puro ni la forma de la licencia.

### Paso 6 — Session y navegación del Hub

El paso 6 conserva las decisiones de derechos del núcleo. Por encargo explícito
se corrige la presentación de NeedsSignIn: el Hub deja de limitarse a Cuenta
cuando el núcleo conserva derechos, y muestra un aviso de nueva entrada. Solo
SignedIn permite servicios remotos/renovación; Session no concede derechos.
La matriz de núcleo no cambia; la matriz de servicios añade la observación del
campo publicado sin cambiar sus columnas previas. Services v16 exige actualizar
el conjunto y rechaza generaciones mezcladas sin invalidar licencias guardadas.
Los formatos en disco no cambian respecto al paso 5.

El orquestador amplió expresamente el paso 6 para incluir `AccountCancel` en
v16: cancela únicamente verifier PKCE, listener/poll y FAPI pendientes, sin
escribir SignedOut ni invalidar derechos. El estado guardado se conserva:
NeedsSignIn vuelve a NeedsSignIn, SignedIn a SignedIn y SignedOut a SignedOut.
«Volver/Cancelar» deja de enviar Logout; «Cerrar sesión» lo conserva. El Hub no
convierte un fallo del formulario en SignedOut y permite volver a los derechos
que siga publicando el núcleo. Un servicio v15 no recibe Logout como sustituto.
La caracterización añade una fila AccountCancel sin revocación; las anteriores
no cambian. También se verifica la cancelación/fallo desde los tres estados,
la elección de proveedores, la incompatibilidad durante TransferRights y la
lectura de Session tras renovar en el supervisor.


Revisión de presentación del paso 6: un ACK de Logout fallido no es un cierre
confirmado. El usuario puede reintentar Logout o abandonar ese cierre fallido
con Volver si la sesión publicada y una política fresca del núcleo conservan
acceso. Escape/Volver en Choose no inicia un intento; cancelar un intento en
vuelo impide nuevos proveedores/cancelaciones hasta su respuesta.

### Paso 7 — estado y diagnóstico explícitos

Control v7 publica Policy.state y separa la frontera firmada de la gracia efectiva.
Active incluye Gratis al vencer únicamente Pro; Expired deniega la credencial
completa. Se conserva la matriz de acceso y el formato durable de Authority.
El campo histórico error queda como observación diagnóstica sin autoridad.
ClockBehind publica la lápida futura sin modificarla y evita HTTP automático
inútil (#1822 F2); la comprobación manual explica la fecha pendiente.
Una emisión 200 verificada, aunque no dé margen nuevo, es Verified: no acumula
fallos transitorios (P3 #1831). Durante la ventana urgente ordinaria se comprueba de nuevo
cada 15 minutos; en los últimos cinco minutos firmados se conserva el suelo de un minuto.
La confirmación de compra conserva su sondeo con suelo de un minuto dentro de
su ventana de diez minutos, también tras un 200 verificado sin margen nuevo.
La incompatibilidad se detecta por versión antes del esquema estricto, también
para Policy anidada en services v17. Los lectores anteriores pueden mostrar
un error genérico; ningún desajuste revoca derechos guardados. Install y
TransferRights se conservan hasta su paso 8, sin anticiparlo aquí.

Decisión del orquestador (1-nov-2026): el paso 7 eleva también el sobre de services
a v17. V16 nunca se publicó en una release. El cambio de Policy anidada requiere
rechazar al lector v16 desde el saludo, antes del esquema; Session/AccountCancel
y el resto del payload de services no cambian.

| Plano | Generación del paso 7 | Compatibilidad |
| --- | --- | --- |
| Control | v7 | Policy.state y plazos separados; v6/v7 se rechazan por versión |
| Services | v17 | Saludo v16/v17 incompatible antes de Policy; no revoca |
| Fotos | v11 | Sin cambios |

Los lectores nuevos validan también Policy.version antes de su esquema estricto.
Un núcleo o helper anterior que cierre sin responder todavía puede dar desconexión genérica;
no es un rechazo de derechos y nunca provoca invalidación local.

El Feed transporta también denegaciones frescas (incluida Expired): frescura de
observación no equivale a permiso. Mantiene el TTL original y nunca rejuvenece
una política por transporte; al recibir una denegación sustituye el acceso previo.
Una firma nueva que supera una lápida futura dentro de la tolerancia ya existente
puede recuperar el acceso antes de que la pared alcance la lápida; ClockBehind
solo se publica mientras no haya una credencial vigente verificada. La frontera
saludable se conserva aun después de aceptar esa firma.

### Revisión del paso 7 — diagnóstico y disponibilidad del helper

ClockBehind.until_ms se publica en tiempo de pared: se resta forward_millis de
la lápida efectiva sin modificar la guarda durable. El supervisor compara pared
con pared; no espera de nuevo el desfase servidor-adelante ya reconocido (≤300 s).
Home, Cuenta, overlays y el estado local del supervisor presentan la frontera con
fecha, hora y zona local legibles. Un automático omitido durante compra muestra
el estado con fecha, incluso cuando no arrancó el helper; el texto genérico de
LicenseStatus no sustituye el motivo.

Decisión del orquestador: una observación autenticada fresca de NoCredential,
RecoveryRequired o ClockBehind permite las consultas ordinarias al helper,
además de los comandos de recuperación. Arrancarlo no concede derechos.
Logout se admite siempre que el canal del núcleo responda de forma autenticada,
aun con política denegada o caducada; su ACK durable sigue siendo obligatorio.

### Paso 8 — licencia solo en el núcleo

Services v18 retira TransferRights y el almacén candidate/marcador. Mantiene
la verificación de la respuesta HTTP nueva y la entrega por InstallOnline;
control v7 conserva Install solo por compatibilidad; services ya no lo emite ni debe conectarlo a credenciales de disco.
La admisión usa Read autenticado y helper_command_allowed sobre Policy.state;
arrancar servicios no es una concesión. No cambia el catálogo ni sus permisos.
DeviceReset se admite como recuperación también con Expired/Revoked, igual que
LicenseRenew. Servicios exige una sesión utilizable antes de revocar o liberar
el asiento; NeedsSignIn sigue devolviendo Authentication sin HTTP ni revocación.

El ACK perdido o núcleo ausente al terminar HTTP es transitorio: se descarta
la respuesta en servicios y la próxima renovación pide una emisión nueva,
respetando backoff, suelo de un minuto y rate limit. Decisión del orquestador 1-nov: los restos históricos se apartan al arrancar
con quarantine_dated, sin leer, descifrar, deserializar ni reproducir su contenido.
El rename es best-effort e independiente por documento: no bloquea ni concede;
si falla, se diagnostica y se reintenta en otro arranque.
Así desaparece el primer binding de otra cuenta desde candidate (#1825).

Sin cambios durables de binding/authority/guardias. La fixture de generaciones
comprueba new → v17 → new y new → corte anterior a NeedsSignIn → new con datos
sintéticos. El lector pre5 aparta account/NeedsSignIn y pide login; los derechos
siguen válidos. V17/v18 se rechazan por Version, sin Protocol ni revocación.

La retirada usa el namespace actual de backend/canal y la extensión de Store
(.dpapi en Windows, .json en Unix); no recorre otros perfiles o canales. Los
restos de la misma cuenta también se apartan: sin binding no hay derechos del
núcleo que perder. Si falla el rename, v18 sigue ignorándolos; el saneamiento
del downgrade solo queda garantizado al haberlos apartado.
Una trama que declare services v18 con TransferRights es entrada malformada
(Protocol); el peer v17/v18 incompatible se clasifica Version antes del esquema.
Ninguno de estos errores revoca por sí solo.


### Paso 9 — aviso persistente y compra por Feed

Services v19 publica LicenseStatus local con Policy, Session observada por el
supervisor y LicenseNotice tipado opcional. La lectura no consume el aviso ni
arranca el helper; tampoco induce AccountPoll en el Hub. Rechazo definitivo,
account_conflict y límite de dispositivos sobreviven a respuesta perdida,
reconexión y consultas repetidas. Un éxito de renovación, cierre confirmado o
login confirmado lo releva; un error de transporte no lo borra. Es memoria del
supervisor, sin un almacén durable nuevo. Policy conserva su diagnóstico propio.
El Hub mantiene el aviso separado del resultado de la acción del usuario.
Durante la compra no emite renovaciones: el supervisor es el único scheduler,
conservando diez minutos, backoff y suelo de un minuto. Solo una observación
fresca del Feed de Policy confirma la compra; el reply de servicios no concede
ni confirma. V18/v19 incompatible es Version antes del esquema, nunca revocación.
Control v7, fotos v11, firma y formatos durables no cambian.

Revisión paso 9: el encargo del orquestador autoriza expresamente subir el
protocolo si hace falta, siempre con Version antes del esquema, nunca revocación.
La sesión local es opcional: null significa no observada durante el intento;
no fabrica SignedOut tras un error genérico de Logout. El Hub aplica una
observación estable solo en Idle, sin alterar login/cancel/logout ni sus errores.
NeedsSignIn sigue leyendo los avisos locales. Cancelar un intento conservando la sesión no los releva;
login confirmado por OAuth o email y DeviceReset confirmado sí lo hacen.

Una lectura AccountPoll que solo restaura SignedIn desde un estado desconocido
no demuestra un login nuevo: conserva el aviso hasta renovación verificada o
login OAuth/email confirmado. La prueba de Cancel fija SignedIn conservado;
no afirma el montaje sintético de aviso activo con SignedOut. El seguimiento
del scheduler después de Logout fallido + Volver queda en #1827 para decisión
del orquestador, sin añadirlo a este paso de presentación.

El paso 9 conserva un rechazo definitivo o límite de dispositivos ante un
fallo transitorio posterior: el transporte no demuestra su resolución. El
resultado manual de red se muestra aparte; una verificación, un reset o un
nuevo login confirmado siguen relevando el aviso según las reglas anteriores.
