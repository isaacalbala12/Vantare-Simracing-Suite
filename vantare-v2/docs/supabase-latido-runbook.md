# Supabase Free: latido diario (#1508)

Decisión de Isaac: latido gratuito (§6j, 2026-10-08). Esta entrega prepara la
operación; no aplica SQL, configura secretos, consulta producción ni activa el
cron. No toca el checkout con login de #1506.

## Qué hace

`.github/workflows/supabase-latido.yml` lee PostgreSQL cada día a las **07:23 UTC**
(09:23 Madrid en verano, 08:23 en invierno), con `workflow_dispatch` adicional.
Hace un GET PostgREST a `/rest/v1/supabase_heartbeat?select=id&limit=1`, usando
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Exige HTTP 200 y una fila
`[{"id":true}]`; una respuesta vacía, HTML, error o timeout falla el job.
Timeout de red: 20 segundos; job: 3 minutos. No sigue redirecciones, imprime
cuerpos, URLs, claves ni trazas de errores de red. No usa `service_role`.

La migración crea solo la tabla `public.supabase_heartbeat`, con una fila fija,
RLS y SELECT para `anon`; deniega escritura y acceso a otros roles de cliente.
La fila no contiene datos de usuarios ni registra timestamps. Leer la tabla
genera una consulta real a PostgreSQL sin modificar datos. Se crea un endpoint
independiente porque los contratos de cuenta/calendario exigen autenticación y
la activación del roadmap público no está demostrada para esta entrega.

Si falla el latido, un paso separado intenta enviar un mensaje al webhook
existente `DISCORD_KNOWN_ISSUES_WEBHOOK_URL`, sin menciones, con enlace al run.
El fallo del latido permanece rojo aunque Discord funcione. Si falta el webhook,
el log lo declara y Actions sigue siendo la señal de fallo. Si Discord también
falla, se declara sin imprimir su URL. Cancelación o timeout total del job puede
impedir el aviso; los tests previos fallidos bloquean el latido. Revisar también
los runs ausentes: un cron que no se ejecuta no puede avisar de su propia ausencia.

## Verificación sin producción

Desde la raíz Git del worktree:

```powershell
python -m unittest discover -s .github/scripts -p test_supabase_latido.py -v
git diff --check
```

Los tests sustituyen el transporte HTTP y usan valores ficticios; no envían
mensajes ni consultas reales. CI los ejecuta en PR sin secretos. Otro job usa
`postgres:16` desechable y `psql` para comprobar aplicación doble, singleton,
RLS, lectura anon, rechazo de INSERT/UPDATE/DELETE, rollback doble y reapply.
La contraseña de ese servicio es un fixture público local, ajeno a producción.
Con PostgreSQL ya instalado, la misma prueba puede ejecutarse **solo en una
base vacía desechable**, como propietario (crea los roles de prueba):

```powershell
psql -X -v ON_ERROR_STOP=1 -d latido_test -f supabase/tests/supabase_heartbeat.test.sql
```

## Activación por Isaac, paso a paso

1. Revisar la PR draft y sus checks. Aprobar cada promoción mediante el flujo
   `issue → nightly → testers → master`; esta entrega no autoriza ningún merge.
2. En el panel Supabase, comprobar organización y proyecto de producción, y
   estado `Active`. Si está pausado, Isaac debe reanudarlo antes de probar el
   endpoint; el latido no reactiva proyectos.
3. Probar primero la migración y el rollback en una base desechable. Revisar
   exclusivamente `supabase/migrations/20261008230000_supabase_heartbeat.sql`.
   Aplicar ese fichero desde SQL Editor del proyecto confirmado, como owner,
   **solo cuando Isaac autorice y ejecute la activación**. No ejecutar un push
   masivo de migraciones pendientes. La operación es transaccional e idempotente
   e incluye recarga de esquema PostgREST. No aplicar el fichero de tests en prod.
4. En GitHub Settings → Secrets and variables → Actions, comprobar **los nombres**
   de los secretos `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y el webhook
   opcional `DISCORD_KNOWN_ISSUES_WEBHOOK_URL`. No imprimir ni pegar sus valores.
   Isaac corrige configuración si falta alguno; el worker no la cambia.
5. Antes de llegar a `master`, ejecutar el script manualmente desde el worktree
   revisado con las dos variables Supabase ya cargadas de forma privada en el
   entorno del proceso. No pasarlas como argumentos ni guardarlas en el repo:

   ```powershell
   python .github/scripts/supabase_latido.py
   if ($LASTEXITCODE -ne 0) { throw 'Latido fallido; revisar proyecto y configuración' }
   ```

   La ejecución local no envía Discord automáticamente; no ejecutar
   `--notify-failure` para simular fallos en el canal real. Isaac puede repetir la
   lectura diaria como puente temporal; requiere intervención humana, no queda
   automatizada en su PC por esta entrega.
6. **Cron empieza solo cuando el workflow llega a `master`, la rama predeterminada
   actual. `workflow_dispatch` también exige que el fichero exista en esa rama.**
   Después, Actions → Supabase latido diario → Run workflow permite elegir una
   rama revisada. Por CLI, desde un checkout del repo:

   ```powershell
   gh workflow run supabase-latido.yml --ref master
   gh run list --workflow supabase-latido.yml --limit 5
   ```

   Si ya está registrado en `master`, se puede seleccionar `--ref nightly`;
   antes de ese registro no asumir que el dispatch de una rama nueva funciona.
7. Conservar enlace al primer run verde, SHA y fecha UTC; comprobar en Supabase
   estado Active/actividad y en GitHub que aparece el run diario siguiente.
   Registrar evidencia en #1508. Esa evidencia operativa aún no existe en esta
   entrega. Un PASS mock o SQL desechable no demuestra disponibilidad real.

## Incidencias, costes y rollback

- HTTP 401/403: Isaac revisa clave anon y grants/RLS; nunca sustituir por una
  clave privilegiada. HTTP 404: comprobar migración y caché PostgREST. 5xx o red:
  revisar panel y estado del proveedor. Fila vacía: comprobar singleton/RLS.
- Supabase describe actividad **suficiente** durante siete días y típicamente
  algunas consultas diarias; no garantiza que una sola lectura al día impida
  toda pausa. Este latido aporta actividad y detección, sin promesa de SLA.
  Revisar emails de aviso y panel; si la actividad no basta, decidir con Isaac
  un ajuste o Pro. Pro implica gasto y queda fuera de esta entrega.
- GitHub puede retrasar o descartar cron bajo carga; en repositorios públicos
  también puede deshabilitar schedules tras 60 días sin actividad. Revisar runs
  ausentes y el estado Enabled. No configurar planes de pago ni gasto.
- Rollback: Isaac deshabilita primero el workflow en Actions, luego aplica
  `supabase/rollbacks/20261008230000_supabase_heartbeat.down.sql` al proyecto
  confirmado. Elimina únicamente la tabla de salud, sin CASCADE. Es idempotente;
  no toca cuenta, billing ni usuarios. Reaplicar migración para restaurar y
  habilitar workflow cuando se haya verificado.

Fuentes oficiales consultadas el 2026-10-08:
[pausas Supabase Free](https://supabase.com/docs/guides/platform/free-project-pausing),
[schedule de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[ejecución manual](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
