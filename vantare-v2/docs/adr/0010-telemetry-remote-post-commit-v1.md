# ADR 0010: Telemetría remota V1 desde la frontera post-commit

## Estado

Aceptado para planificación en ISA-870. Esta ADR fija la arquitectura de la
V1; no declara implementados el contrato wire, el transporte ni el pairing.

## Fecha

2026-08-27

## Contexto

Vantare necesita mostrar en un Mac la telemetría LMU que ya procesa el runtime
Windows. La solución no puede abrir un segundo reader LMU ni repetir mapping,
identidad, reducción o derivaciones en el Mac: dos pipelines que pierdan frames
distintos producirían sesiones y estados diferentes.

ADR 0008 establece `TelemetryEngine.Apply` como única frontera de commit. Solo
después de que `Apply` devuelva un `EngineResult` válido existen un snapshot,
un cursor y unos facts aceptados de forma atómica. También exige que cualquier
consumidor posterior quede aislado de los fallos del Core.

El Mac será un companion futuro y no otra instalación autoritativa de Vantare.
El contrato de producto sigue sin sincronizar cuenta, ajustes, estrategias ni
datos persistidos entre equipos. Este corte es un stream efímero y opt-in, en
memoria, de una sesión live dentro de la LAN; no es sincronización persistida
ni exportación.

## Decisión

### Frontera y ownership

Windows conserva la única autoridad LMU:

```text
LMU Shared Memory + REST local
             |
             v
driver -> mapping -> TelemetryEngine.Apply -> commit aceptado
                                      |
                 +--------------------+--------------------+
                 |                                         |
                 v                                         v
        consumidores locales                    publicador remoto opt-in
                                                           |
                                                  cola cap 1, latest-wins
                                                           |
                                                    TLS 1.3 en LAN
                                                           |
                                                           v
                                              cliente Mac -> UI V1
```

El publicador remoto será un consumidor in-process de `TelemetryCoreRuntime`,
posterior al commit y aislado. Justo después de recibir un `EngineResult`
aceptado, el sink solo puede ejecutar un `try-offer` O(1), no bloqueante y sin
error, sobre una cola de capacidad uno. Proyección remota, copias costosas,
encoding, autenticación y red viven exclusivamente en el worker remoto. Un
drop incrementa una métrica remota y nunca devuelve error a `WriteBatch`.

Este orden es obligatorio porque el mapper actual conserva su lock mientras
`WriteBatch` termina. La función remota no puede activarse cuando el rollback
legacy `TelemetryEngineApply=false` está seleccionado: sin `EngineResult` no
existe la frontera post-commit aprobada.

El publicador no recibe drivers, batches sin aceptar ni estado mutable. El Mac
no ejecuta `BatchMapper`, reducer, `SessionCoordinator`, `derive.Pipeline` ni
adquisición LMU.

### Contrato de datos V1

La siguiente issue definirá `RemoteCanonicalUpdateV1` como una proyección wire
versionada construida en Windows. Cada mensaje será un snapshot completo de
ese contrato y procederá de un `FinalState` ya aceptado. "Completo" significa
que no depende de mensajes anteriores; no autoriza serializar `FinalState`
directamente ni saltarse una allowlist explícita. El Mac solo valida, decodifica
y renderiza esa proyección; no consume el snapshot canónico interno.

La V1 contiene solo snapshots latest-wins. Quedan fuera:

- facts y cualquier promesa de entrega ordenada;
- grabación, replay e histórico;
- raw Shared Memory o REST;
- varios clientes simultáneos;
- autodiscovery;
- acceso por Internet.

Un cliente lento nunca introduce backpressure en `TelemetryEngine.Apply`. La
cola tiene capacidad uno y reemplaza el snapshot pendiente por el más nuevo.
La pérdida de snapshots es normal; cada actualización debe ser autosuficiente.

### Lifecycle y aislamiento

- La función nace desactivada y es opt-in.
- Desactivada no crea listener, cola, goroutine, credencial ni cambio
  observable en la telemetría local.
- Activarla no modifica el servidor loopback existente ni lo abre a la LAN.
- Un fallo al proyectar, codificar, autenticar, escuchar o enviar degrada solo
  la función remota. El Core y sus consumidores locales continúan.
- `Stop` cancela y cierra los recursos remotos de forma acotada; nunca espera a
  que un cliente lento consuma el último snapshot.
- Pérdida de red o reinicio exige reconexión y un nuevo snapshot completo; no
  existe recuperación por facts ni replay en V1.

### Seguridad y privacidad

La V1 productiva exige:

- TLS 1.3 sin fallback a texto plano;
- autenticación del collector mediante pinning;
- pairing manual de un solo uso, con caducidad y revocación;
- una sola credencial de cliente activa;
- Windows Credential Manager y macOS Keychain para secretos persistentes;
- versión de protocolo explícita, límites de payload y rechazo cerrado;
- cero payloads, secretos o códigos de pairing en logs.

No se diseña criptografía propia. La forma exacta del credential de cliente y
el framing se cierran en issues posteriores contra el threat model. El soporte
real de macOS Keychain es condición previa para pairing productivo; no existe
fallback a fichero ni memoria persistente sin proteger.

El stream requiere una acción explícita del usuario y queda limitado a su LAN.
No persiste telemetría en el Mac como parte de esta V1 y no toca grabaciones o
históricos locales de Windows.

## Consecuencias

### Positivas

- Cada snapshot mostrado en Mac procede íntegramente de un estado aceptado en
  Windows; los drops no crean un segundo cálculo ni una autoridad remota.
- La telemetría local conserva su latencia, ownership y disponibilidad.
- Latest-wins evita colas crecientes y simplifica reconnect.
- El corte puede retirarse apagando una única función opt-in.

### Costes y riesgos

- El Mac depende del PC Windows y de la LAN durante la sesión.
- Los snapshots perdidos no se reconstruyen; la UI debe mostrar stale o
  disconnected hasta recibir otro full.
- Pairing seguro requiere implementar primero macOS Keychain.
- El contrato remoto necesita budget de tamaño y compatibilidad antes de elegir
  framing o cadencia productivos.

## Alternativas descartadas

- **Webhook:** modela eventos discretos y reintentos, no un stream live de alta
  frecuencia con estado latest-wins.
- **Pipeline pre-mapper en el Mac:** crea una segunda autoridad de identidad,
  sesión y derivaciones.
- **Abrir el servidor loopback a la LAN:** mezcla una frontera local existente
  con autenticación y exposición remotas.
- **Facts junto a snapshots:** latest-wins no conserva orden ni garantiza
  entrega; requiere un canal y resync propios.
- **Collector separado o microservicio:** añade lifecycle, IPC y packaging sin
  aportar valor a una V1 con un solo proceso y un solo cliente.
- **WebSocket, QUIC o protocolo binario como requisito inicial:** se posponen
  hasta que un benchmark demuestre que HTTP streaming y la librería estándar
  no bastan.

## Rollback

Desactivar la función remota devuelve el runtime al comportamiento actual: sin
listener LAN, cola, goroutine o credencial remota activa. No se modifica ni se
retira ningún consumidor local para habilitar esta V1.

## Siguiente corte

Definir y probar `RemoteCanonicalUpdateV1`: allowlist, versión, epoch/revisión,
reinicios, primer full obligatorio, límites, encoder/decoder y goldens
post-commit. El cliente calculará liveness con un reloj monotónico local. Este
corte continúa sin listener LAN productivo.

## Referencias

- ADR 0004: arquitectura modular de Telemetry Core.
- ADR 0008: frontera única de commit y aislamiento de consumidores.
- `docs/telemetry-core/remote-telemetry-threat-model.md`.
- GitHub issue ISA-870.
