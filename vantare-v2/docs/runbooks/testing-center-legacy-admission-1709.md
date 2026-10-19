# #1709 / VANTA-96 · Envío legacy de informes y admisión

19-oct-2026. El orquestador aprobó implementar la propuesta en el mismo PR
#1710, después de #1708. Base de inventario: nightly
`999d5950745f73be0e38a1763422f53b515c6866`.

## Estado de implementación

El transporte de `Reports::send` pasa a `testing-report-submit` con y sin
capturas. El Hub conserva `ReportSend`, preview/consentimiento, borrador,
intento durable, reintento manual y recibo; no cambia el IPC. Las capturas
siguen preparándose, subiendo a Storage y finalizándose antes del envío.
`evidence_not_ready` conserva el reintento mientras se validan los bytes.
La allowlist Rust retira las dos rutas de envío RPC.

La Edge acepta el envelope cerrado `testing-center.v1` después de la misma
admisión IP/cuenta y devuelve un solo recibo validado. No acepta cuenta/IP del
body, prosa del tester ni diagnósticos. Los formularios modernos mantienen su
contrato. Todos consumen las mismas cuotas existentes, también los reintentos.

La migración de compatibilidad `20261018224039_isa_1709_report_admitted.sql`
añade un adaptador público solo para service_role y núcleos privados con UUID
verificado. Conserva membership/canal, idempotencia, evidencia/transport size y
la barrera de cuentas eliminadas; no fabrica claims. En esta fase no retira
permisos legacy. El cliente y la compatibilidad quedaron en `72e15fdd2`, antes del cierre
`20261018224803_isa_1709_close_legacy_report_rpc.sql`. Este cierre revoca PUBLIC,
anon, authenticated y service_role en las tres firmas legacy; solo el adaptador
servidor nuevo mantiene EXECUTE service_role. Ningún paso se ha desplegado.

Tras integrar ES256 desde nightly: Deno 85 PASS / 2 integraciones omitidas; Rust services 219 PASS / 2 omisiones existentes, incluidos 19 tests de informes; Clippy services --all-targets PASS.
Nightly `147372fa9` (#1708 ES256 y #1702 workflow) se ha incorporado mediante
merge `352f31620`. SQL/ACL y PostgreSQL/PostgREST reales están pendientes de CI
del HEAD de #1710. El PR sigue draft y la issue abierta.

## Inventario de consumidores

Rutas relativas a la raíz Git, examinadas en el SHA de base indicado arriba.
Se buscaron el nombre completo, el sufijo `_with_evidence`, las rutas HTTP y los
despachos de comandos. Una allowlist o un documento no cuentan como un caller.

| Superficie | Evidencia | Conclusión |
| --- | --- | --- |
| Hub nativo | `native/hub/src/testing/editor.rs:468`: el botón «Enviar informe» emite `Command::ReportSend`. `services/view.rs:619` lo clasifica en el área Report. | Caller de producto activo, tras preview y consentimiento. No está bajo cfg(test). |
| Services nativo | `native/services/src/app.rs:529–537` despacha a `report_reply`; `:880–881` llama `Reports::send`. `report.rs:514` consume consentimiento y persiste el intento antes del HTTP; `:623–626` termina en `rest/v1/rpc/testing_center_submit_report` si no hay imágenes. | Necesita seguir funcionando. Su revocación sin sustituir transporte rompe el envío legítimo. |
| Capturas del mismo flujo | `native/services/src/report.rs:628–638` sube/finaliza el lote y llama `testing_center_submit_report_with_evidence`. `report/screenshots.rs:205,251` prepara y finaliza. | Otro caller activo que conserva recibo, lotes e idempotencia. También debe migrarse. |
| Allowlist Rust | `native/services/src/bridge.rs:114,117` permite ambas rutas. | No es un caller por sí sola, pero permite las llamadas anteriores; habrá que retirar ambas entradas cuando cambie el transporte. |
| Edge Functions | `supabase/functions/testing-report-submit/index.ts` llama `testing_report_submit_admitted` o `testing_contribution_submit_admitted`; no llama la RPC legacy. `scripts/verify-deploy-surface.ts` solo registra la Edge. | El gate actual cubre los formularios modernos, no el caller rico. No se halló caller Edge directo de `testing_center_submit_report`. |
| Formulario moderno/triaje | `native/services/src/testing.rs:107` y `triage.rs:222` envían a `functions/v1/testing-report-submit`. | Consumidores diferentes, que deben conservar contrato y compartir presupuesto con el envío rico propuesto. |
| Admin nativa y Edge admin | Búsqueda de los nombres/rutas en `native/admin`, `supabase/functions/native-admin` y el resto de handlers. La admin administra roles/reportes, sin llamada de envío legacy hallada. | No justifica mantener una ruta cliente legacy. La revisión/gestión de reportes debe conservarse. |
| Web externa | Checkout `C:/VantareServer/web-repo`, master `a4ae91daccd8b579d0fa8280b74fd2c90d96ced4`, limpio al leer. Búsqueda en sus 24 archivos versionados TS/JS/MJS/TSX/RS/SQL, además de src/public/tools/tests. | Ningún caller hallado de las tres rutas de envío. Es un resultado del código disponible, no un inventario de todos los clientes desplegados. No se modificó ese repo. |
| Scripts operativos | Búsqueda en `scripts/`, `tools/`, `supabase/functions/scripts/`, excluyendo secretos/retirement. Hay referencias de revisión y fixtures, sin caller productivo directo hallado. | No justifica una excepción cliente. |
| SQL interno | `20260814154558_testing_center_screenshot_evidence.sql:504` llama la RPC base desde el wrapper de evidencia. El wrapper es SECURITY DEFINER y recibe EXECUTE authenticated en `:547`. | Revocar solo la base no cierra el envío a través del wrapper. Es parte del corte mínimo. |
| Tests/arneses | `native/services/src/report/tests.rs:570`, pruebas de capturas y bridge; pgTAP `testing_center_*`, `native_admin.test.sql`; runners `run-testing-center-*-postgres.ps1`. El PR ES256 #1708 incorpora un test legacy HTTP. | Fixtures/pruebas, no consumidores productivos que requieran conservar permisos. Actualizar regresiones del catálogo completo sin reescribir los históricos. |

Las rutas de la tabla empiezan en `vantare-v2/` para `native/`. El código retirado
Wails/React no se usa como evidencia de un consumidor vigente. Tampoco se ha
deducido qué versión ejecuta cada instalador real.

## Por qué en la base del inventario se esperaba 200

`20260802180000_testing_center_codex_control.sql:87` concede EXECUTE a
authenticated para `testing_center_submit_report` (15 argumentos). Su wrapper
SECURITY DEFINER llama al cuerpo `_without_transport_size`; el cuerpo original
de `20260802150000_testing_center_report_submission.sql:201–220` exige membership
activa y el rol/canal correspondiente. B03 sustituye `auth.uid()` por
`private.current_account()`, sin retirar ese grant. Una fixture Clerk/B01 válida
con tester activo y canal testers está autorizada por ese SQL.

Las ACL de tablas y el hecho de que otro endpoint tenga cuotas no cierran una
RPC SECURITY DEFINER autorizada. El flujo legacy no llama
`testing_report_admit`. Esta conclusión es estática; el recorrido HTTP de #1708
está preparado para confirmar 200 e identidad/aislamiento/tombstone, pero no se
afirma aquí que haya sido ejecutado. El wrapper con capturas mantiene la misma
vía al cuerpo de envío aunque se retire solo el EXECUTE directo de la base.

## Solución aprobada e implementada (pendiente del gate real)

**Una entrada Edge existente, un presupuesto compartido y cierre coordinado de
las dos RPC cliente.** Sin servicio nuevo, dependencias nuevas, rediseño de UI
ni conversión que pierda metadatos permitidos, imágenes o recibo. La prosa y los
diagnósticos siguen locales conforme a F7=C.

1. Extender `testing-report-submit` con una rama tipada explícita para
   `p_contract_version=testing-center.v1`, con las 15 claves cerradas de Submission
   y, para el modo con evidencia, un `p_batch_id` UUID. Mantener sin cambios las
   ramas modernas. Rechazar mezclas de formatos y campos de cuenta/IP del cliente.
   El contrato HTTP nuevo debe fijar y probar cómo devuelve el recibo completo
   que hoy recibe Reports; no convertirlo a la respuesta vacía del otro formulario.
2. Reutilizar exactamente el orden actual: origen gestionado soportado,
   `cf-connecting-ip` canónica → HMAC/salt/semana UTC → admisión IP, verificación
   de B01/bloqueo/UUID → admisión cuenta, y después validación del cuerpo/envío.
   Cada intento, rechazo o retry pasa por esos contadores durables. No aceptar
   IP/UUID aportados por el body ni crear cuotas separadas por formato.
3. Reutilizar `public.testing_report_admit(scope, subject, week)` y su almacén
   actual. Hoy limita a **5 intentos por día UTC y 20 por semana UTC**, tanto por
   IP como por UUID de cuenta. `weekStart` y SQL usan inicio de semana UTC; no
   prometer una ventana móvil de siete días. Compartir los mismos scope/subject/
   week que los formularios existentes, de modo que alternarlos no reinicie cuota.
   No cambiar los límites ni las cuotas adicionales de filas de otros flujos.
4. Añadir adaptadores SQL explícitos, exclusivos de service_role, para envío rico
   simple y con evidencia. La cuenta llega solo del UUID verificado en Edge.
   Extraer únicamente el núcleo que hoy obtiene current_account a funciones
   privadas con parámetro UUID, siguiendo el patrón `_for_account` de
   `20261015100000_isa_1608_testing_server_identity.sql`. No simular un JWT con
   `set_config`, ni invocar el cuerpo actual como service_role esperando que
   aparezca una identidad Clerk. Aplicar el lock/barrera de UUID y revisar el
   tombstone antes de membership/filas, sin retirar validaciones existentes.
5. Mantener en ese núcleo los roles tester/canal, digest, clave idempotente,
   tamaño/transporte del diagnóstico y semántica del recibo. Para evidencia,
   preservar propiedad del lote, slots ready/attached y reintento exacto. No
   conceder por conveniencia SELECT/DML de tablas privadas a clientes o service
   wrappers; los helpers privados no tendrán EXECUTE público/directo.
6. Cambiar solo el transporte de `Reports::submit_attempt` a la rama Edge y
   adaptar el recibo HTTP. Conservar preview, consentimiento consumible, intento
   durable antes del POST, estados rejected/uncertain/confirmed y los JPEG ya
   preparados. Mantener los límites de JSON/HTTP; una fixture grande debe probar
   el paquete serializado completo. La preparación/finalización y bytes Storage
   conservan sus políticas y validaciones; el envío final pasa por admisión.
7. Tras tener servidor y cliente compatibles, crear una migración nueva que
   revoque EXECUTE de PUBLIC/anon/authenticated en **ambas** RPC legacy de envío
   y reafirme el cierre de `_without_transport_size`. Permitir llamadas remotas
   solo a los adaptadores admitidos como service_role; las funciones internas
   quedan para su propietario. Inventariar overloads y grants heredados para que
   una firma alternativa no conserve la entrada. No cambiar las migraciones
   históricas para ocultar que antes se concedía el permiso.

No se propone una cuota en SQL basada en una IP declarada por el cliente: SQL
no recibe de ese camino una IP autenticada equivalente a la que usa la Edge.
Cerrar solo el botón del Hub tampoco impide llamar directamente a PostgREST.

## Permisos objetivo del corte

| Superficie | anon / authenticated | service_role |
| --- | --- | --- |
| RPC legacy base, `_without_transport_size`, `_with_evidence` | Sin EXECUTE, incluido acceso heredado de PUBLIC | Sin entrada remota necesaria al finalizar la migración; usar adaptador admitido. Propietario conserva llamadas internas que queden justificadas. |
| Nuevos adaptadores admitidos | Sin EXECUTE | EXECUTE cerrado, con UUID derivado por Edge y checks completos. |
| Helpers privados de núcleo | Sin EXECUTE ni exposición Data API | No dar acceso directo; los wrappers SECURITY DEFINER autorizados los invocan. |
| Preparación/finalización de capturas y Storage | Mantener permisos y RLS actuales, sin entrada alternativa de envío | Mantener únicamente permisos operativos ya justificados. |
| Admision actual y formularios modernos | Sin cambio | Sin cambio, mismos contadores para todos los formatos. |

El `service_role` nunca se entrega al cliente. Su capacidad de omitir RLS exige
que los nuevos adaptadores verifiquen identidad, propiedad y borrado, igual que
el patrón servidor existente; no se trata de un proxy arbitrario de RPC/SQL.

## Regresiones que deberá traer la implementación

- pgTAP del catálogo completo: PUBLIC/anon/authenticated no pueden ejecutar las
  dos RPC legacy ni aliases/overloads; service_role solo accede a los adaptadores
  previstos. Login/SET ROLE real cuando corresponda; no solo consulta de ACL.
- HTTP PostgREST real: bearer válido de tester activo recibe 401/403 o permiso
  denegado en las rutas legacy base y con evidencia. No confundir 200/vacío con
  rechazo de EXECUTE. El caso debe estar en el workflow de #1702 con todas las
  migraciones, LF y CRLF, además del test opcional.
- Edge + PostgreSQL real: envío simple y con lote ready → recibo durable y fila
  propia; caller ajeno, sin membership, lote ajeno y tombstone denegados.
- Presupuesto compartido: alternar reporte rico, formulario moderno y triaje no
  reinicia el contador; dos cuentas comparten IP, una cuenta alterna IPs,
  rechazos/retries cuentan, 6.º intento diario y 21.º semanal denegados.
  Concurrencia y semana/día UTC mediante los arneses existentes.
- Rust con servidor loopback: request va a Edge, no a las dos RPC; conserva
  errores, reintento incierto, recibo, consentimiento y privacidad de capturas.
  No retirar los tests históricos de transporte sin sustituir su protección.
- Negativos criptográficos B01 de #1708, RLS y carreras de #1702 conservados.
  Ejecutar los gates nativos/CI adecuados porque el corte posterior sí tocará
  Rust; registrar resultados de esta implementación sin atribuirle pruebas omitidas.

## Orden de corte y reversión

Antes de reconstruir: terminar servidor/Rust/migración en
issue/PR trazados, revisar seguridad y cerrar arnés real/CI. Coordinar con #1704
para que su test de legado cambie de expectativa 200 a denegación **solo al
incorporar la nueva migración**, conservando evidencia previa. La cuota debe
quedar en la misma ruta que autentica B01, no en un JWT distinto improvisado.

Despliegue futuro solo con autorización de Isaac: servidor compatible, cliente
corregido y revocación final en la misma ventana revisada. Inventariar binarios
ya distribuidos; si no se actualizan, fallarán cerrado al intentar la RPC vieja.
Que la base productiva sea de prueba no demuestra que no haya binarios antiguos.

Reversión ante fallo: mantener la venta/reconstrucción bloqueada y los borradores
locales, restaurar un par servidor/cliente compatible que conserve la admisión.
No restaurar automáticamente EXECUTE authenticated para resolver un error de
cliente. No borrar reportes, lotes ni claves idempotentes para repetir la prueba.
Una excepción temporal a la admisión requeriría decisión explícita distinta.

## Entrega y estado

La propuesta quedó aprobada. Esta rama contiene el transporte Rust, la Edge
compatible, el adaptador SQL y sus regresiones. La retirada de permisos va en una
migración y commit posteriores al cliente/compatibilidad. El inventario anterior describe
la base examinada, no el comportamiento final del nuevo cliente.

El PR incorpora #1708 y el workflow real de #1702 desde nightly. Permanece
borrador hasta ejecutar PostgreSQL/PostgREST y verificar la CI completa. No acredita
cierre del riesgo ni autoriza reconstruir producción antes de esos gates.


## Regresión real tras integrar #1708

El arnés completo, tanto LF como CRLF, ahora prueba el corte de #1709:
la RPC legacy devuelve 403; `commercial-report.ts` invoca el handler Edge real,
verifica el bearer ES256/kid con su pública y resuelve su identidad contra SQL.
Usa la admisión SQL durable y el adaptador service-only a través de PostgREST.
Clerk externo se sustituye por la fixture del bridge ya probada en #1708; no se
prueba un despliegue Edge alojado ni validación real de bytes Storage aquí.

El envío sin captura y su reintento devuelven el mismo recibo; un lote preparado
como ya validado por el servidor produce otro informe con evidencia. Inyectar
cuenta en el body falla y consume admisión; un formulario moderno comparte el
contador y el sexto intento diario se deniega. El reporte nuevo conserva RLS
propia y queda oculto a otra identidad. Tras tombstone, el mismo bearer falla
en la Edge y no permite leer el informe ni invocar la RPC cerrada.

La expectativa 200 de #1708 queda acreditada en nightly antes de esta nueva
migración. En #1710 se espera 403 por el cierre SQL explícito, con envío positivo
por Edge; no se debilita la prueba a un genérico «>=400».


## Contrato de petición Rust y Edge

`supabase/tests/fixtures/native-hub-report.json` es una petición UTF-8 pública y
sintética compartida. El test Windows de services compara la serialización real
de `Submission::new` con ese JSON; Deno lo pasa por el handler con/sin lote y el
arnés completo lo envía por Edge/PostgREST. Así se detectan diferencias de claves,
valores y caracteres entre Rust y la fixture que ejecuta la integración real.
Las etiquetas fijas mantienen `Revisión humana pendiente` con U+00F3; la Edge
rechaza la variante mal codificada. Prosa, diagnósticos y datos locales del tester
siguen excluidos del contrato. No se añaden campos ni tolerancias para hacer pasar
una fixture corrupta.


## Transporte HTTP del arnés y RPC sin retorno

La fixture define sal, identidad verificada y RPC loopback explícitamente; no
necesita variables ni credenciales de producción. `testing_report_submit_admitted`
retorna `void`, por lo que PostgREST devuelve 204 sin cuerpo, conforme a su
[contrato documentado](https://docs.postgrest.org/en/v10/releases/v10.0.0.html).
El helper de pruebas trata esa respuesta como `{data:null,error:null}` y sigue
leyendo JSON para las respuestas que lo contienen. Un error SQL no se convierte
en éxito. La Edge productiva usa el cliente Supabase, no este helper de pruebas.

Una regresión pasa la respuesta 204 por el transporte de la fixture y el handler
Edge: debe producir 200 del formulario simple. Otra conserva el recibo rico y
otra mantiene el error SQL 42501. El control local con el parser anterior
reproduce `void_write_became_503`; el arreglo no concede permisos ni cambia el
control RED de barreras. La CI real sigue siendo el gate final.
