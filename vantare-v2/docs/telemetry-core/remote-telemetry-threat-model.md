# Threat model — telemetría remota Windows → Mac V1

Estado: decisión arquitectónica de ISA-870; implementación pendiente.

## Alcance

Un runtime Vantare en Windows publica por la LAN snapshots completos de
`RemoteCanonicalUpdateV1` a un único cliente Vantare en macOS. La publicación
nace desactivada, solo consume resultados post-commit y nunca controla LMU ni
el runtime Windows.

Fuera de alcance: Internet, relay cloud, autodiscovery, varios clientes,
facts, recording, replay, históricos, cuenta, pagos y sincronización de ajustes
o estrategias.

## Activos protegidos

- Confidencialidad e integridad de la telemetría live permitida por el contrato
  remoto.
- Autenticidad del collector Windows y del único Mac autorizado.
- Secreto o credencial resultante del pairing.
- Disponibilidad y latencia del pipeline local de Telemetry Core.
- Estado de consentimiento: habilitado, cliente autorizado y revocación.

La telemetría raw, las grabaciones y los históricos no son activos del
transporte porque la V1 no debe leerlos ni enviarlos.

## Fronteras de confianza

1. Proceso Vantare Windows: autoridad del snapshot post-commit.
2. Publicador remoto: consumidor no confiable respecto a la disponibilidad del
   Core; puede fallar, pero no bloquearlo.
3. LAN: red no confiable, aunque sea doméstica.
4. Proceso Vantare Mac: consumidor remoto no autoritativo.
5. Windows Credential Manager y macOS Keychain: únicas persistencias permitidas
   para secretos.

## Supuestos

- Windows y macOS no están comprometidos a nivel administrador.
- El usuario controla ambos dispositivos y confirma el pairing en ambos.
- No se configura port forwarding, túnel público ni relay.
- TLS y generación aleatoria usan primitivas mantenidas por la plataforma o la
  librería estándar; no hay criptografía propia.

## Amenazas y controles obligatorios

| Amenaza | Impacto | Control mínimo V1 | Evidencia exigida antes de producción |
|---|---|---|---|
| Escucha o manipulación en LAN | Filtración o falsificación de telemetría | TLS 1.3 obligatorio; sin plaintext | Test que rechaza TLS inferior, certificado no fijado y bytes alterados |
| Cliente no autorizado | Lectura de la sesión | Pairing manual, una credencial activa y autenticación en cada conexión | Integración con cliente válido, ausente, revocado y segundo cliente |
| Replay del código de pairing | Alta de un atacante | Código aleatorio, de un solo uso, con TTL corto e invalidación atómica | Test de segundo uso, expiración y concurrencia |
| Adivinación o brute force del pairing | Alta de un atacante | Código CSPRNG con al menos 128 bits; TTL máximo de 5 minutos; máximo 5 fallos por código, 3 intentos/minuto por origen y 10/minuto globales; al agotar el presupuesto se invalida el código y se aplica cooldown global de 60 segundos; respuestas indistinguibles | Tests de entropía/formato, límites por origen y global, invalidación, cooldown y guessing concurrente atómico |
| Suplantación del collector | El Mac acepta telemetría falsa | Pinning explícito de la identidad del collector | Test con certificado distinto, renovado sin confirmar y endpoint cambiado |
| Credencial filtrada | Acceso remoto hasta revocación | Store protegido, rotación/revocación y no logging | Test de revocación inmediata y auditoría de logs/configuración |
| Downgrade de protocolo | Pérdida de garantías | TLS mínimo 1.3 y versión wire exacta/compatible, fallo cerrado | Matriz de versiones y TLS sin fallback |
| Payload malformado o excesivo | Crash, memoria o estado corrupto en Mac | Límite de frame, decoder estricto, validación antes de publicar en UI | Fuzz, límites y casos unknown/missing/NaN/Inf aplicables |
| Cliente lento | Backpressure o memoria creciente en Windows | Cola cap 1, reemplazo latest-wins, escritura cancelable y timeout acotado | Soak con cliente que no lee; cero bloqueo de `Apply` y memoria acotada |
| Pérdida de conectividad | UI engañosa o estado antiguo | Edad/revisión en snapshot; estados stale/disconnected; reconnect con full | Test de corte, reconexión y primer full autosuficiente |
| Flood de conexiones en LAN | Degradación del PC | Un cliente, límites de handshake/conexión y trabajo acotado antes de auth | Test de conexiones rechazadas y métricas sin afectar Core |
| Exposición accidental a Internet | Superficie remota no prevista | Selección explícita de interfaz LAN, sin UPnP/relay/port forwarding | Test/configuración que no habilita interfaces públicas automáticamente |
| Secretos o payload en logs | Filtración local | Logs solo con contadores, estados y razones sanitizadas | Búsqueda automática de códigos, credenciales y payloads en logs de prueba |
| Persistencia no autorizada en Mac | Copia de datos fuera del PC | V1 no graba snapshots; buffers solo en memoria | Test de teardown y auditoría de rutas de escritura |

## Pairing y revocación

El pairing productivo debe cumplir este flujo mínimo:

1. El usuario habilita telemetría remota en Windows y elige una interfaz LAN.
2. Windows muestra endpoint, fingerprint y un código de un solo uso con TTL.
3. El usuario introduce esos datos en el Mac y confirma el fingerprint.
4. El canal TLS fijado canjea una sola vez el código por una credencial de
   cliente. El código queda invalidado antes de responder con éxito. Código
   ausente, erróneo, expirado, usado o bloqueado recibe una respuesta externa
   indistinguible; los contadores se actualizan atómicamente.
5. Windows conserva como máximo un cliente autorizado. Autorizar otro exige
   revocar el anterior de forma visible.
6. El usuario puede deshabilitar la función o revocar el Mac sin borrar datos
   de Telemetry Core.

La issue que implemente seguridad elegirá una credencial estándar y demostrará
resistencia al replay apropiada. Esta entrega no decide mTLS frente a otro
mecanismo mantenido; sí prohíbe tokens en URL, secretos en texto plano y
protocolos criptográficos propios.

## Privacidad y minimización

- `RemoteCanonicalUpdateV1` usa allowlist cerrada. No serializa estructuras Go
  internas de forma directa.
- No incluye raw, facts, voz, rutas, grabaciones o históricos en V1.
- La activación y el pairing son acciones explícitas y revocables.
- Diagnóstico registra métricas sin payload: conexión, drops, revisiones,
  tamaños, errores clasificados y edad del último frame.
- La V1 no sincroniza datos persistidos entre equipos.

## Estados seguros

- **Desactivado:** no existen listener, cola, goroutine ni credencial activa.
- **Sin pairing:** no se publican snapshots y cualquier conexión falla cerrada.
- **Conectado:** solo el cliente autorizado recibe snapshots completos.
- **Stale/disconnected:** el Mac deja de presentar el último frame como live.
- **Revocado:** nuevas conexiones y reconexiones del cliente anterior fallan.
- **Error remoto:** se degrada la función remota; el Core local continúa.

## Gates para las entregas posteriores

No se habilita un listener LAN productivo hasta demostrar:

- soporte real de macOS Keychain en `protectedstore` o un adaptador equivalente
  aprobado;
- contrato wire allowlisted, versionado, acotado y con goldens;
- `try-offer` O(1) post-commit y todo el trabajo remoto detrás de la cola cap 1
  bajo soak, con el mapper actual sin retrasos atribuibles;
- TLS 1.3, pinning, pairing de un solo uso y revocación;
- decoder fuzzed y rechazo de downgrade/payload excesivo;
- rollback apagado idéntico al runtime local previo.
