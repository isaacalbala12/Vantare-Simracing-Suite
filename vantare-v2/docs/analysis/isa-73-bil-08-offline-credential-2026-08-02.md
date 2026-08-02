# ISA-73 / BIL-08 — credencial offline íntegra y vinculada a cuenta

Fecha: 2026-08-02
Estado: candidata aislada, sin despliegue ni promoción
Base exacta: `5141aa6523a6850ef2f73233268056fd171bbb8e`

## Objetivo

Sustituir la caché local editable de licencia por una credencial verificable que
solo pueda emitir el servidor. Debe conservar el acceso offline hasta el límite
comercial real, ligar la licencia a una cuenta y dispositivo concretos y fallar
cerrada ante edición, copia, rollback o formatos legacy.

## Contrato implementado

- Envelope v1 firmado con Ed25519 en Supabase Edge Function.
- La clave privada PKCS#8 solo existe en los secretos de la función.
- El cliente incorpora un registro versionado `key-id -> public key`; nunca
  contiene HMAC, clave privada ni secreto capaz de emitir credenciales.
- La identidad firmada es el UUID autenticado por Supabase, no un valor enviado
  por el cliente.
- El dispositivo firmado es el SHA-256 del fingerprint local y debe coincidir
  con el dispositivo activo server-side.
- Cada capability conserva su límite independiente:
  - Pro y canales temporales usan `paid_through`.
  - Launch v1 es perpetua solo para `scope_version=launch_v1`.
  - Launch puede conservar Testers de forma perpetua, pero no Nightly.
- El archivo local guarda exclusivamente el envelope firmado. Entitlements,
  estado y fechas se recalculan después de validar firma y política.
- La caché antigua editable se detecta por su forma y no concede acceso.
- Un high-watermark protegido en Windows Credential Manager detecta retroceso
  del reloj y la reutilización de credenciales emitidas antes de la más nueva
  observada.
- Una respuesta autenticada de rechazo del servidor no cae a una caché premium.
  Solo errores temporales o falta de red permiten validar la última credencial.
- Una respuesta online válida sin capabilities reemplaza la caché premium
  anterior y conserva la revocación local.
- La sesión solo se persiste cuando esta petición concreta fue validada online;
  una validación desde caché no se confunde con autenticación del backend.

## Flujo

1. El cliente obtiene el UUID esperado del JWT de la sesión y calcula el
   fingerprint.
2. `license-credential` autentica ese JWT, reclama o comprueba el dispositivo y
   lee únicamente grants server-side activos.
3. La función normaliza, ordena y firma claims mínimos sin email, nombre, rutas
   ni información comercial innecesaria.
4. El cliente valida versión, algoritmo, key-id, firma, issuer, cuenta,
   dispositivo, fechas, orden y semántica exacta de capabilities.
5. Solo después actualiza el reloj protegido y deriva el resultado de acceso.
6. La credencial verificada sustituye atómicamente la caché local anterior.

## Casos de fallo seguro

- JSON alterado, firma inválida, key-id desconocido o campos extra: sin acceso.
- Credencial copiada a otra cuenta o dispositivo: sin acceso.
- Pro o Nightly perpetuos, o Launch con expiración: sin acceso.
- Capabilities desconocidas, duplicadas o desordenadas: sin acceso.
- Reloj local anterior al high-watermark o lease más antigua: sin acceso.
- Estado protegido corrupto o inaccesible: sin acceso offline.
- Respuesta 4xx autoritativa de Supabase: no reutiliza acceso premium cacheado.
- Respuesta excesiva, JSON concatenado o trailing data: rechazada.

## Migración y rollback

La migración es deliberadamente fail-closed: el primer arranque que encuentra
la caché legacy no la transforma ni confía en ella. Tras un login online válido,
el servidor emite el nuevo envelope y la escritura atómica reemplaza el archivo.

El rollback de código puede restaurar la versión anterior desde Git, pero no
debe reactivar la caché editable como fuente de acceso. Si se revierte BIL-08,
Billing continúa NO-GO hasta definir un reemplazo equivalente. El procedimiento
operativo de claves y recuperación está en
`docs/billing/bil-08-offline-credential-runbook.md`.

## Evidencia ejecutada

- `go test ./internal/authsession/... ./internal/license/... ./internal/protectedstore/... -count=1`: PASS.
- Repetición x20 de `authsession`, `license`, `protectedstore` y `cmd/vantare`: PASS.
- Gate Windows Credential Manager Save/Load/Delete real: PASS.
- Deno `check` del emisor y sus tests: PASS.
- Deno emisor + guard de deploy/secretos de cliente: 11/11 PASS.
- Fixture de interoperabilidad Deno WebCrypto -> verificador Go: PASS.
- Auditoría de recuperación: `service_test.go` había quedado vacío tras el
  reinicio. Se reconstruyó con casos online/offline, confianza de sesión,
  expiración, revocación, legacy fail-closed, device reset y capabilities; la
  evidencia anterior no se reutilizó.
- `authsession` reutiliza el mismo `protectedstore` de BIL-08; no quedan dos
  implementaciones paralelas de Windows Credential Manager.
- `go vet` focal de license, protectedstore y aplicación: PASS.
- Frontend sobre la composición final: 311 archivos, 2128 tests PASS.
- Frontend production build: PASS.
- ESLint focal del contrato frontend: PASS; lint global conserva cuatro errores
  preexistentes fuera del diff en Calendar y el mock de topbar.
- `cmd/vantare`: PASS dentro de la suite global.
- Suite Deno completa sobre la composición final: 173 tests PASS.
- Suite Go global: todos los paquetes BIL-08 PASS; falla únicamente
  `internal/app.TestConcurrentSavesDontCorruptFile`, fuera del diff, por usar el
  mismo archivo `.tmp` en guardados concurrentes de Ajustes en Windows. El
  fallo se reprodujo también sobre el SHA base y está trazado en ISA-118.
- Race detector: `authsession`, `license`, `protectedstore` y las funciones
  BIL-08 del composition root PASS. La suite completa de `cmd/vantare` detecta
  una carrera heredada del spy Launcher, registrada en ISA-211; no afecta los
  paquetes ni rutas de Billing.

## Limitaciones y riesgos residuales

- Una licencia perpetua y completamente offline no puede revocarse en un equipo
  que nunca vuelve a conectarse. Esto también implica que reemplazar el
  dispositivo activo no puede invalidar criptográficamente una credencial
  Launch ya emitida y desconectada.
- Credential Manager protege el estado frente a edición casual y otros usuarios,
  pero el propietario administrador del equipo puede borrar su propio estado.
  No existe un reloj monotónico local imposible de resetear sin hardware o una
  comprobación online.
- Una clave de firma que haya emitido credenciales perpetuas no puede retirarse
  de clientes ya desconectados. La rotación normal mantiene claves públicas
  históricas; una posible filtración de la clave privada requiere incidente y
  nueva decisión comercial.
- No se han configurado secretos remotos, desplegado la función ni emitido una
  credencial de producción en este corte.
- La venta pública permanece **NO-GO** hasta completar los siguientes cortes y
  los smokes monetarios/operativos autorizados.

## Verificación manual futura

1. Instalar una build con el registro de claves públicas aprobado.
2. Iniciar sesión y validar Pro, Pro Plus y Launch por separado.
3. Desconectar la red, reiniciar y confirmar límites y canales exactos.
4. Editar una copia del envelope y confirmar downgrade seguro.
5. Probar copia entre cuentas y dos fingerprints.
6. Cambiar el dispositivo mediante el flujo de cuenta y comprobar el nuevo
   equipo online; documentar la limitación del equipo anterior offline.
7. Probar expiración, clock rollback y recuperación asistida del estado seguro.
