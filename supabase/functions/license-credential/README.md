# Retirada de license-credential — #1827 paso 3 / #1815

Implementación preparada, **sin desplegar ni comprobar producción**. ADR 0102:
solo se autoriza retirar tras acreditar cero uso durante 30 días completos;
Isaac autoriza el despliegue. Si hay uso o falta cobertura, no desplegar 410:
conservar la barrera de bloqueo ya integrada en nightly (#1817).

## Inventario estático (base 3e6f2dce7, 31-oct-2026)

Búsqueda reproducible desde raíz, excluyendo secretos:

```powershell
rg -n --glob '!.env*' --glob '!*.md' 'license-credential' .
rg -n 'native-license|license-credential' vantare-v2/native/services/src
```

- Entrada desplegable: `supabase/functions/license-credential/index.ts` llama
  al handler compartido. Ahora devuelve 410 `endpoint_retired`, no-store,
  para todas las peticiones excepto OPTIONS (CORS 200). No interpreta bearer
  ni body, carga estado, reclama dispositivo o firma. No redirige tokens OAuth.
- Cliente nativo: `license_remote.rs` llama exclusivamente `native-license`.
  `bridge.rs` conserva el nombre legacy en su lista de rutas permitidas y en
  un test de rechazo de URLs arbitrarias; no hay caller productivo de esa ruta.
  No se edita el cliente en un paso de servidor.
- Wails/React: retirados por #1533, sin consumidor ejecutable en el checkout.
  `vantare-v2/native/retirement` conserva evidencia inerte; `tools/frozen-go` (bajo
  vantare-v2) conserva oráculos Strategy/LMU, no un cliente de emisión activo.
  Esto no demuestra que no existan instalaciones Wails fuera del repo.
- Web y scripts de producto versionados: ningún caller del endpoint en la
  búsqueda. Una web desplegada fuera de este repositorio no queda auditada.
- Tooling: config.toml mantiene verify_jwt=false para llegar al 410; scripts
  verify-deploy-surface sigue enumerando el tombstone desplegable. El wrapper
  deploy-approved-functions lo conserva en ValidateSet para selección explícita,
  pero lo excluye de $Functions por defecto: un despliegue comercial rutinario
  no incluye la retirada. Cambio autorizado por el orquestador el 31-oct.
  Scripts no ejecutados. No borrar la Function en el Dashboard:
  eso daría 404 y perdería la respuesta explícita.
- Tests: index.test conserva normalización/emisión compartida (llama a
  issueCredential mediante fixture, ya no al HTTP retirado); retired.test
  comprueba 410 con/sin bearer y body inválido, cero dependencias y CORS.
  native-license/index.test deja de exigir doble emisión y conserva firma
  nativa; commercial-license.ts exige 410 y cero Clerk/claim/sign con bearer
  sintético activo/bloqueado en el arnés local desechable.
- El módulo compartido sigue llamándose `_shared/license-credential.ts`:
  native-license usa loadCredentialAccount/issueCredential; native-admin usa
  MODULE_CAPABILITIES; billing-webhook y billing-reconcile usan helpers/tests.
  blocks.test ahora exige cero autenticación/carga/firma para cualquier cuenta
  y bearer, incluidos bloqueos e identidad incompatible. No se
  retira el módulo ni se cambia la emisión de native-license.
- Las 40 filas de caracterización pura no describen la puerta HTTP: paso 3
  no cambia ninguna. Las filas de recovery cambian solo en el PR del paso 1.

## Confirmación de producción: pendiente de operador autorizado

1. Registrar proyecto/ref correcto, identidad de la Function, versiones y
   ventana UTC cerrada `[T-30 días, T)`. T debe quedar detrás de una marca de
   ingesta completa o de un margen L documentado y comprobado para las dos
   fuentes (T <= ahora - L). Registrar L, su evidencia y el retraso máximo
   observado con controles agregados. No asumir que el minuto actual ya está
   ingerido; sin una cota/confirmación fiable, cero uso NO está demostrado. Revisar
   configuración de logging, retención y ausencia de sampling/gaps para los
   30 días. Si la retención disponible es menor, usar solo agregados históricos
   ya disponibles o esperar 30 días de cobertura; no contratar servicios.
2. Usar Explorer → fuente Logs (no Database) con consultas agregadas. Nunca
   abrir detalles de una invocación, exportar eventos crudos, ni seleccionar
   headers, body, JWT, usuario, IP, query string o event_message. Consultar solo
   fuente, día, etiqueta fija del endpoint, método, estado y contadores. La
   consulta filtra por ruta, pero nunca devuelve su texto ni sufijos del caller.
3. En el esquema ClickHouse documentado actualmente, ejecutar la consulta de
   abajo por cada ventana UTC de como máximo 24 h, en ambos límites exactos,
   sin paginar eventos crudos. El rango explícito del explorador/API debe ser
   idéntico a `[inicio, fin)` de cada consulta; sustituir ambos literales.
   Consultar todos los métodos y estados, incluidos 401/403/404/5xx/OPTIONS.

```sql
select source, toDate(timestamp) as day,
  'license-credential' as endpoint,
  log_attributes['request.method'] as method,
  log_attributes['response.status_code'] as status,
  count() as invocations
from logs
where source in ('function_edge_logs', 'edge_logs')
  and timestamp >= toDateTime64('2026-10-01 00:00:00', 6, 'UTC')
  and timestamp < toDateTime64('2026-10-02 00:00:00', 6, 'UTC')
  and (log_attributes['request.path'] = '/functions/v1/license-credential'
    or log_attributes['request.path'] = '/license-credential'
    or startsWith(log_attributes['request.path'], '/functions/v1/license-credential/')
    or startsWith(log_attributes['request.path'], '/license-credential/'))
group by source, day, endpoint, method, status
order by source, day, endpoint, method, status
limit 1000;
```

4. Validar previamente el mapeo de `request.path` con la vista Invocations de
   la función, sin abrir detalles sensibles. Los tenants con otro esquema de
   Logs necesitan adaptar y revisar la consulta, no interpretar un campo
   ausente como cero. Un control agregado equivalente sobre native-license
   confirma que el origen/campos registran tráfico conocido; no genera llamadas
   nuevas. Comprobar que las invocaciones de función y rechazos de gateway
   quedan cubiertos, incluidos despliegues antiguos/alias del mismo endpoint.
5. Guardar solo proyecto/ref, T, inicio/fin, versión de consulta/esquema,
   cobertura/retención/margen de ingesta, controles y contadores por día/método/estado. Revisar
   errores de consulta y resultados truncados: 1000 filas exige subdividir.
   Cualquier petición cuenta como uso; no deduplicar entre fuentes para
   declarar cero. Exigir 30 días contiguos acreditados y suma cero en ambas
   fuentes. Datos ausentes, retención insuficiente o control fallido = NO
   demostrado. Si hay tráfico, parar la retirada y llevarlo al orquestador.
6. Adjuntar el acta agregada a #1815/#1827, completar review/CI del SHA y pedir
   autorización expresa a Isaac. Releer el tramo final solo después de que
   venza L o exista una marca de ingesta completa; registrar por separado la
   cola aún abierta. No certificarla como cero. Si aparece uso, un hueco o
   retraso sin cerrar, detener la retirada. Este worker no ejecuta ninguna de estas lecturas.

Fuentes públicas consultadas (31-oct-2026):
[Logs](https://supabase.com/docs/guides/observability/logs),
[SQL de logs](https://supabase.com/docs/guides/observability/advanced-log-filtering),
[campos](https://supabase.com/docs/guides/observability/log-field-reference).
Invocations puede incluir datos sensibles: solo agregados de metadatos.

## Checklist de despliegue y reversión (solo Isaac autoriza)

- [ ] Acta de cero uso 30 días, cobertura completa y review del SHA aprobado.
- [ ] CI Deno y supabase-commercial-gates LF/CRLF verdes en ese SHA.
- [ ] Autorización expresa de Isaac registrada; no basta merge ni este checklist.
- [ ] Selección explícita obligatoria: `deploy-approved-functions.ps1
  -ProjectRef <ref revisada> -Functions license-credential`, **solo** tras el
  acta de cero uso 30 días y autorización expresa de Isaac. No usar el default
  commercial para retirar la puerta; no ejecutado por este worker.
- [ ] Operador prepara y revisa bundle de license-credential con su handler
  tombstone y verify_jwt=false. Desplegar solo esta Function; no native-license,
  migraciones, claves ni otras funciones, aunque compartan helpers de código.
- [ ] Verificar bundle/versión y 410/no-store/CORS tras desplegar, sin cuentas
  reales ni bearer de usuarios; comprobación de producción requiere esa misma
  autorización. Revisar solo agregados de estado y errores.
- [ ] Conservar bundle previo revisado con barrera de bloqueo #1817 para
  reversión autorizada. No restaurar una versión previa sin esa barrera.
- [ ] Si aparece un consumidor real, detener y decidir con el orquestador:
  revertir al bundle seguro requiere autorización, no habilitar otra ruta.

Nada de esta lista se ha ejecutado contra producción.
