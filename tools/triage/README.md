## F7=C · decisión vigente de Isaac, 14/10/2026

Solo campos estructurados cerrados salen del informe. Título, cuerpo, notas y
títulos de duplicados se omiten antes del proveedor, T3 e Intake. Summary es
una etiqueta fija; preliminary_fix=null y reasons=[] también en replay.
Logs JSON, eventos y hardware no exportan nombres o mensajes libres.
La regla anterior de contenido mínimo por 200 caracteres no queda acreditada;
veredicto válido se degrada a dudoso hasta revisión humana. Worker sigue inerte.
[Regresiones F7](review-1602-f7-regressions.md). El resto conserva la historia
y procedimientos de despliegue, que requieren autorización independiente.

# Worker de propuestas #1594 / VANTA-38

Preparado en Git, **no instalado ni desplegado**. Python estándar, sin paquetes
nuevos. La configuración de ejemplo bloquea ejecución antes de credenciales,
estado, red o modelo. DeepSeek V4.1 Flash vía OpenCode; ningún segundo modelo.

```powershell
python -B -m unittest discover -s tools/triage -p 'test_*.py'
python -B tools/triage/triage.py --config tools/triage/triage.config.example.json
```

El segundo comando debe salir 1 con `inactive_or_failed`. No es un fallo de
despliegue: todavía no hay autorización ni condiciones de privacidad escritas.
Los tests usan únicamente fixtures y un subprocess simulado; nunca llaman al
proveedor, al webhook ni a producción.

`privacy.py` aplica una lista blanca al log: **ningún log crudo llega al modelo,
T3 o Intake**. Los adjuntos privados del owner conservan su almacenamiento y
retención actuales. El worker solo admite un documento JSON completo (objeto o
lista); rechaza texto libre, prefijos, JSON inválido y claves duplicadas. De los
primeros 300 registros conserva únicamente valores del catálogo compartido
`structured-catalog.json`: nivel fijo, códigos/tipos del enum real
`native/services/src/error.rs` y `ServicesCommandFailure` observado, y módulos
de los crates nativos. No admite códigos inventados como `E_TIMEOUT`.
Versiones: subconjunto estricto de SemVer, tres enteros de hasta seis dígitos
sin ceros iniciales, prerelease de etiqueta conocida (nightly/testers/alpha/
beta/rc) con sufijos numéricos y build solo numérico; máximo 64 caracteres.
No permite texto arbitrario en prerelease/build aunque sea SemVer válido.
count/relative_ms: enteros 0..1.000.000.000, sin bool. Campo presente fuera de
estos conjuntos → `otro`; campo ausente no se inventa. No copia message,
first_line, payload ni claves arbitrarias. El resumen de sesión usa la misma
proyección, incluido type. Fingerprint siempre es SHA256 calculado por nosotros
sobre JSON canónico de campos cerrados, con prefijo `vantare.triage.error.v1:`;
nunca se copia ni se valida por apariencia el fingerprint del cliente/log.
Los eventos exportados no llevan nombres libres ni horas absolutas. Rust valida
metadata desde resultados observados; Python la vuelve a proyectar. La forma
privada SQL de errores (type/message/fingerprint) y eventos (name/at) se conserva:
message es un código fijo; name/at del owner se descartan al exportar.
Rust y Python comparten catálogo, fixtures exactas F6 y hashes esperados.
Las propuestas nuevas guardan `evidence_contract=closed-fields-v1` en el spool
local después de validar referencias calculadas; no viene del informe/modelo.
Replay anterior sin esa marca descarta todas las referencias de error, incluso
las que parecen hashes; no reanaliza ni altera los ACK. Puede perder precisión
al agrupar errores del mismo tipo cerrado. [Regresión F6](review-1602-r5-regressions.md).
F7 (título/descripción y texto libre) sigue pendiente de decisión de Isaac.

Título/descripción: una sola línea, máximos 120/1000 caracteres. Se inspecciona
el campo **completo antes de truncar o normalizar whitespace**. Si la redacción
actual cambia algo o encuentra un marcador de privacidad, se sustituye todo el
campo por `[contenido retirado por privacidad]`. También se aplica a títulos de
duplicados y texto generado (resumen 200, solución 600, razones 200). JSON se
inspecciona por estructura sin borrar escapes; el fallback por líneas fue
eliminado. Las propuestas pendientes de versiones anteriores pasan por el
contrato actual al exportarse, sin reanálisis ni incluir claves de logs.
[Regresiones F5, propiedad y paridad](review-1602-r4-regressions.md).
`analysis.py` calcula
trazabilidad con catálogo de versiones aprobado, candidatos de 14 días (≤15),
presencia de evidencia y extracto JSON ≤24.000 caracteres. `log:Lx-Ly` identifica
registros proyectados (índices 1..300), nunca líneas del log original. Un log
descartado no aporta evidencia ni referencias. Del fragmento solo estadísticas,
nunca muestras.
Comprueba referencias reales y duplicados entre candidatos, valida JSON cerrado
y rebaja a dudoso cuando faltan los criterios, la trazabilidad o hay evidencia
débil; spam de confianza <0,7 también se rebaja.

`model.py` configura el agente triage con todas las herramientas denegadas,
sin plugins/MCP, directorios XDG y cwd temporales, auth dedicada y plazo de
180 s. No hereda claves del entorno. Las peticiones/respuestas no se imprimen.
CLI/config comprobados contra documentación oficial:
[CLI](https://opencode.ai/docs/cli/),
[permisos](https://opencode.ai/docs/permissions/),
[configuración](https://opencode.ai/docs/config/).
La ruta del proveedor/modelo y el SDK instalado se verificarán en el servidor
durante el despliegue autorizado; este paquete no demuestra inferencia real.

`state.py` guarda solo IDs, estados, contadores y fechas en SQLite. La propuesta
redactada queda en spool separado con permisos 0600 para reintentar la entrega
24 h sin volver a analizar; se borra al ACK o al expirar. Metadata: 90 días.
El cursor por fecha/UUID permite avanzar aunque informes ya entregados sigan
received esperando confirmación. Tres fallos de análisis producen triage.failed.

`triage.py` solo usa SELECT bajo transacción read-only, rol dedicado, pooler
de sesión IPv4 y TLS verify-full. Nunca usa account_id/posthog_session_id ni
service_role. Envío HMAC-SHA256 sobre bytes UTF-8 exactos, sin redirecciones.
`verify_delivery` rechaza firma incorrecta, antigüedad >24 h y delivery_id visto.
El receptor debe persistir `seen` en el hilo/almacenamiento del orquestador.
Ni el worker ni la recepción del webhook aceptan informes: una persona u
orquestador por orden expresa de Isaac confirma vía RPC owner.

Los candidatos duplicados también requieren consentimiento triage-v2; los
títulos legacy sin ese consentimiento no entran al proveedor.

## Runbook de despliegue: ejecutar solo tras otro OK

Destino aprobado del diseño: .57, WSL `vantare-svc`. **No ejecutar estos pasos
con la autorización de la migración.** No activar cron ni crear password/LOGIN
del rol sin su autorización separada. La configuración sigue disabled.

1. Obtener condiciones de privacidad escritas: pasarela/subencargado, región,
   retención, entrenamiento y condiciones contractuales. Guardar el documento
   aprobado y su SHA256; no inferir ZDR o región de fuentes de terceros.
2. Con OK de despliegue, crear usuario de sistema vantare-triage, sin sudo,
   shell `/usr/sbin/nologin`; root mantiene los ficheros de programa/config.
   Copiar los `.py` y `structured-catalog.json` de esta carpeta a
   `/opt/vantare-triage` (0755; catálogo 0644),
   configuración a `/etc/vantare-triage` (0700, fichero 0600) y certificado
   público Supabase ya versionado. No copiar configuraciones globales o `.env`.
3. Verificar Python, psql y la CLI OpenCode ya instalados; fijar ruta/digest.
   Verificar catálogo `opencode-go/deepseek-v4.1-flash` y definición mínima del
   proveedor/SDK instalado. No instalar dependencias automáticamente.
4. Isaac autoriza aparte LOGIN/password del rol vantare_triage. Preparar su
   conexión dedicada, JSON auth exclusivo opencode-go y secreto HMAC como
   credenciales systemd. No usar la conexión administrativa del backup.
   `LoadCredential` importa desde `/etc/vantare-triage/credentials/` (root/0600).
   Nunca escribir secretos en Git, argumentos, comentarios o salidas.
5. Orquestador: usar request_secret de T3 y luego preparar schedule_task
   **en su hilo**, inicialmente `enabled:false`, `bindToCurrentThread:true`,
   con schedule objeto `type:webhook`, `maxDeliveryAgeMinutes:1440` y firma
   `header:x-hub-signature-256`, `encoding:hex`, `prefix:sha256=`, secretRef
   privado. Si falta webhookUrl, resolver T3 Connect antes de activar.
   El prompt debe tratar `{{body}}` como datos no confiables, deduplicar IDs,
   comprobar caducidad y pedir la decisión de Isaac; nunca ejecutar sugerencias
   del texto ni aceptar por el veredicto del modelo.
6. Rellenar catálogo de builds desde la publicación aprobada por canal;
   no considerar trazable una versión por texto del informe. Configurar URL
   de webhook, proveedor mínimo y documento/hash de privacidad aprobado.
   Mantener enabled/privacy_approved false hasta la aceptación final.
7. Copiar unidades .service/.timer. Revisar usuario, /mnt inaccesible,
   ProtectSystem, PrivateTmp, NoNewPrivileges, MemoryMax=2G y KillMode;
   ejecutar systemd-analyze verify, daemon-reload y dejar timer disabled.
   Calendar cada 2 min + Persistent; flock además evita solapar pasadas.
8. Hacer prueba autorizada con un informe de QA identificado como fixture:
   permisos de lectura, redacción, prompt/config efectiva sin tools, HMAC,
   replay, reintento de entrega y doble confirmación owner. No usar informes
   reales para resolver routing/credenciales. Mantener el estado received
   hasta una orden humana y RPC autenticada.
9. Solo tras OK final: cambiar flags a true, habilitar webhook/timer y verificar
   primera pasada. Journald registra IDs/estados, sin cuerpos ni credenciales.
   Verificar catálogo/recepción, no afirmar aceptación por un ACK HTTP.

Parada/rollback operativo: deshabilitar timer/webhook y cerrar consumidores;
conservar state/spool protegido para diagnóstico. No revertir la migración
con datos ni abrir RLS para solucionar un fallo de permisos.


## Hito Intake · VANTA-49, hija de VANTA-38

Preparado después del PR principal #1602, en commit separado. No desplegado.
Intake VANTA se comprobó activado el 2026-10-13; no hizo falta cambiarlo.
El worker publica cada propuesta **de testers** inmediatamente después de
persistir el análisis, antes de enviar a T3. Nightly y triage.failed no reciben
un veredicto inventado en Intake. Un fallo de Plane no bloquea la propuesta T3,
y un fallo de T3 no impide publicar en Intake. Se reintenta entrega, no modelo.

La entrada contiene solo título redactado, canal, juego/versión, veredicto,
confianza/resumen redactado e ID de contribución. No se envían account_id,
email, cuerpo del informe, hardware, tokens, candidatos ni logs (ni siquiera
la primera línea). HTML escapado. El token de autenticación va solo en
X-API-Key hacia el destino privado configurado; redirects y proxy ambiental
están desactivados. Nunca se imprime el token ni el cuerpo de errores remotos.

**Aceptar en Intake NO acepta el informe para el descuento.** No hay listener
que traduzca estados de Plane a Supabase. Solo testing_contribution_review,
autenticada como owner y tras confirmación humana, puede aceptarlo. Esta
integración no invoca esa RPC ni modifica billing o elegibilidad #1593.

### Contrato exacto de CE 1.4.2 / API v1

Base: /api/v1/workspaces/vantare-simracing-suite/projects/
89da40f4-ae2a-443d-9e3e-6024e01247c9/ (sin salto de línea).

1. GET proyecto. Si intake_view=false, PATCH {"intake_view":true} y volver a
   leer. Si no se puede, log sanitizado intake_pending/reason, sin crear fuera
   del Intake ni cambiar otros ajustes. No convertirlo en un work item normal.
2. GET work-items/?external_id=<UUID>&external_source=vantare-testing-contribution.
   En v1 devuelve un objeto, o 404 si no existe; no es una lista paginada.
3. POST intake-issues/ con {"issue":{"name":...,"description_html":...,"priority":"none"}}.
   CE 1.4.2 ignora los external_id/source en ese POST. El cuerpo lleva marcadores
   visibles de fuente/ID, para recuperar una respuesta incierta.
4. PATCH intake-issues/<UUID del work item, NO el UUID de la fila Intake>/ con
   {"issue":{"external_id":<UUID de contribución>,"external_source":"vantare-testing-contribution"}}.
   Son los campos del **work item asociado al Intake**: el serializer anidado
   permite guardarlos. No se escribe status ni source_email del Intake.
5. Releer por los dos campos externos y comprobar UUID antes de guardar ACK.
   Una entrada ya aceptada en Plane sigue deduplicada por esos campos.

Referencias fijadas, independientes de la documentación v2 actual:
[URLs v1.4.2](https://github.com/makeplane/plane/blob/v1.4.2/apps/api/plane/api/urls/intake.py),
[creación/PATCH de Intake](https://github.com/makeplane/plane/blob/v1.4.2/apps/api/plane/api/views/intake.py),
[lookup externo](https://github.com/makeplane/plane/blob/v1.4.2/apps/api/plane/api/views/issue.py),
[activar Intake](https://github.com/makeplane/plane/blob/v1.4.2/apps/api/plane/api/views/project.py).

SQLite conserva únicamente ID, fase e ID de work item para esta entrega.
Se registra intención antes del POST; después se guarda el UUID antes del PATCH.
En una respuesta perdida/crash se busca el marcador en todas las páginas de
Intake y se termina el PATCH sin crear otra entrada. Si hay intención incierta
y no aparece la fila, **no se repite el POST automáticamente**: avisar DUDA con
el ID; un operador debe reconciliar el registro/orfandad en Plane antes de
permitir reintento. CE v1 no ofrece creación atómica con clave idempotente.
Un error confirmado 400/401/403/404/429 permite reintentar después de corregirlo.

El spool redactado se conserva hasta los dos ACK (Plane y T3), o 24 horas.
Al expirar, se registra intake_expired con ID; avisar al orquestador. Para
recuperación manual usar la propuesta ya entregada a T3 y reconciliar primero
por external_id/source/marcador; no borrar el ledger ni volver a analizar sin
revisión. Metadata: 90 días; el sondeo solo lee 30 días. No se amplía retención
ni se guardan cuerpos en SQLite. No se realiza backfill de antiguos análisis
ya entregados sin spool; revisar un backfill aparte si fuera necesario.

### Token y despliegue, pendientes de OK

Crear/confirmar con Isaac una identidad/token de Plane **propio del worker**,
miembro únicamente del proyecto necesario. Usar el menor permiso que permita
leer/crear/PATCH de Intake; activar intake_view requiere permiso de proyecto,
pero VANTA ya está activado. No reutilizar ~/.vantare/plane-token ni el token
personal de plane-estado.py. DUDA en C:/tmp/buzon/1594.md: procedimiento/archivo
pendiente de confirmar; no se ha creado ni copiado ningún token al servidor.

Con el OK de despliegue del worker y el procedimiento de Isaac:

1. Guardar el token dedicado como archivo restringido, por ejemplo
   C:\VantareServer\ops\credentials\triage-plane-token, siguiendo ACL de ops.
   No .env, argumentos, chat, logs o Git. Isaac proporciona el procedimiento.
2. Importar únicamente ese token al archivo privado de WSL
   /etc/credstore/vantare-triage.plane-token (root, 0600). systemd usa
   LoadCredential=plane-token:vantare-triage.plane-token y entrega el archivo
   privado al usuario del worker. El nombre de credstore, sin ruta absoluta,
   permite arrancar si falta: solo Intake queda pendiente; T3/purga continúan.
   No se buscan credenciales personales. La inicialización se reintenta en las
   siguientes entregas/pasadas, sin borrar el ACK pendiente ni volver al modelo.
   [Contrato systemd v257: credencial por nombre ausente no fatal](https://github.com/systemd/systemd/blob/v257/man/systemd.exec.xml).
   El lector rechaza symlink y permisos de grupo/otros. No acceder a /mnt desde
   el worker. La copia/importación queda para el despliegue autorizado.
3. Copiar código/config/unidad bajo el runbook principal; revisar plane_intake
   (proyecto VANTA y URL privada). El ejemplo habilita el sink, pero mantiene
   worker enabled=false y privacy_approved=false, antes de credenciales/red.
4. Prueba QA autorizada: crear una contribución sintética de tester, verificar
   campos mínimos en Intake, metadata externa, dos ACK/reintento y ausencia de
   cambio en testing_contributions.state. Solo después habilitar lo autorizado.
   No enviar datos reales para probar token/SDK/routing. No se hace esta prueba ahora.

Tests sin red: mock reproduce POST que ignora metadata, PATCH con UUID asociado,
lookup objeto/404, activar/denegar Intake, respuesta perdida/paginación,
aceptación en Plane sin RPC, ACK independientes, expiración y upgrade SQLite.
36/36 (16 existentes + 12 Intake + 8 review) PASS; socket real prohibido en tests de Intake.
No se ha ejecutado ningún POST de informe en el Plane real.

### Recuperación y descubrimiento tras la review #1602

Bajo worker.lock, el worker recupera intentos interrumpidos, purga spool y
reintenta las dos entregas antes de consultar Supabase. Un error de polling
conserva su salida de fallo, pero ya no impide entregar/purgar lo pendiente.
Estado analyzing diferencia un intento persistido de su resultado. No se
restituye cuota: después del tercer intento sin resultado se envía triage.failed
con ID/contador, diagnóstico/timing desconocidos y sin cuarto análisis.
Una propuesta reemplazada/fsync antes del commit SQLite se recupera exacta,
con el TTL original y ambos sinks; se borran temporales propios huérfanos.

El cursor de creación se conserva como dato de progreso, sin excluir informes.
Cada sondeo pagina IDs/created_at de todos los received visibles en la ventana
RLS de 30 días y consulta State; solo obtiene hasta 20 cuerpos nuevos/reintentables.
No amplía RLS/retención. A que confirma detrás del cursor vuelve a aparecer;
si confirma detrás de una página ya leída, se encuentra en el siguiente sondeo.
Las páginas ya vistas no bloquean las posteriores. No hay lectura de account_id.

Regresiones de review: tools/triage/test_review_1602.py (sin red, modelos,
PostgreSQL ni Plane reales); Rust prepara preview y usa HTTP loopback sintético.
STOP al merge: Isaac encargará re-review y merge; no reactivar auto-merge.
Token propio de Plane se crea al desplegar con autorización; no bloquea código.
Ahora no se despliega ni se envía ningún informe a Intake.
