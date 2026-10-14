# Informes y seguimiento · #1610 / VANTA-29

Entrega aislada para revisión. No despliega SQL, Intake, Plane, PostHog ni notas.
Base `origin/nightly@0807fbd0`; rama `vantareapp/isa-1610-testing-center-todos`.
El diseño Opus recuperado está en `C:/tmp/buzon/1610-opus-design.md`.
Se reutilizan los controles Orbit; no se añade un diseño visual.

## Qué funciona en este corte

- Informes visible con acceso verificado sin exigir rol tester. Calendario
  conserva su restricción. Usuarios normales entran a Informes sin pestañas beta.
- Formulario de título/texto con consentimiento desmarcado, invalidado al editar
  y al cambiar de cuenta. Solo el botón explícito llama al servicio.
- Consulta privada de los últimos 20 informes entre canales. Estados reales:
  recibido, en revisión, aceptado, no aceptado y arreglado con versión.
- Avisos de aceptación/arreglo en la campana y en el informe. «Entendido» guarda
  un acuse ligado a la fecha de transición; un acuse antiguo no oculta otro nuevo.
  Logout elimina datos/avisos de la cuenta. El aviso no copia título ni texto privado.
- Crédito opcional por informe, apagado por defecto y revocable. Se prepara un
  agradecimiento al identificador del informe; no se resuelve ni publica un nombre.
  La revocación no modifica notas que ya hayan sido publicadas.
- SQL preparado: 5 envíos/día y 20/7 días por cuenta, bloqueo transaccional,
  reloj real de creación, lectura con RLS y reintento exacto por UUID/payload.
  Se rechaza aislamiento con snapshot antiguo. La RPC legacy sin consentimiento
  queda sin EXECUTE para usuarios; los límites también cubren inserciones legacy/v2.
- Owner puede marcar arreglado un informe ya aceptado, con versión y textos
  revisados. No acepta propuestas de triaje. El cliente no ofrece esa RPC al usuario.
- `testing_report_patch_candidates(version)` permite solo al owner obtener
  resumen revisado y permiso de crédito de lo arreglado en esa versión.
  No devuelve identidad ni el cuerpo original. Publicar requiere revisión humana.

IPC de services **v8**: se reserva un número distinto del v7 de #1602 porque
estos comandos/DTOs son diferentes. Hub y services deben recompilarse juntos.
DTO de telemetría v10 y derechos v4 no cambian. Stable se normaliza a `master`.

## Frontera con #1602 y #1609

No se ha fusionado ni editado `vantareapp/isa-1594-triaje-informes` (#1602).
La lectura realizada fue contra `197547a1`: Packet de triaje, consentimiento,
revisión humana y SQL de contribuciones. La nueva migración es posterior a esa
migración; ampliar el constraint de estados conserva `spam`. Revisar ambas juntas
antes de aplicación, incluido el registro/allowlist del puente nativo.

El formulario público de este corte envía **texto**. El editor legacy de testers
conserva capturas/prepare-upload-finalize-attach. El enlace de ambos tipos de
informe, capturas y paquete de Intake queda pendiente de #1602. No se afirma que
los recibos legacy de sesión formen parte del historial de contribuciones.

De #1609 se leyó el buzón y `docs/analytics/eventos.md` en su rama: UUID aleatorio
de instalación, consentimiento explícito/revocable de uso, sin SDK ni replay.
El hito `a82a283b` de esa rama expone `diagnostics::consented_usage_id(root)`.
Se leyó la API y el aviso del buzón: None/error omite el vínculo y hay que
revalidar antes del envío. La función no existe todavía en nuestra base nightly.
El código productivo no pide ni copia ese ID aún: PostHog queda ausente.
No se crea otra identidad ni se reutiliza el consentimiento de envío como permiso
de uso. Antes de integrar hay que exponer la referencia consentida desde #1609 y
revalidar el permiso en cada envío/actualización; la instalación no es una sesión.

## Plane y notas: mocks ejecutables

`tools/testing/followup.py` no contiene transporte, credenciales ni lectura de
producción. Recibe una proyección **ya revisada y redactada**: ID, resumen breve,
estado, IDs opacos de capturas y referencia PostHog opcional. Nunca recibe cuenta,
correo, nombre, cuerpo original o URL libre. El kill switch comienza apagado.
El mock crea/actualiza por ID, deduplica retries y elimina el enlace al revocar.

Las capturas son referencias privadas `reports/<id>/screenshots/<id>`;
no son archivos subidos ni URLs firmadas. Intake tendrá que resolverlas y comprobar
acceso/redacción antes de su propio mock y, posteriormente, cualquier activación.
El filtro de texto rechaza correos/rutas/URLs/tokens/IP obvios. No puede garantizar
que una prosa o imagen arbitraria carezca de nombres: la revisión humana de la
proyección es obligatoria; no se exporta automáticamente el texto bruto.

Con consentimiento vigente y UUID de instalación, el enlace preparado utiliza
la ruta PostHog UE por distinct ID. Su código oficial distingue esa ruta de la
del UUID de persona: [manifest de Persons](https://github.com/PostHog/posthog/blob/master/products/persons/manifest.tsx).
No se añade replay ni se ha probado una persona real. Sin referencia/permiso,
el campo es NULL; un proyecto de ejemplo solo aparece en tests sintéticos.

`patch_notes` prepara HTML escapado exclusivamente de informes arreglados en la
versión exacta, con resúmenes revisados. El agradecimiento pseudónimo se incluye
solo cuando `credit=true`; no hay publicación ni modificación de CHANGELOG.
La RPC de candidatos y este generador siguen separados por una frontera manual.

## Verificación reproducible

Desde la raíz Git:

```powershell
python -m unittest discover -s tools/testing -v
```

En WSL, con PostgreSQL/pgTAP ya instalados:

```sh
export LD_LIBRARY_PATH=/mnt/c/tmp/ola2/1535-evidence/pg-local/root/usr/lib/x86_64-linux-gnu
python3 supabase/tests/run-followup-local.py \
  --pg-bin /mnt/c/tmp/ola2/1535-evidence/pg-local/root/usr/lib/postgresql/18/bin \
  --output /mnt/c/tmp/1610-evidence/sql-delivery
```

Clúster temporal con socket privado, sin TCP, variables PG heredadas descartadas.
Migraciones con actor postgres NOSUPERUSER BYPASSRLS; auth/membership son contratos
sintéticos mínimos. pgTAP cubre permiso/aislamiento, cuotas, estados, acuse tardío,
crédito y candidatos. Dos sesiones reales verifican quinto/sexto envío bajo lock.
Rollback con datos se rechaza; vacío conserva legacy; reaplicación reconstruye
seguimiento sin conceder crédito. No prueba Supabase completo/JWT/PostgREST.
La misma suite pasa sobre bootstrap y migración exactos de #1602@197547a1,
incluido rollback/reaplicación de este corte. Usar `--dependency-ref <SHA>` con
Git nativo en Linux, o extraer desde Git los dos SQL a una carpeta temporal y
pasar `--dependency-dir <carpeta>` desde WSL (los gitdirs del worktree son Windows).
Esta copia local no fusiona ni modifica la dependencia.

Gates Rust por `native/scripts/compilar.ps1`, target propio `native/target/gates`,
`CARGO_BUILD_JOBS=2`, timeout 3600 s por gate. Evidencia y RED/GREEN en
`C:/tmp/1610-evidence/`; resultados finales en el handoff y comentario de PR.

## Antes de integrar/activar

1. Revisión de #1602 y #1609; resolver sus interfaces sin cambiar sus ramas.
2. Reconciliar IPC v8, migraciones, allowlist y gate de identidad nativa.
3. QA del Hub aislado: cuenta normal/tester, login/logout, edición-consentimiento,
   lista/acuse/revocación, errores de red, teclado y DPI. No realizado visualmente.
4. Contratar con Intake la resolución de capturas y el enlace opcional consentido;
   probar primero con mocks. Elegir el destino/versionado de las notas del parche.
5. Revisar esquema real/ACL/backup/rollback antes de cualquier SQL autorizado.
   Esta entrega no configura tokens, workers, cron, auto-merge ni envíos reales.
