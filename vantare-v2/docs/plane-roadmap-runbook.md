# Activar el roadmap de Plane · #1601 / VANTA-10

Preparado, **no ejecutado**. El OK de implementación/PR no autoriza credenciales,
`roadmap.env`, despliegue, timer ni publicación en producción. El worker del
servidor puede crear el token Plane cuando reciba su autorización. Isaac debe
autorizar por separado la primera escritura y la activación periódica.
No hace falta un esquema nuevo ni se ejecuta ninguna migración de #1601.
Los pasos de activación ClickUp de #1582 quedan sustituidos por estos. El
orquestador debe cerrar/sustituir ese PR para que no vuelva a instalar el escritor
ClickUp; no fusionarlo después de #1601 sin reconciliar su contenido.

## 1. Preparar el acceso privado (tras autorización)

En Plane, crear una cuenta/token dedicada con acceso mínimo al proyecto Vantare.
Permisos de lectura de tareas, estados y modules; no usar una sesión del navegador.
Mantener Plane en LAN/Tailscale. La API usada es v1 de Plane CE 1.4.2:
`states/`, `modules/`, `issues/`, `modules/{uuid}/module-issues/`, bajo
`/api/v1/workspaces/{slug}/projects/{uuid}/`.
Ver [rutas de CE 1.4.2](https://github.com/makeplane/plane/blob/v1.4.2/apps/api/plane/api/urls/work_item.py)
y [paginación de modules](https://developers.plane.so/api-reference/module/list-module-work-items).
HTTP solo se admite hacia IP privada/localhost; fuera de la LAN, usar HTTPS.

Isaac fija la contraseña del rol existente `vantare_roadmap_publisher` con
`\password vantare_roadmap_publisher` en una sesión administrativa privada de psql.
Comprobar ACL/memberships: USAGE public y EXECUTE `visual_roadmap_sync(jsonb)`;
sin DML de tablas, superusuario ni service_role. No abrir el gate de identidad nativo.

Preparar localmente `C:\VantareServer\secrets\roadmap.env`, con ACL solo
Administradores + vantare-svc. No leerlo en chat, imprimirlo ni versionarlo.
Formato EnvironmentFile systemd (una variable por línea):

```text
PLANE_URL=http://192.168.1.57:8088
PLANE_WORKSPACE=<slug verificado>
PLANE_PROJECT_ID=<UUID verificado>
PLANE_API_KEY=<token privado>
PGHOST=<host Supabase aprobado>
PGPORT=5432
PGDATABASE=<base aprobada>
PGUSER=<rol dedicado; con project-ref si usa pooler>
PGPASSWORD=<contraseña privada>
ROADMAP_REF=<40 caracteres hex del commit aprobado y accesible remotamente>
```

Fijar un SHA que contenga #1601, nunca `master`/`nightly` como referencia móvil.
Registrar por separado SHA, PR y canal autorizado. Asegurar deploy key de solo
lectura y known_hosts verificado para GitHub; no aceptar claves SSH a ciegas.
Verificar la CA Supabase del repo con el Dashboard antes de conectar.

## 2. Instalar inerte (tras autorización de despliegue)

Abrir una terminal de `vantare-svc` como root. Los comandos siguientes son Linux,
no PowerShell. El repo privado debe estar descargado en `/home/roadmap/repo`,
propiedad de `roadmap:roadmap`, en el SHA aprobado (bootstrap con deploy key).
No activar ni arrancar el publicador al instalar.

```bash
systemctl disable --now vantare-roadmap.timer
systemctl stop vantare-roadmap.service
test -r /mnt/c/VantareServer/secrets/roadmap.env
command -v python3 && command -v node && command -v psql && command -v git
cd /home/roadmap/repo
git rev-parse HEAD  # comparar con el SHA aprobado
chmod 700 tools/server/roadmap/vantare-roadmap-publish.sh
install -m 644 tools/server/roadmap/vantare-roadmap.service /etc/systemd/system/
install -m 644 tools/server/roadmap/vantare-roadmap.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/vantare-roadmap.service /etc/systemd/system/vantare-roadmap.timer
systemctl daemon-reload
systemctl is-active vantare-roadmap.timer  # debe seguir inactive
```

Si `/mnt/c/...` no existe, parar y resolver el montaje/permisos del host bajo
autorización; no copiar secretos a una ruta improvisada. Instalar herramientas
ausentes solo por el worker autorizado del servidor.

## 3. Preparar y revisar sin publicar

En esa terminal root, usar EnvironmentFile sin mostrar sus valores:

```bash
systemd-run --unit=vantare-roadmap-preview --wait --collect --uid=roadmap \
  --property=EnvironmentFile=/mnt/c/VantareServer/secrets/roadmap.env \
  --property=UMask=0077 --working-directory=/home/roadmap/repo \
  /usr/bin/python3 -B vantare-v2/scripts/publish_plane_roadmap.py \
  --output /home/roadmap/roadmap-candidate.json
```

Esto lee Plane; no conecta a Supabase. Revisar privadamente el JSON público:
solo producto, exclusión de Infraestructura/Negocio aun con memberships múltiples,
sin canceladas ni tareas sin module, seis estados mapeados, títulos literales.
Comparar con el tablero Plane. Si supera **40 tareas o 40.000 bytes**, o queda
vacío, **PARAR y preguntar a Isaac**; no truncar ni ampliar contrato/esquema.
Fallo/paginación incompleta no deben reemplazar la publicación anterior.
El programa descarta descripciones, comentarios, usuarios y campos privados.

Antes de autorizar la primera escritura, guardar y verificar un respaldo del
documento actual con una conexión administrativa privada. En psql:

```sql
\pset tuples_only on
\pset format unaligned
SELECT document::text FROM public.visual_roadmap_current_v2()
\g /home/roadmap/roadmap-before-plane.json
```

Proteger ese fichero (0600) y verificar restauración local. Para aprobar el cambio
de IDs ClickUp→Plane si retira ≥50%, cargar el candidato exacto en esa misma sesión
privada. No existe bypass/force del rol publicador. El candidato cambia con el
tablero: detener ediciones durante la aprobación y publicación inicial.

```sql
\set candidate `python3 -c "import json; print(json.dumps(json.load(open('/home/roadmap/roadmap-candidate.json')),ensure_ascii=False))"`
INSERT INTO public.visual_roadmap_sync_approvals(document, expires_at)
VALUES (:'candidate'::jsonb, clock_timestamp() + interval '30 minutes');
```

Ese paso es escritura administrativa en producción y requiere autorización
explícita del documento exacto. No quitar la guarda ni cambiar ACL.

## 4. Primera publicación y timer (cada acción autorizada)

```bash
systemctl start vantare-roadmap.service
systemctl show vantare-roadmap.service -p Result -p ExecMainStatus
journalctl -u vantare-roadmap.service -n 20 --no-pager
```

El servicio prepara el documento de nuevo, valida TLS verify-full y llama solo
`visual_roadmap_sync`. Si falla, parar y revisar privadamente: no repetir con
credenciales administrativas ni debilitar TLS. El log no imprime SQL/respuestas.
Comparar lectura pública en app y web: mismos IDs/nombres/columnas. Repetir sin
cambios debe conservar ID/fecha de publicación; cambiar una tarea de producto
debe reflejarse tras una ejecución y el refresco del lector (hasta ~10 min con
ambos intervalos). Verificar reinicio/offline de la app y recuperación de red.

Solo después de esos checks y del OK de activación:

```bash
systemctl enable --now vantare-roadmap.timer
systemctl list-timers vantare-roadmap.timer --all
```

Un único escritor. Retirar el token ClickUp del servidor y GitHub; los secretos
ROADMAP_PG* de GitHub pueden retirarse una vez confirmada la migración al servidor.
No tocar el historial/lectores v1 de Supabase ni el JSON histórico del Hub.

## 5. Recuperación autorizada

Detener timer y servicio primero. En sesión administrativa privada, cargar el
respaldo verificado y publicar el documento anterior:

```sql
\set previous `python3 -c "import json; print(json.dumps(json.load(open('/home/roadmap/roadmap-before-plane.json')),ensure_ascii=False))"`
SELECT public.visual_roadmap_publish(:'previous'::jsonb);
```

Verificar lectura app/web e ID/fecha nuevos. Mantener timer desactivado hasta
resolver el fallo y obtener autorización. No deshacer esquema, borrar historial
ni reactivar automáticamente ClickUp.

## Web en su propio repositorio

Copiar `scripts/roadmap-web.js` como módulo ES; montar con URL/anon key públicas
del proyecto existente, nunca token Plane ni clave privilegiada:

```js
import { mountRoadmap } from './roadmap-web.js';
const disposeRoadmap = await mountRoadmap(document.querySelector('#roadmap'), {
  supabaseUrl: publicSupabaseUrl, anonKey: publicAnonKey, language: 'es'
});
// Al desmontar la ruta SPA: disposeRoadmap(). pagehide también cancela el lector.
```

El módulo crea Planeado/En marcha/Hecho y refresca cada 300 s, sin solapamiento;
pausa con pestaña oculta, cancela al desmontar y conserva última publicación ante
fallo. Las secciones legacy `later` se agrupan en Planeado para no perder datos.
Aplicar estilos del sitio a `.vantare-roadmap > section` y `article`; comprobar
anchos móvil/escritorio. No se ha editado ni desplegado otro repositorio.
