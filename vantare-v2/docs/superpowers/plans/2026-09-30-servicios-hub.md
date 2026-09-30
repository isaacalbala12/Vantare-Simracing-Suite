# Microplan — servicios del Hub nativo (ISA-1430)

Referencia: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430.
Worker Codex, revisión de Claude Opus 5.5. Autorización de Isaac en el encargo
del 2026-09-30: servicios desbloqueados, excepción explícita a Notion no
disponible; solo commits locales, sin push, PR, merge ni subagentes.
Base recibida: `e8b0927a3e8f63b8e89d2043b18c57ac1753c0fd`, rama
`vantareapp/isa-1430-w-servicios`. Nightly obtenido y sus instrucciones leídas;
se conserva la base de integración de fase 5 asignada por el orquestador.

## Inventario del producto (sin leer configuración privada)

- `frontend/src/lib/supabase-auth.ts`, `hub/auth/LoginScreen.tsx`: login por
  correo/contraseña de Supabase, registro, recuperación y OAuth Google/Discord
  con callback externo. Sesión solo en memoria en la WebView; backend valida
  `/auth/v1/user` antes de admitirla. Renovación con refresh token; logout borra
  primero la copia protegida. Este corte porta login por contraseña, restauración,
  renovación y logout; OAuth/registro/recuperación quedan fuera de este corte.
- `internal/authsession/{manager,store}.go` y `internal/protectedstore/`:
  Credential Manager de Windows (`CredWriteW`, persistencia usuario local),
  protegido por el SO. No es un JSON de tokens ni DPAPI directo. El nativo usa
  DPAPI de usuario (`CryptProtectData`, sin LOCAL_MACHINE) y un fichero cifrado
  separado por URL de proyecto/canal; no importa ni altera la sesión Go.
- `internal/license/{credential,supabase_client,service,cache,clock_store}.go`:
  POST `/functions/v1/license-credential`, cuerpo `deviceFingerprint`;
  `Authorization: Bearer <sesión>` y `apikey` pública. Envelope v1, algoritmo
  `Ed25519`, issuer `vantare-license`, `key_id` conocido, firma base64url sin
  padding del JSON compacto ordenado version/algorithm/key_id/claims.
  Claims: issuer/subject/device_fingerprint/issued_at/capabilities; grants
  ordenados únicos, fechas `paid_through`, `perpetual` y `scope_version` omitidos
  si vacíos. Claves públicas `kid:base64url` separadas por coma. Clock protegido
  impide rollback de reloj o envelope (tolerancia 5 minutos). Las capacidades
  online sin deadline nunca se persisten como autoridad offline.
- `internal/license/fingerprint*.go`: SHA-256 hexadecimal de MachineGuid
  (HKLM, SOFTWARE\\Microsoft\\Cryptography); si falla, home + `|windows`.
  Reset: POST `/rest/v1/rpc/reset_active_device`, `device_fingerprint`, seguido
  de nueva credencial. No inventar dispositivo si Windows no lo puede identificar.
- `internal/roadmap/service.go`, `hub/roadmap-orbit/roadmap-contract.ts` y
  migración `20260924000000_visual_roadmap.sql`: RPC POST
  `/rest/v1/rpc/visual_roadmap_current`, `{}`, autenticación anon. Devuelve cero
  o una publicación, documento schemaVersion 1, máximo 40 items UUID únicos,
  now/next/done, es/en/pt/it, títulos 120 caracteres, cuerpos 600, 40 KB.
  Solo lectura; ninguna publicación/editor local ni contenido sintético.
- `internal/app/testing_center_report_bridge.go`: solo guardado/recuperación
  del borrador, no envío. `hub/testing-center/report-submission-client.ts`:
  RPC `testing_center_submit_report`, `p_contract_version=testing-center.v1`,
  canal nightly/testers, cuatro textos, versiones app/SO, módulo, flags
  diagnostic/logs, payload/digest opcionales, idempotency key `draft_<64 hex>`.
  Resultado único reportId/reportState=submitted/idempotent/createdAt.
  Campos obligatorios 3..2048 bytes y contexto <=4096 bytes. Roles y membership
  los comprueba el servidor; el cliente no puede autoasignarse permisos.
- `hub/settings-orbit`: muestra identidad, plan, renovación/reset/logout;
  `hub/testing-center-orbit`: consentimiento separado, no persistido; mantiene
  borrador y clave al fallar, no reenvía automáticamente. No existe todavía
  `native/hub/src/testing/` en esta base. Este corte crea un borrador de texto
  compatible, sin recopilar ni adjuntar logs/diagnóstico automáticamente.

## Diseño y límites de propiedad

`native/services/`: cliente HTTP y lógica sin GPUI, ningún acceso a simuladores.
El Hub posee sesión, contraseña transitoria, llamadas remotas y reloj protegido;
las llamadas se ejecutan fuera del hilo UI, con plazo, sin redirects ni logs de
payload/credenciales. Al entrar en carrera se cierra el Hub, no nace red en core
ni overlays. Esos procesos deben recibir el envelope firmado por la frontera
IPC/launcher y comprobar firma, sujeto, dispositivo y vigencia con el mismo
verificador puro; nunca aceptarán una lista mutable de entitlements del Hub.
Modificar esa frontera/núcleo está fuera de las rutas de este worker: no se
declara enforcement de derechos en overlays completado.

Sin variables públicas: «servicio no configurado», Hub usable. Sin red: solo
sesión ya protegida + envelope verificado + reloj protegido habilitan offline;
rechazo HTTP/auth, firma inválida, rollback y logout eliminan autoridad actual.
Datos corruptos fallan cerrados. Errores tipados y sanitizados; no mostrar
texto arbitrario del servidor. Consentimiento de reporte en memoria, explícito,
se consume en cada intento; diagnóstico/logs excluidos de este primer envío.

Variables EXACTAS de compilación mediante `option_env!` (no runtime):
`VANTARE_SUPABASE_URL`, `VANTARE_SUPABASE_ANON_KEY`,
`VANTARE_LICENSE_PUBLIC_KEYS`. Son los nombres backend ya reenviados en
`.github/workflows/release.yml:219-223` y resueltos en `cmd/vantare/main.go:1967-1984`.
El frontend usa VITE_SUPABASE_URL/ANON_KEY; no añadir aliases nativos.
No proporcionar SUPABASE_ACCESS_TOKEN, service_role ni claves privadas.

Dependencias mínimas justificadas: `ureq` con TLS (Rust std no trae HTTP/TLS;
alternativa WinHTTP añade una frontera unsafe extensa), `ed25519-dalek`
(alternativa firma propia insegura/BCrypt sin Ed25519 portable), `sha2` y
`base64` (ya transitivas, protocolo hash/codificación), `zeroize` (ya transitiva,
limpieza de buffers), `chrono`/`serde`/`serde_json` ya existentes; `windows-sys`
ya transitiva para DPAPI/registro/reemplazo atómico Win32. Sin async runtime.
Riesgo: nuevas dependencias directas HTTP/Ed25519, lock revisable; no reducir TLS.

Bloqueo de integración por rutas: `native/Cargo.toml`, `native/Cargo.lock` y
`native/hub/Cargo.toml` no están autorizados. Se entrega crate autocontenido y
parche de conexión para que Opus lo aplique en su integración. Se valida el
crate por separado y, si es viable, el Hub conectado en una copia aislada.
No se toca el checkout/caché de otros workers ni el producto Go.

## Cortes y gates

1. Commit de este inventario antes de implementación.
2. Cliente/cuenta/DPAPI, licencia/firma/clock, roadmap y reporte con tests de
   servidor HTTP local y claves generadas únicamente en tests; commit lógico.
3. Vistas Orbit, tarea de fondo, borrador/consentimiento; parche de wiring,
   verificación y handoff en `native/services/README.md`; commit lógico.

Antes de cada commit en native: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings`,
`cargo test --workspace -j 2`; repetir para el crate services independiente.
Registrar fallos heredados sin corregir rutas ajenas. Nunca más de dos jobs.
Verificación física posterior: build con las tres variables públicas, login de
cuenta de prueba, reinicio/restauración, renovar, desconectar red/expiry/rollback,
reset confirmado, logout offline y reinicio, roadmap real, preview/consentimiento
de reporte en proyecto de prueba y comprobación del ID/idempotencia. El worker
no usa credenciales reales ni llama servicios productivos en esta tarea.
