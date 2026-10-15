# Vigilante de Plane — ISA-1647 / 1647b

`vantare-plane-para-claude.timer` ejecuta el sondeo cada 60 s como root en
`vantare-svc`. Se instalan juntos `vantare-plane-para-claude.py` y
`plane_notify_workers.py` en `/usr/local/sbin`. El instalador copia ambos.
No hay Rust, dependencias nuevas ni cambios en el esquema o código de Plane.

## Destinos y autores

- **Isaac → orquestador T3**: Para Claude (incluida creación directa), Entregado,
  Cancelado, devolución de Por testear a En curso y comentarios nuevos. Payload
  compatible `{tarea,nombre,id,evento,estado_anterior,estado_nuevo,autor,comentario}`;
  comentario plano de hasta 1500 caracteres. Se exige UUID/email de Isaac y
  `is_bot=false`, también para los estados. Se excluyen comentarios firmados
  `[orquestador]` y los vinculados por ID exacto a un POST de API. La espera de
  dos minutos permite que llegue el registro asíncrono de API.
- **Workers Bot → Plane y ntfy**: usuario `workers-bot@vantare.local` con
  `is_bot=true`, solo proyecto VANTA; creación de tarea, cambio de estado,
  comentario creado y descripción actualizada. Nunca se envían a T3. Cada
  actividad llama a la función propia de Plane dentro de su contenedor API.
  Los tipos son `comment.activity.created`, `issue.activity.created` e
  `issue.activity.updated` (estado y descripción), como en las vistas web.
- ntfy recibe **un POST por tarea y pasada**, agrupando las actividades pendientes.
  Título `VANTA-N · nombre`; texto español sin HTML ni prefijo, máximo 300
  caracteres repartidos entre los cambios. Click abre la tarea. Prioridad alta
  cuando el grupo contiene entrada en Por revisar o Por testear; normal en otro
  caso. Los comentarios de Isaac nunca se envían a ntfy.

La consulta del historial sigue usando `default_transaction_read_only=on`.
El helper de notificaciones sí escribe la campana y los efectos propios de
`notifications` (menciones/suscripciones/logs de email según preferencias),
pero no modifica las tareas ni crea otra actividad de historial.
Plane instalado omite expresamente las campanas de descripción sin mención:
el helper llama primero a `notifications` y completa solo ese caso para los
suscriptores activos, conservando `field=description` y el ID original.
Si Plane reutiliza un ID de descripción y actualiza su `created_at`, la fecha
forma parte de la identidad local para detectar esa revisión.

## Secretos

La URL T3 permanece en `/etc/vantare/para-claude.url` (root:600).
ntfy lee su tema del archivo ya provisionado
`C:\VantareServer\secrets\ntfy-topic`, accesible desde la distro.
No imprimir ni copiar sus contenidos, tokens, cabeceras de API o URLs privadas
a logs, buzones, backups ni informes. Los errores solo muestran su clase.
El token de la CLI normal pertenece ahora a Workers Bot; no se rota aquí.

## Estado y reintentos

`/var/lib/vantare/para-claude.json` conserva el formato v2 y añade
`workers_observed` y `workers_pending`. Cada actividad del bot tiene confirmación
independiente de Plane y ntfy; el fallo de uno no repite el otro. Se agrupan
solo las entregas ntfy todavía pendientes, incluidas las de un intento previo.
Cola guardada atómicamente antes de enviar; acuse guardado después de cada éxito.
Un lock serializa pasadas manuales y las del timer. Los IDs de tareas ocultas
se recuerdan para no reproducir el historial al restaurarlas.

1647c/P3-8: los cuerpos de `api_activity_logs` se decodifican individualmente
en Python; vacío, no JSON u objeto inválido se omite y registra solo ID/clase.
No se imprime su contenido ni se abortan las otras actividades.
1647c/P3-9: `last_scan` guarda el inicio de la consulta confirmada, con solape
de cinco minutos para comentarios en espera y transacciones tardías. La primera
lectura y la recuperación tras una parada consultan como máximo 30 días; cada
fuente SQL y los logs API llevan límite temporal. Se podan IDs y fechas de
eventos anteriores a 30 días; los IDs legados migran sin reavisar y caducan en
30 días como máximo. Se conservan siempre las colas sin confirmar y sus IDs.
Límite explícito: una transacción que confirme más de cinco minutos tarde o una
parada superior a 30 días puede dejar eventos fuera; revisar manualmente esos
incidentes. No se promete recuperar indefinidamente todo el historial.

La migración desde v2 siembra **solo los IDs antiguos del bot**, conservando
observados y pendientes T3. Primera instalación/migración v1 también sin avisos
históricos. `--seed` descarta todas las colas: no usar en una actualización normal.
`--dry-run` no envía, no lee secretos ni guarda; muestra cantidades del bot.

La notificación de Plane se ejecuta en una transacción con lock de actividad;
comprueba la campana de cada suscriptor. Los errores que Plane captura y escribe
se convierten en rollback/reintento sin filtrar ese mensaje. La campana
se reintenta como máximo tres veces por actividad (contador persistido). Al
tercer fallo se registra `campana abandonada` con ID y clase del error, se deja
de intentar ese destino y ntfy sigue independiente. Revisar ese registro para
una actuación manual: abandonar no acredita que se haya recibido la campana.
Una campana existente
por ID de actividad (y revisión en descripción) evita repetirla si se pierde el
acuse de Docker. T3 y ntfy llevan clave estable de idempotencia. Los HTTP 2xx
confirmados no se repiten; **si el servidor acepta y se pierde la respuesta,
ntfy puede duplicarse**, ya que no hay transacción conjunta con el servicio
externo ni garantía acreditada de deduplicación de ese receptor.
El sondeo no puede recuperar revisiones intermedias que Plane haya fusionado
antes de la siguiente pasada; sí detecta la fecha de revisión visible.

## Validación y despliegue

Desde raíz Git, sin red ni BD real en los tests:

```powershell
python -B -m unittest discover -s tools/server/linux -p 'test_*.py' -v
python -B -m unittest discover -s tools/plane -v
```

El corte 1647b tenía 47 tests únicos de vigilante/helper y 10 de CLI PASS.
Cubren cuatro tipos, agrupado, deduplicado, migración, reintento independiente,
rutas Isaac/bot, texto y prioridad, errores internos de Plane y rollback simulado.

Seguridad 1647c (P2-1): se revocó el permiso explícito Modify de `vantare-svc`
en los tres scripts de `ops/linux` y en **todos** los archivos del backup 1647b.
Propietario: Administrators; escritura: solo Administrators y SYSTEM; svc: RX.
El backup tiene herencia cortada y ACL propia (sin heredar Modify de `backups`).
No volver a conceder escritura a svc para instalar o restaurar scripts root.
Evidencia antes/después: `C:\VantareServer\evidence\1647c\acl-*-before.txt`
y `acl-*-after.txt`. Durante la retirada hubo una denegación temporal al cortar
herencia; se recuperó propietario Administrators y se verificaron todos los hijos.
`icacls C:\VantareServer\ops\linux /T` e
`icacls C:\VantareServer\backups\vigilante-plane\1647b-20261015 /T`
deben mostrar RX para svc y ninguna ACE de escritura fuera de Administrators/SYSTEM.
Se guardó `SHA256SUMS` del backup tras revocar escritura: acredita integridad
desde ese momento, no demuestra retrospectivamente su contenido anterior.

`linux/vigilante.sha256` fija el SHA-256 de instalador y ambos scripts.
El administrador copia desde el checkout revisado a ops (sin conversión de
saltos de línea), comprueba sus hashes y protege también el manifiesto con esas ACL.
Como root de svc, **antes de ejecutar el instalador**:

```bash
cd /mnt/c/VantareServer/ops/linux
sha256sum --check --strict vigilante.sha256 && bash ./install-para-claude.sh "$PWD/vigilante.sha256"
```

El instalador exige manifiesto y verifica otra vez una copia temporal privada
antes de instalar root:750. Un hash distinto aborta sin copiar a `/usr/local/sbin`.
Verificar con `stat -c '%U:%G %a %n'` los scripts instalados y directorios
`/etc/vantare`, `/var/lib/vantare`, y con `find` sus hijos: dueño root,
sin escritura de grupo/otros. No mostrar contenidos de secretos.

1647c/P3-10: las piezas reproducibles están ahora en el repo:
`windows/Invoke-WorkersPlaneAsSvc.ps1`, `windows/Deploy-Vigilante.ps1` y
`linux/deploy-vigilante.sh`. Ya no se necesita el script privado
`ops/run/isa-1647b-system.ps1`. Desde PowerShell administrador, en la raíz del
worktree revisado, copiar sin transformar bytes:

```powershell
'install-para-claude.sh','vantare-plane-para-claude.py','plane_notify_workers.py','vigilante.sha256','deploy-vigilante.sh' | ForEach-Object {
  Copy-Item "tools/server/linux/$_" C:\VantareServer\ops\linux\ -Force
}
Copy-Item tools/server/windows/Deploy-Vigilante.ps1 C:\VantareServer\ops\linux\ -Force
Copy-Item tools/server/windows/Invoke-WorkersPlaneAsSvc.ps1 C:\VantareServer\ops\run\ -Force
$action = New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\VantareServer\ops\run\Invoke-WorkersPlaneAsSvc.ps1 -Script C:\VantareServer\ops\linux\Deploy-Vigilante.ps1 -LaunchLog C:\VantareServer\ops\as\vantare-svc\deploy-vigilante.out'
Register-ScheduledTask -TaskName Deploy-Vigilante -TaskPath '\Vantare\' -Action $action -User SYSTEM -RunLevel Highest -Force
Start-ScheduledTask -TaskName Deploy-Vigilante -TaskPath '\Vantare\'
```

Antes de iniciar, comparar SHA-256 de cada copia con el checkout revisado
(`Get-FileHash`), incluido el lanzador; verificar ACL con `icacls` como arriba.
La tarea necesita una distro svc ya en marcha; el helper solo reutiliza ese
proceso de la cuenta, no solicita ni distribuye su contraseña. Crea el hijo
sin ventana. La tarea finaliza al lanzarlo: esperar `DEPLOY_DONE` en el archivo
de salida; su LastTaskResult por sí solo no prueba el despliegue.
El script guarda scripts/unidades/estado, sin secretos, bajo
`/var/backups/vigilante/1647c-<UTC>` (root:700), con `SHA256SUMS`.
Exige dry-run con ambas colas a cero antes de reanudar. Si falla instalación o
dry-run, restaura el backup y el timer; no vacía colas ni envía pruebas.
Después verificar el resultado de la siguiente pasada y borrar la tarea
temporal con `Unregister-ScheduledTask -TaskPath '\Vantare\' -TaskName Deploy-Vigilante -Confirm:$false`.

Procedimiento: validar tests y SQL; parar timer/servicio; guardar scripts y estado;
instalar ambos scripts root:750 y sus copias ops; migrar sin `--seed`; dry-run
limpio; arrancar timer y comprobar enabled/active, intervalo y resultado del servicio.
Backup de esta ampliación: `C:\VantareServer\backups\vigilante-plane\1647b-20261015\`.
Conserva script anterior, estado y copias ops; marcadores `.absent` para ficheros
que no existían. No contiene secretos. El backup histórico 1647 sigue intacto.

Prueba real autorizada, **una sola ejecución**, desde el worktree:

```powershell
python tools/plane/plane-estado.py VANTA-73 "Por testear" --comentario "Prueba de avisos: campana de Plane y ntfy"
```

La prueba creó un comentario (no se repitió), y ntfy devolvió HTTP 200.
La primera campana falló por un UUID conservado en un campo calculado DRF:
se normaliza a JSON y se añade regresión. Se actualizó solo el helper y
se reintentó la cola existente; ntfy ya confirmado no se reenvía.
Verificación final: 1 comentario, 1 campana para Isaac y 1 POST ntfy HTTP 200;
otra pasada mantuvo el contador 1 → 1. Colas 0/0, 424 IDs observados y 17 del
bot; timer enabled/active, servicio Result=success / ExecMainStatus=0.

No repetirla al verificar. Consultar en BD las notificaciones de Isaac enlazadas
al ID exacto de la nueva actividad y comprobar en journal `ntfy enviado VANTA-73`
con HTTP 2xx. Una nueva pasada debe quedar sin pendientes ni repetir el aviso.
La API de esta versión deja nula la relación issue_comment en el historial;
para verificar, cruzar actor, tarea y HTML exacto y usar el UUID de actividad,
no exigir esa relación. Actividad de prueba: 82f857ba-18cf-4b2f-bf23-66a66a6782f8.
Máximo dos avisos de prueba; esta ampliación usa solo el comentario indicado.

## Deshacer esta ampliación

Parar timer/servicio como root de vantare-svc. Restaurar desde el backup 1647b
el script anterior a `/usr/local/sbin/vantare-plane-para-claude.py` (root:750)
y `para-claude.json` a `/var/lib/vantare/para-claude.json` (root:600).
Retirar únicamente el helper si su marcador `.absent` acredita que no existía.
Restaurar también `ops-vantare-plane-para-claude.py` y el instalador ops.
Antes de restaurar, `cd` al backup y `sha256sum --check --strict SHA256SUMS`;
abortar ante cualquier discrepancia. El administrador restaura ops desde Windows:
svc no tiene escritura. Conservar la revocación de Modify también al deshacer;
repetir `icacls /T` en ops/linux y backup, propietario Administrators, svc RX,
solo Administrators/SYSTEM escriben. Verificar root:750 en scripts y root:600
en estado, sin archivos escribibles por grupo/otros bajo los directorios indicados.
Arrancar el timer y verificar enabled/active y dry-run. No tocar secretos.
Las campanas y el comentario de prueba ya publicados permanecen; no se borran.
Restaurar estado antiguo puede reproducir actividad posterior en la ruta T3:
revisar el dry-run antes de reanudar. Revertir código por PR; sin merge ni promoción
por el worker. La reversión histórica a antes de #1647 usa su backup separado.
