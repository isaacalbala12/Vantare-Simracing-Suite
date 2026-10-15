# Vigilante de Plane — ISA-1647

Sigue llamándose `vantare-plane-para-claude.timer`: sondeo cada 60 s como root
en `vantare-svc`. Solo ejecuta SELECT con `default_transaction_read_only=on`.
La URL se lee de `/etc/vantare/para-claude.url` (root:600); nunca se imprime,
se copia al informe ni se incluye en los backups de esta entrega.

## Eventos y datos

Conserva `tarea`, `nombre`, `id`; añade `evento`, `estado_anterior`,
`estado_nuevo`, `autor` (nombre visible) y `comentario` (texto plano, 1500
caracteres como máximo). Mantiene `User-Agent: vantare-plane-para-claude/1`.

- `para_claude`: entra en Para Claude, incluida la creación directa allí.
- `entregado`: entra en Entregado.
- `cancelado`: entra en Cancelado.
- `devuelta`: pasa de Por testear a En curso.
- `comentario`: comentario nuevo de Isaac. Una edición o cambio de descripción
  no genera otro aviso. Los dos estados son el estado de la tarea al consultar;
  para una creación el estado anterior es `null`. Otros eventos llevan texto vacío.

Se leen los IDs de `issue_activities` y `issue_comments` en una sola instantánea.
Así no se pierden varias transiciones entre sondeos ni transacciones que confirman
tarde. No se usa un cursor temporal que pueda saltárselas. No se envían avisos de tareas
borradas, archivadas ni borradores. Sus IDs se recuerdan también, para no
reproducir su historial si se restauran o desarchivan. Los IDs observados crecen con el
historial de VANTA; no hay borrado ni modificación de datos de Plane.

## Cómo distingue a Isaac

Verificado el 15/10/2026: Isaac es `19bf758e-4733-42ef-9f29-dd418b0628ee`,
`isaacalbala12@gmail.com`. El bot es otro usuario, `workers-bot@vantare.local`,
con `is_bot=true`. **El token actual de Administrator pertenece a Isaac**, no al
bot: filtrar solo por email daría falsos avisos.

Se exige el UUID y el email de Isaac y se excluyen bots, comentarios con prefijo
`[orquestador]` y los vinculados a un POST de API en `api_activity_logs` por el
ID exacto del comentario devuelto. No se leen tokens, cabeceras ni cuerpos de
peticiones. La prueba real de lectura encontró todos los comentarios existentes
vinculados a API. El registro API es asíncrono: los comentarios sin firma esperan
2 minutos y se vuelven a consultar antes de clasificarlos.

`tools/plane/plane-estado.py` firma ahora sus comentarios con `[orquestador] `,
incluso si usa el token de Isaac. Esta rama apilada no tenía esa herramienta:
se incorpora la versión de `origin/nightly` con su test y solo ese cambio de
comportamiento. Usar la versión firmada de esta rama (o la copia operativa
`C:\VantareServer\ops\plane\plane-estado.py`) hasta integrar la PR. No se
modifica el checkout de integración ni se rotan credenciales. Los clientes API
antiguos sin firma dependen de que el registro API llegue en esos dos minutos;
si la cola de Plane se retrasa más, pueden parecer comentarios manuales.

## Cola, errores y límites

`/var/lib/vantare/para-claude.json` v2 guarda IDs observados y avisos pendientes.
Primero persiste la cola con reemplazo atómico; después envía. Cada 2xx se
confirma en disco. Un fallo se reintenta en la siguiente pasada, aunque la tarea
o el comentario ya no aparezcan en la consulta. Un lock evita pasadas simultáneas.

Se añade `Idempotency-Key` estable con el ID de origen. No se repiten eventos
confirmados. Si el receptor acepta un POST y se pierde su respuesta, la entrega
es al menos una vez: evitar el duplicado en ese caso exige que el receptor
respete esa clave. No se sigue una redirección HTTP ni se imprime el error con
su URL. Un estado corrupto falla; no se reinicia silenciosamente.

La primera ejecución, la migración desde v1 (lista de tareas) y `--seed` guardan
los IDs actuales sin avisar de lo antiguo, incluidos comentarios todavía recientes.
`--seed` descarta expresamente la cola: usar solo al instalar/restaurar, con copia.
`--dry-run` muestra los payloads pendientes, sin enviar, leer la URL ni guardar.

## Pruebas y despliegue

Desde la raíz Git, sin red ni BD:

```powershell
python -B -m unittest discover -s tools/server/linux -p 'test_*.py' -v
python -B -m unittest discover -s tools/plane -v
```

Comparar primero repo, `C:\VantareServer\ops\linux\vantare-plane-para-claude.py`
y `/usr/local/sbin/vantare-plane-para-claude.py`. En esta entrega eran iguales
salvo finales de línea (la instalada y ops coincidían byte a byte). No había una
variante desplegada más nueva que recuperar.

Como root en vantare-svc, parar timer y servicio; guardar script y estado, instalar
el script nuevo root:750, ejecutar `--seed`, `--dry-run` (0 pendientes) y arrancar
el timer. El secreto permanece root:600. Desde Windows se usa
`ops/run/Invoke-WorkersPlaneAsSvc.ps1`, lanzado como SYSTEM, con salida separada.
Esta entrega guardó la copia Windows en
`C:\VantareServer\backups\vigilante-plane\1647-20261015-174741\` y las
copias Linux en `/var/lib/vantare/vigilante-backup-1647/`.

La prueba autorizada hace **un solo POST**, sin cambiar nada de Plane: evento
`comentario`, tarea `PRUEBA-vigilante`, comentario `prueba de avisos ampliados`.
Se obtuvo HTTP 202; un marcador impide repetirla por accidente. La siembra
registró 382 IDs. Tras incluir los IDs de tareas ocultas: 397 observados
(15 ocultos) y 0 pendientes, sin resembra ni otro POST de prueba; timer enabled/active.
Pruebas: 27 del vigilante + 10 de CLI, PASS en Windows y Linux.
No hay compilación Rust ni cambios de esquema, dependencias, red o credenciales.

## Deshacer

Como root en vantare-svc:

```sh
systemctl stop vantare-plane-para-claude.timer vantare-plane-para-claude.service
install -o root -g root -m 750 /var/lib/vantare/vigilante-backup-1647/vantare-plane-para-claude.py /usr/local/sbin/vantare-plane-para-claude.py
install -o root -g root -m 600 /var/lib/vantare/vigilante-backup-1647/para-claude.json /var/lib/vantare/para-claude.json
systemctl start vantare-plane-para-claude.timer
```

Restaurar también la copia de `ops/linux` desde el backup Windows de #1647.
No restaurar ni tocar la URL. La CLI firmada solo añade una marca visible a sus
comentarios; puede seguir usándose al volver a v1. Revertir el commit por PR si
se desea retirar el código; no fusionar ni promover canales desde el worker.
