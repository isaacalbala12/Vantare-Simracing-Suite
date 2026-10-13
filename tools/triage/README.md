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

`privacy.py` repite redacción y proyección de hardware. `analysis.py` calcula
trazabilidad con catálogo de versiones aprobado, candidatos de 14 días (≤15),
presencia de evidencia y extracto JSON ≤24.000 caracteres. Logs WARN/ERROR con
cinco líneas de contexto (≤300); del fragmento solo estadísticas, nunca muestras.
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

## Runbook de despliegue: ejecutar solo tras otro OK

Destino aprobado del diseño: .57, WSL `vantare-svc`. **No ejecutar estos pasos
con la autorización de la migración.** No activar cron ni crear password/LOGIN
del rol sin su autorización separada. La configuración sigue disabled.

1. Obtener condiciones de privacidad escritas: pasarela/subencargado, región,
   retención, entrenamiento y condiciones contractuales. Guardar el documento
   aprobado y su SHA256; no inferir ZDR o región de fuentes de terceros.
2. Con OK de despliegue, crear usuario de sistema vantare-triage, sin sudo,
   shell `/usr/sbin/nologin`; root mantiene los ficheros de programa/config.
   Copiar solo los `.py` de esta carpeta a `/opt/vantare-triage` (0755),
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
