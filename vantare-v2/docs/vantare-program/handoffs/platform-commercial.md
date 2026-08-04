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
- ISA-231 / TAU-06F añade loader `service_role`, tamaño de transporte,
  snapshot head+ancestros, reserva única, claim global, lease, fencing y pausa
  pre-dispatch. Ambigüedad y caída post-permiso no reintentan automáticamente.
- ISA-232 / TAU-06G reaudita sin editar los módulos revisados: P0=0, P1=0,
  P2=0; 0/96 falsos `eligible`, 0/35 falsos `needs_owner`, cero retención y
  cero rutas sensibles aceptadas. Veredicto: GO condicionado para planear
  TAU-07 por microcortes.
- ISA-234 / TAU-07A prepara envelope HMAC, prompt/schema y workflow reusable
  inerte con acciones/CLI pinneadas. No tiene caller, secreto ni permisos write.
- ISA-237 / TAU-07B/C confirma que ChatGPT Pro puede ejecutar la prueba sin
  Platform API y que una ref exacta se verifica por SHA. La continuidad de una
  rama integrada es NO-GO: la PR no conservó de forma fiable el head/base
  esperado. Toda corrección usa sub-issue y rama nueva desde `nightly` actual.
- ISA-238 / TAU-07D fija Supabase como autoridad y Linear como único tracker
  externo. GitHub queda para código/PR/CI; el efecto `github_issue_create`
  permanece inerte hasta su supersesión aditiva, sin dual-write. Contratos
  locales: proyección Linear, rechazo y dossier determinista para Codex. El
  corte está apilado sobre `ISA-234@0e45228626adc59a5a90b72d1369bb110b1c4e8c`;
  Deno focal 47/47, type-check/formato, frontend build y Go global pasan. Sin
  schema, red, secretos, UI, servicios reales, merge o promoción. Review
  adversarial final: ACCEPT, P0/P1/P2/P3=0.
- El diseño aprobado el 2026-08-03 sustituye la activación automática posterior
  por `Vantare -> Supabase -> Linear -> delegación humana a Codex Cloud -> PR
  revisada`. Un rechazo bloquea, genera expediente determinista y exige decisión
  de Isaac antes de cualquier nueva delegación.
- La delegación con escritura selecciona y verifica rama/SHA fuera del prompt.
  La mención Linear `@Codex` no autoriza código cuando parte de `master`; puede
  utilizarse para análisis hasta validar un handoff exacto a Nightly o rama de
  issue.
- ISA-239 materializa TAU-07E localmente: destino único durable, supersesión
  reversible del outbox GitHub y proyección Linear exclusivamente en dry-run.
  Deno 92/92 pasa; PostgreSQL 43/43, rollback exacto, reaplicación 43/43 y
  carrera de dos workers pasan. Merge y promoción siguen bajo gate humano.
  Autoridad operativa:
  `docs/runbooks/testing-center-linear-outbox.md`. Autoridad de diseño:
  `docs/superpowers/specs/2026-08-03-testing-center-rejection-linear-codex-design.md`
  y plan
  `docs/superpowers/plans/2026-08-03-testing-center-linear-codex-execution-plan.md`
  actualizado. Red real, API Codex, repo write no sintético, App real,
  Discord y asignación automática siguen apagados hasta gates separados. La
  integración PostHog preparada no se da por válida: errores, replay, masking,
  consentimiento y retención pasan un microcorte de privacidad antes de la UI.
- ISA-240 materializa TAU-07F localmente sobre ISA-239. La firma Linear cubre
  los bytes exactos, delivery y timestamps se validan, y solo IDs/acción/digest
  entran a un ledger privado. El mapping de estados usa UUIDs revisados; replay,
  digest conflictivo, estado desconocido y orden invertido fallan cerrados.
  La reconciliación es observacional y no toca issue canónica, outbox, Codex,
  Git o canales. Deno Testing Center 98/98 y PostgreSQL 27/27 + rollback/reapply
  + carrera de dos procesos pasan. Autoridad:
  `docs/runbooks/testing-center-linear-webhook.md`. Endpoint, secreto, red y
  deploy permanecen expresamente pendientes de TAU-07I y gate de Isaac.
- ISA-241 materializa TAU-07G localmente sobre ISA-240. Los votos quedan
  ligados a issue/candidata/canal/versión/SHA y a roles server-side;
  `cannot_verify` no cambia el gate y un rechazo Testers posterior bloquea la
  candidata exacta. Dossier y transporte se verifican por SHA-256 en
  TypeScript y PostgreSQL. Solo Isaac registra una de cinco disposiciones;
  `same_branch` está retirado y una corrección sigue `needs_owner`, sin
  delegación automática. Deno Testing Center 99/99 y PostgreSQL 45/45 +
  rollback/reapply + history guard + carrera exactly-once pasan. Autoridad:
  `docs/runbooks/testing-center-candidate-feedback.md`. UI, PostHog, Discord,
  red, Linear real, Codex, deploy, merge y promociones permanecen pendientes.
- ISA-253 materializa la frontera local TAU-07H1 sobre ISA-241. La proyección
  PostHog sólo admite contexto técnico allowlisted y excluye mensajes, stacks,
  logs, perfiles y texto libre. Consentimiento y replay son separados;
  revocación y TTL 7/30 días se aplican en Supabase privado. Deno Testing
  Center 107/107 (focal 8/8) y PostgreSQL 33/33 + rollback/reapply + history
  guard pasan. No existe SDK,
  red, secreto, endpoint, captura/replay real, UI ni efecto sobre Linear,
  Discord, Codex o canales. Autoridad:
  `docs/runbooks/testing-center-posthog-privacy.md`.
- ISA-242 materializa TAU-07H2 sobre `ISA-253@aaff314411288927d97d52c05eb93b6c7d5b8729`.
  La pestaña existente incorpora validación de candidatas y rechazo estructurado
  sin exponer Linear ni acciones owner. Una Edge Function deriva identidad, rol,
  canal y candidata server-side, sanea el contexto y usa el RPC service-role de
  TAU-07G. Deno Testing Center 116/116 (Edge 9/9), frontend focal 32/32,
  lint, build y visual 4/4 pasan.
  Función, secretos y red siguen sin desplegar; PostHog/replay, Linear, Discord,
  Codex, merge y promociones permanecen apagados.
- ISA-243 / TAU-07I tiene autorización limitada al proyecto Supabase de testing
  `lbaxvpzexoferfvfkplz`. Linear ya contiene el proyecto
  `Testing Center — Feedback` y labels agrupadas para origen, canal, módulo y
  flujo; los UUID están fijados en el runbook. El runtime se ajusta a los
  nombres reales `My Live` / `Backlog`. El baseline remoto y las tres Edge
  Functions del piloto están activos solo en testing; probes sin credenciales
  fallan cerrados. Históricamente, el primer reporte Nightly quedó reservado
  bajo pausa y la primera llamada al worker falló antes de claim/`issueCreate`
  porque hosted no exponía `public.gen_random_uuid()`; el wrapper correctivo se
  desplegó y el claim remoto pasó con rollback. En aquel punto todavía no
  existían binding ni issue Linear. El reintento único autorizado devolvió
  `linear_response_ambiguous`; Supabase quedó `needs_owner`, intento/fencing 1,
  sin lease ni binding y con pausa activa. La reconciliación read-only encontró
  cero issues en Linear y el contrato prohibió una tercera llamada sobre ese
  efecto. El cierre actual del piloto se documenta en ISA-287/289 a continuación.
- ISA-287 / TAU-07J añade diagnóstico sanitizado para la respuesta ambigua del
  piloto. El contrato cerrado publica solo versión, fase
  segura, HTTP status acotado y códigos GraphQL `RATELIMITED`/`UNKNOWN`; la
  frontera HTTP lo canonicaliza en runtime para impedir campos añadidos. No
  cambia claim, fencing, binding ni retries: después de `issueCreate` siempre
  termina en `needs_owner`. Evidencia: focal 16/16, Testing Center 125/125,
  deploy guard 4/4, typecheck, formato y diff PASS. Tras revisión humana, solo
  el worker se desplegó en Supabase testing y quedó `ACTIVE` v7; un probe sin
  credenciales devolvió `401 unauthorized`. El round-trip autorizado creó
  exactamente ISA-288, completó un binding sin lease residual y recibió un
  webhook firmado `create/applied`. Un segundo reporte idéntico quedó
  `duplicate_linked`: dos ocurrencias, un efecto y una issue Linear. La pausa
  global está activa, el efecto histórico `needs_owner` quedó congelado por
  flujo y el bearer temporal fue revocado. Codex, Discord, merge y promociones
  continúan fuera de alcance.

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

2026-08-04, ISA-243/287 completaron el piloto remoto con un caso sintético
nuevo. ISA-288 se creó exactamente una vez, el binding quedó `completed` sin
lease residual y el primer webhook firmado fue `create/applied`. Un segundo
reporte idéntico quedó `duplicate_linked`: dos ocurrencias, un efecto y una
issue Linear. El efecto ambiguo histórico continúa `needs_owner` y congelado
por flujo; la pausa global está activa y el bearer fue revocado. ISA-289 limita
el tooling al project ref de testing, añade preflight de vínculo y separa fallos
OAuth temporales de configuración permanente. No hay Codex, Discord,
promoción ni producción.
Billing conserva BIL-08/BIL-10 en `nightly`, ISA-118 permanece como deuda
global heredada y la venta pública continúa NO-GO.
