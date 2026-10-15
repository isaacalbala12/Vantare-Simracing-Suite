# Correos de marketing · #1636 / VANTA-72

Candidato de revisión, sin despliegue ni contactos/mensajes/gasto reales.
Brevo y Anthropic solo se prueban con dobles; flags apagados por omisión.
Campañas y consentimiento viven en Vantare; las listas de Brevo son un espejo.

## Uso por Isaac

1. Correos → Nueva campaña. Plantillas Novedades, Oferta y Lanzamiento, con
   estructura ES (España), EN, IT y PT-BR (Brasil). Sustituir `{{contenido}}`
   en los cuatro textos: SQL impide confirmar ese marcador o texto vacío.
2. Editar y revisar cada idioma. La vista previa muestra texto seguro y pie;
   no acredita render de Gmail/Outlook. Texto plano, saltos y URLs visibles,
   sin HTML/adjuntos. Cuerpo, URL y atributo `lang` se escapan; idiomas restringidos.
3. Opcional: brief sin datos personales → confirmar Redactar. El servidor pide
   `claude-opus-5-5`, thinking adaptive, `output_config.effort: high` y devuelve
   cuatro borradores; no guarda/aprueba/envía. Modelo no disponible = error,
   sin sustitución. Revisar antes de guardar, incluida exactitud de ofertas/fechas.
4. Elegir grupo con recuento de consentimiento, guardar y «Enviar…». Confirmar
   la revisión guardada congela texto, grupo y destinatarios. Edición bloqueada
   mientras hay confirmación/petición. No se puede enviar un borrador sin guardar.
5. «Enviar siguiente tanda» confirma hasta tres correos. Repetir para continuar;
   no hay cron de envíos ni reanudación oculta. Cada reserva reevalúa como máximo
   veinte pendientes; si todos están retirados, otra tanda sigue con los restantes.
6. Máximo 300 reservas en ventana móvil de 24 h, compartidas por todas las
   campañas/entornos del proyecto, reservadas antes del HTTP y conservadas aunque
   el resultado sea incierto. Volver otro día al agotarse. Usar cuenta Brevo
   dedicada: otros mensajes fuera de este ledger consumen cuota desconocida aquí.
7. Historial: `accepted` significa recibo de Brevo, no entrega. `uncertain` o
   `dispatching` nunca se reintentan automáticamente. Comprobar evidencia antes
   de preparar otra campaña para esa persona. Retirados antes del HTTP = skipped.

Grupos desde derechos comerciales efectivos (incluidos bloqueos por refund),
roles vigentes, creadores activos y espera. Gratis/Pro/Pro Plus, Launch Edition,
Testers, Creadores y Espera; Launch sin Pro no se etiqueta Gratis. Una persona
puede pertenecer a varios grupos, pero recibe como máximo una versión por
campaña, en su idioma. Cuenta bloqueada/borrada o consentimiento retirado no es
elegible. Se comprueba en reserva y de nuevo antes del HTTP; una retirada
simultánea no puede recuperar una petición externa ya en curso.

## Consentimiento único y fuentes verificadas

`private.mail_contacts` nace vacía: no se importa permiso por tener plan o correo
en Clerk, ni del consentimiento de analítica. El Owner no puede otorgarlo a otros.
Servidor de cuenta/onboarding preparado: `native-mail-consent`, OAuth nativo y
correo primario verificado por Clerk; un get/set para novedades **y** ofertas.
Contrato exacto, respuestas/errores y enganche de #1637/Ajustes/web en
[CONSENT.md](CONSENT.md). #1637 no está en esta base; sus pantallas y el repo web
aparte deben enlazarse desde sus propias ramas antes de activar producción.

Backend web, solo tras verificar la dirección/gesto mediante su prueba de doble
opt-in, invoca `mail_record_consent` con UUID nulo, `p_waitlist=true`, idioma y
versión fija `marketing.waitlist.web.v1`. Nunca exponer service_role al navegador
ni aceptar `verified:true` del cliente como prueba. No se confía en una dirección
arbitraria aportada por el frontend.

## Baja y borrado de espera

El correo incorpora enlace propio firmado HMAC-SHA256 y cabeceras
`List-Unsubscribe` y `List-Unsubscribe-Post`. GET valida el enlace y muestra
confirmación, sin retirar permiso ni borrar contactos: escáneres/vistas previas
no provocan bajas. POST de formulario `action=unsubscribe` retira todo el permiso;
POST RFC 8058 `List-Unsubscribe=One-Click` lo hace sin una segunda confirmación.
POST `action=forget` borra solo espera sin cuenta actual/anterior y encola Brevo.
El recibo público es idéntico para espera, ausencia o cuenta vinculada; no revela
pertenencia a una cuenta ni afirma borrarla. Las cuentas se borran mediante #1622.
No pide login.

Límites persistentes: tras verificar HMAC en tiempo constante, 600 solicitudes/minuto
globales de enlaces válidos,
20/minuto por token válido; 429 incluye Retry-After 60. Solo se conserva hash del
token durante el intervalo necesario; sin IP ni dirección en el limitador.
El servidor web/edge puede añadir límites de origen en su despliegue autorizado.
Enlaces sin caducidad: mantener clave estable y backup; rotación requerirá
transición para no invalidar enlaces históricos. No registrar query strings.

Owner: «Borrar de lista de espera», escribir correo exacto y confirmar. Acción
`mail_forget_waitlist {email,confirm:true}`; no borra cuentas. Repetir es seguro.
SQL de baja/olvido es solo service_role: clientes no eligen otras direcciones.
Webhook Brevo verifica cabecera secreta antes del cuerpo y trata baja/spam/rebote
permanente/bloqueo como retirada global; duplicados seguros y fallo SQL = 503.

## Sincronización sin perder cambios

«Sincronizar contactos» procesa hasta cinco. El cursor es UUID opaco, no correo;
solo indica continuación. Selección por proyección no confirmada (revisión,
consentimiento, idioma y grupos efectivos), nunca por «direcciones posteriores».
Cambios detrás del cursor, durante HTTP y cambios/expiración de roles o derechos
quedan pendientes hasta un ACK que coincida con la proyección real; cada entorno
mantiene su ACK. Repetir hasta fin; cambios posteriores se recogen en la próxima
invocación sin reiniciar cursor. Puede devolver continuación mientras otro lease
vence: esperar y reintentar, sin lanzar bucles automáticos en el cliente.

Lease por contacto (60 s) antes de los dos HTTP Brevo (4 s cada uno): relee
permiso/grupos y evita sincronizaciones concurrentes. Retira grupos antiguos y
bloquea contactos no elegibles. No envía. La baja local es inmediata; el espejo
se suprime en la siguiente sincronización. No enviar desde el panel Brevo para
eludir la comprobación de consentimiento de Vantare.

## Borrado de cuenta y retirada de Brevo

El borrado #1622 elimina dirección actual/anterior y entregas. En la misma
transacción, un trigger encola DELETE de cada contacto Brevo antes de perder
la dirección. Reserva de cuota anónima conservada. La cola guarda temporalmente
solo la dirección necesaria para retirar al proveedor; ACK 204/404 la elimina y
retiene resultado/fecha/intentos/UUID sin dirección en la auditoría.

`mail-cleanup`, POST `{"version":1}`, es worker de cola con
`Authorization: Bearer <MAIL_CLEANUP_KEY>`. No permite elegir destinatarios.
Procesa hasta cinco; timeout por DELETE 4 s, lease 60 s, backoff de 5 s a 1 h,
máximo ocho intentos o 24 h de retención y fencing de ACK viejos. 404 ya ausente es éxito.
No declarar limpieza del proveedor completada con trabajos pendientes.

`MARKETING_CLEANUP_ENABLED` es independiente de envíos: mantener limpieza
operativa aunque se apaguen campañas. Configurar una llamada periódica de
servidor (p. ej. cada minuto) en el despliegue autorizado. Aquí no se crea
scheduler ni secreto. Owner puede usar «Reintentar borrados de Brevo»; el contador
pendiente/completado/fallido y hasta 20 recibos sin dirección se obtienen de `mail_list.cleanup`. DELETE espera a que venza
un lease de sincronización previo más 10 s (HTTP PUT 4 s y margen 6 s), y un alta nueva de la misma dirección espera
el ACK de borrado: el trabajo antiguo no puede retirar el alta nueva.

## Configuración futura de Brevo y Anthropic (Isaac)

1. Crear cuenta Brevo gratuita dedicada; revisar condiciones/DPA/subencargados,
   cuota y entregabilidad. Esta entrega no contrata ni configura nada real.
2. Añadir dominio y remitente; publicar DNS de autenticación que indique Brevo,
   verificar y configurar DMARC. [Ayuda oficial](https://help.brevo.com/hc/en-us/articles/12163873383186).
3. Crear listas Gratis/Pro/Pro Plus/Launch Edition/Testers/Creadores/Espera y guardar
   sus siete IDs positivos distintos en `BREVO_MARKETING_LISTS` con claves exactas
   `free,pro,pro_plus,launch,testers,creators,waitlist`.
4. Secretos solo de Edge: `BREVO_API_KEY`, `BREVO_MARKETING_SENDER` (correo),
   `ANTHROPIC_API_KEY`, `MARKETING_UNSUBSCRIBE_KEY`, `BREVO_WEBHOOK_KEY`,
   `MAIL_CLEANUP_KEY` (los tres últimos secretos independientes >=32 caracteres).
   No van en app, repo, chat, logs ni argumentos visibles. OAuth/Supabase reutiliza
   configuración existente. [Secretos Edge](https://supabase.com/docs/guides/functions/secrets).
5. `MARKETING_UNSUBSCRIBE_URL`: HTTPS exacta del endpoint `mail-unsubscribe`,
   sin query, fragmento, credenciales ni redirects. Configurar bajas, worker y
   migraciones antes de activar envío. `MARKETING_SEND_ENABLED`,
   `MARKETING_AI_ENABLED`, `MARKETING_CLEANUP_ENABLED` solo admiten `true` para
   habilitar su operación, y están apagados por omisión. IA requiere autorización
   de gasto y validar disponibilidad del modelo solicitado, sin fallback.
6. Brevo webhook HTTPS a `mail-webhook`, eventos del canal usado (unsubscribe,
   unsubscribed, spam, hard_bounce, blocked), cabecera personalizada
   `X-Vantare-Webhook-Key`. Nunca incluir secreto en la URL. Verificar con dobles
   y, tras autorización aparte, con un mensaje dirigido exclusivamente al Owner.
7. Despliegue explícito mediante `deploy-approved-functions.ps1 -Functions ...`:
   `mail-unsubscribe`, `mail-webhook`, `mail-cleanup`, `native-mail-consent`.
   No se incluyen en el conjunto comercial por defecto ni se hace deploy por glob.
   `verify_jwt=false` delega a la autenticación propia de cada handler. Registrar
   SHA/entorno y activar scheduler de limpieza solo en esa entrega autorizada.
8. Antes de activar: QA visual y Windows, conectar #1637 y web, revisar traducción,
   probar baja POST/GET, cola/ACK/reintentos y cuota en sandbox autorizado.

API Brevo: [crear contacto](https://developers.brevo.com/reference/create-contact),
[actualizar](https://developers.brevo.com/reference/update-contact),
[DELETE idempotente](https://developers.brevo.com/reference/delete-contact),
[SMTP email](https://developers.brevo.com/reference/send-transac-email).
Se envía por destinatario con pie propio para revalidar/reservar su cuota; no se
crea una campaña paralela en el panel Brevo ni se confunde recibo con entrega.

## Contrato Owner y gates

`native-admin`, version 1, JSON cerrado: `mail_list`, `mail_new`,
`mail_get(campaign_id)`, `mail_save(campaign_id,revision,name,template,target_group,content)`,
`mail_draft(campaign_id,revision,brief,template)`,
`mail_approve(campaign_id,revision,confirm:true)`, `mail_send_batch(campaign_id,revision)`,
`mail_sync(cursor?)`, `mail_forget_waitlist(email,confirm:true)`, `mail_cleanup`.
OAuth + Clerk habilitado + Owner en servidor y RPC, presupuesto de 60 pet/min.
Claim/finish/sync internos no son comandos del cliente. Otras acciones mantienen
8 KiB y mail admite 128 KiB. Cliente mail timeout 65 s, sin retry ni redirects.
Historial muestra hasta cien entregas con totales de toda la campaña; cien campañas.

CI `branch-channel-gates.yml`: handlers Deno sin permiso de red, suites SQL de
marketing y E2E con PostgreSQL desechable, guard PowerShell en Windows. Gates
nativos usan `--workspace` e incluyen admin. Reproducción Mac en
`~/evidence/1636-r2/`; Docker siempre bajo `~/orq/docker.lock`, jobs Rust 4 y
target aislado `~/target-1636`. No hay compilación ni llamada SaaS en el servidor PC.

Las firmas inválidas no acceden a SQL ni gastan capacidad de baja de enlaces legítimos.

El Owner conserva errores explícitos en su ruta autenticada de borrado de espera.


## R3 · Borrados fallidos y procedimiento manual

Tras ocho intentos fallidos, un lease final vencido o 24 h desde el encolado, el
trabajo pasa a `failed`, deja de reintentarse y elimina `email`. Se conservan
recibo UUID, intentos, fecha, motivo, HTTP y huella SHA-256 normalizada, sin correo
en claro. La huella sigue siendo dato seudónimo privado, cerrado por RLS/ACL; no
se entrega al cliente. Impide volver a sincronizar esa dirección antes de resolver
la obligación. Éxito automático o manual elimina también la huella. Un estado
fallido **no significa que el contacto esté borrado de Brevo**.

Owner ve aviso «borrados fallidos» y los primeros 20 recibos, motivo/intentos/HTTP;
el total incluye todos. «Reintentar» solo drena pendientes, no reabre fallidos.
El monitor autorizado debe alertar si `mail_list.cleanup.failed > 0` o si la
invocación periódica falla. Aquí no se instala monitor ni scheduler.

Retención: la llamada periódica de `mail-cleanup` debe mantenerse aunque falle
Brevo o se apaguen campañas. Su primer paso es `mail_erasure_expire`, antes de
mirar clave/flag Brevo; también se ejecuta en cada claim y lectura Owner. Con
limpieza deshabilitada/sin clave devuelve 503 **después** de purgar por edad. Se
puede programar directamente la RPC solo-servidor `mail_erasure_expire` cada
minuto, independiente del worker HTTP. El límite de 24 h se evalúa en cada tick;
un scheduler detenido retrasaría la purga: verificarlo y alertarlo antes de
producción. La migración ya purga trabajos antiguos al aplicarse.

Procedimiento manual (operador autorizado, nunca un cliente/anon):

1. Anotar el recibo fallido sin copiar direcciones a issue/chat/log. Corregir la
   configuración de Brevo en el almacén seguro y comprobar el resultado con un
   contacto de sandbox autorizado.
2. Recuperar la dirección desde la solicitud de borrado verificada y compararla
   con la huella privada del recibo en una sesión restringida. Si falta la
   solicitud original, una exportación autorizada de Brevo permite comparar la
   SHA-256 de cada dirección normalizada con la huella, solo en memoria, sin
   guardar/publicar exportaciones. No intentar invertir la huella ni adivinar
   direcciones. Mantener la obligación abierta si no hay identificación fiable.
3. Eliminar el contacto identificado en el panel/API autorizado de Brevo.
   Confirmar ausencia (204/404 o comprobación del panel) y conservar un recibo
   de proveedor sin dirección. Revisar la causa común de todos los fallidos.
4. Solo después, una operación administrativa de base de datos en transacción,
   con `pg_advisory_xact_lock(1636,300)`, puede cambiar **ese UUID** de `failed` a
   `completed`, `outcome=manual_deleted` o `manual_absent`, `completed_at=clock_timestamp()`
   y `email_fingerprint=null`. Registrar actor, UUID y resultado en `mail_audit`,
   nunca correo ni texto libre del proveedor. No hay botón ni RPC pública que
   permita afirmar manualmente el borrado. Sin ACK humano verificado permanece
   fallido y bloquea nuevas altas de esa dirección.
5. Releer el panel y comprobar que el contador baja y que el proveedor continúa
   sin el contacto. No hacer un reset masivo de estados ni reintroducir PII.
