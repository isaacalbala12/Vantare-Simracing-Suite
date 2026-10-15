# Correos de marketing · #1636 / VANTA-72

Candidato local desde la miniapp #1627 (`0ac70754`). No desplegado, sin cuentas,
claves, mensajes reales ni gasto. Los flags de envío e IA están apagados por
omisión. El orquestador gestiona Plane/GitHub; este worker entrega al bare del Mac.

## Uso por Isaac

1. Correos → Nueva campaña. Elegir Novedades, Oferta o Lanzamiento. Las plantillas
   ofrecen estructura en ES de España, EN, IT y PT-BR de Brasil. Sustituir
   `{{contenido}}` en los cuatro textos; SQL impide confirmar ese marcador.
2. Editar cada idioma y ver su vista previa de texto seguro. El cuerpo admite
   texto plano, saltos de línea y URLs visibles; no HTML ni adjuntos. La vista
   nativa muestra ese texto y pie; no es una captura de Gmail/Outlook.
3. Opcional: escribir un brief sin datos personales y confirmar «Redactar».
   El servidor solicita `claude-opus-5-5`, `thinking: adaptive`,
   `output_config.effort: high`; devuelve cuatro borradores, no los guarda ni
   aprueba. Si el modelo no está disponible, muestra error, sin sustituirlo.
4. Revisar los cuatro idiomas, guardar y elegir grupo. Los recuentos incluyen
   solo personas con consentimiento vigente. Una misma persona puede ser tester,
   creadora y tener plan; dentro de una campaña recibe como máximo un mensaje,
   en su idioma. Launch sin Pro no se clasifica como Gratis.
5. «Enviar…» pide confirmación del Owner sobre la revisión guardada y congela
   texto/grupo/destinatarios. «Enviar siguiente tanda» confirma hasta tres
   correos; repetir para continuar. No hay cron ni envío oculto en segundo plano.
   El proceso se puede retomar desde otro equipo con sesión Owner.
6. Una reserva consume cuota antes del HTTP, también si se pierde la respuesta.
   Máximo 300 en una ventana móvil de 24 horas, compartidos por todas las campañas
   y entornos del proyecto. Volver otro día cuando se agote. No se acumula cuota.
   Debe usarse una cuenta Brevo dedicada: otros mensajes fuera de este registro
   también consumen la cuota del proveedor, que puede rechazar antes el envío.
7. Historial distingue aceptado por Brevo de entrega efectiva. `uncertain` o
   `dispatching` requiere revisión manual y no se reintenta. No crear una campaña
   duplicada para resolver una respuesta perdida sin comprobar el registro.

## Consentimiento, grupos y bajas

`private.mail_contacts` es la fuente única de consentimiento de novedades y
ofertas, separada del permiso de analítica. Vacía al migrar: no se importa permiso
por pertenecer a un plan o por tener un correo en Clerk. El Owner no puede dar
consentimiento a otras personas ni pasar destinatarios arbitrarios.

El colector de registro/cuenta/lista de espera, en servidor, llama a
`mail_record_consent(p_account,p_email,p_locale,p_consent,p_evidence,p_waitlist)`
solo después de verificar la dirección y el gesto explícito de la persona.
`p_evidence` identifica la versión del formulario/gesto (sin PII, IP ni texto libre).
Cuenta verificada: UUID interno, nunca ID Clerk. Lista de espera: UUID nulo y
`p_waitlist=true`, únicamente tras verificación del correo. Idiomas exactos
`es|en|it|pt-BR`. No hay importación automática, ni RPC accesible al cliente para
concederse permiso con una dirección ajena. Integrar esos colectores en las
superficies de registro/cuenta/espera antes de habilitar producción; este encargo
no cambia esas pantallas ni presupone un consentimiento histórico.

Grupos desde derechos efectivos (incluidos bloqueos de reembolsos), roles
operativos vigentes, creadores activos y origen de espera; excluye cuentas
bloqueadas/borradas. Revalida grupo y consentimiento al reservar y justo antes del
HTTP. Una baja posterior a transmitir la petición no puede retirar un mensaje ya
en vuelo. Una nueva alta explícita no resucita destinatarios omitidos de campañas
antiguas. Una cuenta borrada pierde contacto y filas con dirección; la reserva
anónima de cuota se conserva. Completar también el borrado en Brevo según su
procedimiento de privacidad antes de considerar cerrado un borrado externo.

Cada correo incluye enlace propio firmado HMAC-SHA256 y cabeceras
`List-Unsubscribe` / `List-Unsubscribe-Post`. GET y POST retiran todo el permiso
sin login, formulario ni segunda confirmación. Enlaces sin caducidad: conservar
la clave estable en el almacén de secretos y su copia de seguridad; una rotación
necesitará transición para no invalidar enlaces históricos. No registrar query
strings de esta ruta. Webhook Brevo con cabecera secreta, verificada antes de
leer el evento, trata baja/spam/rebote permanente/bloqueo como retirada global.
Duplicados son seguros. Un error SQL devuelve 503 para permitir retry del webhook.

«Sincronizar contactos» recorre páginas de cinco: repetir hasta fin, empieza
por el cursor conservado en memoria y vuelve a empezar tras cerrar sesión.
Actualiza listas, retira membresías antiguas y bloquea contactos sin permiso.
No envía. La baja local es inmediata; el espejo Brevo se actualiza en la siguiente
sincronización Owner. No usar el panel Brevo para eludir el consentimiento SQL.

## Configuración futura de Brevo y Anthropic (Isaac)

1. Crear una cuenta Brevo gratuita dedicada en su [web oficial](https://www.brevo.com/).
   Revisar condiciones, DPA/subencargados y límite en el panel; no contratar extras.
2. Añadir dominio remitente, publicar los registros DNS de autenticación que
   indique Brevo y verificarlo; configurar DMARC y un remitente del mismo dominio.
   [Ayuda de autenticación](https://help.brevo.com/hc/en-us/articles/12163873383186).
3. Crear siete listas: Gratis, Pro, Pro Plus, Launch Edition, Testers, Creadores,
   Espera. Guardar IDs en el mapa del servidor. La sincronización usa
   [crear contacto](https://developers.brevo.com/reference/create-contact) y
   [actualizar contacto](https://developers.brevo.com/reference/update-contact).
4. Crear clave API Brevo y guardarla en los secretos de Edge, nunca en la app,
   repo, chat, URL, log o argumentos visibles. Añadir clave Anthropic de un
   proyecto autorizado solo cuando Isaac autorice el gasto y el modelo.
5. Variables de servidor (solo nombres; sin valores en este documento):

   - `BREVO_API_KEY`, `BREVO_MARKETING_SENDER` (correo remitente).
   - `BREVO_MARKETING_LISTS`: objeto JSON con claves exactas
     `free,pro,pro_plus,launch,testers,creators,waitlist`, siete IDs positivos distintos.
   - `MARKETING_UNSUBSCRIBE_URL`: URL HTTPS exacta del endpoint `mail-unsubscribe`,
     sin query, fragmento, credenciales ni redirecciones.
   - `MARKETING_UNSUBSCRIBE_KEY`, `BREVO_WEBHOOK_KEY`: secretos aleatorios distintos,
     de al menos 32 caracteres. No se generan ni configuran en esta entrega.
   - `ANTHROPIC_API_KEY`; `MARKETING_SEND_ENABLED`, `MARKETING_AI_ENABLED`,
     solo `true` habilita su operación. Mantener ausentes/apagados hasta revisión.
   - OAuth/Owner, Supabase y entorno reutilizan configuración de `native-admin`.

6. Tras aprobación de despliegue, desplegar las dos rutas de baja y el handler
   actualizado sin añadirlos a un despliegue global por glob. `verify_jwt=false`
   solo delega a la autenticación propia; no sustituye la verificación del handler.
   [Secretos Edge](https://supabase.com/docs/guides/functions/secrets).
7. En Brevo crear webhook HTTPS (eventos del canal utilizado, incluidos
   `unsubscribe|unsubscribed`, spam, hard_bounce y blocked), URL `mail-webhook` y
   cabecera personalizada `X-Vantare-Webhook-Key` con el secreto del servidor.
   Nunca incluirlo en query. Probar primero con dobles locales.
8. Antes de activar, comprobar con aprobación aparte dominio, entregabilidad,
   baja visible y de cabecera en un mensaje dirigido exclusivamente al Owner,
   validez del modelo y coste, y traducciones. Esta entrega no hace esa prueba.

Las campañas viven en Vantare y las listas son un espejo. El envío individual
usa [SMTP API](https://developers.brevo.com/reference/send-transac-email), con
contenido de marketing y pie propio, para reservar/revalidar cada destinatario;
no se crean campañas paralelas en el panel Brevo. No se usa Brevo como origen de
consentimiento ni se declara que «aceptado» significa «entregado».

## Contrato y verificación local

`native-admin`, v1, JSON cerrado: `mail_list`, `mail_new`, `mail_get(campaign_id)`,
`mail_save(campaign_id,revision,name,template,target_group,content)`,
`mail_draft(campaign_id,revision,brief,template)`,
`mail_approve(campaign_id,revision,confirm:true)`,
`mail_send_batch(campaign_id,revision)`, `mail_sync(cursor?)`.
Owner OAuth + cuenta Clerk habilitada + presupuesto de 60 pet/min + comprobación
Owner dentro de cada RPC. Acciones internas claim/finish/can_send no son públicas.
Cuerpos mail ≤128 KiB; acciones antiguas conservan ≤8 KiB. Cliente mail timeout
65 s (IA ≤55 s, proveedor ≤4 s por HTTP), sin retry ni redirects.
Auditoría append-only sin direcciones, texto ni tokens; historia UI muestra
hasta cien entregas y totales de toda la campaña. Lista hasta cien campañas.

Desde `supabase/functions/`, con caché ya instalada:

```sh
deno test --node-modules-dir=auto --cached-only --frozen --allow-env native-admin/index.test.ts native-admin/mail.test.ts
```

SQL: `supabase/tests/marketing_mail.test.sql`, ejecutado por
`run-admin-local.py --test marketing_mail.test.sql --output <evidencia>` bajo el
lock Docker del encargo, contenedor aislado `--network none`. No usar un proyecto
remoto para ejecutar fixtures. UI: `--demo --screen mail`, escenas
`mail-editor`, `mail-confirm`, `mail-history`, datos falsos y cero red.
