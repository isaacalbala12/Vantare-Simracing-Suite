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

- Billing: BIL-01..BIL-07 compuestos y validados localmente en ISA-203 para
  promoción técnica; venta pública continúa **NO-GO**.
- Account/Profile: issue histórica ISA-12; proyecto pendiente.
- Calendar/Settings/Installer/Roadmap/Migración: proyecto o reconciliación
  pendientes.
- Root migration: auditoría ISA-14, bloqueada por worktrees activos.
- `nightly` y `testers` existen; el flujo vigente es issue → `nightly` →
  `testers` → `master`.
- Base ISA-203: `nightly@523840972673c2567cef75240ebe5a768f7742fc`.
- Promoción nueva: BIL-01..BIL-07 preparados para PR/CI; BIL-08 no está
  incluido.

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

Estado local BIL-01..BIL-07:

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
  environment y limitado por allowlist a tres Functions.

No existe autorización para desplegar migraciones, mutar Polar/Supabase, cobrar,
reembolsar o habilitar venta. BIL-08 y los gates monetarios siguen pendientes.

## Riesgos

- **P0 potencial:** Billing concede/revoca acceso incorrectamente.
- **P0 potencial:** migrar raíz con worktrees activos pierde/duplica trabajo.
- **P1:** el hardening local aún no ha sido validado mediante despliegue y matriz
  monetaria en entornos controlados.
- **P1:** Discord publica commits no relacionados desde `develop`.
- **P1:** ramas, updater y licencias de canal describen modelos distintos.

## Issues y siguiente acción

1. ISA-203 / BIL-N01: abrir PR y promover BIL-01..07 a `nightly` únicamente si
   CI queda verde.
2. Retomar BIL-08 desde su worktree aislado sobre la nueva base validada.
3. Continuar gates monetarios y despliegue controlado sin venta pública.
4. Crear proyectos Account, Calendar, Settings e Installer con handoffs propios.
5. Reauditar ISA-14 cuando se cierren worktrees grandes.

Cada issue fija base limpia, archivos, checks y rollback antes de editar. Los
cambios monetarios reales y Master requieren Isaac.

## Última actualización

2026-08-02, ISA-203 compone y valida BIL-01..07 sobre `nightly` sin BIL-08 ni
mutaciones remotas. Conserva el runtime moderno de Telemetry/Engineer, adopta
el flujo OAuth endurecido de Billing y queda preparado para PR/CI.
