# Handoff vivo — plataforma, cuenta, releases y migración

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md` y
  `execution-policy.md`.
- Billing: proyecto Linear, `docs/licensing-auth-architecture.md` y auditoría
  Polar/Supabase vigente.
- Roadmap/Discord: `docs/discord-communications.md` y workflows actuales.
- Root: informe ISA-14 y su matriz de worktrees/rutas.
- La issue activa y su plan prevalecen sobre releases históricas.

## Estado

- Billing: BIL-01..BIL-07 ya estaban en `nightly`; este corte BIL-N02 incorpora
  BIL-08 tras validación acumulativa. Venta pública continúa **NO-GO**.
- Account/Profile: issue histórica ISA-12; proyecto pendiente.
- Calendar/Settings/Installer/Roadmap/Migración: proyecto o reconciliación
  pendientes.
- Root migration: auditoría ISA-14, bloqueada por worktrees activos.
- `nightly` y `testers` existen; el flujo vigente es issue → `nightly` →
  `testers` → `master`.
- Base ISA-212: `nightly@b8ffd7c6c824f17ebcc09a5e44bf4ac12bafb7c5`.
- Promoción vigente: ISA-212/BIL-N02 hacia `nightly`; `testers` y `master`
  quedan fuera.

## Cuenta

Perfil local, avatar procesado, Google OAuth/email magic link, modo gratuito sin
login, borrado local/remoto separado, un dispositivo activo, sesión offline
hasta expiración y secretos en almacenamiento protegido. SR/DR requiere
auditoría clean-room de DoX/SimHub y fuente LMU+Steam.

## Calendario

Feed oficial versionado/firmado. Isaac pega RaceControl semanal y un agente lo
estructura con validación. UTC interno; zona local visible. Carreras guardadas,
recordatorios, Launcher/Overlay/Strategy y nota. Servicio ligero solo con
recordatorios futuros y permiso.

## Ajustes

General, Apariencia, Idioma/región, Cuenta/licencia, Launcher, Overlays,
Telemetría, Engineer/audio/voz, Strategy, Calendario, Hotkeys, Privacidad,
Actualizaciones, Diagnóstico y Acerca de. Scope global/perfil explícito;
import/export sin secretos; reset no borra datos sin selección.

## Roadmap/Discord

Toda issue publicable incluye `Resumen público`. Flujo: Idea → Siguiente
actualización → En desarrollo → Testing → Por lanzar → Publicado. Progreso
ponderado, digest diario, tarjeta HTML y texto accesible. Releases, crisis y
anuncios comerciales requieren aprobación.

## Releases

Web/GitHub para instalador; app para updater. Stable para todos, Nightly para
Pro Plus y Testers para Pro Plus/Launch. Instalación atómica, rollback y
desinstalación granular. Sin firma inicial: checksums/manifests, aviso
SmartScreen y guía; nunca bypass. Master produce versión pública.

## Migración

`vantare-v2` será raíz del mismo repo cuando se cierren grandes worktrees.
Archivar primero, preservar historia/secrets, simular y probar rollback. Borrado
masivo requiere Isaac. La migración de ramas materializa issue → Nightly →
Testers → Master y actualiza CI/webhooks/updater.

## Billing

Autoridad y contrato:

- Polar posee productos, precios, customers comerciales, orders, subscriptions
  y refunds. Supabase mantiene identidad y almacenamiento operacional.
- Pro: 4,99 EUR/mes. Pro Plus: 9,99 EUR/mes. Launch Edition: 30 EUR una vez.
- Recuperación de pago: máximo 72 horas sin extender `paidThrough`; después se
  degrada a gratuito. La credencial offline de suscripción vence en la fecha
  firmada; Launch conserva su alcance perpetuo.
- Un refund total atribuible revoca únicamente su grant; refunds parciales,
  pendientes, fallidos o ambiguos no revocan acceso automáticamente.

Estado BIL-01..BIL-08:

- Inbox durable antes de efectos, efectos idempotentes, quarantine/replay y
  límites de request.
- Mapping por entorno, checkout-attempt server-only, portal allowlisted y
  separación estricta sandbox/production.
- Intento OAuth ligado a provider/state, sesión exclusiva en Credential Manager,
  rotación protegida y logout request/ack fail-closed.
- Grants independientes, reconciliación monotónica de Customer State y ledger
  atribuible de orders/refunds.
- Runbooks y evidencia: `docs/billing/`, `docs/analysis/isa-69-*`,
  `docs/analysis/isa-70-*`, `docs/analysis/isa-71-*`, `docs/analysis/isa-72-*`
  y `docs/analysis/isa-88-*`.
- Gates locales: PostgreSQL desechable completo (clean, legacy upgrade,
  concurrency y restore), Deno 164/164, frontend focal 87/87, frontend global
  311 archivos/2.128 tests, build, lint focal, Go global, x20 y race detector
  focal. El workflow productivo es exclusivamente manual, protegido por
  environment.
- BIL-08 añade una credencial offline Ed25519 ligada a UUID y dispositivo. Pro
  y canales temporales vencen por `paidThrough`; Launch v1 conserva únicamente
  su scope adquirido y Testers. Legacy, edición, copia, clock rollback y
  rechazos online fallan cerrados.
- El emisor `license-credential` entra en la allowlist protegida; la clave
  privada existe solo como secreto server-side y el build incorpora únicamente
  claves públicas versionadas. No se ha configurado ni desplegado nada remoto.
- Evidencia BIL-08 sobre la composición final: frontend 311/311 archivos y
  2.128/2.128 tests, build y lint focal; Deno 173/173, formato, check y guard de
  deploy; Go focal x20, vet, race focal, Credential Manager real y fixture
  WebCrypto→Go PASS. La suite Go global deja visible únicamente la deuda
  heredada de Ajustes ISA-118, reproducida también en el `nightly` base; todos
  los paquetes BIL-08 pasan.

BIL-09 / ISA-74 añade un contrato transversal sin cambiar lógica productiva:
catálogo sandbox completo, matriz lifecycle versionada, Customer State,
beneficios, compras múltiples y refunds en orden inverso. Los desconocidos
fallan cerrados y la segunda ejecución converge. La evidencia y la tabla
evento/precondición/resultado viven en
`docs/billing/bil-09-lifecycle-matrix.md`.

BIL-10 / ISA-75 hace operable el runtime sin incorporar un proveedor nuevo:
señales sanitizadas del webhook, snapshot SQL agregado exclusivo de
`service_role`, alertas deduplicadas y runbook completo. IDs originales,
payloads, PII y errores libres quedan fuera. Replay, reparación, deploy y
producción siguen necesitando autorización. Autoridad:
`docs/billing/bil-10-observability-runbook.md`.

El inbox durable queda particionado por entorno. Las filas anteriores al corte
se conservan como `unclassified`, visibles para operación pero excluidas de las
métricas de sandbox y producción. Los gates frescos pasan con 181/181 tests
Deno y PostgreSQL clean/upgrade/restore, incluidas 20 pruebas de observabilidad
por ruta.

El despliegue futuro debe aplicar migración antes que Edge. Un overload
server-only mantiene la versión anterior sin perder eventos y los clasifica
como `unclassified`; se retirará solo cuando el runtime nuevo esté confirmado.

No existe autorización para desplegar migraciones, mutar Polar/Supabase, cobrar,
reembolsar o habilitar venta. Los gates monetarios siguen pendientes.

## Testing Center

- TAU-00/01 y TAU-02A/B/C permanecen en PR draft a `nightly`; TAU-02C cerró sus
  gates locales y remotos sin deploy ni merge.
- ISA-215 / TAU-03 añade el paquete local
  `testing-center.diagnostic.v1`: allowlist, redacción, límites, preview exacto,
  SHA-256 y descarte efímero. No tiene wiring productivo.
- TAU-04A/04B/04C conectan RPC idempotente, draft local privado y una pestaña
  in-app que exige coincidencia entre canal embebido de build y capability
  firmada. `master` y metadata desconocida fallan cerrados; el servidor vuelve
  a derivar membresía y rol.
- TAU-04C reutiliza el paquete de TAU-03, muestra sus bytes exactos, verifica
  SHA-256 en frontend y transporta el mismo payload. No serializa
  ajustes/perfiles ni crea otro collector general.
- Los logs continúan desactivados por defecto. Texto libre requiere opt-in y
  preview completo porque ninguna regex puede garantizar eliminar PII
  semántica arbitraria.
- No existe aún un buffer productivo de logs para este flujo. La UI declara
  cero disponibles y mantiene el control deshabilitado; no simula evidencia.
- ISA-222 / TAU-05A añade triage server-only, fingerprints exactos,
  ocurrencias y una reserva durable de creación. Cien repeticiones y dos
  transacciones concurrentes convergen en una issue técnica y un efecto
  reservado. No existe todavía llamada externa.
- ISA-223 / TAU-05B proyecta el issue y los comentarios con decoder cerrado,
  redacción, markers no confiables y adaptador dry-run que recalcula su digest.
  Replay se expresa solo como disponibilidad autenticada; logs, URL, assignee
  y Codex no entran en GitHub.
- ISA-224 / TAU-05C añade lease/claim, backoff, recheck de pausa, reconciliación
  ante respuesta ambigua y ledger de deliveries HMAC. GitHub no aporta un
  timestamp firmado: se usa delivery ID único y hora server-side, sin header
  inventado. La App mínima queda documentada pero no registrada ni activada.
- ISA-226 / TAU-06A añade una policy pura fail-closed. Solo dos superficies
  frontend, alcance pequeño, reproducción determinista y harness existente
  pueden ser elegibles; cualquier flag sensible, retry o rechazo exige owner.
  Texto y logs no son autoridad y quedan fuera de la decisión/digest.
- ISA-227 / TAU-06B fija instrucciones/objetivos, módulos/rutas, command IDs,
  budgets y salida JSON. Revalida policy y digest; el registro global in-memory
  es solo prueba, no un lock distribuido ni un agente real.
- ISA-228 / TAU-06C concluye NO-GO: policy/corpus estructurado pasan, pero
  faltan procedencia/redacción verificable, scope leaf-level, exclusión durable
  y SHA exacto. P0=0, P1=3, P2=1.
- ISA-229 / TAU-06D elimina texto/mensajes/códigos del sobre y liga una
  proyección mínima a IDs, bytes, SHA y consentimientos. El loader DB
  service-role permanece pendiente de TAU-06F.
- ISA-230 / TAU-06E aplica reglas leaf-level y liga el request a un SHA exacto;
  el resolver de ancestry server-side permanece pendiente de TAU-06F.
- Siguiente acción: TAU-06F añade loader/lease durable. TAU-07, red, API Codex,
  repo access, App real, Discord y asignación automática siguen apagados.

## Riesgos

- **P0 potencial:** Billing concede/revoca acceso incorrectamente.
- **P0 potencial:** migrar raíz con worktrees activos pierde/duplica trabajo.
- **P1:** el hardening local aún no ha sido validado mediante despliegue y matriz
  monetaria en entornos controlados.
- **P1:** Discord publica commits no relacionados desde `develop`.
- **P1:** ramas, updater y licencias de canal describen modelos distintos.

## Issues y siguiente acción

1. Revisar BIL-10 / ISA-75 y promoverlo exclusivamente a `nightly` cuando sus
   gates estén verdes.
2. Recoger feedback Nightly de BIL-01..10 sin habilitar venta.
4. Continuar gates monetarios y despliegue controlado sin venta pública.
5. Crear proyectos Account, Calendar, Settings e Installer con handoffs propios.
6. Reauditar ISA-14 cuando se cierren worktrees grandes.

Cada issue fija base limpia, archivos, checks y rollback antes de editar. Los
cambios monetarios reales y Master requieren Isaac.

## Última actualización

2026-08-02, ISA-230 cierra scope amplio y ref móvil en el contrato; el NO-GO
sigue vigente hasta loader/lease durable y reauditoría. No ejecuta Codex,
Discord, repo access o Supabase remoto.
Billing conserva BIL-08/BIL-10 en `nightly`, ISA-118 permanece como deuda
global heredada y la venta pública continúa NO-GO.
