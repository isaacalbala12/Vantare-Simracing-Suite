# Bot de calendario LMU desde Discord

El lector está separado de Vantare Desktop y tiene un alcance deliberadamente
pequeño:

```text
Discord (un canal) → guild/canal exactos (autor/webhook opcional) → parser LMU
→ calendar-discord-inbox.json → Ajustes > Calendario LMU (owner)
→ guardar borrador → revisar → publicar
```

El proceso nunca publica por sí mismo y el token de Discord no entra en la
app de escritorio ni en el frontend. El calendario publicado sigue usando los
RPC existentes de Supabase, por lo que los demás clientes lo reciben al
refrescar.

## Configuración

Crear un bot en Discord y darle únicamente `View Channel` y
`Read Message History` en el canal de origen. Activar `Message Content Intent`
si el horario llega como contenido o embed; Discord puede entregar esos campos
vacíos sin ese intent.

El bot siempre queda limitado al `guild` y al canal configurados. Para el caso
normal de este proyecto, el canal recibe un crosspost del anuncio oficial de
LMU y esa pareja servidor/canal es suficiente; no hace falta conocer ni
configurar el ID de un usuario del servidor oficial. El lector no necesita
estar instalado en el servidor oficial, solo tener acceso de lectura al canal
de destino.

Guardar el token una sola vez en el almacén protegido de credenciales de
Windows. La entrada se hace localmente y no se guarda en el repositorio, un
archivo de configuración ni los argumentos de la tarea:

```powershell
$secureToken = Read-Host "Pega el token del bot (entrada oculta)" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $tokenPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  $tokenPlain | go run .\cmd\lmu-calendar-bot --configure-token
} finally {
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable tokenPlain, secureToken -ErrorAction SilentlyContinue
}
```

Después, configura solo los valores no sensibles:

```powershell
$env:VANTARE_DISCORD_GUILD_ID = "<guild-id>"
$env:VANTARE_DISCORD_CHANNEL_ID = "<channel-id>"
# Opcionales: solo si ese canal mezcla varias fuentes y quieres filtrar más.
# $env:VANTARE_DISCORD_AUTHOR_IDS = "<official-author-id>"
# $env:VANTARE_DISCORD_WEBHOOK_IDS = "<official-webhook-id>"
$env:VANTARE_CALENDAR_INBOX = "<la-misma-ruta-que-la-configuracion-de-Vantare>\calendar-discord-inbox.json"
go run ./cmd/lmu-calendar-bot --once
```

`--once` verifica el canal, consulta los mensajes nuevos una vez, actualiza la
bandeja y termina. Es el modo recomendado para programarlo una vez al día con
el Programador de tareas de Windows. El Programador debe ejecutar la tarea con
la misma cuenta de Windows que guardó el token. Sin `--once`, el proceso
permanece activo y usa `VANTARE_DISCORD_POLL_INTERVAL` entre consultas.

La ruta que usa Desktop es `cfgDir/calendar-discord-inbox.json`: en desarrollo
normalmente es `vantare-v2/configs/calendar-discord-inbox.json`; en una
instalación es la carpeta de configuración de Vantare que aparece en
Diagnóstico. Si el bot usa otra ruta, la bandeja no aparecerá en Desktop.

Con los valores de este servidor:

```powershell
$env:VANTARE_DISCORD_GUILD_ID = "731597245992009768"
$env:VANTARE_DISCORD_CHANNEL_ID = "1529245213598552134"
```

## Revisión owner

En Ajustes aparece la sección `Calendario LMU` únicamente para el rol owner.
Se puede seleccionar un candidato, revisar su fuente en solo lectura, comprobar
fecha, número de series y cambios respecto al calendario cargado, y guardar un
borrador. El botón final es una acción explícita: publicar sustituye el
calendario oficial central y el backend vuelve a comprobar el rol owner.

El lector usa la API REST de Discord para consultar mensajes nuevos, persiste
un cursor y deduplica por `messageId` y por hash del texto. La bandeja local
conserva como máximo los 32 candidatos más recientes para evitar crecimiento
indefinido. Si el mensaje no coincide con la allowlist o no
contiene el encabezado oficial, se ignora.

Referencias oficiales: [permisos de lectura de mensajes](https://docs.discord.com/developers/resources/message), [Message Content Intent](https://docs.discord.com/developers/events/gateway) y [permisos de servidor y canal](https://docs.discord.com/developers/platform/server-and-channel-management).
